-- Purpose: Inspect catalog security for all synthetic RLS graphs.
-- Graphs: Defective old/hybrid and Phase 0 approved target.
-- Scope: Synthetic, test-only, and not a production migration.
-- Security assertion: Policies, grants, view options, and dependencies match exactly.

select cb_rls_test.assert_true(
  (
    select bool_and(class.relrowsecurity and not class.relforcerowsecurity)
    from pg_class as class
    join pg_namespace as namespace
      on namespace.oid = class.relnamespace
    where namespace.nspname in (
      'cb_old_graph',
      'cb_hybrid_graph',
      'cb_target_graph'
    )
      and class.relname in ('profiles', 'user_roles')
  ),
  'RLS must be enabled and FORCE RLS must be false in each synthetic graph'
)
\g /dev/null

select cb_rls_test.assert_true(
  (
    select count(*) = 1
    from pg_policies
    where schemaname = 'cb_old_graph'
      and tablename = 'user_roles'
      and policyname = 'user_roles_admin_all'
      and cmd = 'ALL'
      and permissive = 'PERMISSIVE'
      and 'public' = any(roles)
      and qual ilike '%user_roles%'
      and with_check ilike '%user_roles%'
  ),
  'old recursive policy catalog shape'
)
\g /dev/null

select cb_rls_test.assert_true(
  (
    select count(*) = 1
    from pg_policies
    where schemaname = 'cb_old_graph'
      and tablename = 'user_roles'
      and policyname = 'user_roles_read_own'
      and cmd = 'SELECT'
      and 'cb_rls_authenticated' = any(roles)
  ),
  'old own-role policy must coexist with recursion'
)
\g /dev/null

select cb_rls_test.assert_true(
  (
    select count(*) = 1
    from pg_policies
    where schemaname = 'cb_hybrid_graph'
      and tablename = 'profiles'
      and policyname = 'profiles_public_read'
      and cmd = 'SELECT'
      and 'public' = any(roles)
  ),
  'hybrid public profile policy catalog shape'
)
\g /dev/null

select cb_rls_test.assert_true(
  (
    select count(*) = 1
    from pg_policies
    where schemaname = 'cb_hybrid_graph'
      and tablename = 'user_roles'
      and policyname = 'user_roles_admin_all'
      and qual ilike '%user_roles%'
  ),
  'hybrid recursive policy catalog shape'
)
\g /dev/null

select cb_rls_test.assert_true(
  (
    select class.reloptions @> array['security_invoker=true']
      and not coalesce(class.reloptions @> array['security_barrier=true'], false)
    from pg_class as class
    where class.oid = 'cb_hybrid_graph.v_profiles_full'::regclass
  ),
  'hybrid view must be invoker without barrier'
)
\g /dev/null

select cb_rls_test.assert_true(
  (
    select pg_get_userbyid(class.relowner) = current_user
    from pg_class as class
    where class.oid = 'cb_hybrid_graph.v_profiles_full'::regclass
  ),
  'hybrid view owner'
)
\g /dev/null

select cb_rls_test.assert_true(
  exists (
    select 1
    from pg_rewrite as rewrite
    join pg_depend as dependency
      on dependency.classid = 'pg_rewrite'::regclass
     and dependency.objid = rewrite.oid
    where rewrite.ev_class = 'cb_hybrid_graph.v_profiles_full'::regclass
      and dependency.refobjid = 'cb_hybrid_graph.user_roles'::regclass
  ),
  'hybrid view must depend on user_roles'
)
\g /dev/null

select cb_rls_test.assert_true(
  exists (
    select 1
    from pg_rewrite as rewrite
    join pg_depend as dependency
      on dependency.classid = 'pg_rewrite'::regclass
     and dependency.objid = rewrite.oid
    where rewrite.ev_class = 'cb_hybrid_graph.v_profiles_full'::regclass
      and dependency.refobjid = 'cb_hybrid_graph._auth_last_signins()'::regprocedure
  ),
  'hybrid view must depend on the synthetic helper'
)
\g /dev/null

select cb_rls_test.assert_true(
  has_function_privilege(
    'cb_rls_anon',
    'cb_hybrid_graph._auth_last_signins()',
    'EXECUTE'
  ),
  'hybrid helper must model broad execution'
)
\g /dev/null

select cb_rls_test.assert_true(
  (
    select class.reloptions @> array['security_invoker=true']
      and class.reloptions @> array['security_barrier=true']
    from pg_class as class
    where class.oid = 'cb_target_graph.v_profiles_private'::regclass
  ),
  'target private view options'
)
\g /dev/null

select cb_rls_test.assert_true(
  (
    select pg_get_userbyid(class.relowner) = current_user
    from pg_class as class
    where class.oid = 'cb_target_graph.v_profiles_private'::regclass
  ),
  'target private view owner'
)
\g /dev/null

select cb_rls_test.assert_true(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'cb_target_graph'
      and (
        policyname in (
          'profiles_public_read',
          'profiles_admin_read',
          'profiles_admin_update',
          'user_roles_admin_all',
          'user_roles_read_own'
        )
        or coalesce(qual, '') ilike '%user_roles%'
        or coalesce(with_check, '') ilike '%user_roles%'
      )
  ),
  'target graph must have no public, role-admin, or self-referential policy'
)
\g /dev/null

select cb_rls_test.assert_true(
  (
    select count(*) = 1
    from pg_policies
    where schemaname = 'cb_target_graph'
      and tablename = 'profiles'
      and policyname = 'profiles_select_own'
      and cmd = 'SELECT'
      and permissive = 'PERMISSIVE'
      and 'cb_rls_authenticated' = any(roles)
  ),
  'target own-profile policy catalog shape'
)
\g /dev/null

select cb_rls_test.assert_true(
  not exists (
    select 1
    from pg_rewrite as rewrite
    join pg_depend as dependency
      on dependency.classid = 'pg_rewrite'::regclass
     and dependency.objid = rewrite.oid
    where rewrite.ev_class = 'cb_target_graph.v_profiles_private'::regclass
      and dependency.refobjid = 'cb_target_graph.user_roles'::regclass
  ),
  'target private view must not depend on user_roles'
)
\g /dev/null

select cb_rls_test.assert_true(
  to_regprocedure('cb_target_graph._auth_last_signins()') is null,
  'target helper must be absent'
)
\g /dev/null

select cb_rls_test.assert_true(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'cb_target_graph'
      and table_name = 'v_profiles_private'
      and column_name in ('role', 'roles')
  ),
  'target private view must not expose role aggregation'
)
\g /dev/null

select cb_rls_test.assert_true(
  has_table_privilege(
    'cb_rls_authenticated',
    'cb_target_graph.v_profiles_private',
    'SELECT'
  )
  and not has_table_privilege(
    'cb_rls_anon',
    'cb_target_graph.v_profiles_private',
    'SELECT'
  )
  and not has_table_privilege(
    'cb_rls_authenticated',
    'cb_target_graph.user_roles',
    'SELECT'
  )
  and has_table_privilege(
    'cb_rls_service',
    'cb_target_graph.user_roles',
    'SELECT'
  ),
  'target relation grants'
)
\g /dev/null
