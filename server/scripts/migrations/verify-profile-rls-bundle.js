#!/usr/bin/env node
'use strict';

// Purpose: Verify the local profile RLS repair bundle and SQL inventory.
// Scope: Network-free Phase 5 governance; this script never executes SQL.
// Security: Paths, hashes, artifact roles, symlinks, and the blocked migration
// are checked before a dry plan may be created.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_MANIFEST_PATH = path.join(
  REPO_ROOT,
  'ops',
  'migrations',
  'profile-rls-repair.manifest.json'
);

const ALLOWED_ROLES = new Set([
  'forward',
  'compensation',
  'blocked'
]);

const ALLOWED_CLASSIFICATIONS = new Set([
  'approved-repair',
  'emergency-compensation',
  'historical-baseline',
  'historical-migration',
  'manual-one-time-operation',
  'patch-separate-review',
  'prohibited-data-export',
  'recipe-reference',
  'schema-reference',
  'superseded-blocked'
]);

const ALLOWED_EXECUTION_POLICIES = new Set([
  'never-execute',
  'never-execute-for-repair',
  'not-in-this-bundle',
  'owner-authorized-compensation-only',
  'phase6-forward-only',
  'separate-review'
]);

class GovernanceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GovernanceError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new GovernanceError(code, message);
}

function isPlainObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value);
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) {
    fail('invalid_manifest', `${label} must be an object`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail('invalid_manifest', `${label} must be a non-empty string`);
  }
}

function requireBoolean(value, label) {
  if (typeof value !== 'boolean') {
    fail('invalid_manifest', `${label} must be a boolean`);
  }
}

function requireSha256(value, label) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail('invalid_manifest', `${label} must be a lowercase SHA-256`);
  }
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function gitBlobSha1(buffer) {
  const prefix = Buffer.from(`blob ${buffer.length}\0`, 'utf8');
  return crypto
    .createHash('sha1')
    .update(prefix)
    .update(buffer)
    .digest('hex');
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== ''
    && !relative.startsWith(`..${path.sep}`)
    && relative !== '..'
    && !path.isAbsolute(relative);
}

function validateRelativePath(relativePath, label) {
  requireNonEmptyString(relativePath, label);
  if (
    path.isAbsolute(relativePath)
    || relativePath.includes('\\')
    || path.posix.normalize(relativePath) !== relativePath
    || relativePath === '.'
    || relativePath.startsWith('../')
    || relativePath.includes('/../')
  ) {
    fail('unsafe_path', `${label} must stay inside the repository`);
  }
}

function resolveSafeRegularFile(repoRoot, relativePath, label = 'artifact path') {
  validateRelativePath(relativePath, label);

  const root = path.resolve(repoRoot);
  const candidate = path.resolve(root, relativePath);
  if (!isInside(root, candidate)) {
    fail('unsafe_path', `${label} escapes the repository`);
  }

  let current = root;
  for (const segment of relativePath.split('/')) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) {
      fail('missing_artifact', `${label} does not exist: ${relativePath}`);
    }
    if (fs.lstatSync(current).isSymbolicLink()) {
      fail('symlink_rejected', `${label} contains a symbolic link`);
    }
  }

  if (!fs.statSync(candidate).isFile()) {
    fail('invalid_artifact', `${label} is not a regular file`);
  }

  const realRoot = fs.realpathSync(root);
  const realCandidate = fs.realpathSync(candidate);
  if (!isInside(realRoot, realCandidate)) {
    fail('unsafe_path', `${label} resolves outside the repository`);
  }

  return candidate;
}

function walkSqlFiles(repoRoot) {
  const dbRoot = path.join(repoRoot, 'db');
  const output = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        fail('symlink_rejected', 'SQL inventory contains a symbolic link');
      }
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile() && entry.name.endsWith('.sql')) {
        output.push(path.relative(repoRoot, absolute).split(path.sep).join('/'));
      }
    }
  }

  visit(dbRoot);
  return output.sort();
}

function readManifest(manifestPath = DEFAULT_MANIFEST_PATH) {
  let buffer;
  try {
    buffer = fs.readFileSync(manifestPath);
  } catch {
    fail('manifest_unreadable', 'manifest could not be read');
  }

  let manifest;
  try {
    manifest = JSON.parse(buffer.toString('utf8'));
  } catch {
    fail('manifest_invalid_json', 'manifest is not valid JSON');
  }

  return {
    manifest,
    manifestSha256: sha256Buffer(buffer)
  };
}

