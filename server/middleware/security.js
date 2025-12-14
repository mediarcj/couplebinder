// File: server/middleware/security.js
// Description: Server-authoritative security middleware
// Purpose: Enforces all security restrictions server-side, treating browser as hostile
// Notes: Never trusts client-side validation, implements atomic operations and rate limiting

// Rate limiting and lockouts now use Redis for multi-instance safety
// NOTE: This is the SECONDARY layer - Cloudflare edge (PRIMARY) handles volumetric attacks first
const crypto = require('crypto');
const logger = require('../utils/logger');
const sanitizeHtml = require('sanitize-html');

/**
 * WHAT:
 * We implement comprehensive server-authoritative security that treats the browser as hostile.
 * All frontend restrictions are enforced server-side with additional security measures.
 *
 * WHY:
 * Attackers can bypass frontend validation, manipulate JavaScript, and make direct API calls.
 * We need server-side enforcement of all restrictions plus additional security layers.
 *
 * HOW:
 * We implement Redis-backed rate limiting, input sanitization, atomic operations, and strict validation.
 * All security decisions are made server-side with detailed logging for monitoring.
 */

// Import Redis-backed lockout helpers (replaces old Map-based implementation)
const {
  checkAccountLockout,
  recordFailedAttempt,
  clearFailedAttempts
} = require('./lockout');

/**
 * WHAT:
 * This Map tracks secure code attempts and verification state in memory.
 * It stores single-use codes generated for user actions (password changes,
 * email verification, etc.) along with their expiration times and usage status.
 * 
 * WHY:
 * It provides a simple way to prevent reuse of codes and to enforce limits
 * in a single Node.js process. Codes are bound to specific users and actions,
 * and the Map allows quick lookup and atomic marking of codes as used.
 * 
 * HOW / LIMITATION - SINGLE INSTANCE ONLY:
 * This Map is stored in process memory and is NOT safe for multi-instance or
 * horizontally scaled deployments. Each server instance would maintain its own
 * separate Map, which means:
 * - A code generated on instance A would not be recognized on instance B
 * - Code verification state is not shared across instances
 * - Race conditions could occur if the same code is verified on different instances
 * 
 * FUTURE MIGRATION PATH:
 * When scaling out to multiple instances, this must be migrated to Redis (or similar
 * shared storage) so that code verification state is shared across all instances.
 * This will ensure codes work consistently regardless of which instance handles
 * the request.
 * 
 * See docs/REDIS_MIGRATION_PLAN.md for the complete design and migration steps.
 */
const codeAttempts = new Map();

/**
 * Server-side email validation matching frontend rules
 * @param {string} email - Email to validate
 * @returns {object} Validation result with sanitized email
 */
function validateEmailServerSide(email) {
    if (!email || typeof email !== 'string') {
        return { valid: false, error: 'Email is required', sanitized: '' };
    }

    // Sanitize: trim whitespace and convert to lowercase
    const sanitized = email.trim().toLowerCase();
    
    // Check length limits (frontend: maxlength="40")
    if (sanitized.length === 0) {
        return { valid: false, error: 'Email cannot be empty', sanitized: '' };
    }
    
    if (sanitized.length > 40) {
        return { valid: false, error: 'Email cannot exceed 40 characters', sanitized: '' };
    }

    // Check format (matching frontend regex)
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(sanitized)) {
        return { valid: false, error: 'Invalid email format', sanitized: '' };
    }

    return { valid: true, error: null, sanitized };
}

/**
 * Server-side password validation matching frontend rules
 * 
 * WHAT:
 * Enforces strict password requirements: minimum 8 characters, at least 1 capital letter,
 * at least 1 number, no spaces, and no special characters (only letters and numbers).
 * 
 * WHY:
 * Backend is the source of truth. Client-side validation can be bypassed, so we must
 * enforce all rules server-side before writing to database.
 * 
 * HOW:
 * Validates length, character composition, and format requirements. Returns clear
 * error messages for each validation failure.
 * 
 * @param {string} password - Password to validate
 * @returns {object} Validation result with valid flag and error message
 */
function validatePasswordServerSide(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' };
    }

    // Check length limits
    if (password.length === 0) {
        return { valid: false, error: 'Password cannot be empty' };
    }

    // Minimum length requirement
    if (password.length < 8) {
        return { valid: false, error: 'Password must be at least 8 characters' };
    }
    
    // Maximum length requirement
    if (password.length > 50) {
        return { valid: false, error: 'Password must be 50 characters or less' };
    }

    // Check for spaces (not allowed)
    if (/\s/.test(password)) {
        return { valid: false, error: 'Password cannot contain spaces' };
    }

    // Check for special characters (only letters and numbers allowed)
    const validPasswordRegex = /^[a-zA-Z0-9]+$/;
    if (!validPasswordRegex.test(password)) {
        return { valid: false, error: 'Password can only contain uppercase letters, lowercase letters, and numbers' };
    }

    // Check for at least one capital letter
    if (!/[A-Z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one capital letter' };
    }

    // Check for at least one number
    if (!/[0-9]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one number' };
    }

    return { valid: true, error: null };
}

