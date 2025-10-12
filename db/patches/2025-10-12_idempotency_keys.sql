-- File: db/patches/2025-10-12_idempotency_keys.sql
-- Description: Create idempotency keys table for duplicate request protection
-- Purpose: Prevent duplicate processing of profile updates and other critical operations
-- Notes: Provides consistency guard for operations spanning multiple services

-- WHAT:
-- Track processed idempotency keys to prevent duplicate execution.
--
-- WHY:
-- Profile updates span auth.users and profiles tables. Without idempotency,
-- retries could cause partial updates or data inconsistency.
--
-- HOW:
-- Store unique keys with TTL. Check key before processing, insert after success.

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  operation TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

-- Index for efficient cleanup of expired keys
CREATE INDEX IF NOT EXISTS idempotency_keys_expires_idx 
  ON public.idempotency_keys(expires_at);

-- Index for user-specific queries
CREATE INDEX IF NOT EXISTS idempotency_keys_user_idx 
  ON public.idempotency_keys(user_id, created_at DESC);

COMMENT ON TABLE public.idempotency_keys IS 'Tracks processed idempotency keys to prevent duplicate operations';
COMMENT ON COLUMN public.idempotency_keys.key IS 'Unique idempotency key (e.g., UUID from client header)';
COMMENT ON COLUMN public.idempotency_keys.user_id IS 'User who initiated the operation';
COMMENT ON COLUMN public.idempotency_keys.operation IS 'Type of operation (e.g., profile_update, submission_create)';
COMMENT ON COLUMN public.idempotency_keys.expires_at IS 'Key expiration time (24 hours default)';

