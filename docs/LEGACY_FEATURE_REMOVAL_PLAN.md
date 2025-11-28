# Legacy Feature Removal Plan

**Date:** 2025-01-27  
**Status:** Monitoring phase - removal deferred until usage data available  
**Purpose:** Document removal conditions and steps for legacy features that are intentionally kept for migration safety

---

## Overview

This document outlines the removal plan for legacy features that are currently kept for backward compatibility. All legacy features have monitoring hooks in place to track usage. Removal will be scheduled based on usage data or explicit migration decisions.

---

## 1. Legacy Static File Path

### Current State

**Location:** `server/zorvalon.js`  
**Pattern:** Dual static file serving
- **Primary:** `/public` (repo root)
- **Legacy:** `/server/public` (back-compat)

**Monitoring Event:** `legacy.static_path_used`

### Removal Conditions

**Option A - Usage-Based:**
- Monitoring shows zero `legacy.static_path_used` events for an agreed period (e.g., 30-60 days in production)
- No active bookmarks or external references to `/server/public/*` assets

**Option B - Explicit Decision:**
- Team decides there are no legacy clients or bookmarks
- All assets have been migrated to `/public`

### Removal Steps

1. **Remove legacy static mount:**
   ```javascript
   // Remove this line:
   app.use(express.static(PUBLIC_DIR_LEGACY, {...}));
   ```

2. **Remove from mountStatic function:**
   ```javascript
   // Remove legacy mount from mountStatic() function
   ```

3. **Remove PUBLIC_DIR_LEGACY constant:**
   ```javascript
   // Remove: const PUBLIC_DIR_LEGACY = path.resolve(__dirname, 'public');
   ```

4. **Test:**
   - Verify all static assets still load from primary path
   - Check for any broken asset references
   - Run full test suite

5. **Deploy:**
   - Deploy to staging first
   - Monitor for 404s on static assets
   - Deploy to production after verification

### Rollback Plan

If issues arise:
- Re-add legacy static mount
- Investigate which assets are missing
- Add 301 redirects if needed: `/server/public/*` → `/public/*`

---

## 2. Legacy Cookie Names

### Current State

**Location:** `server/lib/authCookie.js`, `server/middleware/authBridge.js`  
**Pattern:** Support for old cookie names alongside new `__Host-` prefixed cookies
- **Legacy names:** `sb-access-token`, `sb_session`
- **Current name:** `__Host-sb_session` (production) or `sb_session` (dev)

**Monitoring Event:** `legacy.cookie_used`

### Removal Conditions

**Option A - Usage-Based:**
- Monitoring shows zero `legacy.cookie_used` events for an agreed period (e.g., 30-60 days in production)
- All clients have been updated to use new cookie format

**Option B - Explicit Decision:**
- Team decides to drop support in a major version
- All known clients have been notified and migrated

### Removal Steps

1. **Remove legacy cookie reads from authBridge.js:**
   ```javascript
   // Remove these fallbacks:
   || req.cookies?.['sb-access-token']
   || req.cookies?.['sb_session']
   ```

2. **Remove legacy cookie clearing from authCookie.js:**
   ```javascript
   // Remove legacy names from clearAuthCookie() function:
   'sb-access-token',
   'sb_session',
   ```

3. **Update documentation:**
   - Remove references to legacy cookie names
   - Update client migration guides

4. **Test:**
   - Verify new cookies still work
   - Test logout clears current cookies
   - Run full test suite

5. **Deploy:**
   - Deploy to staging first
   - Monitor for authentication issues
   - Deploy to production after verification

### Rollback Plan

If issues arise:
- Re-add legacy cookie fallbacks
- Investigate which clients are affected
- Provide migration guide for clients

---

## 3. Legacy Login Endpoint

### Current State

**Location:** `server/routes/auth.js`  
**Pattern:** `POST /api/auth/login` endpoint
- **Status:** Deprecated, returns 400/404
- **Guard:** Controlled by `ALLOW_LEGACY_LOGIN` env var (default: false)

**Monitoring Event:** `legacy.login_endpoint_used`

### Removal Conditions

**Option A - Usage-Based:**
- Monitoring shows zero `legacy.login_endpoint_used` events for an agreed period (e.g., 30-60 days in production)
- No API clients are using this endpoint

**Option B - Explicit Decision:**
- Team decides to hard-cut old API clients
- All known API consumers have been notified

### Removal Steps

1. **Remove route handler:**
   ```javascript
   // Remove entire router.post('/login', ...) block
   ```

2. **Add explicit 404 handler (optional):**
   ```javascript
   router.post('/login', (req, res) => {
     res.status(410).json({
       error: 'This endpoint has been removed. Please use Supabase Auth.',
       migrationGuide: 'https://docs.example.com/migration'
     });
   });
   ```

3. **Update API documentation:**
   - Remove endpoint from docs
   - Add migration guide link

4. **Test:**
   - Verify endpoint returns 410/404
   - Test that Supabase Auth still works
   - Run full test suite

5. **Deploy:**
   - Deploy to staging first
   - Monitor for API client errors
   - Deploy to production after verification

### Rollback Plan

If issues arise:
- Re-add route handler (returning deprecation message)
- Investigate which API clients are affected
- Provide migration guide

---

## 4. Monitoring and Decision Making

### Current Monitoring

All legacy features now log structured events:
- `legacy.static_path_used` - When legacy static assets are served
- `legacy.cookie_used` - When legacy cookies are accepted
- `legacy.login_endpoint_used` - When legacy login endpoint is called

### Decision Process

1. **Review logs regularly:**
   - Check for legacy usage events in production logs
   - Track usage trends over time

2. **Set removal timeline:**
   - If usage is zero for 30-60 days: schedule removal
   - If usage is low but consistent: plan migration, then remove
   - If usage is high: keep until migration complete

3. **Communicate removal:**
   - Announce removal timeline (e.g., "Legacy feature X will be removed in v2.0")
   - Provide migration guides
   - Give reasonable notice period (e.g., 3-6 months)

4. **Execute removal:**
   - Follow removal steps above
   - Monitor closely after deployment
   - Have rollback plan ready

---

## 5. Removal Priority

### Low Priority (Safe to Remove Soon)
- Legacy static paths (if monitoring shows zero usage)

### Medium Priority (Requires Client Migration)
- Legacy cookies (requires all clients to update)
- Legacy login endpoint (requires all API clients to migrate)

### High Priority (Requires Careful Planning)
- None currently - all legacy features are low/medium risk

---

## 6. Notes

- **No automatic removal:** All removals require explicit decision and monitoring period
- **Migration safety first:** Legacy features are kept until we're confident they're unused
- **Clear communication:** Always announce removals in advance
- **Rollback ready:** Always have a rollback plan

---

**Next Steps:** Monitor usage for 30-60 days, then schedule removals based on data.

