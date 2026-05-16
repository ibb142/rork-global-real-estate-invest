import {
  generatePublicChatAnswer,
  sanitizePublicChatHistory,
  type PublicChatHistoryItem,
  type PublicChatSource,
} from '../public-chat-ai';
import type { ChatStorage } from '../chat-storage';
import type { ChatRoomMessage } from '../chat-types';
import {
  getPublicChatSupabaseStore,
  type PublicChatPersistedMessage,
  type PublicChatPersistedRole,
} from '../public-chat-supabase-store';

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
  persistence: 'supabase' | 'json' | 'none';
};

type RateLimitEntry = {
  count: number;
  windowStartedAt: number;
  lastSeenAt: number;
};

const DEPLOYMENT_MARKER = 'ivx-public-chat-2026-04-23t1200z';
const BLOCK17_MARKER = 'ivx-public-chat-history-2026-05-16t-block17';
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MAX_MESSAGE_LENGTH = 2000;
const PUBLIC_CHAT_SESSION_ROOM_PREFIX = 'pcs-';
const MAX_SESSION_HISTORY_LIMIT = 100;
const DEFAULT_SESSION_HISTORY_LIMIT = 40;
const MAX_SESSIONS_PER_CLIENT = 25;
const rateLimitStore = new Map<string, RateLimitEntry>();

let publicChatHistoryStorage: ChatStorage | null = null;

/**
 * Inject the long-lived ChatStorage instance used to persist public-chat
 * sessions and history. Called once from `backend/hono.ts` after the
 * storage is constructed; avoids circular imports.
 */
export function setPublicChatHistoryStorage(storage: ChatStorage): void {
  publicChatHistoryStorage = storage;
  console.log('[IVXPublicChat] History storage wired', {
    marker: BLOCK17_MARKER,
  });
}

function sanitizeSessionId(value: unknown): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.replace(/[^A-Za-z0-9_:-]/g, '-').slice(0, 80);
}

function sessionRoomId(sessionId: string): string {
  return `${PUBLIC_CHAT_SESSION_ROOM_PREFIX}${sessionId}`;
}

function parseLimit(value: unknown, fallback: number, max: number): number {
  const raw = typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.floor(raw), 1), max);
}

function toPublicSessionMessage(message: ChatRoomMessage): {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  content: string;
  source: string;
  model: string | null;
  sessionId: string;
  createdAt: string;
} {
  const role: 'user' | 'assistant' | 'system' = message.source === 'assistant'
    ? 'assistant'
    : message.source === 'system'
      ? 'system'
      : 'user';

  return {
    id: message.id,
    role,
    text: message.text,
    content: message.text,
    source: message.source,
    model: null,
    sessionId: message.roomId.startsWith(PUBLIC_CHAT_SESSION_ROOM_PREFIX)
      ? message.roomId.slice(PUBLIC_CHAT_SESSION_ROOM_PREFIX.length)
      : message.roomId,
    createdAt: message.createdAt,
  };
}

function toPublicSupabaseMessage(message: PublicChatPersistedMessage): {
  id: string;
  role: PublicChatPersistedRole;
  text: string;
  content: string;
  source: string;
  model: string | null;
  sessionId: string;
  createdAt: string;
} {
  return {
    id: message.id,
    role: message.role,
    text: message.content,
    content: message.content,
    source: message.source,
    model: message.model,
    sessionId: message.session_id,
    createdAt: message.created_at,
  };
}

function sanitizeErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : fallback;
  return readTrimmed(raw)
    .replace(/(Bearer\s+)[A-Za-z0-9._\-]+/gi, '$1[redacted]')
    .replace(/(apikey[=:]\s*)[A-Za-z0-9._\-]+/gi, '$1[redacted]')
    .slice(0, 280) || fallback;
}

function jsonResponse(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

async function persistPublicTurn(input: {
  sessionId: string;
  clientId: string;
  role: PublicChatPersistedRole;
  content: string;
  source: string;
  model?: string | null;
}): Promise<'supabase' | 'json' | 'none'> {
  const store = getPublicChatSupabaseStore();
  if (store.isConfigured()) {
    try {
      await store.appendMessage(input);
      return 'supabase';
    } catch (persistError) {
      console.log('[IVXPublicChat] Supabase turn persistence skipped:', {
        sessionId: input.sessionId,
        role: input.role,
        source: input.source,
        error: sanitizeErrorMessage(persistError, 'unknown'),
        marker: BLOCK17_MARKER,
      });
    }
  }

  if (publicChatHistoryStorage) {
    try {
      publicChatHistoryStorage.createMessage({
        roomId: sessionRoomId(input.sessionId),
        username: input.role === 'assistant' ? 'IVX Assistant' : input.clientId,
        text: input.content,
        source: input.role === 'assistant' ? 'assistant' : input.role === 'system' ? 'system' : 'user',
      });
      return 'json';
    } catch (persistError) {
      console.log('[IVXPublicChat] JSON turn persistence skipped:', {
        sessionId: input.sessionId,
        role: input.role,
        error: sanitizeErrorMessage(persistError, 'unknown'),
        marker: BLOCK17_MARKER,
      });
    }
  }

  return 'none';
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
    const requestedSessionId = sanitizeSessionId(body.sessionId);
    const sessionId = requestedSessionId || createId('public-session');
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

    const userPersistence = await persistPublicTurn({
      sessionId,
      clientId,
      role: 'user',
      content: message,
      source: 'user',
      model: null,
    });

    const result = await generatePublicChatAnswer({
      message,
      history,
      sessionId,
    });

    const assistantPersistence = await persistPublicTurn({
      sessionId,
      clientId,
      role: 'assistant',
      content: result.answer,
      source: result.source,
      model: result.model,
    });
    const persistence = assistantPersistence !== 'none' ? assistantPersistence : userPersistence;

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
      persistence,
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

    return jsonResponse({ ...payload, block17Marker: BLOCK17_MARKER });
  } catch (error) {
    return jsonResponse({
      error: sanitizeErrorMessage(error, 'Unable to process public chat request.'),
      deploymentMarker: DEPLOYMENT_MARKER,
      rateLimitRemaining: rateLimit.remaining,
      rateLimitResetAt: rateLimit.resetAt,
    }, 500);
  }
}

