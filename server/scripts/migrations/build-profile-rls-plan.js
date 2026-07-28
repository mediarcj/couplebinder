#!/usr/bin/env node
'use strict';

// Purpose: Build a local dry plan for staging, production, or compensation.
// Scope: Phase 5 evidence gating only; no SQL, provider, or network execution.
// Security: Plans contain fixed categories and verified artifact identities,
// while secrets, URLs, unknown catalog states, and incomplete evidence fail.

const fs = require('fs');
const path = require('path');
const {
  GovernanceError,
  verifyBundle
} = require('./verify-profile-rls-bundle');

const TARGETS = new Set([
  'staging',
  'production',
  'compensation'
]);

const SUPPORTED_CATALOGS = new Set([
  'supported_old',
  'supported_hybrid'
]);

const COMPENSATION_FAILURE_CATEGORIES = new Set([
  'authorization_regression',
  'catalog_postflight_failure',
  'cross_user_access',
  'helper_dependency_remaining',
  'profile_feature_unavailable',
  'public_profile_exposure',
  'recursive_policy_detected'
]);

const FORBIDDEN_KEY = /(password|secret|token|cookie|authorization|connection.?string|database.?url|provider.?url)/i;
const FORBIDDEN_VALUE = /:\/\/|-----BEGIN|bearer\s+[a-z0-9._-]+|@[a-z0-9.-]+\.[a-z]{2,}/i;
const ACTOR_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,63}$/;
const REFERENCE_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{3,127}$/;

function fail(code, message) {
  throw new GovernanceError(code, message);
}

function isObject(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) {
    fail('invalid_evidence', `${label} must be an object`);
  }
}

function requireSafeActor(value, label) {
  if (typeof value !== 'string' || !ACTOR_PATTERN.test(value)) {
    fail('invalid_evidence', `${label} must be a safe actor category`);
  }
}

function requireSafeReference(value, label) {
  if (typeof value !== 'string' || !REFERENCE_PATTERN.test(value)) {
    fail('invalid_evidence', `${label} must be an opaque safe reference`);
  }
}

function requireExact(value, expected, code, label) {
  if (value !== expected) {
    fail(code, `${label} does not match the verified bundle`);
  }
}

function rejectSensitiveEvidence(value, keyPath = 'evidence') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      rejectSensitiveEvidence(item, `${keyPath}[${index}]`);
    });
    return;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key)) {
        fail('sensitive_evidence', `${keyPath} contains a forbidden field`);
      }
      rejectSensitiveEvidence(child, `${keyPath}.${key}`);
    }
    return;
  }
  if (typeof value === 'string' && FORBIDDEN_VALUE.test(value)) {
    fail('sensitive_evidence', `${keyPath} contains a forbidden value`);
  }
}

function artifactsByRole(verification) {
  return Object.fromEntries(
    verification.artifacts.map((artifact) => [
      artifact.role,
      artifact
    ])
  );
}

function validateCommon(evidence, verification, expectedTarget) {
  requireObject(evidence, 'evidence');
  rejectSensitiveEvidence(evidence);
  requireExact(
    evidence.target,
    expectedTarget,
    'target_mismatch',
    'target'
  );
  requireExact(
    evidence.bundleId,
    verification.bundleId,
    'bundle_mismatch',
    'bundle'
  );
  requireExact(
    evidence.repositoryCommit,
    verification.manifest.requiredApplication.minimumReviewedCommit,
    'application_commit_mismatch',
    'application commit'
  );
  requireExact(
    evidence.manifestSha256,
    verification.manifestSha256,
    'manifest_hash_mismatch',
    'manifest hash'
  );

  const artifacts = artifactsByRole(verification);
  requireExact(
    evidence.forwardSha256,
    artifacts.forward.sha256,
    'forward_hash_mismatch',
    'forward hash'
  );
  requireExact(
    evidence.compensationSha256,
    artifacts.compensation.sha256,
    'compensation_hash_mismatch',
    'compensation hash'
  );

  return artifacts;
}

