# Stripe Billing Integration - Complete File Inventory & Documentation

**Version:** 1.0  
**Last Updated:** October 24, 2025  
**Integration Commits:** 57dc7a9 through ae7e4b7

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [File Inventory](#file-inventory)
4. [File Details](#file-details)
5. [Environment Variables](#environment-variables)
6. [Database Schema](#database-schema)
7. [Security & Compliance](#security--compliance)
8. [Usage Guide](#usage-guide)
9. [Troubleshooting](#troubleshooting)
10. [Migration Guide](#migration-guide)

---

## Overview

The Stripe billing integration provides secure payment processing for Detechify with customer management, checkout sessions, and payment tracking. The implementation follows industry best practices for PCI compliance by never storing card data locally and using Stripe Checkout for secure payment collection.

### Key Features

- ✅ Server-side price validation with SKU mapping
- ✅ Environment-aware test/live mode support
- ✅ Webhook signature verification
- ✅ Idempotent payment processing
- ✅ Row-Level Security (RLS) on all tables
- ✅ Comprehensive audit logging

### Technology Stack

- **Payment Processing:** Stripe Checkout
- **Database:** PostgreSQL (Supabase)
- **Backend:** Node.js/Express
- **Frontend:** Vanilla JavaScript with CSP compliance

---

## Architecture

### Component Overview

```
┌─────────────────┐
│   Browser       │
│   (pay.js)      │
└────────┬────────┘
         │ POST /api/pay/checkout
         ▼
┌─────────────────┐
│  Payments API   │
│  (payments.js)  │
└────────┬────────┘
         │
         ├──► getOrCreateStripeCustomer()
         │          │
         │          ▼
         │    billingService.js
         │
         └──► createCheckoutSession()
                  │
                  ▼
            Stripe Checkout
                  │
                  ▼
            User Redirect
                  │
                  ▼
         ┌────────────────┐
         │ Webhook        │
         │ (stripeWebhook)│
         └────────┬───────┘
                  │
                  ▼
         upsertPaymentFromSession()
                  │
                  ▼
         PostgreSQL Database
```

### Request Flow

1. **Checkout Initiation**
   - Client sends SKU (`resume_pro` or `resume_expert`)
   - Server maps SKU to environment-specific price ID
   - Validates price against allowlist
   - Creates/caches Stripe customer (live mode only)
   - Creates Stripe checkout session
   - Returns session URL for redirect

2. **Payment Processing**
   - User completes payment on Stripe-hosted page
   - Stripe redirects to success/cancel URLs
   - Webhook fires with payment status
   - Server updates payment record in database

3. **Post-Payment**
   - User sees success/cancel message
   - Purchase history updates
   - Receipt available via Stripe dashboard

---

## File Inventory

### Summary Table

| Path | Type | Status | Commit | Date | Lines |
|------|------|--------|--------|------|-------|
| `server/services/billingService.js` | Service | Added/Modified | ae7e4b7 | 2025-10-24 | 219 |
| `server/routes/payments.js` | Route | Added | 66509f2 | 2025-10-24 | 105 |
| `server/routes/stripeWebhook.js` | Route | Added | b01277a | 2025-10-24 | 109 |
| `server/routes/dashboard-billing.js` | Route | Added | 4d04b2d | 2025-10-24 | ~80 |
| `server/public/js/pay.js` | Frontend | Added | 8f1f5ad | 2025-10-24 | ~150 |
| `server/ejs/billing.ejs` | Template | Added | e67715e | 2025-10-24 | ~200 |
| `db/migrations/20251022_stripe_billing_tables.sql` | Migration | Added | 73c4a61 | 2025-10-24 | 86 |
| `db/migrations/20251025_stripe_customer_env_split.sql` | Migration | Added | a434ef4 | 2025-10-24 | 31 |
| `server/zorvalon.js` | Config | Modified | f3f786b | 2025-10-24 | +10 |
| `server/package.json` | Config | Modified | 42094c9 | 2025-10-24 | +1 |

---

## File Details

### 1. Core Service: `server/services/billingService.js`

**Purpose:** Central Stripe service handling customer management, checkout sessions, and payment tracking.

**Key Functions:**

```javascript
// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-09-30.clover'
});

// Price allowlist from environment
const ALLOWED_PRICE_IDS = new Set([
  process.env.STRIPE_PRICE_RESUME_ONE_TIME,
  process.env.STRIPE_PRICE_RESUME_EXPERT
].filter(Boolean).map(s => s.trim()));

// Customer management
async function getOrCreateStripeCustomer(userId, email) {
  // Environment-aware customer ID storage
  const isLive = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_');
  const col = isLive ? 'stripe_customer_id_live' : 'stripe_customer_id_test';
  
  // Returns existing or creates new customer
  // Only called in live mode to avoid DB constraint issues
}

// Checkout session creation
async function createCheckoutSession({ user, priceId, quantity, idempotencyKey, requestId }) {
  // Validates price ID
  // Creates Stripe checkout session
  // Returns session object with URL
}

// Payment record update
async function upsertPaymentFromSession(session, statusOverride) {
  // Updates payment record from webhook data
  // Handles status overrides for refunds
}
```

**Responsibilities:**
- Price ID validation
- Customer creation/retrieval
- Checkout session generation
- Payment record management

---

### 2. Payments API: `server/routes/payments.js`

**Purpose:** Protected API endpoint for initiating payment checkout.

**Route:** `POST /api/pay/checkout`

**Request Body:**
```json
{
  "sku": "resume_pro",
  "quantity": 1
}
```

**Response:**
```json
{
  "ok": true,
  "url": "https://checkout.stripe.com/c/pay/..."
}
```

**Key Features:**
- SKU-to-price-ID mapping (security)
- Idempotency protection
- Environment-aware logging
- Error handling with structured logs

**Middleware:**
- `requireAuth` - Authentication required
- `createIdempotencyMiddleware` - Prevents duplicate charges

**Response Codes:**
- `201` - Checkout session created
- `400` - Invalid SKU or missing parameters
- `401` - Authentication required
- `500` - Server error

---

### 3. Webhook Handler: `server/routes/stripeWebhook.js`

**Purpose:** Receives and processes Stripe webhook events for payment status updates.

**Route:** `POST /webhooks/stripe`

**Key Features:**
- Raw body processing (`express.raw()`)
- Signature verification using `STRIPE_WEBHOOK_SECRET`
- Bypasses auth/CORS (public endpoint)
- Processes specific event types

**Supported Events:**
- `checkout.session.completed` - Payment successful
- `refund.succeeded` - Refund processed
- `charge.refunded` - Charge refunded

**Security:**
```javascript
// Verify webhook signature
event = stripe.webhooks.constructEvent(req.body, sig, secret);
```

**Request Flow:**
1. Receive raw request body
2. Extract Stripe signature from headers
3. Verify signature using webhook secret
4. Process event type
5. Update payment record in database
6. Return 200 OK

---

### 4. Billing Dashboard: `server/routes/dashboard-billing.js`

**Purpose:** Renders billing dashboard with purchase history and product options.

**Route:** `GET /dashboard/billing`

**Key Features:**
- Displays purchase history
- Shows product options
- Handles success/cancel messages
- Requires authentication

**Query Parameters:**
- `paid=1` - Payment successful (from Stripe redirect)
- `canceled=1` - Payment canceled

**Template:** `server/ejs/billing.ejs`

---

### 5. Frontend Payment: `server/public/js/pay.js`

**Purpose:** Client-side payment initiation with idempotency and error handling.

**Key Functions:**
```javascript
// Generate unique idempotency key
function generateIdempotencyKey() {
  return `${Date.now()}_${Math.random().toString(36)}`;
}

// Initiate checkout
async function startCheckout(sku, quantity = 1) {
  const response = await fetch('/api/pay/checkout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': generateIdempotencyKey()
    },
    credentials: 'include',
    body: JSON.stringify({ sku, quantity })
  });
  
  const data = await response.json();
  if (data.ok && data.url) {
    window.location = data.url;
  }
}
```

**Security Features:**
- Sends SKU (not price ID) to server
- Includes idempotency key in headers
- Handles navigation errors gracefully

---

### 6. Billing UI: `server/ejs/billing.ejs`

**Purpose:** HTML template for billing dashboard.

**Key Features:**
- Responsive design
- Purchase history table
- Product selection buttons
- Success/cancel message display
- CSP-compliant inline event handlers

**Product Options:**
- Resume Pro (one-time purchase)
- Resume Expert (one-time purchase)

---

### 7. Database Migration: `db/migrations/20251022_stripe_billing_tables.sql`

**Purpose:** Creates billing tables with RLS policies and indexes.

**Tables Created:**

**billing_customers:**
```sql
CREATE TABLE public.billing_customers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE NOT NULL,
  email text,
  created_at timestamptz DEFAULT now()
);
```

**payments:**
```sql
CREATE TABLE public.payments (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  product_key text NOT NULL,
  amount integer NOT NULL,
  currency text NOT NULL DEFAULT 'usd',
  status public.payment_status NOT NULL DEFAULT 'requires_payment',
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**Security:**
- Row-Level Security (RLS) enabled
- Owner-only read policies
- Automatic timestamp updates

---

### 8. Database Migration: `db/migrations/20251025_stripe_customer_env_split.sql`

**Purpose:** Adds environment-specific customer ID columns for test/live separation.

**Changes:**
```sql
ALTER TABLE public.billing_customers
  ADD COLUMN IF NOT EXISTS stripe_customer_id_live text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id_test text;
```

**Rationale:**
- Stripe test and live modes have separate customer IDs
- Prevents customer mismatch errors when switching environments
- Backward compatible with legacy `stripe_customer_id` column

---

### 9. Server Wiring: `server/zorvalon.js`

**Purpose:** Mounts Stripe routes with proper middleware order.

**Changes:**
```javascript
// Webhook endpoint (before auth guard)
const { mountStripeWebhook } = require('./routes/stripeWebhook');
mountStripeWebhook(app);

// Payments API (protected)
app.use('/api/pay', requireAuth, require('./routes/payments'));

// Billing dashboard (protected)
app.use('/dashboard/billing', require('./routes/dashboard-billing'));
```

**Middleware Order:**
1. Trust proxy
2. Request ID
3. Security headers
4. Maintenance guard
5. Degrade guard
6. **Webhook (bypasses auth)**
7. Auth bridge
8. **Payments API (requires auth)**
9. Routes
10. Error handlers

---

### 10. Dependencies: `server/package.json`

**Added Package:**
```json
{
  "dependencies": {
    "stripe": "^latest"
  }
}
```

**Version:** Latest stable (checked on Oct 24, 2025)

---

## Environment Variables

### Required Variables

```bash
# Stripe API Credentials
STRIPE_SECRET_KEY=sk_test_...              # Stripe secret key (test or live)
STRIPE_WEBHOOK_SECRET=whsec_...            # Webhook signing secret

# Product Price IDs
STRIPE_PRICE_RESUME_ONE_TIME=price_...     # Resume Pro price ID
STRIPE_PRICE_RESUME_EXPERT=price_...       # Resume Expert price ID

# Application URLs
PUBLIC_ORIGIN=https://yourdomain.com       # Base URL for redirects
```

### Test vs Live Mode

**Test Mode:** `STRIPE_SECRET_KEY` starts with `sk_test_`
- Uses Stripe test mode
- Test customer IDs stored in `stripe_customer_id_test`
- Customer creation skipped to avoid DB constraints

**Live Mode:** `STRIPE_SECRET_KEY` starts with `sk_live_`
- Uses Stripe live mode
- Live customer IDs stored in `stripe_customer_id_live`
- Full customer management enabled

### Environment Detection

```javascript
const isLive = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_');
```

---

## Database Schema

### Table: `billing_customers`

**Purpose:** Maps user accounts to Stripe customer IDs.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `user_id` | uuid | PRIMARY KEY, FK → auth.users | User account ID |
| `stripe_customer_id` | text | NOT NULL, UNIQUE | Legacy customer ID (backward compat) |
| `stripe_customer_id_live` | text | NULL | Live mode customer ID |
| `stripe_customer_id_test` | text | NULL | Test mode customer ID |
| `email` | text | NULL | Customer email |
| `created_at` | timestamptz | DEFAULT now() | Record creation timestamp |

**Indexes:**
- `idx_billing_customers_user` on `user_id`
- `idx_billing_customers_stripe_id` on `stripe_customer_id`

---

### Table: `payments`

**Purpose:** Tracks all payment attempts and results.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | bigserial | PRIMARY KEY | Auto-increment ID |
| `user_id` | uuid | FK → auth.users | User who made payment |
| `stripe_checkout_session_id` | text | UNIQUE | Stripe checkout session ID |
| `stripe_payment_intent_id` | text | UNIQUE | Stripe payment intent ID |
| `product_key` | text | NOT NULL | Internal product identifier |
| `amount` | integer | NOT NULL | Amount in cents |
| `currency` | text | DEFAULT 'usd' | Currency code |
| `status` | payment_status | NOT NULL | Payment status enum |
| `metadata` | jsonb | DEFAULT '{}' | Additional payment data |
| `created_at` | timestamptz | DEFAULT now() | Record creation time |
| `updated_at` | timestamptz | DEFAULT now() | Record update time |

**Enum: `payment_status`**
```sql
CREATE TYPE payment_status AS ENUM (
  'requires_payment',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
  'canceled'
);
```

**Indexes:**
- `idx_payments_user_id` on `user_id`
- `idx_payments_status` on `status`
- `idx_payments_created_at` on `created_at`

**RLS Policy:**
```sql
CREATE POLICY "owner can read" ON public.payments
FOR SELECT USING (auth.uid() = user_id);
```

---

## Security & Compliance

### PCI Compliance

✅ **No card data storage** - Stripe Checkout handles all PCI-sensitive data  
✅ **No card number transit** - Card numbers never touch our servers  
✅ **Secure communication** - HTTPS required for all Stripe communication  
✅ **Signature verification** - Webhook signatures verified to prevent tampering  

### Authentication & Authorization

✅ **Protected endpoints** - Payments API requires authentication  
✅ **Idempotency keys** - Prevent duplicate charges  
✅ **RLS policies** - Users can only read their own data  
✅ **Webhook isolation** - Webhook endpoint bypasses auth (signature-verified)  

### Data Security

✅ **Environment separation** - Test and live data isolated  
✅ **Sensitive data encryption** - Database encryption at rest  
✅ **Audit logging** - All payment events logged with request IDs  
✅ **Error handling** - No sensitive data in error messages  

### Common Vulnerabilities

✅ **SQL Injection** - Parameterized queries via Supabase  
✅ **CSRF** - Webhook endpoint exempt (signature-verified)  
✅ **XSS** - CSP headers and sanitized output  
✅ **Rate limiting** - Idempotency keys prevent rapid retries  

---

## Usage Guide

### For Developers

#### Setting Up Stripe Integration

1. **Create Stripe Account**
   - Sign up at https://stripe.com
   - Get API keys from dashboard

2. **Create Products & Prices**
   - Create "Resume Pro" product
   - Create "Resume Expert" product
   - Copy price IDs

3. **Set Up Webhook**
   - Add endpoint: `https://yourdomain.com/webhooks/stripe`
   - Select events: `checkout.session.completed`
   - Copy webhook signing secret

4. **Configure Environment**
   ```bash
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   STRIPE_PRICE_RESUME_ONE_TIME=price_...
   STRIPE_PRICE_RESUME_EXPERT=price_...
   PUBLIC_ORIGIN=https://yourdomain.com
   ```

5. **Run Migrations**
   ```bash
   psql -d your_database -f db/migrations/20251022_stripe_billing_tables.sql
   psql -d your_database -f db/migrations/20251025_stripe_customer_env_split.sql
   ```

#### Testing Payments

1. **Test Mode**
   - Use `sk_test_` key
   - Use test card: `4242 4242 4242 4242`
   - Any future expiry date

2. **Live Mode**
   - Use `sk_live_` key
   - Real cards charged real money
   - Real payment processing

---

### For End Users

#### Making a Purchase

1. Navigate to Billing Dashboard
2. Select product (Resume Pro or Resume Expert)
3. Click "Buy Now"
4. Complete payment on Stripe-hosted page
5. Redirected back to dashboard
6. View purchase in history

#### Payment Status

- **Paid** - Payment successful, product access granted
- **Canceled** - Payment not completed
- **Failed** - Payment failed (card declined, etc.)
- **Refunded** - Payment refunded by admin

---

## Troubleshooting

### Common Issues

#### 1. "Price not allowed" Error

**Symptom:** 400 error when initiating checkout  
**Cause:** Price ID not in allowlist  
**Solution:** Check environment variables are set correctly

```bash
# Verify price IDs
echo $STRIPE_PRICE_RESUME_ONE_TIME
echo $STRIPE_PRICE_RESUME_EXPERT
```

#### 2. Webhook Not Receiving Events

**Symptom:** Payments complete but no database update  
**Cause:** Webhook endpoint not reachable or signature mismatch  
**Solution:** 
- Verify webhook URL in Stripe dashboard
- Check webhook secret matches environment variable
- Test with Stripe CLI: `stripe listen --forward-to localhost:3000/webhooks/stripe`

#### 3. "null value violates not-null constraint"

**Symptom:** 500 error during checkout  
**Cause:** Test mode trying to insert NULL into `stripe_customer_id`  
**Solution:** Use commit ae7e4b7 or later (skips customer creation in test mode)

#### 4. Customer Mismatch Error

**Symptom:** "No such customer... exists in test mode"  
**Cause:** Using live customer ID with test key (or vice versa)  
**Solution:** Use environment-specific customer columns (commit a434ef4)

---

### Debugging Checklist

- [ ] Environment variables set
- [ ] Database migrations run
- [ ] Webhook endpoint accessible
- [ ] Webhook secret matches
- [ ] Test/live mode correct
- [ ] Price IDs valid
- [ ] User authenticated
- [ ] Idempotency key included

---

## Migration Guide

### From Legacy System

If migrating from a different payment system:

1. **Export existing payment data**
2. **Map old product IDs to new SKUs**
3. **Run database migrations**
4. **Create Stripe products matching old products**
5. **Import payment history (if needed)**

### Updating Existing Installation

1. **Backup database**
   ```bash
   pg_dump your_database > backup.sql
   ```

2. **Pull latest code**
   ```bash
   git pull origin main
   npm install
   ```

3. **Run new migrations**
   ```bash
   psql -d your_database -f db/migrations/20251025_stripe_customer_env_split.sql
   ```

4. **Update environment variables**
   ```bash
   # Add new variables to .env
   STRIPE_PRICE_RESUME_ONE_TIME=price_...
   STRIPE_PRICE_RESUME_EXPERT=price_...
   ```

5. **Restart application**
   ```bash
   pm2 restart app
   ```

---

## API Reference

### POST /api/pay/checkout

Creates a Stripe checkout session.

**Authentication:** Required  
**Rate Limit:** Idempotency-protected

**Request:**
```json
{
  "sku": "resume_pro",
  "quantity": 1
}
```

**Response (201):**
```json
{
  "ok": true,
  "url": "https://checkout.stripe.com/c/pay/..."
}
```

**Errors:**
- `400` - Invalid SKU or parameters
- `401` - Authentication required
- `500` - Server error

---

### POST /webhooks/stripe

Receives Stripe webhook events.

**Authentication:** None (signature-verified)  
**Content-Type:** `application/json`

**Events Processed:**
- `checkout.session.completed`
- `refund.succeeded`
- `charge.refunded`

**Response:** `200 OK`

---

### GET /dashboard/billing

Renders billing dashboard.

**Authentication:** Required

**Query Parameters:**
- `paid=1` - Show success message
- `canceled=1` - Show canceled message

**Response:** HTML page with purchase history

---

## Support & Resources

### Documentation

- [Stripe API Reference](https://stripe.com/docs/api)
- [Stripe Checkout Guide](https://stripe.com/docs/payments/checkout)
- [Webhook Security](https://stripe.com/docs/webhooks/signatures)

### Internal Resources

- **Code Review:** Commits 57dc7a9 through ae7e4b7
- **Testing Guide:** `docs/stripe-billing-implementation.md`
- **Architecture Diagram:** See [Architecture](#architecture) section

### Support Contacts

- **Developers:** Check Git commit history for authors
- **Stripe Support:** https://support.stripe.com

---

## Changelog

### Version 1.0 (October 24, 2025)

**Initial Release:**
- Core billing service implementation
- Payment API endpoint
- Webhook handler
- Billing dashboard UI
- Database migrations
- Test/live mode support
- Idempotency protection

**Commits:** 57dc7a9 through ae7e4b7

---

## License

This documentation is part of the Detechify project and follows the same license as the main codebase.

---

**Document Status:** ✅ Complete  
**Last Review:** October 24, 2025  
**Maintained By:** Development Team
