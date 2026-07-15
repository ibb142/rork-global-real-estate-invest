import { describe, expect, test } from 'bun:test';
import {
  isAcceptableAssistantSource,
  isExpectedAssistantSource,
  normalizeRuntimeSource,
} from '../src/modules/chat/chatRuntimeState';

describe('normalizeRuntimeSource', () => {
  test('preserves canonical sources', () => {
    expect(normalizeRuntimeSource('remote_api')).toBe('remote_api');
    expect(normalizeRuntimeSource('local_app_brain')).toBe('local_app_brain');
    expect(normalizeRuntimeSource('provider_fallback')).toBe('provider_fallback');
    expect(normalizeRuntimeSource('pending')).toBe('pending');
    expect(normalizeRuntimeSource('unknown')).toBe('unknown');
  });

  test('maps known backend-stamped provider labels to remote_api so assistant reply is never silently discarded', () => {
    expect(normalizeRuntimeSource('chatgpt')).toBe('remote_api');
    expect(normalizeRuntimeSource('openai')).toBe('remote_api');
    expect(normalizeRuntimeSource('gpt-4o')).toBe('remote_api');
    expect(normalizeRuntimeSource('gpt_conversation')).toBe('remote_api');
    expect(normalizeRuntimeSource('gateway')).toBe('remote_api');
    expect(normalizeRuntimeSource('anthropic')).toBe('remote_api');
    expect(normalizeRuntimeSource('claude')).toBe('remote_api');
    expect(normalizeRuntimeSource('gemini')).toBe('remote_api');
  });

  test('handles malformed input safely without throwing', () => {
    expect(normalizeRuntimeSource(null)).toBe('unknown');
    expect(normalizeRuntimeSource(undefined)).toBe('unknown');
    expect(normalizeRuntimeSource('')).toBe('unknown');
    expect(normalizeRuntimeSource('   ')).toBe('unknown');
    expect(normalizeRuntimeSource('garbled-source-xyz')).toBe('unknown');
  });

  test('case-insensitive normalization', () => {
    expect(normalizeRuntimeSource('Remote_API')).toBe('remote_api');
    expect(normalizeRuntimeSource('ChatGPT')).toBe('remote_api');
    expect(normalizeRuntimeSource('PENDING')).toBe('pending');
  });

  test('heuristic fallback for variant labels', () => {
    expect(normalizeRuntimeSource('provider-fallback-2')).toBe('provider_fallback');
    expect(normalizeRuntimeSource('local-brain-v2')).toBe('local_app_brain');
    expect(normalizeRuntimeSource('openai-gpt-5')).toBe('remote_api');
  });
});

describe('assistant source gating policy', () => {
  test('isExpectedAssistantSource accepts only canonical trusted sources', () => {
    expect(isExpectedAssistantSource('remote_api')).toBe(true);
    expect(isExpectedAssistantSource('local_app_brain')).toBe(true);
    expect(isExpectedAssistantSource('provider_fallback')).toBe(false);
    expect(isExpectedAssistantSource('unknown')).toBe(false);
    expect(isExpectedAssistantSource('pending')).toBe(false);
  });

  test('isAcceptableAssistantSource still renders provider_fallback and unknown so the bubble is never swallowed', () => {
    expect(isAcceptableAssistantSource('remote_api')).toBe(true);
    expect(isAcceptableAssistantSource('local_app_brain')).toBe(true);
    expect(isAcceptableAssistantSource('provider_fallback')).toBe(true);
    expect(isAcceptableAssistantSource('unknown')).toBe(true);
    expect(isAcceptableAssistantSource('pending')).toBe(false);
  });

  test('malformed backend sources still produce an acceptable rendering verdict (no silent discard)', () => {
    const normalized = normalizeRuntimeSource('chatgpt');
    expect(isAcceptableAssistantSource(normalized)).toBe(true);
    const unknownNormalized = normalizeRuntimeSource('garbled-source-xyz');
    expect(isAcceptableAssistantSource(unknownNormalized)).toBe(true);
  });
});
