# Profile RLS Repair and Recovery Runbook

## 1. Scope and authority

This runbook governs the CoupleBinder profile RLS repair bundle. It does not
authorize staging or production access. Phase 6 requires a separate owner
authorization naming the target, operator, reviewer, backup owner, restore
owner, observation owner, and compensation decision owner.

Repository publication is not execution authorization.

## 2. Controlled artifacts

Forward repair:

- ID: `couplebinder.profile_rls_repair.20260727`
- Path: `db/migrations/20260727_repair_profile_rls_authorization.sql`
- SHA-256:
  `af995929f43b0a68e05ab012b46e5133f154921cfcd2d3a5dcc7cf1a0a8c6dcd`

Fail-closed compensation:

- ID: `couplebinder.profile_rls_compensation.20260727`
- Path: `db/migrations/20260727_compensate_profile_rls_authorization.sql`
- SHA-256:
  `12f48b04b78fcb37f4a6e965586b6e512dbde87f137b33439dfb31250d741452`

The compensation is an emergency safety artifact. It is not the next migration
and must never be selected automatically.

## 3. Unsafe migration prohibition

`db/migrations/20260726_harden_profiles_view.sql` is superseded and blocked.
Its expected Git blob is:

`c284e4f00244ba3e007298fd47804877bad56373`

It retains the `user_roles` dependency and does not remove the recursive
policy. Never execute it as a prerequisite, repair, retry, compensation, or
rollback.

## 4. Preconditions

Before any target connection:

1. Verify the local manifest and controlled artifact hashes.
2. Freeze the repository commit and application image identity.
3. Confirm Phase 4 profile behavior is present.
4. Name the operator, independent reviewer, approval owner, restore owner,
   observation owner, and compensation decision owner.
5. Establish a protected evidence location outside Git.
6. Confirm no unrelated migration or application release is included.
7. Obtain a separate Phase 6 authorization.

Stop when any identity, hash, role, or authority is missing.

## 5. Dedicated staging

Use a dedicated nonproduction Supabase-compatible project with synthetic data
only. It must not share production credentials, user records, storage, Redis,
or provider configuration. A disposable local PostgreSQL test is supporting
evidence, not the release-quality staging gate.

## 6. Read-only catalog evidence

Before planning execution, capture sanitized evidence for:

- PostgreSQL version and safe target classification;
- relation types, ownership assumptions, RLS, and FORCE RLS state;
- policy names, commands, roles, mode, and expression hashes;
- view owner, columns, options, definition hash, and dependencies;
- helper signature, owner, security mode, search path, ACL, and dependencies;
- relevant relation, view, and function grants;
- active locks touching affected objects;
- application commit and maintenance/access-isolation state.

Store only fixed categories and hashes in the execution record. Do not commit
raw catalog output or provider responses.

## 7. Supported starting catalogs

The forward artifact supports only:

- `supported_old`;
- `supported_hybrid`.

The Phase 2 laboratory defines these exact synthetic contracts. A target that
already matches the repaired catalog is not a repeat-apply candidate.

## 8. Unknown drift stop

If catalog evidence cannot be classified exactly, stop before mutation. Do not
rename the state, weaken preflight, bypass a hash, or improvise SQL. Preserve
sanitized evidence for review and return to maintenance.

## 9. Backup and restore ownership

Staging requires a verified backup or a documented disposable-project reset.
Production requires:

- a completed backup reference;
- proof that the reference belongs to the intended target;
- a named restore owner;
- an understood restore procedure;
- an RPO/RTO assessment;
- a restore decision boundary.

Before paid launch, the initial targets are RPO 24 hours and RTO 4 hours. Paid
production targets RPO 1 hour and RTO 4 hours. Phase 6 must record actual
provider capability and restore rehearsal evidence.

## 10. Maintenance and access isolation

Staging must be access-isolated or under its maintenance equivalent.
Production maintenance must be confirmed through both the active Redis state
and the configured fallback before catalog work. Keep maintenance enabled
through execution, postflight, application smoke tests, and the minimum
60-minute production observation window.

Do not remove maintenance because SQL committed successfully.

## 11. Independent reviewer

The reviewer must compare:

- repository commit;
- manifest hash;
- forward and compensation hashes;
- target classification;
- backup reference and restore owner;
- generated dry plan;
- postflight and smoke evidence.

The operator and reviewer must not silently collapse into an unidentified
shared role.

## 12. Forward execution boundary

Only a separately authorized Phase 6 operation may translate the dry plan into
an execution command. Use the exact forward artifact. Do not paste an edited
copy, concatenate historical SQL, or run the compensation after the forward by
default.

No tracked command contains a provider address or credential. The named
operator supplies protected connection configuration outside Git.

## 13. Transaction and advisory lock

The forward migration is expected to:

- run inside one transaction;
- set bounded lock, statement, and idle-transaction timeouts;
- take the repair-family transaction advisory lock;
- classify the supported state before mutation;
- roll back completely on a failed assertion.

A lock timeout is a stop condition, not permission to remove the lock.

## 14. Database postflight

Verify and record:

