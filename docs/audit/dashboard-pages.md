# Dashboard / Protected Pages Audit

**Date:** 2025-01-XX  
**Author:** Cursor (Automated Audit)  
**Phase:** Phase 6 - Audit & Alignment Pass

## Purpose

Ensure existing pages conform to the Detechify Master Protected Template Constitution (nonce-based CSP, CSRF, centralized nav, presenter-driven data).

## Pages Reviewed

### 1. server/ejs/index.ejs (PUBLIC)

**Status:** ✅ ALIGNED (after refactoring)

**Findings:**
- ✅ Uses nonce on all script tags (`nonce="<%= page.nonce %>"`)
- ✅ Has CSRF meta tag (`<meta name="csrf-token" content="<%= ui.csrfToken || '' %>">`)
- ✅ Includes nav partial (`<%- include('partials/nav', { nav: page.nav, app_info: app_info }) %>`)
- ✅ Includes modals partial (`<%- include('partials/modals') %>`)
- ✅ Has `data-auth-hydrate="true"` on body tag
- ✅ Uses `page.assetVersion` for cache busting
- ✅ Removed deprecated "Text Submission Demo" section
- ✅ Refactored to use master template layout style (hero + sectioned content)
- ✅ All external scripts have nonce attributes
- ✅ Inline scripts have nonce attributes

**Actions Taken:**
1. Removed "Text Submission Demo" form section (lines 73-97)
2. Replaced with master template layout style (hero + dashboard-actions section)
3. Removed `feature-config` div (no longer needed without text form)
4. Added `data-auth-hydrate="true"` to body tag for consistency
5. Kept all security elements (nonce, CSRF, nav, modals, scripts)

**Constitutional Compliance:**
- ✅ CSP nonce: All scripts use nonce
- ✅ CSRF: Meta tag present, forms would include token if needed
- ✅ Centralized nav: Uses nav partial
- ✅ Backend authoritative: Presenter provides all data
- ✅ No secrets: No secrets in frontend code

### 2. server/ejs/dashboard.ejs

**Status:** ✅ MOSTLY COMPLIANT (minor verification)

**Findings:**
- ✅ Structure matches protected template (nonce, nav, modals)
- ✅ Has `<meta name="csrf-token" content="<%= ui.csrfToken || '' %>">`
- ✅ Includes nav partial
- ✅ Includes modals partial
- ✅ Has `data-auth-hydrate="true"` on body tag
- ✅ All inline scripts use nonce (`nonce="<%= page.nonce %>"`)
- ✅ All external scripts use nonce
- ✅ Uses `page.title` from presenter
- ✅ Uses `page.assetVersion` for cache busting
- ✅ Presenter supplies nonce and CSRF token

**Actions Taken:**
- ✅ Verified alignment with master template
- ✅ Confirmed all required elements present
- ✅ No changes needed (already compliant)

**Constitutional Compliance:**
- ✅ CSP nonce: All scripts use nonce
- ✅ CSRF: Meta tag present
- ✅ Centralized nav: Uses nav partial
- ✅ Backend authoritative: Presenter provides all data
- ✅ No secrets: No secrets in frontend code

### 3. server/public/js/main.js

**Status:** ✅ COMPLIANT (defensive checks in place)

**Findings:**
- ✅ Contains logic for text submission form (now removed from index.ejs)
- ✅ All form handlers are defensive (check for element existence before use)
- ✅ `initializeTextForm()` function checks for elements and returns early if missing (line 328)
- ✅ `initializeSubmissions()` function checks for elements and returns early if missing (line 419)
- ✅ No errors will occur when form elements are missing
- ✅ Contains XSS escape helper (`escapeHtml` function)
- ✅ Contains CSRF token helper (`getCSRFToken` function)
- ✅ Uses PII-safe logging with redaction

**Actions Taken:**
- ✅ Verified defensive checks prevent errors when form is removed
- ✅ No changes needed (code already handles missing elements gracefully)

**Constitutional Compliance:**
- ✅ No secrets: PII redaction in place
- ✅ XSS protection: HTML escaping function present
- ✅ CSRF: Token helper function present
- ✅ Defensive coding: All DOM access guarded

### 4. server/public/js/dashboard.js

**Status:** ✅ COMPLIANT

