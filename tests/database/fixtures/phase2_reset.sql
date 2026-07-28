-- Purpose: Remove every synthetic object used by the Phase 2 migration matrix.
-- Scope: Test-only cleanup for an isolated disposable database; not a production migration.
-- Starting state: Any Phase 2 synthetic old, hybrid, repaired, drifted, or compensated graph.
-- Security guarantee: No synthetic API role, Auth shim, profile relation, policy, view, or row survives.

\set ON_ERROR_STOP on

drop schema if exists phase2_test cascade;
drop schema if exists auth cascade;
drop schema if exists public cascade;
create schema public;

do $cleanup_roles$
declare
  role_name text;
begin
  foreach role_name in array array['anon', 'authenticated', 'service_role']
  loop
    if exists (select 1 from pg_roles where rolname = role_name) then
      execute format('drop owned by %I', role_name);
      execute format('drop role %I', role_name);
    end if;
  end loop;
end
$cleanup_roles$;
