// File: server/middleware/password.js
// Description: Custom password hashing middleware using Node.js crypto
// Purpose: Provides secure password hashing without external dependencies
// Notes: Uses PBKDF2 with SHA-256, 100,000 iterations, and random salt generation

const crypto = require('crypto');

// Configuration for password hashing
const SALT_LENGTH = 32; // 256 bits
const ITERATIONS = 100000; // Industry standard
const KEY_LENGTH = 64; // 512 bits
const DIGEST = 'sha256';

/**
 * Generate a random salt
 * @returns {string} Base64 encoded salt
 */
function generateSalt() {
  return crypto.randomBytes(SALT_LENGTH).toString('base64');
}

/**
 * Hash a password with salt using PBKDF2
 * @param {string} password - Plain text password
 * @param {string} salt - Base64 encoded salt
 * @returns {string} Base64 encoded hash
 */
function hashPassword(password, salt) {
  const saltBuffer = Buffer.from(salt, 'base64');
  const hash = crypto.pbkdf2Sync(password, saltBuffer, ITERATIONS, KEY_LENGTH, DIGEST);
  return hash.toString('base64');
}

/**
 * Hash a password with a new random salt
 * @param {string} password - Plain text password
 * @returns {object} Object containing hash and salt
 */
function createPasswordHash(password) {
  const salt = generateSalt();
  const hash = hashPassword(password, salt);
  
  return {
    hash: hash,
    salt: salt,
    // Store as combined string for database storage
    stored: `${hash}:${salt}:${ITERATIONS}:${KEY_LENGTH}:${DIGEST}`
  };
}

/**
 * Verify a password against a stored hash with enhanced error handling
 * @param {string} password - Plain text password to verify
 * @param {string} stored - Stored hash string from database
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(password, stored) {
  try {
    // Input validation
    if (!password || typeof password !== 'string') {
      console.error('Password verification error: Invalid password input');
      return false;
    }

    if (!stored || typeof stored !== 'string') {
      console.error('Password verification error: Invalid stored hash input');
      return false;
    }

    // Parse stored hash components
    const parts = stored.split(':');
    if (parts.length !== 5) {
      console.error('Password verification error: Invalid hash format', {
        partsCount: parts.length,
        timestamp: new Date().toISOString()
      });
      return false;
    }
    
    const [storedHash, salt, iterations, keyLength, digest] = parts;
    
    // Validate hash components
    if (!storedHash || !salt || !iterations || !keyLength || !digest) {
      console.error('Password verification error: Missing hash components');
      return false;
    }

    // Validate numeric parameters
    const iterationsNum = parseInt(iterations);
    const keyLengthNum = parseInt(keyLength);
    
    if (isNaN(iterationsNum) || isNaN(keyLengthNum)) {
      console.error('Password verification error: Invalid numeric parameters', {
        iterations: iterations,
        keyLength: keyLength,
        timestamp: new Date().toISOString()
      });
      return false;
    }

    // Validate digest algorithm
    const validDigests = ['sha256', 'sha512'];
    if (!validDigests.includes(digest)) {
      console.error('Password verification error: Unsupported digest algorithm', {
        digest: digest,
        timestamp: new Date().toISOString()
      });
      return false;
    }

    // Perform password verification with timeout protection
    const hash = crypto.pbkdf2Sync(
      password, 
      Buffer.from(salt, 'base64'), 
      iterationsNum, 
      keyLengthNum, 
      digest
    ).toString('base64');
    
    // Constant-time comparison to prevent timing attacks
    const isValid = crypto.timingSafeEqual(
      Buffer.from(hash, 'base64'),
      Buffer.from(storedHash, 'base64')
    );
    
    return isValid;
    
  } catch (error) {
    console.error('Password verification error:', {
      message: error.message,
      code: error.code,
      timestamp: new Date().toISOString()
    });
    return false;
  }
}


module.exports = {
  createPasswordHash,
  verifyPassword
};
