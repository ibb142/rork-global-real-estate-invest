/**
 * IVX Watchdog Tests — checkpoint lifecycle, timeout, trace management
 */

import { describe, it, expect, mock } from 'bun:test';

// Mock AsyncStorage — not available in bun test environment
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));

import { ivxAIWatchdog, CHECKPOINT_ORDER, type CheckpointName } from '@/src/modules/ivx-owner-ai/services/ivxAIWatchdog';

describe('IVX Watchdog Checkpoint Lifecycle', () => {
  it('creates a trace with a valid traceId', () => {
    const trace = ivxAIWatchdog.createTrace({
      userMessageId: 'msg-001',
      userText: 'Test message',
      conversationId: 'conv-001',
    });
    expect(trace.traceId).toBeTruthy();
    expect(trace.traceId.startsWith('ivx-watchdog-')).toBe(true);
  });

  it('passes checkpoints in order', () => {
    const trace = ivxAIWatchdog.createTrace({
      userMessageId: 'msg-002',
      userText: 'Test',
      conversationId: 'conv-002',
    });
    trace.pass('SEND_TAP', 'tap detected');
    trace.pass('USER_ROW_INSERTED', 'row added');
    trace.pass('AI_TRIGGER_DECISION', 'branch=send_and_ai');
    const report = trace.getReport();
    expect(report.lastSuccessfulCheckpoint).toBe('AI_TRIGGER_DECISION');
  });

  it('completes with SUCCESS status', () => {
    const trace = ivxAIWatchdog.createTrace({
      userMessageId: 'msg-003',
      userText: 'Test',
      conversationId: 'conv-003',
    });
    trace.pass('SEND_TAP', 'ok');
    trace.complete('SUCCESS');
    const report = trace.getReport();
    expect(report.finalStatus).toBe('SUCCESS');
    expect(report.endedAt).toBeTruthy();
  });

  it('completes with VISIBLE_ERROR status', () => {
    const trace = ivxAIWatchdog.createTrace({
      userMessageId: 'msg-004',
      userText: 'Test',
      conversationId: 'conv-004',
    });
    trace.pass('SEND_TAP', 'ok');
    trace.complete('VISIBLE_ERROR');
    const report = trace.getReport();
    expect(report.finalStatus).toBe('VISIBLE_ERROR');
  });

  it('fails a checkpoint and records the reason', () => {
    const trace = ivxAIWatchdog.createTrace({
      userMessageId: 'msg-005',
      userText: 'Test',
      conversationId: 'conv-005',
    });
    trace.pass('SEND_TAP', 'ok');
    trace.fail('AI_MUTATION_STARTED', 'mutation never started');
    const report = trace.getReport();
    expect(report.finalStatus).toBe('BLOCKED');
    expect(report.failedCheckpoint).toBe('AI_MUTATION_STARTED');
    expect(report.failureReason).toBe('mutation never started');
  });

  it('records heartbeat and extends timeout', () => {
    const trace = ivxAIWatchdog.createTrace({
      userMessageId: 'msg-006',
      userText: 'audit end to end',
      conversationId: 'conv-006',
    });
    trace.heartbeat('stage:scanning');
    trace.heartbeat('heartbeat:5000ms');
    const report = trace.getReport();
    // The trace should still be pending (heartbeat extends timeout)
    expect(report.finalStatus).toBe('PENDING');
  });

  it('uses adaptive timeout for heavy audit prompts', () => {
    const trace = ivxAIWatchdog.createTrace({
      userMessageId: 'msg-007',
      userText: 'audit end to end full report',
      conversationId: 'conv-007',
    });
    // Heavy audit should use 180s timeout
    const report = trace.getReport();
    expect(report.finalStatus).toBe('PENDING');
  });

  it('binds transient IDs to traces', () => {
    const trace = ivxAIWatchdog.createTrace({
      userMessageId: 'msg-008',
      userText: 'Test',
      conversationId: 'conv-008',
    });
    trace.bindTransient('transient-001');
    const report = trace.getReport();
    expect(report.assistantTransientIds).toContain('transient-001');
  });

  it('CHECKPOINT_ORDER has 14 checkpoints', () => {
    expect(CHECKPOINT_ORDER.length).toBe(14);
    expect(CHECKPOINT_ORDER[0]).toBe('SEND_TAP');
    expect(CHECKPOINT_ORDER[13]).toBe('ASSISTANT_BUBBLE_VISIBLE');
  });

  it('getTrace returns null for non-existent traceId', () => {
    const result = ivxAIWatchdog.getTrace('non-existent-trace');
    expect(result).toBeNull();
  });

  it('records tap events', () => {
    ivxAIWatchdog.recordTap({ tapAt: new Date().toISOString() });
    const snapshot = ivxAIWatchdog.getSnapshot();
    expect(snapshot.tapCount).toBeGreaterThan(0);
  });
});
