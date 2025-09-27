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
 * Verify a password against a stored hash
 * @param {string} password - Plain text password to verify
 * @param {string} stored - Stored hash string from database
 * @returns {boolean} True if password matches
 */
function verifyPassword(password, stored) {
  try {
    const parts = stored.split(':');
    if (parts.length !== 5) {
      return false;
    }
    
    const [storedHash, salt, iterations, keyLength, digest] = parts;
    
    // Use stored parameters for verification
    const hash = crypto.pbkdf2Sync(
      password, 
      Buffer.from(salt, 'base64'), 
      parseInt(iterations), 
      parseInt(keyLength), 
      digest
    ).toString('base64');
    
    return hash === storedHash;
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

/**
 * Express middleware to hash password before saving
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
function hashPasswordMiddleware(req, res, next) {
  if (req.body.password) {
    const passwordData = createPasswordHash(req.body.password);
    req.body.password_hash = passwordData.stored;
    delete req.body.password; // Remove plain text password
  }
  next();
}

/**
 * Express middleware to verify password during login
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
function verifyPasswordMiddleware(req, res, next) {
  const { password, stored_hash } = req.body;
  
  if (!password || !stored_hash) {
    return res.status(400).json({ 
      error: 'Password and stored hash are required for verification' 
    });
  }
  
  const isValid = verifyPassword(password, stored_hash);
  
  if (!isValid) {
    return res.status(401).json({ 
      error: 'Invalid password' 
    });
  }
  
  next();
}

module.exports = {
  createPasswordHash,
  verifyPassword,
  hashPasswordMiddleware,
  verifyPasswordMiddleware
};
