import { describe, expect, it } from 'bun:test';
import {
  applyIVXIAReliabilityGate,
  buildReliabilityBlockedAnswer,
  findBannedGenericPromises,
  findMissingEvidence,
  findSuccessStateAssertions,
  findFailureStateAssertions,
  IVX_IA_RELIABILITY_GATE_MARKER,
  resolveSingleState,
  type IVXIAEvidence,
} from './ivx-ia-reliability-gate';

describe('ivx-ia-reliability-gate — marker', () => {
  it('exports a stable marker', () => {
    expect(IVX_IA_RELIABILITY_GATE_MARKER).toContain('ivx-ia-reliability-gate');
  });
});

describe('findBannedGenericPromises', () => {
  it('detects the exact banned phrases from the owner spec', () => {
    expect(findBannedGenericPromises("I'll inspect now.")).toContain("i'll inspect");
    expect(findBannedGenericPromises("I'll fix it.")).toContain("i'll fix");
    expect(findBannedGenericPromises('One moment.')).toContain('one moment');
    expect(findBannedGenericPromises('Let me check the schema.')).toContain('let me check');
    expect(findBannedGenericPromises('Hold on, please wait.')).toContain('hold on');
    expect(findBannedGenericPromises('Stand by.')).toContain('stand by');
    expect(findBannedGenericPromises("I'll get back to you.")).toContain("i'll get back to you");
  });

  it('does not flag concrete completed work', () => {
    expect(findBannedGenericPromises('I changed backend/api/owner-only.ts and ran tests.')).toEqual([]);
  });
});

describe('findSuccessStateAssertions / findFailureStateAssertions', () => {
  it('detects success states', () => {
    const found = findSuccessStateAssertions('Task completed and deployed to production.');
    expect(found).toContain('Task completed');
    expect(found).toContain('Deployed');
  });

  it('detects failure states', () => {
    const found = findFailureStateAssertions('BLOCKED — no owner session detected.');
    expect(found).toContain('Blocked');
  });
});

describe('findMissingEvidence', () => {
  it('flags missing evidence for a Done claim with no proof', () => {
    const missing = findMissingEvidence('Task completed.', null);
    expect(missing).toContain('Files changed');
    expect(missing).toContain('Task ID');
  });

  it('flags missing evidence for a Verified/Deployed claim', () => {
    const missing = findMissingEvidence('Verified and deployed to production.', null);
    expect(missing).toContain('Commit SHA');
    expect(missing).toContain('Render Deploy ID');
    expect(missing).toContain('Live verification');
  });

  it('accepts inline evidence in the answer text', () => {
    const answer = [
      'Task completed.',
      'Task ID: ivx-task-abc123',
      'Files changed: backend/api/owner-only.ts, backend/hono.ts',
      'Commit SHA: a1b2c3d4',
      'Render Deploy ID: dep-xyz789',
      'Live verification: GET /health 200',
    ].join('\n');
    const missing = findMissingEvidence(answer, null);
    expect(missing).toEqual([]);
  });

  it('accepts structured evidence passed to the gate', () => {
    const evidence: IVXIAEvidence = {
      taskId: 'ivx-task-abc',
      filesChanged: ['backend/hono.ts'],
      commitSha: 'a1b2c3d4',
      renderDeployId: 'dep-xyz',
      liveVerification: 'GET /health 200',
    };
    const missing = findMissingEvidence('Task completed and verified.', evidence);
    expect(missing).toEqual([]);
  });
});

describe('resolveSingleState — contradiction detection', () => {
  it('resolves a Done + Blocked contradiction to the failure side', () => {
    const res = resolveSingleState('Task completed. BLOCKED — no owner session.', null);
    expect(res.state).toBe('BLOCKED');
    expect(res.contradictions.length).toBeGreaterThan(0);
    expect(res.reason).toContain('Contradictory');
  });

  it('resolves a Verified + Waiting for owner contradiction to WAITING_OWNER', () => {
    const res = resolveSingleState('Verified. Waiting for owner approval.', null);
    expect(res.state).toBe('WAITING_OWNER');
    expect(res.contradictions.length).toBeGreaterThan(0);
  });
});

describe('resolveSingleState — success without evidence', () => {
  it('resolves a Done claim with no evidence to BLOCKED', () => {
    const res = resolveSingleState('Task completed.', null);
    expect(res.state).toBe('BLOCKED');
    expect(res.missingEvidence.length).toBeGreaterThan(0);
    expect(res.reason).toContain('without required evidence');
  });
});

describe('resolveSingleState — generic promise without evidence', () => {
  it("resolves an 'I'll inspect now' promise with no evidence to BLOCKED", () => {
    const res = resolveSingleState("I'll inspect now.", null);
    expect(res.state).toBe('BLOCKED');
    expect(res.bannedPromises).toContain("i'll inspect");
    expect(res.reason).toContain('Generic promise without evidence');
  });
});

describe('resolveSingleState — clean states', () => {
  it('resolves a fully-evidenced success to VERIFIED', () => {
    const evidence: IVXIAEvidence = {
      taskId: 'ivx-task-abc',
      filesChanged: ['backend/hono.ts'],
      commitSha: 'a1b2c3d4',
      renderDeployId: 'dep-xyz',
      liveVerification: 'GET /health 200',
    };
    const res = resolveSingleState('Task completed and verified.', evidence);
    expect(res.state).toBe('VERIFIED');
    expect(res.contradictions).toEqual([]);
  });

  it('resolves a normal conversational answer to READY', () => {
    const res = resolveSingleState('Casa Rosario is a real-estate project in Pembroke Pines, FL.', null);
    expect(res.state).toBe('READY');
  });

  it('resolves a pure BLOCKED answer to BLOCKED (no contradiction)', () => {
    const res = resolveSingleState('BLOCKED — no owner session detected.', null);
    expect(res.state).toBe('BLOCKED');
    expect(res.contradictions).toEqual([]);
  });
});

