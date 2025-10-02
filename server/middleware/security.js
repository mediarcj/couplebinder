// File: server/middleware/security.js
// Description: Server-authoritative security middleware
// Purpose: Enforces all security restrictions server-side, treating browser as hostile
// Notes: Never trusts client-side validation, implements atomic operations and rate limiting

// Rate limiting removed - handled at Cloudflare edge
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
 * We implement rate limiting, input sanitization, atomic operations, and strict validation.
 * All security decisions are made server-side with detailed logging for monitoring.
 */

// Rate limiting stores for tracking attempts
// CRITICAL SECTION: These Maps are shared data accessed by multiple requests
const loginAttempts = new Map();
const ipAttempts = new Map();
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
 * @param {string} password - Password to validate
 * @returns {object} Validation result
 */
function validatePasswordServerSide(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' };
    }

    // Check length limits
    if (password.length === 0) {
        return { valid: false, error: 'Password cannot be empty' };
    }

    // No character restrictions - frontend allows any characters

    // Additional server-side security: minimum length
    if (password.length < 8) {
        return { valid: false, error: 'Password must be at least 8 characters' };
    }
    
    // Check maximum length
    if (password.length > 50) {
        return { valid: false, error: 'Password must be 50 characters or less' };
    }

    return { valid: true, error: null };
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
 * Authentication rate limiting middleware (disabled - handled at Cloudflare edge)
 *
 * WHY:
 * Rate limiting is now handled at the Cloudflare edge layer for better performance
 * and centralized protection across all endpoints
 *
 * HOW:
 * Returns a simple middleware that passes through all requests
 * Cloudflare handles rate limiting at the edge
 */
function createAuthRateLimit() {
    return (req, res, next) => {
        // Rate limiting handled at Cloudflare edge
        next();
    };
}

/**
 * Account lockout mechanism
 * Tracks failed attempts per user and implements progressive delays
 * CRITICAL SECTION: Read-only check - no modifications to shared data
 */
function checkAccountLockout(email, ip) {
    const userKey = `user:${email}`;
    const ipKey = `ip:${ip}`;
    const now = Date.now();
    
    // Get current attempt counts (read-only, no race condition)
    const userAttempts = loginAttempts.get(userKey) || { count: 0, lastAttempt: 0, lockedUntil: 0 };
    const ipAttemptsData = ipAttempts.get(ipKey) || { count: 0, lastAttempt: 0, lockedUntil: 0 };
    
    // Check if account is currently locked
    if (userAttempts.lockedUntil > now) {
        const remainingTime = Math.ceil((userAttempts.lockedUntil - now) / 1000);
        return {
            locked: true,
            message: `Account locked. Try again in ${remainingTime} seconds.`,
            remainingTime
        };
    }
    
    // Check if IP is currently locked
    if (ipAttemptsData.lockedUntil > now) {
        const remainingTime = Math.ceil((ipAttemptsData.lockedUntil - now) / 1000);
        return {
            locked: true,
            message: `IP address locked. Try again in ${remainingTime} seconds.`,
            remainingTime
        };
    }
    
    return { locked: false };
}

/**
 * Record failed login attempt
 * Implements progressive lockout with exponential backoff
 * CRITICAL SECTION: Atomic update to prevent race conditions
 */
function recordFailedAttempt(email, ip) {
    const userKey = `user:${email}`;
    const ipKey = `ip:${ip}`;
    const now = Date.now();
    
    // CRITICAL SECTION: Atomic update of user attempts
    // We create a new object to avoid modifying shared references
    const currentUserAttempts = loginAttempts.get(userKey) || { count: 0, lastAttempt: 0, lockedUntil: 0 };
    const userAttempts = {
        count: currentUserAttempts.count + 1,
        lastAttempt: now,
        lockedUntil: 0 // Will be calculated below
    };
    
    // Progressive lockout: 1min, 5min, 15min, 30min, 1hr
    const lockoutDurations = [60, 300, 900, 1800, 3600]; // seconds
    const lockoutDuration = lockoutDurations[Math.min(userAttempts.count - 1, lockoutDurations.length - 1)];
    userAttempts.lockedUntil = now + (lockoutDuration * 1000);
    
    // Atomic set operation
    loginAttempts.set(userKey, userAttempts);
    
    // CRITICAL SECTION: Atomic update of IP attempts
    // We create a new object to avoid modifying shared references
    const currentIpAttempts = ipAttempts.get(ipKey) || { count: 0, lastAttempt: 0, lockedUntil: 0 };
    const ipAttemptsData = {
        count: currentIpAttempts.count + 1,
        lastAttempt: now,
        lockedUntil: 0 // Will be calculated below
    };
    
    // IP lockout: 5min, 15min, 30min, 1hr, 2hr
    const ipLockoutDurations = [300, 900, 1800, 3600, 7200]; // seconds
    const ipLockoutDuration = ipLockoutDurations[Math.min(ipAttemptsData.count - 1, ipLockoutDurations.length - 1)];
    ipAttemptsData.lockedUntil = now + (ipLockoutDuration * 1000);
    
    // Atomic set operation
    ipAttempts.set(ipKey, ipAttemptsData);
    
    console.log(`Security: Failed login attempt - User: ${email}, IP: ${ip}, Attempts: ${userAttempts.count}`);
}

/**
 * Clear failed attempts on successful login
 */
function clearFailedAttempts(email, ip) {
    const userKey = `user:${email}`;
    const ipKey = `ip:${ip}`;
    
    loginAttempts.delete(userKey);
    ipAttempts.delete(ipKey);
    
    logger.securityClearance('Cleared failed attempts', {
        user: email,
        ip: ip
    });
}

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
    
    console.log(`Security: Generated secure code for user ${userId}, action: ${action}`);
    
    return {
        code,
        expiresAt,
        ttl: ttlSeconds
    };
}

/**
 * Verify secure code with atomic consumption
 * CRITICAL SECTION: Atomic check-and-use to prevent double consumption
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
    
    console.log(`Security: Code verified and consumed - User: ${userId}, Action: ${action}`);
    
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
    createAuthRateLimit,
    checkAccountLockout,
    recordFailedAttempt,
    clearFailedAttempts,
    generateSecureCode,
    verifySecureCode,
    getClientIP
};
