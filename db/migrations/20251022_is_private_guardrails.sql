-- File: db/migrations/20251022_is_private_guardrails.sql
-- Description: Add guardrails for profiles.is_private field
-- Purpose: Enforce invariant at database level: boolean, default, not null, owner-only updates
-- Notes: Idempotent migration that can be run multiple times safely

-- Ensure defaults & nullability (safe if already set)
ALTER TABLE public.profiles
  ALTER COLUMN is_private SET DEFAULT false;

-- Set NOT NULL if no nulls remain
UPDATE public.profiles SET is_private = COALESCE(is_private, false) WHERE is_private IS NULL;
ALTER TABLE public.profiles
  ALTER COLUMN is_private SET NOT NULL;

-- RLS: allow row owner to update (idempotent creation)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND policyname = 'profiles_owner_update'
  ) THEN
    CREATE POLICY "profiles_owner_update"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Add check constraint to ensure boolean values only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_is_private_boolean_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_is_private_boolean_check
    CHECK (is_private IN (true, false));
  END IF;
END $$;
