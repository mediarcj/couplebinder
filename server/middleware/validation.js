// File: server/middleware/validation.js
// Description: Custom validation middleware for user profile fields
// Purpose: Enforces specific formats and constraints for all user data fields
// Notes: Provides comprehensive validation for email, phone, dates, and enum values

const { validateEmailServerSide } = require('./security');

/**
 * Validate email format
 * 
 * WHAT:
 * Validates email format using the canonical server-side validation function.
 * 
 * WHY:
 * This wrapper maintains backward compatibility with existing callers that expect
 * a boolean return value, while delegating to the comprehensive validateEmailServerSide()
 * function which includes sanitization and length checks.
 * 
 * HOW:
 * Calls validateEmailServerSide() and returns true if valid, false otherwise.
 * All email validation logic (regex, sanitization, length limits) comes from
 * the canonical implementation in security.js.
 * 
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
function validateEmail(email) {
  // I am saving `result` here so the nearby steps can reuse the same value without rebuilding it each time.
  const result = validateEmailServerSide(email);
  // This return sends the completed value or response back to the code that called this function.
  return result.valid;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Validate phone format (9-999-999-9999)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid phone format
 */
function validatePhone(phone) {
  if (!phone) return true; // Optional field
  // I am saving `phoneRegex` here so the nearby steps can reuse the same value without rebuilding it each time.
  const phoneRegex = /^\d+$/;
  // This return sends the completed value or response back to the code that called this function.
  return phoneRegex.test(phone) && phone.length >= 8 && phone.length <= 15;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Validate date format (MM/DD/YYYY)
 * @param {string} date - Date string to validate
 * @returns {boolean} True if valid date format
 */
function validateDate(date) {
  // I am saving `dateRegex` here so the nearby steps can reuse the same value without rebuilding it each time.
  const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/;
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!dateRegex.test(date)) {
    // This return sends the completed value or response back to the code that called this function.
    return false;
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
  
  // Additional validation for actual date validity
  const [month, day, year] = date.split('/');
  // I am saving `dateObj` here so the nearby steps can reuse the same value without rebuilding it each time.
  const dateObj = new Date(year, month - 1, day);
  // This return sends the completed value or response back to the code that called this function.
  return dateObj.getMonth() === month - 1 && 
         // I am calling this helper here so the current workflow performs this step before it moves on.
         dateObj.getDate() === parseInt(day) && 
         // I am calling this helper here so the current workflow performs this step before it moves on.
         dateObj.getFullYear() === parseInt(year);
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Validate gender enum
 * @param {string} gender - Gender to validate
 * @returns {boolean} True if valid gender value
 */
function validateGender(gender) {
  if (!gender) return true; // Allow blank
  // This return sends the completed value or response back to the code that called this function.
  return ['male', 'female'].includes(gender.toLowerCase());
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Validate relationship status enum
 * @param {string} status - Relationship status to validate
 * @returns {boolean} True if valid status value
 */
function validateRelationshipStatus(status) {
  if (!status) return true; // Allow blank
  // This return sends the completed value or response back to the code that called this function.
  return ['single', 'married'].includes(status.toLowerCase());
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Validate job status enum
 * @param {string} job - Job status to validate
 * @returns {boolean} True if valid job value
 */
function validateJobStatus(job) {
  if (!job) return true; // Allow blank
  // This return sends the completed value or response back to the code that called this function.
  return ['unemployed', 'employed'].includes(job.toLowerCase());
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Validate account privacy enum
 * @param {string} privacy - Privacy setting to validate
 * @returns {boolean} True if valid privacy value
 */
function validateAccountPrivacy(privacy) {
  if (!privacy) return true; // Allow blank
  // This return sends the completed value or response back to the code that called this function.
  return ['public', 'private'].includes(privacy.toLowerCase());
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Validate user role enum
 * @param {string} role - User role to validate
 * @returns {boolean} True if valid role value
 */
function validateUserRole(role) {
  if (!role) return true; // Allow blank
  // This return sends the completed value or response back to the code that called this function.
  return ['user', 'admin', 'ceo'].includes(role.toLowerCase());
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Validate required string field
 * @param {string} value - Value to validate
 * @param {number} minLength - Minimum length
 * @param {number} maxLength - Maximum length
 * @returns {boolean} True if valid
 */
function validateRequiredString(value, minLength = 1, maxLength = 255) {
  // This return sends the completed value or response back to the code that called this function.
  return value && 
         // I am keeping this line here because the surrounding validation.js workflow expects this value or operation before it continues.
         typeof value === 'string' && 
         // I am calling this helper here so the current workflow performs this step before it moves on.
         value.trim().length >= minLength && 
         // I am calling this helper here so the current workflow performs this step before it moves on.
         value.trim().length <= maxLength;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Express middleware to validate user registration data
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
function validateUserRegistration(req, res, next) {
  // I am saving `errors` here so the nearby steps can reuse the same value without rebuilding it each time.
  const errors = [];
  // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
  const data = req.body;

  // Required fields validation
  if (!validateRequiredString(data.email)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Email is required and must be a valid string');
  // I am checking this next possibility only because the earlier condition did not choose its path.
  } else if (!validateEmail(data.email)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Email must be in valid format (e.g., user@example.com)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Use server-authoritative password validation
  const { validatePasswordServerSide } = require('./security');
  // I am saving `passwordValidation` here so the nearby steps can reuse the same value without rebuilding it each time.
  const passwordValidation = validatePasswordServerSide(data.password);
  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!passwordValidation.valid) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push(passwordValidation.error || 'Password is required and must be at least 8 characters long');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (!validateRequiredString(data.display_name)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Display name is required');
  // I am checking this next possibility only because the earlier condition did not choose its path.
  } else if (data.display_name.length > 100) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Display name must be 100 characters or less');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Optional fields validation
  if (data.phone && !validatePhone(data.phone)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Phone must contain only numbers and be 8-15 digits');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (data.birthday && !validateDate(data.birthday)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Birthday must be in format: MM/DD/YYYY (e.g., 01/30/2026)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (data.gender && !validateGender(data.gender)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Gender must be either "male", "female", or blank');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (data.relationship_status && !validateRelationshipStatus(data.relationship_status)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Relationship status must be either "single", "married", or blank');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (data.job && !validateJobStatus(data.job)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Job status must be either "unemployed", "employed", or blank');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (data.account_privacy && !validateAccountPrivacy(data.account_privacy)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Account privacy must be either "public" or "private"');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (data.user_role && !validateUserRole(data.user_role)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('User role must be either "user", "admin", or "ceo"');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // String length validations
  if (data.profile_title && data.profile_title.length > 100) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Profile title must be 100 characters or less');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (data.profile_description && data.profile_description.length > 1000) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Profile description must be 1000 characters or less');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (errors.length > 0) {
    // This return sends the completed value or response back to the code that called this function.
    return res.status(400).json({
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'Validation failed',
      // I am keeping the `details` field in this object so the receiving code can read that value by its expected name.
      details: errors
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am calling this helper here so the current workflow performs this step before it moves on.
  next();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

/**
 * Express middleware to validate user profile update data
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
function validateUserUpdate(req, res, next) {
  // I am saving `errors` here so the nearby steps can reuse the same value without rebuilding it each time.
  const errors = [];
  // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
  const data = req.body;

  // Email validation (if provided)
  if (data.email && !validateEmail(data.email)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Email must be in valid format (e.g., user@example.com)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // Optional fields validation (same as registration)
  if (data.phone && !validatePhone(data.phone)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Phone must contain only numbers and be 8-15 digits');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (data.birthday && !validateDate(data.birthday)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Birthday must be in format: MM/DD/YYYY (e.g., 01/30/2026)');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (data.gender && !validateGender(data.gender)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Gender must be either "male", "female", or blank');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (data.relationship_status && !validateRelationshipStatus(data.relationship_status)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Relationship status must be either "single", "married", or blank');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (data.job && !validateJobStatus(data.job)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Job status must be either "unemployed", "employed", or blank');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (data.account_privacy && !validateAccountPrivacy(data.account_privacy)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('Account privacy must be either "public" or "private"');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (data.user_role && !validateUserRole(data.user_role)) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    errors.push('User role must be either "user", "admin", or "ceo"');
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // This check helps me choose or stop the next path before any work that depends on this condition runs.
  if (errors.length > 0) {
    // This return sends the completed value or response back to the code that called this function.
    return res.status(400).json({
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: 'Validation failed',
      // I am keeping the `details` field in this object so the receiving code can read that value by its expected name.
      details: errors
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }

  // I am calling this helper here so the current workflow performs this step before it moves on.
  next();
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from validation.js.
module.exports = {
  // I am keeping this line here because the surrounding validation.js workflow expects this value or operation before it continues.
  validateEmail,
  // I am keeping this line here because the surrounding validation.js workflow expects this value or operation before it continues.
  validatePhone,
  // I am keeping this line here because the surrounding validation.js workflow expects this value or operation before it continues.
  validateDate,
  // I am keeping this line here because the surrounding validation.js workflow expects this value or operation before it continues.
  validateGender,
  // I am keeping this line here because the surrounding validation.js workflow expects this value or operation before it continues.
  validateRelationshipStatus,
  // I am keeping this line here because the surrounding validation.js workflow expects this value or operation before it continues.
  validateJobStatus,
  // I am keeping this line here because the surrounding validation.js workflow expects this value or operation before it continues.
  validateAccountPrivacy,
  // I am keeping this line here because the surrounding validation.js workflow expects this value or operation before it continues.
  validateUserRole,
  // I am keeping this line here because the surrounding validation.js workflow expects this value or operation before it continues.
  validateUserRegistration,
  // I am keeping this line here because the surrounding validation.js workflow expects this value or operation before it continues.
  validateUserUpdate
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
