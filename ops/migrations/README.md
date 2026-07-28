# CoupleBinder Migration Governance

This directory governs the profile RLS incident repair bundle. It does not
execute SQL, connect to a database, or authorize staging or production work.

## Controlled bundle

The manifest controls exactly three artifacts:

- one forward repair, eligible only under separately authorized Phase 6 work;
- one fail-closed compensation, eligible only after an explicit owner decision;
- one superseded migration that is mechanically blocked and must never run.

The repository's `db/` directory is not an ordered execution stream. It mixes
historical migrations, an exported baseline, patches, manual operations,
recipes, schema references, a prohibited data export, and incident artifacts.
The manifest inventory classifies these paths without treating them as a
release queue.

## Local verification

Run the network-free verifier from the repository root:

```sh
node server/scripts/migrations/verify-profile-rls-bundle.js
```

Successful verification checks local paths, SHA-256 values, the blocked
artifact's Git blob identity, artifact roles, and complete classification of
tracked SQL paths. It prints no SQL contents.

## Dry planning

The plan generator accepts a sanitized local JSON evidence file:

```sh
node server/scripts/migrations/build-profile-rls-plan.js \
  --target staging \
  --evidence <sanitized-local-evidence.json>
```

Valid targets are `staging`, `production`, and `compensation`. Output is a
non-executing JSON plan containing fixed step categories. The generator never
spawns a SQL client and never performs network access.

Production planning requires a successful, recent, hash-matching staging
execution record. Compensation planning requires a recorded successful forward
operation and a separate explicit owner decision. Neither plan is permission to
execute.

## Evidence safety

Tracked manifests, templates, plans, and records must not include:

- credentials, tokens, cookies, connection strings, or provider URLs;
- customer records, user identifiers, emails, or production project IDs;
- raw catalog dumps, SQL result bodies, or free-form provider errors.

Use opaque evidence references and fixed result categories. Store protected
evidence outside Git according to the runbook.

## Phase boundary

Phase 5 provides governance only. Phase 6 must separately authorize any
staging or production connection, catalog query, backup operation, migration
execution, compensation, deployment, or maintenance change.
