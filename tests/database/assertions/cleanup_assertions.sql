-- Purpose: Remove and verify every object created by the synthetic RLS harness.
-- Graphs: Old, hybrid, approved target, and their synthetic caller roles.
-- Scope: Synthetic, test-only, and not a production migration.
-- Security assertion: Caller context, schemas, roles, grants, and rows cannot leak.

reset role;
select cb_rls_test.set_context(null)
\g /dev/null

select cb_rls_test.assert_true(
  coalesce(current_setting('request.jwt.claim.sub', true), '') = ''
  and coalesce(current_setting('request.jwt.claims', true), '') in ('', '{}')
  and coalesce(current_setting('request.jwt.claim.user_metadata', true), '') in ('', '{}'),
  'transaction-local caller context must be cleared'
)
\g /dev/null

drop schema cb_target_graph cascade;
drop schema cb_hybrid_graph cascade;
drop schema cb_hybrid_auth cascade;
drop schema cb_old_graph cascade;

drop owned by cb_rls_anon;
drop owned by cb_rls_authenticated;
drop owned by cb_rls_service;

drop role cb_rls_anon;
drop role cb_rls_authenticated;
drop role cb_rls_service;

drop schema cb_rls_test cascade;

do $cleanup_assertions$
begin
  if exists (
    select 1
    from pg_namespace
    where nspname in (
      'cb_rls_test',
      'cb_old_graph',
      'cb_hybrid_auth',
      'cb_hybrid_graph',
      'cb_target_graph'
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'synthetic schema cleanup assertion failed';
  end if;

  if exists (
    select 1
    from pg_roles
    where rolname in (
      'cb_rls_anon',
      'cb_rls_authenticated',
      'cb_rls_service'
    )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'synthetic role cleanup assertion failed';
  end if;
end
$cleanup_assertions$;
