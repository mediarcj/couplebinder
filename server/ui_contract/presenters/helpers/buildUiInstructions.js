// ============================================================
// File: server/ui_contract/presenters/helpers/buildUiInstructions.js
// Description: Generates safe, server-driven UI rule set
// Purpose: Central source of truth for feature flags, limits, and visibility
// ============================================================

function buildUiInstructions({ isAuthenticated = false, csrfToken = '', nonce = '' } = {}) {
  return {
    allowed_actions: isAuthenticated ? ['view_page', 'logout'] : ['login'],
    input_limits: {
      text_min: 20,
      text_max: 5000,
      title_max: 140,
      email_max: 40,
      password_min: 8,
      password_max: 50,
    },
    feature_flags: {},
    form_schema: {},
    cooldowns: {},
    security: {
      csrf_token: csrfToken,
      nonce,
      content_security_policy: 'strict',
    },
    display_rules: {
      show_user_menu: isAuthenticated,
    },
  };
}

module.exports = { buildUiInstructions };