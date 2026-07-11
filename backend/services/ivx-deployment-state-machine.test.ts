import { describe, expect, test } from 'bun:test';
import {
  DEPLOYMENT_STATES,
  advanceDeploymentState,
  commitShasMatch,
  formatDeploymentReport,
  isForbiddenEvidenceValue,
  isRealCommitSha,
  validateDeploymentEvidence,
  type DeploymentEvidenceReport,
} from './ivx-deployment-state-machine';

/** A fully real, consistent evidence report — the ONLY shape that may VERIFY. */
const REAL_REPORT: DeploymentEvidenceReport = {
  repository: 'ibb142/rork-global-real-estate-invest',
  branch: 'main',
  commitSha: 'd35db8b99cf4370e98e13564a8b8563ff43e458a',
  previousCommitSha: 'a1c9e2f40b7d6153c8e9f0a1b2c3d4e5f6a7b8c9',
  filesChanged: 5,
  linesAdded: 210,
  linesRemoved: 34,
  pushStatus: 'completed',
  deploymentPlatform: 'render',
  deploymentId: 'dep-cu1abcdef123456789',
  deploymentStatus: 'live',
  deploymentTimestamp: '2026-07-10T19:19:23.089Z',
  productionUrl: 'https://ivx-holdings-platform.onrender.com',
  healthEndpoint: 'https://ivx-holdings-platform.onrender.com/health',
  httpStatus: 200,
  runningCommitSha: 'd35db8b9',
  runtimeVersion: 'ivx-owner-ai-backend',
  verificationTime: '2026-07-10T19:25:00.000Z',
  qaResult: 'PASS',
};

describe('deployment state machine — no state may be skipped (Step 5)', () => {
  test('machine has exactly the 12 allowed states in order', () => {
    expect(DEPLOYMENT_STATES.length).toBe(12);
    expect(DEPLOYMENT_STATES[0]).toBe('REPO_FROZEN');
    expect(DEPLOYMENT_STATES[11]).toBe('PRODUCTION_VERIFIED');
  });

  test('sequential transitions are allowed', () => {
    for (let i = 0; i < DEPLOYMENT_STATES.length - 1; i++) {
      expect(advanceDeploymentState(DEPLOYMENT_STATES[i]!, DEPLOYMENT_STATES[i + 1]!).ok).toBe(true);
    }
  });

  test('skipping straight to PRODUCTION_VERIFIED is rejected', () => {
    const result = advanceDeploymentState('CODE_CHANGED', 'PRODUCTION_VERIFIED');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('skipped');
  });

  test('PUSH_COMPLETED without COMMIT_CREATED is rejected', () => {
    expect(advanceDeploymentState('TESTS_PASSED', 'PUSH_COMPLETED').ok).toBe(false);
  });

  test('backwards transitions are rejected', () => {
    expect(advanceDeploymentState('DEPLOY_COMPLETED', 'CODE_CHANGED').ok).toBe(false);
  });
});

describe('forbidden evidence values (Step 4)', () => {
  test.each(['AUTO-GENERATED', 'UNKNOWN', 'PENDING', 'PLACEHOLDER', 'MOCK', 'NARRATIVE', 'GENERATED', 'SIMULATED', 'ESTIMATED', 'ASSUMED'])(
    '%s is forbidden (any case, bracketed or not)',
    (value) => {
      expect(isForbiddenEvidenceValue(value)).toBe(true);
      expect(isForbiddenEvidenceValue(value.toLowerCase())).toBe(true);
      expect(isForbiddenEvidenceValue(`[${value}]`)).toBe(true);
    },
  );

  test('real values are not forbidden', () => {
    expect(isForbiddenEvidenceValue('d35db8b9')).toBe(false);
    expect(isForbiddenEvidenceValue('dep-cu1abcdef123456789')).toBe(false);
    expect(isForbiddenEvidenceValue('live')).toBe(false);
  });

  test('a report with deploymentId=AUTO-GENERATED is UNVERIFIED', () => {
    const result = validateDeploymentEvidence({ ...REAL_REPORT, deploymentId: 'AUTO-GENERATED' });
    expect(result.finalStatus).toBe('UNVERIFIED');
    expect(result.forbiddenValues.some((v) => v.startsWith('deploymentId='))).toBe(true);
  });

  test('a report with runtimeVersion=SIMULATED is UNVERIFIED', () => {
    expect(validateDeploymentEvidence({ ...REAL_REPORT, runtimeVersion: 'SIMULATED' }).finalStatus).toBe('UNVERIFIED');
  });
});

