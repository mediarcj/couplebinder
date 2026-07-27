'use strict';

/**
 * Serialize trusted server data into a non-executable application/json script element.
 * Escaping HTML-significant characters prevents a stored value from closing the element.
 */
function serializeForHtmlScript(value) {
  return JSON.stringify(value || {})
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

module.exports = { serializeForHtmlScript };
