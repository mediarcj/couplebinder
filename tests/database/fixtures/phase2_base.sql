-- Purpose: Build the common production-shaped objects for Phase 2 migration tests.
-- Scope: Synthetic test-only fixture; not a production migration.
-- Starting state: A disposable database after phase2_reset.sql.
-- Security guarantee: Browser roles are non-owner, non-superuser, and non-BYPASSRLS.

\set ON_ERROR_STOP on
\ir phase2_reset.sql

create role anon
  nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role authenticated
  nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role service_role
  nologin nosuperuser nocreatedb nocreaterole noinherit bypassrls;

create schema auth;
create schema phase2_test;

create function auth.uid()
returns uuid
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$function$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

create function phase2_test.assert_true(condition boolean, label text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  if condition is distinct from true then
    raise exception using
      errcode = 'P0001',
      message = 'assertion failed: ' || label;
  end if;
end
$function$;

create function phase2_test.assert_count(command text, expected_count bigint, label text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  actual_count bigint;
begin
  execute 'select count(*) from (' || command || ') as checked_rows'
    into actual_count;
  if actual_count <> expected_count then
    raise exception using
      errcode = 'P0001',
      message = 'row-count assertion failed: ' || label;
  end if;
end
$function$;

create function phase2_test.assert_sqlstate(expected_state text, command text, label text)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
declare
  actual_state text;
begin
  begin
    execute command;
    raise exception using
      errcode = 'P0001',
      message = 'statement unexpectedly succeeded: ' || label;
  exception
    when others then
      get stacked diagnostics actual_state = returned_sqlstate;
      if actual_state <> expected_state then
        raise exception using
          errcode = 'P0001',
          message = 'unexpected SQLSTATE for: ' || label;
      end if;
  end;
end
$function$;

create function phase2_test.set_context(
  subject uuid,
  signed_claims jsonb default '{}'::jsonb,
  browser_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = pg_catalog
as $function$
begin
  perform set_config('request.jwt.claim.sub', coalesce(subject::text, ''), true);
  perform set_config('request.jwt.claims', coalesce(signed_claims, '{}'::jsonb)::text, true);
  perform set_config(
    'request.jwt.claim.user_metadata',
    coalesce(browser_metadata, '{}'::jsonb)::text,
    true
  );
end
$function$;

grant usage on schema phase2_test to anon, authenticated, service_role;
grant execute on all functions in schema phase2_test to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  last_sign_in_at timestamptz
);

create table public.profiles (
  user_id uuid primary key,
  email text not null,
  given_name text,
  family_name text,
  display_name_override text,
  avatar_url text,
  locale text,
  timezone text,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  display_name text not null,
  birthday date,
  gender text,
  language text,
  city_province text,
  country text,
  social_media1 text,
  social_media2 text,
  social_media3 text,
  relationship_status text,
  job text,
  hobbies text[] not null default '{}',
  music text[] not null default '{}',
  fav_food text[] not null default '{}',
  profile_title text,
  profile_description text,
  account_privacy text not null check (account_privacy in ('public', 'private')),
  phone text
);

create table public.user_roles (
  user_id uuid not null,
  role text not null,
  primary key (user_id, role)
);

create table public.audit_profiles (
  at timestamptz not null default now(),
  verb text not null,
  user_id uuid,
  actor uuid,
  snapshot jsonb not null
);

insert into auth.users (id, last_sign_in_at)
values
  ('00000000-0000-4000-8000-000000000001', null),
  ('00000000-0000-4000-8000-000000000002', null);

insert into public.profiles (
  user_id,
  email,
  display_name,
  account_privacy
)
values
  ('00000000-0000-4000-8000-000000000001', 'synthetic-one.invalid', 'Synthetic One', 'private'),
  ('00000000-0000-4000-8000-000000000002', 'synthetic-two.invalid', 'Synthetic Two', 'public');

insert into public.user_roles (user_id, role)
values
  ('00000000-0000-4000-8000-000000000001', 'member'),
  ('00000000-0000-4000-8000-000000000002', 'admin');

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_profiles enable row level security;

create policy profiles_select_own
on public.profiles
for select
using (auth.uid() = user_id);

create policy profiles_update_own
on public.profiles
for update
using (auth.uid() = user_id);

create policy profiles_insert_self
on public.profiles
for insert
with check (auth.uid() = user_id);

create policy profiles_public_read
on public.profiles
for select
using (account_privacy = 'public');

create policy profiles_admin_read
on public.profiles
for select
using (
  exists (
    select 1
    from public.user_roles as checked_roles
    where checked_roles.user_id = auth.uid()
      and checked_roles.role in ('admin', 'super_user')
  )
);

create policy profiles_admin_update
on public.profiles
for update
using (
  exists (
    select 1
    from public.user_roles as checked_roles
    where checked_roles.user_id = auth.uid()
      and checked_roles.role in ('admin', 'super_user')
  )
);

create policy audit_profiles_admin_read
on public.audit_profiles
for select
using (
  exists (
    select 1
    from public.user_roles as checked_roles
    where checked_roles.user_id = auth.uid()
      and checked_roles.role in ('admin', 'super_user')
  )
);

create policy user_roles_read_own
on public.user_roles
for select
using (auth.uid() = user_id);

create policy user_roles_admin_all
on public.user_roles
using (
  exists (
    select 1
    from public.user_roles as checked_roles
    where checked_roles.user_id = auth.uid()
      and checked_roles.role in ('admin', 'super_user')
  )
)
with check (
  exists (
    select 1
    from public.user_roles as checked_roles
    where checked_roles.user_id = auth.uid()
      and checked_roles.role in ('admin', 'super_user')
  )
);

create function public._auth_last_signins()
returns table (user_id uuid, last_sign_in_at timestamptz)
language sql
security definer
set search_path = public, auth
as $function$
  select source.id, source.last_sign_in_at
  from auth.users as source
$function$;

revoke all on function public._auth_last_signins() from public;
grant execute on function public._auth_last_signins()
  to anon, authenticated, service_role;

-- Broad synthetic grants reproduce the supplied incident reachability.
grant usage on schema public to anon, authenticated, service_role;
grant all on public.profiles, public.user_roles, public.audit_profiles
  to anon, authenticated, service_role;
