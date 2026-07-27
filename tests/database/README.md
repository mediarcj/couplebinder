# CoupleBinder RLS Test Foundation

Purpose: document the defective and approved synthetic RLS test laboratory.

Data: synthetic records and caller context only.

Scope: test-only; no file in this folder is a production migration.

Security assertion: exact recursion and the approved own-only access contract are independently proven.

## Purpose

This folder contains a synthetic PostgreSQL test laboratory for CoupleBinder's
profile and role Row Level Security graph.

The tests prove three separate contracts:

1. The old repository policy graph fails with SQLSTATE `42P17`.
2. The supplied deployed hybrid graph also fails with SQLSTATE `42P17`.
3. The Phase 0 approved target graph permits own-profile access and denies
   anonymous, cross-user, role-table, and browser-direct administrator access.

These files are tests only. They are not migrations.

## Why unit mocks are not enough

JavaScript unit tests can confirm how application code handles a provider
result. They cannot make PostgreSQL evaluate policies, view invoker rights,
relation grants, function ACLs, or policy recursion. Exact `42P17` reproduction
therefore requires a real isolated PostgreSQL server.

## Strict nonproduction warning

Never run this harness against staging, production, a hosted Supabase project,
or an application database.

The runner refuses to start unless:

- `COUPLEBINDER_RLS_TEST_CONFIRM` has the exact required value;
- `PGHOST` is loopback or a local Unix socket;
- `PGDATABASE` starts with `couplebinder_rls_`;
- no URL-style database environment variable is present;
- the connected database confirms the synthetic name prefix;
- the connected role can create the disposable roles and schemas.

These guards reduce risk but do not replace operator judgment.

## Prerequisites

- PostgreSQL client `psql`.
- An already available isolated local PostgreSQL 15 or newer server.
- A dedicated synthetic database whose name begins with
  `couplebinder_rls_`.
- A local test role able to create and drop schemas and roles.
- No production configuration in the shell.

PostgreSQL 15 or newer is required because the target view uses
`security_invoker`.

## Environment guard

Set these values only in the shell used for the test:

- `COUPLEBINDER_RLS_TEST_CONFIRM`
- `PGHOST`
- `PGPORT`
- `PGDATABASE`
- `PGUSER`
- `PGPASSWORD`

The required confirmation value is:

`ISOLATED_SYNTHETIC_DATABASE_ONLY`

Do not use a complete connection URL. The runner rejects common URL-style
database variables so it does not accidentally inherit a hosted connection.

## Safe run command

After setting the guarded environment variables for an isolated local
database, run:

```sh
tests/database/run-rls-tests.sh
```

The script prints only a safe database classification, PostgreSQL version,
test phase, and pass/fail status. It never prints the password or connection
details.

## Expected results

Old graph:

- an authenticated private-profile view query reaches
  `user_roles_admin_all`;
- exact SQLSTATE `42P17` is caught and treated as the expected reproduction;
- another SQLSTATE or an unexpected success fails the harness.

Hybrid graph:

- a `security_invoker` view evaluates underlying caller RLS;
- the old role-table policy still raises exact SQLSTATE `42P17`;
- `user_roles_read_own` does not neutralize recursion;
- the synthetic last-sign-in helper succeeds independently, proving it is a
  separate privilege/dependency concern rather than the direct recursion
  source.

Approved target:

- anonymous access is denied;
- ordinary authenticated access returns only the caller's profile;
- cross-user and direct role-table access are denied;
- admin-shaped and legacy-shaped browser claims do not broaden database
  access;
- the private view has no role aggregation or helper dependency;
- service-role-equivalent behavior stays separate and explicit;
- catalog, grant, view-option, dependency, and cleanup assertions pass.

## Generated objects

Inside one transaction, the test creates:

- `cb_rls_anon`
- `cb_rls_authenticated`
- `cb_rls_service`
- `cb_rls_test`
- `cb_old_graph`
- `cb_hybrid_auth`
- `cb_hybrid_graph`
- `cb_target_graph`

The three roles are synthetic PostgreSQL roles. The remaining names are
synthetic schemas. Fixed integer identifiers and invented profile labels are
used. No production identifiers or records are needed.

## Cleanup

The harness drops every generated schema, role, grant, policy, view, function,
and row before committing. It then asserts that none remain.

If any assertion fails, `ON_ERROR_STOP` ends the session and PostgreSQL rolls
back the open transaction. Running the harness a second time verifies
repeatability.

The runner uses a transaction advisory lock, bounded lock timeout, bounded
statement timeout, and no persistent volume requirement.

## Troubleshooting

`Isolation guard failed`

- Check the confirmation value.
- Confirm that `PGHOST` is loopback or a local socket.
- Use a dedicated database name beginning with `couplebinder_rls_`.
- Clear inherited URL-style database variables.

`Connection failed`

- Confirm the local database is running.
- Confirm its loopback port and local test credentials.
- Do not replace the local host with a remote provider.

`Capability check failed`

- Use the administrator of the disposable local database.
- Do not grant new power on an application, staging, or production database.

`Unexpected SQLSTATE`

- Treat it as a failed reproduction.
- Review PostgreSQL version, fixture creation, grants, and caller role.
- Do not weaken the assertion to accept any error.

`Cleanup failed`

- Stop using the database.
- Inspect only the synthetic `cb_` objects.
- Destroy the disposable local database or container.

## Phase 2 use

Phase 2 may use these tests to develop a later-dated corrected migration and a
safe compensating migration. Phase 2 must add supported starting-state
fixtures and run its migration artifacts through this laboratory.

Phase 1 does not authorize creating, editing, moving, or running anything under
`db/migrations/`.

## Production prohibition

Do not apply any file in this folder to staging or production. Do not copy
production data, tokens, connection strings, profile records, or identifiers
into these fixtures.
