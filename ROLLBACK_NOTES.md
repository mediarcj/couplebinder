# Rollback Notes - Logout Re-Authentication Fix

**Branch:** `fix/logout-and-trust-badge`  
**Date:** 2025-01-XX

---

## Summary

This patchset fixes the logout re-authentication bug where users were automatically re-logged in after logout due to Supabase session resurrection. It also completes the trust badge alignment fix for the checkout page.

**Commits to Rollback:**
1. `auth: add configurable logout sentinel TTL and Redis short lock for logout protection`
2. `auth: make auto-hydration opt-in and strengthen localStorage cleanup on logout`

**Trust Badge Fix (Separate):**
Already merged in previous commits:
- `ui: improve checkout trust badge sizing and alignment`
- `ui: remove gap between trust badge and text; align with Total row`
- `ui: reduce trust badge size and adjust column alignment`

---

## Rollback Procedure

### Option 1: Git Revert (Cleanest)

```bash
# Revert both auth commits
git revert --no-edit d35a300
git revert --no-edit 5567768

# Push to main
git push origin main
```

**Pros:** Preserves history, creates revert commits  
**Cons:** More commits in history

---

### Option 2: Manual Config Rollback

If you need partial rollback (keep some fixes):

#### Step 1: Reset Sentinel TTL to 10s

**File:** `server/routes/authCookie.js`

**Find:**
```javascript
const LOGOUT_SENTINEL_MS = parseInt(process.env.AUTH_LOGOUT_SENTINEL_MS || '90000', 10); // 90s default
```

**Replace:**
```javascript
const LOGOUT_SENTINEL_MS = 10_000; // 10s window to avoid race with boot code
```

**Or set env var:**
```bash
# .env
AUTH_LOGOUT_SENTINEL_MS=10000
```

---

#### Step 2: Remove Redis Short Lock

**File:** `server/routes/authCookie.js`

**Remove these blocks:**
1. Redis client setup (lines 27-36):
```javascript
// DELETE THIS BLOCK:
// ============================================================
// Redis Client Setup
// ============================================================
let redis = null;
try {
  const { client } = require('../utils/redisClient');
  redis = client;
} catch {
  // No Redis available, Redis-based locks will be disabled
}
```

2. Redis lock set in `/auth/clear-cookie` (lines 274-289):
```javascript
// DELETE THIS BLOCK:
// ============================================================
// Set server-side Redis lock for extra protection
// ============================================================
const ip = req.clientIp || req.ip || 'unknown';
const lockKey = `lock:logout:ip:${ip}`;
const lockTTLSeconds = Math.floor(LOGOUT_SENTINEL_MS / 1000);

if (redis && lockTTLSeconds > 0) {
  redis.set(lockKey, '1', { EX: lockTTLSeconds }).catch((err) => {
    logger.warn({
      event: 'auth.clear_cookie.redis_lock_failed',
      error: err.message,
      requestId: req.requestId
    }, 'Failed to set Redis logout lock');
  });
}
```

3. Redis lock check in `/auth/set-cookie` (lines 98-132):
```javascript
// DELETE THIS BLOCK:
/**
 * WHAT:
 * Check for server-side Redis lock from recent logout.
 * 
 * WHY:
 * Double-check even if cookie is missing (defense in depth).
 * Handles edge cases where cookie expires but lock is still active.
 * 
 * HOW:
 * Check Redis key lock:logout:ip:<ip> for active lockout.
 * Return 204 if lock exists.
 */
const ip = req.clientIp || req.ip || 'unknown';
const lockKey = `lock:logout:ip:${ip}`;

if (redis) {
  try {
    const isLocked = await redis.exists(lockKey);
    if (isLocked === 1) {
      logger.info({
        event: 'auth.set_cookie.denied_by_redis_lock',
        requestId: req.requestId
      }, 'Re-authentication blocked - Redis logout lock active');
      res.set('X-Auth-Sentinel', 'active');
      return res.status(204).end();
    }
  } catch (err) {
    // Non-fatal: continue if Redis check fails
    logger.warn({
      event: 'auth.set_cookie.redis_lock_check_failed',
      error: err.message,
      requestId: req.requestId
    }, 'Failed to check Redis logout lock');
  }
}
```

**Note:** Also remove the duplicate `ip` extraction if present (keep only the one in lockout check section).

---

#### Step 3: Revert Opt-In Hydration

**File:** `server/public/js/main.js`

