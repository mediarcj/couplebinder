# SSR Cookie Authentication Fix

**Date:** 2025-01-XX  
**Branch:** `fix/ssr-cookie-https-detection`  
**Issue:** SSR pages returning 401 after login due to HTTPS detection failure preventing `__Host-` cookie from being set

---

## What Changed

### A. Strengthened HTTPS Detection in Node.js

**File: `server/lib/authCookie.js`**

1. **Updated `isHttps()` function** to check multiple sources in priority order:
   - `X-Forwarded-Proto: https` header (from proxy chain)
   - `CF-Visitor: {"scheme":"https"}` header (Cloudflare)
   - `req.secure` (Express hint when trust proxy is set)

2. **Added debug logging** in `setAuthCookie()` when `AUTH_DEBUG=true`:
   - Logs `publicHost`, `https`, `reqSecure`, `xForwardedProto`, `hostname`
   - Logs `willSetPlain`, `willSetHost`, `plainSecure`
   - Never logs token values (PII-safe)

3. **Exported `isHttps`** for use in canonical host middleware

**File: `server/middleware/authBridge.js`**

- Added debug logging in `readAccessToken()` when `AUTH_DEBUG=true`:
  - Logs cookie presence booleans for all cookie name variants
  - Logs all cookie names present (for debugging)
  - Never logs token values

### B. Bulletproof Nginx Forwarding

**Files: `nginx/templates/plain.conf`, `nginx/templates/ssl.conf`**

- Added Cloudflare-aware `$cf_scheme` map that extracts scheme from `CF-Visitor` header
- Updated `$xfp` map to prefer Cloudflare's scheme hint when present
- Falls back to `X-Forwarded-Proto` or local `$scheme` if Cloudflare header is missing
- All `proxy_set_header X-Forwarded-Proto $xfp;` lines remain unchanged

### C. Canonical Host Middleware (Optional)

**File: `server/zorvalon.js`**

- Added optional canonical host redirect middleware (disabled by default)
- Only active when `CANONICAL_HOST` environment variable is set
- Redirects non-canonical hosts to canonical host with 301
- Uses `isHttps()` to determine correct protocol for redirect

### D. Tests

**File: `server/__tests__/authCookie.test.js` (new)**

- Unit tests for `isHttps()` function:
  - Case A: `x-forwarded-proto: https` → true
  - Case B: `cf-visitor: {"scheme":"https"}` → true
  - Case C: `req.secure=true` → true
  - Case D: None of the above → false
  - Edge cases: comma-separated headers, case-insensitive headers, error handling

**File: `server/__tests__/authFlows.test.js`**

- Added placeholder tests for cookie set + SSR read integration
- Full integration tests require proper JWT mocking (skipped for now)

---

## How to Use

### Enable Debug Logging

Set `AUTH_DEBUG=true` in your environment to see detailed cookie detection and read logs:

```bash
export AUTH_DEBUG=true
npm start
```

Look for log events:
- `auth.cookie.set.detection` - Shows HTTPS detection results during cookie set
- `auth.cookie.read.attempt` - Shows which cookies were found during read
- `auth.cookie.set` - Shows final cookie attributes that were set

### Enable Canonical Host Redirect

If you want to enforce a single canonical host (e.g., always redirect `detechify.com` → `app.detechify.com`):

```bash
export CANONICAL_HOST=app.detechify.com
npm start
```

**Note:** This is disabled by default. Only enable if you need strict host enforcement.

### Production Recommendations

1. **Use SSL Template**: Set `NGINX_USE_SSL=1` in production to use the SSL template with proper origin certificates
2. **Cloudflare Full(Strict)**: Configure Cloudflare to use "Full (Strict)" SSL mode for end-to-end encryption
3. **Verify Headers**: Ensure Cloudflare is sending `X-Forwarded-Proto: https` or `CF-Visitor: {"scheme":"https"}`

---

## Why This Works

1. **Robust HTTPS Detection**: Node.js now recognizes HTTPS reliably behind Cloudflare+Nginx, even when the origin is plaintext
2. **Correct Cookie Attributes**: When the browser is on HTTPS, the plain cookie gets `Secure=true`, and the hardened `__Host-` cookie is also set. SSR will see at least one of them.
3. **Trustworthy Proxy Headers**: Nginx always forwards a trustworthy `X-Forwarded-Proto` using Cloudflare's hint when present
4. **Security Maintained**: We didn't weaken security or widen cookie scope. We only made detection correct and added optional guardrails.

---

## Safety Checklist

- ✅ `trust proxy` is set early (line 150 in `zorvalon.js`)
- ✅ `__Host-` cookie keeps `Path=/`, `Secure`, no `Domain`
- ✅ Plain cookie remains `Path=/`, `SameSite=Lax`, `HttpOnly`, `Secure` when `publicHost && https`
- ✅ No cookie values appear in logs (only booleans and attributes)
- ✅ Nginx continues to send `Host`, `X-Forwarded-For`, and `$xfp`
- ✅ Stripe webhook locations unchanged

---

## Manual Test Plan

1. **Enable Debug Logging:**
   ```bash
   export AUTH_DEBUG=true
   npm start
   ```

2. **Login and Check Logs:**
   - Log in via browser
   - Check server logs for `auth.cookie.set.detection` event
   - Verify `https: true` and `willSetHost: true` when behind Cloudflare

3. **Check Browser Cookies:**
   - Open DevTools → Application → Cookies
   - Verify both `sb_session` and `__Host-sb_session` exist with `Secure` flag
   - Verify `Path=/`, `HttpOnly`, `SameSite=Lax`

4. **Test SSR Access:**
   - Navigate to `/dashboard`
   - Check server logs for `auth.cookie.read.attempt` event
   - Verify `hasHostPrefixed: true` or `hasPlain: true`
   - Confirm dashboard loads (not 401)

5. **Verify Headers:**
   - Check Network tab → Request Headers
   - Verify `Cookie` header includes `sb_session` or `__Host-sb_session`
   - Verify `X-Forwarded-Proto: https` is present (if behind proxy)

---

## Files Changed

- `server/lib/authCookie.js` - HTTPS detection, debug logging, export `isHttps`
- `server/middleware/authBridge.js` - Debug logging for cookie reads
- `server/zorvalon.js` - Canonical host middleware (optional)
- `nginx/templates/plain.conf` - Cloudflare-aware `$xfp` map
- `nginx/templates/ssl.conf` - Cloudflare-aware `$xfp` map
- `server/__tests__/authCookie.test.js` - Unit tests for `isHttps()`
- `server/__tests__/authFlows.test.js` - Placeholder integration tests

---

## Regression Safety

- All existing tests should pass
- No breaking changes to cookie attributes
- No changes to cookie names or paths
- Debug logging is opt-in only (`AUTH_DEBUG=true`)
- Canonical host redirect is opt-in only (`CANONICAL_HOST` env)