- recursive policies are absent;
- affected policies do not self-reference;
- own-profile policies remain;
- public profile discovery is absent;
- the private view is security-invoker and security-barrier;
- the view has no `user_roles` or helper dependency;
- `_auth_last_signins` and its execute grants are absent;
- ordinary authenticated users cannot read `user_roles`;
- RLS remains enabled;
- catalog fingerprints match the approved repaired state.

## 15. Application smoke tests

Through the normal staging edge, then the controlled production edge:

- anonymous home and maintenance behavior;
- login, token refresh, logout, and cross-tab logout;
- Dashboard, Profile Edit, Billing, and Binder navigation;
- CSRF on profile writes;
- ordinary and administrator route authorization;
- health endpoints;
- no-store behavior for unavailable profile responses.

Do not place customer values in the execution record.

## 16. Profile result checks

Verify all three Phase 4 outcomes:

- `ok`: exactly one authoritative profile with valid privacy;
- `not_found`: a successful zero-row response and genuine onboarding state;
- `unavailable`: provider, permission, timeout, malformed, or policy failure.

Unavailable must never render an editable form or become onboarding.

## 17. Recursive-policy observation

Confirm that no new privacy-safe `recursive_policy` event occurs after repair.
Do not store SQLSTATE bodies or raw database errors in the tracked record.

Any observed recurrence is a stop condition.

## 18. Public discovery absence

Anonymous callers must not select the private profile view or receive private
profile fields. `profiles_public_read` must remain absent. A future public
discovery feature requires a separate limited-column design and approval.

## 19. Cross-user denial

An ordinary authenticated browser context must return no other user's private
profile. An admin-shaped browser claim must not broaden direct database access;
cross-user administration remains server-mediated.

## 20. user_roles denial

Ordinary authenticated and anonymous callers must not directly select
`public.user_roles`. The table remains secondary server-controlled audit or
synchronization data, not product-role authority.

## 21. Helper absence

Confirm `_auth_last_signins()` is absent, its execution grants are absent, and
the private view does not depend on an equivalent helper.

## 22. Signed role regression

Verify that administrator decisions still come from the centralized,
request-local signed-role authority. Profile fields, database role rows,
`user_metadata`, and browser inputs must not grant administrator authority.

## 23. Profile Edit smoke

For an authoritative own profile:

1. Load the complete form.
2. Confirm supported privacy is explicit.
3. Submit one reversible, non-sensitive test change in staging only.
4. Confirm ownership and CSRF checks.
5. Confirm the stored value and page model agree.

For unavailable data, require HTTP 503, no form, and no write. Production write
testing requires separate owner approval and a designated test account.

## 24. Observation period

Hold production maintenance for at least 60 minutes after postflight and smoke
tests. Observe aggregate categories for profile availability, PostgreSQL
errors, authorization denials, health, and latency. Then use a limited
non-paying cohort for at least 24 hours before commercial hardening proceeds.

## 25. Compensation decision

Application smoke failure does not automatically authorize compensation. The
named owner must classify the failure, confirm the catalog is the supported
repaired state, review backup evidence, and explicitly approve compensation.

Restore is a separate owner decision for data-integrity or recovery conditions.

## 26. Fail-closed compensation

Compensation removes the private profile view and leaves profile enrichment
unavailable. It must preserve:

- recursive policies absent;
- public discovery absent;
- helper absent;
- browser role-table access absent;
- RLS enabled.

The application should continue returning controlled unavailable responses.

## 27. Emergency stop conditions

Stop and keep maintenance enabled for:

- unknown catalog drift;
- any hash mismatch;
- missing backup, reviewer, or owner;
- advisory-lock or timeout failure;
- partial or unexpected catalog state;
- cross-user access;
- public profile exposure;
- remaining helper or role dependency;
- recurring `recursive_policy`;
- application authorization or Profile Edit regression.

## 28. Evidence retention

Keep the tracked execution record free of secrets and personal data. Store
protected catalog evidence, backup confirmations, operator approvals, and
provider receipts outside Git with access control and an owner-defined
retention period. Refer to them by opaque safe identifiers only.

## 29. Maintenance removal gate

Maintenance removal requires:

- accepted Phase 0 through Phase 6 evidence;
- supported preflight and successful postflight;
- verified backup and rehearsed compensation;
- passing real-context access matrix;
- no recursive-policy event during observation;
- passing authentication, role, profile, billing, and health smoke checks;
- owner and rollback-operator approval.

This gate permits only a controlled non-paying cohort.

## 30. Production go/no-go

The project owner makes the final decision after the operator and reviewer sign
the execution record. `go` means apply the exact forward artifact under
maintenance. `no-go` means stop without mutation. After execution the owner
chooses hold, observe, compensate, or restore from the evidence.

## 31. Deferred ACL work

Phase 5 and the incident repair address only grants required by the profile RLS
incident. Repository-wide relation and function ACL hardening remains Phase 7.
Do not bundle broad revokes or grants into this repair.

## 32. Phase 6 authorization

Phase 6 is a new, target-specific authorization:

- Phase 6A: sanitized read-only staging catalog evidence;
- Phase 6B: staging repair and compensation rehearsal;
- Phase 6C: separately approved production repair and observation.

Do not infer Phase 6 authority from this runbook, manifest verification, a dry
plan, a committed migration, or an earlier production deployment.
