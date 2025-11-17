// File: server/routes/account.js
// Description: Account lifecycle routes (deletion, password changes)
// Notes: Mounted behind requireAuth; all responses honor CSRF + rate limits

const express = require('express');
const router = express.Router();

const logger = require('../utils/logger');
const { assertUser } = require('../utils/authz');
const { supabaseAdmin, supabase } = require('../utils/supabaseClient');
const { clearAuthCookie } = require('../lib/authCookie');
const { setLastLogoutNow } = require('../lib/logoutWatermark');
const { storeEvent } = require('../services/outboxService');
const { generalLimiter } = require('../middleware/rateLimiter');
const { validatePasswordServerSide } = require('../middleware/security');

function wantsHtml(req) {
  const accept = String(req.headers.accept || '');
  const isXHR = req.xhr === true || String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
  return !isXHR && accept.includes('text/html') && !accept.includes('application/json');
}

/**
 * WHAT:
 * Resolve Supabase clients, allowing app-level overrides for tests or multi-tenant setups.
 *
 * WHY:
 * Keeps production logic simple while letting tests inject deterministic clients.
 *
 * HOW:
 * Check req.app.locals for overrides; fall back to shared clients from supabaseClient.js.
 */
function resolveSupabaseClients(req) {
  const adminClient = req.app?.locals?.supabaseAdminOverride || supabaseAdmin;
  const anonClient = req.app?.locals?.supabaseOverride || supabase;
  return { adminClient, anonClient };
}

router.post('/delete', generalLimiter(), async (req, res) => {
  try {
    const user = assertUser(req);
    const { adminClient } = resolveSupabaseClients(req);
    if (!adminClient) throw new Error('Supabase admin client not configured');

    const userId = user.id;
    const email = user.email || null;

    /**
     * CRITICAL SECTION: Remove user data + auth identity atomically enough for multi-instance safety.
     *
     * WHAT:
     * Delete profile row and Supabase auth user for the current user.
     *
     * WHY:
     * Prevent orphaned data or race conditions where stale tokens still work.
     *
     * HOW:
     * Run deletes sequentially with idempotent handling; if either fails we abort and report.
     */
    const profileDelete = await adminClient
      .from('profiles')
      .delete()
      .eq('user_id', userId);

    if (profileDelete.error && profileDelete.error.code !== 'PGRST116') {
      throw new Error(profileDelete.error.message);
    }

    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (authDeleteError && authDeleteError.message && !/not found/i.test(authDeleteError.message)) {
      throw new Error(authDeleteError.message);
    }

    const outboxStore = req.app?.locals?.storeEventOverride || storeEvent;
    try {
      await outboxStore('user.deleted', { userId, email }, { requestId: req.requestId });
    } catch (eventErr) {
      logger.warn({ event: 'account.delete.outbox_failed', userId, error: eventErr.message }, 'Failed to store user.deleted outbox event');
    }

    await setLastLogoutNow(userId);
    const clearCookie = req.app?.locals?.clearAuthOverride || clearAuthCookie;
    clearCookie(res, req, true);

    if (wantsHtml(req)) {
      return res.redirect(303, '/?account_deleted=1');
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    logger.error({
      event: 'account.delete.failed',
      error: error.message,
      requestId: req.requestId
    }, 'Account deletion failed');

    if (wantsHtml(req)) {
      return res.redirect(303, '/?account_deleted=0');
    }

    return res.status(400).json({ ok: false, error: error.message || 'Account deletion failed' });
  }
});

/**
 * POST /account/password
 *
 * WHAT:
 * Change password for the authenticated user after verifying the current password.
 *
 * WHY:
 * Keep password updates server-authoritative and force logout on success.
 *
 * HOW:
 * - Validate payload
 * - Use user email + current password to verify via Supabase client
 * - Update password through admin API
 * - Clear cookies and redirect to homepage with flash message
 */
router.post('/password', generalLimiter(), async (req, res) => {
  try {
    const user = assertUser(req);
    const { adminClient, anonClient } = resolveSupabaseClients(req);
    if (!adminClient || !anonClient) throw new Error('Supabase clients not configured');

    const { current_password: currentPassword = '', new_password: newPassword = '', confirm_password: confirmPassword = '' } = req.body || {};

    if (!currentPassword || typeof currentPassword !== 'string') {
      throw new Error('Current password is required');
    }

    if (newPassword !== confirmPassword) {
      throw new Error('New passwords do not match');
    }

    const validation = validatePasswordServerSide(newPassword);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid password');
    }

    const { data, error } = await anonClient.auth.signInWithPassword({
      email: user.email,
      password: currentPassword
    });

    if (error || !data?.session) {
      throw new Error('Current password is incorrect');
    }

    const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
      password: newPassword
    });

    if (updateError) {
      throw new Error(updateError.message || 'Failed to update password');
    }

    await setLastLogoutNow(user.id);
    const clearCookie = req.app?.locals?.clearAuthOverride || clearAuthCookie;
    clearCookie(res, req, true);

    if (wantsHtml(req)) {
      return res.redirect(303, '/?password_changed=1');
    }

    return res.status(200).json({ ok: true, message: 'Password updated. Please log in again.' });
  } catch (error) {
    logger.warn({
      event: 'account.password.failed',
      error: error.message,
      requestId: req.requestId
    }, 'Password change failed');

    if (wantsHtml(req)) {
      return res.redirect(303, '/?password_changed=0');
    }

    return res.status(400).json({ ok: false, error: error.message || 'Password update failed' });
  }
});

module.exports = router;

