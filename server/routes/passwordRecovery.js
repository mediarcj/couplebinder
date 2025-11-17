// File: server/routes/passwordRecovery.js
// Description: Public flows for requesting and completing password resets
// Notes: Stateless routes; rely on Supabase reset link + admin password update

const express = require('express');
const router = express.Router();

const logger = require('../utils/logger');
const { supabase, supabaseAdmin } = require('../utils/supabaseClient');
const { config } = require('../config');
const { buildForgotPasswordRequestModel, buildForgotPasswordResetModel } = require('../ui_contract/presenters');
const { generalLimiter } = require('../middleware/rateLimiter');
const { validateEmailServerSide, validatePasswordServerSide } = require('../middleware/security');
const { verifyToken } = require('../middleware/auth/supabaseJwt');
const { setLastLogoutNow } = require('../lib/logoutWatermark');
const { clearAuthCookie } = require('../lib/authCookie');

const redirectTarget = config.auth?.passwordResetRedirect || '/auth/forgot-password';

function htmlPreferred(req) {
  const accept = String(req.headers.accept || '');
  const wantsHtml = accept.includes('text/html') && !accept.includes('application/json');
  const isXHR = req.xhr === true || String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
  return wantsHtml && !isXHR;
}

router.get('/forgot-password', async (req, res, next) => {
  try {
    const state = req.query.sent === '1' ? 'sent' : 'form';
    const model = await buildForgotPasswordRequestModel(req, res, { state });
    res.render('forgot-password', model);
  } catch (error) {
    next(error);
  }
});

router.post('/forgot-password', generalLimiter(), async (req, res) => {
  try {
    if (!supabase) throw new Error('Supabase client not configured');
    const emailRaw = req.body?.email || '';
    const validation = validateEmailServerSide(emailRaw);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid email address');
    }

    await supabase.auth.resetPasswordForEmail(validation.sanitized, {
      redirectTo: redirectTarget
    });

    if (htmlPreferred(req)) {
      return res.redirect(303, '/forgot-password?sent=1');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.warn({
      event: 'password.reset.request_failed',
      error: error.message,
      requestId: req.requestId
    }, 'Password reset request failed');

    if (htmlPreferred(req)) {
      return res.redirect(303, '/forgot-password?sent=0');
    }

    return res.status(400).json({ ok: false, error: error.message || 'Unable to send reset link' });
  }
});

router.get('/auth/forgot-password', async (req, res, next) => {
  try {
    const model = await buildForgotPasswordResetModel(req, res, { ready: false });
    res.render('forgot-password-reset', model);
  } catch (error) {
    next(error);
  }
});

router.post('/auth/forgot-password', generalLimiter(), async (req, res) => {
  try {
    if (!supabaseAdmin) throw new Error('Supabase admin client not configured');

    const { access_token: accessToken = '', new_password: newPassword = '', confirm_password: confirmPassword = '' } = req.body || {};

    if (!accessToken) throw new Error('Recovery token missing');
    if (newPassword !== confirmPassword) throw new Error('Passwords do not match');

    const validation = validatePasswordServerSide(newPassword);
    if (!validation.valid) throw new Error(validation.error || 'Invalid password');

    const payload = await verifyToken(accessToken);
    const userId = payload?.sub;
    if (!userId) throw new Error('Invalid recovery token');

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (updateError) {
      throw new Error(updateError.message || 'Failed to update password');
    }

    await setLastLogoutNow(userId);
    clearAuthCookie(res, req, true);

    if (htmlPreferred(req)) {
      return res.redirect(303, '/?password_changed=1');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.warn({
      event: 'password.reset.complete_failed',
      error: error.message,
      requestId: req.requestId
    }, 'Password reset completion failed');

    if (htmlPreferred(req)) {
      return res.redirect(303, '/?password_changed=0');
    }

    return res.status(400).json({ ok: false, error: error.message || 'Password reset failed' });
  }
});

module.exports = router;

