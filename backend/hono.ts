import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { GET, OPTIONS as ownerAIOptions, handleIVXOwnerAIRequest } from './api/ivx-owner-ai';
import { OPTIONS as auditReportOptions, handleIVXAuditReportRequest } from './api/ivx-audit-report';
import { OPTIONS as supabaseInspectionOptions, handleIVXSupabaseInspectionRequest } from './api/ivx-supabase-inspection';
import { OPTIONS as supabaseOwnerActionOptions, handleIVXSupabaseOwnerActionRequest } from './api/ivx-supabase-owner-actions';
import { handleIVXDevelopmentActionRequest, handleIVXDevelopmentControlRequest, ivxDevelopmentControlOptions } from './api/ivx-development-control';
import { OPTIONS as aiBrainToolsOptions, handleIVXAIBrainToolExecuteRequest, handleIVXAIBrainToolsListRequest } from './api/ivx-ai-brain-tools';
import { OPTIONS as assistantOptions, POST as handleAssistantPost } from './api/assistant';
import { OPTIONS as planCreatorOptions, POST as handlePlanCreatorPost } from './api/plan-creator';
import { handlePublicChatPost } from './api/public-chat';
import { ChatStorage } from './chat-storage';
import type { ChatRoomMessage } from './chat-types';
import {
  generatePublicChatAnswer,
  getPublicChatHealthSnapshot,
  mapRoomMessagesToPublicChatHistory,
} from './public-chat-ai';
import {
  handleChatPost,
  handleDiagnosticsGet,
  handleFallbackReply,
  handleInboxSync,
  handleMessagesGet,
  handleMessagesPost,
  handleRoomsGet,
  handleRoomsPost,
  handleUploadPost,
  ownerRoutesOptions,
} from './api/owner-routes';

