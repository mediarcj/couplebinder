// File: server/routes/passwordRecovery.js
// Description: Public flows for requesting and completing password resets
// Notes: Stateless routes; rely on Supabase reset link + admin password update

const express = require('express');
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();

// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../utils/supabaseClient` into `supabase` so this file can reuse that dependency below.
const { supabase, supabaseAdmin } = require('../utils/supabaseClient');
// I am loading `../config` into `config` so this file can reuse that dependency below.
const { config } = require('../config');
// I am loading `../ui_contract/presenters` into `buildForgotPasswordRequestModel` so this file can reuse that dependency below.
const { buildForgotPasswordRequestModel, buildForgotPasswordResetModel } = require('../ui_contract/presenters');
// I am loading `../middleware/rateLimiter` into `generalLimiter` so this file can reuse that dependency below.
const { generalLimiter } = require('../middleware/rateLimiter');
// I am loading `../middleware/security` into `validateEmailServerSide` so this file can reuse that dependency below.
const { validateEmailServerSide, validatePasswordServerSide } = require('../middleware/security');
// I am loading `../middleware/auth/supabaseJwt` into `verifyToken` so this file can reuse that dependency below.
const { verifyToken } = require('../middleware/auth/supabaseJwt');
// I am loading `../lib/logoutWatermark` into `setLastLogoutNow` so this file can reuse that dependency below.
const { setLastLogoutNow } = require('../lib/logoutWatermark');
// I am loading `../lib/authCookie` into `clearAuthCookie` so this file can reuse that dependency below.
const { clearAuthCookie } = require('../lib/authCookie');
// I am loading `../lib/turnstile` into `verifyTurnstileRequest` so this file can reuse that dependency below.
const { verifyTurnstileRequest } = require('../lib/turnstile');

// I am saving `redirectTarget` here so the nearby steps can reuse the same value without rebuilding it each time.
const redirectTarget = config.auth?.passwordResetRedirect || '/auth/forgot-password';

