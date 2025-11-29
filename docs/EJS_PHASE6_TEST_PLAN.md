# Phase 6: Test Plan & Regression Verification

## Overview
This document provides a comprehensive test plan to verify that all EJS template optimizations work correctly and no regressions were introduced.

## Test Environment Setup

### Prerequisites
1. **Development Environment**
   ```bash
   npm ci
   npm run start
   # Or with Docker:
   docker-compose up
   ```

2. **Test Data**
   - Valid test user account
   - Stripe test mode configured
   - Redis running (optional, for rate limiting)

3. **Browser Tools**
   - Browser DevTools (Chrome/Firefox)
   - Network tab enabled
   - Console tab enabled
   - Application/Storage tab for cookies

## Test Checklist by Feature

### 1. Authentication Flows

#### 1.1 Login Page (`/login`)
**Template**: `server/ejs/login.ejs`  
**JS**: `server/public/js/login.js`

**Test Steps**:
- [ ] Load `/login` page
- [ ] Verify page renders without errors
- [ ] Check browser console for JS errors
- [ ] Verify CSRF token is present in `<meta name="csrf-token">`
- [ ] Verify Supabase config is present in `<meta id="app-config">` (if applicable)
- [ ] Submit valid credentials
- [ ] Verify successful login redirects to dashboard
- [ ] Submit invalid credentials
- [ ] Verify error message displays correctly
- [ ] Check that success banners work (password changed, registration success)

**Expected Results**:
- ✅ Page loads without EJS errors
- ✅ No console errors
- ✅ Login form submits correctly
- ✅ Error/success messages display properly
- ✅ CSRF protection works

**Regression Checks**:
- ✅ Same HTML structure (IDs, classes, data attributes)
- ✅ Same form behavior
- ✅ Same error handling

---

#### 1.2 Registration Page (`/register`)
**Template**: `server/ejs/register.ejs`  
**JS**: `server/public/js/register.js`

**Test Steps**:
- [ ] Load `/register` page
- [ ] Verify page renders without errors
- [ ] Check browser console for JS errors
- [ ] Fill out registration form
- [ ] Submit with valid data
- [ ] Verify successful registration
- [ ] Submit with invalid data (duplicate email, weak password)
- [ ] Verify validation errors display correctly
- [ ] Test Turnstile (if enabled)

**Expected Results**:
- ✅ Page loads without errors
- ✅ Form validation works
- ✅ Registration succeeds with valid data
- ✅ Errors display correctly

**Regression Checks**:
- ✅ Same form fields and validation
- ✅ Same success/error behavior

---

#### 1.3 Logout Flow
**JS**: `server/public/js/logout.js`, `server/public/js/main.js` (cross-tab sync)

**Test Steps**:
- [ ] Log in as authenticated user
- [ ] Click logout button
- [ ] Verify logout modal appears (if applicable)
- [ ] Confirm logout
- [ ] Verify redirect to homepage
- [ ] Verify session is cleared (check cookies)
- [ ] Open second tab with dashboard
- [ ] Logout from first tab
- [ ] Verify second tab redirects automatically (cross-tab sync)

**Expected Results**:
- ✅ Logout clears session
- ✅ Redirects to homepage
- ✅ Cross-tab sync works (BroadcastChannel)
- ✅ No console errors

**Regression Checks**:
- ✅ Same logout behavior
- ✅ Same redirect flow
- ✅ Cross-tab sync still works

---

### 2. Dashboard Pages

#### 2.1 Main Dashboard (`/dashboard`)
**Template**: `server/ejs/dashboard.ejs`  
**JS**: `server/public/js/dashboard.js`, `server/public/js/main.js`

**Test Steps**:
- [ ] Load `/dashboard` as authenticated user
- [ ] Verify page renders without errors
- [ ] Check browser console for JS errors
- [ ] Verify user profile section displays:
  - Display name
  - Email
  - Phone (if set)
  - **Member Since** (formatted date)
  - **Last Sign In** (formatted date)
  - Email Confirmed status
  - Provider list
