import type { SupabaseClient } from '@supabase/supabase-js';
import { IVX_OWNER_AI_PROFILE, IVX_OWNER_AI_ROOM_ID, IVX_OWNER_AI_ROOM_SLUG } from '../../expo/constants/ivx-owner-ai';
import {
  IVX_OWNER_AI_TABLES,
  type IVXConversation,
  type IVXOwnerAIHealthProbeResponse,
  type IVXOwnerAIRequest,
  type IVXOwnerAIResponse,
} from '../../expo/shared/ivx';
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';

const DEPLOYMENT_MARKER = 'ivx-owner-ai-hono-2026-04-13t0015z';

type IVXConversationRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  created_at: string;
  updated_at: string;
  last_message_text: string | null;
  last_message_at: string | null;
};

type IVXMessageRow = {
  id: string;
  conversation_id: string;
  sender_role: 'owner' | 'assistant' | 'system';
  sender_label: string | null;
  body: string | null;
  created_at: string;
};

type IVXAIRequestRow = {
  id: string;
  request_id: string | null;
  conversation_id: string;
  user_id: string;
  prompt: string;
  response_text: string | null;
  response_message_id: string | null;
  status: 'pending' | 'completed' | 'failed';
  model: string;
  created_at: string;
  updated_at: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `ivx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapConversation(row: IVXConversationRow): IVXConversation {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageText: row.last_message_text,
    lastMessageAt: row.last_message_at,
  };
}

function sortConversationRows(rows: IVXConversationRow[]): IVXConversationRow[] {
  return [...rows].sort((left, right) => {
    if (left.id === IVX_OWNER_AI_ROOM_ID) {
      return -1;
    }
    if (right.id === IVX_OWNER_AI_ROOM_ID) {
      return 1;
    }

    const leftUpdatedAt = new Date(left.updated_at || left.created_at || 0).getTime();
    const rightUpdatedAt = new Date(right.updated_at || right.created_at || 0).getTime();
    return rightUpdatedAt - leftUpdatedAt;
  });
}

async function findExistingOwnerConversation(client: SupabaseClient): Promise<IVXConversationRow | null> {
  const conversationResult = await client
    .from(IVX_OWNER_AI_TABLES.conversations)
    .select('*')
    .eq('slug', IVX_OWNER_AI_ROOM_SLUG)
    .limit(5);

  if (conversationResult.error) {
    throw new Error(conversationResult.error.message);
  }

  const conversationRows = (conversationResult.data as IVXConversationRow[] | null) ?? [];
  if (conversationRows.length === 0) {
    return null;
  }

  const [selectedConversation, ...duplicateRows] = sortConversationRows(conversationRows);
  if (duplicateRows.length > 0) {
    console.log('[IVXOwnerAIBackend] Duplicate owner conversations detected for slug:', IVX_OWNER_AI_ROOM_SLUG, 'selected:', selectedConversation.id, 'duplicates:', duplicateRows.map((row) => row.id));
  }

  return selectedConversation;
}

function getConversationPreview(value: string): string {
  return value.length <= 120 ? value : `${value.slice(0, 117)}...`;
}

async function ensureOwnerConversation(client: SupabaseClient): Promise<IVXConversation> {
  const existingConversation = await findExistingOwnerConversation(client);
  if (existingConversation) {
    return mapConversation(existingConversation);
  }

  const insertResult = await client.from(IVX_OWNER_AI_TABLES.conversations).insert({
    id: IVX_OWNER_AI_ROOM_ID,
    slug: IVX_OWNER_AI_ROOM_SLUG,
    title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
    subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
    created_at: nowIso(),
    updated_at: nowIso(),
    last_message_text: null,
    last_message_at: null,
  }).select('*').single();

  if (insertResult.error) {
    console.log('[IVXOwnerAIBackend] Owner conversation insert failed, retrying lookup:', insertResult.error.message);
    const fallbackConversation = await findExistingOwnerConversation(client);
    if (fallbackConversation) {
      return mapConversation(fallbackConversation);
    }
    throw new Error(insertResult.error.message);
  }

  return mapConversation(insertResult.data as IVXConversationRow);
}

async function loadRecentMessages(client: SupabaseClient, conversationId: string): Promise<IVXMessageRow[]> {
  const messageResult = await client.from(IVX_OWNER_AI_TABLES.messages).select('id, conversation_id, sender_role, sender_label, body, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(12);

  if (messageResult.error) {
    throw new Error(messageResult.error.message);
  }

  return [...(messageResult.data as IVXMessageRow[] ?? [])].reverse();
}

async function insertMessage(client: SupabaseClient, input: {
  conversationId: string;
  senderRole: 'owner' | 'assistant' | 'system';
  senderLabel: string | null;
  body: string;
}): Promise<IVXMessageRow> {
  const insertResult = await client.from(IVX_OWNER_AI_TABLES.messages).insert({
    conversation_id: input.conversationId,
    sender_role: input.senderRole,
    sender_label: input.senderLabel,
    body: input.body,
    attachment_kind: input.senderRole === 'assistant' ? 'command' : 'text',
    created_at: nowIso(),
    updated_at: nowIso(),
  }).select('id, conversation_id, sender_role, sender_label, body, created_at').single();

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
  }

  return insertResult.data as IVXMessageRow;
}

async function updateConversationSummary(client: SupabaseClient, conversationId: string, preview: string): Promise<void> {
  const updateResult = await client.from(IVX_OWNER_AI_TABLES.conversations).update({
    updated_at: nowIso(),
    last_message_text: getConversationPreview(preview),
    last_message_at: nowIso(),
  }).eq('id', conversationId);

  if (updateResult.error) {
    throw new Error(updateResult.error.message);
  }
}

async function ensureInboxState(client: SupabaseClient, conversationId: string, userId: string): Promise<void> {
  const upsertResult = await client.from(IVX_OWNER_AI_TABLES.inboxState).upsert({
    conversation_id: conversationId,
    user_id: userId,
    unread_count: 0,
    last_read_at: nowIso(),
    updated_at: nowIso(),
  }, {
    onConflict: 'conversation_id,user_id',
  });

  if (upsertResult.error) {
    throw new Error(upsertResult.error.message);
  }
}

async function findAIRequestByRequestId(client: SupabaseClient, requestId: string): Promise<IVXAIRequestRow | null> {
  const lookupResult = await client
    .from(IVX_OWNER_AI_TABLES.aiRequests)
    .select('id, request_id, conversation_id, user_id, prompt, response_text, response_message_id, status, model, created_at, updated_at')
    .eq('request_id', requestId)
    .limit(1)
    .maybeSingle();

  if (lookupResult.error) {
    throw new Error(lookupResult.error.message);
  }

  return (lookupResult.data as IVXAIRequestRow | null) ?? null;
}

async function upsertAIRequest(client: SupabaseClient, input: {
  requestId: string;
  conversationId: string;
  userId: string;
  prompt: string;
  responseText: string | null;
  responseMessageId: string | null;
  status: 'pending' | 'completed' | 'failed';
  model: string;
}): Promise<IVXAIRequestRow> {
  const upsertResult = await client.from(IVX_OWNER_AI_TABLES.aiRequests).upsert({
    request_id: input.requestId,
    conversation_id: input.conversationId,
    user_id: input.userId,
    prompt: input.prompt,
    response_text: input.responseText,
    response_message_id: input.responseMessageId,
    status: input.status,
    model: input.model,
    updated_at: nowIso(),
  }, {
    onConflict: 'request_id',
  }).select('id, request_id, conversation_id, user_id, prompt, response_text, response_message_id, status, model, created_at, updated_at').single();

  if (upsertResult.error) {
    throw new Error(upsertResult.error.message);
  }

  return upsertResult.data as IVXAIRequestRow;
}

function buildPromptText(input: {
  prompt: string;
  email: string | null;
  conversation: IVXConversation;
  recentMessages: IVXMessageRow[];
  mode: 'chat' | 'command';
  devTestModeActive: boolean;
}): string {
  const transcript = input.recentMessages.map((message) => {
    const label = message.sender_label ?? message.sender_role;
    const body = message.body ?? '';
    return `${label}: ${body}`;
  }).join('\n');

  const coreInstruction = input.devTestModeActive
    ? 'Execute owner commands directly. Respond with concise status updates only. Do not provide checklists, deployment guidance, instructional templates, or post-confirmation coaching unless the owner explicitly asks.'
    : 'Respond with concise owner-first guidance for IVX operations, chat, inbox, uploads, knowledge base, and owner commands.';

  return [
    `You are ${IVX_OWNER_AI_PROFILE.name}.`,
    coreInstruction,
    `Mode: ${input.mode}`,
    `Conversation: ${input.conversation.title}`,
    `Owner email: ${input.email ?? 'unknown'}`,
    transcript.length > 0 ? `Recent messages:\n${transcript}` : 'Recent messages: none',
    `Owner request: ${input.prompt}`,
  ].join('\n\n');
}

async function generateOwnerAIAnswer(promptText: string): Promise<string> {
  const toolkitBaseUrl = readTrimmedString(process.env.EXPO_PUBLIC_TOOLKIT_URL);
  if (!toolkitBaseUrl) {
    throw new Error('EXPO_PUBLIC_TOOLKIT_URL is not configured.');
  }

  const toolkitUrl = new URL('/agent/chat', toolkitBaseUrl).toString();
  const response = await fetch(toolkitUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: promptText,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown toolkit error');
    throw new Error(`Toolkit request failed (${response.status}): ${errorText.slice(0, 240)}`);
  }

  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  const text = typeof data?.text === 'string'
    ? data.text.trim()
    : Array.isArray(data?.messages)
      ? ((data?.messages as Array<Record<string, unknown>>).at(-1)?.content as string | undefined)?.trim() ?? ''
      : '';

  if (!text) {
    throw new Error('Toolkit returned an empty AI response.');
  }

  return text;
}

function isMissingRelationFailure(message: string): boolean {
  const normalizedMessage = message.toLowerCase();
  return (
    (normalizedMessage.includes('relation') && normalizedMessage.includes('does not exist'))
    || normalizedMessage.includes('could not find the table')
    || normalizedMessage.includes('schema cache')
  );
}

function getServerConfigAudit(): {
  hasSupabaseUrl: boolean;
  hasServiceRoleKey: boolean;
  hasAnonKey: boolean;
  hasToolkitUrl: boolean;
} {
  return {
    hasSupabaseUrl: readTrimmedString(process.env.EXPO_PUBLIC_SUPABASE_URL).length > 0,
    hasServiceRoleKey: readTrimmedString(process.env.SUPABASE_SERVICE_ROLE_KEY).length > 0,
    hasAnonKey: readTrimmedString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY).length > 0,
    hasToolkitUrl: readTrimmedString(process.env.EXPO_PUBLIC_TOOLKIT_URL).length > 0,
  };
}

async function safeEnsureInboxState(client: SupabaseClient, conversationId: string, userId: string): Promise<void> {
  try {
    await ensureInboxState(client, conversationId, userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown inbox state error';
    console.log('[IVXOwnerAIBackend] Inbox state unavailable, continuing without startup block:', {
      conversationId,
      userId,
      message,
      missingRelation: isMissingRelationFailure(message),
    });
  }
}

async function safeFindAIRequestByRequestId(client: SupabaseClient, requestId: string): Promise<IVXAIRequestRow | null> {
  try {
    return await findAIRequestByRequestId(client, requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown ai request lookup error';
    console.log('[IVXOwnerAIBackend] AI request lookup unavailable, continuing without idempotency cache:', {
      requestId,
      message,
      missingRelation: isMissingRelationFailure(message),
    });
    return null;
  }
}

async function safeUpsertAIRequest(client: SupabaseClient, input: {
  requestId: string;
  conversationId: string;
  userId: string;
  prompt: string;
  responseText: string | null;
  responseMessageId: string | null;
  status: 'pending' | 'completed' | 'failed';
  model: string;
}): Promise<void> {
  try {
    await upsertAIRequest(client, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown ai request upsert error';
    console.log('[IVXOwnerAIBackend] AI request log unavailable, continuing without blocking owner room:', {
      requestId: input.requestId,
      conversationId: input.conversationId,
      status: input.status,
      message,
      missingRelation: isMissingRelationFailure(message),
    });
  }
}

async function safeLoadRecentMessages(client: SupabaseClient, conversationId: string): Promise<IVXMessageRow[]> {
  try {
    return await loadRecentMessages(client, conversationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown recent message error';
    console.log('[IVXOwnerAIBackend] Recent message lookup unavailable, continuing with empty transcript:', {
      conversationId,
      message,
      missingRelation: isMissingRelationFailure(message),
    });
    return [];
  }
}

async function safeUpdateConversationSummary(client: SupabaseClient, conversationId: string, preview: string): Promise<void> {
  try {
    await updateConversationSummary(client, conversationId, preview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown conversation summary error';
    console.log('[IVXOwnerAIBackend] Conversation summary update unavailable, continuing without blocking reply:', {
      conversationId,
      message,
      missingRelation: isMissingRelationFailure(message),
    });
  }
}

function getErrorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('authorization') || message.includes('owner access') || message.includes('invalid owner session')) {
    return 401;
  }
  if (message.includes('privileged ivx access is required')) {
    return 403;
  }
  if (message.includes('configured') || message.includes('environment variables are missing') || message.includes('not configured')) {
    return 503;
  }
  if (isMissingRelationFailure(message)) {
    return 503;
  }
  return 500;
}

function isHealthProbe(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  return normalized === 'health_probe' || normalized === 'ping' || normalized === 'health_check';
}

export function GET(): Response {
  return ownerOnlyJson({
    ok: true,
    route: '/api/ivx/owner-ai',
    status: 'ready',
    deploymentMarker: DEPLOYMENT_MARKER,
    methods: ['GET', 'HEAD', 'POST', 'OPTIONS'],
    probeInstructions: {
      type: 'authenticated_post',
      message: 'health_probe',
    },
    timestamp: nowIso(),
  });
}

export function OPTIONS(): Response {
  return ownerOnlyOptions();
}

export async function handleIVXOwnerAIRequest(request: Request): Promise<Response> {
  try {
    const body = await request.json() as IVXOwnerAIRequest;
    const prompt = readTrimmedString(body.message);
    const mode = body.mode === 'command' ? 'command' : 'chat';
    const persistUserMessage = body.persistUserMessage === true;
    const persistAssistantMessage = body.persistAssistantMessage === true;
    const model = readTrimmedString(process.env.IVX_OWNER_AI_MODEL) || 'gpt-4.1-mini';

    if (!prompt) {
      return ownerOnlyJson({ error: 'Message is required.' }, 400);
    }

    if (isHealthProbe(prompt)) {
      try {
        const ownerContext = await assertIVXOwnerOnly(request);
        const conversation = await ensureOwnerConversation(ownerContext.client);
        const requestId = readTrimmedString(body.requestId) || createRequestId();
        await safeEnsureInboxState(ownerContext.client, conversation.id, ownerContext.userId);
        const probePayload: IVXOwnerAIHealthProbeResponse = {
          requestId,
          conversationId: conversation.id,
          answer: 'IVX Owner AI is active and ready.',
          model,
          status: 'ok',
          deploymentMarker: DEPLOYMENT_MARKER,
          probe: true,
          resolvedSchema: 'ivx',
          roomStatus: {
            storageMode: 'primary_supabase_tables',
            visibility: 'shared',
            deliveryMethod: 'primary_realtime',
          },
          capabilities: {
            ai_chat: true,
            knowledge_answers: true,
            owner_commands: true,
            code_aware_support: true,
            file_upload: true,
            inbox_sync: true,
          },
        };

        return ownerOnlyJson(probePayload as unknown as Record<string, unknown>);
      } catch (error) {
        const status = getErrorStatus(error);
        const message = error instanceof Error ? error.message : 'Health probe auth failed.';
        console.log('[IVXOwnerAIBackend] Health probe auth/startup failed:', {
          status,
          message,
          route: '/api/ivx/owner-ai',
        });
        return ownerOnlyJson({
          error: 'Health probe auth failed.',
          detail: message,
          blocker: message.toLowerCase().includes('privileged ivx access is required') ? 'owner_role_guard' : 'owner_only_guard',
          route: '/api/ivx/owner-ai',
          deploymentMarker: DEPLOYMENT_MARKER,
          requiredTables: IVX_OWNER_AI_TABLES,
          serverConfig: getServerConfigAudit(),
        }, status);
      }
    }

    const ownerContext = await assertIVXOwnerOnly(request);
    const senderLabel = readTrimmedString(body.senderLabel) || ownerContext.email || 'IVX Owner';
    const conversation = await ensureOwnerConversation(ownerContext.client);
    const requestId = readTrimmedString(body.requestId) || createRequestId();

    await safeEnsureInboxState(ownerContext.client, conversation.id, ownerContext.userId);

    const existingAIRequest = await safeFindAIRequestByRequestId(ownerContext.client, requestId);
    if (existingAIRequest?.status === 'completed' && existingAIRequest.response_text?.trim()) {
      console.log('[IVXOwnerAIBackend] Idempotent replay hit existing completed request:', {
        requestId,
        conversationId: existingAIRequest.conversation_id,
        responseMessageId: existingAIRequest.response_message_id,
      });
      return ownerOnlyJson({
        requestId,
        conversationId: existingAIRequest.conversation_id,
        answer: existingAIRequest.response_text.trim(),
        model: existingAIRequest.model,
        status: 'ok',
        deploymentMarker: DEPLOYMENT_MARKER,
      } satisfies IVXOwnerAIResponse);
    }

    await safeUpsertAIRequest(ownerContext.client, {
      requestId,
      conversationId: conversation.id,
      userId: ownerContext.userId,
      prompt,
      responseText: existingAIRequest?.response_text ?? null,
      responseMessageId: existingAIRequest?.response_message_id ?? null,
      status: existingAIRequest?.status === 'completed' ? 'completed' : 'pending',
      model,
    });
    console.log('[IVXOwnerAIBackend] AI request reserved:', {
      requestId,
      conversationId: conversation.id,
      alreadyExisted: !!existingAIRequest,
      existingStatus: existingAIRequest?.status ?? null,
    });

    if (persistUserMessage) {
      const ownerMessage = await insertMessage(ownerContext.client, {
        conversationId: conversation.id,
        senderRole: 'owner',
        senderLabel,
        body: prompt,
      });
      console.log('[IVXOwnerAIBackend] Owner prompt persisted:', {
        requestId,
        messageId: ownerMessage.id,
        conversationId: ownerMessage.conversation_id,
      });
    }

    const recentMessages = await safeLoadRecentMessages(ownerContext.client, conversation.id);
    const promptText = buildPromptText({
      prompt,
      email: ownerContext.email,
      conversation,
      recentMessages,
      mode,
      devTestModeActive: body.devTestModeActive === true,
    });
    const answer = (await generateOwnerAIAnswer(promptText)).trim();

    let assistantMessageId: string | null = existingAIRequest?.response_message_id ?? null;
    if (persistAssistantMessage && !assistantMessageId) {
      try {
        const assistantMessage = await insertMessage(ownerContext.client, {
          conversationId: conversation.id,
          senderRole: 'assistant',
          senderLabel: IVX_OWNER_AI_PROFILE.name,
          body: answer,
        });
        assistantMessageId = assistantMessage.id;
        console.log('[IVXOwnerAIBackend] Assistant reply persisted:', {
          requestId,
          messageId: assistantMessage.id,
          conversationId: assistantMessage.conversation_id,
        });
      } catch (error) {
        console.log('[IVXOwnerAIBackend] Assistant reply persistence failed, returning AI answer without blocking the room:', error instanceof Error ? error.message : 'unknown');
      }

      await safeUpdateConversationSummary(ownerContext.client, conversation.id, answer);
      await safeEnsureInboxState(ownerContext.client, conversation.id, ownerContext.userId);
    } else if (persistAssistantMessage && assistantMessageId) {
      console.log('[IVXOwnerAIBackend] Assistant reply persistence skipped due to idempotency:', {
        requestId,
        responseMessageId: assistantMessageId,
        conversationId: conversation.id,
      });
    }
    await safeUpsertAIRequest(ownerContext.client, {
      requestId,
      conversationId: conversation.id,
      userId: ownerContext.userId,
      prompt,
      responseText: answer,
      responseMessageId: assistantMessageId,
      status: 'completed',
      model,
    });
    console.log('[IVXOwnerAIBackend] AI request completed:', {
      requestId,
      conversationId: conversation.id,
      responseMessageId: assistantMessageId,
      model,
    });

    const responsePayload: IVXOwnerAIResponse = {
      requestId,
      conversationId: conversation.id,
      answer,
      model,
      status: 'ok',
      deploymentMarker: DEPLOYMENT_MARKER,
    };

    return ownerOnlyJson(responsePayload);
  } catch (error) {
    const status = getErrorStatus(error);
    const message = error instanceof Error ? error.message : 'Unable to process the IVX Owner AI request.';
    console.log('[IVXOwnerAIBackend] Request failed:', {
      status,
      message,
    });
    return ownerOnlyJson({ error: message }, status);
  }
}