/**
 * GET /api/public/chat/history?sessionId=...&limit=...
 * Returns the persisted message history for a given public chat session.
 */
export async function handlePublicChatHistoryGet(request: Request): Promise<Response> {
  const clientId = resolveClientIdentifier(request);
  const url = new URL(request.url);
  const sessionId = sanitizeSessionId(url.searchParams.get('sessionId'));
  const limit = parseLimit(url.searchParams.get('limit'), DEFAULT_SESSION_HISTORY_LIMIT, MAX_SESSION_HISTORY_LIMIT);

  if (!sessionId) {
    return jsonResponse({
      ok: false,
      error: 'sessionId is required.',
      block17Marker: BLOCK17_MARKER,
    }, 400);
  }

  const store = getPublicChatSupabaseStore();
  if (store.isConfigured()) {
    try {
      const messages = (await store.listMessages({ sessionId, clientId, limit })).map(toPublicSupabaseMessage);
      return jsonResponse({
        ok: true,
        sessionId,
        messageCount: messages.length,
        messages,
        persistence: 'supabase',
        deploymentMarker: DEPLOYMENT_MARKER,
        block17Marker: BLOCK17_MARKER,
        timestamp: nowIso(),
      });
    } catch (error) {
      console.log('[IVXPublicChat] Supabase history read skipped:', {
        sessionId,
        error: sanitizeErrorMessage(error, 'unknown'),
        marker: BLOCK17_MARKER,
      });
    }
  }

  if (!publicChatHistoryStorage) {
    return jsonResponse({
      ok: false,
      error: 'Chat history storage is not initialized.',
      block17Marker: BLOCK17_MARKER,
    }, 503);
  }

  const roomId = sessionRoomId(sessionId);
  const ownerCheckMessages = publicChatHistoryStorage.listMessages(roomId, MAX_SESSION_HISTORY_LIMIT);
  const sessionBelongsToClient = ownerCheckMessages.length === 0 || ownerCheckMessages.some((message) => message.username === clientId);

  if (!sessionBelongsToClient) {
    return jsonResponse({
      ok: false,
      error: 'Chat history session was not found for this client.',
      deploymentMarker: DEPLOYMENT_MARKER,
      block17Marker: BLOCK17_MARKER,
      timestamp: nowIso(),
    }, 404);
  }

  const messages = ownerCheckMessages.slice(-limit).map(toPublicSessionMessage);

  return jsonResponse({
    ok: true,
    sessionId,
    messageCount: messages.length,
    messages,
    persistence: 'json',
    deploymentMarker: DEPLOYMENT_MARKER,
    block17Marker: BLOCK17_MARKER,
    timestamp: nowIso(),
  });
}

/**
 * GET /api/public/chat/sessions?limit=...
 * Returns the recent public chat sessions associated with the requesting client
 * (matched by the same IP-derived clientId that handlePublicChatPost uses).
 */
export async function handlePublicChatSessionsGet(request: Request): Promise<Response> {
  const clientId = resolveClientIdentifier(request);
  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get('limit'), 20, MAX_SESSIONS_PER_CLIENT);

  const store = getPublicChatSupabaseStore();
  if (store.isConfigured()) {
    try {
      const sessions = await store.listSessions({ clientId, limit });
      return jsonResponse({
        ok: true,
        sessionCount: sessions.length,
        sessions,
        persistence: 'supabase',
        deploymentMarker: DEPLOYMENT_MARKER,
        block17Marker: BLOCK17_MARKER,
        timestamp: nowIso(),
      });
    } catch (error) {
      console.log('[IVXPublicChat] Supabase session list skipped:', {
        error: sanitizeErrorMessage(error, 'unknown'),
        marker: BLOCK17_MARKER,
      });
    }
  }

  if (!publicChatHistoryStorage) {
    return jsonResponse({
      ok: false,
      error: 'Chat history storage is not initialized.',
      block17Marker: BLOCK17_MARKER,
    }, 503);
  }

  const rooms = publicChatHistoryStorage.listRoomsWithPrefix(PUBLIC_CHAT_SESSION_ROOM_PREFIX, MAX_SESSIONS_PER_CLIENT * 4);
  const sessions = rooms
    .filter((room) => room.usernames.includes(clientId))
    .slice(0, limit)
    .map((room) => ({
      sessionId: room.roomId.slice(PUBLIC_CHAT_SESSION_ROOM_PREFIX.length),
      messageCount: room.messageCount,
      lastUpdatedAt: room.lastUpdatedAt,
      lastMessagePreview: room.lastMessagePreview,
      lastSource: null,
      lastModel: null,
    }));

  return jsonResponse({
    ok: true,
    sessionCount: sessions.length,
    sessions,
    persistence: 'json',
    deploymentMarker: DEPLOYMENT_MARKER,
    block17Marker: BLOCK17_MARKER,
    timestamp: nowIso(),
  });
}
