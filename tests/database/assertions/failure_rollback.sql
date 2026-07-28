-- Purpose: Inject a deterministic failure after a representative policy mutation.
-- Scope: Synthetic transaction-semantics test; not a production migration.
-- Starting state: A supported hybrid fixture.
-- Security guarantee: PostgreSQL must roll back both catalog and row changes after the assertion failure.

\set ON_ERROR_STOP on

begin;
set local lock_timeout = '3s';
set local statement_timeout = '15s';

drop policy profiles_public_read on public.profiles;
update public.profiles
set display_name = 'Synthetic rollback mutation'
where user_id = '00000000-0000-4000-8000-000000000001';

do $failure$
begin
  raise exception using
    errcode = 'P0001',
    message = 'intentional Phase 2 rollback assertion';
end
$failure$;

commit;
