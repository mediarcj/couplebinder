// File: server/middleware/auth.js
// Description: Authentication middleware for user login verification
// Purpose: Provides functions to verify user credentials against database
// Notes: Uses existing password and validation middleware for consistency

const { db } = require('../db/connection');
const { verifyPassword } = require('./password');
const { validateEmail } = require('./validation');

/**
 * Verify user login credentials
 * @param {string} email - User's email address
 * @param {string} password - User's plain text password
 * @returns {Promise<{success: boolean, user?: object, message?: string}>}
 */
async function verifyLogin(email, password) {
    try {
        // Validate email format first
        if (!validateEmail(email)) {
            return { success: false, message: 'Invalid email format' };
        }

        // Check if user exists
        const user = await db('users').where('email', email.toLowerCase()).first();
        if (!user) {
            return { success: false, message: 'Invalid email or password' };
        }

        // Verify password
        const passwordMatch = await verifyPassword(password, user.password);
        if (!passwordMatch) {
            return { success: false, message: 'Invalid email or password' };
        }

        // Return user data (without password)
        const { password: _, ...userWithoutPassword } = user;
        return { success: true, user: userWithoutPassword };
    } catch (error) {
        console.error('Login verification error:', error.message);
        return { success: false, message: 'Login verification failed' };
    }
}

module.exports = {
    verifyLogin
};