function validateCatalogEvidence(catalogEvidence, options = {}) {
  requireObject(catalogEvidence, 'catalogEvidence');
  if (catalogEvidence.verified !== true) {
    fail('catalog_unverified', 'catalog evidence is not verified');
  }
  requireSafeReference(catalogEvidence.reference, 'catalogEvidence.reference');
  if (options.repairedOnly) {
    if (catalogEvidence.classification !== 'repaired_target') {
      fail(
        'unsupported_catalog',
        'compensation requires the repaired target catalog'
      );
    }
    return;
  }
  if (!SUPPORTED_CATALOGS.has(catalogEvidence.classification)) {
    fail('unsupported_catalog', 'catalog classification is not supported');
  }
}

function validateBackup(backup, allowedKinds) {
  requireObject(backup, 'backup');
  if (backup.verified !== true || !allowedKinds.has(backup.kind)) {
    fail('backup_unverified', 'required backup evidence is missing');
  }
  requireSafeReference(backup.reference, 'backup.reference');
}

function validateStagingRecord(record, verification, now = new Date()) {
  requireObject(record, 'stagingRecord');
  rejectSensitiveEvidence(record, 'stagingRecord');
  const artifacts = artifactsByRole(verification);

  requireExact(record.schemaVersion, '1.0.0', 'staging_record_invalid', 'record schema');
  requireExact(record.operation, 'forward', 'staging_record_invalid', 'operation');
  requireExact(record.target, 'staging', 'staging_record_invalid', 'staging target');
  requireExact(record.bundleId, verification.bundleId, 'staging_record_mismatch', 'bundle');
  requireExact(
    record.repositoryCommit,
    verification.manifest.requiredApplication.minimumReviewedCommit,
    'staging_record_mismatch',
    'application commit'
  );
  requireExact(
    record.manifestSha256,
    verification.manifestSha256,
    'staging_record_mismatch',
    'manifest hash'
  );
  requireExact(
    record.forwardSha256,
    artifacts.forward.sha256,
    'staging_record_mismatch',
    'forward hash'
  );
  requireExact(
    record.compensationSha256,
    artifacts.compensation.sha256,
    'staging_record_mismatch',
    'compensation hash'
  );
  if (
    record.result !== 'succeeded'
    || record.postflight?.status !== 'passed'
    || record.applicationSmoke?.status !== 'passed'
    || record.recursivePolicyObservation?.status !== 'clear'
    || record.recursivePolicyObservation?.eventCount !== 0
    || record.compensationRehearsal?.status !== 'passed'
    || record.finalDisposition !== 'approved_for_production_planning'
  ) {
    fail('staging_record_failed', 'staging record is not production eligible');
  }
  if (!SUPPORTED_CATALOGS.has(record.startingCatalogClassification)) {
    fail('staging_record_failed', 'staging starting catalog was not supported');
  }
  requireSafeReference(
    record.catalogFingerprintReference,
    'stagingRecord.catalogFingerprintReference'
  );

  const finishedAt = new Date(record.finishedAt);
  const current = now instanceof Date ? now : new Date(now);
  if (
    Number.isNaN(finishedAt.getTime())
    || Number.isNaN(current.getTime())
    || finishedAt > current
    || current.getTime() - finishedAt.getTime() > 7 * 24 * 60 * 60 * 1000
  ) {
    fail('staging_record_stale', 'staging record is stale or has an invalid time');
  }
}

