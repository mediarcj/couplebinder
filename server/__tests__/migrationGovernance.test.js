// Description: Tests the local profile RLS repair manifest and verifier.
// Purpose: Prove hashes, roles, inventory, traversal, and symlink checks fail closed.
// Security: Tests are network-free and never execute or inspect SQL contents.

import {
  describe,
  expect,
  it
} from 'vitest';

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DEFAULT_MANIFEST_PATH,
  GovernanceError,
  REPO_ROOT,
  readManifest,
  resolveSafeRegularFile,
  verifyBundle
} = require('../scripts/migrations/verify-profile-rls-bundle');
function cloneManifest() {
  return JSON.parse(
    JSON.stringify(readManifest(DEFAULT_MANIFEST_PATH).manifest)
  );
}

function expectCode(action, code) {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(GovernanceError);
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected governance error: ${code}`);
}

function findArtifact(manifest, role) {
  return manifest.artifacts.find((artifact) => artifact.role === role);
}

describe('profile RLS migration governance', () => {
  it('verifies the current controlled bundle and complete SQL inventory', () => {
    const result = verifyBundle();

    expect(result).toMatchObject({
      status: 'verified',
      bundleId: 'couplebinder.profile-rls-repair.20260727'
    });
    expect(result.artifacts.map((artifact) => artifact.role)).toEqual([
      'forward',
      'compensation',
      'blocked'
    ]);
  });

  it('rejects a changed forward migration hash', () => {
    const manifest = cloneManifest();
    findArtifact(manifest, 'forward').sha256 = '0'.repeat(64);

    expectCode(
      () => verifyBundle({ repoRoot: REPO_ROOT, manifest }),
      'hash_mismatch'
    );
  });

  it('rejects a changed compensation hash', () => {
    const manifest = cloneManifest();
    findArtifact(manifest, 'compensation').sha256 = 'f'.repeat(64);

    expectCode(
      () => verifyBundle({ repoRoot: REPO_ROOT, manifest }),
      'hash_mismatch'
    );
  });

  it('rejects an executable role for the unsafe migration', () => {
    const manifest = cloneManifest();
    findArtifact(manifest, 'blocked').executable = true;

    expectCode(
      () => verifyBundle({ repoRoot: REPO_ROOT, manifest }),
      'blocked_artifact_unsafe'
    );
  });

  it('rejects a removed blocked declaration', () => {
    const manifest = cloneManifest();
    delete findArtifact(manifest, 'blocked').neverExecute;

    expectCode(
      () => verifyBundle({ repoRoot: REPO_ROOT, manifest }),
      'blocked_artifact_unsafe'
    );
  });

  it('rejects duplicate artifact identities', () => {
    const manifest = cloneManifest();
    manifest.artifacts[1].id = manifest.artifacts[0].id;

    expectCode(
      () => verifyBundle({ repoRoot: REPO_ROOT, manifest }),
      'duplicate_identity'
    );
  });

  it('rejects duplicate artifact paths', () => {
    const manifest = cloneManifest();
    manifest.artifacts[1].path = manifest.artifacts[0].path;

    expectCode(
      () => verifyBundle({ repoRoot: REPO_ROOT, manifest }),
      'duplicate_path'
    );
  });

  it('rejects a missing artifact', () => {
    const manifest = cloneManifest();
    findArtifact(manifest, 'forward').path =
      'db/migrations/missing-profile-repair.sql';

    expectCode(
      () => verifyBundle({ repoRoot: REPO_ROOT, manifest }),
      'missing_artifact'
    );
  });

  it('rejects traversal outside the repository', () => {
    const manifest = cloneManifest();
    findArtifact(manifest, 'forward').path = '../outside.sql';

    expectCode(
      () => verifyBundle({ repoRoot: REPO_ROOT, manifest }),
      'unsafe_path'
    );
  });

  it('rejects a symlink path', () => {
    const temporaryRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'couplebinder-governance-')
    );
    const outside = path.join(os.tmpdir(), 'couplebinder-outside.sql');
    fs.writeFileSync(outside, '-- synthetic test only\n', 'utf8');
    fs.symlinkSync(outside, path.join(temporaryRoot, 'linked.sql'));

    expectCode(
      () => resolveSafeRegularFile(
        temporaryRoot,
        'linked.sql',
        'synthetic artifact'
      ),
      'symlink_rejected'
    );

    fs.unlinkSync(path.join(temporaryRoot, 'linked.sql'));
    fs.rmdirSync(temporaryRoot);
    fs.unlinkSync(outside);
  });

  it('rejects an unknown artifact role', () => {
    const manifest = cloneManifest();
    findArtifact(manifest, 'forward').role = 'automatic';

    expectCode(
      () => verifyBundle({ repoRoot: REPO_ROOT, manifest }),
      'unknown_role'
    );
  });

  it('rejects an unclassified SQL path', () => {
    const manifest = cloneManifest();
    manifest.repositorySqlInventory.pop();

    expectCode(
      () => verifyBundle({ repoRoot: REPO_ROOT, manifest }),
      'inventory_drift'
    );
  });

  it('keeps templates synthetic and aligned with the strict schema', () => {
    const schemaPath = path.join(
      REPO_ROOT,
      'ops/migrations/schemas/execution-record.schema.json'
    );
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const allowed = new Set(Object.keys(schema.properties));

    for (const name of [
      'staging-execution-record.json',
      'production-execution-record.json'
    ]) {
      const template = JSON.parse(fs.readFileSync(path.join(
        REPO_ROOT,
        'ops/migrations/templates',
        name
      ), 'utf8'));
      expect(schema.required.every((key) => key in template)).toBe(true);
      expect(Object.keys(template).every((key) => allowed.has(key))).toBe(true);
      expect(JSON.stringify(template)).not.toMatch(
        /:\/\/|@|password|secret|token|cookie/i
      );
    }
  });

  it('uses only local built-ins and never exposes an execution primitive', () => {
    const scriptPaths = [
      'server/scripts/migrations/verify-profile-rls-bundle.js',
      'server/scripts/migrations/build-profile-rls-plan.js'
    ];

    for (const relativePath of scriptPaths) {
      const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
      const importedModules = [
        ...source.matchAll(/require\(['"]([^'"]+)['"]\)/g)
      ].map((match) => match[1]);

      expect(importedModules.every((name) => (
        ['crypto', 'fs', 'path'].includes(name)
        || name.startsWith('./')
      ))).toBe(true);
      expect(source).not.toMatch(
        /child_process|\bfetch\s*\(|https?\.request|\bnet\.|\bdns\.|@supabase|\bpg\b/
      );
      expect(source).not.toMatch(
        /execFile|execSync|spawnSync|\bspawn\s*\(|\bexec\s*\(/
      );
    }
  });
});
