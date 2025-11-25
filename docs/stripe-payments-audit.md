# Stripe + Supabase Payments Integration Audit

**Date:** 2025-01-XX  
**Context:** Debugging issue where Stripe Checkout payments are not being written to `public.payments` table in Supabase. Development environment running on `http://localhost:3000`, webhooks showing 400 Bad Request in Stripe dashboard.

---

## Executive Summary

This audit identified **one critical blocking issue** and several risk points that could prevent successful payment persistence:

1. **CRITICAL BUG**: Inverted Stripe mode selection logic in `server/config/index.js` (lines 190-191) causes development to use live keys when it should use test keys, and vice versa.
2. **Schema mismatch**: Migration file defines `status` as enum type, but actual schema uses `text`. Code writes text values which should work, but this inconsistency could cause confusion.
3. **Webhook signature verification**: Code tries both live and test secrets, but the mode selection bug means it may try the wrong secrets first.
4. **Missing field validation**: The `price_id` column is required (`NOT NULL`) but the code may not always supply it if metadata is missing.

---

## Current Architecture Overview

### Stripe Configuration Flow

1. **Config Loading** (`server/config/index.js`):
   - Loads dual-set Stripe keys: `STRIPE_*_LIVE` and `STRIPE_*_TEST`
   - Determines active mode based on `NODE_ENV`
   - Exports `config.stripe.active` with the selected keys

2. **Checkout Session Creation** (`server/routes/payments.js` → `server/services/billingService.js`):
   - User calls `POST /api/pay/checkout` with SKU
   - Server validates SKU against allowlist
   - Creates Stripe Checkout Session with metadata: `user_id`, `price_id`, `product_key`
   - Returns checkout URL to client

3. **Webhook Processing** (`server/routes/stripeWebhook.js`):
   - Stripe sends `checkout.session.completed` event to `/api/stripe/webhook`
   - Handler verifies signature using webhook secret
   - Retrieves full session from Stripe API
   - Extracts metadata and writes to `public.payments` table

4. **Fallback Persistence** (`server/routes/payments.js`):
   - When user fetches receipt or session status, code checks if payment is paid
   - If paid and not yet in DB, calls `upsertPaymentFromSession()` as fallback

### Database Schema

**Migration file** (`db/migrations/20251022_stripe_billing_tables.sql`):
- Defines `status` as enum type: `public.payment_status`
- Requires: `product_key text not null`
- Does NOT include `price_id` column

**Actual schema** (`db/detechify_schema.sql`):
- Defines `status` as `text NOT NULL` (not enum)
- Requires: `price_id text NOT NULL`
- Requires: `product_key text` (nullable)

**Code writes**:
- `status: 'paid'` (text value)
- `price_id: priceId` (from metadata)
- `product_key: productKey` (from metadata)

---

## Blocking Issues

### 1. CRITICAL: Inverted Stripe Mode Selection Logic

**Location:** `server/config/index.js` lines 190-191

**Current Code:**
```javascript
const stripeMode = (nodeEnv === 'development') ? 'live' : 'test';
const stripeActive = stripeMode === 'test' ? stripeLive : stripeTest;
```

**Problem:**
- When `NODE_ENV === 'development'`, `stripeMode` is set to `'live'`
- Then `stripeActive` checks if `stripeMode === 'test'` (which is false)
- So it uses `stripeTest` (correct for development)
- But the logic is backwards and confusing

- When `NODE_ENV === 'production'`, `stripeMode` is set to `'test'`
- Then `stripeActive` checks if `stripeMode === 'test'` (which is true)
- So it uses `stripeLive` (correct for production)

**Impact:**
- The logic actually works by accident, but it's inverted and confusing
- If you intended development to use test mode, the current code does that, but the variable names are misleading
- The webhook handler uses `config.stripe.mode` to determine which secret to try first, so if mode is wrong, it may fail signature verification

**Fix:**
```javascript
const stripeMode = (nodeEnv === 'development') ? 'test' : 'live';
const stripeActive = stripeMode === 'live' ? stripeLive : stripeTest;
```

