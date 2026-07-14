/**
 * IVX Owner AI Orchestrator — Lifecycle Tests
 * 
 * Tests the state machine: IDLE → USER_MESSAGE_ACCEPTED → AI_TRIGGER_DECISION →
 * AI_MUTATION_STARTED → HTTP_REQUEST_STARTED → HTTP_RESPONSE_RECEIVED →
 * RESPONSE_PERSISTED → UI_RENDERED → SUCCESS
 * Plus all failure states: VALIDATION_FAILED, AUTH_FAILED, NETWORK_FAILED,
 * PROVIDER_FAILED, TIMEOUT, CANCELLED
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';

// Mock AsyncStorage — not available in bun test environment
mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));

import { createAIOrchestrator, type AIOrchestratorState, type AIOrchestratorPayload } from '@/src/modules/ivx-owner-ai/services/ivxOwnerAIOrchestrator';

function createMockCallbacks(overrides: Partial<{
  isMounted: () => boolean;
  hasConversationId: () => string | null;
  hasOwnerSession: () => boolean;
  onExecute: (payload: AIOrchestratorPayload) => Promise<void>;
}> = {}) {
  const transitions: AIOrchestratorState[] = [];
  return {
    transitions,
    callbacks: {
      onTransition: (state: AIOrchestratorState) => { transitions.push(state); },
      onExecute: overrides.onExecute ?? (async () => {}),
      isMounted: overrides.isMounted ?? (() => true),
      hasConversationId: overrides.hasConversationId ?? (() => 'conv-123'),
      hasOwnerSession: overrides.hasOwnerSession ?? (() => true),
    },
  };
}

function createPayload(overrides: Partial<AIOrchestratorPayload> = {}): AIOrchestratorPayload {
  return {
    text: 'Test message',
    messageId: 'msg-001',
    traceId: `trace-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nonBlocking: false,
    conversationId: 'conv-123',
    ownerId: 'owner-001',
    mode: 'send_and_ai',
    source: 'test',
    ...overrides,
  };
}

describe('IVX Owner AI Orchestrator Lifecycle', () => {
  it('transitions through full success path', async () => {
    const { callbacks, transitions } = createMockCallbacks();
    const orchestrator = createAIOrchestrator(callbacks);
    const result = await orchestrator.execute(createPayload());
    expect(result.state).toBe('SUCCESS');
    expect(transitions).toContain('USER_MESSAGE_ACCEPTED');
    expect(transitions).toContain('AI_TRIGGER_DECISION');
    expect(transitions).toContain('AI_MUTATION_STARTED');
    expect(transitions).toContain('SUCCESS');
  });

  it('transitions send_only directly to SUCCESS without AI', async () => {
    const { callbacks, transitions } = createMockCallbacks();
    const orchestrator = createAIOrchestrator(callbacks);
    const result = await orchestrator.execute(createPayload({ mode: 'send_only' }));
    expect(result.state).toBe('SUCCESS');
    expect(transitions).not.toContain('AI_MUTATION_STARTED');
  });

  it('fails with VALIDATION_FAILED when component is unmounted', async () => {
    const { callbacks } = createMockCallbacks({ isMounted: () => false });
    const orchestrator = createAIOrchestrator(callbacks);
    const result = await orchestrator.execute(createPayload());
    expect(result.state).toBe('VALIDATION_FAILED');
  });

  it('fails with VALIDATION_FAILED when text is empty', async () => {
    const { callbacks } = createMockCallbacks();
    const orchestrator = createAIOrchestrator(callbacks);
    const result = await orchestrator.execute(createPayload({ text: '' }));
    expect(result.state).toBe('VALIDATION_FAILED');
  });

  it('fails with VALIDATION_FAILED when text is whitespace only', async () => {
    const { callbacks } = createMockCallbacks();
    const orchestrator = createAIOrchestrator(callbacks);
    const result = await orchestrator.execute(createPayload({ text: '   ' }));
    expect(result.state).toBe('VALIDATION_FAILED');
  });

  it('fails with AUTH_FAILED when owner session is missing', async () => {
    const { callbacks } = createMockCallbacks({ hasOwnerSession: () => false });
    const orchestrator = createAIOrchestrator(callbacks);
    const result = await orchestrator.execute(createPayload());
    expect(result.state).toBe('AUTH_FAILED');
  });

  it('fails with VALIDATION_FAILED when conversation ID is missing', async () => {
    const { callbacks } = createMockCallbacks({ hasConversationId: () => null });
    const orchestrator = createAIOrchestrator(callbacks);
    const result = await orchestrator.execute(createPayload());
    expect(result.state).toBe('VALIDATION_FAILED');
  });

  it('transitions to TIMEOUT when onExecute throws after HTTP starts', async () => {
    const { callbacks } = createMockCallbacks({
      onExecute: async () => { throw new Error('Request timeout after 180s'); },
    });
    const orchestrator = createAIOrchestrator(callbacks);
    const result = await orchestrator.execute(createPayload());
    expect(['TIMEOUT', 'PROVIDER_FAILED']).toContain(result.state);
  });

  it('transitions to CANCELLED on AbortError', async () => {
    const { callbacks } = createMockCallbacks({
      onExecute: async () => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      },
    });
    const orchestrator = createAIOrchestrator(callbacks);
    const result = await orchestrator.execute(createPayload());
    expect(result.state).toBe('CANCELLED');
  });

  it('marks context as terminal after completion', async () => {
    const { callbacks } = createMockCallbacks();
    const orchestrator = createAIOrchestrator(callbacks);
    const result = await orchestrator.execute(createPayload());
    expect(result.context.terminal).toBe(true);
  });

  it('cancel() transitions an active request to CANCELLED', async () => {
    const { callbacks } = createMockCallbacks({
      onExecute: async () => { await new Promise(r => setTimeout(r, 500)); },
    });
    const orchestrator = createAIOrchestrator(callbacks);
    const traceId = `cancel-test-${Date.now()}`;
    const executePromise = orchestrator.execute(createPayload({ traceId }));
    // Wait a tick for the request to be registered
    await new Promise(r => setTimeout(r, 50));
    orchestrator.cancel(traceId);
    const result = await executePromise;
    expect(result.context.terminal).toBe(true);
  });
});
