# Logout Re-Authentication Fix - Test Log

**Branch:** `fix/logout-and-trust-badge`  
**Date:** 2025-01-XX  
**Status:** Ready for testing

---

## Summary of Changes

### A. Server-Side Logout Protection

**Files Changed:**
- `server/routes/authCookie.js`

**Changes:**
1. Added configurable `AUTH_LOGOUT_SENTINEL_MS` env var (default: 90000ms = 90s)
2. Extended `auth_logout` sentinel cookie TTL from fixed 10s to configurable window
3. Added Redis short lock `lock:logout:ip:<ip>` with matching TTL
4. Enhanced `/auth/set-cookie` to check both cookie sentinel and Redis lock

**Protection Layers:**
- **Layer 1:** Cookie sentinel (`auth_logout=1`) blocks client-side re-auth attempts
- **Layer 2:** Redis lock (`lock:logout:ip:<ip>`) blocks server-side re-auth even if cookie is missing
- **Layer 3:** IP-based key prevents same-client re-auth from different tabs

---

### B. Client-Side Auto-Hydration Control

**Files Changed:**
- `server/public/js/main.js`
- `server/public/js/logout.js`
- `server/ejs/dashboard.ejs`
- `server/ejs/checkout-review.ejs`
- `server/ejs/billing.ejs`
- `server/ejs/profile-edit.ejs`
- `server/ejs/purchase-confirmation.ejs`
- `server/ejs/receipt.ejs`

**Changes:**
1. Made `checkSessionStatus()` opt-in via `data-auth-hydrate="true"` on `<body>` tag
2. Public pages (homepage, `/health`, etc.) skip auto-hydration
3. Protected pages (dashboard, billing, etc.) opt-in to immediate session restoration
4. Strengthened `logout.js` to explicitly clear all `sb-*` and `supabase` keys from localStorage after `signOut()`

**Behavior:**
- **Public pages:** Never auto-hydrate, server-rendered nav is source of truth
- **Protected pages:** Auto-hydrate if session exists in localStorage (opts in)
- **Logout:** Clears localStorage aggressively as fallback if `signOut()` fails

---

### C. Trust Badge Alignment (Completed Previously)

**Already Fixed:**
- Reduced trust badge size from `266px, 43.5vw, 435px` to `240px, 40vw, 400px`
- Removed gaps between badge and text
- Aligned paragraph left edge with "Total (estimate)" label
- Centered badge in right column

---

## Test Scenarios

### Test 1: Logout Path - Immediate Navigation

**Steps:**
1. Login via modal (email + password)
2. Visit `/dashboard/billing`
3. Visit `/dashboard/checkout/review?product=resume_expert&qty=1`
4. Click "Logout"
5. **Immediately** hit browser Back button
6. Visit `/health`
7. Visit `/api/hello`

**Expected Behavior:**
- POST `/auth/clear-cookie` returns 200 OK
- Server logs: `auth.clear_cookie.ok`
- No POST `/auth/set-cookie` events in logs for 90s
- Navbar shows "Login" link (not "Logout")
- `/health` returns 200 OK (public endpoint)
- `/api/hello` returns 401 Unauthorized (protected endpoint)

**Server Logs to Confirm:**
```
auth.clear_cookie.ok
auth.set_cookie.denied_by_sentinel (if client attempts re-auth during 90s window)
```

**Console Logs (Client):**
```
[logout] Server cookie cleared
[logout] Supabase session cleared
[logout] Explicitly cleared Supabase localStorage keys: ["sb-xxx-auth-token"]
[logout] JS cookies cleared
```

---

### Test 2: Delayed Revisit (After Sentinel Window)

**Steps:**
1. Complete logout (as in Test 1)
2. Wait 2 minutes (sentinel expires at 90s)
3. Visit `/` (homepage)
4. Try to access `/dashboard`

**Expected Behavior:**
- No POST `/auth/set-cookie` attempts from homepage (not opt-in)
- Server logs show zero `auth.set_cookie.ok` events
- Attempting `/dashboard` redirects to `/login?next=%2Fdashboard`
- Navbar remains in logged-out state

**Server Logs to Confirm:**
```
NO auth.set_cookie.ok events (zero re-authentication)
```

**Console Logs (Client):**
```
[Main] Session hydration skipped - page did not opt in
```

---

### Test 3: Explicit Login After Logout

**Steps:**
1. Complete logout (as in Test 1)
2. Click "Login" button on homepage
3. Enter credentials and submit

