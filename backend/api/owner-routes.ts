import { IVX_OWNER_AI_BUCKET } from '../../expo/shared/ivx';
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions, type IVXOwnerRequestContext } from './owner-only';
import {
  ensureOwnerConversation,
  handleIVXOwnerAIRequest,
  insertMessage,
  loadRecentMessages,
  resolveOwnerTables,
  safeEnsureInboxState,
  type ResolvedOwnerTables,
} from './ivx-owner-ai';

const DEPLOYMENT_MARKER = 'ivx-owner-routes-2026-04-24t0000z';
const IVX_SERVICE_UNAVAILABLE_MESSAGE = 'Service temporarily unavailable. Please try again.';

type DBClient = IVXOwnerRequestContext['client'];

type OwnerRoomContext = {
  tables: ResolvedOwnerTables;
  conversation: {
    id: string;
    slug: string;
    title: string;
    subtitle: string | null;
    createdAt: string;
    updatedAt: string;
    lastMessageText: string | null;
    lastMessageAt: string | null;
  };
};

function nowIso(): string {
  return new Date().toISOString();
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function getOwnerRoomContext(client: DBClient): Promise<OwnerRoomContext> {
  const tables = await resolveOwnerTables(client);
  const conversation = await ensureOwnerConversation(client, tables);
  return {
    tables,
    conversation,
  };
}

function getErrorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('missing bearer token') || message.includes('invalid or expired')) {
    return 401;
  }
  if (message.includes('privileged ivx access is required')) {
    return 403;
  }
  if (
    message.includes('is missing')
    || message.includes('not configured')
    || message.includes('does not exist')
    || message.includes('schema cache')
    || message.includes('invalid schema')
  ) {
    return 503;
  }
  return 500;
}

function errorPayload(error: unknown): { error: string; detail: string; deploymentMarker: string } {
  const message = error instanceof Error ? error.message : 'Unknown owner route error.';
  return {
    error: message,
    detail: message,
    deploymentMarker: DEPLOYMENT_MARKER,
  };
}

export async function handleRoomsGet(request: Request): Promise<Response> {
  try {
    const ctx = await assertIVXOwnerOnly(request);
    const { tables, conversation } = await getOwnerRoomContext(ctx.client);
    return ownerOnlyJson({
      rooms: [conversation],
      ownerUserId: ctx.userId,
      ownerEmail: ctx.email,
      storage: {
        schema: tables.schema,
        dbSchema: tables.dbSchema,
        messageConversationField: tables.messageConversationField,
      },
      deploymentMarker: DEPLOYMENT_MARKER,
    });
  } catch (error) {
    return ownerOnlyJson(errorPayload(error), getErrorStatus(error));
  }
}

export async function handleRoomsPost(request: Request): Promise<Response> {
  try {
    const ctx = await assertIVXOwnerOnly(request);
    const { tables, conversation } = await getOwnerRoomContext(ctx.client);
    return ownerOnlyJson({
      room: conversation,
      storage: {
        schema: tables.schema,
        dbSchema: tables.dbSchema,
        messageConversationField: tables.messageConversationField,
      },
      deploymentMarker: DEPLOYMENT_MARKER,
    });
  } catch (error) {
    return ownerOnlyJson(errorPayload(error), getErrorStatus(error));
  }
}

export async function handleMessagesGet(request: Request): Promise<Response> {
  try {
    const ctx = await assertIVXOwnerOnly(request);
    const url = new URL(request.url);
    const limitRaw = Number(url.searchParams.get('limit') ?? '100');
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
    const conversationIdParam = readTrimmed(url.searchParams.get('conversationId'));
    const { tables, conversation } = await getOwnerRoomContext(ctx.client);
    const conversationId = conversationIdParam || conversation.id;
    const rows = await loadRecentMessages(ctx.client, tables, conversationId);
    const messages = rows.slice(-limit).map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      senderUserId: null,
      senderRole: row.sender_role,
      senderLabel: row.sender_label ?? null,
      body: row.body ?? null,
      attachmentUrl: null,
      attachmentName: null,
      attachmentMime: null,
      attachmentSize: null,
      attachmentKind: 'text' as const,
      createdAt: row.created_at,
      updatedAt: row.created_at,
    }));

    return ownerOnlyJson({
      conversationId,
      messages,
      storage: {
        schema: tables.schema,
        dbSchema: tables.dbSchema,
        messageConversationField: tables.messageConversationField,
      },
      deploymentMarker: DEPLOYMENT_MARKER,
    });
  } catch (error) {
    return ownerOnlyJson(errorPayload(error), getErrorStatus(error));
  }
}

