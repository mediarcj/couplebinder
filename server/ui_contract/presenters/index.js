// Description: Barrel export for all presenter functions
// Purpose: Single entry point for importing presenters from routes
// Notes: Re-exports all presenter functions to maintain backward compatibility

// Account presenters (dashboard, settings, profile)
const {
  buildDashboardPageModel,
  buildUserProfilePageModel,
  buildSettingsPageModel
} = require('./accountPresenters');

// Auth presenters (login, register)
const {
  buildLoginPageModel,
  buildRegisterPageModel
} = require('./authPresenters');

// Error presenters
const {
  buildErrorPageModel
} = require('./errorPresenters');

// Marketing presenters (home page)
const {
  buildHomePageModel
} = require('./marketingPresenters');

// Password recovery presenters
const {
  buildForgotPasswordRequestModel,
  buildForgotPasswordResetModel
} = require('./passwordRecoveryPresenters');

// Template presenter (for create_protected_page.sh script)
const {
  buildTemplateProtectedPageModel
} = require('./_templatePresenter');

module.exports = {
  // Account
  buildDashboardPageModel,
  buildUserProfilePageModel,
  buildSettingsPageModel,
  // Auth
  buildLoginPageModel,
  buildRegisterPageModel,
  // Error
  buildErrorPageModel,
  // Marketing
  buildHomePageModel,
  // Password recovery
  buildForgotPasswordRequestModel,
  buildForgotPasswordResetModel,
  // Template (for script-generated pages)
  buildTemplateProtectedPageModel
};
