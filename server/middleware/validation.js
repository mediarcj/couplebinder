// File: server/middleware/validation.js
// Description: Custom validation middleware for user profile fields
// Purpose: Enforces specific formats and constraints for all user data fields
// Notes: Provides comprehensive validation for email, phone, dates, and enum values

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
function validateEmail(email) {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * Validate phone format (9-999-999-9999)
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if valid phone format
 */
function validatePhone(phone) {
  const phoneRegex = /^\d{1}-\d{3}-\d{3}-\d{4}$/;
  return phoneRegex.test(phone);
}

/**
 * Validate date format (MM/DD/YYYY)
 * @param {string} date - Date string to validate
 * @returns {boolean} True if valid date format
 */
function validateDate(date) {
  const dateRegex = /^(0[1-9]|1[0-2])\/(0[1-9]|[12][0-9]|3[01])\/\d{4}$/;
  if (!dateRegex.test(date)) {
    return false;
  }
  
  // Additional validation for actual date validity
  const [month, day, year] = date.split('/');
  const dateObj = new Date(year, month - 1, day);
  return dateObj.getMonth() === month - 1 && 
         dateObj.getDate() === parseInt(day) && 
         dateObj.getFullYear() === parseInt(year);
}

/**
 * Validate gender enum
 * @param {string} gender - Gender to validate
 * @returns {boolean} True if valid gender value
 */
function validateGender(gender) {
  if (!gender) return true; // Allow blank
  return ['male', 'female'].includes(gender.toLowerCase());
}

/**
 * Validate relationship status enum
 * @param {string} status - Relationship status to validate
 * @returns {boolean} True if valid status value
 */
function validateRelationshipStatus(status) {
  if (!status) return true; // Allow blank
  return ['single', 'married'].includes(status.toLowerCase());
}

/**
 * Validate job status enum
 * @param {string} job - Job status to validate
 * @returns {boolean} True if valid job value
 */
function validateJobStatus(job) {
  if (!job) return true; // Allow blank
  return ['unemployed', 'employed'].includes(job.toLowerCase());
}

/**
 * Validate account privacy enum
 * @param {string} privacy - Privacy setting to validate
 * @returns {boolean} True if valid privacy value
 */
function validateAccountPrivacy(privacy) {
  if (!privacy) return true; // Allow blank
  return ['public', 'private'].includes(privacy.toLowerCase());
}

/**
 * Validate user role enum
 * @param {string} role - User role to validate
 * @returns {boolean} True if valid role value
 */
function validateUserRole(role) {
  if (!role) return true; // Allow blank
  return ['user', 'admin', 'ceo'].includes(role.toLowerCase());
}

/**
 * Validate required string field
 * @param {string} value - Value to validate
 * @param {number} minLength - Minimum length
 * @param {number} maxLength - Maximum length
 * @returns {boolean} True if valid
 */
function validateRequiredString(value, minLength = 1, maxLength = 255) {
  return value && 
         typeof value === 'string' && 
         value.trim().length >= minLength && 
         value.trim().length <= maxLength;
}

/**
 * Express middleware to validate user registration data
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
function validateUserRegistration(req, res, next) {
  const errors = [];
  const data = req.body;

  // Required fields validation
  if (!validateRequiredString(data.email)) {
    errors.push('Email is required and must be a valid string');
  } else if (!validateEmail(data.email)) {
    errors.push('Email must be in valid format (e.g., user@example.com)');
  }

  if (!validateRequiredString(data.password, 8)) {
    errors.push('Password is required and must be at least 8 characters long');
  }

  if (!validateRequiredString(data.first_name)) {
    errors.push('First name is required');
  }

  if (!validateRequiredString(data.last_name)) {
    errors.push('Last name is required');
  }

  // Optional fields validation
  if (data.phone && !validatePhone(data.phone)) {
    errors.push('Phone must be in format: 9-999-999-9999');
  }

  if (data.birthday && !validateDate(data.birthday)) {
    errors.push('Birthday must be in format: MM/DD/YYYY (e.g., 01/30/2026)');
  }

  if (data.gender && !validateGender(data.gender)) {
    errors.push('Gender must be either "male", "female", or blank');
  }

  if (data.relationship_status && !validateRelationshipStatus(data.relationship_status)) {
    errors.push('Relationship status must be either "single", "married", or blank');
  }

  if (data.job && !validateJobStatus(data.job)) {
    errors.push('Job status must be either "unemployed", "employed", or blank');
  }

  if (data.account_privacy && !validateAccountPrivacy(data.account_privacy)) {
    errors.push('Account privacy must be either "public" or "private"');
  }

  if (data.user_role && !validateUserRole(data.user_role)) {
    errors.push('User role must be either "user", "admin", or "ceo"');
  }

  // String length validations
  if (data.profile_title && data.profile_title.length > 100) {
    errors.push('Profile title must be 100 characters or less');
  }

  if (data.profile_description && data.profile_description.length > 1000) {
    errors.push('Profile description must be 1000 characters or less');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
}

/**
 * Express middleware to validate user profile update data
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Express next function
 */
function validateUserUpdate(req, res, next) {
  const errors = [];
  const data = req.body;

  // Email validation (if provided)
  if (data.email && !validateEmail(data.email)) {
    errors.push('Email must be in valid format (e.g., user@example.com)');
  }

  // Optional fields validation (same as registration)
  if (data.phone && !validatePhone(data.phone)) {
    errors.push('Phone must be in format: 9-999-999-9999');
  }

  if (data.birthday && !validateDate(data.birthday)) {
    errors.push('Birthday must be in format: MM/DD/YYYY (e.g., 01/30/2026)');
  }

  if (data.gender && !validateGender(data.gender)) {
    errors.push('Gender must be either "male", "female", or blank');
  }

  if (data.relationship_status && !validateRelationshipStatus(data.relationship_status)) {
    errors.push('Relationship status must be either "single", "married", or blank');
  }

  if (data.job && !validateJobStatus(data.job)) {
    errors.push('Job status must be either "unemployed", "employed", or blank');
  }

  if (data.account_privacy && !validateAccountPrivacy(data.account_privacy)) {
    errors.push('Account privacy must be either "public" or "private"');
  }

  if (data.user_role && !validateUserRole(data.user_role)) {
    errors.push('User role must be either "user", "admin", or "ceo"');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors
    });
  }

  next();
}

module.exports = {
  validateEmail,
  validatePhone,
  validateDate,
  validateGender,
  validateRelationshipStatus,
  validateJobStatus,
  validateAccountPrivacy,
  validateUserRole,
  validateUserRegistration,
  validateUserUpdate
};
