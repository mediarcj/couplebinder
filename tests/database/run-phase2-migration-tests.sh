#!/usr/bin/env bash

# Purpose: Exercise the Phase 2 forward and compensating migrations against synthetic states.
# Scope: Test-only local PostgreSQL runner; this is not a production migration or deploy script.
# Starting states: Supported old, supported hybrid, already repaired, and unknown drift graphs.
# Security guarantee: Refuse non-loopback targets and prove mutation, rollback, locking, and cleanup.
# Compensation: Verifies that compensation stays fail-closed instead of restoring the defective graph.

set -euo pipefail

readonly REQUIRED_CONFIRM='ISOLATED_SYNTHETIC_DATABASE_ONLY'
readonly DATABASE_PREFIX='couplebinder_rls_'
readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPOSITORY_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
readonly FIXTURE_DIR="$SCRIPT_DIR/fixtures"
readonly ASSERTION_DIR="$SCRIPT_DIR/assertions"
readonly FORWARD_MIGRATION="$REPOSITORY_DIR/db/migrations/20260727_repair_profile_rls_authorization.sql"
readonly COMPENSATING_MIGRATION="$REPOSITORY_DIR/db/migrations/20260727_compensate_profile_rls_authorization.sql"

temporary_directory=''
lock_holder_pid=''

fail() {
  printf '%s\n' "PHASE 2 FAIL: $1" >&2
  exit 1
}

safe_phase() {
  printf 'Phase: %s\n' "$1"
}

cleanup_local_state() {
  if [[ -n "$lock_holder_pid" ]] && kill -0 "$lock_holder_pid" 2>/dev/null; then
    kill "$lock_holder_pid" 2>/dev/null || true
    wait "$lock_holder_pid" 2>/dev/null || true
  fi
  if [[ -n "$temporary_directory" && -d "$temporary_directory" ]]; then
    rm -rf -- "$temporary_directory"
  fi
}
trap cleanup_local_state EXIT

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

[[ -f "$FORWARD_MIGRATION" ]] || fail 'forward migration is missing'
[[ -f "$COMPENSATING_MIGRATION" ]] || fail 'compensating migration is missing'

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

temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/couplebinder-phase2.XXXXXX")"

run_file() {
  local file_path="$1"
  shift
  "${PSQL[@]}" "$@" --file="$file_path" >"$temporary_directory/success.log" 2>&1 ||
    fail "execution failed for $(basename "$file_path")"
}

expect_file_failure() {
  local label="$1"
  local expected_text="$2"
  local file_path="$3"
  shift 3

  if "${PSQL[@]}" "$@" --file="$file_path" >"$temporary_directory/expected-failure.log" 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  grep -Fq -- "$expected_text" "$temporary_directory/expected-failure.log" ||
    fail "$label did not return the required failure"
  printf 'Result: %s\n' "$label"
}

catalog_fingerprint() {
  "${PSQL[@]}" --file="$ASSERTION_DIR/state_fingerprint.sql" |
    tr -d '[:space:]'
}

assert_unchanged() {
  local label="$1"
  local before="$2"
  local after="$3"
  [[ "$before" == "$after" ]] || fail "$label changed catalog or synthetic row state"
}

reset_state() {
  run_file "$FIXTURE_DIR/phase2_reset.sql"
}

setup_state() {
  local fixture="$1"
  reset_state
  run_file "$FIXTURE_DIR/$fixture"
}

assert_cleanup() {
  local cleanup_count
  reset_state
  cleanup_count="$(
    "${PSQL[@]}" --command="
      select
        (select count(*) from pg_namespace where nspname in ('auth', 'phase2_test')) +
        (select count(*) from pg_roles where rolname in ('anon', 'authenticated', 'service_role')) +
        (
          select count(*)
          from pg_class as relation
          join pg_namespace as namespace on namespace.oid = relation.relnamespace
          where namespace.nspname = 'public'
            and relation.relkind in ('r', 'p', 'v', 'm')
        );
    " | tr -d '[:space:]'
  )" || fail 'cleanup catalog query failed'
  [[ "$cleanup_count" == '0' ]] || fail 'cleanup left synthetic schemas, roles, or relations'
  printf '%s\n' 'Result: cleanup passed'
}

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
  "${PSQL[@]}" --command='show server_version;' | tr -d '[:space:]'
)" || fail 'could not read the local PostgreSQL version'

printf 'Database classification: %s\n' "$database_classification"
printf 'Database version: %s\n' "$database_version"

server_major="${database_version%%.*}"
[[ "$server_major" =~ ^[0-9]+$ ]] || fail 'could not classify PostgreSQL version'
(( server_major >= 15 )) || fail 'PostgreSQL 15 or newer is required'