**Findings:**
- ✅ Uses CSRF helper (`_getCSRFToken()`)
- ✅ Uses XSS escape helper (`escapeHtml()`)
- ✅ Tied to dashboard page functionality
- ✅ Contains PII-safe logging with redaction
- ✅ Defensive checks for DOM elements

**Actions Taken:**
- ✅ Verified compliance
- ✅ No changes needed

**Constitutional Compliance:**
- ✅ No secrets: PII redaction in place
- ✅ XSS protection: HTML escaping function present
- ✅ CSRF: Token helper function present

### 5. server/ui_contract/presenters.js

**Status:** ✅ FIXED (suspicious ternary corrected)

**Findings:**
- ❌ Had suspicious ternary: `req.user?.id ? true : false ? [...] : [...]`
- ✅ Fixed to use explicit boolean check: `Boolean(req.user && req.user.id)`
- ✅ Updated `allowed_actions` to match new homepage UI (removed `submit_text` since form removed)
- ✅ Updated `feature_flags.text_submission` to `false` (form removed)
- ✅ Updated `display_rules.show_submission_form` to `false` (form removed)
- ✅ Updated `display_rules.show_public_submissions` to `false` (removed from homepage)
- ✅ Removed `form_schema.text` (no form on homepage)
- ✅ Removed `cooldowns.text_submission` (no form on homepage)
- ✅ Fixed `isAuthenticated` to use explicit boolean check

**Actions Taken:**
1. Fixed suspicious ternary in `buildHomePageModel` (line 193-195)
2. Updated `allowed_actions` to reflect new homepage structure
3. Updated `feature_flags` to remove text submission references
4. Updated `display_rules` to remove submission form references
5. Cleaned up `form_schema` and `cooldowns` to remove text submission references
6. Fixed `isAuthenticated` boolean expression

**Constitutional Compliance:**
- ✅ Backend authoritative: Presenter provides clear, explicit instructions
- ✅ No ambiguous logic: All conditionals use explicit boolean checks
- ✅ UI instructions match actual page structure

## Transition Workflow for Existing Billing/Profile/Payment Pages

**Important Note:** You (Cursor) are more repo-aware than the user. If any instruction in this document does not match the actual file names, variable names, or route signatures in the repository, you must correct the mismatch by following the goals: keep pages security-aligned (nonce, CSRF, centralized nav, server-authoritative), preserve existing behavior, and avoid regressions and race conditions.

### For New Pages (Using Automation)

When generating a new protected page with the automation:
1. Run the `.sh` generator (built in Phase 5)
2. This automatically creates:
   - EJS template with nonce, CSRF, nav, modals, footer
   - Presenter stub
   - Route entries
   - Client JS stub

### For Migrating Existing Pages

When migrating an existing page (like billing.ejs, checkout-review.ejs, etc.):

**Step 1: Open Master Template**
1. Open `server/ejs/_template-protected.ejs`
2. Copy the head structure (meta tags, nonce, CSRF, title pattern)
3. Copy the body structure (`<body data-auth-hydrate="true">`)
4. Copy the nav include: `<%- include('partials/nav', { nav: page.nav, app_info: app_info }) %>`
5. Copy the modals include: `<%- include('partials/modals') %>`
6. Copy the footer structure

**Step 2: Paste Page-Specific Content**
1. Take the existing page's main content (billing cards, checkout summary, confirmation details, profile form)
2. Paste it into the master template's content area (where the template has `dashboard-actions` or `hero` sections)
3. Keep the page-specific structure but wrap it in the master template's container/hero layout

**Step 3: Rewire Scripts**
1. Ensure every `<script>` tag has `nonce="<%= page.nonce %>"`
2. Ensure every inline `<style>` tag has `nonce="<%= page.nonce %>"`
3. Keep the same script loading order if it matters (e.g., modalManager.js before pay.js)

**Step 4: Align Presenter/Route**
1. Ensure the route uses a presenter that builds `{ page, user, ui_instructions, ui, app_info }`
2. In the route, after calling the presenter, set:
   ```javascript
   pageModel.page.nonce = res.locals.nonce;
   pageModel.page.title = 'Your Page Title';
   pageModel.ui = pageModel.ui || {};
   pageModel.ui.csrfToken = res.locals.csrfToken || '';
   pageModel.ui.supabaseUrl = process.env.SUPABASE_URL;
   pageModel.ui.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
   ```
3. If the page needs additional data (e.g., `billing.pricing`, `confirmation`), add it to the pageModel

