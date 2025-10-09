/**
 * File: server/middleware/sanitize.js
 * Description: Centralized input sanitization with strict defaults.
 *
 * WHAT:
 * Provides a simple function to strip all HTML tags and attributes from user input.
 *
 * WHY:
 * We never trust the client. User input must be sanitized before storage or display
 * to prevent XSS attacks. Centralized sanitization ensures consistency.
 *
 * HOW:
 * Uses sanitize-html library with strict defaults: no tags, no attributes allowed.
 * Returns plain text only. If input is null/undefined, returns empty string.
 */

const sanitizeHtml = require('sanitize-html');

/**
 * Sanitize user input by stripping all HTML tags and attributes.
 *
 * WHAT:
 * Converts any HTML input to plain text by removing all tags.
 *
 * WHY:
 * Prevents XSS attacks by ensuring no HTML/scripts can be injected.
 *
 * HOW:
 * Uses sanitize-html with empty allowlists for tags and attributes.
 * Returns empty string if input is null/undefined.
 *
 * Example:
 *   sanitize('<script>alert("xss")</script>Hello') => 'Hello'
 *   sanitize('<b>Bold</b> text') => 'Bold text'
 */
module.exports = function sanitize(str) {
  if (str === null || str === undefined) return '';
  return sanitizeHtml(String(str), {
    allowedTags: [],
    allowedAttributes: {}
  });
};

