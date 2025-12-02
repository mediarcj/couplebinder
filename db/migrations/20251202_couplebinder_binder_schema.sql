-- 20251202_couplebinder_binder_schema.sql
-- Purpose: Core schema for "relationship binder" feature (binders + binder_photos)
-- Notes:
-- - Stores metadata in Postgres (Supabase)
-- - Stores only storage keys/URLs for images, not raw binary
-- - RLS ensures users only see their own binders/photos

-- ======================================================================
-- TABLE: binders
-- ======================================================================
create table if not exists public.binders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  cover_photo_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If you use auth.users as the owner source:
alter table public.binders
  add constraint binders_user_fk
  foreign key (user_id)
  references auth.users (id)
  on delete cascade;

-- We'll backfill cover_photo_id FK after binder_photos is created

-- ======================================================================
-- TABLE: binder_photos
-- ======================================================================
create table if not exists public.binder_photos (
  id uuid primary key default gen_random_uuid(),
  binder_id uuid not null,
  user_id uuid not null,
  storage_key text not null,          -- e.g. "binders/{userId}/{binderId}/{filename}.jpg"
  caption text,
  taken_at date,                      -- date the photo was taken (optional)
  position integer,                   -- page/ordering within the binder
  created_at timestamptz not null default now()
);

alter table public.binder_photos
  add constraint binder_photos_binder_fk
  foreign key (binder_id)
  references public.binders (id)
  on delete cascade;

alter table public.binder_photos
  add constraint binder_photos_user_fk
  foreign key (user_id)
  references auth.users (id)
  on delete cascade;

-- Now that binder_photos exists, wire up cover_photo_id FK:
alter table public.binders
  add constraint binders_cover_photo_fk
  foreign key (cover_photo_id)
  references public.binder_photos (id)
  on delete set null;

-- ======================================================================
-- RLS: enable and lock down
-- ======================================================================
alter table public.binders enable row level security;
alter table public.binder_photos enable row level security;

-- Policy: users can see only their own binders
create policy "binders_select_own"
  on public.binders
  for select
  using (auth.uid() = user_id);

create policy "binders_insert_own"
  on public.binders
  for insert
  with check (auth.uid() = user_id);

create policy "binders_update_own"
  on public.binders
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "binders_delete_own"
  on public.binders
  for delete
  using (auth.uid() = user_id);

-- Photos: tie to both binder and user_id
create policy "binder_photos_select_own"
  on public.binder_photos
  for select
  using (auth.uid() = user_id);

create policy "binder_photos_insert_own"
  on public.binder_photos
  for insert
  with check (auth.uid() = user_id);

create policy "binder_photos_update_own"
  on public.binder_photos
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "binder_photos_delete_own"
  on public.binder_photos
  for delete
  using (auth.uid() = user_id);

-- ======================================================================
-- Indexes for performance
-- ======================================================================
create index if not exists idx_binders_user_id
  on public.binders (user_id, created_at desc);

create index if not exists idx_binder_photos_binder_position
  on public.binder_photos (binder_id, position);

create index if not exists idx_binder_photos_user_id
  on public.binder_photos (user_id, created_at desc);