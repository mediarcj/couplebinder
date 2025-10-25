# Stripe Dynamic Pricing Implementation

**Date:** October 25, 2025  
**Status:** Complete  
**Goal:** Make /dashboard/billing render product data directly from Stripe

---

## Changes Made

### 1. New File: `server/services/pricingCatalog.js`

**Purpose:** Fetch and cache pricing information from Stripe for allowlisted price IDs.

**Features:**
- Fetches price and product data for `STRIPE_PRICE_RESUME_ONE_TIME` and `STRIPE_PRICE_RESUME_EXPERT`
- Expands product data to get metadata (display_name, blurb)
- Caches results in memory after first fetch
- Returns structured pricing data with: priceId, unit_amount, currency, isRecurring, interval, name, blurb

**Exports:**
- `getPricingCatalog()` - Returns array of price objects
- `getPriceSummary(priceId)` - Returns single price object or null

---

### 2. Modified: `server/routes/dashboard-billing.js`

**Changes:**
- Imported `getPricingCatalog` from pricing catalog service
- Added pricing fetch in the billing route handler
- Pass pricing data to the view via `pageModel.billing.pricing`
- Pass environment variables for price ID lookups via `pageModel.env`

**Behavior:**
- Fetch pricing catalog from Stripe on each request
- Silently handle errors with fallback to defaults in template
- Pricing is cached in-memory at service level

---

### 3. Modified: `server/ejs/billing.ejs`

**Changes:**
- Added logic to find pricing data for each product
- Replace hard-coded names with `pOne?.name` and `pTwo?.name`
- Replace hard-coded blurbs with `pOne?.blurb` and `pTwo?.blurb`
- Calculate price dynamically from `unit_amount` and `currency`
- Show interval (month, year, etc.) for recurring products
- Add `data-price-id` attribute to buttons
- Use dynamic `data-price-type` based on `isRecurring`

**Fallbacks:**
- Default name: "Resume Pro" / "Resume Expert Revamp"
- Default blurb: Original hard-coded descriptions
- Default amount: $9 / $49 if pricing fetch fails
- Default currency: USD if not specified

---

## How It Works

### 1. Server-Side Flow

```
Request → Dashboard Billing Route
  ↓
Fetch Pricing Catalog (cached after first call)
  ↓
Pass pricing data to view
  ↓
Render template with Stripe data
  ↓
Client receives HTML with dynamic pricing
```

### 2. Pricing Data Structure

```javascript
{
  priceId: "price_xxx",
  unit_amount: 900, // cents
  currency: "usd",
  isRecurring: true,
  interval: "month",
  name: "Resume Expert",
  blurb: "Deep revision by experts"
}
```

### 3. Template Rendering

Template finds matching price ID from environment variables:
- `STRIPE_PRICE_RESUME_ONE_TIME` → First card
- `STRIPE_PRICE_RESUME_EXPERT` → Second card

If price not found in array, uses fallback defaults.

---

## Benefits

1. **Single Source of Truth:** Prices come from Stripe, not hard-coded
2. **Automatic Updates:** Changing Stripe prices updates UI automatically
3. **Metadata Support:** Can use Stripe product/price metadata for names/blurbs
4. **Recurring Support:** Automatically shows interval for recurring products
5. **Graceful Fallbacks:** UI still works if Stripe fetch fails

---

## Testing

### Expected Behavior

1. **One-Time Product:**
   - Shows: "$9 USD one-time"
   - Button: data-price-type="one_time"

2. **Recurring Product:**
   - Shows: "$49 USD /month"
   - Button: data-price-type="recurring"

3. **Fallback:**
   - If Stripe API fails, shows hard-coded defaults
   - Page still loads and functions normally

---

## Acceptance Criteria Met

- [x] Billing page fetches pricing from Stripe
- [x] Product names displayed from Stripe metadata or product name
- [x] Prices calculated from Stripe unit_amount
- [x] Currency displayed dynamically
- [x] Recurring products show interval
- [x] Fallback to defaults if Stripe fetch fails
- [x] Button IDs preserved (buyResumeBasic, buyResumeExpert)
- [x] data-price-id attributes added
- [x] data-price-type set dynamically
- [x] No changes to checkout/session logic
- [x] No database changes
- [x] Follows building laws

---

## Files Changed

1. **NEW:** `server/services/pricingCatalog.js` - Pricing service
2. **MODIFIED:** `server/routes/dashboard-billing.js` - Route handler
3. **MODIFIED:** `server/ejs/billing.ejs` - Template

---

## Security Notes

- ✅ No sensitive data in logs
- ✅ Pricing fetch errors handled gracefully
- ✅ Follows existing security patterns
- ✅ No new environment variables required
- ✅ Uses existing Stripe client configuration

---

**Status:** Ready for testing and deployment ✅
