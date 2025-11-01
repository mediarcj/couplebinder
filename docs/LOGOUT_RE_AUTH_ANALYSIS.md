# Logout Re-Authentication Bug - Full Analysis Report

**Date:** 2025-01-XX  
**Issue:** User logs out, but is immediately re-authenticated without explicit login  
**Status:** Analysis complete - ready for fix strategy review

---

## EXECUTIVE SUMMARY

**Root Cause:** `checkSessionStatus()` in `main.js` automatically re-hydrates server auth cookie from Supabase localStorage session on page load. Logout clears server cookie but leaves Supabase session alive, causing immediate re-login.

**Key Finding:** The 10-second `auth_logout` sentinel blocks re-auth, but if user navigates away and returns after 10s, the re-login race reappears.

---

## A. SERVER-SIDE LOGOUT AND COOKIE FLOW

### 1. POST /auth/clear-cookie

**File:** `server/routes/authCookie.js`  
**Function:** `router.post('/clear-cookie', ...)` (line 238)  
**Line:** 238-304

**What it clears:**
- Cookie names: `__Host-sb_session`, `COOKIE_NAME` (env-driven, default `sb_session`), legacy `sb-access-token`, `sb_session`
- Attributes: HttpOnly, Secure, SameSite=Lax, Path=/
- Domain: Omitted for `__Host-` prefixes (spec requirement)

**Client instructions:**
- Sets `auth_logout=1` sentinel cookie (not HttpOnly, readable by JS, 10s TTL)
- Redirects HTML requests to `/?logged_out=1`
- Returns JSON `{ok: true}` for programmatic callers

**Documentation:** Comments explain legacy cookie cleanup, content negotiation, and sentinel purpose (lines 221-237, 253-260).

---

### 2. POST /auth/set-cookie

**File:** `server/routes/authCookie.js`  
**Function:** `router.post('/set-cookie', async ...)` (line 60)  
**Line:** 60-216

**Credentials accepted:**
- Authorization header: `Bearer <token>`
- Verifies token via `verifyToken()` (JWT signature + claims check)

**Cookie issued:**
- Name: `COOKIE_NAME` (env-driven, default `sb_session`)
- Attributes: HttpOnly=true, Secure=true, SameSite=Lax, Path=/, MaxAge=7 days
- Domain: Omitted if cookie name starts with `__Host-` (line 180-183)

**Re-auth blocking:**
- Checks for `auth_logout=1` cookie (lines 77-84)
- Returns 204 if sentinel active
- Client retries with backoff (6x, 1200ms delay) - see `postAuthCookieWithBackoff()` in main.js (line 784)

**Documentation:** Security notes on JWT verification, lockout checks, and sentinel logic (lines 65-84).

---

### 3. Auth Middleware

**File:** `server/middleware/authBridge.js`  
**Export:** `module.exports = async function authBridge(req, res, next)` (line 79)

**Token reading:**
- Priority 1: Cookie `AUTH_COOKIE_NAME` (or legacy `sb-access-token`, `sb_session`) - line 46-52
- Priority 2: Bearer header - line 53-58

**User attachment:**
- Sets `req.user = {id, email, role, app_metadata, user_metadata}` on success (line 165-171)
- Sets `req.user = null` on failure and continues (line 100-102)

**Routes using auth:**
- `requireAuth.js` - Protected page routes (line 57)
- `requireOwner.js` - Owner-only resources
- `requireAuthByDefault.js` - Default-deny prefixes

---

## B. CLIENT-SIDE SESSION SOURCES

### 1. Auto session re-hydration (PRIMARY CULPRIT)

**File:** `server/public/js/main.js`  
**Function:** `checkSessionStatus()` (line 852)  
**Location:** Called via `onSBReady(() => checkSessionStatus())` on page load (line 320-322)

**When it runs:**
- DOMContentLoaded → `onSBReady()` → `checkSessionStatus()` (line 198-322)
- Every page load on homepage

**What it does:**
1. Checks `sessionStorage.justLoggedOut` and `auth_logout` cookie (lines 856-862)
2. Gets Supabase session via `getSessionSafe()` → `client.auth.getSession()` (line 872)
3. If session exists: POSTs to `/auth/set-cookie` with `Authorization: Bearer <token>` (lines 897-900)
4. If server accepts: Updates UI to logged-in state (lines 902-912)
5. If server rejects: Clears Supabase session and shows logged-out (lines 916-919)

