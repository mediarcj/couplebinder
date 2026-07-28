-- Purpose: Prove the repaired Phase 2 catalog and browser access contract.
-- Scope: Synthetic test-only postflight assertions; not a production migration.
-- Starting state: A supported fixture after the corrected forward migration commits.
-- Security guarantee: Own-profile access works without public, role-table, helper, or claim-shaped bypass.

\set ON_ERROR_STOP on

do $catalog$
declare
  view_definition text := pg_get_viewdef('public.v_profiles_full'::regclass, true);
  view_options text[];
begin
  select coalesce(reloptions, '{}'::text[])
  into view_options
  from pg_class
  where oid = 'public.v_profiles_full'::regclass;

  if not (view_options @> array['security_invoker=true'])
     or not (view_options @> array['security_barrier=true']) then
    raise exception using errcode = 'P0001', message = 'target view options failed';
  end if;

  if position('user_roles' in lower(view_definition)) > 0
     or position('_auth_last_signins' in lower(view_definition)) > 0
     or to_regprocedure('public._auth_last_signins()') is not null then
    raise exception using errcode = 'P0001', message = 'target view/helper dependency failed';
  end if;

  if exists (
    select 1
    from pg_rewrite as rewrite
    join pg_depend as dependency
      on dependency.classid = 'pg_rewrite'::regclass
     and dependency.objid = rewrite.oid
    where rewrite.ev_class = 'public.v_profiles_full'::regclass
      and dependency.refobjid = 'public.user_roles'::regclass
  ) then
    raise exception using errcode = 'P0001', message = 'target view still depends on user_roles';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'v_profiles_full'
      and column_name in ('role', 'roles', 'last_sign_in_at')
  ) then
    raise exception using errcode = 'P0001', message = 'target view exposes forbidden metadata';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and (
        policyname in (
          'user_roles_admin_all',
          'user_roles_read_own',
          'profiles_admin_read',
          'profiles_admin_update',
          'audit_profiles_admin_read',
          'profiles_public_read'
        )
        or coalesce(qual, '') ilike '%user_roles%'
        or coalesce(with_check, '') ilike '%user_roles%'
      )
  ) then
    raise exception using errcode = 'P0001', message = 'target policy graph failed';
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
      and 'authenticated' = any(roles)
  ) <> 3 then
    raise exception using errcode = 'P0001', message = 'target own-profile policies failed';
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
    raise exception using errcode = 'P0001', message = 'target RLS state failed';
  end if;

  if not has_table_privilege('authenticated', 'public.v_profiles_full', 'SELECT')
     or has_table_privilege('anon', 'public.v_profiles_full', 'SELECT')
     or has_table_privilege('authenticated', 'public.user_roles', 'SELECT')
     or not has_table_privilege('service_role', 'public.profiles', 'SELECT')
     or not has_table_privilege('service_role', 'public.user_roles', 'SELECT') then
    raise exception using errcode = 'P0001', message = 'target relation grants failed';
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
    raise exception using errcode = 'P0001', message = 'target policy inventory failed';
  end if;
end
$catalog$;

begin;

set local role anon;
select phase2_test.set_context(null)
\g /dev/null
select phase2_test.assert_sqlstate(
  '42501',
  'select * from public.v_profiles_full',
  'anonymous private view denial'
)
\g /dev/null
select phase2_test.assert_sqlstate(
  '42501',
  'select * from public.profiles',
  'anonymous direct profile denial'
)
\g /dev/null
select phase2_test.assert_sqlstate(
  '42501',
  'select * from public.user_roles',
  'anonymous direct role-table denial'
)
\g /dev/null
reset role;

set local role authenticated;
select phase2_test.set_context('00000000-0000-4000-8000-000000000001')
\g /dev/null
select phase2_test.assert_count(
  'select * from public.v_profiles_full',
  1,
  'authenticated own private profile'
)
\g /dev/null
select phase2_test.assert_count(
  'select * from public.v_profiles_full where user_id = ''00000000-0000-4000-8000-000000000002''',
  0,
  'authenticated cross-user denial'
)
\g /dev/null
select phase2_test.assert_sqlstate(
  '42501',
  'select * from public.user_roles',
  'authenticated direct role-table denial'
)
\g /dev/null

-- Signed or browser-editable admin-shaped metadata never broadens browser RLS.
select phase2_test.set_context(
  '00000000-0000-4000-8000-000000000001',
  '{"app_metadata":{"roles":["admin"]}}'::jsonb,
  '{"roles":["admin"]}'::jsonb
)
\g /dev/null
select phase2_test.assert_count(
  'select * from public.v_profiles_full where user_id = ''00000000-0000-4000-8000-000000000002''',
  0,
  'admin-shaped browser claim has no cross-user access'
)
\g /dev/null

select phase2_test.set_context(
  '00000000-0000-4000-8000-000000000001',
  '{"app_metadata":{"role":"admin"},"user_role":"admin"}'::jsonb,
  '{}'::jsonb
)
\g /dev/null
select phase2_test.assert_count(
  'select * from public.v_profiles_full where user_id = ''00000000-0000-4000-8000-000000000002''',
  0,
  'legacy-shaped claims have no cross-user access'
)
\g /dev/null

select phase2_test.set_context(
  '00000000-0000-4000-8000-000000000001',
  '{}'::jsonb,
  '{"roles":["admin"],"role":"super_user"}'::jsonb
)
\g /dev/null
select phase2_test.assert_count(
  'select * from public.v_profiles_full where user_id = ''00000000-0000-4000-8000-000000000002''',
  0,
  'browser-editable metadata has no database authority'
)
\g /dev/null
reset role;
select phase2_test.set_context(null)
\g /dev/null

commit;

select phase2_test.assert_true(
  coalesce(current_setting('request.jwt.claim.sub', true), '') = '',
  'transaction-local caller subject was cleared'
)
\g /dev/null

begin;
set local role service_role;
select phase2_test.assert_count(
  'select * from public.profiles',
  2,
  'service role profile operation stays separate'
)
\g /dev/null
select phase2_test.assert_count(
  'select * from public.user_roles',
  2,
  'service role secondary role-record access stays separate'
)
\g /dev/null
reset role;
commit;