function validateTopLevel(manifest) {
  requirePlainObject(manifest, 'manifest');
  if (manifest.schemaVersion !== '1.0.0') {
    fail('invalid_manifest', 'unsupported manifest schema version');
  }
  requireNonEmptyString(manifest.bundleId, 'bundleId');
  requirePlainObject(manifest.requiredApplication, 'requiredApplication');
  if (
    !/^[a-f0-9]{40}$/.test(
      manifest.requiredApplication.minimumReviewedCommit || ''
    )
  ) {
    fail('invalid_manifest', 'minimum reviewed application commit is invalid');
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 3) {
    fail('invalid_manifest', 'manifest must contain exactly three artifacts');
  }
  if (
    !Array.isArray(manifest.supportedStartingCatalogs)
    || manifest.supportedStartingCatalogs.length !== 2
    || !manifest.supportedStartingCatalogs.includes('supported_old')
    || !manifest.supportedStartingCatalogs.includes('supported_hybrid')
  ) {
    fail('invalid_manifest', 'supported catalog classifications are incomplete');
  }
  for (const field of [
    'preflightChecks',
    'postflightChecks',
    'requiredStagingEvidence',
    'requiredProductionEvidence'
  ]) {
    if (!Array.isArray(manifest[field]) || manifest[field].length === 0) {
      fail('invalid_manifest', `${field} must be a non-empty array`);
    }
  }
  requirePlainObject(manifest.observation, 'observation');
  if (
    !Number.isInteger(manifest.observation.maintenanceMinutes)
    || manifest.observation.maintenanceMinutes < 60
    || !Number.isInteger(manifest.observation.limitedNonPayingCohortHours)
    || manifest.observation.limitedNonPayingCohortHours < 24
    || manifest.observation.recursivePolicyEventsAllowed !== 0
  ) {
    fail('invalid_manifest', 'observation requirements are unsafe');
  }
  requirePlainObject(manifest.securityInvariants, 'securityInvariants');
  if (
    manifest.securityInvariants.publicDiscoveryEnabled !== false
    || manifest.securityInvariants.browserCrossUserAdministrationEnabled !== false
    || manifest.securityInvariants.userRolesIsProductAuthority !== false
    || manifest.securityInvariants.compensationIsFailClosed !== true
    || manifest.securityInvariants.broadAclRepairDeferred !== true
  ) {
    fail('invalid_manifest', 'security invariants do not fail closed');
  }
}

function validateArtifacts(manifest, repoRoot) {
  const ids = new Set();
  const paths = new Set();
  const byRole = new Map();
  const verified = [];

  for (const artifact of manifest.artifacts) {
    requirePlainObject(artifact, 'artifact');
    requireNonEmptyString(artifact.id, 'artifact.id');
    requireNonEmptyString(artifact.role, 'artifact.role');
    if (!ALLOWED_ROLES.has(artifact.role)) {
      fail('unknown_role', `unrecognized artifact role: ${artifact.role}`);
    }
    if (ids.has(artifact.id)) {
      fail('duplicate_identity', 'artifact identities must be unique');
    }
    if (paths.has(artifact.path)) {
      fail('duplicate_path', 'artifact paths must be unique');
    }
    if (byRole.has(artifact.role)) {
      fail('duplicate_role', 'artifact roles must be unique');
    }
    ids.add(artifact.id);
    paths.add(artifact.path);
    byRole.set(artifact.role, artifact);

    requireBoolean(artifact.executable, `${artifact.id}.executable`);
    requireSha256(artifact.sha256, `${artifact.id}.sha256`);
    const absolute = resolveSafeRegularFile(
      repoRoot,
      artifact.path,
      `${artifact.id}.path`
    );
    const buffer = fs.readFileSync(absolute);
    const actualSha256 = sha256Buffer(buffer);
    if (actualSha256 !== artifact.sha256) {
      fail('hash_mismatch', `artifact hash mismatch: ${artifact.path}`);
    }

    verified.push({
      id: artifact.id,
      role: artifact.role,
      path: artifact.path,
      sha256: actualSha256
    });

    if (artifact.role === 'blocked') {
      if (
        artifact.executable !== false
        || artifact.blocked !== true
        || artifact.neverExecute !== true
      ) {
        fail('blocked_artifact_unsafe', 'blocked artifact is not fail closed');
      }
      if (!/^[a-f0-9]{40}$/.test(artifact.gitObject || '')) {
        fail('invalid_manifest', 'blocked artifact Git object is invalid');
      }
      if (gitBlobSha1(buffer) !== artifact.gitObject) {
        fail('git_object_mismatch', 'blocked artifact Git object mismatch');
      }
    }
  }

  for (const role of ALLOWED_ROLES) {
    if (!byRole.has(role)) {
      fail('missing_role', `required artifact role is missing: ${role}`);
    }
  }

  const forward = byRole.get('forward');
  if (
    forward.executable !== true
    || forward.requiresSeparatePhase6Authorization !== true
  ) {
    fail('forward_role_invalid', 'forward artifact execution boundary is invalid');
  }

  const compensation = byRole.get('compensation');
  if (
    compensation.executable !== false
    || compensation.compensationOnly !== true
    || compensation.failClosed !== true
    || compensation.requiresExplicitOwnerDecision !== true
    || compensation.requiresSeparatePhase6Authorization !== true
  ) {
    fail(
      'compensation_role_invalid',
      'compensation must remain owner-authorized and fail closed'
    );
  }

  return {
    byRole,
    verified
  };
}