// I am keeping `htmlPreferred` as a named helper so the surrounding workflow can call this step when it needs it.
function htmlPreferred(req) {
  // The same endpoints serve normal form posts and fetch/API clients. XHR callers should
  // receive JSON even when a browser includes text/html in a broad Accept header.
  const accept = String(req.headers.accept || '');
  // I am saving `wantsHtml` here so the nearby steps can reuse the same value without rebuilding it each time.
  const wantsHtml = accept.includes('text/html') && !accept.includes('application/json');
  // I am saving `isXHR` here so the nearby steps can reuse the same value without rebuilding it each time.
  const isXHR = req.xhr === true || String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
  // This return sends the completed value or response back to the code that called this function.
  return wantsHtml && !isXHR;
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// This registers the GET `/forgot-password` route so Express can send matching requests through the handlers listed here.
router.get('/forgot-password', async (req, res, next) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `state` here so the nearby steps can reuse the same value without rebuilding it each time.
    let state = 'form';
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (req.query.error === '1') {
      // I am keeping this line here because the surrounding passwordRecovery.js workflow expects this value or operation before it continues.
      state = 'error';
    // I am checking this next possibility only because the earlier condition did not choose its path.
    } else if (req.query.sent === '1') {
      // I am keeping this line here because the surrounding passwordRecovery.js workflow expects this value or operation before it continues.
      state = 'sent';
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am saving `options` here so the nearby steps can reuse the same value without rebuilding it each time.
    const options = { state };
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (state === 'error') {
      // I am keeping this line here because the surrounding passwordRecovery.js workflow expects this value or operation before it continues.
      options.message = req.query.message === 'verification'
        // I am keeping this line here because the surrounding passwordRecovery.js workflow expects this value or operation before it continues.
        ? 'Please complete the verification challenge.'
        // I am keeping this line here because the surrounding passwordRecovery.js workflow expects this value or operation before it continues.
        : 'Something went wrong. Please try again.';
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }
    // I am saving `model` here so the nearby steps can reuse the same value without rebuilding it each time.
    const model = await buildForgotPasswordRequestModel(req, res, options);
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.render('forgot-password', model);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next(error);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// This registers the POST `/forgot-password` route so Express can send matching requests through the handlers listed here.
router.post('/forgot-password', generalLimiter(), async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // Password reset is public and can trigger email, so require the challenge even
    // though Turnstile remains optional for routes that call the shared helper generally.
    const turnstileCheck = await verifyTurnstileRequest(req, {
      // I am keeping the `intent` field in this object so the receiving code can read that value by its expected name.
      intent: 'forgot-password',
      // I am keeping the `enforce` field in this object so the receiving code can read that value by its expected name.
      enforce: true
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!turnstileCheck.ok) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'password.reset.turnstile_denied',
        // I am keeping the `code` field in this object so the receiving code can read that value by its expected name.
        code: turnstileCheck.code,
        // I am keeping the `errors` field in this object so the receiving code can read that value by its expected name.
        errors: turnstileCheck.errors,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // I am keeping this line here because the surrounding passwordRecovery.js workflow expects this value or operation before it continues.
      }, 'Turnstile verification failed for password reset request');

      // This check helps me choose or stop the next path before any work that depends on this condition runs.
      if (htmlPreferred(req)) {
        // Turnstile failed → show the verification-specific message
        return res.redirect(303, '/forgot-password?error=1&message=verification');
      // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
      }

      // This return sends the completed value or response back to the code that called this function.
      return res.status(400).json({ ok: false, error: 'Verification failed. Please try again.' });
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!supabase) throw new Error('Supabase client not configured');
    // I am saving `emailRaw` here so the nearby steps can reuse the same value without rebuilding it each time.
    const emailRaw = req.body?.email || '';
    // I am saving `validation` here so the nearby steps can reuse the same value without rebuilding it each time.
    const validation = validateEmailServerSide(emailRaw);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!validation.valid) {
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error(validation.error || 'Invalid email address');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await supabase.auth.resetPasswordForEmail(validation.sanitized, {
      // I am keeping the `redirectTo` field in this object so the receiving code can read that value by its expected name.
      redirectTo: redirectTarget
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (htmlPreferred(req)) {
      // This return sends the completed value or response back to the code that called this function.
      return res.redirect(303, '/forgot-password?sent=1');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.status(200).json({ ok: true });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'password.reset.request_failed',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding passwordRecovery.js workflow expects this value or operation before it continues.
    }, 'Password reset request failed');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (htmlPreferred(req)) {
      // Generic failure (Supabase / validation / unexpected error) → generic message
      return res.redirect(303, '/forgot-password?error=1');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.status(400).json({ ok: false, error: error.message || 'Unable to send reset link' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// This registers the GET `/auth/forgot-password` route so Express can send matching requests through the handlers listed here.
router.get('/auth/forgot-password', async (req, res, next) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `model` here so the nearby steps can reuse the same value without rebuilding it each time.
    const model = await buildForgotPasswordResetModel(req, res, { ready: false });
    // I am building or sending the Express response here with the status, data, or page already chosen by this route.
    res.render('forgot-password-reset', model);
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    next(error);
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// This registers the POST `/auth/forgot-password` route so Express can send matching requests through the handlers listed here.
router.post('/auth/forgot-password', generalLimiter(), async (req, res) => {
  // The reset completion flow validates password policy, verifies recovery identity, then
  // invalidates older sessions after Supabase accepts the new password.
  try {
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!supabaseAdmin) throw new Error('Supabase admin client not configured');

    // I am saving `access_token` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { access_token: accessToken = '', new_password: newPassword = '', confirm_password: confirmPassword = '' } = req.body || {};

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!accessToken) throw new Error('Recovery token missing');
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (newPassword !== confirmPassword) throw new Error('Passwords do not match');

    // I am saving `validation` here so the nearby steps can reuse the same value without rebuilding it each time.
    const validation = validatePasswordServerSide(newPassword);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!validation.valid) throw new Error(validation.error || 'Invalid password');

    // Trust the user id only after server-side JWT verification. The posted token came
    // from the recovery redirect and must not be treated as an identity claim by itself.
    const payload = await verifyToken(accessToken);
    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const userId = payload?.sub;
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!userId) throw new Error('Invalid recovery token');

    // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      // I am keeping the `password` field in this object so the receiving code can read that value by its expected name.
      password: newPassword
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (updateError) {
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error(updateError.message || 'Failed to update password');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // A password change should also retire older authentication state. The watermark
    // blocks stale-token rehydration and the cookie cleanup removes this browser's copy.
    await setLastLogoutNow(userId);
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    clearAuthCookie(res, req, true);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (htmlPreferred(req)) {
      // This return sends the completed value or response back to the code that called this function.
      return res.redirect(303, '/login?password_changed_success=1');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.status(200).json({ ok: true });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'password.reset.complete_failed',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding passwordRecovery.js workflow expects this value or operation before it continues.
    }, 'Password reset completion failed');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (htmlPreferred(req)) {
      // This return sends the completed value or response back to the code that called this function.
      return res.redirect(303, '/login?password_changed_success=0');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.status(400).json({ ok: false, error: error.message || 'Password reset failed' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am exporting this value here so another module can deliberately reuse the completed piece from passwordRecovery.js.
module.exports = router;
