// ============================================================
// File: server/ui_contract/presenters/helpers/buildAppInfo.js
// Description: Supplies static, non-sensitive app information
// Purpose: Keeps environment metadata centralized and reusable
// ============================================================

const { config } = require('../../../config');

function buildAppInfo() {
  return {
    name: config.branding.appName,
    description: config.branding.appDescription,
    version: config.branding.appVersion,
    environment: config.server.nodeEnv,
  };
}

module.exports = { buildAppInfo };