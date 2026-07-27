-- Purpose: Exercise synthetic callers against defective and approved RLS graphs.
-- Graphs: Old/hybrid exact recursion and Phase 0 approved own-only target.
-- Scope: Synthetic, test-only, and not a production migration.
-- Security assertion: Exact 42P17 is reproduced and no browser caller gains cross-user access.

\echo Phase: old-exact-42P17

set local role cb_rls_authenticated;
-- The subject and signed claims are transaction-local synthetic JWT context.
select cb_rls_test.set_context('1')
\g /dev/null
select cb_rls_test.assert_sqlstate(
  '42P17',
  'select * from cb_old_graph.v_profiles_full',
  'old profile view recursion'
)
\g /dev/null
reset role;
select cb_rls_test.set_context(null)
\g /dev/null

\echo Phase: hybrid-helper-and-exact-42P17

set local role cb_rls_authenticated;
select cb_rls_test.set_context('1')
\g /dev/null
select cb_rls_test.assert_count(
  'select * from cb_hybrid_graph._auth_last_signins()',
  2,
  'hybrid helper independent execution'
)
\g /dev/null
select cb_rls_test.assert_sqlstate(
  '42P17',
  'select * from cb_hybrid_graph.v_profiles_full',
  'hybrid profile view recursion'
)
\g /dev/null
reset role;
select cb_rls_test.set_context(null)
\g /dev/null

\echo Phase: target-anonymous-denial

set local role cb_rls_anon;
select cb_rls_test.set_context(null)
\g /dev/null
select cb_rls_test.assert_sqlstate(
  '42501',
  'select * from cb_target_graph.profiles',
  'anonymous direct profile denial'
)
\g /dev/null
select cb_rls_test.assert_sqlstate(
  '42501',
  'select * from cb_target_graph.v_profiles_private',
  'anonymous private view denial'
)
\g /dev/null
select cb_rls_test.assert_sqlstate(
  '42501',
  'select * from cb_target_graph.user_roles',
  'anonymous role-table denial'
)
\g /dev/null
select cb_rls_test.assert_sqlstate(
  '42501',
  'select * from cb_target_graph._auth_last_signins()',
  'anonymous helper path denied before name resolution'
)
\g /dev/null
reset role;
select cb_rls_test.set_context(null)
\g /dev/null

\echo Phase: target-ordinary-own-only

set local role cb_rls_authenticated;
select cb_rls_test.set_context('1')
\g /dev/null
select cb_rls_test.assert_count(
  'select * from cb_target_graph.profiles',
  1,
  'ordinary direct own profile'
)
\g /dev/null
select cb_rls_test.assert_count(
  'select * from cb_target_graph.v_profiles_private',
  1,
  'ordinary own private view'
)
\g /dev/null
select cb_rls_test.assert_count(
  'select * from cb_target_graph.v_profiles_private where user_id = 2',
  0,
  'ordinary cross-user private view'
)
\g /dev/null
select cb_rls_test.assert_sqlstate(
  '42501',
  'select * from cb_target_graph.user_roles',
  'ordinary direct role-table denial'
)
\g /dev/null
reset role;
select cb_rls_test.set_context(null)
\g /dev/null

\echo Phase: target-admin-claim-no-direct-bypass

set local role cb_rls_authenticated;
-- A signed admin-shaped claim is present, but target RLS remains own-only.
select cb_rls_test.set_context(
  '1',
  '{"app_metadata":{"roles":["admin"]}}'::jsonb
)
\g /dev/null
select cb_rls_test.assert_count(
  'select * from cb_target_graph.v_profiles_private where user_id = 2',
  0,
  'canonical admin claim cannot bypass own-only browser RLS'
)
\g /dev/null
select cb_rls_test.assert_sqlstate(
  '42501',
  'select * from cb_target_graph.user_roles',
  'canonical admin claim cannot read role table'
)
\g /dev/null
reset role;
select cb_rls_test.set_context(null)
\g /dev/null

\echo Phase: target-legacy-claims-no-direct-bypass

set local role cb_rls_authenticated;
select cb_rls_test.set_context(
  '1',
  '{"app_metadata":{"role":"admin"}}'::jsonb
)
\g /dev/null
select cb_rls_test.assert_count(
  'select * from cb_target_graph.v_profiles_private where user_id = 2',
  0,
  'legacy app metadata role cannot broaden database access'
)
\g /dev/null
select cb_rls_test.set_context(
  '1',
  '{"user_role":"admin"}'::jsonb
)
\g /dev/null
select cb_rls_test.assert_count(
  'select * from cb_target_graph.v_profiles_private where user_id = 2',
  0,
  'legacy top-level user role cannot broaden database access'
)
\g /dev/null
select cb_rls_test.set_context(
  '1',
  '{"app_metadata":{"roles":["super_user"]}}'::jsonb
)
\g /dev/null
select cb_rls_test.assert_count(
  'select * from cb_target_graph.v_profiles_private where user_id = 2',
  0,
  'conditional super user cannot broaden browser database access'
)
\g /dev/null
reset role;
select cb_rls_test.set_context(null)
\g /dev/null

\echo Phase: target-browser-metadata-no-authority

set local role cb_rls_authenticated;
select cb_rls_test.set_context(
  '1',
  '{}'::jsonb,
  '{"roles":["admin"],"role":"admin"}'::jsonb
)
\g /dev/null
select cb_rls_test.assert_count(
  'select * from cb_target_graph.v_profiles_private where user_id = 2',
  0,
  'browser metadata cannot broaden database access'
)
\g /dev/null
reset role;
select cb_rls_test.set_context(null)
\g /dev/null

\echo Phase: target-service-role-separation

set local role cb_rls_service;
-- Service-equivalent access is tested separately from every browser role.
select cb_rls_test.set_context(null)
\g /dev/null
select cb_rls_test.assert_count(
  'select * from cb_target_graph.profiles',
  2,
  'service role operational profile access'
)
\g /dev/null
select cb_rls_test.assert_count(
  'select * from cb_target_graph.v_profiles_private',
  2,
  'service role operational private view access'
)
\g /dev/null
select cb_rls_test.assert_count(
  'select * from cb_target_graph.user_roles',
  2,
  'service role operational role-record access'
)
\g /dev/null
reset role;
select cb_rls_test.set_context(null)
\g /dev/null
