import { describe, expect, test } from 'bun:test';
import {
  NO_DEPLOYMENT_EVIDENCE,
  resolveBlockCompletionStatus,
  type BlockCompletionEvidence,
} from './ivx-task-completion-gate';

const FULL_EVIDENCE: BlockCompletionEvidence = {
  commitSha: 'd35db8b99cf4370e98e13564a8b8563ff43e458a',
  pushCompleted: true,
  deployStarted: true,
  deployCompleted: true,
  healthHttpStatus: 200,
  runningCommitSha: 'd35db8b9',
};

describe('six-point completion checklist (owner spec 2026-07-11)', () => {
  test('full real evidence → VERIFIED with zero failures', () => {
    const decision = resolveBlockCompletionStatus(FULL_EVIDENCE);
    expect(decision.status).toBe('VERIFIED');
    expect(decision.failures).toEqual([]);
  });

  test('no evidence at all → NOT_DEPLOYED with all six failures', () => {
    const decision = resolveBlockCompletionStatus(NO_DEPLOYMENT_EVIDENCE);
    expect(decision.status).toBe('NOT_DEPLOYED');
    expect(decision.failures.length).toBe(6);
  });

  test('missing commit → NOT_DEPLOYED', () => {
    const decision = resolveBlockCompletionStatus({ ...FULL_EVIDENCE, commitSha: null });
    expect(decision.status).toBe('NOT_DEPLOYED');
    expect(decision.failures.some((f) => f.includes('commit'))).toBe(true);
  });

  test('fake commit SHA string → NOT_DEPLOYED', () => {
    expect(resolveBlockCompletionStatus({ ...FULL_EVIDENCE, commitSha: 'CURRENT SHA' }).status).toBe('NOT_DEPLOYED');
    expect(resolveBlockCompletionStatus({ ...FULL_EVIDENCE, commitSha: '[GENERATED]' }).status).toBe('NOT_DEPLOYED');
  });

  test('push not completed → NOT_DEPLOYED', () => {
    expect(resolveBlockCompletionStatus({ ...FULL_EVIDENCE, pushCompleted: false }).status).toBe('NOT_DEPLOYED');
  });

  test('deployment never started → NOT_DEPLOYED', () => {
    expect(resolveBlockCompletionStatus({ ...FULL_EVIDENCE, deployStarted: false }).status).toBe('NOT_DEPLOYED');
  });

  test('deployment not completed → NOT_DEPLOYED', () => {
    expect(resolveBlockCompletionStatus({ ...FULL_EVIDENCE, deployCompleted: false }).status).toBe('NOT_DEPLOYED');
  });

  test('health endpoint not HTTP 200 → NOT_DEPLOYED', () => {
    expect(resolveBlockCompletionStatus({ ...FULL_EVIDENCE, healthHttpStatus: 503 }).status).toBe('NOT_DEPLOYED');
    expect(resolveBlockCompletionStatus({ ...FULL_EVIDENCE, healthHttpStatus: null }).status).toBe('NOT_DEPLOYED');
  });

  test('production running a DIFFERENT commit than GitHub → NOT_DEPLOYED', () => {
    const decision = resolveBlockCompletionStatus({ ...FULL_EVIDENCE, runningCommitSha: 'abcdef1234' });
    expect(decision.status).toBe('NOT_DEPLOYED');
    expect(decision.failures.some((f) => f.includes('differs'))).toBe(true);
  });

  test('missing running-commit evidence → NOT_DEPLOYED (unknown is never verified)', () => {
    expect(resolveBlockCompletionStatus({ ...FULL_EVIDENCE, runningCommitSha: null }).status).toBe('NOT_DEPLOYED');
  });
});
