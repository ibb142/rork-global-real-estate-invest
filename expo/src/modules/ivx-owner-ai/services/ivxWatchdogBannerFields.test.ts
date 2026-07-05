import { describe, expect, it } from 'bun:test';

import {
  resolveDegradedRecoveryFields,
  resolveFailureBannerFields,
  type BannerReportInput,
} from './ivxBackendPostFailureAnalyzer';

function makeReport(partial: Partial<BannerReportInput>): BannerReportInput {
  return {
    traceId: partial.traceId ?? 't',
    finalStatus: partial.finalStatus ?? 'DEGRADED',
    failedCheckpoint: partial.failedCheckpoint ?? null,
    failureReason: partial.failureReason ?? null,
    statusCode: partial.statusCode ?? null,
    backendResponse: partial.backendResponse ?? null,
    startedAt: partial.startedAt ?? new Date().toISOString(),
    endedAt: partial.endedAt ?? null,
    requestId: partial.requestId ?? null,
    fileLine: partial.fileLine ?? null,
    fixHint: partial.fixHint ?? null,
    lastSuccessfulCheckpoint: partial.lastSuccessfulCheckpoint ?? null,
    recovery: partial.recovery ?? null,
  };
}

/** Every value the banner renders must be non-empty and never a bare em-dash. */
function assertNoBlank(fields: Record<string, string>): void {
  for (const [key, value] of Object.entries(fields)) {
    expect(typeof value, key).toBe('string');
    expect(value.trim().length, key).toBeGreaterThan(0);
    expect(value.trim(), key).not.toBe('—');
  }
}

describe('resolveDegradedRecoveryFields — never blank', () => {
  it('uses the real recovery metadata when present', () => {
    const fields = resolveDegradedRecoveryFields(
      makeReport({
        finalStatus: 'DEGRADED',
        lastSuccessfulCheckpoint: 'BACKEND_POST_STARTED',
        recovery: {
          recoveredViaFallback: true,
          degradedRoute: '/api/ivx/owner-ai',
          recoveredRoute: '/public/chat',
          statusCode: 401,
          classification: 'owner_route_auth',
          reason: 'Owner session rejected (401).',
        },
      }),
    );
    expect(fields.degradedRoute).toBe('/api/ivx/owner-ai');
    expect(fields.statusCode).toBe('401');
    expect(fields.classification).toBe('owner_route_auth');
    expect(fields.reason).toBe('Owner session rejected (401).');
    assertNoBlank(fields);
  });

  it('never returns a bare em-dash even when recovery is null', () => {
    const fields = resolveDegradedRecoveryFields(
      makeReport({ finalStatus: 'DEGRADED', recovery: null }),
    );
    // statusCode/classification fall back to an explicit UNKNOWN_WITH_REASON,
    // never a blank "—".
    expect(fields.statusCode).toContain('UNKNOWN_WITH_REASON');
    expect(fields.classification).toContain('UNKNOWN_WITH_REASON');
    expect(fields.degradedRoute).toBe('/api/ivx/owner-ai');
    expect(fields.recoveredRoute).toBe('/public/chat');
    assertNoBlank(fields);
  });

  it('falls back to the report failure reason when recovery reason is empty', () => {
    const fields = resolveDegradedRecoveryFields(
      makeReport({
        finalStatus: 'DEGRADED',
        failureReason: 'privileged route degraded',
        recovery: {
          recoveredViaFallback: true,
          degradedRoute: '/api/ivx/owner-ai',
          recoveredRoute: '/public/chat',
          statusCode: null,
          classification: '',
          reason: null,
        },
      }),
    );
    expect(fields.reason).toBe('privileged route degraded');
    assertNoBlank(fields);
  });
});

describe('resolveFailureBannerFields — never blank', () => {
  it('shows an explicit n/a-with-reason for a timeout (no HTTP status/body)', () => {
    const fields = resolveFailureBannerFields(
      makeReport({
        finalStatus: 'SILENT_FAILURE',
        failedCheckpoint: 'BACKEND_POST_FINISHED',
        failureReason: 'Timed out after 90000ms — no progress past BACKEND_POST_STARTED.',
        fileLine: 'expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts:requestOwnerAI',
        statusCode: null,
        backendResponse: null,
      }),
    );
    // The owner spec: never a bare "—"; a genuinely-not-applicable HTTP field
    // must carry an explicit reason.
    expect(fields.statusCode).toContain('timeout');
    expect(fields.backendResponse).toContain('timeout');
    expect(fields.checkpoint).toBe('BACKEND_POST_FINISHED');
    expect(fields.functionName).toBe('requestOwnerAI');
    assertNoBlank(fields);
  });

  it('shows the real HTTP status + body when present', () => {
    const fields = resolveFailureBannerFields(
      makeReport({
        finalStatus: 'BLOCKED',
        failedCheckpoint: 'BACKEND_POST_FINISHED',
        failureReason: 'service unavailable',
        statusCode: 503,
        backendResponse: '<html>Service Unavailable</html>',
        fileLine: 'expo/app/ivx/chat.tsx:assistantReplyMutation',
      }),
    );
    expect(fields.statusCode).toBe('503');
    expect(fields.backendResponse).toContain('Service Unavailable');
    assertNoBlank(fields);
  });

  it('never returns a bare em-dash even when every optional field is null', () => {
    const fields = resolveFailureBannerFields(
      makeReport({
        finalStatus: 'VISIBLE_ERROR',
        failedCheckpoint: null,
        failureReason: null,
        statusCode: null,
        backendResponse: null,
        fileLine: null,
        fixHint: null,
        lastSuccessfulCheckpoint: null,
      }),
    );
    assertNoBlank(fields);
    expect(fields.checkpoint).toBe('BACKEND_POST_FINISHED');
  });
});
