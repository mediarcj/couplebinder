// ============================================================
// File: server/ui_contract/presenters/helpers/buildUiInstructions.js
// Description: Generates safe, server-driven UI rule set
// Purpose: Central source of truth for feature flags, limits, and visibility
// ============================================================

function buildUiInstructions({ isAuthenticated = false, csrfToken = '', nonce = '' } = {}) {
  // This return sends the completed value or response back to the code that called this function.
  return {
    // Top-level alias so EJS can use ui.csrfToken
    csrfToken,

    // I am keeping the `allowed_actions` field in this object so the receiving code can read that value by its expected name.
    allowed_actions: isAuthenticated ? ['view_page', 'logout'] : ['login'],
    // I am keeping the `input_limits` field in this object so the receiving code can read that value by its expected name.
    input_limits: {
      // I am keeping the `text_min` field in this object so the receiving code can read that value by its expected name.
      text_min: 20,
      // I am keeping the `text_max` field in this object so the receiving code can read that value by its expected name.
      text_max: 5000,
      // I am keeping the `title_max` field in this object so the receiving code can read that value by its expected name.
      title_max: 140,
      // I am keeping the `email_max` field in this object so the receiving code can read that value by its expected name.
      email_max: 40,
      // I am keeping the `password_min` field in this object so the receiving code can read that value by its expected name.
      password_min: 8,
      // I am keeping the `password_max` field in this object so the receiving code can read that value by its expected name.
      password_max: 50,
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `feature_flags` field in this object so the receiving code can read that value by its expected name.
    feature_flags: {},
    // I am keeping the `form_schema` field in this object so the receiving code can read that value by its expected name.
    form_schema: {},
    // I am keeping the `cooldowns` field in this object so the receiving code can read that value by its expected name.
    cooldowns: {},
    // I am keeping the `security` field in this object so the receiving code can read that value by its expected name.
    security: {
      // I am keeping the `csrf_token` field in this object so the receiving code can read that value by its expected name.
      csrf_token: csrfToken,
      // I am keeping this line here because the surrounding buildUiInstructions.js workflow expects this value or operation before it continues.
      nonce,
      // I am keeping the `content_security_policy` field in this object so the receiving code can read that value by its expected name.
      content_security_policy: 'strict',
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
    // I am keeping the `display_rules` field in this object so the receiving code can read that value by its expected name.
    display_rules: {
      // I am keeping the `show_user_menu` field in this object so the receiving code can read that value by its expected name.
      show_user_menu: isAuthenticated,
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    },
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// I am exporting this value here so another module can deliberately reuse the completed piece from buildUiInstructions.js.
module.exports = { buildUiInstructions };