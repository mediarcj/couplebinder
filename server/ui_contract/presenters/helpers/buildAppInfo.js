// ============================================================
// File: server/ui_contract/presenters/helpers/buildAppInfo.js
// Description: Supplies static, non-sensitive app information
// Purpose: Keeps environment metadata centralized and reusable
// ============================================================

const { config } = require('../../../config');

// I am keeping `buildAppInfo` as a named helper so the surrounding workflow can call this step when it needs it.
function buildAppInfo() {
  // This return sends the completed value or response back to the code that called this function.
  return {
    // I am keeping the `name` field in this object so the receiving code can read that value by its expected name.
    name: config.branding.appName,
    // I am keeping the `description` field in this object so the receiving code can read that value by its expected name.
    description: config.branding.appDescription,
    // I am keeping the `version` field in this object so the receiving code can read that value by its expected name.
    version: config.branding.appVersion,
    // I am keeping the `environment` field in this object so the receiving code can read that value by its expected name.
    environment: config.server.nodeEnv,
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from buildAppInfo.js.
module.exports = { buildAppInfo };