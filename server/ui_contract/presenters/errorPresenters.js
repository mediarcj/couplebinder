// File: server/ui_contract/presenters/errorPresenters.js
// Description: Presenter functions for error pages
// Purpose: Builds view models for error pages (404, 500, etc.)
// Notes: Returns plain JSON-friendly objects compatible with EJS and Next.js

const { ASSET_VERSION, config } = require('../../config');

/**
 * Build page model for error page
 * 
 * WHAT:
 * Creates a view model for error pages with status code and message.
 * 
 * WHY:
 * Provides consistent error page structure across the application.
 * 
 * HOW:
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
  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `page` field in this object so the receiving code can read that value by its expected name.
    page: {
      // I am keeping the `title` field in this object so the receiving code can read that value by its expected name.
      title: `Error ${statusCode} - ${config.branding.appName}`,
      // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
      description: 'An error occurred',
      // I am keeping the `type` field in this object so the receiving code can read that value by its expected name.
      type: 'error',
      // I am keeping the `nonce` field in this object so the receiving code can read that value by its expected name.
      nonce: res.locals.nonce,
      // I am keeping the `assetVersion` field in this object so the receiving code can read that value by its expected name.
      assetVersion: ASSET_VERSION
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `user` field in this object so the receiving code can read that value by its expected name.
    user: {
      // I am keeping the `isAuthenticated` field in this object so the receiving code can read that value by its expected name.
      isAuthenticated: req.user?.id ? true : false || false,
      // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
      email: req.user?.email || null,
      // I am keeping the `id` field in this object so the receiving code can read that value by its expected name.
      id: req.user?.id || null
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
    error: {
      // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
      code: statusCode,
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: errorMessage,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `ui` field in this object so the receiving code can read that value by its expected name.
    ui: {
      // I am keeping the `csrfToken` field in this object so the receiving code can read that value by its expected name.
      csrfToken: res.locals.csrfToken || ''
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `app_info` field in this object so the receiving code can read that value by its expected name.
    app_info: {
      // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
      name: config.branding.appName,
      // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
      description: config.branding.appDescription,
      // I am keeping the `version` field in this object so the receiving code can read that value by its expected name.
      version: config.branding.appVersion,
      // I am keeping the `environment` field in this object so the receiving code can read that value by its expected name.
      environment: config.server.nodeEnv
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from errorPresenters.js.
module.exports = { buildErrorPageModel };