Or more clearly:
```javascript
const stripeMode = (nodeEnv === 'development') ? 'test' : 'live';
const stripeActive = stripeMode === 'live' ? stripeLive : stripeTest;
```

**Recommendation:** Fix this immediately. The inverted logic may cause webhook signature verification to fail if the wrong secret is tried first and the second attempt also fails due to timing or other issues.

---

## Risk Points (Not Strictly Blocking)

### 2. Schema Mismatch Between Migration and Actual Schema

**Location:** 
- Migration: `db/migrations/20251022_stripe_billing_tables.sql` line 55
- Actual: `db/detechify_schema.sql` line 3269

**Issue:**
- Migration defines: `status public.payment_status not null` (enum type)
- Actual schema has: `status text NOT NULL` (text type)
- Code writes: `status: 'paid'` (text value)

**Impact:**
- Code should work with text type, but the migration file is misleading
- If someone runs the migration on a fresh database, it will create an enum type that the code doesn't use
- This could cause confusion during debugging

**Recommendation:** 
- Update the migration file to use `text` instead of enum, OR
- Update the code to use the enum values if you want type safety
- Document which schema is the source of truth

### 3. Missing `price_id` Column in Migration

**Location:** `db/migrations/20251022_stripe_billing_tables.sql`

**Issue:**
- Migration does not include `price_id` column
- Actual schema requires `price_id text NOT NULL`
- Code always writes `price_id` from metadata

**Impact:**
- If migration is run on fresh DB, inserts will fail with "column price_id does not exist"
- Actual database likely has this column added manually or via a different migration

**Recommendation:**
- Add `price_id text NOT NULL` to the migration file
- Or create a separate migration to add this column
- Verify all required columns match between migration and actual schema

### 4. Webhook Signature Verification Order

**Location:** `server/routes/stripeWebhook.js` lines 60-86

**Current Behavior:**
- Tries secrets in order based on `config.stripe.mode`
- If mode is 'live', tries live secret first, then test
- If mode is 'test', tries test secret first, then live

