// ============================================================
// File: server/ui_contract/presenters/helpers/buildAppInfo.js
// Description: Supplies static, non-sensitive app information
// Purpose: Keeps environment metadata centralized and reusable
// ============================================================

function buildAppInfo() {
  return {
    name: process.env.APP_NAME || 'Detechify',
    description: process.env.APP_DESCRIPTION || 'A secure modern web application',
    version: process.env.APP_VERSION || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  };
}

module.exports = { buildAppInfo };