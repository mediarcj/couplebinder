# GitHub vs Local Comparison and Fix Report

**Date:** 2025-01-XX  
**Branch:** `fix/compare-github-vs-local-auth`  
**Objective:** Compare working GitHub version with local config-compliance version and fix auth/SSR issues

---

## Executive Summary

**GitHub HEAD:** `ab81bb7` (templates: neutral fallback in footer)  
**Local HEAD:** `ab81bb7` (same commit, but with uncommitted config-compliance changes)

**Key Finding:** The local version has superior logic (config-compliance, `__Host-` cookies, better HTTPS detection), but had a critical bug where `trustProxyIp` middleware was overriding the trust proxy setting from 2 to 1, breaking HTTPS detection.

**Status:** Fixed trust proxy conflict. All other logic is correct and superior to GitHub version.

---

## Comparison Results

### 1. Trust Proxy Configuration

**GitHub Version:**
- Sets `app.set('trust proxy', 1)` once, early in `zorvalon.js`
- Simple, works for single proxy (Cloudflare)

**Local Version:**
- Sets `app.set('trust proxy', config.server.trustProxyHops)` (default: 2) in `zorvalon.js`
- **BUG:** `trustProxyIp` middleware was overriding it to 1 later
- **FIX:** Removed override in `trustProxyIp.js` - now respects config value

**Decision:** Keep local version (config-driven, supports 2 hops for Cloudflare + ALB). Fixed the override bug.

---

### 2. HTTPS Detection

**GitHub Version:**
- No explicit HTTPS detection function
- Uses `req.secure` directly (works when trust proxy is set)
- Always sets `secure: true` on cookies (assumes production is HTTPS)

**Local Version:**
- Has sophisticated `isHttps()` function in `server/lib/authCookie.js`:
  1. Checks `X-Forwarded-Proto: https` (highest priority)
  2. Checks `CF-Visitor: {"scheme":"https"}` (Cloudflare-specific)
  3. Falls back to `req.secure` (Express hint)
- Sets `secure` flag based on detection (respects `config.auth.cookieSecure`)

**Decision:** Keep local version (more robust, handles edge cases). The logic is correct and superior.

---

### 3. Cookie Setting

**GitHub Version:**
- Sets ONE cookie: `res.cookie(COOKIE_NAME, token, { secure: true, ... })`
- Always `secure: true` (hardcoded)
- No `__Host-` cookie support

**Local Version:**
- Sets TWO cookies when HTTPS detected:
  1. Plain cookie (always set, `secure` based on detection)
  2. `__Host-` cookie (only on public HTTPS, more secure)
- Uses centralized `setAuthCookie()` helper
- Respects `config.auth.cookieSecure` override

**Decision:** Keep local version (more secure with `__Host-` cookies, config-driven).

---

### 4. Cookie Reading

**GitHub Version:**
- Checks cookie name from `process.env.AUTH_COOKIE_NAME || 'sb_session'`
- Checks legacy names: `sb-access-token`, `sb_session`
- No `__Host-` prefix checking

**Local Version:**
- Priority order:
  1. `__Host-${cookieName}` (most secure)
  2. `cookieName` (plain)
  3. `sb-access-token` (legacy)
  4. `sb_session` (legacy)
- Uses centralized `AUTH_COOKIE_NAME` from config
- SSR routes are cookie-only (no Bearer header fallback)

**Decision:** Keep local version (checks `__Host-` first, better security, correct fallback).

---

### 5. Nginx Header Forwarding

**GitHub Version:**
- Simple map: `$http_x_forwarded_proto` → `$xfp` (fallback to `$scheme`)
- No Cloudflare `cf-visitor` checking

**Local Version:**
- Sophisticated map chain:
  1. Extract scheme from `cf-visitor` header
  2. Use `x-forwarded-proto` if `cf-visitor` missing
  3. Fallback to `$scheme` (local)
- All locations forward `X-Forwarded-Proto: $xfp`

**Decision:** Keep local version (better Cloudflare support, more robust).

---

### 6. Config Compliance

**GitHub Version:**
- Direct `process.env.*` reads scattered throughout code
- Hardcoded values (e.g., `secure: true`, `trust proxy: 1`)

