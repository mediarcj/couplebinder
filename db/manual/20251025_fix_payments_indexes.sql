-- File: db/manual/20251025_fix_payments_indexes.sql
-- Description: Corrected indexes for payments table
-- Purpose: Optimize lookups by payment_intent and checkout_session
-- Notes: Use correct column names from the actual schema

/**
 * WHAT:
 * Add performance indexes for payments table lookups.
 * 
 * WHY:
 * Fast queries by stripe_payment_intent_id and stripe_checkout_session_id.
 * These columns are used by webhooks and payment lookups.
 * 
 * HOW:
 * Create indexes on frequently queried columns.
 * Use 'if not exists' to make idempotent.
 */

-- Index on payment_intent_id (used by refund webhooks)
create index if not exists payments_stripe_payment_intent_id_idx 
  on public.payments(stripe_payment_intent_id);

-- Index on checkout_session_id (used by payment lookup)
create index if not exists payments_stripe_checkout_session_id_idx 
  on public.payments(stripe_checkout_session_id);

-- Verify existing helpful indexes
create index if not exists payments_user_id_idx 
  on public.payments(user_id);

create index if not exists payments_status_idx 
  on public.payments(status);

create index if not exists payments_created_at_idx 
  on public.payments(created_at);

-- Note: These indexes complement the existing ones from the main migration
-- and provide fast lookups for webhook processing and user queries.
