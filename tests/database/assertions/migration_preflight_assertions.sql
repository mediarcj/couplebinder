-- Purpose: Independently verify a Phase 2 fixture before the forward migration runs.
-- Scope: Synthetic test-only catalog assertions; not a production migration.
-- Starting state: Set expected_state to old, hybrid, or drift.
-- Security guarantee: Tests do not claim support from object names without checking policy and dependency shape.

\set ON_ERROR_STOP on

select set_config('couplebinder.phase2_expected_state', :'expected_state', false)
\g /dev/null

do $assertions$
declare
  expected_state text := current_setting('couplebinder.phase2_expected_state');
  view_definition text := pg_get_viewdef('public.v_profiles_full'::regclass, true);
  view_options text[];
begin
  select coalesce(reloptions, '{}'::text[])
  into view_options
  from pg_class
  where oid = 'public.v_profiles_full'::regclass;

  if to_regprocedure('public._auth_last_signins()') is null
     or position('user_roles' in lower(view_definition)) = 0
     or position('_auth_last_signins' in lower(view_definition)) = 0 then
    raise exception using
      errcode = 'P0001',
      message = 'fixture preflight is missing the expected dependency graph';
  end if;

  if expected_state = 'old' and view_options @> array['security_invoker=true'] then
    raise exception using errcode = 'P0001', message = 'old fixture unexpectedly uses invoker rights';
  elsif expected_state in ('hybrid', 'drift')
        and not (view_options @> array['security_invoker=true']) then
    raise exception using errcode = 'P0001', message = 'hybrid fixture lacks invoker rights';
  elsif expected_state not in ('old', 'hybrid', 'drift') then
    raise exception using errcode = 'P0001', message = 'unknown fixture expectation';
  end if;

  if expected_state in ('old', 'hybrid') and not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'user_roles_admin_all'
      and coalesce(qual, '') ilike '%user_roles%'
      and coalesce(with_check, '') ilike '%user_roles%'
  ) then
    raise exception using errcode = 'P0001', message = 'supported fixture lacks exact recursive policy';
  end if;

  if expected_state = 'drift' and exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_roles'
      and policyname = 'user_roles_admin_all'
      and coalesce(qual, '') ilike '%user_roles%'
  ) then
    raise exception using errcode = 'P0001', message = 'drift fixture still has the supported recursive shape';
  end if;
end
$assertions$;
