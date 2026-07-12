import { describe, expect, it } from 'bun:test';

import {
  classifyWatchdogWarning,
  type AnalyzableWatchdogReport,
} from './ivxBackendPostFailureAnalyzer';

function makeReport(partial: Partial<AnalyzableWatchdogReport>): AnalyzableWatchdogReport {
  return {
    traceId: partial.traceId ?? 't',
    finalStatus: partial.finalStatus ?? 'SUCCESS',
    failedCheckpoint: partial.failedCheckpoint ?? null,
    failureReason: partial.failureReason ?? null,
    statusCode: partial.statusCode ?? null,
    backendResponse: partial.backendResponse ?? null,
    startedAt: partial.startedAt ?? new Date().toISOString(),
    endedAt: partial.endedAt ?? null,
    requestId: partial.requestId ?? null,
  };
}

describe('classifyWatchdogWarning — truthful severity', () => {
  it('SUCCESS → green SUCCESS_VERIFIED', () => {
    const w = classifyWatchdogWarning(makeReport({ finalStatus: 'SUCCESS' }));
    expect(w.classification).toBe('SUCCESS_VERIFIED');
    expect(w.severity).toBe('success');
    expect(w.isRealFailure).toBe(false);
  });

  it('DEGRADED (recovered via fallback) → yellow DEGRADED_RECOVERY, never red', () => {
    const w = classifyWatchdogWarning(makeReport({ finalStatus: 'DEGRADED' }));
    expect(w.classification).toBe('DEGRADED_RECOVERY');
    expect(w.severity).toBe('warning');
    expect(w.isRealFailure).toBe(false);
  });

  it('PENDING (in-flight) → neutral IN_PROGRESS, never DEGRADED_RECOVERY or red', () => {
    const w = classifyWatchdogWarning(makeReport({ finalStatus: 'PENDING' }));
    // A still-in-flight request must NOT be painted "degraded — recovered"
    // (that mislabel produced the blank-field DEGRADED_RECOVERY banner while
    // the composer was still "Sending message…"). It is neutral/working.
    expect(w.classification).toBe('IN_PROGRESS');
    expect(w.severity).toBe('info');
    expect(w.severity).not.toBe('error');
    expect(w.isRealFailure).toBe(false);
  });

  it('DEGRADED stays DEGRADED_RECOVERY and is distinct from in-flight IN_PROGRESS', () => {
    const degraded = classifyWatchdogWarning(makeReport({ finalStatus: 'DEGRADED' }));
    const inflight = classifyWatchdogWarning(makeReport({ finalStatus: 'PENDING' }));
    expect(degraded.classification).toBe('DEGRADED_RECOVERY');
    expect(inflight.classification).toBe('IN_PROGRESS');
    expect(degraded.classification).not.toBe(inflight.classification);
  });

  it('owner-route auth rejection (not recovered) → yellow AUTH_REQUIRED', () => {
    const w = classifyWatchdogWarning(
      makeReport({
        finalStatus: 'BLOCKED',
        failedCheckpoint: 'BACKEND_POST_FINISHED',
        statusCode: 401,
        failureReason: 'owner_route_auth: privileged owner session rejected',
      }),
    );
    expect(w.classification).toBe('AUTH_REQUIRED');
    expect(w.severity).toBe('warning');
    expect(w.isRealFailure).toBe(false);
  });

  it('true network failure → red NETWORK_FAILED', () => {
    const w = classifyWatchdogWarning(
      makeReport({
        finalStatus: 'VISIBLE_ERROR',
        failedCheckpoint: 'BACKEND_POST_FINISHED',
        failureReason: 'Network request failed',
      }),
    );
    expect(w.classification).toBe('NETWORK_FAILED');
    expect(w.severity).toBe('error');
    expect(w.isRealFailure).toBe(true);
  });

  it('timeout → red TIMEOUT', () => {
    const w = classifyWatchdogWarning(
      makeReport({
        finalStatus: 'SILENT_FAILURE',
        failedCheckpoint: 'BACKEND_POST_FINISHED',
        failureReason: 'Timed out after 90000ms — no progress past BACKEND_POST_STARTED.',
      }),
    );
    expect(w.classification).toBe('TIMEOUT');
    expect(w.severity).toBe('error');
  });

  it('parse error → red PARSE_ERROR', () => {
    const w = classifyWatchdogWarning(
      makeReport({
        finalStatus: 'BLOCKED',
        failedCheckpoint: 'BACKEND_POST_FINISHED',
        failureReason: 'response_invalid: could not normalize JSON',
      }),
    );
    expect(w.classification).toBe('PARSE_ERROR');
    expect(w.severity).toBe('error');
  });

  it('5xx backend exception → red TRUE_FAILURE', () => {
    const w = classifyWatchdogWarning(
      makeReport({
        finalStatus: 'BLOCKED',
        failedCheckpoint: 'BACKEND_POST_FINISHED',
        statusCode: 503,
        failureReason: 'service unavailable',
      }),
    );
    expect(w.classification).toBe('TRUE_FAILURE');
    expect(w.severity).toBe('error');
    expect(w.isRealFailure).toBe(true);
  });
});