/**
 * WHAT:
 * Strip emoji and pictographic symbols from text.
 *
 * WHY:
 * Emojis can cause issues in visa documents and are not appropriate for official submissions.
 *
 * HOW:
 * Uses Unicode Extended_Pictographic property to remove emoji characters.
 *
 * @param {string} input - Text to strip emoji from
 * @returns {string} Text with emoji removed
 */
function stripEmoji(input) {
  if (!input || typeof input !== 'string') return '';
  // Remove emoji and pictographic symbols
  return input.replace(/\p{Extended_Pictographic}/gu, '');
}

/**
 * Server-side caption validation for photo captions
 *
 * WHAT:
 * Validates and sanitizes photo captions with different rules than long-form text.
 *
 * WHY:
 * Captions are short, optional descriptions that should be plain text only.
 * Different from validateTextServerSide which requires min 20 chars.
 *
 * HOW:
 * - Allows empty string (user may choose no caption)
 * - Max length kept short (300 characters)
 * - Strips all HTML and emoji
 * - Returns sanitized text
 *
 * @param {string} caption - Caption to validate
 * @returns {object} Validation result with sanitized caption
 */
function validateCaptionServerSide(caption) {
  if (caption == null) {
    return { valid: true, sanitized: '' };
  }

  if (typeof caption !== 'string') {
    return { valid: false, error: 'Caption must be text', sanitized: '' };
  }

  let sanitized = caption.trim();

  // Allow empty after trimming (means "no caption")
  if (sanitized.length === 0) {
    return { valid: true, sanitized: '' };
  }

  // Reasonable max length for visa-friendly caption
  if (sanitized.length > 300) {
    return {
      valid: false,
      error: 'Caption cannot exceed 300 characters',
      sanitized: ''
    };
  }

  // Strip HTML / script / dangerous patterns (same library as validateTextServerSide)
  const htmlSanitized = sanitizeHtml(sanitized, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
    textFilter(text) {
      return text
        .replace(/javascript:/gi, '')
        .replace(/vbscript:/gi, '')
        .replace(/data:text\/html/gi, '');
    }
  });

  // Strip emoji and pictographic symbols
  const noEmoji = stripEmoji(htmlSanitized);

  return {
    valid: true,
    error: null,
    sanitized: noEmoji
  };
}

/**
 * Server-side text validation matching frontend rules
 * 
 * WHAT:
 * Validates and sanitizes user-submitted text using a proper HTML sanitization library.
 * 
 * WHY:
 * Regex-based sanitization is insufficient and can be bypassed with clever payloads.
 * We use sanitize-html library which properly parses and strips dangerous HTML/JS.
 * 
 * HOW:
 * 1. Trim whitespace and check length limits
 * 2. Use sanitize-html with strict config to strip ALL HTML tags and dangerous content
 * 3. Return validation result with fully sanitized text
 * 
 * @param {string} text - Text to validate
 * @returns {object} Validation result with sanitized text
 */
function validateTextServerSide(text) {
    if (!text || typeof text !== 'string') {
        return { valid: false, error: 'Text is required', sanitized: '' };
    }

    // Sanitize: trim whitespace
    const sanitized = text.trim();
    
    // Check length limits (frontend: min 20, max 5000)
    if (sanitized.length < 20) {
        return { valid: false, error: 'Text must be at least 20 characters', sanitized: '' };
    }
    
    if (sanitized.length > 5000) {
        return { valid: false, error: 'Text cannot exceed 5000 characters', sanitized: '' };
    }

    // SECURITY: Proper XSS prevention using sanitize-html library
    // Configuration: Strip ALL HTML tags and dangerous content
    // This prevents XSS attacks like <img src=x onerror=alert(1)>, <svg/onload=...>, etc.
    const xssSanitized = sanitizeHtml(sanitized, {
        allowedTags: [], // Strip ALL HTML tags - treat as plain text
        allowedAttributes: {}, // No attributes allowed
        disallowedTagsMode: 'discard', // Remove tags completely
        // Remove any remaining dangerous patterns
        textFilter: function(text) {
            return text
                .replace(/javascript:/gi, '')
                .replace(/vbscript:/gi, '')
                .replace(/data:text\/html/gi, '');
        }
    });

    return { valid: true, error: null, sanitized: xssSanitized };
}

