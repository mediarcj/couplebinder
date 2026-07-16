// Description: Presenter functions for error pages
// Purpose: Builds view models for error pages (404, 500, etc.)
// Notes: Returns plain JSON-friendly objects compatible with EJS and Next.js

const { ASSET_VERSION, config } = require('../../config');

/**
 * Build page model for error page
 * 
 * Creates a view model for error pages with status code and message.
 * 
 * Provides consistent error page structure across the application.
 * 
 * Takes req, res, statusCode, and errorMessage and returns a plain object
 * with page metadata, user state, error details, and app info.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} errorMessage - Error message to display
 * @returns {Object} Page model for error page
 */
function buildErrorPageModel(req, res, statusCode, errorMessage) {
  return {
    page: {
      title: `Error ${statusCode} - ${config.branding.appName}`,
      description: 'An error occurred',
      type: 'error',
      nonce: res.locals.nonce,
      assetVersion: ASSET_VERSION
    },
    user: {
      isAuthenticated: req.user?.id ? true : false || false,
      email: req.user?.email || null,
      id: req.user?.id || null
    },
    error: {
      code: statusCode,
      message: errorMessage,
      requestId: req.requestId
    },
    ui: {
      csrfToken: res.locals.csrfToken || ''
    },
    app_info: {
      name: config.branding.appName,
      description: config.branding.appDescription,
      version: config.branding.appVersion,
      environment: config.server.nodeEnv
    }
  };
}

module.exports = { buildErrorPageModel };