- [ ] Verify dates are formatted correctly (not raw timestamps)
- [ ] Click "View Submissions" button
- [ ] Verify submissions list appears
- [ ] Click "Edit Profile" link
- [ ] Verify navigation to profile edit page

**Expected Results**:
- ✅ Page loads without errors
- ✅ User data displays correctly
- ✅ Dates are formatted (e.g., "12/25/2024 3:45 PM")
- ✅ All profile fields show correct values
- ✅ Navigation works

**Regression Checks**:
- ✅ Same profile data displayed
- ✅ Date formatting matches previous behavior
- ✅ All links and buttons work

---

#### 2.2 Profile Edit (`/dashboard/profile-edit`)
**Template**: `server/ejs/profile-edit.ejs`  
**JS**: `server/public/js/profile-edit.js`

**Test Steps**:
- [ ] Load `/dashboard/profile-edit`
- [ ] Verify page renders without errors
- [ ] Check browser console for JS errors
- [ ] Verify all form fields display current values
- [ ] Edit display name field
- [ ] Save changes
- [ ] Verify success message
- [ ] Verify changes persist
- [ ] Test password change flow
- [ ] Test delete account flow (carefully!)

**Expected Results**:
- ✅ Page loads without errors
- ✅ Form fields populate correctly
- ✅ Updates save successfully
- ✅ Error messages display correctly

**Regression Checks**:
- ✅ Same form structure
- ✅ Same validation behavior
- ✅ Same save/error handling

---

### 3. Billing & Stripe Flows

#### 3.1 Billing Page (`/dashboard/billing`)
**Template**: `server/ejs/billing.ejs`  
**JS**: `server/public/js/pay.js`, `server/public/js/main.js`

**Test Steps**:
- [ ] Load `/dashboard/billing` as authenticated user
- [ ] Verify page renders without errors
- [ ] Check browser console for JS errors
- [ ] Verify product cards display:
  - Product name
  - Description
  - **Price** (formatted, e.g., "$99 USD one-time")
  - Buy button
- [ ] Verify prices are formatted correctly (not raw numbers)
- [ ] Click "Buy" button on a product
- [ ] Verify redirect to checkout review page

**Expected Results**:
- ✅ Page loads without errors
- ✅ Products display correctly
- ✅ Prices are formatted (e.g., "$99 USD one-time" not "9900")
- ✅ Buy buttons work

**Regression Checks**:
- ✅ Same product display
- ✅ Same price formatting
- ✅ Same navigation flow

---

#### 3.2 Checkout Review (`/dashboard/checkout/review`)
**Template**: `server/ejs/checkout-review.ejs`  
**JS**: `server/public/js/checkout-review.js`

**Test Steps**:
- [ ] Load checkout review page (from billing page)
- [ ] Verify page renders without errors
- [ ] Check browser console for JS errors
- [ ] Verify order summary displays:
  - Product name
  - Quantity
  - **Unit price** (formatted)
  - **Total** (formatted)
- [ ] Verify prices are formatted correctly
- [ ] Click "Continue to secure payment" button
- [ ] Verify redirect to Stripe Checkout
- [ ] Click "I'd like to review other options"
- [ ] Verify redirect back to billing

**Expected Results**:
- ✅ Page loads without errors
- ✅ Order summary displays correctly
- ✅ Prices formatted (e.g., "$99.00 USD" not "9900")
- ✅ Checkout button works
- ✅ No console errors

**Regression Checks**:
- ✅ Same order summary display
- ✅ Same checkout flow
- ✅ Same Stripe redirect

---

#### 3.3 Purchase Confirmation (`/dashboard/purchase/confirmation`)
**Template**: `server/ejs/purchase-confirmation.ejs`  
**JS**: `server/public/js/purchase-confirmation.js`

