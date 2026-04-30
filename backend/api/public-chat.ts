import {
  generatePublicChatAnswer,
  sanitizePublicChatHistory,
  type PublicChatHistoryItem,
  type PublicChatSource,
} from '../public-chat-ai';

type PublicChatRequestBody = {
  message?: unknown;
  history?: unknown;
  sessionId?: unknown;
  requestId?: unknown;
};

type PublicChatSuccessResponse = {
  ok: true;
  requestId: string;
  sessionId: string;
  answer: string;
  model: string;
  source: PublicChatSource;
  deploymentMarker: string;
  rateLimitRemaining: number;
  rateLimitResetAt: string;
  timestamp: string;
  endpoint: string | null;
};

type RateLimitEntry = {
  count: number;
  windowStartedAt: number;
  lastSeenAt: number;
};

const DEPLOYMENT_MARKER = 'ivx-public-chat-2026-04-23t1200z';
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_MESSAGE_LENGTH = 2000;
const rateLimitStore = new Map<string, RateLimitEntry>();

function jsonResponse(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function resolveClientIdentifier(request: Request): string {
  const forwarded = readTrimmed(request.headers.get('cf-connecting-ip'))
    || readTrimmed(request.headers.get('x-real-ip'))
    || readTrimmed(request.headers.get('x-forwarded-for')).split(',')[0]?.trim()
    || 'anonymous';

  return forwarded || 'anonymous';
}

function cleanupRateLimitStore(): void {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS * 2;
  rateLimitStore.forEach((entry, key) => {
    if (entry.lastSeenAt < cutoff) {
      rateLimitStore.delete(key);
    }
  });
}

function consumeRateLimit(clientId: string): { allowed: boolean; remaining: number; resetAt: string } {
  cleanupRateLimitStore();

  const now = Date.now();
  const current = rateLimitStore.get(clientId);
  if (!current || now - current.windowStartedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(clientId, {
      count: 1,
      windowStartedAt: now,
      lastSeenAt: now,
    });

    return {
      allowed: true,
      remaining: MAX_REQUESTS_PER_WINDOW - 1,
      resetAt: new Date(now + RATE_LIMIT_WINDOW_MS).toISOString(),
    };
  }

  current.count += 1;
  current.lastSeenAt = now;
  rateLimitStore.set(clientId, current);

  return {
    allowed: current.count <= MAX_REQUESTS_PER_WINDOW,
    remaining: Math.max(MAX_REQUESTS_PER_WINDOW - current.count, 0),
    resetAt: new Date(current.windowStartedAt + RATE_LIMIT_WINDOW_MS).toISOString(),
  };
}

function sanitizeHistory(history: unknown): PublicChatHistoryItem[] {
  if (!Array.isArray(history)) {
    return [];
  }

  const normalizedHistory = history
    .map((item) => {
      const record = item as Record<string, unknown>;
      const role = record?.role === 'assistant' ? 'assistant' : record?.role === 'user' ? 'user' : null;
      const content = readTrimmed(record?.content);

      if (!role || !content) {
        return null;
      }

      return { role, content } satisfies PublicChatHistoryItem;
    })
    .filter((item): item is PublicChatHistoryItem => item !== null);

  return sanitizePublicChatHistory(normalizedHistory);
}

export async function handlePublicChatPost(request: Request): Promise<Response> {
  const clientId = resolveClientIdentifier(request);
  const rateLimit = consumeRateLimit(clientId);
  if (!rateLimit.allowed) {
    return jsonResponse({
      error: 'Rate limit reached. Please wait a moment before sending another message.',
      deploymentMarker: DEPLOYMENT_MARKER,
      rateLimitRemaining: rateLimit.remaining,
      rateLimitResetAt: rateLimit.resetAt,
    }, 429);
  }

  try {
    const body = await request.json().catch(() => ({})) as PublicChatRequestBody;
    const message = readTrimmed(body.message).slice(0, MAX_MESSAGE_LENGTH);
    const sessionId = readTrimmed(body.sessionId) || createId('public-session');
    const requestId = readTrimmed(body.requestId) || createId('public-request');
    const history = sanitizeHistory(body.history);

    if (!message) {
      return jsonResponse({
        error: 'Message is required.',
        deploymentMarker: DEPLOYMENT_MARKER,
        rateLimitRemaining: rateLimit.remaining,
        rateLimitResetAt: rateLimit.resetAt,
      }, 400);
    }

    console.log('[IVXPublicChat] Incoming public chat request:', {
      clientId,
      sessionId,
      requestId,
      messagePreview: message.slice(0, 120),
      historyCount: history.length,
      deploymentMarker: DEPLOYMENT_MARKER,
    });

    const result = await generatePublicChatAnswer({
      message,
      history,
      sessionId,
    });

    const payload: PublicChatSuccessResponse = {
      ok: true,
      requestId,
      sessionId,
      answer: result.answer,
      model: result.model,
      source: result.source,
      deploymentMarker: DEPLOYMENT_MARKER,
      rateLimitRemaining: rateLimit.remaining,
      rateLimitResetAt: rateLimit.resetAt,
      timestamp: nowIso(),
      endpoint: result.endpoint,
    };

    console.log('[IVXPublicChat] Response generated:', {
      requestId,
      sessionId,
      model: payload.model,
      source: payload.source,
      endpoint: payload.endpoint,
      answerLength: payload.answer.length,
      deploymentMarker: DEPLOYMENT_MARKER,
    });

    return jsonResponse(payload);
  } catch (error) {
    return jsonResponse({
      error: error instanceof Error ? error.message : 'Unable to process public chat request.',
      deploymentMarker: DEPLOYMENT_MARKER,
      rateLimitRemaining: rateLimit.remaining,
      rateLimitResetAt: rateLimit.resetAt,
    }, 500);
  }
}
