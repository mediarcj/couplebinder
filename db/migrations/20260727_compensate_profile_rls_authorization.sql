-- Migration: couplebinder.profile_rls_compensation.20260727
-- Purpose: Put the private profile-view feature into a fail-closed state after the Phase 2 repair.
-- Scope: Executable compensating migration for the exact repaired state only.
-- Security guarantee: Never restore recursive policies, public discovery, role aggregation, or the Auth helper.
-- Relationship: Compensates db/migrations/20260727_repair_profile_rls_authorization.sql without reversing it.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '15s';
set local idle_in_transaction_session_timeout = '30s';

do $preflight$
declare
  view_definition text;
  view_options text[];
begin
  if not pg_try_advisory_xact_lock(
    hashtextextended('couplebinder:profile-rls-repair:20260727', 0)
  ) then
    raise exception using
      errcode = '55P03',
      message = 'profile RLS repair or compensation is already running';
  end if;

  if current_setting('server_version_num')::integer / 10000 < 15 then
    raise exception using
      errcode = '0A000',
      message = 'profile RLS compensation requires PostgreSQL 15 or newer';
  end if;

  if to_regclass('public.profiles') is null
     or to_regclass('public.user_roles') is null
     or to_regclass('public.audit_profiles') is null
     or to_regclass('public.v_profiles_full') is null then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS compensation rejected an unsupported starting state';
  end if;

  select pg_get_viewdef('public.v_profiles_full'::regclass, true),
         coalesce(reloptions, '{}'::text[])
  into view_definition, view_options
  from pg_class
  where oid = 'public.v_profiles_full'::regclass
    and relkind = 'v'
    and obj_description(oid, 'pg_class') =
      'CoupleBinder private own-profile view; repair couplebinder.profile_rls_repair.20260727';

  if view_definition is null
     or not (view_options @> array['security_invoker=true'])
     or not (view_options @> array['security_barrier=true'])
     or position('user_roles' in lower(view_definition)) > 0
     or position('_auth_last_signins' in lower(view_definition)) > 0
     or to_regprocedure('public._auth_last_signins()') is not null
     or exists (
       select 1
       from pg_policies
       where schemaname = 'public'
         and policyname in (
           'user_roles_admin_all',
           'user_roles_read_own',
           'profiles_admin_read',
           'profiles_admin_update',
           'audit_profiles_admin_read',
           'profiles_public_read'
         )
     )
     or not has_table_privilege('authenticated', 'public.v_profiles_full', 'SELECT')
     or has_table_privilege('anon', 'public.v_profiles_full', 'SELECT')
     or has_table_privilege('authenticated', 'public.user_roles', 'SELECT') then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS compensation rejected unknown repaired-state drift';
  end if;

  if exists (
    select 1
    from pg_class
    where oid in (
      'public.profiles'::regclass,
      'public.user_roles'::regclass,
      'public.audit_profiles'::regclass
    )
      and (not relrowsecurity or relforcerowsecurity)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS compensation rejected changed RLS enforcement';
  end if;
end
$preflight$;

-- A compensation must never recreate the vulnerable graph. Removing the private
-- view makes profile enrichment unavailable while preserving safe own-row table RLS.
revoke all on public.v_profiles_full from public;
revoke all on public.v_profiles_full from anon;
revoke all on public.v_profiles_full from authenticated;
drop view public.v_profiles_full;

do $postflight$
begin
  if to_regclass('public.v_profiles_full') is not null
     or to_regprocedure('public._auth_last_signins()') is not null then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS compensation did not fail the private view closed';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and policyname in (
        'user_roles_admin_all',
        'user_roles_read_own',
        'profiles_admin_read',
        'profiles_admin_update',
        'audit_profiles_admin_read',
        'profiles_public_read'
      )
  ) or exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'user_roles', 'audit_profiles')
      and (
        coalesce(qual, '') ilike '%user_roles%'
        or coalesce(with_check, '') ilike '%user_roles%'
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS compensation restored vulnerable policy authority';
  end if;

  if has_table_privilege('authenticated', 'public.user_roles', 'SELECT')
     or has_table_privilege('anon', 'public.profiles', 'SELECT') then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS compensation found unsafe direct grants';
  end if;

  if exists (
    select 1
    from pg_class
    where oid in (
      'public.profiles'::regclass,
      'public.user_roles'::regclass,
      'public.audit_profiles'::regclass
    )
      and (not relrowsecurity or relforcerowsecurity)
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS compensation changed RLS enforcement';
  end if;
end
$postflight$;

commit;
