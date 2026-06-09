import { describe, expect, test } from 'bun:test';
import {
  getRuntimeSourceLabel,
  getRuntimeStatusCopy,
  normalizeRuntimeSource,
  shouldShowFallbackUI,
  shouldShowRuntimeDebugDetails,
} from '@/src/modules/chat/chatRuntimeState';

describe('chatRuntimeState', () => {
  test('keeps pending neutral and not fallback', () => {
    const runtime = {
      source: 'pending' as const,
      requestStage: 'request_started',
      failureClass: 'pending',
      isFallback: false,
      isStreaming: false,
      hasVisibleResponseText: false,
    };

    expect(shouldShowFallbackUI(runtime)).toBe(false);
    expect(getRuntimeSourceLabel(runtime)).toBe('pending');
    expect(getRuntimeStatusCopy(runtime).title).toBe('Message sent');
  });

  test('shows fallback only for actual fallback state', () => {
    const runtime = {
      source: 'provider_fallback' as const,
      requestStage: 'fallback_reply',
      failureClass: 'network_unreachable',
      isFallback: true,
      isStreaming: false,
      hasVisibleResponseText: true,
    };

    expect(shouldShowFallbackUI(runtime)).toBe(true);
    expect(getRuntimeSourceLabel(runtime)).toBe('assistant');
    expect(getRuntimeStatusCopy(runtime).title).toBe('Message sent');
  });

  test('normalizes unknown source labels safely', () => {
    expect(normalizeRuntimeSource('remote_api')).toBe('remote_api');
    expect(normalizeRuntimeSource('provider_fallback')).toBe('provider_fallback');
    expect(normalizeRuntimeSource('weird-provider')).toBe('unknown');
  });

  test('only shows debug details for meaningful runtime states', () => {
    expect(shouldShowRuntimeDebugDetails({
      source: 'pending',
      requestStage: 'request_started',
      failureClass: 'pending',
      isFallback: false,
      isStreaming: false,
      hasVisibleResponseText: false,
    })).toBe(false);

    expect(shouldShowRuntimeDebugDetails({
      source: 'remote_api',
      requestStage: 'network',
      failureClass: 'network_unreachable',
      isFallback: false,
      isStreaming: false,
      hasVisibleResponseText: false,
    })).toBe(true);
  });
});
