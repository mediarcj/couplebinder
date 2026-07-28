-- Purpose: Prove the Phase 2 compensation leaves a safe fail-closed profile posture.
-- Scope: Synthetic test-only postflight assertions; not a production migration.
-- Starting state: The corrected migration followed by the compensating migration.
-- Security guarantee: Compensation never restores recursion, public discovery, role access, or the Auth helper.

\set ON_ERROR_STOP on

do $catalog$
begin
  if to_regclass('public.v_profiles_full') is not null
     or to_regprocedure('public._auth_last_signins()') is not null then
    raise exception using errcode = 'P0001', message = 'compensation did not fail the feature closed';
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
    raise exception using errcode = 'P0001', message = 'compensation restored a vulnerable policy';
  end if;

  if has_table_privilege('authenticated', 'public.user_roles', 'SELECT')
     or has_table_privilege('anon', 'public.profiles', 'SELECT') then
    raise exception using errcode = 'P0001', message = 'compensation restored unsafe direct access';
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
    raise exception using errcode = 'P0001', message = 'compensation changed RLS enforcement';
  end if;
end
$catalog$;

begin;
set local role authenticated;
select phase2_test.set_context('00000000-0000-4000-8000-000000000001')
\g /dev/null
select phase2_test.assert_sqlstate(
  '42P01',
  'select * from public.v_profiles_full',
  'compensated private view is absent'
)
\g /dev/null
select phase2_test.assert_count(
  'select * from public.profiles',
  1,
  'safe own-profile table access remains'
)
\g /dev/null
select phase2_test.assert_sqlstate(
  '42501',
  'select * from public.user_roles',
  'compensated role-table denial'
)
\g /dev/null
reset role;
select phase2_test.set_context(null)
\g /dev/null
commit;

begin;
set local role service_role;
select phase2_test.assert_count(
  'select * from public.profiles',
  2,
  'compensation preserves separate service-role profile access'
)
\g /dev/null
select phase2_test.assert_count(
  'select * from public.user_roles',
  2,
  'compensation preserves separate service-role role-record access'
)
\g /dev/null
reset role;
commit;
