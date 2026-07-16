// File: server/routes/account.js
// Description: Account lifecycle routes (deletion, password changes)
// Notes: Mounted behind requireAuth; all responses honor CSRF + rate limits

const express = require('express');
// I am saving `router` here so the nearby steps can reuse the same value without rebuilding it each time.
const router = express.Router();

// I am loading `../utils/logger` into `logger` so this file can reuse that dependency below.
const logger = require('../utils/logger');
// I am loading `../utils/authz` into `assertUser` so this file can reuse that dependency below.
const { assertUser } = require('../utils/authz');
// I am loading `../utils/supabaseClient` into `supabaseAdmin` so this file can reuse that dependency below.
const { supabaseAdmin, supabase } = require('../utils/supabaseClient');
// I am loading `../lib/authCookie` into `clearAuthCookie` so this file can reuse that dependency below.
const { clearAuthCookie } = require('../lib/authCookie');
// I am loading `../lib/logoutWatermark` into `setLastLogoutNow` so this file can reuse that dependency below.
const { setLastLogoutNow } = require('../lib/logoutWatermark');
// I am loading `../services/outboxService` into `storeEvent` so this file can reuse that dependency below.
const { storeEvent } = require('../services/outboxService');
// I am loading `../middleware/rateLimiter` into `generalLimiter` so this file can reuse that dependency below.
const { generalLimiter } = require('../middleware/rateLimiter');
// I am loading `../middleware/security` into `validatePasswordServerSide` so this file can reuse that dependency below.
const { validatePasswordServerSide } = require('../middleware/security');
// I am loading `../middleware/lockout` into `clearFailedAttempts` so this file can reuse that dependency below.
const { clearFailedAttempts } = require('../middleware/lockout');

// I am keeping `wantsHtml` as a named helper so the surrounding workflow can call this step when it needs it.
function wantsHtml(req) {
  // I am saving `accept` here so the nearby steps can reuse the same value without rebuilding it each time.
  const accept = String(req.headers.accept || '');
  // I am saving `isXHR` here so the nearby steps can reuse the same value without rebuilding it each time.
  const isXHR = req.xhr === true || String(req.headers['x-requested-with'] || '').toLowerCase() === 'xmlhttprequest';
  // This return sends the completed value or response back to the code that called this function.
  return !isXHR && accept.includes('text/html') && !accept.includes('application/json');
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am saving `adminClient` here so the nearby steps can reuse the same value without rebuilding it each time.
  const adminClient = req.app?.locals?.supabaseAdminOverride || supabaseAdmin;
  // I am saving `anonClient` here so the nearby steps can reuse the same value without rebuilding it each time.
  const anonClient = req.app?.locals?.supabaseOverride || supabase;
  // This return sends the completed value or response back to the code that called this function.
  return { adminClient, anonClient };
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
}

