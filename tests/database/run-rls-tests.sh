#!/usr/bin/env bash

# Purpose: Guard and run the defective and approved synthetic RLS graphs.
# Data: Synthetic rows and caller context only.
# Scope: Test-only; this is not a production migration or deployment script.
# Security assertion: Refuse every target that is not provably local and isolated.

set -euo pipefail

readonly REQUIRED_CONFIRM='ISOLATED_SYNTHETIC_DATABASE_ONLY'
readonly DATABASE_PREFIX='couplebinder_rls_'
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

fail() {
  printf '%s\n' "PHASE 1 FAIL: $1" >&2
  exit 1
}

safe_phase() {
  printf 'Phase: %s\n' "$1"
}

[[ "${COUPLEBINDER_RLS_TEST_CONFIRM:-}" == "$REQUIRED_CONFIRM" ]] ||
  fail 'isolation confirmation is missing or invalid'

for url_var in DATABASE_URL SUPABASE_DB_URL POSTGRES_URL COUPLEBINDER_RLS_TEST_URL; do
  [[ -z "${!url_var:-}" ]] || fail 'URL-style database environment variables are not allowed'
done

[[ -z "${PGSERVICE:-}" ]] || fail 'PGSERVICE is not allowed'
[[ -z "${PGHOSTADDR:-}" ]] || fail 'PGHOSTADDR is not allowed'

readonly SAFE_HOST="${PGHOST:-}"
case "$SAFE_HOST" in
  localhost|127.0.0.1|::1|/*) ;;
  *) fail 'PGHOST must be loopback or a local Unix socket' ;;
esac

readonly SAFE_PORT="${PGPORT:-5432}"
[[ "$SAFE_PORT" =~ ^[0-9]{1,5}$ ]] || fail 'PGPORT must be numeric'
(( SAFE_PORT >= 1 && SAFE_PORT <= 65535 )) || fail 'PGPORT is outside the valid range'

readonly SAFE_DATABASE="${PGDATABASE:-}"
[[ "$SAFE_DATABASE" == "${DATABASE_PREFIX}"* ]] ||
  fail 'PGDATABASE does not have the required synthetic prefix'
[[ "$SAFE_DATABASE" != *production* ]] ||
  fail 'PGDATABASE contains a forbidden production marker'

[[ -n "${PGUSER:-}" ]] || fail 'PGUSER is required'
[[ -n "${PGPASSWORD:-}" ]] || fail 'PGPASSWORD is required'

command -v psql >/dev/null 2>&1 || fail 'psql is unavailable'

export PGCONNECT_TIMEOUT=3
export LC_ALL=C
unset PGPASSFILE PGOPTIONS

readonly -a PSQL=(
  psql
  -X
  --no-psqlrc
  --quiet
  --tuples-only
  --no-align
  --set=ON_ERROR_STOP=1
  --host="$SAFE_HOST"
  --port="$SAFE_PORT"
  --dbname="$SAFE_DATABASE"
  --username="$PGUSER"
)

safe_phase 'isolation-check'

database_classification="$(
  "${PSQL[@]}" --command="
    select case
      when current_database() like 'couplebinder_rls_%'
       and not pg_is_in_recovery()
       and has_database_privilege(current_user, current_database(), 'CREATE')
       and exists (
         select 1
         from pg_roles
         where rolname = current_user
           and rolcreaterole
           and rolsuper
           and rolbypassrls
       )
      then 'isolated-synthetic'
      else 'refuse'
    end;
  " | tr -d '[:space:]'
)" || fail 'local database capability check failed'

[[ "$database_classification" == 'isolated-synthetic' ]] ||
  fail 'connected database did not prove the isolated synthetic contract'

database_version="$(
  "${PSQL[@]}" --command="show server_version;" | tr -d '[:space:]'
)" || fail 'could not read the local PostgreSQL version'

printf 'Database classification: %s\n' "$database_classification"
printf 'Database version: %s\n' "$database_version"

server_major="${database_version%%.*}"
[[ "$server_major" =~ ^[0-9]+$ ]] || fail 'could not classify PostgreSQL version'
(( server_major >= 15 )) || fail 'PostgreSQL 15 or newer is required'

safe_phase 'synthetic-rls-graphs'
if "${PSQL[@]}" --file="$SCRIPT_DIR/rls_profiles.psql"; then
  printf '%s\n' 'PHASE 1 PASS: synthetic RLS graphs, access matrix, catalog assertions, and cleanup passed'
else
  fail 'synthetic RLS test execution failed'
fi
