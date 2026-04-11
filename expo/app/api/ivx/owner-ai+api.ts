import { generateText as toolkitGenerateText } from '@rork-ai/toolkit-sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  IVX_OWNER_AI_PROFILE,
  IVX_OWNER_AI_ROOM_ID,
  IVX_OWNER_AI_ROOM_SLUG,
} from '@/constants/ivx-owner-ai';
import { IVX_OWNER_AI_TABLES, type IVXOwnerAIResponse } from '@/shared/ivx';

type IVXOwnerAIRequestBody = {
  conversationId?: string;
  message?: string;
  senderLabel?: string | null;
  mode?: string;
};

type ConversationResult = {
  id: string;
  title: string;
  subtitle: string | null;
};

type RecentMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_user_id: string | null;
  sender_label: string | null;
  text: string | null;
  body: string | null;
  created_at: string | null;
};

type AuthResult = {
  client: SupabaseClient;
  userId: string;
  email: string | null;
};

type ResolvedApiTables = {
  schema: 'ivx' | 'generic';
  conversations: string;
  messages: string;
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

let cachedApiTables: ResolvedApiTables | null = null;

function jsonResponse(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nowIso(): string {
  return new Date().toISOString();
}

function createRequestId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID();
  }
  return `ivx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return null;
  const trimmed = readTrimmed(token);
  return trimmed.length > 0 ? trimmed : null;
}

function getSupabaseConfig(): { url: string; key: string; isServiceRole: boolean } {
  const supabaseUrl = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const anonKey = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

  if (!supabaseUrl) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL is not configured.');
  }

  const hasRealServiceKey = !!serviceRoleKey && serviceRoleKey !== anonKey;
  const effectiveKey = hasRealServiceKey ? serviceRoleKey : anonKey;

  if (!effectiveKey) {
    throw new Error('No Supabase key available.');
  }

  if (!hasRealServiceKey) {
    console.log('[IVXOwnerAI-API] No separate service_role key. Using anon key + user JWT for auth.');
  }

  return { url: supabaseUrl, key: effectiveKey, isServiceRole: hasRealServiceKey };
}

function createAuthenticatedClient(userJwt: string): SupabaseClient {
  const config = getSupabaseConfig();

  if (config.isServiceRole) {
    return createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${userJwt}`,
      },
    },
  });
}

async function verifyAuth(request: Request): Promise<AuthResult> {
  const token = extractBearerToken(request);
  if (!token) {
    throw new Error('Authorization is required.');
  }

  const client = createAuthenticatedClient(token);
  const { data, error } = await client.auth.getUser(token);

  if (error || !data.user) {
    console.log('[IVXOwnerAI-API] Auth failed:', error?.message ?? 'no user');
    throw new Error('Invalid session.');
  }

  const user = data.user;
  console.log('[IVXOwnerAI-API] User authenticated:', user.id, user.email);

  return {
    client,
    userId: user.id,
    email: user.email || null,
  };
}

async function resolveApiTables(client: SupabaseClient): Promise<ResolvedApiTables> {
  if (cachedApiTables) {
    return cachedApiTables;
  }

  const { error: ivxErr } = await client.from(IVX_OWNER_AI_TABLES.conversations).select('id').limit(1);
  if (!ivxErr) {
    console.log('[IVXOwnerAI-API] Using ivx tables');
    cachedApiTables = { schema: 'ivx', conversations: IVX_OWNER_AI_TABLES.conversations, messages: IVX_OWNER_AI_TABLES.messages };
    return cachedApiTables;
  }

  const { error: genErr } = await client.from('conversations').select('id').limit(1);
  if (!genErr) {
    console.log('[IVXOwnerAI-API] Using generic tables (conversations/messages)');
    cachedApiTables = { schema: 'generic', conversations: 'conversations', messages: 'messages' };
    return cachedApiTables;
  }

  console.log('[IVXOwnerAI-API] No tables found, defaulting to generic');
  cachedApiTables = { schema: 'generic', conversations: 'conversations', messages: 'messages' };
  return cachedApiTables;
}