**Test Steps**:
- [ ] Complete a test purchase in Stripe
- [ ] Verify redirect to confirmation page
- [ ] Verify page renders without errors
- [ ] Check browser console for JS errors
- [ ] Verify confirmation details display:
  - Item name
  - **Total paid** (formatted currency, e.g., "$99.00 USD")
  - **Paid at** (formatted date/time)
  - Confirmation ID
- [ ] Click "Copy" button on confirmation ID
- [ ] Verify ID copies to clipboard
- [ ] Click "View official receipt" button
- [ ] Verify receipt URL opens (or fetches if not pre-loaded)
- [ ] Verify button state changes correctly (disabled/enabled)

**Expected Results**:
- ✅ Page loads without errors
- ✅ All data displays correctly
- ✅ Currency formatted (e.g., "$99.00 USD")
- ✅ Date formatted (e.g., "12/25/2024 3:45 PM")
- ✅ Copy button works
- ✅ Receipt button works
- ✅ No console errors

**Regression Checks**:
- ✅ Same confirmation data displayed
- ✅ Same formatting
- ✅ Same button behavior

---

#### 3.4 Receipt Page (`/dashboard/receipt`)
**Template**: `server/ejs/receipt.ejs`  
**JS**: `server/public/js/receipt.js`

**Test Steps**:
- [ ] Load receipt page (if route exists)
- [ ] Verify page renders without errors
- [ ] Check browser console for JS errors
- [ ] Verify receipt details display:
  - Payment status
  - **Date** (formatted)
  - Customer info
  - **Total** (formatted currency)
  - Card info (if available)
- [ ] Verify receipt items table displays:
  - Description
  - Quantity
  - **Amount** (formatted currency per item)
- [ ] Click "Print / Save PDF" button
- [ ] Verify print dialog opens
- [ ] Click "Email me this receipt" button (if feature enabled)
- [ ] Verify email request succeeds

**Expected Results**:
- ✅ Page loads without errors
- ✅ All data displays correctly
- ✅ Currency and dates formatted
- ✅ Print button works
- ✅ Email button works (if enabled)

**Regression Checks**:
- ✅ Same receipt data displayed
- ✅ Same formatting
- ✅ Same button behavior

---

### 4. Homepage & Public Pages

#### 4.1 Homepage (`/`)
**Template**: `server/ejs/index.ejs`  
**JS**: `server/public/js/main.js`

**Test Steps**:
- [ ] Load homepage as unauthenticated user
- [ ] Verify page renders without errors
- [ ] Check browser console for JS errors
- [ ] Verify navigation displays correctly
- [ ] Load homepage as authenticated user
- [ ] Verify different navigation (logout option)
- [ ] Test cross-tab logout sync (open dashboard in second tab, logout from first)

**Expected Results**:
- ✅ Page loads without errors
- ✅ Navigation adapts to auth state
- ✅ Cross-tab sync works
- ✅ No console errors

**Regression Checks**:
- ✅ Same homepage structure
- ✅ Same navigation behavior

---

### 5. Security & CSP Verification

#### 5.1 Content Security Policy
**Test Steps**:
- [ ] Load any protected page (dashboard, billing, etc.)
- [ ] Open browser DevTools → Network tab
- [ ] Check response headers for `Content-Security-Policy`
- [ ] Verify CSP includes nonce values
- [ ] Verify inline scripts have `nonce` attributes
- [ ] Verify no CSP violations in console

**Expected Results**:
- ✅ CSP headers present
- ✅ Nonces used correctly
- ✅ No CSP violations

**Regression Checks**:
- ✅ Same CSP behavior
- ✅ Same nonce usage

---

#### 5.2 CSRF Protection
**Test Steps**:
- [ ] Load any form page (login, register, profile-edit)
- [ ] Verify CSRF token in `<meta name="csrf-token">`
- [ ] Verify CSRF token in hidden form fields
- [ ] Submit form without CSRF token (via curl/Postman)
- [ ] Verify request is rejected (403)