function buildStagingPlan(evidence, verification) {
  const artifacts = validateCommon(evidence, verification, 'staging');
  requireObject(evidence.accessIsolation, 'accessIsolation');
  if (
    evidence.accessIsolation.confirmed !== true
    || !new Set(['maintenance', 'isolated_project']).has(
      evidence.accessIsolation.mode
    )
  ) {
    fail('isolation_unverified', 'staging access isolation is not verified');
  }
  validateBackup(
    evidence.backup,
    new Set(['backup', 'disposable_project'])
  );
  requireSafeActor(evidence.operator, 'operator');
  requireSafeActor(evidence.reviewer, 'reviewer');
  if (evidence.operator === evidence.reviewer) {
    fail('reviewer_not_independent', 'operator and reviewer must differ');
  }
  validateCatalogEvidence(evidence.catalogEvidence);

  return {
    planVersion: '1.0.0',
    dryRun: true,
    executesSql: false,
    networkAccess: false,
    target: 'staging',
    bundleId: verification.bundleId,
    manifestSha256: verification.manifestSha256,
    selectedArtifact: artifacts.forward,
    requiredAuthorization: 'separate_phase6_staging_authorization',
    steps: [
      'verify_access_isolation',
      'verify_backup_or_disposable_project',
      'review_supported_catalog_evidence',
      'obtain_phase6_staging_authorization',
      'execute_forward_outside_this_tool',
      'record_database_postflight',
      'record_application_smoke',
      'rehearse_compensation_separately',
      'complete_staging_execution_record'
    ]
  };
}

function buildProductionPlan(evidence, verification, options = {}) {
  const artifacts = validateCommon(evidence, verification, 'production');
  validateStagingRecord(evidence.stagingRecord, verification, options.now);
  validateBackup(evidence.backup, new Set(['backup']));
  requireSafeActor(evidence.restoreOwner, 'restoreOwner');
  requireSafeActor(evidence.operator, 'operator');
  requireSafeActor(evidence.reviewer, 'reviewer');
  requireSafeActor(evidence.observationOwner, 'observationOwner');
  requireSafeActor(
    evidence.compensationDecisionOwner,
    'compensationDecisionOwner'
  );
  if (evidence.operator === evidence.reviewer) {
    fail('reviewer_not_independent', 'operator and reviewer must differ');
  }
  requireObject(evidence.maintenance, 'maintenance');
  if (evidence.maintenance.enabled !== true) {
    fail('maintenance_off', 'production maintenance must be enabled');
  }
  requireObject(evidence.approval, 'approval');
  if (evidence.approval.goNoGo !== 'go') {
    fail('approval_missing', 'production go/no-go approval is missing');
  }
  requireSafeActor(evidence.approval.owner, 'approval.owner');
  validateCatalogEvidence(evidence.catalogEvidence);

  return {
    planVersion: '1.0.0',
    dryRun: true,
    executesSql: false,
    networkAccess: false,
    target: 'production',
    bundleId: verification.bundleId,
    manifestSha256: verification.manifestSha256,
    selectedArtifact: artifacts.forward,
    requiredAuthorization: 'separate_phase6_production_authorization',
    steps: [
      'verify_matching_staging_record',
      'verify_production_backup_and_restore_owner',
      'verify_maintenance_enabled',
      'review_supported_catalog_evidence',
      'obtain_phase6_production_authorization',
      'execute_forward_outside_this_tool',
      'record_database_postflight',
      'record_application_smoke',
      'observe_under_maintenance',
      'owner_decides_hold_compensate_restore_or_continue'
    ]
  };
}

function validateForwardRecord(record, verification) {
  requireObject(record, 'forwardRecord');
  rejectSensitiveEvidence(record, 'forwardRecord');
  const artifacts = artifactsByRole(verification);
  requireExact(record.operation, 'forward', 'forward_record_invalid', 'operation');
  if (!new Set(['staging', 'production']).has(record.target)) {
    fail('forward_record_invalid', 'forward record target is invalid');
  }
  requireExact(record.bundleId, verification.bundleId, 'forward_record_invalid', 'bundle');
  requireExact(
    record.manifestSha256,
    verification.manifestSha256,
    'forward_record_invalid',
    'manifest hash'
  );
  requireExact(
    record.forwardSha256,
    artifacts.forward.sha256,
    'forward_record_invalid',
    'forward hash'
  );
  if (
    record.result !== 'succeeded'
    || record.postflight?.status !== 'passed'
  ) {
    fail('forward_record_invalid', 'forward operation is not recorded as committed');
  }
}

