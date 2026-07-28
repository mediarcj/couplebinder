-- Migration: couplebinder.profile_rls_repair.20260727
-- Purpose: Repair the recursive profile/role RLS graph and replace the private profile view.
-- Scope: Executable forward migration for the documented old and deployed-hybrid starting states only.
-- Security guarantee: Browser callers retain own-profile access without public discovery, role-table authority,
-- or a SECURITY DEFINER Auth helper.
-- Compensation: db/migrations/20260727_compensate_profile_rls_authorization.sql fails the private view closed.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '15s';
set local idle_in_transaction_session_timeout = '30s';

do $preflight$
declare
  server_major integer := current_setting('server_version_num')::integer / 10000;
  view_definition text;
  view_options text[];
  helper_oid regprocedure := to_regprocedure('public._auth_last_signins()');
  required_profile_columns text[] := array[
    'account_privacy', 'avatar_url', 'birthday', 'city_province', 'country',
    'created_at', 'display_name', 'display_name_override', 'email', 'family_name',
    'fav_food', 'gender', 'given_name', 'hobbies', 'is_private', 'job', 'language',
    'locale', 'music', 'phone', 'profile_description', 'profile_title',
    'relationship_status', 'social_media1', 'social_media2', 'social_media3',
    'timezone', 'updated_at', 'user_id'
  ];
  required_old_view_columns text[] := array[
    'user_id', 'display_name', 'email', 'phone', 'given_name', 'family_name',
    'avatar_url', 'birthday', 'gender', 'language', 'city_province', 'country',
    'social_media1', 'social_media2', 'social_media3', 'relationship_status',
    'job', 'hobbies', 'music', 'fav_food', 'profile_title',
    'profile_description', 'account_privacy', 'locale', 'timezone',
    'created_at', 'updated_at', 'last_sign_in_at', 'roles'
  ];
  required_repaired_view_columns text[] := array[
    'user_id', 'display_name', 'display_name_override', 'email', 'phone',
    'given_name', 'family_name', 'avatar_url', 'birthday', 'gender', 'language',
    'city_province', 'country', 'social_media1', 'social_media2',
    'social_media3', 'relationship_status', 'job', 'hobbies', 'music',
    'fav_food', 'profile_title', 'profile_description', 'account_privacy',
    'is_private', 'locale', 'timezone', 'created_at', 'updated_at'
  ];
  actual_profile_columns text[];
  actual_view_columns text[];
  is_repaired boolean;
  is_supported_old boolean;
  is_supported_hybrid boolean;