**Expected Results**:
- ✅ CSRF tokens present
- ✅ CSRF protection works
- ✅ Forms submit correctly with tokens

**Regression Checks**:
- ✅ Same CSRF behavior
- ✅ Same token placement

---

### 6. Performance Verification

#### 6.1 View Caching (Production)
**Test Steps**:
- [ ] Set `NODE_ENV=production`
- [ ] Start server
- [ ] Check server logs for "View caching enabled for production"
- [ ] Load dashboard page multiple times
- [ ] Verify response times are fast (templates cached)
- [ ] Modify an EJS template file
- [ ] Verify changes don't appear (caching working)
- [ ] Restart server
- [ ] Verify changes appear (cache cleared on restart)

**Expected Results**:
- ✅ View caching enabled in production
- ✅ Fast response times
- ✅ Templates cached correctly

**Regression Checks**:
- ✅ Same performance or better
- ✅ No caching issues

---

#### 6.2 JavaScript Loading
**Test Steps**:
- [ ] Load each major page
- [ ] Open DevTools → Network tab
- [ ] Filter by "JS"
- [ ] Verify only necessary scripts load:
  - Dashboard: dashboard.js, main.js, shared scripts
  - Billing: pay.js, main.js, shared scripts
  - Checkout: checkout-review.js, modalManager.js, main.js
  - Purchase Confirmation: purchase-confirmation.js, modalManager.js, main.js
- [ ] Verify no 404 errors for scripts
- [ ] Verify scripts load in correct order

**Expected Results**:
- ✅ Only necessary scripts load
- ✅ No 404 errors
- ✅ Scripts load correctly

**Regression Checks**:
- ✅ Same script loading behavior
- ✅ No missing scripts

---

### 7. Browser Console Checks

#### 7.1 JavaScript Errors
**Test Steps**:
- [ ] Load each major page
- [ ] Open browser DevTools → Console tab
- [ ] Verify no red errors
- [ ] Check for any warnings
- [ ] Verify expected logs (if any) appear

**Expected Results**:
- ✅ No JavaScript errors
- ✅ No unexpected warnings
- ✅ Console is clean

---

#### 7.2 Network Requests
**Test Steps**:
- [ ] Load each major page
- [ ] Open DevTools → Network tab
- [ ] Verify all requests succeed (200, 201, etc.)
- [ ] Verify no failed requests (4xx, 5xx)
- [ ] Check API calls match expected endpoints
- [ ] Verify CSRF tokens sent in headers

**Expected Results**:
- ✅ All requests succeed
- ✅ No failed API calls
- ✅ Correct endpoints called

---

## Automated Test Recommendations

### Unit Tests (Existing)
The project already has unit tests using Vitest. These should continue to pass:

```bash
npm run test
```

**Key Test Files**:
- `server/__tests__/authFlows.test.js` - Auth flows
- `server/__tests__/authCookie.test.js` - Cookie handling
- `server/__tests__/profileEditAuth.test.js` - Profile editing
- `server/__tests__/health.test.js` - Health endpoints

### Recommended New Tests

#### 1. View Formatters Test
**File**: `server/__tests__/viewFormatters.test.js` (new)

```javascript
// Test viewFormatters helpers
describe('viewFormatters', () => {
  it('formats dates correctly', () => {
    // Test formatDateForDisplay
    // Test formatDateOnly
  });
  
  it('formats currency correctly', () => {
    // Test formatCurrency
    // Test formatPrice
  });
  
  it('sanitizes URLs correctly', () => {
    // Test sanitizeUrl
  });
});
```

#### 2. Route Handler Tests
**Enhancement**: Add tests to verify route handlers pass pre-formatted data:

```javascript
// In existing route tests
it('dashboard route formats dates server-side', async () => {
  // Verify user.created_at_formatted is present
  // Verify user.last_sign_in_at_formatted is present
});

it('billing route pre-computes products', async () => {
  // Verify billing.products.oneTime exists
  // Verify billing.products.expert exists
  // Verify products have priceFormatted
});
```