**Risk:**
- If mode selection is wrong (due to bug #1), it may try the wrong secret first
- If both secrets are similar or one is empty, it might verify with wrong mode
- No explicit logging of which secret succeeded

**Recommendation:**
- Fix the mode selection bug first
- Add explicit logging: "Signature verified with [live|test] secret"
- Consider adding a check to ensure the verified mode matches the session's mode

### 5. Missing Field Validation in Webhook Handler

**Location:** `server/routes/stripeWebhook.js` lines 145-159

**Current Behavior:**
- Checks if required fields are present before upsert
- Returns 200 if fields are missing (so Stripe doesn't retry)

**Risk:**
- If `price_id` is missing from metadata, the upsert will fail
- The code returns 200, so Stripe won't retry
- Payment may never be persisted

**Recommendation:**
- The current guard is good, but consider logging a warning when returning 200 for missing fields
- Add fallback to extract `price_id` from line items if metadata is missing (code already does this, but only if `metaPriceId` is null)

### 6. Supabase Admin Client Initialization

**Location:** `server/utils/supabaseClient.js`

**Current Behavior:**
- Uses `SUPABASE_SERVICE_ROLE_KEY` from config or env
- Exports `supabaseAdmin` for database writes
- Falls back to env vars if config is missing

**Risk:**
- If service role key is missing in development, `supabaseAdmin` will be `null`
- Code will throw errors when trying to write to database
- No early validation that admin client is available

**Recommendation:**
- Verify `SUPABASE_SERVICE_ROLE_KEY` is set in development `.env.development.local`
- Add startup check to ensure `supabaseAdmin` is not null when Stripe is configured
- Log a warning if admin client is missing

---

## Middleware Order Verification

### Webhook Route Mounting

**Location:** `server/zorvalon.js` lines 487-493

**Current Order:**
1. OPTIONS preflight handler (line 162)
2. Security headers (line 248)
3. CORS allowlist (line 480)
4. **Stripe webhook (line 488)** ← Mounted BEFORE body parsers
5. Body parsers (lines 496-497)
6. Cookie parsing (line 500)
7. Auth bridge (line 508)
8. CSRF protection (line 644)

**Status:** ✅ **CORRECT** - Webhook is mounted before JSON body parser, so raw body is available for signature verification.

### NGINX Configuration

**Location:** `nginx/templates/ssl.conf` lines 117-129

**Current Configuration:**
- `proxy_request_buffering off` ✅
- `proxy_buffering off` ✅
- `proxy_max_temp_file_size 0` ✅
- `proxy_read_timeout 30s` ✅

**Status:** ✅ **CORRECT** - NGINX is configured to pass raw body to app for webhook signature verification.

---

## Code Path Analysis

### Payment Persistence Paths

#### Path 1: Webhook Handler (Primary)

**File:** `server/routes/stripeWebhook.js`

**Flow:**
1. Receive webhook event (line 38)
2. Verify signature with live or test secret (lines 67-86)
3. Handle `checkout.session.completed` event (line 101)
4. Retrieve full session from Stripe (line 106)
5. Extract metadata: `user_id`, `price_id`, `product_key` (lines 111-143)
6. Validate required fields (lines 146-159)
7. Upsert to `public.payments` (lines 177-179)

**Fields Written:**
- `user_id`: from `metadata.user_id` or `client_reference_id`
- `price_id`: from `metadata.price_id` or line items
- `product_key`: from `metadata.product_key` or price mapping
- `amount`: from `amount_total`
- `currency`: from `currency`
- `status`: hardcoded to `'paid'`
- `stripe_checkout_session_id`: from session `id`
- `stripe_payment_intent_id`: from `payment_intent.id`
- `metadata`: full session metadata object

**Potential Issues:**
- If metadata is missing, code falls back to line items (good)
- If both metadata and line items fail, returns 200 without persisting (risk)
- No explicit check that `price_id` is in the allowlist

#### Path 2: Fallback Persistence (Secondary)

**File:** `server/routes/payments.js`

**Flow:**
1. User calls `GET /api/pay/receipt` or `GET /api/pay/session` (lines 159, 249)
2. Retrieve session from Stripe (lines 168, 259)
3. Check ownership (lines 173-181, 264-274)
4. Call `persistIfPaid()` if `payment_status === 'paid'` (lines 184, 277)
5. `persistIfPaid()` calls `upsertPaymentFromSession()` (line 69)

**Fields Written:**
- Same as webhook path, via `upsertPaymentFromSession()` in `billingService.js`

**Potential Issues:**
- Only runs if user manually fetches receipt/session
- If webhook fails, this is the only way payment gets persisted
- No guarantee user will call these endpoints

---

## Environment Variable Verification

### Required Variables for Development

Based on code analysis, development needs:

```bash
# Stripe Test Mode (for development)
STRIPE_SECRET_KEY_TEST=sk_test_...
STRIPE_PUBLISHABLE_KEY_TEST=pk_test_...
STRIPE_WEBHOOK_SECRET_TEST=whsec_...
STRIPE_PRICE_RESUME_ONE_TIME_TEST=price_...
STRIPE_PRICE_RESUME_EXPERT_TEST=price_...

# Supabase (required for database writes)
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_ANON_KEY=eyJ...

# Public Origin (required for checkout redirects)
PUBLIC_ORIGIN=http://localhost:3000
```

### Current Mode Selection

**Issue:** The mode selection logic is inverted (see Blocking Issue #1).

**Expected Behavior (after fix):**
- `NODE_ENV=development` → use test mode
- `NODE_ENV=production` → use live mode

**Current Behavior (buggy but works by accident):**
- `NODE_ENV=development` → `stripeMode='live'` but uses `stripeTest` (correct result, wrong path)
- `NODE_ENV=production` → `stripeMode='test'` but uses `stripeLive` (correct result, wrong path)

---

## Recommendations

### Immediate Actions (Fix Blocking Issues)

1. **Fix Stripe Mode Selection Logic**
   - File: `server/config/index.js` lines 190-191
   - Change to: `const stripeMode = (nodeEnv === 'development') ? 'test' : 'live';`
   - Change to: `const stripeActive = stripeMode === 'live' ? stripeLive : stripeTest;`
   - Test: Verify development uses test keys and production uses live keys

2. **Verify Environment Variables**
   - Check `.env.development.local` has `STRIPE_WEBHOOK_SECRET_TEST` set
   - Check `SUPABASE_SERVICE_ROLE_KEY` is set and valid
   - Verify webhook secret matches the one in Stripe Dashboard → Webhooks → Endpoint secrets

3. **Test Webhook Signature Verification**
   - Use Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   - Trigger test event: `stripe trigger checkout.session.completed`
   - Check server logs for "Signature verified with test secret" (add this log if missing)
   - Verify payment appears in `public.payments` table

### Short-Term Improvements

4. **Add Explicit Logging**
   - In `stripeWebhook.js` line 73, after successful verification, log: `"Signature verified with [mode] secret"`
   - In `stripeWebhook.js` line 193, log the mode used: `"Payment recorded using [mode] keys"`

5. **Schema Alignment**
   - Update migration file to match actual schema (use `text` for status, add `price_id` column)
   - Or create a new migration to add missing columns
   - Document which schema is source of truth

6. **Add Startup Validation**
   - In `server/zorvalon.js`, after config loads, verify:
     - If Stripe prices are configured, `supabaseAdmin` is not null
     - If Stripe is configured, webhook secret is not empty
     - Log warnings for missing required config

### Long-Term Improvements

7. **Add Integration Tests**
   - Test webhook signature verification with both live and test secrets
   - Test payment persistence with missing metadata (should fall back to line items)
   - Test fallback persistence path when webhook fails

8. **Improve Error Handling**
   - If webhook signature verification fails, log which secrets were tried
   - If payment persistence fails, return 500 (not 200) so Stripe retries
   - Add retry logic for transient Supabase errors

9. **Add Monitoring**
   - Track webhook delivery success rate
   - Alert if webhook signature verification fails repeatedly
   - Monitor payment persistence success rate

---

## File Reference Summary

### Key Files Inspected

1. **`server/config/index.js`** (lines 172-193)
   - Stripe configuration loading
   - Mode selection logic (BUG HERE)

2. **`server/routes/stripeWebhook.js`** (lines 33-295)
   - Webhook endpoint handler
   - Signature verification
   - Payment persistence

3. **`server/services/billingService.js`** (lines 200-234)
   - `upsertPaymentFromSession()` function
   - Database write logic

4. **`server/routes/payments.js`** (lines 66-98)
   - Fallback persistence function
   - Receipt/session fetching

5. **`server/zorvalon.js`** (lines 487-493)
   - Webhook route mounting
   - Middleware order

6. **`server/utils/supabaseClient.js`** (lines 79-81)
   - Supabase admin client initialization

7. **`nginx/templates/ssl.conf`** (lines 117-129)
   - NGINX webhook configuration

8. **`db/migrations/20251022_stripe_billing_tables.sql`** (lines 47-59)
   - Payments table schema (migration)

9. **`db/detechify_schema.sql`** (lines 3261-3278)
   - Actual payments table schema

---

## Testing Checklist

After applying fixes, test the following:

- [ ] Development uses test Stripe keys (check logs for "using test mode")
- [ ] Webhook signature verification succeeds (check logs for "Signature verified")
- [ ] Payment is written to `public.payments` after successful checkout
- [ ] All required fields are present in payment row (`user_id`, `price_id`, `product_key`, `amount`, `currency`, `status`)
- [ ] Fallback persistence works if webhook is delayed (fetch receipt endpoint)
- [ ] Supabase admin client is initialized (check startup logs)
- [ ] NGINX passes raw body to app (check webhook receives full body)

---

## Conclusion

The primary blocking issue is the **inverted Stripe mode selection logic** in `server/config/index.js`. While it works by accident due to the double negation, it's confusing and may cause webhook signature verification to fail if the wrong secret is tried first.

The webhook handler, middleware order, and NGINX configuration are all correct. The main risks are:
1. Schema mismatches between migration and actual database
2. Missing validation that required fields are always present
3. Lack of explicit logging for which mode/secret was used

Fix the mode selection bug first, then verify environment variables are set correctly, and test the webhook flow end-to-end.

