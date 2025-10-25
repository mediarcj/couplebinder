-- File: db/migrations/20251022_stripe_billing_tables.sql
-- Description: Create Stripe billing tables for customer and payment tracking
-- Purpose: Store billing relationships and payment history
-- Notes: Follows Building Laws: backend is source of truth, RLS enabled

/**
 * WHAT:
 * Create billing_customers and payments tables for Stripe integration.
 * 
 * WHY:
 * Need to track Stripe customer relationships and payment history.
 * RLS ensures users can only access their own billing data.
 * 
 * HOW:
 * 1. Create billing_customers table with user_id mapping
 * 2. Create payments table with payment status tracking
 * 3. Enable RLS with owner-only access policies
 * 4. Add proper indexes for performance
 */

-- Billing customers table - maps users to Stripe customers
create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique not null,
  email text,
  created_at timestamptz default now()
);

-- Enable RLS for billing customers
alter table public.billing_customers enable row level security;

-- RLS policy: users can only read their own billing customer record
create policy "owner can read" on public.billing_customers
for select using (auth.uid() = user_id);

-- Payment status enum for type safety
create type if not exists public.payment_status as enum (
  'requires_payment',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
  'canceled'
);

-- Payments table - tracks all payment attempts and results
create table if not exists public.payments (
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

-- Enable RLS for payments
alter table public.payments enable row level security;

-- RLS policy: users can only read their own payments
create policy "owner can read" on public.payments
for select using (auth.uid() = user_id);

-- Indexes for performance
create index if not exists idx_payments_user_id on public.payments(user_id);
create index if not exists idx_payments_status on public.payments(status);
create index if not exists idx_payments_created_at on public.payments(created_at);
create index if not exists idx_billing_customers_stripe_id on public.billing_customers(stripe_customer_id);

-- Update trigger for payments updated_at
create or replace function public.touch_payments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_payments_touch on public.payments;
create trigger trg_payments_touch
before update on public.payments
for each row execute function public.touch_payments_updated_at();
