// File: server/middleware/security.js
// Description: Server-authoritative security middleware
// Purpose: Enforces all security restrictions server-side, treating browser as hostile
// Notes: Never trusts client-side validation, implements atomic operations and rate limiting

// Rate limiting removed - handled at Cloudflare edge
const crypto = require('crypto');

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

    // Check character restrictions (frontend: alphanumeric only)
    const validPasswordRegex = /^[a-zA-Z0-9]+$/;
    if (!validPasswordRegex.test(password)) {
        return { valid: false, error: 'Password can only contain letters and numbers' };
    }

    // Additional server-side security: minimum length
    if (password.length < 6) {
        return { valid: false, error: 'Password must be at least 6 characters' };
    }

    return { valid: true, error: null };
}

/**
 * Server-side text validation matching frontend rules
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

    // Basic XSS prevention: remove script tags and dangerous content
    const xssSanitized = sanitized
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');

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
 */
function checkAccountLockout(email, ip) {
    const userKey = `user:${email}`;
    const ipKey = `ip:${ip}`;
    const now = Date.now();
    
    // Get current attempt counts
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
 */
function recordFailedAttempt(email, ip) {
    const userKey = `user:${email}`;
    const ipKey = `ip:${ip}`;
    const now = Date.now();
    
    // Update user attempts
    const userAttempts = loginAttempts.get(userKey) || { count: 0, lastAttempt: 0, lockedUntil: 0 };
    userAttempts.count++;
    userAttempts.lastAttempt = now;
    
    // Progressive lockout: 1min, 5min, 15min, 30min, 1hr
    const lockoutDurations = [60, 300, 900, 1800, 3600]; // seconds
    const lockoutDuration = lockoutDurations[Math.min(userAttempts.count - 1, lockoutDurations.length - 1)];
    userAttempts.lockedUntil = now + (lockoutDuration * 1000);
    
    loginAttempts.set(userKey, userAttempts);
    
    // Update IP attempts (separate tracking)
    const ipAttemptsData = ipAttempts.get(ipKey) || { count: 0, lastAttempt: 0, lockedUntil: 0 };
    ipAttemptsData.count++;
    ipAttemptsData.lastAttempt = now;
    
    // IP lockout: 5min, 15min, 30min, 1hr, 2hr
    const ipLockoutDurations = [300, 900, 1800, 3600, 7200]; // seconds
    const ipLockoutDuration = ipLockoutDurations[Math.min(ipAttemptsData.count - 1, ipLockoutDurations.length - 1)];
    ipAttemptsData.lockedUntil = now + (ipLockoutDuration * 1000);
    
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
    
    console.log(`Security: Cleared failed attempts - User: ${email}, IP: ${ip}`);
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
        codeData.attempts++;
        if (codeData.attempts >= 3) {
            codeAttempts.delete(code); // Delete after 3 failed attempts
        }
        return {
            valid: false,
            message: 'Code not valid for this user',
            errorType: 'USER_MISMATCH'
        };
    }
    
    // Verify action binding
    if (codeData.action !== action) {
        codeData.attempts++;
        if (codeData.attempts >= 3) {
            codeAttempts.delete(code);
        }
        return {
            valid: false,
            message: 'Code not valid for this action',
            errorType: 'ACTION_MISMATCH'
        };
    }
    
    // Mark as used atomically
    codeData.used = true;
    codeData.usedAt = Date.now();
    
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