**Step 5: Normalize CSRF**
1. In EJS, use `<meta name="csrf-token" content="<%= ui.csrfToken || '' %>">`
2. In forms, use `<input type="hidden" name="_csrf" value="<%= ui.csrfToken || '' %>">`
3. In fetch calls, read from meta tag: `document.querySelector('meta[name="csrf-token"]').getAttribute('content')`

**Step 6: Verify Security Elements**
- [ ] All `<script>` tags have `nonce="<%= page.nonce %>"`
- [ ] CSRF meta tag present: `<meta name="csrf-token" content="<%= ui.csrfToken || '' %>">`
- [ ] Nav partial included: `<%- include('partials/nav', { nav: page.nav, app_info: app_info }) %>`
- [ ] Modals partial included: `<%- include('partials/modals') %>`
- [ ] Body tag has `data-auth-hydrate="true"` (if auth hydration needed)
- [ ] All forms include CSRF token: `<input type="hidden" name="_csrf" value="<%= ui.csrfToken || '' %>">`
- [ ] Presenter/route provides `page.nonce` and `ui.csrfToken`

**Step 7: Test**
1. Re-run the page and verify modals, logout, and nav still work
2. Verify CSRF tokens are present in forms and fetch calls
3. Verify no console errors about missing elements
4. Verify payment flows still work (if applicable)

### Example: Billing Page Migration

**Before:**
- Title hardcoded: `<title>Billing – Detechify</title>`
- CSRF inconsistent: Some pages used `page.csrfToken`, others used `ui.csrfToken`

**After:**
- Title from route: `<title><%= page.title || 'Billing – ' + (app_info?.name || 'Detechify') %></title>`
- Route sets: `pageModel.page.title = 'Billing – ' + APP_NAME`
- CSRF normalized: All pages use `ui.csrfToken`
- Route ensures: `pageModel.ui.csrfToken = res.locals.csrfToken || ''`

This is the "drop this whole part into the template's content area" workflow the user wanted.

## Transition Workflow (For Future Migrations)

This workflow documents how to migrate existing pages to match the master template:

### 1. Generate / Copy Master Files

**For New Protected Pages:**
- Run the `.sh` generator (built in Phase 5)
- This creates EJS, JS, presenter stub, route entries automatically

**For Migrating Existing Pages:**
1. Open `_template-protected.ejs`
2. Copy the main layout sections (hero, dashboard-actions, footer structure)
3. Paste into the existing EJS file
4. Rewire scripts to use nonce (`nonce="<%= page.nonce %>"`)
5. Remove legacy sections (e.g., text submission demo)
6. Ensure nav partial is included: `<%- include('partials/nav', { nav: page.nav, app_info: app_info }) %>`
7. Ensure modals partial is included: `<%- include('partials/modals') %>`
8. Add `data-auth-hydrate="true"` to body tag if needed

### 2. Align Presenter

**Requirements:**
- Every page must have a presenter building `{ page, user, ui_instructions, ui, app_info }`
- If an old page doesn't have this, create one that mimics `_templatePresenter.js`
- Point the route to that presenter
- Ensure presenter sets:
  - `page.nonce = res.locals.nonce || ''`
  - `ui.csrfToken = res.locals.csrfToken || ''`
  - `page.nav = navManager.compose(req, res)`

**Example:**
```javascript
async function buildExamplePageModel(req, res) {
  const user = await buildCanonicalUser(req);
  const isAuthenticated = Boolean(user && user.id);
  
  return {
    page: {
      title: `Example - ${process.env.APP_NAME}`,
      description: 'Example page',
      nonce: res.locals.nonce || '',
      assetVersion: ASSET_VERSION,
      nav: navManager.compose(req, res)
    },
    user,
    ui_instructions: {
      allowed_actions: isAuthed ? ['view_dashboard'] : ['login'],
      // ... other instructions
    },
    ui: {
      csrfToken: res.locals.csrfToken || '',
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || ''
    },
    app_info: {
      name: process.env.APP_NAME || 'Application',
      // ... other app info
    }
  };
}
```

### 3. Align Route

**Requirements:**
- Route must fetch `res.locals.nonce` and pass through via presenter
- Route must render with the model returned by presenter
- Route must add Supabase credentials to `ui` object if needed