#### 3. Template Rendering Tests
**File**: `server/__tests__/templateRendering.test.js` (new)

```javascript
// Test that templates render without errors
describe('Template Rendering', () => {
  it('dashboard template renders with formatted dates', async () => {
    // Render dashboard template
    // Verify no EJS errors
    // Verify formatted dates in output
  });
  
  it('billing template renders with formatted prices', async () => {
    // Render billing template
    // Verify formatted prices in output
  });
});
```

---

## Regression Test Matrix

| Feature | Template | Critical Checks | Status |
|---------|----------|----------------|--------|
| Login | `login.ejs` | Form submits, errors display, CSRF | ⬜ |
| Register | `register.ejs` | Form submits, validation, CSRF | ⬜ |
| Dashboard | `dashboard.ejs` | Dates formatted, profile data, navigation | ⬜ |
| Profile Edit | `profile-edit.ejs` | Form loads, saves, validation | ⬜ |
| Billing | `billing.ejs` | Products display, prices formatted, buy buttons | ⬜ |
| Checkout Review | `checkout-review.ejs` | Order summary, prices formatted, checkout button | ⬜ |
| Purchase Confirmation | `purchase-confirmation.ejs` | Data displays, prices/dates formatted, receipt button | ⬜ |
| Receipt | `receipt.ejs` | Data displays, prices/dates formatted, print/email | ⬜ |
| Homepage | `index.ejs` | Renders, navigation, cross-tab sync | ⬜ |
| Logout | `logout.js` | Logout works, cross-tab sync | ⬜ |

**Legend**:
- ⬜ = Not tested
- ✅ = Passed
- ❌ = Failed
- ⚠️ = Partial/Warning

---

## Quick Smoke Test (5 minutes)

For a quick verification, run these critical tests:

1. **Login Flow** (1 min)
   - Load `/login`
   - Submit valid credentials
   - Verify redirect to dashboard

2. **Dashboard** (1 min)
   - Load `/dashboard`
   - Verify dates are formatted (not raw timestamps)
   - Verify profile data displays

3. **Billing** (1 min)
   - Load `/dashboard/billing`
   - Verify prices are formatted (not raw numbers)
   - Click buy button, verify redirect

4. **Purchase Confirmation** (1 min)
   - Complete test purchase
   - Verify confirmation page loads
   - Verify prices and dates are formatted

5. **Console Check** (1 min)
   - Open browser console on any page
   - Verify no errors

---

## Known Issues & Workarounds

### None Currently Known

If issues are found during testing, document them here with:
- Description
- Steps to reproduce
- Expected vs actual behavior
- Workaround (if any)
- Fix status

---

## Test Execution Log

### Test Run: [DATE]

**Tester**: [Name]  
**Environment**: [Development/Staging/Production]  
**Node Version**: [Version]  
**Browser**: [Chrome/Firefox/etc + Version]

#### Results Summary
- **Total Tests**: [Number]
- **Passed**: [Number]
- **Failed**: [Number]
- **Warnings**: [Number]

#### Failed Tests
[List any failures with details]

#### Notes
[Any observations or issues]

---

## Sign-Off

**Phase 6 Status**: ⬜ Pending / ✅ Complete

**Verified By**: [Name]  
**Date**: [Date]  
**Approved For**: [Production/Next Phase]

---

## Next Steps After Testing

1. **If All Tests Pass**:
   - ✅ Mark Phase 6 as complete
   - ✅ Update `EJS_OPTIMIZATION_PROGRESS.md` with test results
   - ✅ Ready for production deployment

2. **If Issues Found**:
   - Document issues in this file
   - Fix issues
   - Re-run affected tests
   - Update test log

3. **Future Enhancements**:
   - Add automated E2E tests (Playwright/Cypress)
   - Add visual regression tests
   - Add performance benchmarks

