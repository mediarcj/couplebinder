-- Purpose: Model an unknown policy drift that must never be repaired by assumption.
-- Scope: Synthetic test-only fixture; not a production migration.
-- Starting state: Hybrid graph with a same-named but non-recursive user_roles policy.
-- Security assertion: The forward migration must abort before mutation and preserve the fingerprint.

\set ON_ERROR_STOP on
\ir supported_hybrid_start.sql

drop policy user_roles_admin_all on public.user_roles;
create policy user_roles_admin_all
on public.user_roles
using (false)
with check (false);