async function loadRoute53Module() {
  try {
    return await import('./api/route53-dns');
  } catch (error) {
    console.log('[IVXOwnerAI-Hono] Route53 module unavailable:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

function route53UnavailableResponse(): Response {
  return new Response(JSON.stringify({
    error: 'Route53 DNS tooling is unavailable in this runtime.',
  }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

async function handleRoute53Options(): Promise<Response> {
  const route53Module = await loadRoute53Module();
  if (!route53Module) {
    return route53UnavailableResponse();
  }

  return route53Module.route53DnsOptions();
}

async function handleRoute53Request(
  request: Request,
  action: 'audit' | 'upsert',
): Promise<Response> {
  const route53Module = await loadRoute53Module();
  if (!route53Module) {
    return route53UnavailableResponse();
  }

  if (action === 'audit') {
    return route53Module.handleRoute53DNSAudit(request);
  }

  return route53Module.handleRoute53DNSUpsert(request);
}

const app = new Hono();
const DEPLOYMENT_MARKER = 'ivx-owner-ai-hono-2026-04-20t0000z';
const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIST_ROOT = path.join(SERVER_ROOT, 'expo', 'dist');
const CHAT_DATABASE_PATH = (process.env.CHAT_DATABASE_PATH?.trim() || path.join(SERVER_ROOT, 'data', 'chat-room.sqlite'));
const CHAT_DEFAULT_ROOM_ID = (process.env.CHAT_ROOM_ID?.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 40) || 'main-room');
const publicChatStorage = new ChatStorage(CHAT_DATABASE_PATH);
const publicRoomMembers = new Map<string, number>();
const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function hasWebDistBuild(): boolean {
  return existsSync(WEB_DIST_ROOT);
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeRoomId(value: unknown): string {
  const normalized = readTrimmed(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);

  return normalized || '';
}

function readPublicLimit(value: unknown): number {
  const raw = typeof value === 'string' ? value : Array.isArray(value) ? value[0] : '';
  const parsed = Number.parseInt(readTrimmed(raw), 10);
  if (!Number.isFinite(parsed)) {
    return 80;
  }

  return Math.min(Math.max(parsed, 1), 200);
}

function sanitizePublicUsername(value: unknown): string {
  return readTrimmed(value).replace(/\s+/g, ' ').slice(0, 32) || 'Guest';
}

function sanitizePublicMessage(value: unknown): string {
  return readTrimmed(value).replace(/\s+/g, ' ').slice(0, 1200);
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function publicJson(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
    },
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function getPublicRoomSnapshot(roomId: string): { roomId: string; onlineCount: number; messageCount: number } {
  return {
    roomId,
    onlineCount: publicRoomMembers.get(roomId) ?? 0,
    messageCount: publicChatStorage.getRoomMessageCount(roomId),
  };
}

async function handlePublicRoomMessages(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const roomId = sanitizeRoomId(url.searchParams.get('roomId')) || CHAT_DEFAULT_ROOM_ID;
  const limit = readPublicLimit(url.searchParams.get('limit'));
  const messages = publicChatStorage.listMessages(roomId, limit);
  return publicJson({
    ok: true,
    roomId,
    messages,
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

async function handlePublicRoomState(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const roomId = sanitizeRoomId(url.searchParams.get('roomId')) || CHAT_DEFAULT_ROOM_ID;
  return publicJson({
    ok: true,
    room: getPublicRoomSnapshot(roomId),
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

async function handlePublicRoomSend(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const roomId = sanitizeRoomId(body.roomId) || CHAT_DEFAULT_ROOM_ID;
  const username = sanitizePublicUsername(body.username);
  const text = sanitizePublicMessage(body.text);
  const source = body.source === 'assistant' || body.source === 'system' ? body.source : 'user';

  if (!text) {
    return publicJson({
      ok: false,
      error: 'Message text is required.',
      deploymentMarker: DEPLOYMENT_MARKER,
    }, 400);
  }

  const message: ChatRoomMessage = publicChatStorage.createMessage({
    roomId,
    username,
    text,
    source,
  });

  const nextOnlineCount = Math.max(publicRoomMembers.get(roomId) ?? 0, 1);
  publicRoomMembers.set(roomId, nextOnlineCount);

  console.log('[IVXOwnerAI-Hono] Public room message stored', {
    roomId,
    username,
    source,
    messageId: message.id,
    marker: DEPLOYMENT_MARKER,
  });

  const roomMessages = publicChatStorage
    .listMessages(roomId, 24)
    .filter((storedMessage) => storedMessage.id !== message.id);
  const aiResult = await generatePublicChatAnswer({
    message: text,
    history: mapRoomMessagesToPublicChatHistory(roomMessages),
    sessionId: roomId,
  });
  const assistantMessage: ChatRoomMessage = publicChatStorage.createMessage({
    roomId,
    username: 'IVX Owner AI',
    text: aiResult.answer,
    source: 'assistant',
  });

  console.log('[IVXOwnerAI-Hono] Public room assistant reply stored', {
    roomId,
    messageId: assistantMessage.id,
    model: aiResult.model,
    source: aiResult.source,
    endpoint: aiResult.endpoint,
    marker: DEPLOYMENT_MARKER,
  });

  return publicJson({
    ok: true,
    message,
    assistantMessage,
    ai: {
      source: aiResult.source,
      model: aiResult.model,
      endpoint: aiResult.endpoint,
    },
    requestId: createId('public-room-request'),
    room: getPublicRoomSnapshot(roomId),
    deploymentMarker: DEPLOYMENT_MARKER,
    timestamp: nowIso(),
  }, 201);
}

function normalizeWebPath(requestPath: string): string {
  const normalized = requestPath.split('?')[0]?.trim() ?? '/';
  if (!normalized || normalized === '/') {
    return '/';
  }

  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function buildWebCandidates(requestPath: string): string[] {
  const normalizedPath = normalizeWebPath(requestPath);
  const trimmedPath = normalizedPath.replace(/^\/+/, '').replace(/\/+$/, '');

  if (!trimmedPath) {
    return ['index.html'];
  }

  const candidates = [
    trimmedPath,
    `${trimmedPath}.html`,
    path.join(trimmedPath, 'index.html'),
  ];

  return Array.from(new Set(candidates));
}

function resolveStaticFilePath(relativePath: string): string | null {
  const candidatePath = path.resolve(WEB_DIST_ROOT, relativePath);
  if (candidatePath !== WEB_DIST_ROOT && !candidatePath.startsWith(`${WEB_DIST_ROOT}${path.sep}`)) {
    return null;
  }

  return candidatePath;
}

function getMimeType(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

async function loadWebResponse(requestPath: string, method: string): Promise<Response | null> {
  if (!hasWebDistBuild()) {
    return null;
  }

  const shouldServeBody = method === 'GET';
  if (!shouldServeBody && method !== 'HEAD') {
    return null;
  }

  for (const candidate of buildWebCandidates(requestPath)) {
    const filePath = resolveStaticFilePath(candidate);
    if (!filePath) {
      continue;
    }

    try {
      const fileContents = await readFile(filePath);
      return new Response(shouldServeBody ? fileContents : null, {
        status: 200,
        headers: {
          'Content-Type': getMimeType(filePath),
          'Cache-Control': candidate.endsWith('.html') ? 'no-store' : 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      continue;
    }
  }

  return null;
}

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS', 'HEAD'],
  allowHeaders: ['Content-Type', 'Authorization', 'apikey'],
  exposeHeaders: ['Content-Type', 'Cache-Control'],
  maxAge: 86400,
}));

app.use('*', async (context, next) => {
  const startedAt = Date.now();
  console.log('[IVXOwnerAI-Hono] Incoming request:', {
    method: context.req.method,
    path: context.req.path,
    marker: DEPLOYMENT_MARKER,
  });
  await next();
  console.log('[IVXOwnerAI-Hono] Request complete:', {
    method: context.req.method,
    path: context.req.path,
    status: context.res.status,
    durationMs: Date.now() - startedAt,
    marker: DEPLOYMENT_MARKER,
  });
});

app.get('/', async (context) => {
  const webResponse = await loadWebResponse('/', context.req.method);
  if (webResponse) {
    return webResponse;
  }

  return context.json({
    ok: true,
    status: 'ok',
    service: 'ivx-owner-ai-backend',
    deploymentMarker: DEPLOYMENT_MARKER,
    frontend: 'https://chat.ivxholding.com',
    api: 'https://api.ivxholding.com',
    docsHint: 'Use GET /health for liveness, GET /readiness for readiness, POST /public/chat for the public chat frontend, and POST /chat for owner AI responses.',
  });
});

app.get('/health', (context) => {
  const publicChatHealth = getPublicChatHealthSnapshot();

  return context.json({
    ok: true,
    status: 'healthy',
    service: 'ivx-owner-ai-backend',
    deploymentMarker: DEPLOYMENT_MARKER,
    frontendUrl: 'https://chat.ivxholding.com',
    apiUrl: 'https://api.ivxholding.com',
    socketPath: '/socket.io',
    defaultRoomId: CHAT_DEFAULT_ROOM_ID,
    messageCount: publicChatStorage.getTotalMessageCount(),
    aiEnabled: publicChatHealth.aiEnabled,
    openAIModel: publicChatHealth.openAIModel,
    aiProvider: publicChatHealth.aiProvider,
    aiEndpoint: publicChatHealth.aiEndpoint,
    timestamp: nowIso(),
    routes: [
      'GET /',
      'GET /health',
      'GET /readiness',
      'POST /public/chat',
      'GET /api/public/messages',
      'GET /api/public/rooms',
      'POST /api/public/send-message',
      'POST /chat',
      'GET /messages',
      'POST /messages',
      'POST /upload',
      'GET /rooms',
      'POST /rooms',
      'POST /inbox/sync',
      'GET /diagnostics',
      'POST /fallback/reply',
      'POST /api/ivx/owner-ai',
      'GET /api/ivx/audit-report',
      'GET /api/ivx/development-control',
      'POST /api/ivx/development-action',
      'GET /api/ivx/ai-brain/tools',
      'POST /api/ivx/ai-brain/tools/execute',
      'GET /api/ivx/supabase/tables',
      'GET /api/ivx/supabase/schema',
      'GET /api/ivx/supabase/columns',
      'GET /api/ivx/supabase/rls',
      'POST /api/ivx/supabase/owner-action',
      'POST /api/assistant',
      'POST /api/plan-creator',
    ],
  });
});

app.get('/readiness', (context) => {
  return context.json({
    ok: true,
    ready: true,
    status: 'ok',
    service: 'ivx-owner-ai-backend',
    deploymentMarker: DEPLOYMENT_MARKER,
  });
});

// Owner AI canonical paths
app.options('/ivx/owner-ai', () => ownerAIOptions());
app.options('/api/ivx/owner-ai', () => ownerAIOptions());
app.get('/ivx/owner-ai', () => GET());
app.get('/api/ivx/owner-ai', () => GET());
app.post('/ivx/owner-ai', async (context) => handleIVXOwnerAIRequest(context.req.raw));
app.post('/api/ivx/owner-ai', async (context) => handleIVXOwnerAIRequest(context.req.raw));

app.options('/api/ivx/audit-report', () => auditReportOptions());
app.get('/api/ivx/audit-report', async (context) => handleIVXAuditReportRequest(context.req.raw));

app.options('/api/ivx/development-control', () => ivxDevelopmentControlOptions());
app.get('/api/ivx/development-control', async (context) => handleIVXDevelopmentControlRequest(context.req.raw));
app.options('/api/ivx/development-action', () => ivxDevelopmentControlOptions());
app.post('/api/ivx/development-action', async (context) => handleIVXDevelopmentActionRequest(context.req.raw));

app.options('/api/ivx/ai-brain/tools', () => aiBrainToolsOptions());
app.get('/api/ivx/ai-brain/tools', async (context) => handleIVXAIBrainToolsListRequest(context.req.raw));
app.options('/api/ivx/ai-brain/tools/execute', () => aiBrainToolsOptions());
app.post('/api/ivx/ai-brain/tools/execute', async (context) => handleIVXAIBrainToolExecuteRequest(context.req.raw));

const supabaseInspectionRoutePairs: Array<[string, 'tables' | 'schema' | 'columns' | 'rls']> = [
  ['/api/ivx/supabase/tables', 'tables'],
  ['/api/ivx/supabase/schema', 'schema'],
  ['/api/ivx/supabase/columns', 'columns'],
  ['/api/ivx/supabase/rls', 'rls'],
];

for (const [routePath, kind] of supabaseInspectionRoutePairs) {
  app.options(routePath, () => supabaseInspectionOptions());
  app.get(routePath, async (context) => handleIVXSupabaseInspectionRequest(context.req.raw, kind));
}

app.options('/api/ivx/supabase/owner-action', () => supabaseOwnerActionOptions());
app.post('/api/ivx/supabase/owner-action', async (context) => handleIVXSupabaseOwnerActionRequest(context.req.raw));

app.options('/assistant', () => assistantOptions());
app.options('/api/assistant', () => assistantOptions());
app.post('/assistant', async (context) => handleAssistantPost(context.req.raw));
app.post('/api/assistant', async (context) => handleAssistantPost(context.req.raw));

app.options('/plan-creator', () => planCreatorOptions());
app.options('/api/plan-creator', () => planCreatorOptions());
app.post('/plan-creator', async (context) => handlePlanCreatorPost(context.req.raw));
app.post('/api/plan-creator', async (context) => handlePlanCreatorPost(context.req.raw));

app.options('/public/chat', (context) => context.body(null, 204));
app.options('/api/public/chat', (context) => context.body(null, 204));
app.options('/public/messages', (context) => context.body(null, 204));
app.options('/api/public/messages', (context) => context.body(null, 204));
app.options('/public/rooms', (context) => context.body(null, 204));
app.options('/api/public/rooms', (context) => context.body(null, 204));
app.options('/public/send-message', (context) => context.body(null, 204));
app.options('/api/public/send-message', (context) => context.body(null, 204));
app.post('/public/chat', async (context) => handlePublicChatPost(context.req.raw));
app.post('/api/public/chat', async (context) => handlePublicChatPost(context.req.raw));
app.get('/public/messages', async (context) => handlePublicRoomMessages(context.req.raw));
app.get('/api/public/messages', async (context) => handlePublicRoomMessages(context.req.raw));
app.get('/public/rooms', async (context) => handlePublicRoomState(context.req.raw));
app.get('/api/public/rooms', async (context) => handlePublicRoomState(context.req.raw));
app.post('/public/send-message', async (context) => handlePublicRoomSend(context.req.raw));
app.post('/api/public/send-message', async (context) => handlePublicRoomSend(context.req.raw));

// Owner room routes (primary + /api-prefixed aliases)
const ownerRoutePairs: Array<[string, string]> = [
  ['/chat', '/api/chat'],
  ['/messages', '/api/messages'],
  ['/upload', '/api/upload'],
  ['/rooms', '/api/rooms'],
  ['/inbox/sync', '/api/inbox/sync'],
  ['/diagnostics', '/api/diagnostics'],
  ['/fallback/reply', '/api/fallback/reply'],
];

for (const [primary, aliased] of ownerRoutePairs) {
  app.options(primary, () => ownerRoutesOptions());
  app.options(aliased, () => ownerRoutesOptions());
}

app.post('/chat', async (c) => handleChatPost(c.req.raw));
app.post('/api/chat', async (c) => handleChatPost(c.req.raw));

app.get('/messages', async (c) => handleMessagesGet(c.req.raw));
app.get('/api/messages', async (c) => handleMessagesGet(c.req.raw));
app.post('/messages', async (c) => handleMessagesPost(c.req.raw));
app.post('/api/messages', async (c) => handleMessagesPost(c.req.raw));

app.post('/upload', async (c) => handleUploadPost(c.req.raw));
app.post('/api/upload', async (c) => handleUploadPost(c.req.raw));

app.get('/rooms', async (c) => handleRoomsGet(c.req.raw));
app.get('/api/rooms', async (c) => handleRoomsGet(c.req.raw));
app.post('/rooms', async (c) => handleRoomsPost(c.req.raw));
app.post('/api/rooms', async (c) => handleRoomsPost(c.req.raw));

app.post('/inbox/sync', async (c) => handleInboxSync(c.req.raw));
app.post('/api/inbox/sync', async (c) => handleInboxSync(c.req.raw));

app.get('/diagnostics', async (c) => handleDiagnosticsGet(c.req.raw));
app.get('/api/diagnostics', async (c) => handleDiagnosticsGet(c.req.raw));

app.post('/fallback/reply', async (c) => handleFallbackReply(c.req.raw));
app.post('/api/fallback/reply', async (c) => handleFallbackReply(c.req.raw));

// Route53 diagnostics
app.options('/api/aws/route53/audit', async () => handleRoute53Options());
app.options('/api/aws/route53/upsert', async () => handleRoute53Options());
app.post('/api/aws/route53/audit', async (c) => handleRoute53Request(c.req.raw, 'audit'));
app.post('/api/aws/route53/upsert', async (c) => handleRoute53Request(c.req.raw, 'upsert'));

app.onError((error, context) => {
  console.log('[IVXOwnerAI-Hono] Unhandled error:', {
    method: context.req.method,
    path: context.req.path,
    marker: DEPLOYMENT_MARKER,
    message: error instanceof Error ? error.message : 'unknown',
  });
  return context.json({
    error: 'Internal server error',
    detail: error instanceof Error ? error.message : 'unknown',
    deploymentMarker: DEPLOYMENT_MARKER,
  }, 500);
});

app.notFound(async (context) => {
  const webResponse = await loadWebResponse(context.req.path, context.req.method);
  if (webResponse) {
    console.log('[IVXOwnerAI-Hono] Served static web asset:', {
      method: context.req.method,
      path: context.req.path,
      marker: DEPLOYMENT_MARKER,
    });
    return webResponse;
  }

  console.log('[IVXOwnerAI-Hono] Route not found:', {
    method: context.req.method,
    path: context.req.path,
    marker: DEPLOYMENT_MARKER,
  });
  return context.json({ error: 'Not found', deploymentMarker: DEPLOYMENT_MARKER }, 404);
});

export default app;