**Expected Behavior:**
- POST `/auth/set-cookie` returns 200 OK
- Server logs: `auth.set_cookie.ok` **exactly once**
- Dashboard loads successfully
- Navbar shows "Dashboard" and "Logout" links

**Server Logs to Confirm:**
```
auth.set_cookie.ok (exactly ONE occurrence)
```

**Console Logs (Client):**
```
[Login] Session restored
```

---

### Test 4: Cross-Tab Logout Sync

**Steps:**
1. Open two tabs to `/dashboard`
2. Logout from Tab 1
3. Observe Tab 2

**Expected Behavior:**
- Tab 1 redirects to `/` with logged-out nav
- Tab 2 detects logout via BroadcastChannel and redirects to `/`
- Both tabs show logged-out nav

**Console Logs (Both Tabs):**
```
[Tab 1] Logout initiated
[Tab 2] Cross-tab logout detected, redirecting to homepage
```

---

### Test 5: Trust Badge Visual Alignment

**Steps:**
1. Login
2. Visit `/dashboard/checkout/review?product=resume_expert&qty=1`
3. Resize browser window:
   - 360px width (mobile)
   - 768px width (tablet)
   - 1440px width (desktop)

**Expected Behavior:**
- Desktop: Trust badge copy left edge aligns with "Total (estimate)" label
- Mobile: Badge scales down, gap between badge and text remains tight (~12px)
- No giant void below badge
- Badge roughly ~10% larger visually than before fix

**Visual Checks:**
- [ ] Desktop: Text alignment within 2-3px
- [ ] Mobile: No horizontal scrollbar
- [ ] All widths: Badge crisp, not pixelated

---

## Security Verification

### A. Server-Side Checks

**Redis Lock Key:**
```bash
redis-cli
> KEYS lock:logout:ip:*
> TTL lock:logout:ip:127.0.0.1
```

**Expected:**
- Key exists after logout with TTL ≈ 90s
- Key expires automatically after 90s
- No unbounded key growth

**Cookie Sentinel:**
```bash
curl -I http://localhost:3000/?logged_out=1
# Check Set-Cookie: auth_logout=1
```

**Expected:**
- Cookie set with `Max-Age=90` (or configured value)
- Cookie readable by JS (not HttpOnly)
- Cookie cleared on login

---

### B. Client-Side Checks

**localStorage Inspection:**
```javascript
// In DevTools Console after logout
localStorage.getItem('logout.ui.hold')  // Should be '1' during logout, then null after redirect
Object.keys(localStorage).filter(k => k.startsWith('sb-'))  // Should be empty after logout
```

**Expected:**
- No `sb-*` keys after logout completes
- HOLD flag cleared after successful logout

---

## Acceptance Criteria

- [ ] **Test 1 passes:** No re-auth during 90s window
- [ ] **Test 2 passes:** No re-auth after 90s window
- [ ] **Test 3 passes:** Explicit login works normally
- [ ] **Test 4 passes:** Cross-tab logout sync works
- [ ] **Test 5 passes:** Trust badge alignment on all screen sizes
- [ ] **Security checks pass:** Redis keys bounded, cookies valid
- [ ] **No regressions:** Login flow unchanged, dashboard loads, protected pages work

---

## Observed Results

**Test Environment:**
- Date: YYYY-MM-DD
- Browser: Chrome/Firefox/Safari version
- OS: macOS/Windows/Linux version
- Redis: Running/Not running

**Test 1 Results:**
- [ ] Pass / [ ] Fail
- Server log excerpts:
```
[paste here]
```

**Test 2 Results:**
- [ ] Pass / [ ] Fail
- Server log excerpts:
```
[paste here]
```

**Test 3 Results:**
- [ ] Pass / [ ] Fail
- Server log excerpts:
```
[paste here]
```

**Test 4 Results:**
- [ ] Pass / [ ] Fail
- Console log excerpts:
```
[paste here]
```

**Test 5 Results:**
- [ ] Pass / [ ] Fail
- Screenshots attached

---

## Edge Cases Tested

- [ ] Back/forward navigation during logout
- [ ] Page refresh during logout
- [ ] Network timeout on `/auth/clear-cookie`
- [ ] Redis unavailable (graceful degradation)
- [ ] Multiple rapid logout clicks (double-submit guard)
- [ ] Supabase `signOut()` throws exception
- [ ] localStorage quota exceeded
- [ ] Browser DevTools clearing localStorage mid-logout

---

## Known Issues

- None currently identified

---

**Test log completed by:** [Tester name]  
**Status:** Ready for review  
**Next step:** Merge to main if all tests pass

