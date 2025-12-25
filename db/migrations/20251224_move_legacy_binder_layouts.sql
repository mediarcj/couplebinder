-- File: db/migrations/20251224_01_move_legacy_binder_layouts_to_binder_layouts_legacy.sql
-- Description: Migrates non-v2 binder canvas layout_json rows out of public.binder_layouts into public.binder_layouts_legacy.
-- Purpose:
--   - Ensure the React/Vite editor only ever reads a single, consistent v2 layout format from public.binder_layouts.
--   - Preserve any legacy/mixed formats for audit/recovery without breaking clients.
-- Migration behavior:
--   1) Creates public.binder_layouts_legacy (idempotent).
--   2) Enables RLS and adds a "select own" policy for auth users.
--   3) Moves rows from public.binder_layouts where layout_json is NOT the v2 shape:
--        - json object
--        - elements: array
--        - pageWidthPx: number
--        - pageHeightPx: number
--      into public.binder_layouts_legacy, then deletes them from public.binder_layouts.
-- Safety:
--   - Uses ON CONFLICT (original_layout_id) DO NOTHING for repeatable runs.
--   - Runs inside a transaction.
-- Run location:
--   - Supabase SQL Editor (recommended), or psql against the same database.
-- Notes:
--   - This does not change your dashboard.js behavior; it only cleans existing rows.
--   - After this, public.binder_layouts should contain only v2 layout_json rows.

begin;

-- ---------------------------------------------------------------------------
-- 1) Create legacy table (idempotent)
-- ---------------------------------------------------------------------------
create table if not exists public.binder_layouts_legacy (
  id uuid primary key default gen_random_uuid(),
  original_layout_id uuid not null unique,          -- binder_layouts.id we migrated from
  user_id uuid not null references auth.users(id) on delete cascade,
  binder_id text not null,
  page_number integer not null default 1,
  layout_json jsonb not null,
  updated_at timestamptz not null,
  migrated_at timestamptz not null default now(),
  reason text not null default 'legacy_layout_json',
  format_hint text
);

create index if not exists binder_layouts_legacy_user_binder_page_idx
  on public.binder_layouts_legacy (user_id, binder_id, page_number);

create index if not exists binder_layouts_legacy_binder_idx
  on public.binder_layouts_legacy (binder_id);

-- ---------------------------------------------------------------------------
-- 2) RLS + policy (idempotent-ish via DO block)
-- ---------------------------------------------------------------------------
alter table public.binder_layouts_legacy enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename  = 'binder_layouts_legacy'
      and policyname = 'binder_layouts_legacy_select_own'
  ) then
    execute $pol$
      create policy binder_layouts_legacy_select_own
      on public.binder_layouts_legacy
      for select
      using (auth.uid() = user_id)
    $pol$;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Move legacy rows out of binder_layouts
--
-- Definition of "v2 layout_json" (what your current dashboard.js saves):
--   - layout_json is an object
--   - has "elements" array
--   - has numeric pageWidthPx + pageHeightPx
-- Everything else is treated as legacy and migrated out.
-- ---------------------------------------------------------------------------
with moved as (
  insert into public.binder_layouts_legacy (
    original_layout_id,
    user_id,
    binder_id,
    page_number,
    layout_json,
    updated_at,
    reason,
    format_hint
  )
  select
    bl.id,
    bl.user_id,
    bl.binder_id,
    bl.page_number,
    bl.layout_json,
    bl.updated_at,
    'layout_json_not_v2_shape',
    jsonb_typeof(bl.layout_json)
  from public.binder_layouts bl
  where not (
    jsonb_typeof(bl.layout_json) = 'object'
    and (bl.layout_json ? 'elements')
    and jsonb_typeof(bl.layout_json->'elements') = 'array'
    and (bl.layout_json ? 'pageWidthPx')
    and (bl.layout_json ? 'pageHeightPx')
    and jsonb_typeof(bl.layout_json->'pageWidthPx') = 'number'
    and jsonb_typeof(bl.layout_json->'pageHeightPx') = 'number'
  )
  on conflict (original_layout_id) do nothing
  returning original_layout_id
)
delete from public.binder_layouts bl
using moved
where bl.id = moved.original_layout_id;

commit;