async function ensureConversation(client: SupabaseClient, tables: ResolvedApiTables): Promise<ConversationResult> {
  const lookupField = tables.schema === 'ivx' ? 'slug' : 'id';
  const lookupValue = tables.schema === 'ivx' ? IVX_OWNER_AI_ROOM_SLUG : IVX_OWNER_AI_ROOM_ID;

  const { data: existing, error: lookupError } = await client
    .from(tables.conversations)
    .select('id, title, subtitle')
    .eq(lookupField, lookupValue)
    .maybeSingle();

  if (lookupError) {
    console.log('[IVXOwnerAI-API] Conversation lookup error:', lookupError.message);
  }

  if (existing) {
    const row = existing as Record<string, unknown>;
    return {
      id: readTrimmed(row.id) || IVX_OWNER_AI_ROOM_ID,
      title: readTrimmed(row.title) || IVX_OWNER_AI_PROFILE.sharedRoom.title,
      subtitle: readTrimmed(row.subtitle) || null,
    };
  }

  console.log('[IVXOwnerAI-API] Owner conversation not found in', tables.conversations, ', creating...');

  const basePayload: Record<string, unknown> = {
    id: IVX_OWNER_AI_ROOM_ID,
    title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
    subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
    last_message_text: null,
    last_message_at: null,
  };

  if (tables.schema === 'ivx') {
    basePayload.slug = IVX_OWNER_AI_ROOM_SLUG;
    basePayload.created_at = nowIso();
    basePayload.updated_at = nowIso();
  }

  const { error: insertError } = await client
    .from(tables.conversations)
    .upsert(basePayload, { onConflict: 'id' });

  if (!insertError) {
    console.log('[IVXOwnerAI-API] Conversation created/upserted successfully in', tables.conversations);
    return {
      id: IVX_OWNER_AI_ROOM_ID,
      title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
      subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
    };
  }

  console.log('[IVXOwnerAI-API] Conversation upsert failed:', insertError.message);

  if (insertError.message?.includes('column') && insertError.message?.includes('does not exist')) {
    const { error: simpleErr } = await client
      .from(tables.conversations)
      .upsert({
        id: IVX_OWNER_AI_ROOM_ID,
        title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
        subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
      }, { onConflict: 'id' });

    if (!simpleErr) {
      console.log('[IVXOwnerAI-API] Conversation created with minimal payload');
      return {
        id: IVX_OWNER_AI_ROOM_ID,
        title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
        subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
      };
    }
  }

  console.log('[IVXOwnerAI-API] All upsert attempts failed, using fallback conversation');
  return {
    id: IVX_OWNER_AI_ROOM_ID,
    title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
    subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
  };
}

async function loadRecentMessages(client: SupabaseClient, tables: ResolvedApiTables, conversationId: string): Promise<RecentMessageRow[]> {
  const { data, error } = await client
    .from(tables.messages)
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(12);

  if (error) {
    console.log('[IVXOwnerAI-API] Recent messages load failed:', error.message);
    return [];
  }

  return [...((data ?? []) as RecentMessageRow[])].reverse();
}