begin
  if not pg_try_advisory_xact_lock(
    hashtextextended('couplebinder:profile-rls-repair:20260727', 0)
  ) then
    raise exception using
      errcode = '55P03',
      message = 'profile RLS repair is already running';
  end if;

  if server_major < 15 then
    raise exception using
      errcode = '0A000',
      message = 'profile RLS repair requires PostgreSQL 15 or newer';
  end if;

  if to_regrole('anon') is null
     or to_regrole('authenticated') is null
     or to_regrole('service_role') is null then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair requires the Supabase API roles';
  end if;

  if to_regprocedure('auth.uid()') is null then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair requires auth.uid()';
  end if;

  if to_regclass('public.profiles') is null
     or to_regclass('public.user_roles') is null
     or to_regclass('public.audit_profiles') is null
     or to_regclass('public.v_profiles_full') is null then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair found missing required relations';
  end if;

  if exists (
    select 1
    from pg_class as relation
    where relation.oid in (
      'public.profiles'::regclass,
      'public.user_roles'::regclass,
      'public.audit_profiles'::regclass
    )
      and (
        relation.relkind not in ('r', 'p')
        or not relation.relrowsecurity
        or relation.relforcerowsecurity
        or not pg_has_role(current_user, relation.relowner, 'USAGE')
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair found unsupported table type, ownership, or RLS state';
  end if;

  if not exists (
    select 1
    from pg_class as relation
    where relation.oid = 'public.v_profiles_full'::regclass
      and relation.relkind = 'v'
      and pg_has_role(current_user, relation.relowner, 'USAGE')
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair found unsupported view type or ownership';
  end if;

  select array_agg(column_name order by column_name)
  into actual_profile_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name = any(required_profile_columns);

  if actual_profile_columns is distinct from required_profile_columns then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair found an unsupported profiles column contract';
  end if;

  select pg_get_viewdef('public.v_profiles_full'::regclass, true),
         coalesce(relation.reloptions, '{}'::text[])
  into view_definition, view_options
  from pg_class as relation
  where relation.oid = 'public.v_profiles_full'::regclass;

  select array_agg(column_name order by ordinal_position)
  into actual_view_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'v_profiles_full';

  is_repaired :=
    helper_oid is null
    and actual_view_columns = required_repaired_view_columns
    and view_options @> array['security_invoker=true']
    and view_options @> array['security_barrier=true']
    and position('user_roles' in lower(view_definition)) = 0
    and position('_auth_last_signins' in lower(view_definition)) = 0
    and obj_description('public.v_profiles_full'::regclass, 'pg_class') =
      'CoupleBinder private own-profile view; repair couplebinder.profile_rls_repair.20260727'
    and not exists (
      select 1
      from pg_rewrite as rewrite
      join pg_depend as dependency
        on dependency.classid = 'pg_rewrite'::regclass
       and dependency.objid = rewrite.oid
      where rewrite.ev_class = 'public.v_profiles_full'::regclass
        and dependency.refobjid = 'public.user_roles'::regclass
    )
    and not exists (
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
    and (
      select count(*)
      from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
        and policyname in (
          'profiles_select_own',
          'profiles_update_own',
          'profiles_insert_self'
        )
        and 'authenticated' = any(roles)
    ) = 3
    and (
      select count(*)
      from pg_policies
      where schemaname = 'public'
        and tablename = 'profiles'
    ) = 3
    and not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename in ('user_roles', 'audit_profiles')
    )
    and has_table_privilege('authenticated', 'public.v_profiles_full', 'SELECT')
    and not has_table_privilege('anon', 'public.v_profiles_full', 'SELECT')
    and not has_table_privilege('authenticated', 'public.user_roles', 'SELECT')
    and not has_table_privilege('anon', 'public.profiles', 'SELECT')
    and not has_table_privilege('anon', 'public.profiles', 'INSERT')
    and not has_table_privilege('anon', 'public.profiles', 'UPDATE')
    and not has_table_privilege('anon', 'public.profiles', 'DELETE')
    and has_table_privilege('authenticated', 'public.profiles', 'SELECT')
    and has_table_privilege('authenticated', 'public.profiles', 'INSERT')
    and has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.profiles', 'DELETE')
    and has_table_privilege('service_role', 'public.profiles', 'SELECT')
    and has_table_privilege('service_role', 'public.user_roles', 'SELECT')
    and not exists (
      select 1
      from pg_class
      where oid in (
        'public.profiles'::regclass,
        'public.user_roles'::regclass,
        'public.audit_profiles'::regclass
      )
        and (not relrowsecurity or relforcerowsecurity)
    );

  if is_repaired then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair is already applied';
  end if;

  if actual_view_columns is distinct from required_old_view_columns then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair found an unsupported old view column contract';
  end if;

  is_supported_old :=
    helper_oid is not null
    and not (view_options @> array['security_invoker=true'])
    and position('user_roles' in lower(view_definition)) > 0
    and position('_auth_last_signins' in lower(view_definition)) > 0;

  is_supported_hybrid :=
    helper_oid is not null
    and view_options @> array['security_invoker=true']
    and not (view_options @> array['security_barrier=true'])
    and position('user_roles' in lower(view_definition)) > 0
    and position('_auth_last_signins' in lower(view_definition)) > 0;

  if not (is_supported_old or is_supported_hybrid) then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair rejected unknown view or helper drift';
  end if;

  if not exists (
    select 1
    from pg_proc
    where oid = helper_oid
      and prosecdef
      and prokind = 'f'
      and pronargs = 0
      and proretset
      and pg_has_role(current_user, proowner, 'USAGE')
      and array_to_string(coalesce(proconfig, '{}'::text[]), ',') ilike
        '%search_path=public, auth%'
      and pg_get_functiondef(oid) ilike '%from auth.users%'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair found an unsupported Auth helper';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'user_roles_admin_all'
      and cmd = 'ALL'
      and 'public' = any(roles)
      and coalesce(qual, '') ilike '%user_roles%'
      and coalesce(with_check, '') ilike '%user_roles%'
  ) or not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'user_roles_read_own'
      and cmd = 'SELECT'
      and coalesce(qual, '') ilike '%auth.uid%'
      and coalesce(qual, '') ilike '%user_id%'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair rejected unknown user_roles policy drift';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'profiles' and policyname in (
          'profiles_admin_read',
          'profiles_admin_update'
        ))
        or (tablename = 'audit_profiles' and policyname = 'audit_profiles_admin_read')
      )
      and coalesce(qual, '') ilike '%user_roles%'
  ) <> 3 then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair rejected unknown administrator policy drift';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_public_read'
      and cmd = 'SELECT'
      and coalesce(qual, '') ilike '%account_privacy%'
      and coalesce(qual, '') ilike '%public%'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair rejected unknown public-profile policy drift';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname in (
        'profiles_select_own',
        'profiles_update_own',
        'profiles_insert_self'
      )
      and (
        coalesce(qual, '') ilike '%auth.uid%'
        or coalesce(with_check, '') ilike '%auth.uid%'
      )
  ) <> 3 then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair rejected unknown own-profile policy drift';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname not in (
        'profiles_admin_read',
        'profiles_admin_update',
        'profiles_insert_self',
        'profiles_owner_update',
        'profiles_public_read',
        'profiles_select_own',
        'profiles_update_own'
      )
  ) or exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname not in ('user_roles_admin_all', 'user_roles_read_own')
  ) or exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'audit_profiles'
      and policyname <> 'audit_profiles_admin_read'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair rejected an unexpected affected-table policy';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_owner_update'
      and (
        cmd <> 'UPDATE'
        or not ('authenticated' = any(roles))
        or coalesce(qual, '') not ilike '%auth.uid%'
        or coalesce(with_check, '') not ilike '%auth.uid%'
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair rejected unknown owner-update policy drift';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'user_roles', 'audit_profiles')
      and policyname not in (
        'user_roles_admin_all',
        'user_roles_read_own',
        'profiles_admin_read',
        'profiles_admin_update',
        'audit_profiles_admin_read'
      )
      and (
        coalesce(qual, '') ilike '%user_roles%'
        or coalesce(with_check, '') ilike '%user_roles%'
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair rejected an unexpected role-table policy dependency';
  end if;

  if not exists (
    select 1
    from pg_rewrite as rewrite
    join pg_depend as dependency
      on dependency.classid = 'pg_rewrite'::regclass
     and dependency.objid = rewrite.oid
    where rewrite.ev_class = 'public.v_profiles_full'::regclass
      and dependency.refobjid = 'public.user_roles'::regclass
  ) or not exists (
    select 1
    from pg_rewrite as rewrite
    join pg_depend as dependency
      on dependency.classid = 'pg_rewrite'::regclass
     and dependency.objid = rewrite.oid
    where rewrite.ev_class = 'public.v_profiles_full'::regclass
      and dependency.refobjid = helper_oid
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair rejected unknown view dependency drift';
  end if;

  if not has_table_privilege('service_role', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.user_roles', 'SELECT') then
    raise exception using
      errcode = 'P0001',
      message = 'profile RLS repair found unsupported service-role relation access';
  end if;
end
$preflight$;

-- Remove database-role authorization. Cross-user administration is server-mediated.
drop policy user_roles_admin_all on public.user_roles;
drop policy user_roles_read_own on public.user_roles;
drop policy profiles_admin_read on public.profiles;
drop policy profiles_admin_update on public.profiles;
drop policy audit_profiles_admin_read on public.audit_profiles;

-- Public discovery cannot safely reuse a view containing private account fields.
drop policy profiles_public_read on public.profiles;

-- Canonicalize the retained own-profile policies to the authenticated API role.
drop policy profiles_select_own on public.profiles;
drop policy profiles_update_own on public.profiles;
drop policy profiles_insert_self on public.profiles;
drop policy if exists profiles_owner_update on public.profiles;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

-- The old view must be removed first so the elevated helper is no longer referenced.
revoke all on public.v_profiles_full from public;
revoke all on public.v_profiles_full from anon;
revoke all on public.v_profiles_full from authenticated;
drop view public.v_profiles_full;

-- Revoke every API-role execution path before dropping the SECURITY DEFINER helper.
revoke all on function public._auth_last_signins() from public;
revoke all on function public._auth_last_signins() from anon;
revoke all on function public._auth_last_signins() from authenticated;
revoke all on function public._auth_last_signins() from service_role;
drop function public._auth_last_signins();

-- This is the private own-profile contract. It intentionally contains no role or Auth metadata.
create view public.v_profiles_full
with (security_invoker = true, security_barrier = true)
as
select
  profile.user_id,
  profile.display_name,
  profile.display_name_override,
  profile.email,
  profile.phone,
  profile.given_name,
  profile.family_name,
  profile.avatar_url,
  profile.birthday,
  profile.gender,
  profile.language,
  profile.city_province,
  profile.country,
  profile.social_media1,
  profile.social_media2,
  profile.social_media3,
  profile.relationship_status,
  profile.job,
  profile.hobbies,
  profile.music,
  profile.fav_food,
  profile.profile_title,
  profile.profile_description,
  profile.account_privacy,
  profile.is_private,
  profile.locale,
  profile.timezone,
  profile.created_at,
  profile.updated_at
from public.profiles as profile;

comment on view public.v_profiles_full is
  'CoupleBinder private own-profile view; repair couplebinder.profile_rls_repair.20260727';

-- A security-invoker view needs base-table SELECT, while RLS limits rows to auth.uid().
-- Reset only incident-related API grants so old broad grants cannot survive the repair.
revoke all on public.profiles from public;
revoke all on public.profiles from anon;
revoke all on public.profiles from authenticated;
grant select, insert, update on public.profiles to authenticated;

revoke all on public.user_roles from public;
revoke all on public.user_roles from anon;
revoke all on public.user_roles from authenticated;

revoke all on public.audit_profiles from public;
revoke all on public.audit_profiles from anon;
revoke all on public.audit_profiles from authenticated;

revoke all on public.v_profiles_full from public;
revoke all on public.v_profiles_full from anon;
grant select on public.v_profiles_full to authenticated;

do $postflight$
declare
  view_definition text := pg_get_viewdef('public.v_profiles_full'::regclass, true);
  view_options text[];
begin
  select coalesce(reloptions, '{}'::text[])
  into view_options
  from pg_class
  where oid = 'public.v_profiles_full'::regclass;

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
  ) then
    raise exception using errcode = 'P0001', message = 'profile RLS repair postflight found a removed policy';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'user_roles', 'audit_profiles')
      and (
        coalesce(qual, '') ilike '%user_roles%'
        or coalesce(with_check, '') ilike '%user_roles%'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'profile RLS repair postflight found role-table policy authority';
  end if;

  if to_regprocedure('public._auth_last_signins()') is not null
     or position('user_roles' in lower(view_definition)) > 0
     or position('_auth_last_signins' in lower(view_definition)) > 0
     or not (view_options @> array['security_invoker=true'])
     or not (view_options @> array['security_barrier=true']) then
    raise exception using errcode = 'P0001', message = 'profile RLS repair postflight found an unsafe private view';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'v_profiles_full'
      and column_name in ('role', 'roles', 'last_sign_in_at')
  ) then
    raise exception using errcode = 'P0001', message = 'profile RLS repair postflight found forbidden view metadata';
  end if;

  if not has_table_privilege('authenticated', 'public.v_profiles_full', 'SELECT')
     or has_table_privilege('anon', 'public.v_profiles_full', 'SELECT')
     or has_table_privilege('authenticated', 'public.user_roles', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.user_roles', 'SELECT') then
    raise exception using errcode = 'P0001', message = 'profile RLS repair postflight found unsafe relation grants';
  end if;

  if has_table_privilege('anon', 'public.profiles', 'SELECT')
     or has_table_privilege('anon', 'public.profiles', 'INSERT')
     or has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or has_table_privilege('anon', 'public.profiles', 'DELETE')
     or not has_table_privilege('authenticated', 'public.profiles', 'SELECT')
     or not has_table_privilege('authenticated', 'public.profiles', 'INSERT')
     or not has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.profiles', 'DELETE') then
    raise exception using errcode = 'P0001', message = 'profile RLS repair postflight found unsafe profile grants';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
  ) <> 3
  or exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename in ('user_roles', 'audit_profiles')
  ) then
    raise exception using errcode = 'P0001', message = 'profile RLS repair postflight found unexpected policies';
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
    raise exception using errcode = 'P0001', message = 'profile RLS repair postflight found changed RLS enforcement';
  end if;
end
$postflight$;

commit;