**Local Version:**
- Centralized config in `server/config/index.js`
- All env reads go through config object
- Type-safe with validation
- Config-driven behavior (e.g., `config.auth.cookieSecure`, `config.server.trustProxyHops`)

**Decision:** Keep local version (required - this is the whole point of the refactor).

---

## Fixes Applied

### Fix 1: Trust Proxy Override Bug

**File:** `server/middleware/trustProxyIp.js`

**Problem:** Middleware was overriding `app.set('trust proxy', config.server.trustProxyHops)` with `app.set('trust proxy', 1)`, breaking HTTPS detection.

**Solution:** Removed the override. Trust proxy is now set once in `zorvalon.js` and respected everywhere.

**Change:**
```javascript
// BEFORE:
app.set('trust proxy', 1);

// AFTER:
// NOTE: trust proxy is set in zorvalon.js before this middleware
// We do NOT override it here - just extract the client IP
```

---

## Files Modified

1. `server/middleware/trustProxyIp.js` - Removed trust proxy override

---

## Files Verified (No Changes Needed)

1. `server/lib/authCookie.js` - HTTPS detection logic is correct
2. `server/middleware/authBridge.js` - Cookie reading priority is correct
3. `server/routes/authCookie.js` - Uses centralized cookie helpers correctly
4. `server/zorvalon.js` - Trust proxy set correctly (before middleware)
5. `nginx/templates/plain.conf` - Header forwarding is correct
6. `nginx/templates/ssl.conf` - Header forwarding is correct

---

## Testing Checklist

### Manual Test Plan

1. **HTTPS Detection:**
   - [ ] Set `AUTH_DEBUG=true` in `.env`
   - [ ] Login via `/auth/set-cookie`
   - [ ] Check logs for `auth.cookie.set.detection` event
   - [ ] Verify `https: true`, `xForwardedProto: 'https'`
   - [ ] Verify both plain and `__Host-` cookies are set

2. **Cookie Reading:**
   - [ ] Visit `/dashboard` after login
   - [ ] Check logs for `auth.cookie.read.attempt` event
   - [ ] Verify cookie is found (either `__Host-` or plain)
   - [ ] Verify no 401 errors

3. **SSR Pages:**
   - [ ] Visit `/` (home page)
   - [ ] Visit `/dashboard`
   - [ ] Verify pages load without 401 errors
   - [ ] Verify `req.user` is populated correctly

4. **Trust Proxy:**
   - [ ] Check that `req.secure` is `true` for HTTPS requests
   - [ ] Verify `req.clientIp` is extracted correctly (not proxy IP)

---

## Regression Safety

**Security:**
- ✅ Trust proxy setting preserved (2 hops for Cloudflare + ALB)
- ✅ HTTPS detection logic unchanged (still checks 3 sources)
- ✅ Cookie security attributes unchanged (`Secure`, `HttpOnly`, `SameSite`)
- ✅ `__Host-` cookie support maintained

**Functionality:**
- ✅ Cookie reading fallback chain unchanged (still checks all variants)
- ✅ SSR routes still cookie-only (no Bearer header)
- ✅ API routes still support Bearer tokens
- ✅ Config-compliance system intact

**No Breaking Changes:**
- All existing cookies will still work (plain cookies are always set)
- `__Host-` cookies are additive (plain cookies are fallback)
- Config values have same defaults as before

---

## Next Steps

1. **Test locally** with `AUTH_DEBUG=true` to verify HTTPS detection
2. **Check browser cookies** after login (should see both plain and `__Host-` cookies)
3. **Test SSR pages** (`/`, `/dashboard`) to verify no 401 errors
4. **Monitor logs** for any auth-related errors

---

## Conclusion

The local version's logic is **superior** to the GitHub version in all areas:
- Better HTTPS detection (3 sources vs 1)
- More secure cookies (`__Host-` support)
- Config-compliance (centralized, type-safe)
- Better Nginx forwarding (Cloudflare-aware)

The only bug was the trust proxy override, which has been fixed. All other logic is correct and should work as expected.

**Laws Check:** OK
- Config-compliance maintained ✅
- Security not weakened ✅
- No hardcoded secrets ✅
- Small, focused change ✅
- Documentation updated ✅

