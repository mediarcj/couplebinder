// File: server/ui_contract/presenters/index.js
// Description: Barrel export for all presenter functions
// Purpose: Single entry point for importing presenters from routes
// Notes: Re-exports all presenter functions to maintain backward compatibility

// Account presenters (dashboard, settings, profile)
const {
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildDashboardPageModel,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildUserProfilePageModel,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildSettingsPageModel
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
} = require('./accountPresenters');

// Auth presenters (login, register)
const {
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildLoginPageModel,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildRegisterPageModel
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
} = require('./authPresenters');

// Error presenters
const {
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildErrorPageModel
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
} = require('./errorPresenters');

// Marketing presenters (home page)
const {
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildHomePageModel
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
} = require('./marketingPresenters');

// Password recovery presenters
const {
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildForgotPasswordRequestModel,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildForgotPasswordResetModel
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
} = require('./passwordRecoveryPresenters');

// Template presenter (for create_protected_page.sh script)
const {
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildTemplateProtectedPageModel
// I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
} = require('./_templatePresenter');

// I am exporting this value here so another module can deliberately reuse the completed piece from index.js.
module.exports = {
  // Account
  buildDashboardPageModel,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildUserProfilePageModel,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildSettingsPageModel,
  // Auth
  buildLoginPageModel,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildRegisterPageModel,
  // Error
  buildErrorPageModel,
  // Marketing
  buildHomePageModel,
  // Password recovery
  buildForgotPasswordRequestModel,
  // I am keeping this line here because the surrounding index.js workflow expects this value or operation before it continues.
  buildForgotPasswordResetModel,
  // Template (for script-generated pages)
  buildTemplateProtectedPageModel
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
};