describe('evidence validation (Steps 3, 6, 7, 8)', () => {
  test('fully real, consistent report is VERIFIED', () => {
    const result = validateDeploymentEvidence(REAL_REPORT);
    expect(result.failures).toEqual([]);
    expect(result.finalStatus).toBe('VERIFIED');
  });

  test('any missing field forces UNVERIFIED', () => {
    for (const field of ['commitSha', 'deploymentId', 'httpStatus', 'runningCommitSha', 'verificationTime'] as const) {
      const result = validateDeploymentEvidence({ ...REAL_REPORT, [field]: null });
      expect(result.finalStatus).toBe('UNVERIFIED');
      expect(result.missingFields).toContain(field);
    }
  });

  test('health endpoint non-200 forces UNVERIFIED (Step 7)', () => {
    const result = validateDeploymentEvidence({ ...REAL_REPORT, httpStatus: 503 });
    expect(result.finalStatus).toBe('UNVERIFIED');
    expect(result.failures.some((f) => f.includes('HTTP 503'))).toBe(true);
  });

  test('running commit != GitHub commit forces UNVERIFIED (Step 7)', () => {
    const result = validateDeploymentEvidence({ ...REAL_REPORT, runningCommitSha: 'abcdef12' });
    expect(result.finalStatus).toBe('UNVERIFIED');
    expect(result.failures.some((f) => f.includes('does not match'))).toBe(true);
  });

  test('short production SHA matching long GitHub SHA is a valid match', () => {
    expect(commitShasMatch('d35db8b99cf4370e98e13564a8b8563ff43e458a', 'd35db8b9')).toBe(true);
    expect(commitShasMatch('d35db8b9', 'abcdef12')).toBe(false);
  });

  test('failed or missing QA forces UNVERIFIED (Step 8)', () => {
    expect(validateDeploymentEvidence({ ...REAL_REPORT, qaResult: 'FAIL' }).finalStatus).toBe('UNVERIFIED');
    expect(validateDeploymentEvidence({ ...REAL_REPORT, qaResult: null }).finalStatus).toBe('UNVERIFIED');
  });

  test('incomplete push or deploy status forces UNVERIFIED', () => {
    expect(validateDeploymentEvidence({ ...REAL_REPORT, pushStatus: 'failed' }).finalStatus).toBe('UNVERIFIED');
    expect(validateDeploymentEvidence({ ...REAL_REPORT, deploymentStatus: 'build_failed' }).finalStatus).toBe('UNVERIFIED');
  });

  test('fake commit SHA strings are rejected', () => {
    expect(isRealCommitSha('CURRENT SHA')).toBe(false);
    expect(isRealCommitSha('[AUTO-GENERATED]')).toBe(false);
    expect(isRealCommitSha('d35db8b9')).toBe(true);
  });
});

describe('final report rendering (Step 9) — evidence only, never narrative', () => {
  test('verified report prints FINAL STATUS: VERIFIED with all real fields', () => {
    const output = formatDeploymentReport(REAL_REPORT);
    expect(output).toContain('FINAL STATUS: VERIFIED');
    expect(output).toContain('Commit SHA: d35db8b99cf4370e98e13564a8b8563ff43e458a');
    expect(output).toContain('HTTP Status: 200');
    expect(output).not.toContain('REASON =');
  });

  test('missing evidence prints UNVERIFIED slots and an explicit REASON', () => {
    const output = formatDeploymentReport({ ...REAL_REPORT, deploymentId: null, runningCommitSha: null });
    expect(output).toContain('Deployment ID: UNVERIFIED');
    expect(output).toContain('Running Commit SHA: UNVERIFIED');
    expect(output).toContain('FINAL STATUS: UNVERIFIED');
    expect(output).toContain('REASON =');
    expect(output).toContain('missing evidence field: deploymentId');
  });

  test('empty report is fully UNVERIFIED with Missing production evidence semantics', () => {
    const empty: DeploymentEvidenceReport = {
      repository: null, branch: null, commitSha: null, previousCommitSha: null,
      filesChanged: null, linesAdded: null, linesRemoved: null, pushStatus: null,
      deploymentPlatform: null, deploymentId: null, deploymentStatus: null,
      deploymentTimestamp: null, productionUrl: null, healthEndpoint: null,
      httpStatus: null, runningCommitSha: null, runtimeVersion: null,
      verificationTime: null, qaResult: null,
    };
    const output = formatDeploymentReport(empty);
    expect(output).toContain('FINAL STATUS: UNVERIFIED');
    expect(output).not.toMatch(/FINAL STATUS: VERIFIED\b/);
    expect(output).toContain('REASON =');
    expect(output.match(/UNVERIFIED/g)!.length).toBeGreaterThan(10);
  });
});
