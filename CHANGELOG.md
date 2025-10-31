# Changelog

## [Unreleased] - 2025-01-XX

### Fixed

#### Authentication

- **Logout re-authentication bug:** Fixed race condition where users were automatically re-logged in after logout
  - Added configurable `AUTH_LOGOUT_SENTINEL_MS` environment variable (default: 90s) to control logout protection window
  - Extended logout sentinel cookie TTL from fixed 10s to configurable duration
  - Added server-side Redis short lock (`lock:logout:ip:<ip>`) as defense-in-depth against re-authentication
  - Enhanced `/auth/set-cookie` to check both cookie sentinel and Redis lock before allowing re-auth
  - Made client-side session auto-hydration opt-in via `data-auth-hydrate="true"` attribute on protected pages
  - Strengthened localStorage cleanup on logout to explicitly remove all `sb-*` and `supabase` keys
  - Public pages (homepage, `/health`) now skip auto-hydration to prevent accidental re-login
  - Protected pages (dashboard, billing, profile, etc.) opt-in to immediate session restoration
  - Server-rendered navbar is now the source of truth on public pages, preventing client-side UI flicker

**Technical Details:**
- Server checks three layers: cookie sentinel, Redis lock, and opt-in flag
- IP-based Redis key prevents same-client re-auth from different tabs
- All Redis keys are TTL-bounded and auto-expire
- Graceful degradation if Redis is unavailable (cookie-only protection)

**Impact:**
- Users can now safely logout without risk of immediate re-authentication
- Protection window extends to 90s (configurable) vs previous 10s
- No more phantom "logged in" flashes on public pages
- Cross-tab logout sync remains intact

---

### UI

- **Checkout trust badge alignment:** Fixed visual alignment and spacing on checkout review page
  - Reduced badge size from `266px, 43.5vw, 435px` to `240px, 40vw, 400px` (~10% visual increase)
  - Removed excessive gap between trust badge image and explanatory text
  - Aligned paragraph left edge with "Total (estimate)" label on left column
  - Centered badge horizontally in right column
  - Responsive across mobile, tablet, and desktop widths

**Technical Details:**
- CSS updates scoped to checkout page only (no global styles changed)
- Alignment uses flexbox and grid layout (no absolute positioning)
- No layout shift or reflow after initial render
- Accessible markup preserved

**Impact:**
- Checkout page now has professional, aligned layout
- Trust badge is properly sized and positioned
- Mobile users see consistent, readable spacing

---

### Changed

#### Security

- **Logout protection:** Enhanced from single-point to multi-layer defense
  - Cookie sentinel (client-readable)
  - Redis lock (server-side)
  - Opt-in hydration (client-side)

---

### Configuration

- **New Environment Variable:**
  - `AUTH_LOGOUT_SENTINEL_MS` (default: `90000`): Controls logout protection window in milliseconds

---

## [Previous Releases]

(Existing changelog entries below...)