**Example:**
```javascript
router.get('/example', requireAuth, async (req, res) => {
  const pageModel = await buildExamplePageModel(req, res);
  pageModel.page.nonce = res.locals.nonce;
  pageModel.ui.supabaseUrl = process.env.SUPABASE_URL;
  pageModel.ui.supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  res.render('example', pageModel);
});
```

### 4. Verify Security Elements

**Checklist:**
- [ ] All `<script>` tags have `nonce="<%= page.nonce %>"`
- [ ] CSRF meta tag present: `<meta name="csrf-token" content="<%= ui.csrfToken || '' %>">`
- [ ] Nav partial included: `<%- include('partials/nav', { nav: page.nav, app_info: app_info }) %>`
- [ ] Modals partial included: `<%- include('partials/modals') %>`
- [ ] Body tag has `data-auth-hydrate="true"` (if auth hydration needed)
- [ ] All forms include CSRF token: `<input type="hidden" name="_csrf" value="<%= csrfToken %>">`
- [ ] Presenter provides `page.nonce` and `ui.csrfToken`

## Summary of Changes

### Files Modified

1. **server/ejs/index.ejs**
   - Removed "Text Submission Demo" section
   - Refactored to use master template layout style
   - Added `data-auth-hydrate="true"` to body tag
   - Removed `feature-config` div

2. **server/ui_contract/presenters.js**
   - Fixed suspicious ternary in `buildHomePageModel`
   - Updated `allowed_actions` to match new homepage structure
   - Updated `feature_flags` to remove text submission
   - Updated `display_rules` to remove submission form references
   - Cleaned up `form_schema` and `cooldowns`
   - Fixed `isAuthenticated` boolean expression

### Files Verified (No Changes Needed)

1. **server/ejs/dashboard.ejs** - Already compliant
2. **server/public/js/main.js** - Defensive checks prevent errors
3. **server/public/js/dashboard.js** - Already compliant

## Constitutional Compliance Verification

### Security Invariants

- ✅ **CSP Nonce:** All scripts use nonce attributes
- ✅ **CSRF Protection:** Meta tags and form tokens present
- ✅ **Auth Cookies:** Not applicable (handled by auth routes)
- ✅ **Rate Limiting:** Enforced at middleware level
- ✅ **No unsafe-inline:** All scripts use nonce
- ✅ **No Secrets:** No secrets in frontend code or logs

### Template Standards

- ✅ **File Headers:** All templates have descriptive headers
- ✅ **Nonce Usage:** All scripts (inline and external) use nonce
- ✅ **CSRF Injection:** Meta tags and form fields include tokens
- ✅ **Nav Partial:** All pages include centralized nav
- ✅ **Modals Partial:** All pages include centralized modals
- ✅ **Presenter Pattern:** All pages use presenters for data

### Backend Authority (Building Law #9)

- ✅ **UI Instructions:** Presenters provide `ui_instructions` object
- ✅ **Input Limits:** Backend defines all limits
- ✅ **Feature Flags:** Backend controls feature visibility
- ✅ **Display Rules:** Backend tells frontend what to show
- ✅ **No Client Logic:** Frontend only mirrors backend instructions

## Regression Safety

**Security:**
- ✅ No CSP relaxations
- ✅ No CSRF removals
- ✅ No auth bypasses
- ✅ No secrets exposed

**Functionality:**
- ✅ Login/logout flows preserved
- ✅ Modal functionality preserved
- ✅ Navigation preserved
- ✅ Auth hydration preserved

**Code Quality:**
- ✅ Defensive checks prevent errors
- ✅ Missing elements handled gracefully
- ✅ No breaking changes to existing functionality

## Expanded Phase 6 - Billing, Payment, and Profile Pages

### Pages Reviewed (Expanded Pass)

#### 6. server/ejs/billing.ejs

**Status:** ✅ ALIGNED

**Findings:**
- ✅ Has CSRF meta tag (`<meta name="csrf-token" content="<%= ui.csrfToken || '' %>">`)
- ✅ Includes nav partial
- ✅ Includes modals partial
- ✅ Has `data-auth-hydrate="true"` on body tag
- ✅ All external scripts have nonce
- ✅ Inline script has nonce
- ✅ Uses `page.assetVersion` for cache busting
- ✅ Pulls pricing from `billing?.pricing` (supplied by route)
- ✅ Uses `env?.STRIPE_PRICE_*` for price ID lookups (kept in route, not frontend)

