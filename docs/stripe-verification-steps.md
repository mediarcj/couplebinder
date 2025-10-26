# Stripe Integration Verification Steps

**Status:** ✅ Complete  
**Last Updated:** October 24, 2025

---

## Quick Verification (Test Mode)

### Prerequisites

- Stripe test account with test API keys
- Stripe CLI installed (`brew install stripe/stripe-cli/stripe`)
- Node.js application running on localhost:3000

---

## Step 1: Start Stripe CLI Webhook Forwarding

```bash
# Install Stripe CLI if not already installed
brew install stripe/stripe-cli/stripe

# Login to Stripe account
stripe login

# Forward webhooks to local endpoint
stripe listen --forward-to localhost:3000/webhooks/stripe
```

**Expected Output:**
```
> Ready! Your webhook signing secret is whsec_... (^C to quit)
```

**Note:** Copy the webhook signing secret - you'll need it in `.env` as `STRIPE_WEBHOOK_SECRET`

---

## Step 2: Configure Test Environment

Update your `.env` file:

```bash
# Stripe Test Credentials
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...  # From Stripe CLI output above
STRIPE_PRICE_RESUME_ONE_TIME=price_...  # Your test price ID
STRIPE_PRICE_RESUME_EXPERT=price_...    # Your test price ID

# Application URL
PUBLIC_ORIGIN=http://localhost:3000
```

---

## Step 3: Run Database Migrations

```bash
# Apply Stripe billing tables
psql -d your_database -f db/migrations/20251022_stripe_billing_tables.sql

# Apply environment-specific customer columns
psql -d your_database -f db/migrations/20251025_stripe_customer_env_split.sql

# Apply indexes and RLS policies
psql -d your_database -f db/manual/stripe_indexes_and_policies.sql
```

---

## Step 4: Test Successful Payment Flow

### 4.1 Initiate Checkout

1. Navigate to: `http://localhost:3000/dashboard/billing`
2. Click "Buy Now" on Resume Pro or Resume Expert
3. You should be redirected to Stripe Checkout

### 4.2 Complete Payment (Test Card)

Use test card details:
- **Card:** `4242 4242 4242 4242`
- **Expiry:** Any future date (e.g., `12/25`)
- **CVC:** Any 3 digits (e.g., `123`)
- **ZIP:** Any 5 digits (e.g., `12345`)

Click "Pay" to complete checkout.

### 4.3 Verify Success

**Expected Results:**
1. ✅ Redirected to `/dashboard/billing?paid=1`
2. ✅ Success message displayed
3. ✅ Payment appears in purchase history
4. ✅ Webhook received and logged (check Stripe CLI output)
5. ✅ Database record created in `payments` table

**Check Logs:**
```bash
# In your application logs, you should see:
# ✓ "Checkout session completed - payment received"
# ✓ Event: stripe.checkout.session.completed
```

**Check Database:**
```sql
SELECT * FROM payments ORDER BY created_at DESC LIMIT 1;
-- Should show: status='paid', product_key, amount, currency
```

---

## Step 5: Test Refund Flow

### 5.1 Create Refund in Stripe Dashboard

1. Go to [Stripe Dashboard → Payments](https://dashboard.stripe.com/test/payments)
2. Find the test payment
3. Click "Refund" → "Refund payment"

### 5.2 Verify Refund Webhook

**Expected Results:**
1. ✅ Webhook received (check Stripe CLI output)
2. ✅ Log shows: `Charge refunded - full refund`
3. ✅ Database updated: `status='refunded'`

**Check Logs:**
```bash
# In your application logs:
# ✓ Event: stripe.charge.refunded
# ✓ isFullRefund: true
```

**Check Database:**
```sql
SELECT * FROM payments ORDER BY created_at DESC LIMIT 1;
-- Should show: status='refunded'
```

---

## Troubleshooting

### Issue: "Price not allowed" (400 error)

**Cause:** Price ID not in allowlist or environment variable not set.

**Solution:**
```bash
# Verify price IDs are set correctly
echo $STRIPE_PRICE_RESUME_ONE_TIME
echo $STRIPE_PRICE_RESUME_EXPERT

# Ensure they match your Stripe Dashboard → Products
```

---

### Issue: Webhook not received

**Cause:** Webhook endpoint not accessible or signature mismatch.

**Solution:**
1. Verify Stripe CLI is running: `stripe listen --forward-to localhost:3000/webhooks/stripe`
2. Check `STRIPE_WEBHOOK_SECRET` matches CLI output
3. Verify application is listening on port 3000

---

### Issue: "null value violates not-null constraint"

**Cause:** Migration not applied or customer creation failing.

**Solution:**
```bash
# Re-run migrations
psql -d your_database -f db/migrations/20251022_stripe_billing_tables.sql
psql -d your_database -f db/migrations/20251025_stripe_customer_env_split.sql
```

---

### Issue: Customer mismatch (test/live)

**Cause:** Using live customer ID with test key (or vice versa).

**Solution:**
- Ensure `STRIPE_SECRET_KEY` starts with `sk_test_` for test mode
- Check `stripe_customer_id_test` column for test customers
- Check `stripe_customer_id_live` column for live customers

---

## Verification Checklist

Before moving to production, verify:

- [ ] Test payment completes successfully
- [ ] Payment record created in `payments` table
- [ ] Webhook events received and logged
- [ ] Refund processed and status updated
- [ ] Customer records created in `billing_customers` table
- [ ] No database constraint violations
- [ ] No errors in application logs
- [ ] Success/cancel URLs working correctly

---

## Production Deployment

Once test mode is verified:

1. **Update environment variables** with live keys
2. **Configure production webhook** in Stripe Dashboard
3. **Run migrations** on production database
4. **Test with real card** (small amount)
5. **Verify webhook receipt** in production logs
6. **Monitor** for errors in production

---

## Support

- **Stripe Documentation:** https://stripe.com/docs
- **Webhook Testing:** https://stripe.com/docs/webhooks/test
- **Test Cards:** https://stripe.com/docs/testing
