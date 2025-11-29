# Quick Verification Checklist

## 5-Minute Smoke Test

Run these critical checks to verify EJS optimizations work:

### 1. Server Boots ✅
```bash
npm run start
# Or: docker-compose up
```
- [ ] Server starts without errors
- [ ] Check logs for "View caching enabled for production" (if NODE_ENV=production)

### 2. Login Flow ✅
- [ ] Navigate to `/login`
- [ ] Page loads without errors
- [ ] Browser console shows no errors
- [ ] Submit valid credentials
- [ ] Redirects to dashboard

### 3. Dashboard ✅
- [ ] Navigate to `/dashboard`
- [ ] Page loads without errors
- [ ] Check "Member Since" and "Last Sign In" dates
- [ ] **Verify dates are formatted** (e.g., "12/25/2024 3:45 PM")
- [ ] **NOT raw timestamps** (e.g., "2024-12-25T15:45:30Z")

### 4. Billing Page ✅
- [ ] Navigate to `/dashboard/billing`
- [ ] Page loads without errors
- [ ] Check product prices
- [ ] **Verify prices are formatted** (e.g., "$99 USD one-time")
- [ ] **NOT raw numbers** (e.g., "9900")
- [ ] Click "Buy" button
- [ ] Redirects to checkout review

### 5. Checkout Review ✅
- [ ] On checkout review page
- [ ] Check "Unit price" and "Total"
- [ ] **Verify prices are formatted** (e.g., "$99.00 USD")
- [ ] Click "Continue to secure payment"
- [ ] Redirects to Stripe

### 6. Browser Console ✅
- [ ] Open DevTools → Console
- [ ] **Verify no red errors**
- [ ] Check for any warnings

---

## Expected Results

✅ **All checks pass** = Optimizations working correctly  
❌ **Any check fails** = Review error and check regression

---

## Common Issues

### Dates show as raw timestamps
**Symptom**: Dashboard shows "2024-12-25T15:45:30Z" instead of "12/25/2024 3:45 PM"  
**Cause**: Route handler not formatting dates  
**Fix**: Check `server/routes/dashboard.js` includes `formatDateForDisplay()`

### Prices show as raw numbers
**Symptom**: Billing shows "9900" instead of "$99.00 USD"  
**Cause**: Route handler not formatting prices  
**Fix**: Check `server/routes/dashboard-billing.js` includes `formatPrice()`

### JavaScript errors in console
**Symptom**: Red errors in browser console  
**Cause**: Missing script files or broken references  
**Fix**: Check script paths in templates match actual files

### Template rendering errors
**Symptom**: EJS errors in server logs  
**Cause**: Missing variables or syntax errors  
**Fix**: Check template for undefined variables

---

## Full Test Plan

For comprehensive testing, see: `docs/EJS_PHASE6_TEST_PLAN.md`