**Protections in place:**
- Checks `logoutHoldActive()` - localStorage flag from logout.js (lines 875-885)
- Checks `auth_logout` sentinel cookie (line 856)
- Checks `sessionStorage.justLoggedOut` (line 856)

**Issue:** `logoutHoldActive()` is cleared after logout completes (line 878). If user navigates to a new page after the 10s sentinel expires, Supabase session still exists in localStorage, and `checkSessionStatus()` re-hydrates.

---

### 2. Supabase client initialization

**File:** `server/public/js/sbClient.js`  
**Function:** `initSharedSupabase()` (line 21)  
**Purpose:** Creates singleton `window.SB`

**Initialization:**
- Reads config from `<meta id="app-config" data-supabase-url=...>` (lines 33-35)
- Creates `window.SB = window.supabase.createClient(url, key)` (line 43)
- Emits `sb-ready` event (line 46)

**Persistence:**
- Supabase uses `localStorage` by default
- Key format: `sb-<project-ref>-auth-token`
- Survives browser close and tab navigation

---

### 3. onAuthStateChange listeners

**File:** `server/public/js/main.js`  
**Location:** DOMContentLoaded handler (lines 211-244)

**Listener:**
- `client.auth.onAuthStateChange(async (event, session) => {...})` (line 221)
- SIGNED_OUT: Clears HOLD and updates UI (lines 224-231)
- SIGNED_IN: Updates UI (lines 234-241)
- Other events ignored (line 243)

**Issue:** This listener reacts to server-initiated sign-out, but if Supabase session remains in localStorage, the page reload re-triggers `checkSessionStatus()`.

---

### 4. Logout flow (CORRECT)

**File:** `server/public/js/logout.js`  
**Function:** `performLogout()` (line 219)  
**Called:** Via `attachLogoutHandler()` (line 306)

**Steps (in order):**
1. Sets `logout.ui.hold` in localStorage (line 225)
2. Installs NavGuard (line 226)
3. POST `/auth/clear-cookie` (lines 232-236)
4. Calls `supabase.auth.signOut()` (lines 244-250)
5. Clears JS cookies (lines 259-262)
6. Clears sessionStorage (lines 264-266)
7. Reloads page (line 273)

**Observation:** Correctly clears Supabase session via `signOut()`, but the issue is the page reload. If `signOut()` fails silently or localStorage isn't cleared properly, `checkSessionStatus()` re-hydrates on the reloaded page.

---

## C. NAVBAR RENDERING AND CACHE BEHAVIOR

### 1. Navbar rendering

**File:** `server/ejs/partials/nav.ejs`  
**Template:** Server-rendered EJS

**Data source:**
- `nav.items` array from server (includes login/logout links)
- Built server-side based on `res.locals.user` or `req.user`
- No client-side hydration for nav state

**Logged-in vs logged-out:**
- Server determines based on `req.user` presence
- Different `nav.items` arrays passed to template

---

### 2. Client-side nav toggles

**File:** `server/public/js/nav-client.js`  
**Purpose:** Updates nav UI after auth state changes

**Functions:**
- `updateUIForLoggedInUser(email)` - Shows Dashboard + Logout
- `updateUIForLoggedOutUser()` - Shows Login link

**Issue:** Client-side toggles can desync with server-rendered nav if page reload occurs before client JS runs.

---

### 3. Cache-Control headers

**File:** `server/middleware/cacheControl.js`  
**Export:** `module.exports = function cacheControl()` (line 19)

**Behavior:**
- Static prefixes (`/js/`, `/css/`, `/images/`, etc.): No cache header (default caching)
- Dynamic routes: Sets `Cache-Control: no-store` (line 26)

**Routes checked:**
- `/` → Dynamic → no-store
- `/health` → Dynamic → no-store
- `/api/hello` → Dynamic → no-store
- `/dashboard` → Dynamic → no-store

**bfcache eligibility:**
- With `no-store`, pages should not be eligible for bfcache
- However, `no-store` only applies if browser sees the header during navigation
- Firefox and Chrome may still cache DOM if `no-store` isn't set on the initial response