function validateInventory(manifest, repoRoot, artifactPaths) {
  if (!Array.isArray(manifest.repositorySqlInventory)) {
    fail('invalid_inventory', 'repository SQL inventory must be an array');
  }

  const seen = new Set();
  for (const item of manifest.repositorySqlInventory) {
    requirePlainObject(item, 'inventory item');
    validateRelativePath(item.path, 'inventory path');
    if (!item.path.startsWith('db/') || !item.path.endsWith('.sql')) {
      fail('invalid_inventory', 'inventory contains a non-database SQL path');
    }
    if (seen.has(item.path)) {
      fail('duplicate_inventory_path', 'inventory paths must be unique');
    }
    seen.add(item.path);
    if (!ALLOWED_CLASSIFICATIONS.has(item.classification)) {
      fail('unknown_classification', 'inventory classification is unknown');
    }
    if (!ALLOWED_EXECUTION_POLICIES.has(item.executionPolicy)) {
      fail('unknown_execution_policy', 'inventory execution policy is unknown');
    }
  }

  const actual = walkSqlFiles(repoRoot);
  const inventory = [...seen].sort();
  if (
    actual.length !== inventory.length
    || actual.some((file, index) => file !== inventory[index])
  ) {
    fail('inventory_drift', 'SQL inventory does not match repository paths');
  }

  const policyByPath = new Map(
    manifest.repositorySqlInventory.map((item) => [
      item.path,
      item.executionPolicy
    ])
  );
  if (
    policyByPath.get(artifactPaths.forward) !== 'phase6-forward-only'
    || policyByPath.get(artifactPaths.compensation)
      !== 'owner-authorized-compensation-only'
    || policyByPath.get(artifactPaths.blocked) !== 'never-execute'
  ) {
    fail('inventory_role_mismatch', 'controlled artifact inventory roles differ');
  }
}

function verifyBundle(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || REPO_ROOT);
  let manifest;
  let manifestSha256;

  if (options.manifest) {
    manifest = options.manifest;
    manifestSha256 = sha256Buffer(
      Buffer.from(JSON.stringify(manifest), 'utf8')
    );
  } else {
    const loaded = readManifest(options.manifestPath || DEFAULT_MANIFEST_PATH);
    manifest = loaded.manifest;
    manifestSha256 = loaded.manifestSha256;
  }

  validateTopLevel(manifest);
  const artifactResult = validateArtifacts(manifest, repoRoot);
  validateInventory(
    manifest,
    repoRoot,
    Object.fromEntries(
      [...artifactResult.byRole.entries()].map(([role, artifact]) => [
        role,
        artifact.path
      ])
    )
  );

  return Object.freeze({
    status: 'verified',
    bundleId: manifest.bundleId,
    manifest,
    manifestSha256,
    artifacts: Object.freeze(artifactResult.verified)
  });
}

function main() {
  try {
    const result = verifyBundle();
    process.stdout.write(`${JSON.stringify({
      status: result.status,
      bundleId: result.bundleId,
      manifestSha256: result.manifestSha256,
      artifacts: result.artifacts
    }, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof GovernanceError
      ? error.code
      : 'verification_failed';
    process.stderr.write(`BUNDLE_VERIFICATION_FAILED ${code}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  ALLOWED_ROLES,
  DEFAULT_MANIFEST_PATH,
  GovernanceError,
  REPO_ROOT,
  gitBlobSha1,
  readManifest,
  resolveSafeRegularFile,
  sha256Buffer,
  verifyBundle
};