function buildCompensationPlan(evidence, verification) {
  const artifacts = validateCommon(evidence, verification, 'compensation');
  validateForwardRecord(evidence.forwardRecord, verification);
  requireObject(evidence.decision, 'decision');
  if (evidence.decision.approved !== true) {
    fail('compensation_not_approved', 'owner compensation decision is absent');
  }
  requireSafeActor(evidence.decision.owner, 'decision.owner');
  if (!COMPENSATION_FAILURE_CATEGORIES.has(evidence.failureCategory)) {
    fail('failure_category_invalid', 'compensation failure category is invalid');
  }
  validateCatalogEvidence(evidence.catalogEvidence, { repairedOnly: true });
  validateBackup(evidence.backup, new Set(['backup']));
  requireObject(evidence.maintenance, 'maintenance');
  if (evidence.maintenance.enabled !== true) {
    fail('maintenance_off', 'maintenance must remain enabled');
  }
  requireSafeActor(evidence.operator, 'operator');
  requireSafeActor(evidence.reviewer, 'reviewer');
  if (evidence.operator === evidence.reviewer) {
    fail('reviewer_not_independent', 'operator and reviewer must differ');
  }

  return {
    planVersion: '1.0.0',
    dryRun: true,
    executesSql: false,
    networkAccess: false,
    target: 'compensation',
    bundleId: verification.bundleId,
    manifestSha256: verification.manifestSha256,
    selectedArtifact: artifacts.compensation,
    requiredAuthorization: 'explicit_owner_compensation_authorization',
    safetyOutcome: 'private_profile_view_fail_closed',
    steps: [
      'verify_committed_forward_record',
      'verify_repaired_catalog_evidence',
      'verify_explicit_owner_compensation_decision',
      'verify_backup_and_maintenance',
      'execute_compensation_outside_this_tool',
      'record_fail_closed_postflight',
      'keep_maintenance_enabled'
    ]
  };
}

function buildPlan(target, evidence, options = {}) {
  if (!TARGETS.has(target)) {
    fail('invalid_target', 'target must be staging, production, or compensation');
  }
  const verification = options.verification || verifyBundle();
  if (target === 'staging') {
    return buildStagingPlan(evidence, verification);
  }
  if (target === 'production') {
    return buildProductionPlan(evidence, verification, options);
  }
  return buildCompensationPlan(evidence, verification);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--target') {
      result.target = argv[index + 1];
      index += 1;
    } else if (argument === '--evidence') {
      result.evidencePath = argv[index + 1];
      index += 1;
    } else {
      fail('invalid_arguments', 'only --target and --evidence are supported');
    }
  }
  if (!result.target || !result.evidencePath) {
    fail('invalid_arguments', '--target and --evidence are required');
  }
  return result;
}

function readEvidence(evidencePath) {
  const absolute = path.resolve(evidencePath);
  if (!fs.existsSync(absolute) || fs.lstatSync(absolute).isSymbolicLink()) {
    fail('evidence_unreadable', 'evidence must be a non-symlink local file');
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch {
    fail('evidence_invalid_json', 'evidence is not valid JSON');
  }
  rejectSensitiveEvidence(parsed);
  return parsed;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const evidence = readEvidence(args.evidencePath);
    const plan = buildPlan(args.target, evidence);
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof GovernanceError
      ? error.code
      : 'plan_failed';
    process.stderr.write(`PLAN_GENERATION_FAILED ${code}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  COMPENSATION_FAILURE_CATEGORIES,
  buildPlan,
  readEvidence,
  rejectSensitiveEvidence,
  validateStagingRecord
};