safe_phase 'supported-old-forward-and-compensation'
setup_state 'supported_old_start.sql'
run_file "$ASSERTION_DIR/migration_preflight_assertions.sql" --set=expected_state=old
run_file "$FORWARD_MIGRATION"
run_file "$ASSERTION_DIR/migration_postflight_assertions.sql"
run_file "$COMPENSATING_MIGRATION"
run_file "$ASSERTION_DIR/compensation_postflight_assertions.sql"
printf '%s\n' 'Result: supported old state passed'

safe_phase 'supported-hybrid-forward-and-compensation'
setup_state 'supported_hybrid_start.sql'
run_file "$ASSERTION_DIR/migration_preflight_assertions.sql" --set=expected_state=hybrid
run_file "$FORWARD_MIGRATION"
run_file "$ASSERTION_DIR/migration_postflight_assertions.sql"
run_file "$COMPENSATING_MIGRATION"
run_file "$ASSERTION_DIR/compensation_postflight_assertions.sql"
printf '%s\n' 'Result: supported hybrid state passed'

safe_phase 'already-repaired-rejection'
setup_state 'supported_hybrid_start.sql'
run_file "$FORWARD_MIGRATION"
run_file "$ASSERTION_DIR/migration_postflight_assertions.sql"
before_fingerprint="$(catalog_fingerprint)"
expect_file_failure \
  'already-repaired state rejected without mutation' \
  'profile RLS repair is already applied' \
  "$FORWARD_MIGRATION"
after_fingerprint="$(catalog_fingerprint)"
assert_unchanged 'already-repaired rejection' "$before_fingerprint" "$after_fingerprint"

safe_phase 'unknown-drift-rejection'
setup_state 'unsupported_drift_start.sql'
run_file "$ASSERTION_DIR/migration_preflight_assertions.sql" --set=expected_state=drift
before_fingerprint="$(catalog_fingerprint)"
expect_file_failure \
  'unknown drift rejected before mutation' \
  'unknown user_roles policy drift' \
  "$FORWARD_MIGRATION"
after_fingerprint="$(catalog_fingerprint)"
assert_unchanged 'unknown-drift rejection' "$before_fingerprint" "$after_fingerprint"

safe_phase 'unsupported-compensation-rejection'
setup_state 'supported_hybrid_start.sql'
before_fingerprint="$(catalog_fingerprint)"
expect_file_failure \
  'unsupported compensation state rejected before mutation' \
  'unknown repaired-state drift' \
  "$COMPENSATING_MIGRATION"
after_fingerprint="$(catalog_fingerprint)"
assert_unchanged 'unsupported compensation rejection' "$before_fingerprint" "$after_fingerprint"

safe_phase 'concurrent-lock-rejection'
setup_state 'supported_hybrid_start.sql'
before_fingerprint="$(catalog_fingerprint)"
"${PSQL[@]}" --command="
  begin;
  select pg_advisory_xact_lock(
    pg_catalog.hashtextextended('couplebinder:profile-rls-repair:20260727', 0)
  );
  select pg_sleep(2);
  commit;
" >"$temporary_directory/lock-holder.log" 2>&1 &
lock_holder_pid=$!

lock_seen='false'
for _ in {1..20}; do
  held_locks="$(
    "${PSQL[@]}" --command="
      select count(*)
      from pg_locks
      where locktype = 'advisory'
        and granted;
    " | tr -d '[:space:]'
  )" || fail 'could not inspect the synthetic advisory lock'
  if (( held_locks > 0 )); then
    lock_seen='true'
    break
  fi
  sleep 0.1
done
[[ "$lock_seen" == 'true' ]] || fail 'the bounded synthetic lock holder did not acquire its lock'

expect_file_failure \
  'overlapping repair rejected by advisory lock' \
  'profile RLS repair is already running' \
  "$FORWARD_MIGRATION"
after_fingerprint="$(catalog_fingerprint)"
assert_unchanged 'concurrent-lock rejection' "$before_fingerprint" "$after_fingerprint"
wait "$lock_holder_pid" || fail 'synthetic lock holder failed'
lock_holder_pid=''

safe_phase 'transaction-rollback'
setup_state 'supported_hybrid_start.sql'
before_fingerprint="$(catalog_fingerprint)"
expect_file_failure \
  'intentional post-mutation failure rolled back' \
  'intentional Phase 2 rollback assertion' \
  "$ASSERTION_DIR/failure_rollback.sql"
after_fingerprint="$(catalog_fingerprint)"
assert_unchanged 'failure rollback' "$before_fingerprint" "$after_fingerprint"

safe_phase 'cleanup'
assert_cleanup

printf '%s\n' 'PHASE 2 PASS: forward migration, compensation, drift rejection, locking, rollback, and cleanup passed'
