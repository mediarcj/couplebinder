// Description: Tests staging, production, and compensation dry-plan gates.
// Purpose: Prove incomplete, mismatched, stale, or unsafe evidence is denied.
// Security: Generated plans are fixed, network-free, and never execute SQL.

import {
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

const {
  GovernanceError,
  verifyBundle
} = require('../scripts/migrations/verify-profile-rls-bundle');
const {
  buildPlan
} = require('../scripts/migrations/build-profile-rls-plan');
const NOW = new Date('2026-07-28T12:00:00.000Z');
let verification;
let hashes;

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

function common(target) {
  return {
    target,
    bundleId: verification.bundleId,
    repositoryCommit:
      verification.manifest.requiredApplication.minimumReviewedCommit,
    manifestSha256: verification.manifestSha256,
    forwardSha256: hashes.forward,
    compensationSha256: hashes.compensation
  };
}

function stagingEvidence() {
  return {
    ...common('staging'),
    accessIsolation: {
      confirmed: true,
      mode: 'isolated_project'
    },
    backup: {
      verified: true,
      kind: 'disposable_project',
      reference: 'synthetic-staging-reset'
    },
    operator: 'staging-operator',
    reviewer: 'staging-reviewer',
    catalogEvidence: {
      verified: true,
      reference: 'synthetic-catalog-old',
      classification: 'supported_old'
    }
  };
}

function successfulStagingRecord() {
  return {
    schemaVersion: '1.0.0',
    operation: 'forward',
    target: 'staging',
    bundleId: verification.bundleId,
    repositoryCommit:
      verification.manifest.requiredApplication.minimumReviewedCommit,
    manifestSha256: verification.manifestSha256,
    forwardSha256: hashes.forward,
    compensationSha256: hashes.compensation,
    catalogFingerprintReference: 'synthetic-staging-fingerprint',
    startingCatalogClassification: 'supported_hybrid',
    finishedAt: '2026-07-28T10:00:00.000Z',
    result: 'succeeded',
    postflight: {
      status: 'passed',
      evidenceReference: 'synthetic-staging-postflight'
    },
    applicationSmoke: {
      status: 'passed',
      evidenceReference: 'synthetic-staging-smoke'
    },
    recursivePolicyObservation: {
      status: 'clear',
      eventCount: 0
    },
    compensationRehearsal: {
      status: 'passed',
      evidenceReference: 'synthetic-compensation-rehearsal'
    },
    finalDisposition: 'approved_for_production_planning'
  };
}

function productionEvidence() {
  return {
    ...common('production'),
    stagingRecord: successfulStagingRecord(),
    backup: {
      verified: true,
      kind: 'backup',
      reference: 'synthetic-production-backup'
    },
    restoreOwner: 'restore-owner',
    operator: 'production-operator',
    reviewer: 'production-reviewer',
    observationOwner: 'observation-owner',
    compensationDecisionOwner: 'compensation-owner',
    maintenance: {
      enabled: true
    },
    approval: {
      goNoGo: 'go',
      owner: 'project-owner'
    },
    catalogEvidence: {
      verified: true,
      reference: 'synthetic-production-catalog',
      classification: 'supported_hybrid'
    }
  };
}

function successfulForwardRecord() {
  return {
    operation: 'forward',
    target: 'staging',
    bundleId: verification.bundleId,
    manifestSha256: verification.manifestSha256,
    forwardSha256: hashes.forward,
    result: 'succeeded',
    postflight: {
      status: 'passed'
    }
  };
}

function compensationEvidence() {
  return {
    ...common('compensation'),
    forwardRecord: successfulForwardRecord(),
    decision: {
      approved: true,
      owner: 'project-owner'
    },
    failureCategory: 'catalog_postflight_failure',
    catalogEvidence: {
      verified: true,
      reference: 'synthetic-repaired-catalog',
      classification: 'repaired_target'
    },
    backup: {
      verified: true,
      kind: 'backup',
      reference: 'synthetic-compensation-backup'
    },
    maintenance: {
      enabled: true
    },
    operator: 'compensation-operator',
    reviewer: 'compensation-reviewer'
  };
}

beforeAll(() => {
  verification = verifyBundle();
  hashes = Object.fromEntries(
    verification.artifacts.map((artifact) => [
      artifact.role,
      artifact.sha256
    ])
  );
});

describe('profile RLS dry-plan generator', () => {
  it('builds a verified staging dry plan', () => {
    const plan = buildPlan('staging', stagingEvidence(), { verification });

    expect(plan).toMatchObject({
      dryRun: true,
      executesSql: false,
      networkAccess: false,
      target: 'staging',
      requiredAuthorization: 'separate_phase6_staging_authorization'
    });
    expect(plan.selectedArtifact.role).toBe('forward');
  });

  it('denies production without staging evidence', () => {
    const evidence = productionEvidence();
    delete evidence.stagingRecord;

    expectCode(
      () => buildPlan('production', evidence, { verification, now: NOW }),
      'invalid_evidence'
    );
  });

  it('denies a failed staging record', () => {
    const evidence = productionEvidence();
    evidence.stagingRecord.result = 'failed';

    expectCode(
      () => buildPlan('production', evidence, { verification, now: NOW }),
      'staging_record_failed'
    );
  });

  it('denies a mismatched staging manifest', () => {
    const evidence = productionEvidence();
    evidence.stagingRecord.manifestSha256 = '0'.repeat(64);

    expectCode(
      () => buildPlan('production', evidence, { verification, now: NOW }),
      'staging_record_mismatch'
    );
  });

  it('denies a mismatched forward hash', () => {
    const evidence = productionEvidence();
    evidence.forwardSha256 = 'f'.repeat(64);

    expectCode(
      () => buildPlan('production', evidence, { verification, now: NOW }),
      'forward_hash_mismatch'
    );
  });

  it('denies production without a verified backup', () => {
    const evidence = productionEvidence();
    evidence.backup.verified = false;

    expectCode(
      () => buildPlan('production', evidence, { verification, now: NOW }),
      'backup_unverified'
    );
  });

  it('denies production without a reviewer', () => {
    const evidence = productionEvidence();
    delete evidence.reviewer;

    expectCode(
      () => buildPlan('production', evidence, { verification, now: NOW }),
      'invalid_evidence'
    );
  });

  it('denies production while maintenance is off', () => {
    const evidence = productionEvidence();
    evidence.maintenance.enabled = false;

    expectCode(
      () => buildPlan('production', evidence, { verification, now: NOW }),
      'maintenance_off'
    );
  });

  it('denies production without catalog classification', () => {
    const evidence = productionEvidence();
    delete evidence.catalogEvidence.classification;

    expectCode(
      () => buildPlan('production', evidence, { verification, now: NOW }),
      'unsupported_catalog'
    );
  });

  it('denies unknown catalog drift', () => {
    const evidence = productionEvidence();
    evidence.catalogEvidence.classification = 'unknown';

    expectCode(
      () => buildPlan('production', evidence, { verification, now: NOW }),
      'unsupported_catalog'
    );
  });

  it('denies stale staging evidence', () => {
    const evidence = productionEvidence();
    evidence.stagingRecord.finishedAt = '2026-07-01T00:00:00.000Z';

    expectCode(
      () => buildPlan('production', evidence, { verification, now: NOW }),
      'staging_record_stale'
    );
  });

  it('builds a production dry plan from complete matching evidence', () => {
    const plan = buildPlan('production', productionEvidence(), {
      verification,
      now: NOW
    });

    expect(plan).toMatchObject({
      dryRun: true,
      executesSql: false,
      networkAccess: false,
      target: 'production',
      requiredAuthorization: 'separate_phase6_production_authorization'
    });
    expect(plan.selectedArtifact.role).toBe('forward');
  });

  it('denies compensation without an explicit owner decision', () => {
    const evidence = compensationEvidence();
    evidence.decision.approved = false;

    expectCode(
      () => buildPlan('compensation', evidence, { verification }),
      'compensation_not_approved'
    );
  });

  it('denies compensation without repaired-state evidence', () => {
    const evidence = compensationEvidence();
    evidence.catalogEvidence.classification = 'supported_old';

    expectCode(
      () => buildPlan('compensation', evidence, { verification }),
      'unsupported_catalog'
    );
  });

  it('builds only a fail-closed compensation dry plan', () => {
    const plan = buildPlan(
      'compensation',
      compensationEvidence(),
      { verification }
    );

    expect(plan).toMatchObject({
      dryRun: true,
      executesSql: false,
      networkAccess: false,
      target: 'compensation',
      requiredAuthorization: 'explicit_owner_compensation_authorization',
      safetyOutcome: 'private_profile_view_fail_closed'
    });
    expect(plan.selectedArtifact.role).toBe('compensation');
    expect(JSON.stringify(plan)).not.toContain(
      '20260726_harden_profiles_view.sql'
    );
  });
});
