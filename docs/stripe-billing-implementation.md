# Stripe Billing Implementation for Detechify

## Overview

This document describes the complete Stripe billing system implementation for Detechify, following all applicable building laws and security best practices.

## Architecture

### Core Components

1. **Billing Service** (`server/services/billingService.js`)
   - Stripe customer management
   - Checkout session creation
   - Payment status tracking

2. **API Routes** (`server/routes/payments.js`)
   - Protected payment endpoints
   - Idempotency protection
   - Checkout session creation

3. **Webhook Handler** (`server/routes/stripeWebhook.js`)
   - Raw body processing
   - Signature verification
   - Payment status updates

4. **Database Tables**
   - `billing_customers` - Stripe customer mapping
   - `payments` - Payment history tracking

5. **Billing Dashboard** (`server/ejs/billing.ejs`)
   - Purchase options
   - Payment history
   - CSP-safe client scripts

## Security Features

### Backend Security
- **Price Allowlist**: Only approved price IDs can be used
- **Idempotency Protection**: Prevents duplicate charges
- **Signature Verification**: Webhook authenticity validation
- **RLS Policies**: Database-level access control
- **CSRF Protection**: State-changing request protection

### Frontend Security
- **CSP Compliance**: All scripts use nonces
- **No Secrets Exposed**: Price IDs are environment variables
- **Secure Redirects**: Stripe Checkout handles payment collection
- **Error Handling**: User-friendly error messages

## Database Schema

### billing_customers Table
```sql
create table public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique not null,
  email text,
  created_at timestamptz default now()
);
```

### payments Table
```sql
create table public.payments (
  id bigserial primary key,
  user_id uuid references auth.users(id) on delete set null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  product_key text not null,
  amount integer not null,
  currency text not null default 'usd',
  status public.payment_status not null default 'requires_payment',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
```

## Environment Variables

### Required Variables
```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_... # or sk_live_... for production
STRIPE_WEBHOOK_SECRET=whsec_... # from Stripe dashboard
STRIPE_PRICE_RESUME_ONE_TIME=price_... # $9 one-time product
STRIPE_PRICE_RESUME_EXPERT=price_... # $49 expert product

# Application Configuration
PUBLIC_ORIGIN=https://detechify.com # or http://localhost:3000 for dev
```

## API Endpoints

### Payment API
- `POST /api/pay/checkout` - Create checkout session
  - Requires authentication
  - Idempotency key in headers
  - Returns Stripe checkout URL

### Webhook Endpoint
- `POST /api/stripe/webhook` - Stripe webhook handler
  - Raw body processing
  - Signature verification
  - CSRF bypass (by design)

### Dashboard Routes
- `GET /dashboard/billing` - Billing dashboard
  - Requires authentication
  - Shows purchase options and history

## Payment Flow

1. **User clicks purchase button** → Client generates idempotency key
2. **POST /api/pay/checkout** → Server creates Stripe checkout session
3. **Redirect to Stripe Checkout** → User completes payment
4. **Stripe webhook** → Server updates payment status
5. **Return to dashboard** → User sees success message

## Development Setup

### Local Development
1. Set environment variables
2. Run Stripe CLI: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
3. Use test card: `4242 4242 4242 4242`
4. Test checkout flow

### Production Deployment
1. Set production Stripe keys
2. Configure webhook endpoint in Stripe dashboard
3. Set `PUBLIC_ORIGIN` to production domain
4. Run database migration

## Security Considerations

### What Stripe Handles
- Card data storage (PCI compliance)
- Payment method vaulting
- Receipt generation
- Dispute handling
- SCA (Strong Customer Authentication)

### What We Handle
- Customer relationship mapping
- Payment history tracking
- Business logic enforcement
- User access control

## Building Laws Compliance

✅ **Backend is Source of Truth**: All payment logic server-side
✅ **Small Deployable Changes**: Each component is focused
✅ **No Card Data Storage**: Stripe handles all sensitive data
✅ **Defensive Programming**: Comprehensive error handling
✅ **Security First**: Multiple protection layers
✅ **Documentation**: Clear implementation guide

## Testing

### Unit Tests
- Billing service functions
- Payment validation
- Webhook processing

### Integration Tests
- Checkout session creation
- Webhook signature verification
- Database operations

### End-to-End Tests
- Complete payment flow
- Error scenarios
- Security boundaries

## Monitoring

### Key Metrics
- Payment success rate
- Webhook processing time
- Failed payment attempts
- Customer creation rate

### Logging
- Payment events
- Webhook processing
- Error tracking
- Security events

## Future Enhancements

### Potential Additions
- Stripe Billing Portal integration
- Subscription management
- Refund processing
- Advanced analytics
- Multi-currency support

### Scalability Considerations
- Database indexing
- Webhook processing optimization
- Rate limiting for payment endpoints
- Caching for customer data

## Troubleshooting

### Common Issues
1. **Webhook signature verification fails**
   - Check `STRIPE_WEBHOOK_SECRET` environment variable
   - Verify webhook endpoint URL in Stripe dashboard

2. **Checkout session creation fails**
   - Verify `STRIPE_SECRET_KEY` is correct
   - Check price IDs are valid in Stripe dashboard

3. **Database connection issues**
   - Verify Supabase connection
   - Check RLS policies are properly configured

### Debug Mode
Set `AUTH_DEBUG=true` for detailed authentication logging.

## Support

For issues related to:
- **Stripe Integration**: Check Stripe dashboard and logs
- **Database Issues**: Verify Supabase connection and RLS policies
- **Authentication**: Check JWT token validity and middleware order
- **Webhook Processing**: Verify signature and endpoint configuration
