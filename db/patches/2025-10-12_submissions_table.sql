-- File: db/patches/2025-10-12_submissions_table.sql
-- Description: Create submissions table for persistent storage
-- Purpose: Replace in-memory submissions array with durable database storage
-- Notes: Enables horizontal scaling and prevents data loss on restart

-- WHAT:
-- Create submissions table with RLS policies to ensure users only see their own data
--
-- WHY:
-- In-memory storage is lost on restart and prevents horizontal scaling.
-- Database storage provides durability and allows multiple server instances.
--
-- HOW:
-- Table with user_id FK, text content, metadata, and RLS for ownership isolation.

CREATE TABLE IF NOT EXISTS public.submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  text_length INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_ip TEXT,
  request_id TEXT
);

-- Index for efficient queries (user's recent submissions)
CREATE INDEX IF NOT EXISTS submissions_user_created_idx 
  ON public.submissions(user_id, created_at DESC);

-- Index for cleanup jobs (old submissions)
CREATE INDEX IF NOT EXISTS submissions_created_at_idx 
  ON public.submissions(created_at DESC);

-- RLS: Enable row-level security
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only read their own submissions
CREATE POLICY submissions_select_own 
  ON public.submissions 
  FOR SELECT 
  USING (auth.uid() = user_id);

-- RLS Policy: Users can only insert their own submissions
CREATE POLICY submissions_insert_own 
  ON public.submissions 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can only delete their own submissions
CREATE POLICY submissions_delete_own 
  ON public.submissions 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- Optional: Admin read-all policy (uncomment if needed)
-- CREATE POLICY submissions_select_admin
--   ON public.submissions
--   FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM v_profiles_full
--       WHERE user_id = auth.uid() AND role = 'admin'
--     )
--   );

COMMENT ON TABLE public.submissions IS 'User text submissions with RLS protection';
COMMENT ON COLUMN public.submissions.user_id IS 'Owner of this submission (FK to auth.users)';
COMMENT ON COLUMN public.submissions.text IS 'Submitted text content';
COMMENT ON COLUMN public.submissions.text_length IS 'Character count (for quotas/limits)';
COMMENT ON COLUMN public.submissions.client_ip IS 'Client IP for security tracking';
COMMENT ON COLUMN public.submissions.request_id IS 'Request ID for audit trail';