**Find:**
```javascript
async function checkSessionStatus() {
    try {
        // OPT-IN CHECK: Only run hydration if page explicitly opts in
        const shouldHydrate = document.body?.dataset?.authHydrate === 'true' || 
                             document.querySelector('meta[name="auth-hydrate"]')?.content === 'true';
        
        if (!shouldHydrate) {
            logger.info('Session hydration skipped - page did not opt in');
            return;
        }
        
        // Check for logout sentinel before attempting re-hydration
```

**Replace:**
```javascript
async function checkSessionStatus() {
    try {
        // Check for logout sentinel before attempting re-hydration
```

**File:** `server/public/js/logout.js`

**Find:**
```javascript
    // 2b) Explicitly remove all Supabase localStorage keys as safety net
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch {}
      });
      if (keysToRemove.length > 0) {
        logoutLogger.info('Explicitly cleared Supabase localStorage keys:', keysToRemove);
      }
    } catch (e) {
      logoutLogger.info('Failed to clear Supabase localStorage (non-fatal)', { error: e?.message || String(e) });
    }
```

**Delete this entire block.**

---

#### Step 4: Remove Opt-In Attributes from Templates

**Files:**
- `server/ejs/dashboard.ejs`
- `server/ejs/checkout-review.ejs`
- `server/ejs/billing.ejs`
- `server/ejs/profile-edit.ejs`
- `server/ejs/purchase-confirmation.ejs`
- `server/ejs/receipt.ejs`

**Find:**
```html
<body data-auth-hydrate="true">
```

**Replace:**
```html
<body>
```

---

### Option 3: Keep Only Trust Badge Fixes

If you want to keep trust badge alignment but rollback auth fixes:

```bash
# Revert only auth commits
git revert --no-edit d35a300  # Auto-hydration opt-in
git revert --no-edit 5567768  # Sentinel + Redis lock

# Keep trust badge commits (already merged)
git push origin main
```

---

## Environment Variables to Add/Remove

### Remove (if added):

```bash
# Remove from .env
AUTH_LOGOUT_SENTINEL_MS=90000
```

### Keep:

No new env vars required (uses defaults).

---

## Redis Cleanup (if needed)

If Redis locks were created and you want to clean them up:

```bash
redis-cli
> KEYS lock:logout:ip:*
> DEL lock:logout:ip:*
```

**Note:** Locks auto-expire after TTL (90s by default), but manual cleanup is safe.

---

## Verification After Rollback

### 1. Auth Flow

**Test:**
- Login → Logout → Navigate immediately
- **Expected:** Possible re-login bug returns (user may be re-authenticated within 10s)

### 2. Session Hydration

**Test:**
- Refresh `/dashboard` while logged in
- **Expected:** Session hydrates automatically on all pages (old behavior)

### 3. localStorage Cleanup

**Test:**
- Login → Check localStorage for `sb-*` keys
- Logout → Check localStorage again
- **Expected:** `sb-*` keys may persist if `signOut()` fails (old behavior)

---

## Risk Assessment

**Rollback Risk:** Low
- Pure removal of new code
- No database schema changes
- No infrastructure changes
- Reverts to known working state (with old bug)

**Rollback Time:** < 5 minutes
- Git revert: ~30 seconds
- Manual rollback: 3-5 minutes (depending on step chosen)

---

## Alternative: Partial Rollback Options

### Keep Sentinel, Remove Redis

If Redis is unreliable but sentinel cookie works:
- Keep: `LOGOUT_SENTINEL_MS` env var
- Keep: Cookie sentinel check
- Remove: Redis client import and lock checks

### Keep Opt-In, Remove localStorage Cleanup

If aggressive cleanup causes issues:
- Keep: Opt-in hydration flag
- Remove: Explicit localStorage key removal loop

### Keep Everything, Shorten Sentinel

If 90s is too long:
```bash
# .env
AUTH_LOGOUT_SENTINEL_MS=15000  # 15s instead of 90s
```

---

## Support

**Questions?** Check:
- `LOGOUT_RE_AUTH_ANALYSIS.md` (original bug report)
- `LOGOUT_RE_AUTH_FIX_TESTLOG.md` (test results)

**Need help?** Contact development team with:
- Git commit hashes
- Specific rollback step
- Error messages (if any)

---

**Rollback notes created:** 2025-01-XX  
**Status:** Ready for emergency use  
**Last updated:** 2025-01-XX

