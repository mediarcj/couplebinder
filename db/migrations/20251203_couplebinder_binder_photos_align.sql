-- Align binder_photos schema with binderController/addPhotos
-- Safe to run multiple times because of IF NOT EXISTS.

BEGIN;

ALTER TABLE public.binder_photos
  ADD COLUMN IF NOT EXISTS mime_type    text,
  ADD COLUMN IF NOT EXISTS size_bytes   bigint,
  ADD COLUMN IF NOT EXISTS status       text NOT NULL DEFAULT 'stored';

COMMIT;