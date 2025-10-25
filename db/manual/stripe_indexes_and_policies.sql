-- File: db/manual/stripe_indexes_and_policies.sql
-- Description: Additional indexes and RLS policies for Stripe billing integration
-- Purpose: Optimize query performance and ensure proper row-level security
-- Notes: Run this AFTER the main Stripe migrations

/**
 * WHAT:
 * Add performance indexes and RLS policies for Stripe billing tables.
 * 
 * WHY:
 * Need fast lookups by payment_intent, checkout_session, and user_id.
 * RLS policies ensure users can only access their own billing data.
 * 
 * HOW:
 * 1. Add indexes on frequently queried columns
 * 2. Verify RLS policies are in place
 * 3. Ensure server role has read/write access
 */

-- Indexes for payments table (fast lookups)
create index if not exists idx_payments_payment_intent 
  on public.payments(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists idx_payments_checkout_session 
  on public.payments(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

-- Verify existing indexes
create index if not exists idx_payments_user_id on public.payments(user_id);
create index if not exists idx_payments_status on public.payments(status);
create index if not exists idx_payments_created_at on public.payments(created_at);

-- Verify RLS is enabled
alter table public.billing_customers enable row level security;
alter table public.payments enable row level security;

-- Verify RLS policies exist (create if they don't)
do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'billing_customers' 
    and policyname = 'owner can read'
  ) then
    create policy "owner can read" on public.billing_customers
    for select using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where schemaname = 'public' 
    and tablename = 'payments' 
    and policyname = 'owner can read'
  ) then
    create policy "owner can read" on public.payments
    for select using (auth.uid() = user_id);
  end if;
end $$;

-- Ensure service role can read/write (required for webhooks and server operations)
grant all on public.billing_customers to service_role;
grant all on public.payments to service_role;