/**
 * WHAT:
 * Account lockout functions now imported from Redis-backed lockout module.
 * 
 * WHY:
 * Old Map-based implementation was per-process only (not multi-instance safe).
 * Redis-backed lockouts work across multiple instances and survive restarts.
 * 
 * HOW:
 * Import checkAccountLockout, recordFailedAttempt, clearFailedAttempts from lockout.js.
 * These functions now use Redis MULTI/EXEC for atomic operations.
 * Progressive backoff ladders preserved (1m, 5m, 15m, 30m, 60m for users).
 * Email addresses are hashed before use in Redis keys (no PII in keys).
 */
// Note: checkAccountLockout, recordFailedAttempt, clearFailedAttempts
// are now imported from ./lockout.js at the top of this file
// Old Map-based implementations removed to avoid shadowing

/**
 * Generate secure single-use code bound to user and action
 * @param {string} userId - User ID
 * @param {string} action - Specific action (e.g., 'password_change', 'email_verify')
 * @param {number} ttlSeconds - Time to live in seconds (default: 300 = 5 minutes)
 * @returns {object} Code object with expiration and metadata
 */
function generateSecureCode(userId, action, ttlSeconds = 300) {
    const code = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    
    const codeData = {
        code,
        userId,
        action,
        expiresAt,
        used: false,
        createdAt: Date.now(),
        attempts: 0
    };
    
    codeAttempts.set(code, codeData);
    
    // Auto-cleanup expired codes
    setTimeout(() => {
        codeAttempts.delete(code);
    }, ttlSeconds * 1000);
    
    logger.debug({
      event: 'security.code.generated',
      userId,
      action
    }, 'Secure code generated for user action');
    
    return {
        code,
        expiresAt,
        ttl: ttlSeconds
    };
}

/**
 * Verify secure code with atomic consumption
 * CRITICAL SECTION: Atomic check-and-use to prevent double consumption
 * 
 * NOTE: This function currently depends on the in-memory codeAttempts Map.
 * For multi-instance deployments, this should be migrated to Redis to ensure
 * code verification state is shared across all server instances.
 * 
 * @param {string} code - Code to verify
 * @param {string} userId - Expected user ID
 * @param {string} action - Expected action
 * @returns {object} Verification result
 */
function verifySecureCode(code, userId, action) {
    const codeData = codeAttempts.get(code);
    
    if (!codeData) {
        return {
            valid: false,
            message: 'Invalid or expired code',
            errorType: 'INVALID_CODE'
        };
    }
    
    // Check expiration
    if (Date.now() > codeData.expiresAt) {
        codeAttempts.delete(code);
        return {
            valid: false,
            message: 'Code has expired',
            errorType: 'EXPIRED_CODE'
        };
    }
    
    // CRITICAL SECTION: Atomic check-and-use to prevent double consumption
    // Check if already used (atomic operation)
    if (codeData.used) {
        return {
            valid: false,
            message: 'Code has already been used',
            errorType: 'USED_CODE'
        };
    }
    
    // Verify user binding
    if (codeData.userId !== userId) {
        // Create new object to avoid modifying shared reference
        const updatedCodeData = {
            ...codeData,
            attempts: codeData.attempts + 1
        };
        
        if (updatedCodeData.attempts >= 3) {
            codeAttempts.delete(code); // Delete after 3 failed attempts
        } else {
            codeAttempts.set(code, updatedCodeData);
        }
        
        return {
            valid: false,
            message: 'Code not valid for this user',
            errorType: 'USER_MISMATCH'
        };
    }
    
    // Verify action binding
    if (codeData.action !== action) {
        // Create new object to avoid modifying shared reference
        const updatedCodeData = {
            ...codeData,
            attempts: codeData.attempts + 1
        };
        
        if (updatedCodeData.attempts >= 3) {
            codeAttempts.delete(code);
        } else {
            codeAttempts.set(code, updatedCodeData);
        }
        
        return {
            valid: false,
            message: 'Code not valid for this action',
            errorType: 'ACTION_MISMATCH'
        };
    }
    
    // CRITICAL SECTION: Atomic mark as used
    // Create new object with used flag to avoid race conditions
    const usedCodeData = {
        ...codeData,
        used: true,
        usedAt: Date.now()
    };
    
    // Atomic set operation
    codeAttempts.set(code, usedCodeData);
    
    logger.debug({
      event: 'security.code.verified',
      userId,
      action
    }, 'Secure code verified and consumed');
    
    return {
        valid: true,
        message: 'Code verified successfully',
        userId: codeData.userId,
        action: codeData.action
    };
}

/**
 * Get client IP address considering proxies
 * @param {object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           '127.0.0.1';
}

module.exports = {
    validateEmailServerSide,
    validatePasswordServerSide,
    validateTextServerSide,
    validateCaptionServerSide,
    checkAccountLockout,
    recordFailedAttempt,
    clearFailedAttempts,
    generateSecureCode,
    verifySecureCode,
    getClientIP
};
