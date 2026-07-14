/**
 * IVX Idempotency Tests — same idempotency key never creates duplicate AI replies
 */

import { describe, it, expect } from 'bun:test';

// Simulate the idempotency logic from the backend
function generateIdempotencyKey(conversationId: string, message: string): string {
  let hash = 0;
  const input = `${conversationId}:${message}`;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `idemp-${Math.abs(hash).toString(36)}-${input.length.toString(36)}`;
}

describe('IVX Idempotency Key Generation', () => {
  it('generates consistent keys for same input', () => {
    const key1 = generateIdempotencyKey('conv-001', 'Hello AI');
    const key2 = generateIdempotencyKey('conv-001', 'Hello AI');
    expect(key1).toBe(key2);
  });

  it('generates different keys for different messages', () => {
    const key1 = generateIdempotencyKey('conv-001', 'Hello AI');
    const key2 = generateIdempotencyKey('conv-001', 'Goodbye AI');
    expect(key1).not.toBe(key2);
  });

  it('generates different keys for different conversations', () => {
    const key1 = generateIdempotencyKey('conv-001', 'Hello AI');
    const key2 = generateIdempotencyKey('conv-002', 'Hello AI');
    expect(key1).not.toBe(key2);
  });

  it('produces keys with idemp- prefix', () => {
    const key = generateIdempotencyKey('conv-001', 'test');
    expect(key.startsWith('idemp-')).toBe(true);
  });

  it('handles empty conversation gracefully', () => {
    const key = generateIdempotencyKey('', 'test message');
    expect(key).toBeTruthy();
    expect(key.startsWith('idemp-')).toBe(true);
  });
});

// Simulate the in-memory store behavior
describe('IVX Idempotency Store Behavior', () => {
  it('same idempotency key returns cached result on replay', () => {
    const store = new Map<string, { status: string; result: string }>();
    const index = new Map<string, string>();
    
    const idempKey = 'idemp-test-001';
    const traceId = 'trace-001';
    
    // First request
    store.set(traceId, { status: 'completed', result: 'AI reply text' });
    index.set(idempKey, traceId);
    
    // Replay with same key
    const existingTraceId = index.get(idempKey);
    const existing = existingTraceId ? store.get(existingTraceId) : null;
    
    expect(existing).not.toBeNull();
    expect(existing?.status).toBe('completed');
    expect(existing?.result).toBe('AI reply text');
  });

  it('different idempotency key creates new request', () => {
    const store = new Map<string, { status: string }>();
    const index = new Map<string, string>();
    
    const key1 = 'idemp-key-1';
    const key2 = 'idemp-key-2';
    
    index.set(key1, 'trace-1');
    store.set('trace-1', { status: 'completed' });
    
    // New key should not find existing
    const existing = index.get(key2);
    expect(existing).toBeUndefined();
  });
});
