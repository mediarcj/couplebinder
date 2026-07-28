-- Purpose: Emit one opaque fingerprint for Phase 2 catalog and synthetic row state.
-- Scope: Synthetic test-only comparison helper; not a production migration.
-- Assertion role: The disposable database administrator runs this before and after expected failures.
-- Security guarantee: Tests compare state without printing synthetic rows or catalog definitions.

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

select md5(
  coalesce((
    select string_agg(
      schemaname || '.' || tablename || '.' || policyname || ':' ||
      cmd || ':' || permissive || ':' || roles::text || ':' ||
      coalesce(qual, '') || ':' || coalesce(with_check, ''),
      E'\n' order by schemaname, tablename, policyname
    )
    from pg_policies
    where schemaname in ('public', 'auth', 'phase2_test')
  ), '') ||
  coalesce((
    select string_agg(
      namespace.nspname || '.' || relation.relname || ':' || relation.relkind::text || ':' ||
      relation.relrowsecurity::text || ':' || relation.relforcerowsecurity::text || ':' ||
      coalesce(relation.reloptions::text, '') || ':' ||
      coalesce(relation.relacl::text, '') || ':' ||
      case
        when relation.relkind = 'v' then pg_get_viewdef(relation.oid, true)
        else ''
      end,
      E'\n' order by namespace.nspname, relation.relname
    )
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname in ('public', 'auth', 'phase2_test')
      and relation.relkind in ('r', 'p', 'v')
  ), '') ||
  coalesce((
    select string_agg(
      namespace.nspname || '.' || routine.proname || ':' ||
      routine.prosecdef::text || ':' ||
      coalesce(routine.proconfig::text, '') || ':' ||
      coalesce(routine.proacl::text, '') || ':' ||
      pg_get_functiondef(routine.oid),
      E'\n' order by namespace.nspname, routine.proname, routine.oid
    )
    from pg_proc as routine
    join pg_namespace as namespace on namespace.oid = routine.pronamespace
    where namespace.nspname in ('public', 'auth', 'phase2_test')
  ), '') ||
  coalesce((select count(*)::text from public.profiles), 'missing') ||
  coalesce((select count(*)::text from public.user_roles), 'missing')
);