---

## D. 401 AND LOGIN PATH

### 1. 401 page

**File:** `server/ejs/errors/401.ejs`  
**Template:** Server-rendered

**Sign-in button:**
- Links to `/login` (line 21)
- Does not trigger `/auth/set-cookie`

---

### 2. /login route

**Needs review:** Check routes for auto session sync if `login.ejs` loads with existing Supabase session in localStorage.

---

## E. FILE LIST SUMMARY

### Server Routes
- `server/routes/authCookie.js` - `/auth/set-cookie`, `/auth/clear-cookie` endpoints
- `server/middleware/authBridge.js` - Token verification, attaches `req.user`
- `server/middleware/requireAuth.js` - Protected page middleware
- `server/middleware/requireOwner.js` - Owner-only middleware
- `server/middleware/requireAuthByDefault.js` - Default-deny middleware
- `server/routes/auth.js` - Login/logout routes (needs review)
- `server/routes/authCookie.js` - Auth cookie management

### Client Scripts
- `server/public/js/main.js` - `checkSessionStatus()`, `onAuthStateChange()` (lines 211-244, 852-929)
- `server/public/js/sbClient.js` - Supabase client singleton init
- `server/public/js/logout.js` - `performLogout()` with signOut() call
- `server/public/js/nav-client.js` - UI state toggles
- `server/public/js/profile-edit.js` - Profile UI (uses shared SB client)
- `server/public/js/supabase-client.js` - Supabase JS library wrapper (needs review)

### Views/Partials
- `server/ejs/partials/nav.ejs` - Navbar template (server-rendered)
- `server/ejs/errors/401.ejs` - 401 page
- `server/ejs/index.ejs` - Homepage with `checkSessionStatus()` call
- `server/ejs/dashboard.ejs` - Dashboard with cross-tab logout sync

### Service Worker
- None found

### Configuration
- `server/middleware/cacheControl.js` - Cache headers
- `server/config/index.js` - Environment config

---

## ROOT CAUSE CONFIRMED

**Session Resurrection Scenario:**

1. User clicks Logout → `performLogout()` runs
2. POST `/auth/clear-cookie` → Server clears cookie, sets `auth_logout=1` (10s TTL)
3. `supabase.auth.signOut()` called → Should clear localStorage
4. Page reload → `checkSessionStatus()` runs
5. **IF:** Supabase session still exists in localStorage (signOut failed or localStorage bug)
6. **THEN:** `checkSessionStatus()` POSTs to `/auth/set-cookie` with stored token
7. Server accepts token → Sets new 7-day cookie → User re-authenticated
8. **IF:** User navigates to another page after 10s, sentinel expired
9. **THEN:** Step 4-7 repeat → Persistent re-auth

**Key Gap:** `signOut()` failure is not fatal. Logout flow should verify localStorage is actually cleared before proceeding.

---

## RECOMMENDATIONS

### Option 1: Strengthen logout verification
- After `signOut()`, read localStorage and retry if session still exists
- Add error handling for `signOut()` failures
- Add explicit localStorage.clear() as fallback

### Option 2: Extend sentinel duration
- Increase `auth_logout` TTL from 10s to 60s+
- Add server-side session tracking to block re-auth for X minutes after logout

### Option 3: Require explicit login
- Disable `checkSessionStatus()` auto-hydration on homepage
- Force user to click Login button to restore session

### Option 4: Clear localStorage on logout
- After `signOut()`, manually delete all `sb-*-auth-token` keys
- Clear entire localStorage if `.startsWith('sb-')` as safety net

**Recommended:** Option 1 + Option 4 (verify signOut success + manual localStorage cleanup)

---

## TESTING CHECKLIST

- [ ] Logout → verify Supabase session cleared in localStorage
- [ ] Logout → reload within 10s → verify no re-auth
- [ ] Logout → wait 15s → reload → verify no re-auth
- [ ] Logout → navigate to new tab → verify logged-out state
- [ ] Logout → browser close → reopen → verify logged-out state
- [ ] Simulate `signOut()` failure → verify localStorage still cleared
- [ ] Multi-tab logout → verify all tabs update immediately

---

**Report generated by Cursor AI - read-only analysis**  
**No code changes made**  
**Ready for fix strategy review**