export async function handleMessagesPost(request: Request): Promise<Response> {
  try {
    const ctx = await assertIVXOwnerOnly(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const text = readTrimmed(body.body ?? body.text ?? body.message);
    const senderRole = body.senderRole === 'assistant' || body.senderRole === 'system' ? body.senderRole : 'owner';
    const senderLabel = readTrimmed(body.senderLabel) || ctx.email || 'IVX Owner';
    const { tables, conversation } = await getOwnerRoomContext(ctx.client);
    const conversationId = readTrimmed(body.conversationId) || conversation.id;
    const attachmentUrl = readTrimmed(body.attachmentUrl) || null;
    const attachmentName = readTrimmed(body.attachmentName) || null;
    const attachmentMime = readTrimmed(body.attachmentMime) || null;
    const attachmentSize = typeof body.attachmentSize === 'number' ? body.attachmentSize : null;
    const attachmentKind = readTrimmed(body.attachmentKind) || 'text';

    if (!text && !attachmentUrl) {
      return ownerOnlyJson({ error: 'Message body or attachment is required.' }, 400);
    }

    const persistedBody = text || attachmentName || 'Attachment';
    const row = await insertMessage(ctx.client, tables, {
      conversationId,
      senderRole,
      senderUserId: senderRole === 'owner' ? ctx.userId : null,
      senderLabel,
      body: persistedBody,
    });

    return ownerOnlyJson({
      message: {
        id: row.id,
        conversationId: row.conversation_id,
        senderRole: row.sender_role,
        senderLabel: row.sender_label,
        body: text || row.body,
        attachmentUrl,
        attachmentName,
        attachmentMime,
        attachmentSize,
        attachmentKind,
        createdAt: row.created_at,
        updatedAt: row.created_at,
      },
      storage: {
        schema: tables.schema,
        dbSchema: tables.dbSchema,
        messageConversationField: tables.messageConversationField,
      },
      deploymentMarker: DEPLOYMENT_MARKER,
    });
  } catch (error) {
    return ownerOnlyJson(errorPayload(error), getErrorStatus(error));
  }
}

export async function handleUploadPost(request: Request): Promise<Response> {
  try {
    const ctx = await assertIVXOwnerOnly(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const fileName = readTrimmed(body.fileName) || `owner-upload-${Date.now()}`;
    const mimeType = readTrimmed(body.mimeType) || null;
    const { conversation } = await getOwnerRoomContext(ctx.client);
    const conversationId = readTrimmed(body.conversationId) || conversation.id;
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-');
    const storagePath = `owner-room/${conversationId}/${Date.now()}-${safeName}`;
    const signed = await ctx.client.storage.from(IVX_OWNER_AI_BUCKET).createSignedUploadUrl(storagePath);
    if (signed.error || !signed.data) {
      throw new Error(signed.error?.message ?? 'Failed to create signed upload URL.');
    }

    const readUrl = await ctx.client.storage.from(IVX_OWNER_AI_BUCKET).createSignedUrl(storagePath, 60 * 60);

    return ownerOnlyJson({
      bucket: IVX_OWNER_AI_BUCKET,
      path: storagePath,
      signedUploadUrl: signed.data.signedUrl,
      token: signed.data.token,
      readUrl: readUrl.data?.signedUrl ?? null,
      mimeType,
      fileName: safeName,
      deploymentMarker: DEPLOYMENT_MARKER,
    });
  } catch (error) {
    return ownerOnlyJson(errorPayload(error), getErrorStatus(error));
  }
}

export async function handleInboxSync(request: Request): Promise<Response> {
  try {
    const ctx = await assertIVXOwnerOnly(request);
    const { tables, conversation } = await getOwnerRoomContext(ctx.client);
    await safeEnsureInboxState(ctx.client, tables, conversation.id, ctx.userId);

    return ownerOnlyJson({
      inbox: [{
        conversationId: conversation.id,
        slug: conversation.slug,
        title: conversation.title,
        subtitle: conversation.subtitle,
        unreadCount: 0,
        lastReadAt: nowIso(),
        lastMessageText: conversation.lastMessageText,
        lastMessageAt: conversation.lastMessageAt,
      }],
      storage: {
        schema: tables.schema,
        dbSchema: tables.dbSchema,
        messageConversationField: tables.messageConversationField,
      },
      syncedAt: nowIso(),
      deploymentMarker: DEPLOYMENT_MARKER,
    });
  } catch (error) {
    return ownerOnlyJson(errorPayload(error), getErrorStatus(error));
  }
}

export async function handleDiagnosticsGet(request: Request): Promise<Response> {
  const envAudit = {
    hasSupabaseUrl: readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL).length > 0,
    hasAnonKey: readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY).length > 0,
    hasServiceRoleKey: readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY).length > 0,
    hasIVXAIGatewayUrl: readTrimmed(process.env.EXPO_PUBLIC_IVX_AI_GATEWAY_URL).length > 0 || readTrimmed(process.env.IVX_AI_GATEWAY_URL).length > 0,
    hasApiBaseUrl: readTrimmed(process.env.EXPO_PUBLIC_API_BASE_URL).length > 0,
  };

  const routesAvailable = [
    'GET /health',
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
  ];

  let ownerAuth: Record<string, unknown> = { authenticated: false };
  let supabaseReachable = false;
  let supabaseTablesHealthy = false;
  let supabaseDetail: string | null = null;
  let storageAudit: Record<string, unknown> | null = null;

  try {
    const ctx = await assertIVXOwnerOnly(request);
    ownerAuth = {
      authenticated: true,
      userId: ctx.userId,
      email: ctx.email,
      role: ctx.role,
      guardMode: ctx.guardMode,
    };

    const { tables, conversation } = await getOwnerRoomContext(ctx.client);
    supabaseReachable = true;
    supabaseTablesHealthy = Boolean(conversation.id);
    supabaseDetail = `schema=${tables.schema}; dbSchema=${tables.dbSchema}; messagesField=${tables.messageConversationField}`;
    storageAudit = {
      schema: tables.schema,
      dbSchema: tables.dbSchema,
      conversationsTable: tables.conversations,
      messagesTable: tables.messages,
      inboxStateTable: tables.inboxState,
      aiRequestsTable: tables.aiRequests,
      messageConversationField: tables.messageConversationField,
    };
  } catch (error) {
    ownerAuth = {
      authenticated: false,
      reason: error instanceof Error ? error.message : 'Owner guard failed.',
    };
    supabaseDetail = error instanceof Error ? error.message : 'Supabase probe failed.';
  }

  return ownerOnlyJson({
    ok: true,
    service: 'ivx-owner-ai-backend',
    deploymentMarker: DEPLOYMENT_MARKER,
    timestamp: nowIso(),
    env: envAudit,
    routesAvailable,
    ownerAuth,
    supabase: {
      reachable: supabaseReachable,
      tablesHealthy: supabaseTablesHealthy,
      detail: supabaseDetail,
      storageAudit,
    },
  });
}

export async function handleChatPost(request: Request): Promise<Response> {
  return await handleIVXOwnerAIRequest(request);
}

export async function handleFallbackReply(request: Request): Promise<Response> {
  try {
    await request.json().catch(() => ({}));
    console.log('[IVXOwnerRoutes] fallback/reply rejected. Owner AI requires primary owner-session path.');
    return ownerOnlyJson({
      error: IVX_SERVICE_UNAVAILABLE_MESSAGE,
      status: 'unavailable',
      source: 'remote_api',
      deploymentMarker: DEPLOYMENT_MARKER,
    }, 503);
  } catch (error) {
    return ownerOnlyJson(errorPayload(error), getErrorStatus(error));
  }
}

export function ownerRoutesOptions(): Response {
  return ownerOnlyOptions();
}
