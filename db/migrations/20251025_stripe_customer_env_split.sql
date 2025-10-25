-- Migration: Split stripe_customer_id into live/test columns
-- Description: Support separate customer IDs for test and live environments
-- Purpose: Prevent customer mismatch errors when switching between test and live modes
-- Notes: Each environment (test/live) has separate customer IDs in Stripe

/**
 * WHAT:
 * Add separate columns for live and test Stripe customer IDs.
 * 
 * WHY:
 * Stripe test and live modes have completely separate customer IDs.
 * Storing both prevents errors when switching between environments.
 * 
 * HOW:
 * 1. Add stripe_customer_id_live and stripe_customer_id_test columns
 * 2. Create index on user_id for fast lookups
 * 3. Preserve existing stripe_customer_id column for backward compatibility
 */

-- Add environment-specific customer ID columns
alter table public.billing_customers
  add column if not exists stripe_customer_id_live text,
  add column if not exists stripe_customer_id_test text;

-- Create index for fast user lookups
create index if not exists idx_billing_customers_user on public.billing_customers (user_id);

-- Add comment explaining the new columns
comment on column public.billing_customers.stripe_customer_id_live is 'Stripe customer ID for live mode (sk_live_ key)';
comment on column public.billing_customers.stripe_customer_id_test is 'Stripe customer ID for test mode (sk_test_ key)';
