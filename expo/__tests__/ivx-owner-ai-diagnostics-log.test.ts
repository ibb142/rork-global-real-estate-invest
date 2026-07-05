import { describe, test, expect, beforeEach } from 'bun:test';
import {
  clearOwnerAIDiagnosticsForTest,
  getOwnerAIDiagnostic,
  listOwnerAIDiagnostics,
  recordOwnerAIDiagnosticStage,
} from '../../backend/services/ivx-owner-ai-diagnostics-log';

describe('IVX owner AI diagnostics ring buffer', () => {
  beforeEach(() => {
    clearOwnerAIDiagnosticsForTest();
  });

  test('records planner, provider_ok, db_insert_ok stages and surfaces header fields', () => {
    const requestId = 'req-test-1';
    recordOwnerAIDiagnosticStage({ requestId, stage: 'received', detail: null });
    recordOwnerAIDiagnosticStage({
      requestId,
      stage: 'planner',
      detail: { route: 'generic_ai_chat', semanticIntent: 'general_question', useTools: false },
    });
    recordOwnerAIDiagnosticStage({
      requestId,
      stage: 'provider_ok',
      detail: { source: 'remote_api', provider: 'chatgpt', model: 'gpt-4o-mini', endpoint: '/v1/chat', latencyMs: 234 },
    });
    recordOwnerAIDiagnosticStage({
      requestId,
      conversationId: 'conv-1',
      stage: 'db_insert_ok',
      detail: { assistantMessageId: 'msg-42' },
    });

    const entry = getOwnerAIDiagnostic(requestId);
    expect(entry).not.toBeNull();
    expect(entry!.plannerRoute).toBe('generic_ai_chat');
    expect(entry!.plannerIntent).toBe('general_question');
    expect(entry!.plannerUseTools).toBe(false);
    expect(entry!.source).toBe('remote_api');
    expect(entry!.provider).toBe('chatgpt');
    expect(entry!.model).toBe('gpt-4o-mini');
    expect(entry!.providerLatencyMs).toBe(234);
    expect(entry!.assistantPersisted).toBe(true);
    expect(entry!.assistantMessageId).toBe('msg-42');
    expect(entry!.conversationId).toBe('conv-1');
    expect(entry!.stages.length).toBe(4);
  });

  test('provider_failed records error and stage transition', () => {
    const requestId = 'req-test-fail';
    recordOwnerAIDiagnosticStage({
      requestId,
      stage: 'provider_failed',
      detail: { latencyMs: 5012, error: 'upstream timeout' },
    });
    const entry = getOwnerAIDiagnostic(requestId);
    expect(entry).not.toBeNull();
    expect(entry!.error).toBe('upstream timeout');
    expect(entry!.providerLatencyMs).toBe(5012);
  });

  test('frontend client events merge into the same entry by requestId', () => {
    const requestId = 'req-test-merge';
    recordOwnerAIDiagnosticStage({
      requestId,
      stage: 'provider_ok',
      detail: { source: 'remote_api', provider: 'chatgpt', model: 'gpt-4o-mini', latencyMs: 180 },
    });
    recordOwnerAIDiagnosticStage({ requestId, stage: 'frontend_request_started' });
    recordOwnerAIDiagnosticStage({ requestId, stage: 'frontend_response_received' });
    recordOwnerAIDiagnosticStage({ requestId, stage: 'frontend_render_ok' });
    recordOwnerAIDiagnosticStage({ requestId, stage: 'frontend_typing_cleared' });
    const entry = getOwnerAIDiagnostic(requestId)!;
    expect(entry.frontendRequestStartedAt).not.toBeNull();
    expect(entry.frontendResponseReceivedAt).not.toBeNull();
    expect(entry.frontendRenderedAt).not.toBeNull();
    expect(entry.frontendTypingClearedAt).not.toBeNull();
  });

  test('frontend_error captures error string', () => {
    const requestId = 'req-test-fe-err';
    recordOwnerAIDiagnosticStage({
      requestId,
      stage: 'frontend_error',
      detail: { error: 'TypeError: cannot read property of undefined' },
    });
    const entry = getOwnerAIDiagnostic(requestId)!;
    expect(entry.frontendError).toContain('TypeError');
  });

  test('listOwnerAIDiagnostics returns newest first and respects limit', () => {
    for (let i = 0; i < 5; i += 1) {
      recordOwnerAIDiagnosticStage({ requestId: `req-${i}`, stage: 'received' });
    }
    const entries = listOwnerAIDiagnostics(3);
    expect(entries.length).toBe(3);
    expect(entries[0].requestId).toBe('req-4');
    expect(entries[2].requestId).toBe('req-2');
  });

  test('ring buffer caps at 200 entries', () => {
    for (let i = 0; i < 250; i += 1) {
      recordOwnerAIDiagnosticStage({ requestId: `req-${i}`, stage: 'received' });
    }
    const entries = listOwnerAIDiagnostics(200);
    expect(entries.length).toBe(200);
    expect(entries[0].requestId).toBe('req-249');
    expect(entries[199].requestId).toBe('req-50');
    expect(getOwnerAIDiagnostic('req-0')).toBeNull();
  });

  test('empty/non-string requestId is silently ignored (never throws)', () => {
    expect(() => recordOwnerAIDiagnosticStage({ requestId: '', stage: 'received' })).not.toThrow();
    expect(listOwnerAIDiagnostics(10).length).toBe(0);
  });
});