**Actions Taken:**
1. Normalized title to use `page.title` from route
2. Updated route to set `page.title = 'Billing – ' + APP_NAME`
3. Updated route to ensure `ui.csrfToken`, `ui.supabaseUrl`, `ui.supabaseAnonKey` are set
4. Verified all scripts have nonce attributes

**Constitutional Compliance:**
- ✅ CSP nonce: All scripts use nonce
- ✅ CSRF: Meta tag present
- ✅ Centralized nav: Uses nav partial
- ✅ Backend authoritative: Route supplies all data
- ✅ No secrets: Stripe price IDs passed via route, not hardcoded

#### 7. server/ejs/checkout-review.ejs

**Status:** ✅ ALIGNED

**Findings:**
- ✅ Has CSRF meta tag (normalized to `ui.csrfToken`)
- ✅ Includes nav partial
- ✅ Has `data-auth-hydrate="true"` on body tag
- ✅ Uses `page.assetVersion` for cache busting
- ✅ Inline script has nonce
- ✅ Inline script includes CSRF token in fetch headers
- ✅ Inline script includes idempotency key generation

**Actions Taken:**
1. Normalized CSRF source from `ui?.csrfToken || page?.csrfToken` to `ui.csrfToken`
2. Updated route to ensure `ui.csrfToken` is set
3. Verified route passes `page.nonce`, `page.nav`, `app_info`

**Constitutional Compliance:**
- ✅ CSP nonce: Inline script uses nonce
- ✅ CSRF: Meta tag present, fetch includes X-CSRF-Token header
- ✅ Centralized nav: Uses nav partial
- ✅ Backend authoritative: Route supplies product data
- ✅ Idempotency: Client generates idempotency keys

#### 8. server/ejs/purchase-confirmation.ejs

**Status:** ✅ ALIGNED

**Findings:**
- ✅ Includes nav partial
- ✅ Includes modals partial
- ✅ Has `data-auth-hydrate="true"` on body tag
- ✅ Inline `<style>` has nonce
- ✅ Inline `<script>` has nonce
- ✅ Renders confirmation details from server
- ✅ Fetches `/api/pay/receipt?session_id=...` in JS
- ❌ **WAS MISSING:** CSRF meta tag

**Actions Taken:**
1. Added missing CSRF meta tag: `<meta name="csrf-token" content="<%= ui.csrfToken || '' %>">`
2. Updated route to ensure `ui.csrfToken` is set
3. Verified route passes `page.nonce`, `page.nav`, `app_info`, `confirmation` object
4. Kept no-cache headers (appropriate for purchase confirmation)

**Constitutional Compliance:**
- ✅ CSP nonce: All scripts and styles use nonce
- ✅ CSRF: Meta tag now present
- ✅ Centralized nav: Uses nav partial
- ✅ Backend authoritative: Route supplies confirmation data
- ✅ No card details: Page intentionally shows minimal info, links to official receipt

#### 9. server/ejs/receipt.ejs

**Status:** ✅ ALIGNED

**Findings:**
- ✅ Includes nav partial
- ✅ Has `data-auth-hydrate="true"` on body tag
- ✅ Inline script has nonce
- ✅ Button to email receipt calls `/api/receipt/email`
- ✅ Shows QR code
- ❌ **WAS MISSING:** Modals partial
- ❌ **HAD INCONSISTENCY:** CSRF used `page.csrfToken` instead of `ui.csrfToken`

**Actions Taken:**
1. Normalized CSRF from `page.csrfToken` to `ui.csrfToken`
2. Added missing modals partial: `<%- include('partials/modals') %>`
3. Verified script has nonce
4. **Note:** Receipt.ejs may not have an active route (template exists but may be legacy)

**Constitutional Compliance:**
- ✅ CSP nonce: Script uses nonce
- ✅ CSRF: Meta tag normalized to `ui.csrfToken`
- ✅ Centralized nav: Uses nav partial
- ✅ Centralized modals: Now includes modals partial
- ✅ Backend authoritative: Would need route to supply receipt data

#### 10. server/ejs/profile-edit.ejs

**Status:** ✅ ALIGNED

**Findings:**
- ✅ Has CSRF meta tag (`<meta name="csrf-token" content="<%= ui.csrfToken || '' %>">`)
- ✅ Has `data-auth-hydrate="true"` on body tag
- ✅ Includes nav partial
- ✅ Includes modals partial
- ✅ Multiple external scripts with nonce
- ✅ Cross-tab logout BroadcastChannel inline script with nonce
- ❌ **HAD INCONSISTENCY:** Form used `csrfToken` instead of `ui.csrfToken`

