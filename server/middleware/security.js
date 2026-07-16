// File: server/middleware/security.js
// Description: Server-authoritative security middleware
// Purpose: Enforces all security restrictions server-side, treating browser as hostile
// Notes: Never trusts client-side validation, implements atomic operations and rate limiting

// Rate limiting and lockouts now use Redis for multi-instance safety
// NOTE: This is the SECONDARY layer - Cloudflare edge (PRIMARY) handles volumetric attacks first
const crypto = require('crypto');
// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `sanitize-html` into `sanitizeHtml` so this file can reuse that dependency below.
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
  // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
  checkAccountLockout,
  // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
  recordFailedAttempt,
  // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
  clearFailedAttempts
// I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
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
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!email || typeof email !== 'string') {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Email is required', sanitized: '' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Sanitize: trim whitespace and convert to lowercase
    const sanitized = email.trim().toLowerCase();
    
    // Check length limits (frontend: maxlength="40")
    if (sanitized.length === 0) {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Email cannot be empty', sanitized: '' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (sanitized.length > 40) {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Email cannot exceed 40 characters', sanitized: '' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Check format (matching frontend regex)
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!emailRegex.test(sanitized)) {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Invalid email format', sanitized: '' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return { valid: true, error: null, sanitized };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!password || typeof password !== 'string') {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Password is required' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Check length limits
    if (password.length === 0) {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Password cannot be empty' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Minimum length requirement
    if (password.length < 8) {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Password must be at least 8 characters' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Maximum length requirement
    if (password.length > 50) {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Password must be 50 characters or less' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Check for spaces (not allowed)
    if (/\s/.test(password)) {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Password cannot contain spaces' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Check for special characters (only letters and numbers allowed)
    const validPasswordRegex = /^[a-zA-Z0-9]+$/;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!validPasswordRegex.test(password)) {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Password can only contain uppercase letters, lowercase letters, and numbers' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Check for at least one capital letter
    if (!/[A-Z]/.test(password)) {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Password must contain at least one capital letter' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Check for at least one number
    if (!/[0-9]/.test(password)) {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Password must contain at least one number' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return { valid: true, error: null };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!input || typeof input !== 'string') return '';
  // Remove emoji and pictographic symbols
  return input.replace(/\p{Extended_Pictographic}/gu, '');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (caption == null) {
    // This return sends the completed value or response back to the code that called this function.
    return { valid: true, sanitized: '' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (typeof caption !== 'string') {
    // This return sends the completed value or response back to the code that called this function.
    return { valid: false, error: 'Caption must be text', sanitized: '' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am saving `sanitized` here so the nearby steps can reuse the same value without rebuilding it each time.
  let sanitized = caption.trim();

  // Allow empty after trimming (means "no caption")
  if (sanitized.length === 0) {
    // This return sends the completed value or response back to the code that called this function.
    return { valid: true, sanitized: '' };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Reasonable max length for visa-friendly caption
  if (sanitized.length > 300) {
    // This return sends the completed value or response back to the code that called this function.
    return {
      // I am keeping the `valid` field in this object so the receiving code can read that value by its expected name.
      valid: false,
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'Caption cannot exceed 300 characters',
      // I am keeping the `sanitized` field in this object so the receiving code can read that value by its expected name.
      sanitized: ''
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Strip HTML / script / dangerous patterns (same library as validateTextServerSide)
  const htmlSanitized = sanitizeHtml(sanitized, {
    // I am keeping the `allowedTags` field in this object so the receiving code can read that value by its expected name.
    allowedTags: [],
    // I am keeping the `allowedAttributes` field in this object so the receiving code can read that value by its expected name.
    allowedAttributes: {},
    // I am keeping the `disallowedTagsMode` field in this object so the receiving code can read that value by its expected name.
    disallowedTagsMode: 'discard',
    // I am defining the `textFilter` step here so the surrounding object or class can call it with the values listed in its parameters.
    textFilter(text) {
      // This return sends the completed value or response back to the code that called this function.
      return text
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/javascript:/gi, '')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/vbscript:/gi, '')
        // I am continuing the existing call chain here so this option stays attached to the same operation started above.
        .replace(/data:text\/html/gi, '');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  });

  // Strip emoji and pictographic symbols
  const noEmoji = stripEmoji(htmlSanitized);

  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `valid` field in this object so the receiving code can read that value by its expected name.
    valid: true,
    // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
    error: null,
    // I am keeping the `sanitized` field in this object so the receiving code can read that value by its expected name.
    sanitized: noEmoji
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!text || typeof text !== 'string') {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Text is required', sanitized: '' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Sanitize: trim whitespace
    const sanitized = text.trim();
    
    // Check length limits (frontend: min 20, max 5000)
    if (sanitized.length < 20) {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Text must be at least 20 characters', sanitized: '' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (sanitized.length > 5000) {
        // This return sends the completed value or response back to the code that called this function.
        return { valid: false, error: 'Text cannot exceed 5000 characters', sanitized: '' };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
            // This return sends the completed value or response back to the code that called this function.
            return text
                // I am continuing the existing call chain here so this option stays attached to the same operation started above.
                .replace(/javascript:/gi, '')
                // I am continuing the existing call chain here so this option stays attached to the same operation started above.
                .replace(/vbscript:/gi, '')
                // I am continuing the existing call chain here so this option stays attached to the same operation started above.
                .replace(/data:text\/html/gi, '');
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This return sends the completed value or response back to the code that called this function.
    return { valid: true, error: null, sanitized: xssSanitized };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
    // I am saving `code` here so the nearby steps can reuse the same value without rebuilding it each time.
    const code = crypto.randomBytes(16).toString('hex');
    // I am saving `expiresAt` here so the nearby steps can reuse the same value without rebuilding it each time.
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    
    // I am saving `codeData` here so the nearby steps can reuse the same value without rebuilding it each time.
    const codeData = {
        // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
        code,
        // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
        userId,
        // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
        action,
        // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
        expiresAt,
        // I am keeping the `used` field in this object so the receiving code can read that value by its expected name.
        used: false,
        // I am keeping the `createdAt` field in this object so the receiving code can read that value by its expected name.
        createdAt: Date.now(),
        // I am keeping the `attempts` field in this object so the receiving code can read that value by its expected name.
        attempts: 0
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    codeAttempts.set(code, codeData);
    
    // Auto-cleanup expired codes
    setTimeout(() => {
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        codeAttempts.delete(code);
    // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
    }, ttlSeconds * 1000);
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.debug({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'security.code.generated',
      // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
      action
    // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
    }, 'Secure code generated for user action');
    
    // This return sends the completed value or response back to the code that called this function.
    return {
        // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
        code,
        // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
        expiresAt,
        // I am keeping the `ttl` field in this object so the receiving code can read that value by its expected name.
        ttl: ttlSeconds
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
    // I am saving `codeData` here so the nearby steps can reuse the same value without rebuilding it each time.
    const codeData = codeAttempts.get(code);
    
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!codeData) {
        // This return sends the completed value or response back to the code that called this function.
        return {
            // I am keeping the `valid` field in this object so the receiving code can read that value by its expected name.
            valid: false,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'Invalid or expired code',
            // I am keeping the `errorType` field in this object so the receiving code can read that value by its expected name.
            errorType: 'INVALID_CODE'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Check expiration
    if (Date.now() > codeData.expiresAt) {
        // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
        codeAttempts.delete(code);
        // This return sends the completed value or response back to the code that called this function.
        return {
            // I am keeping the `valid` field in this object so the receiving code can read that value by its expected name.
            valid: false,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'Code has expired',
            // I am keeping the `errorType` field in this object so the receiving code can read that value by its expected name.
            errorType: 'EXPIRED_CODE'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // CRITICAL SECTION: Atomic check-and-use to prevent double consumption
    // Check if already used (atomic operation)
    if (codeData.used) {
        // This return sends the completed value or response back to the code that called this function.
        return {
            // I am keeping the `valid` field in this object so the receiving code can read that value by its expected name.
            valid: false,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'Code has already been used',
            // I am keeping the `errorType` field in this object so the receiving code can read that value by its expected name.
            errorType: 'USED_CODE'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Verify user binding
    if (codeData.userId !== userId) {
        // Create new object to avoid modifying shared reference
        const updatedCodeData = {
            // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
            ...codeData,
            // I am keeping the `attempts` field in this object so the receiving code can read that value by its expected name.
            attempts: codeData.attempts + 1
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        };
        
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (updatedCodeData.attempts >= 3) {
            codeAttempts.delete(code); // Delete after 3 failed attempts
        // This alternative runs only when the condition above did not use its first path.
        } else {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            codeAttempts.set(code, updatedCodeData);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        
        // This return sends the completed value or response back to the code that called this function.
        return {
            // I am keeping the `valid` field in this object so the receiving code can read that value by its expected name.
            valid: false,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'Code not valid for this user',
            // I am keeping the `errorType` field in this object so the receiving code can read that value by its expected name.
            errorType: 'USER_MISMATCH'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // Verify action binding
    if (codeData.action !== action) {
        // Create new object to avoid modifying shared reference
        const updatedCodeData = {
            // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
            ...codeData,
            // I am keeping the `attempts` field in this object so the receiving code can read that value by its expected name.
            attempts: codeData.attempts + 1
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        };
        
        // This check helps me choose or stop the next path before any work that depends on this condition runs.
        if (updatedCodeData.attempts >= 3) {
            // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
            codeAttempts.delete(code);
        // This alternative runs only when the condition above did not use its first path.
        } else {
            // I am calling this helper here so the current workflow performs this step before it moves on.
            codeAttempts.set(code, updatedCodeData);
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        }
        
        // This return sends the completed value or response back to the code that called this function.
        return {
            // I am keeping the `valid` field in this object so the receiving code can read that value by its expected name.
            valid: false,
            // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
            message: 'Code not valid for this action',
            // I am keeping the `errorType` field in this object so the receiving code can read that value by its expected name.
            errorType: 'ACTION_MISMATCH'
        // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
        };
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    
    // CRITICAL SECTION: Atomic mark as used
    // Create new object with used flag to avoid race conditions
    const usedCodeData = {
        // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
        ...codeData,
        // I am keeping the `used` field in this object so the receiving code can read that value by its expected name.
        used: true,
        // I am keeping the `usedAt` field in this object so the receiving code can read that value by its expected name.
        usedAt: Date.now()
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
    
    // Atomic set operation
    codeAttempts.set(code, usedCodeData);
    
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.debug({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'security.code.verified',
      // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
      userId,
      // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
      action
    // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
    }, 'Secure code verified and consumed');
    
    // This return sends the completed value or response back to the code that called this function.
    return {
        // I am keeping the `valid` field in this object so the receiving code can read that value by its expected name.
        valid: true,
        // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
        message: 'Code verified successfully',
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: codeData.userId,
        // I am keeping the `action` field in this object so the receiving code can read that value by its expected name.
        action: codeData.action
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Get client IP address considering proxies
 * @param {object} req - Express request object
 * @returns {string} Client IP address
 */
function getClientIP(req) {
    // This return sends the completed value or response back to the code that called this function.
    return req.ip || 
           // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
           req.connection.remoteAddress || 
           // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
           req.socket.remoteAddress ||
           // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
           (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
           // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
           '127.0.0.1';
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from security.js.
module.exports = {
    // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
    validateEmailServerSide,
    // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
    validatePasswordServerSide,
    // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
    validateTextServerSide,
    // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
    validateCaptionServerSide,
    // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
    checkAccountLockout,
    // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
    recordFailedAttempt,
    // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
    clearFailedAttempts,
    // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
    generateSecureCode,
    // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
    verifySecureCode,
    // I am keeping this line here because the surrounding security.js workflow expects this value or operation before it continues.
    getClientIP
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