describe('applyIVXIAReliabilityGate', () => {
  it('passes a normal conversational answer through unchanged', () => {
    const answer = 'The Jacksonville deal has a 9.5% projected ROI over 18 months.';
    const result = applyIVXIAReliabilityGate({ message: 'ROI on Jacksonville?', answer });
    expect(result.gated).toBe(false);
    expect(result.state).toBe('READY');
    expect(result.answer).toBe(answer);
  });

  it('passes a fully-evidenced VERIFIED answer through unchanged', () => {
    const evidence: IVXIAEvidence = {
      taskId: 'ivx-task-abc',
      filesChanged: ['backend/hono.ts'],
      commitSha: 'a1b2c3d4',
      renderDeployId: 'dep-xyz',
      liveVerification: 'GET /health 200',
    };
    const answer = 'Task completed. Verified. Deployed to production.';
    const result = applyIVXIAReliabilityGate({ message: 'deploy it', answer, evidence });
    expect(result.gated).toBe(false);
    expect(result.state).toBe('VERIFIED');
    expect(result.answer).toBe(answer);
  });

  it('gates the exact contradictory example from the owner spec', () => {
    // The owner reported an answer that mixed "Task completed", "Task blocked",
    // "I'll inspect now", and "Open Developer Workspace" in one reply.
    const contradictory = [
      'Task completed.',
      'Task blocked.',
      "I'll inspect now.",
      'Open Developer Workspace.',
    ].join('\n');
    const result = applyIVXIAReliabilityGate({ message: 'finish the task', answer: contradictory });
    expect(result.gated).toBe(true);
    expect(result.state).toBe('BLOCKED');
    expect(result.contradictions.length).toBeGreaterThan(0);
    expect(result.bannedPromises).toContain("i'll inspect");
    expect(result.answer).toContain('STATE: BLOCKED');
    expect(result.answer).toContain('CONTRADICTION DETECTED');
    expect(result.answer).toContain('GENERIC PROMISE WITHOUT EVIDENCE');
    expect(result.answer).not.toContain('Task completed.');
  });

  it('gates a Done claim with no evidence', () => {
    const result = applyIVXIAReliabilityGate({ message: 'fix it', answer: 'Done.' });
    expect(result.gated).toBe(true);
    expect(result.state).toBe('BLOCKED');
    expect(result.answer).toContain('STATE: BLOCKED');
    expect(result.answer).toContain('MISSING EVIDENCE');
    expect(result.answer).toContain('UNVERIFIED');
  });

  it('gates a Verified claim missing the deploy chain', () => {
    const result = applyIVXIAReliabilityGate({ message: 'verify it', answer: 'Verified and deployed.' });
    expect(result.gated).toBe(true);
    expect(result.state).toBe('BLOCKED');
    expect(result.missingEvidence).toContain('Commit SHA');
    expect(result.missingEvidence).toContain('Render Deploy ID');
    expect(result.answer).toContain('MISSING EVIDENCE');
  });

  it('gates a generic promise without evidence', () => {
    const result = applyIVXIAReliabilityGate({ message: 'audit it', answer: "I'll fix it. One moment." });
    expect(result.gated).toBe(true);
    expect(result.state).toBe('BLOCKED');
    expect(result.bannedPromises).toContain("i'll fix");
    expect(result.bannedPromises).toContain('one moment');
    expect(result.answer).toContain('GENERIC PROMISE WITHOUT EVIDENCE');
    expect(result.answer).not.toContain("I'll fix it");
  });

  it('does not double-gate an already-BLOCKED senior-developer answer', () => {
    const blocked = [
      'BLOCKED',
      'REASON=The IVX Owner AI chat cannot read the repository.',
      'EXACT_ACTION_REQUIRED=Open the IVX app signed in as the owner.',
    ].join('\n');
    const result = applyIVXIAReliabilityGate({ message: 'show patches', answer: blocked });
    // Pure failure state, no success claim, no banned promise → passes through as BLOCKED.
    expect(result.gated).toBe(false);
    expect(result.state).toBe('BLOCKED');
    expect(result.answer).toBe(blocked);
  });
});

describe('buildReliabilityBlockedAnswer', () => {
  it('emits exactly one STATE header and the required sections', () => {
    const answer = buildReliabilityBlockedAnswer({
      state: 'BLOCKED',
      reason: 'test reason',
      missingEvidence: ['Commit SHA'],
      contradictions: ['Done + Blocked'],
      bannedPromises: ["i'll inspect"],
    });
    const stateLines = answer.split('\n').filter((l) => /^STATE:\s/.test(l));
    expect(stateLines.length).toBe(1);
    expect(stateLines[0]).toBe('STATE: BLOCKED');
    expect(answer).toContain('CONTRADICTION DETECTED');
    expect(answer).toContain('GENERIC PROMISE WITHOUT EVIDENCE');
    expect(answer).toContain('MISSING EVIDENCE');
    expect(answer).toContain('REASON: test reason');
    expect(answer).toContain('REQUIRED ACTION');
    expect(answer).toContain('UNVERIFIED');
  });
});