// This registers the POST `/delete` route so Express can send matching requests through the handlers listed here.
router.post('/delete', generalLimiter(), async (req, res) => {
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);
    // I am saving `adminClient` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { adminClient } = resolveSupabaseClients(req);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!adminClient) throw new Error('Supabase admin client not configured');

    // I am saving `userId` here so the nearby steps can reuse the same value without rebuilding it each time.
    const userId = user.id;
    // I am saving `email` here so the nearby steps can reuse the same value without rebuilding it each time.
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
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .from('profiles')
      // I am adding this database-query step here so the surrounding service keeps using the same Supabase request chain.
      .delete()
      // I am continuing the existing call chain here so this option stays attached to the same operation started above.
      .eq('user_id', userId);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (profileDelete.error && profileDelete.error.code !== 'PGRST116') {
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error(profileDelete.error.message);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (authDeleteError && authDeleteError.message && !/not found/i.test(authDeleteError.message)) {
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error(authDeleteError.message);
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `outboxStore` here so the nearby steps can reuse the same value without rebuilding it each time.
    const outboxStore = req.app?.locals?.storeEventOverride || storeEvent;
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await outboxStore('user.deleted', { userId, email }, { requestId: req.requestId });
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (eventErr) {
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.warn({ event: 'account.delete.outbox_failed', userId, error: eventErr.message }, 'Failed to store user.deleted outbox event');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await setLastLogoutNow(userId);
    // I am saving `clearCookie` here so the nearby steps can reuse the same value without rebuilding it each time.
    const clearCookie = req.app?.locals?.clearAuthOverride || clearAuthCookie;
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    clearCookie(res, req, true);

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (wantsHtml(req)) {
      // This return sends the completed value or response back to the code that called this function.
      return res.redirect(303, '/?account_deleted=1');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.status(200).json({ ok: true });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.error({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'account.delete.failed',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding account.js workflow expects this value or operation before it continues.
    }, 'Account deletion failed');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (wantsHtml(req)) {
      // This return sends the completed value or response back to the code that called this function.
      return res.redirect(303, '/?account_deleted=0');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.status(400).json({ ok: false, error: error.message || 'Account deletion failed' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
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
  // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
  try {
    // I am saving `user` here so the nearby steps can reuse the same value without rebuilding it each time.
    const user = assertUser(req);
    // I am saving `adminClient` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { adminClient, anonClient } = resolveSupabaseClients(req);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!adminClient || !anonClient) throw new Error('Supabase clients not configured');

    // I am saving `current_password` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { current_password: currentPassword = '', new_password: newPassword = '', confirm_password: confirmPassword = '' } = req.body || {};

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!currentPassword || typeof currentPassword !== 'string') {
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error('Current password is required');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (newPassword !== confirmPassword) {
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error('New passwords do not match');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `validation` here so the nearby steps can reuse the same value without rebuilding it each time.
    const validation = validatePasswordServerSide(newPassword);
    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (!validation.valid) {
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error(validation.error || 'Invalid password');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `data` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { data, error } = await anonClient.auth.signInWithPassword({
      // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
      email: user.email,
      // I am keeping the `password` field in this object so the receiving code can read that value by its expected name.
      password: currentPassword
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (error || !data?.session) {
      // I am stopping this path with the existing error here because the caller should not continue with an invalid result.
      throw new Error('Current password is incorrect');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // Clear lockouts after successful password verification
    // WHY: User proved they know their password (similar to successful login)
    // This prevents lockout from blocking login after password change
    // IMPORTANT: Use same IP extraction as authCookie.js for consistency
    const ip = req.clientIp || req.ip || 'unknown';
    // I am starting a guarded operation here because a request, parser, or dependency used below may fail.
    try {
      // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
      await clearFailedAttempts(user.email, ip);
      // I am calling this helper here so the current workflow performs this step before it moves on.
      logger.info({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'account.password.lockouts_cleared',
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: user.id,
        // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
        email: user.email,
        // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
        ip: ip,
        // I am keeping the `clientIp` field in this object so the receiving code can read that value by its expected name.
        clientIp: req.clientIp || 'not-set',
        // I am keeping the `reqIp` field in this object so the receiving code can read that value by its expected name.
        reqIp: req.ip || 'not-set',
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // I am keeping this line here because the surrounding account.js workflow expects this value or operation before it continues.
      }, 'Cleared account and IP lockouts after successful password verification');
    // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
    } catch (lockoutErr) {
      // Non-fatal: log but continue with password update
      logger.warn({
        // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
        event: 'account.password.lockout_clear_failed',
        // I am keeping the `userId` field in this object so the receiving code can read that value by its expected name.
        userId: user.id,
        // I am keeping the `email` field in this object so the receiving code can read that value by its expected name.
        email: user.email,
        // I am keeping the `ip` field in this object so the receiving code can read that value by its expected name.
        ip: ip,
        // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
        error: lockoutErr.message,
        // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
        requestId: req.requestId
      // I am keeping this line here because the surrounding account.js workflow expects this value or operation before it continues.
      }, 'Failed to clear lockouts after password verification (non-fatal)');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // I am saving `error` here so the nearby steps can reuse the same value without rebuilding it each time.
    const { error: updateError } = await adminClient.auth.admin.updateUserById(user.id, {
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

    // I am waiting for this asynchronous step here so the next line does not use its result before it is ready.
    await setLastLogoutNow(user.id);
    // I am saving `clearCookie` here so the nearby steps can reuse the same value without rebuilding it each time.
    const clearCookie = req.app?.locals?.clearAuthOverride || clearAuthCookie;
    // I am updating or clearing this saved state here so the interface reflects the result of the action above.
    clearCookie(res, req, true);

    // Always redirect to login page with success flag (server handles logout)
    // Client should follow redirect, not perform its own logout
    if (wantsHtml(req)) {
      // This return sends the completed value or response back to the code that called this function.
      return res.redirect(303, '/login?password_changed_success=1');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // For JSON requests, return redirect URL so client can follow it
    return res.status(200).json({ 
      // I am keeping the `ok` field in this object so the receiving code can read that value by its expected name.
      ok: true, 
      // I am keeping the `message` field in this object so the receiving code can read that value by its expected name.
      message: 'Password updated. Please log in again.',
      // I am keeping the `redirect` field in this object so the receiving code can read that value by its expected name.
      redirect: '/login?password_changed_success=1'
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    });
  // I am handling a failure here so this file keeps its existing error response instead of losing the error silently.
  } catch (error) {
    // I am calling this helper here so the current workflow performs this step before it moves on.
    logger.warn({
      // I am keeping the `event` field in this object so the receiving code can read that value by its expected name.
      event: 'account.password.failed',
      // I am keeping the `error` field in this object so the receiving code can read that value by its expected name.
      error: error.message,
      // I am keeping the `requestId` field in this object so the receiving code can read that value by its expected name.
      requestId: req.requestId
    // I am keeping this line here because the surrounding account.js workflow expects this value or operation before it continues.
    }, 'Password change failed');

    // This check helps me choose or stop the next path before any work that depends on this condition runs.
    if (wantsHtml(req)) {
      // This return sends the completed value or response back to the code that called this function.
      return res.redirect(303, '/?password_changed=0');
    // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
    }

    // This return sends the completed value or response back to the code that called this function.
    return res.status(400).json({ ok: false, error: error.message || 'Password update failed' });
  // This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
  }
// This closing line ends the block, list, object, or call that started above so the next step can continue outside it.
});

// I am exporting this value here so another module can deliberately reuse the completed piece from account.js.
module.exports = router;