async function insertMessage(client: SupabaseClient, tables: ResolvedApiTables, input: {
  conversationId: string;
  senderId: string;
  senderLabel: string | null;
  text: string;
  senderRole?: string;
}): Promise<void> {
  const payload: Record<string, unknown> = {
    conversation_id: input.conversationId,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  if (tables.schema === 'ivx') {
    payload.sender_user_id = input.senderId;
    payload.sender_role = input.senderRole ?? 'owner';
    payload.sender_label = input.senderLabel;
    payload.body = input.text;
    payload.attachment_kind = 'text';
  } else {
    payload.sender_id = input.senderId;
    payload.sender_label = input.senderLabel;
    payload.text = input.text;
    payload.body = input.text;
  }

  const { error } = await client.from(tables.messages).insert(payload);
  if (!error) {
    console.log('[IVXOwnerAI-API] Message inserted successfully into', tables.messages);
    return;
  }

  console.log('[IVXOwnerAI-API] Message insert failed:', error.message);

  if (error.message?.includes('column') && error.message?.includes('does not exist')) {
    const fallbackPayload: Record<string, unknown> = {
      conversation_id: input.conversationId,
      sender_id: input.senderId,
      sender_label: input.senderLabel,
      text: input.text,
    };
    const { error: fallbackErr } = await client.from(tables.messages).insert(fallbackPayload);
    if (!fallbackErr) {
      console.log('[IVXOwnerAI-API] Message inserted with fallback payload');
      return;
    }
    console.log('[IVXOwnerAI-API] Fallback insert also failed:', fallbackErr.message);
  }

  if (error.message?.includes('foreign key')) {
    console.log('[IVXOwnerAI-API] Foreign key error - conversation may not exist in DB yet');
    return;
  }

  throw new Error(error.message);
}

async function updateConversationSummary(client: SupabaseClient, tables: ResolvedApiTables, conversationId: string, preview: string): Promise<void> {
  const trimmedPreview = preview.length <= 120 ? preview : `${preview.slice(0, 117)}...`;
  const { error } = await client.from(tables.conversations).update({
    last_message_text: trimmedPreview,
    last_message_at: nowIso(),
  }).eq('id', conversationId);

  if (error) {
    console.log('[IVXOwnerAI-API] Conversation summary update non-blocking error:', error.message);
  }
}

function buildPrompt(input: {
  prompt: string;
  email: string | null;
  conversation: ConversationResult;
  recentMessages: RecentMessageRow[];
  mode: string;
}): string {
  const transcript = input.recentMessages.map((m) => {
    const label = m.sender_label ?? m.sender_user_id ?? m.sender_id ?? 'unknown';
    const text = m.body ?? m.text ?? '';
    return `${label}: ${text}`;
  }).join('\n');

  return [
    `You are ${IVX_OWNER_AI_PROFILE.name}.`,
    'Respond with concise owner-first guidance for IVX operations, chat, inbox, uploads, knowledge base, and owner commands.',
    `Mode: ${input.mode}`,
    `Conversation: ${input.conversation.title}`,
    `User email: ${input.email ?? 'unknown'}`,
    transcript.length > 0 ? `Recent messages:\n${transcript}` : 'Recent messages: none',
    `User request: ${input.prompt}`,
  ].join('\n\n');
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

function isHealthProbe(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  return normalized === 'health_probe' || normalized === 'ping' || normalized === 'health_check';
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as IVXOwnerAIRequestBody;
    const prompt = readTrimmed(body.message);
    const mode = body.mode === 'command' ? 'command' : 'chat';
    const senderLabel = readTrimmed(body.senderLabel) || null;
    const model = 'rork-toolkit';

    if (!prompt) {
      return jsonResponse({ error: 'Message is required.' }, 400);
    }

    console.log('[IVXOwnerAI-API] Incoming request:', { promptLength: prompt.length, mode, isProbe: isHealthProbe(prompt) });

    if (isHealthProbe(prompt)) {
      try {
        const token = extractBearerToken(request);
        if (!token) {
          return jsonResponse({ error: 'Authorization required for health probe.' }, 401);
        }

        const client = createAuthenticatedClient(token);
        const { data, error } = await client.auth.getUser(token);
        if (error || !data.user) {
          return jsonResponse({ error: 'Invalid session for health probe.' }, 401);
        }

        console.log('[IVXOwnerAI-API] Health probe passed for user:', data.user.id);
      } catch (authErr) {
        console.log('[IVXOwnerAI-API] Health probe auth error:', authErr instanceof Error ? authErr.message : 'unknown');
        return jsonResponse({ error: 'Health probe auth failed.' }, 401);
      }

      return jsonResponse({
        requestId: createRequestId(),
        conversationId: IVX_OWNER_AI_ROOM_ID,
        answer: 'IVX Owner AI is active and ready.',
        model,
        status: 'ok',
        probe: true,
        capabilities: {
          ai_chat: true,
          knowledge_answers: true,
          owner_commands: true,
          code_aware_support: true,
          file_upload: true,
          inbox_sync: true,
        },
      });
    }

    const auth = await verifyAuth(request);
    const tables = await resolveApiTables(auth.client);
    const conversation = await ensureConversation(auth.client, tables);
    const requestId = createRequestId();
    const effectiveSenderLabel = senderLabel || auth.email || 'IVX User';

    console.log('[IVXOwnerAI-API] User verified:', {
      userId: auth.userId,
      email: auth.email,
      conversationId: conversation.id,
      schema: tables.schema,
    });

    await insertMessage(auth.client, tables, {
      conversationId: conversation.id,
      senderId: auth.userId,
      senderLabel: effectiveSenderLabel,
      text: prompt,
      senderRole: 'owner',
    });

    const recentMessages = await loadRecentMessages(auth.client, tables, conversation.id);

    const promptText = buildPrompt({
      prompt,
      email: auth.email,
      conversation,
      recentMessages,
      mode,
    });

    console.log('[IVXOwnerAI-API] Generating AI response via toolkit');
    const answer = (await toolkitGenerateText({
      messages: [{ role: 'user', content: promptText }],
    })).trim();

    if (!answer) {
      throw new Error('AI provider returned an empty response.');
    }

    console.log('[IVXOwnerAI-API] AI response generated, length:', answer.length);

    await insertMessage(auth.client, tables, {
      conversationId: conversation.id,
      senderId: 'ivx-owner-ai-assistant',
      senderLabel: IVX_OWNER_AI_PROFILE.name,
      text: answer,
      senderRole: 'assistant',
    });

    await updateConversationSummary(auth.client, tables, conversation.id, answer);

    const responsePayload: IVXOwnerAIResponse = {
      requestId,
      conversationId: conversation.id,
      answer,
      model,
      status: 'ok',
    };

    return jsonResponse(responsePayload as unknown as Record<string, unknown>);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to process the IVX Owner AI request.';
    const status = message.includes('Authorization') || message.includes('Invalid session')
      ? 401
      : message.includes('configured')
        ? 503
        : 500;

    console.log('[IVXOwnerAI-API] Request failed:', message);
    return jsonResponse({ error: message }, status);
  }
}