**Actions Taken:**
1. Normalized form CSRF from `csrfToken` to `ui.csrfToken`
2. Updated route to ensure `ui.csrfToken` is set
3. Verified all scripts have nonce

**Constitutional Compliance:**
- ✅ CSP nonce: All scripts use nonce
- ✅ CSRF: Meta tag and form field use `ui.csrfToken`
- ✅ Centralized nav: Uses nav partial
- ✅ Centralized modals: Uses modals partial
- ✅ Backend authoritative: Route supplies all data

### Routes Verified

#### server/routes/dashboard-billing.js
- ✅ Sets `page.nonce = res.locals.nonce`
- ✅ Sets `page.title`
- ✅ Sets `ui.csrfToken = res.locals.csrfToken`
- ✅ Sets `ui.supabaseUrl` and `ui.supabaseAnonKey`
- ✅ Passes `billing.pricing` and `env.STRIPE_PRICE_*` (no secrets in frontend)

#### server/routes/dashboard.js (checkout-review route)
- ✅ Sets `page.nonce = res.locals.nonce`
- ✅ Sets `page.title`
- ✅ Sets `ui.csrfToken = res.locals.csrfToken`
- ✅ Sets `ui.supabaseUrl` and `ui.supabaseAnonKey`
- ✅ Passes product data from backend

#### server/routes/dashboard.js (purchase-confirmation route)
- ✅ Sets `page.nonce = res.locals.nonce`
- ✅ Sets `page.title`
- ✅ Sets `ui.csrfToken = res.locals.csrfToken`
- ✅ Sets `ui.supabaseUrl` and `ui.supabaseAnonKey`
- ✅ Passes `confirmation` object from backend

#### server/routes/dashboard.js (profile-edit route)
- ✅ Sets `page.nonce = res.locals.nonce`
- ✅ Sets `page.title`
- ✅ Sets `ui.csrfToken = res.locals.csrfToken`
- ✅ Sets `ui.supabaseUrl` and `ui.supabaseAnonKey`

#### server/routes/payments.js
- ✅ Uses idempotency middleware
- ✅ Checks user via `assertUser`
- ✅ Verifies ownership on receipts
- ✅ Returns consistent JSON shape for existing JS

#### server/routes/profile.js
- ✅ Uses CSRF on updates (client sends header)
- ✅ Returns `{ success: true, profile, unchanged: true }` (unchanged detection)
- ✅ Protected by auth middleware

#### server/routes/auth.js
- ✅ `/auth/clear-cookie` is canonical logout endpoint
- ✅ `/api/auth/logout` redirects to `/auth/clear-cookie` (307 redirect)
- ✅ Logout.js logic is consistent with routes

## Next Steps

1. ✅ **Completed:** Refactored index.ejs to match master template
2. ✅ **Completed:** Fixed presenter ternary and updated UI instructions
3. ✅ **Completed:** Verified dashboard.ejs compliance
4. ✅ **Completed:** Verified defensive coding in main.js
5. ✅ **Completed:** Aligned billing.ejs with master template
6. ✅ **Completed:** Normalized CSRF in checkout-review.ejs
7. ✅ **Completed:** Added CSRF meta to purchase-confirmation.ejs
8. ✅ **Completed:** Normalized CSRF and added modals to receipt.ejs
9. ✅ **Completed:** Normalized CSRF in profile-edit.ejs
10. ✅ **Completed:** Updated all routes to pass nonce, CSRF, nav, app_info
11. ✅ **Completed:** Updated audit document

**Future Work:**
- Consider removing legacy `features.textLimits` from `buildHomePageModel` if not used elsewhere
- Monitor for any JavaScript errors after form removal (should be none due to defensive checks)
- Consider creating a public page template variant if more public pages are needed
- **Note:** receipt.ejs template exists but may not have an active route - verify if it's needed or legacy

## Laws Check

**Laws check:** OK

**Verification summary:**
- Repo-verified: All changes match actual repository structure
- No regressions: Security invariants preserved, functionality maintained
- All invariants preserved: CSP, CSRF, Auth, Rate Limiting, Secrets policy
- Defensive coding: Missing elements handled gracefully
- Constitutional compliance: All pages follow Master Protected Template Constitution

---

**End of Audit Report**

