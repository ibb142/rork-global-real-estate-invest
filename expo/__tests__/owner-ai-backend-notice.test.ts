import { describe, expect, test } from 'bun:test';
import {
  isTransientOwnerAIBackendNotice,
  shouldSuppressOwnerAIBackendNotice,
} from '@/src/modules/ivx-owner-ai/services/ownerAIBackendNotice';

/**
 * Minimal reproduce of the parsing path to verify that a well-formed 2xx
 * reply body never triggers a parse-error notice.  We import the compatibility
 * extractor directly so the test stays fast and pure (no fetch / network).
 */
import { extractCompatibilityOwnerAIResponseForTest } from '@/src/modules/ivx-owner-ai/services/ivxAIRequestService';

// Helper to normalize the test export
function tryExtract(payload: unknown): string | null {
  const result = extractCompatibilityOwnerAIResponseForTest(payload, 'test-room', 'test-req');
  if (!result) return null;
  // A well-formed reply must have visible text AND be non-transient.
  if (isTransientOwnerAIBackendNotice(result.answer)) return null;
  return result.answer;
}

const PARSE_NOTICE =
  "The IVX Owner AI backend replied, but I couldn't read its response. This is a temporary backend formatting issue, not an auth problem. Your message was kept (42 characters) and nothing was sent or changed — please resend.";

const RATE_LIMIT_NOTICE =
  'IVX Owner AI is rate-limited right now (429 — too many requests). Your message was kept (42 characters) and nothing was sent or changed — wait a few seconds and resend.';

describe('isTransientOwnerAIBackendNotice', () => {
  test('detects the parse-error notice (straight and curly apostrophe)', () => {
    expect(isTransientOwnerAIBackendNotice(PARSE_NOTICE)).toBe(true);
    expect(
      isTransientOwnerAIBackendNotice(PARSE_NOTICE.replace("couldn't", 'couldn\u2019t')),
    ).toBe(true);
  });

  test('detects rate-limit and resend notices', () => {
    expect(isTransientOwnerAIBackendNotice(RATE_LIMIT_NOTICE)).toBe(true);
  });

  test('a real task report is NOT a transient notice', () => {
    const realAnswer = [
      'TASK UNDERSTOOD:\nFix the broken health route.',
      'FILES CHANGED:\nbackend/hono.ts',
      'STATUS:\nUNVERIFIED',
    ].join('\n\n');
    expect(isTransientOwnerAIBackendNotice(realAnswer)).toBe(false);
  });

  test('non-string input is safe', () => {
    expect(isTransientOwnerAIBackendNotice(null)).toBe(false);
    expect(isTransientOwnerAIBackendNotice(undefined)).toBe(false);
    expect(isTransientOwnerAIBackendNotice(123)).toBe(false);
  });
});

describe('extractCompatibilityOwnerAIResponse — valid replies never produce parse-error', () => {
  test('real answer object with answer field is extracted', () => {
    const body = { answer: 'TASK UNDERSTOOD:\nDo the work.', status: 'ok' };
    const text = tryExtract(body);
    expect(text).toBeTruthy();
    expect(text).toContain('Do the work');
  });

  test('SSE final-event wrapper is unwrapped and the inner answer is extracted', () => {
    const body = { type: 'final', status: 200, ok: true, body: { answer: 'Deploy complete.', status: 'ok' } };
    const text = tryExtract(body);
    expect(text).toBeTruthy();
    expect(text).toContain('Deploy complete');
  });

  test('SSE final-event wrapper with JSON-string body is unwrapped', () => {
    const body = { type: 'final', status: 200, ok: true, body: JSON.stringify({ answer: 'Build passed.', status: 'ok' }) };
    const text = tryExtract(body);
    expect(text).toBeTruthy();
    expect(text).toContain('Build passed');
  });

  test('empty/null bodies do NOT produce a false answer', () => {
    expect(tryExtract(null)).toBeNull();
    expect(tryExtract(undefined)).toBeNull();
    expect(tryExtract({})).toBeNull();
    expect(tryExtract('')).toBeNull();
  });

  test('real answer without conversationId still renders (uses fallback)', () => {
    const body = { answer: 'Task report: tests passed.', status: 'ok' };
    const result = extractCompatibilityOwnerAIResponseForTest(body, 'test-room', 'test-req');
    expect(result).toBeTruthy();
    // conversationId falls back to 'test-room' when the body lacks one
    expect(result!.conversationId).toBe('test-room');
    expect(result!.answer).toContain('Task report');
  });

  test('plain-text string reply is extracted (non-HTML)', () => {
    const text = tryExtract('Fix applied to hono.ts');
    expect(text).toBeTruthy();
    expect(text).toContain('Fix applied');
  });
});

describe('shouldSuppressOwnerAIBackendNotice', () => {
  test('suppresses the notice only when a real reply already exists', () => {
    expect(
      shouldSuppressOwnerAIBackendNotice({ answer: PARSE_NOTICE, hasExistingAssistantReply: true }),
    ).toBe(true);
    expect(
      shouldSuppressOwnerAIBackendNotice({ answer: PARSE_NOTICE, hasExistingAssistantReply: false }),
    ).toBe(false);
  });

  test('never suppresses a real answer even if a prior reply exists', () => {
    expect(
      shouldSuppressOwnerAIBackendNotice({
        answer: 'TASK UNDERSTOOD:\nDo the work.',
        hasExistingAssistantReply: true,
      }),
    ).toBe(false);
  });
});
