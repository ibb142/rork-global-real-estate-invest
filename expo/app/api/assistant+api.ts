import { generateText as toolkitGenerateText } from '@rork-ai/toolkit-sdk';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import {
  getChatConversationBootstrap,
  getChatConversationDisplayId,
  getChatConversationSubtitle,
  getChatConversationTitle,
  isUuidConversationId,
  resolveChatConversationId,
} from '@/src/modules/chat/services/chatRooms';
import {
  extractIVXRoleCandidate,
  isPrivilegedIVXRole,
  resolveIVXRoleContext,
} from '@/shared/ivx';

type AssistantRequestBody = {
  message?: unknown;
  prompt?: unknown;
  conversationId?: unknown;
  roomId?: unknown;
  roomSlug?: unknown;
  projectId?: unknown;
  model?: unknown;
  previousResponseId?: unknown;
  systemPrompt?: unknown;
  saveUserMessage?: unknown;
};

type ErrorLike = {
  code?: string | null;
  message?: string | null;
};

type ConversationRow = {
  id: string;
  slug?: string | null;
  title?: string | null;
  subtitle?: string | null;
  last_message_text?: string | null;
  last_message_at?: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  text?: string | null;
  body?: string | null;
  created_at: string;
};

type RoomRow = {
  id: string;
  slug?: string | null;
  title?: string | null;
  subtitle?: string | null;
};

type RoomMessageRow = {
  id: string;
  room_id: string;
  sender_id?: string | null;
  user_id?: string | null;
  text?: string | null;
  body?: string | null;
  created_at: string;
};

type ProjectDealRow = {
  id: string;
  title?: string | null;
  projectName?: string | null;
  propertyAddress?: string | null;
  expectedROI?: number | null;
  totalInvestment?: number | null;
  propertyValue?: number | null;
  status?: string | null;
  published?: boolean | null;
};

type NormalizedStoredMessage = {
  senderId: string;
  text: string;
  createdAt: string;
};

type ConversationContext = {
  storage: 'primary' | 'room';
  conversationId: string;
  storageId: string;
  title: string;
  subtitle: string | null;
  recentMessages: NormalizedStoredMessage[];
};

type ProjectContext = {
  projectId: string;
  teamId: string | null;
  workspaceLabel: string;
  selectedDeal: ProjectDealRow | null;
  featuredDeals: ProjectDealRow[];
};

type UserContext = {
  id: string;
  email: string | null;
  role: string | null;
  normalizedRole: 'owner' | 'developer' | 'admin' | 'investor';
};

type OpenAIResponsePayload = {
  id?: string;
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

type PersistenceResult = {
  saved: boolean;
  userMessageSaved: boolean;
  assistantMessageSaved: boolean;
  persistedAt: string;
  warning: string | null;
};

type AssistantGenerationResult = {
  provider: 'openai' | 'rork-toolkit';
  responseId: string | null;
  answer: string;
  usage: OpenAIResponsePayload['usage'] | null;
};

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

const DEFAULT_MODEL = 'gpt-4.1-mini';
const DEFAULT_ROOM_KEY = 'ivx-owner-room';
const ASSISTANT_SENDER_ID = `assistant:${(process.env.EXPO_PUBLIC_PROJECT_ID ?? 'workspace').trim() || 'workspace'}`;
const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const WORKSPACE_PROJECT_ID = (process.env.EXPO_PUBLIC_PROJECT_ID ?? '').trim();
const WORKSPACE_TEAM_ID = (process.env.EXPO_PUBLIC_TEAM_ID ?? '').trim();
const WORKSPACE_LABEL = 'IVX Workspace Assistant';

function jsonResponse(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

function readTrimmedString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function decodeBase64Url(value: string): string | null {
  if (!value) {
    return null;
  }

  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function extractJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  const payloadJson = decodeBase64Url(parts[1]);
  if (!payloadJson) {
    return null;
  }

  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const role = payload.role;
    return typeof role === 'string' && role.trim().length > 0 ? role.trim() : null;
  } catch {
    return null;
  }
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }

  return 'Unknown error';
}

function extractBearerToken(request: Request): string | null {
  const authorizationHeader = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') {
    return null;
  }

  return readTrimmedString(token);
}

function createSupabaseAdminClient(): SupabaseClient {
  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const serviceRoleClaim = extractJwtRole(serviceRoleKey);

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase server environment variables are missing.');
  }

  if (anonKey && serviceRoleKey === anonKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY matches the anon key.');
  }

  if (serviceRoleClaim && serviceRoleClaim !== 'service_role' && serviceRoleClaim !== 'supabase_admin') {
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY has invalid role claim: ${serviceRoleClaim}.`);
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isSchemaMissingError(error: ErrorLike | null | undefined): boolean {
  const code = (error?.code ?? '').toUpperCase();
  const message = (error?.message ?? '').toLowerCase();

  return code === 'PGRST204'
    || code === 'PGRST205'
    || code === '42P01'
    || message.includes('schema cache')
    || message.includes('could not find the table')
    || (message.includes('relation') && message.includes('does not exist'));
}

function isColumnMissingError(error: ErrorLike | null | undefined): boolean {
  const code = (error?.code ?? '').toUpperCase();
  const message = (error?.message ?? '').toLowerCase();

  return code === '42703' || (message.includes('column') && message.includes('does not exist'));
}

async function verifyUser(client: SupabaseClient, request: Request): Promise<User> {
  const token = extractBearerToken(request);
  if (!token) {
    throw new Error('Missing bearer token.');
  }

  console.log('[AssistantAPI] Verifying bearer token');
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    console.log('[AssistantAPI] Auth verification failed:', error?.message ?? 'No user returned');
    throw new Error('Unauthorized request.');
  }

  console.log('[AssistantAPI] Verified user:', data.user.id);
  return data.user;
}

async function upsertKnownConversation(client: SupabaseClient, requestedKey: string, userId: string): Promise<void> {
  const bootstrap = getChatConversationBootstrap(requestedKey);
  if (!bootstrap) {
    return;
  }

  console.log('[AssistantAPI] Bootstrapping known conversation:', bootstrap.conversationId);

  const basePayload: Record<string, unknown> = {
    id: bootstrap.conversationId,
    title: bootstrap.title,
    subtitle: bootstrap.subtitle,
  };

  let { error } = await client.from('conversations').upsert(basePayload, { onConflict: 'id' });

  if (error && (error.message ?? '').toLowerCase().includes('slug')) {
    const requestedSlug = getChatConversationDisplayId(requestedKey) || requestedKey;
    ({ error } = await client.from('conversations').upsert(
      {
        ...basePayload,
        slug: requestedSlug,
      },
      { onConflict: 'id' },
    ));
  }

  if (error && !isSchemaMissingError(error) && !isColumnMissingError(error)) {
    console.log('[AssistantAPI] Known conversation bootstrap warning:', error.message);
  }

  const { error: participantError } = await client.from('conversation_participants').upsert(
    {
      conversation_id: bootstrap.conversationId,
      user_id: userId,
      unread_count: 0,
      last_read_at: new Date().toISOString(),
    },
    {
      onConflict: 'conversation_id,user_id',
    },
  );

  if (participantError && !isSchemaMissingError(participantError) && !isColumnMissingError(participantError)) {
    console.log('[AssistantAPI] Participant bootstrap warning:', participantError.message);
  }
}

async function findPrimaryConversation(
  client: SupabaseClient,
  normalizedKey: string,
  requestedKey: string,
): Promise<ConversationRow | null> {
  const candidateKeys = Array.from(new Set([
    normalizedKey,
    requestedKey,
    getChatConversationDisplayId(requestedKey),
  ].filter((value): value is string => !!readTrimmedString(value))));

  for (const key of candidateKeys) {
    if (isUuidConversationId(key)) {
      const { data, error } = await client
        .from('conversations')
        .select('id,slug,title,subtitle,last_message_text,last_message_at')
        .eq('id', key)
        .maybeSingle();

      if (error) {
        if (isSchemaMissingError(error) || isColumnMissingError(error)) {
          return null;
        }
        console.log('[AssistantAPI] Primary conversation lookup warning:', error.message);
      }

      if (data) {
        return data as ConversationRow;
      }
    }

    const { data, error } = await client
      .from('conversations')
      .select('id,slug,title,subtitle,last_message_text,last_message_at')
      .eq('slug', key)
      .maybeSingle();

    if (error) {
      if (isSchemaMissingError(error) || isColumnMissingError(error)) {
        return null;
      }
      console.log('[AssistantAPI] Primary conversation slug lookup warning:', error.message);
    }

    if (data) {
      return data as ConversationRow;
    }
  }

  if (isUuidConversationId(normalizedKey)) {
    console.log('[AssistantAPI] Creating generic conversation shell for UUID room:', normalizedKey);
    const title = getChatConversationTitle(normalizedKey, 'Workspace Assistant') ?? 'Workspace Assistant';
    const subtitle = getChatConversationSubtitle(normalizedKey, 'Private AI workspace room') ?? 'Private AI workspace room';

    const basePayload: Record<string, unknown> = {
      id: normalizedKey,
      title,
      subtitle,
    };

    let { error } = await client.from('conversations').upsert(basePayload, { onConflict: 'id' });

    if (error && (error.message ?? '').toLowerCase().includes('slug')) {
      ({ error } = await client.from('conversations').upsert(
        {
          ...basePayload,
          slug: normalizedKey,
        },
        { onConflict: 'id' },
      ));
    }

    if (!error) {
      return {
        id: normalizedKey,
        title,
        subtitle,
        slug: normalizedKey,
      };
    }

    if (!isSchemaMissingError(error) && !isColumnMissingError(error)) {
      console.log('[AssistantAPI] Generic conversation bootstrap warning:', error.message);
    }
  }

  return null;
}

async function loadPrimaryMessages(client: SupabaseClient, conversationId: string): Promise<NormalizedStoredMessage[] | null> {
  const { data, error } = await client
    .from('messages')
    .select('id,conversation_id,sender_id,text,body,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(12);

  if (error) {
    if (isSchemaMissingError(error) || isColumnMissingError(error)) {
      return null;
    }
    throw new Error(error.message || 'Failed to load primary conversation messages.');
  }

  return ((data ?? []) as MessageRow[])
    .map((message) => ({
      senderId: message.sender_id,
      text: readTrimmedString(message.text) ?? readTrimmedString(message.body) ?? '',
      createdAt: message.created_at,
    }))
    .filter((message) => message.text.length > 0)
    .reverse();
}

async function findRoomSchemaConversation(
  client: SupabaseClient,
  normalizedKey: string,
  requestedKey: string,
): Promise<RoomRow | null> {
  const candidateKeys = Array.from(new Set([
    normalizedKey,
    requestedKey,
    getChatConversationDisplayId(requestedKey),
  ].filter((value): value is string => !!readTrimmedString(value))));

  for (const key of candidateKeys) {
    if (isUuidConversationId(key)) {
      const { data, error } = await client
        .from('chat_rooms')
        .select('id,slug,title,subtitle')
        .eq('id', key)
        .maybeSingle();

      if (error) {
        if (isSchemaMissingError(error) || isColumnMissingError(error)) {
          return null;
        }
        console.log('[AssistantAPI] Alternate room lookup warning:', error.message);
      }

      if (data) {
        return data as RoomRow;
      }
    }

    const { data, error } = await client
      .from('chat_rooms')
      .select('id,slug,title,subtitle')
      .eq('slug', key)
      .maybeSingle();

    if (error) {
      if (isSchemaMissingError(error) || isColumnMissingError(error)) {
        return null;
      }
      console.log('[AssistantAPI] Alternate room slug lookup warning:', error.message);
    }

    if (data) {
      return data as RoomRow;
    }
  }

  return null;
}

async function loadRoomSchemaMessages(client: SupabaseClient, roomId: string): Promise<NormalizedStoredMessage[] | null> {
  const { data, error } = await client
    .from('room_messages')
    .select('id,room_id,sender_id,user_id,text,body,created_at')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(12);

  if (error) {
    if (isSchemaMissingError(error) || isColumnMissingError(error)) {
      return null;
    }
    throw new Error(error.message || 'Failed to load alternate room messages.');
  }

  return ((data ?? []) as RoomMessageRow[])
    .map((message) => ({
      senderId: readTrimmedString(message.sender_id) ?? readTrimmedString(message.user_id) ?? 'unknown',
      text: readTrimmedString(message.body) ?? readTrimmedString(message.text) ?? '',
      createdAt: message.created_at,
    }))
    .filter((message) => message.text.length > 0)
    .reverse();
}

async function resolveConversationContext(
  client: SupabaseClient,
  requestedRoomKey: string,
  userId: string,
): Promise<ConversationContext> {
  const normalizedKey = resolveChatConversationId(requestedRoomKey);
  await upsertKnownConversation(client, normalizedKey, userId);

  const primaryConversation = await findPrimaryConversation(client, normalizedKey, requestedRoomKey);
  if (primaryConversation) {
    const primaryMessages = await loadPrimaryMessages(client, primaryConversation.id);
    if (primaryMessages) {
      return {
        storage: 'primary',
        conversationId: primaryConversation.id,
        storageId: primaryConversation.id,
        title: readTrimmedString(primaryConversation.title) ?? getChatConversationTitle(normalizedKey, 'Workspace Assistant') ?? 'Workspace Assistant',
        subtitle: readTrimmedString(primaryConversation.subtitle) ?? getChatConversationSubtitle(normalizedKey, null),
        recentMessages: primaryMessages,
      };
    }
  }

  const roomConversation = await findRoomSchemaConversation(client, normalizedKey, requestedRoomKey);
  if (roomConversation) {
    const roomMessages = await loadRoomSchemaMessages(client, roomConversation.id);
    if (roomMessages) {
      return {
        storage: 'room',
        conversationId: normalizedKey,
        storageId: roomConversation.id,
        title: readTrimmedString(roomConversation.title) ?? getChatConversationTitle(normalizedKey, 'Workspace Assistant') ?? 'Workspace Assistant',
        subtitle: readTrimmedString(roomConversation.subtitle) ?? getChatConversationSubtitle(normalizedKey, null),
        recentMessages: roomMessages,
      };
    }
  }

  const bootstrap = getChatConversationBootstrap(normalizedKey);
  if (bootstrap) {
    return {
      storage: 'primary',
      conversationId: bootstrap.conversationId,
      storageId: bootstrap.conversationId,
      title: bootstrap.title,
      subtitle: bootstrap.subtitle,
      recentMessages: [],
    };
  }

  throw new Error('Room not found.');
}

async function loadUserContext(client: SupabaseClient, user: User): Promise<UserContext> {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error && !isSchemaMissingError(error) && !isColumnMissingError(error)) {
    console.log('[AssistantAPI] Profile lookup warning:', error.message);
  }

  const roleFromProfile = extractIVXRoleCandidate(data as Record<string, unknown> | null | undefined);
  const appMetadataRole = extractIVXRoleCandidate(user.app_metadata as Record<string, unknown> | null | undefined);
  const userMetadataRole = extractIVXRoleCandidate(user.user_metadata as Record<string, unknown> | null | undefined);
  const roleContext = resolveIVXRoleContext([
    roleFromProfile,
    appMetadataRole,
    userMetadataRole,
  ]);

  console.log('[AssistantAPI] User role resolution result:', {
    userId: user.id,
    email: readTrimmedString(user.email),
    profileRole: roleFromProfile,
    appMetadataRole,
    userMetadataRole,
    rawRole: roleContext.rawRole,
    normalizedRole: roleContext.normalizedRole,
  });

  return {
    id: user.id,
    email: readTrimmedString(user.email),
    role: roleContext.rawRole,
    normalizedRole: roleContext.normalizedRole,
  };
}

async function loadProjectContext(client: SupabaseClient, requestedProjectId: string | null): Promise<ProjectContext> {
  const workspaceProjectId = WORKSPACE_PROJECT_ID || 'workspace';
  const effectiveProjectId = requestedProjectId ?? workspaceProjectId;
  let selectedDeal: ProjectDealRow | null = null;

  if (requestedProjectId && requestedProjectId !== workspaceProjectId) {
    const { data, error } = await client
      .from('jv_deals')
      .select('id,title,projectName,propertyAddress,expectedROI,totalInvestment,propertyValue,status,published')
      .eq('id', requestedProjectId)
      .maybeSingle();

    if (error && !isSchemaMissingError(error) && !isColumnMissingError(error)) {
      console.log('[AssistantAPI] Selected deal lookup warning:', error.message);
    }

    if (data) {
      selectedDeal = data as ProjectDealRow;
    }
  }

  const { data: featuredData, error: featuredError } = await client
    .from('jv_deals')
    .select('id,title,projectName,propertyAddress,expectedROI,totalInvestment,propertyValue,status,published')
    .order('createdAt', { ascending: false })
    .limit(3);

  if (featuredError && !isSchemaMissingError(featuredError) && !isColumnMissingError(featuredError)) {
    console.log('[AssistantAPI] Featured deals lookup warning:', featuredError.message);
  }

  return {
    projectId: effectiveProjectId,
    teamId: WORKSPACE_TEAM_ID || null,
    workspaceLabel: WORKSPACE_LABEL,
    selectedDeal,
    featuredDeals: ((featuredData ?? []) as ProjectDealRow[]).slice(0, 3),
  };
}

function isAssistantSender(senderId: string, currentUserId: string): boolean {
  const normalizedSenderId = senderId.trim().toLowerCase();
  const normalizedUserId = currentUserId.trim().toLowerCase();

  return normalizedSenderId !== normalizedUserId
    && (
      normalizedSenderId === ASSISTANT_SENDER_ID.toLowerCase()
      || normalizedSenderId === 'assistant'
      || normalizedSenderId.includes('assistant')
      || normalizedSenderId.includes('ai')
    );
}

function summarizeDeals(deals: ProjectDealRow[]): string {
  if (deals.length === 0) {
    return 'No featured deals were loaded for this workspace.';
  }

  return deals
    .map((deal) => {
      const title = readTrimmedString(deal.title) ?? readTrimmedString(deal.projectName) ?? deal.id;
      const address = readTrimmedString(deal.propertyAddress) ?? 'Address unavailable';
      const status = readTrimmedString(deal.status) ?? 'unknown';
      const roi = typeof deal.expectedROI === 'number' ? `${deal.expectedROI}%` : 'ROI unavailable';
      return `${title} | ${address} | status: ${status} | expected ROI: ${roi}`;
    })
    .join('\n');
}

function buildInstructions(context: {
  user: UserContext;
  conversation: ConversationContext;
  project: ProjectContext;
  systemPrompt: string | null;
}): string {
  const instructions: string[] = [
    'You are the in-app assistant for this workspace.',
    'Be concise, helpful, and factual.',
    'Use the provided room and project context when relevant.',
    'If the context is incomplete, say what is missing instead of inventing details.',
    `Workspace project id: ${context.project.projectId}`,
    `Workspace team id: ${context.project.teamId ?? 'unavailable'}`,
    `Room title: ${context.conversation.title}`,
    `Room subtitle: ${context.conversation.subtitle ?? 'unavailable'}`,
    `Authenticated user id: ${context.user.id}`,
    `Authenticated user role: ${context.user.role ?? 'unknown'}`,
    `Authenticated user email: ${context.user.email ?? 'unknown'}`,
    `Featured deals:\n${summarizeDeals(context.project.featuredDeals)}`,
  ];

  if (context.project.selectedDeal) {
    const selectedDeal = context.project.selectedDeal;
    instructions.push(
      `Selected deal context: ${readTrimmedString(selectedDeal.title) ?? selectedDeal.id} | ${readTrimmedString(selectedDeal.propertyAddress) ?? 'Address unavailable'} | status: ${readTrimmedString(selectedDeal.status) ?? 'unknown'}`,
    );
  }

  if (context.systemPrompt) {
    instructions.push(`Additional system prompt: ${context.systemPrompt}`);
  }

  return instructions.join('\n\n');
}

function buildOpenAIInput(context: {
  conversation: ConversationContext;
  userId: string;
  userMessage: string;
}): Array<{ role: 'user' | 'assistant'; content: string }> {
  const history = context.conversation.recentMessages
    .map((message) => {
      const role: 'user' | 'assistant' = isAssistantSender(message.senderId, context.userId) ? 'assistant' : 'user';
      const content = role === 'user' && message.senderId !== context.userId
        ? `[Participant ${message.senderId}] ${message.text}`
        : message.text;

      return {
        role,
        content,
      };
    })
    .filter((message) => message.content.trim().length > 0);

  history.push({
    role: 'user',
    content: context.userMessage,
  });

  return history;
}

function extractOpenAIText(payload: OpenAIResponsePayload): string {
  const directText = readTrimmedString(payload.output_text);
  if (directText) {
    return directText;
  }

  const collectedParts: string[] = [];

  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      const text = readTrimmedString(content.text);
      if (text) {
        collectedParts.push(text);
      }
    }
  }

  return collectedParts.join('\n').trim();
}

function buildToolkitPrompt(params: {
  instructions: string;
  input: Array<{ role: 'user' | 'assistant'; content: string }>;
}): string {
  const transcript = params.input
    .map((message, index) => `${index + 1}. ${message.role.toUpperCase()}: ${message.content}`)
    .join('\n\n');

  return [
    params.instructions,
    'Conversation transcript:',
    transcript,
    'Write the next assistant reply only.',
  ].join('\n\n');
}

async function callAssistantModel(params: {
  model: string;
  instructions: string;
  input: Array<{ role: 'user' | 'assistant'; content: string }>;
  previousResponseId: string | null;
  metadata: Record<string, string>;
}): Promise<AssistantGenerationResult> {
  const openAiApiKey = (process.env.OPENAI_API_KEY ?? '').trim();

  if (openAiApiKey) {
    try {
      console.log('[AssistantAPI] Calling OpenAI Responses API:', {
        model: params.model,
        inputCount: params.input.length,
        hasPreviousResponseId: !!params.previousResponseId,
      });

      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openAiApiKey}`,
        },
        body: JSON.stringify({
          model: params.model,
          instructions: params.instructions,
          input: params.input,
          previous_response_id: params.previousResponseId ?? undefined,
          metadata: params.metadata,
          store: true,
        }),
      });

      const payload = await response.json() as OpenAIResponsePayload;

      if (!response.ok) {
        throw new Error(readTrimmedString(payload.error?.message) ?? `OpenAI request failed with status ${response.status}.`);
      }

      const answer = extractOpenAIText(payload);
      if (!answer) {
        throw new Error('OpenAI returned an empty assistant response.');
      }

      return {
        provider: 'openai',
        responseId: readTrimmedString(payload.id),
        answer,
        usage: payload.usage ?? null,
      };
    } catch (error) {
      console.log('[AssistantAPI] OpenAI provider failed, falling back to Rork toolkit:', getErrorMessage(error));
    }
  } else {
    console.log('[AssistantAPI] OPENAI_API_KEY missing, falling back to Rork toolkit');
  }

  console.log('[AssistantAPI] Calling Rork toolkit fallback:', {
    inputCount: params.input.length,
  });

  const toolkitPrompt = buildToolkitPrompt({
    instructions: params.instructions,
    input: params.input,
  });
  const rawToolkitAnswer = await toolkitGenerateText({
    messages: [{ role: 'user', content: toolkitPrompt }],
  });
  const toolkitAnswer = typeof rawToolkitAnswer === 'string' ? rawToolkitAnswer.trim() : '';

  if (!toolkitAnswer) {
    throw new Error('AI provider returned an empty assistant response.');
  }

  return {
    provider: 'rork-toolkit',
    responseId: null,
    answer: toolkitAnswer,
    usage: null,
  };
}

async function insertPrimaryMessage(
  client: SupabaseClient,
  conversationId: string,
  senderId: string,
  text: string,
  readBy: string[],
): Promise<boolean> {
  const basePayload = {
    conversation_id: conversationId,
    sender_id: senderId,
    text,
    body: text,
    read_by: readBy,
  };

  let { error } = await client.from('messages').insert(basePayload);

  if (error && isColumnMissingError(error)) {
    ({ error } = await client.from('messages').insert({
      conversation_id: conversationId,
      sender_id: senderId,
      text,
      read_by: readBy,
    }));
  }

  if (error) {
    if (isSchemaMissingError(error)) {
      return false;
    }
    throw new Error(error.message || 'Failed to save primary message.');
  }

  return true;
}

async function insertRoomMessage(client: SupabaseClient, roomId: string, senderId: string, text: string): Promise<boolean> {
  const payloads: Array<Record<string, unknown>> = [
    { room_id: roomId, sender_id: senderId, body: text },
    { room_id: roomId, sender_id: senderId, text },
    { room_id: roomId, user_id: senderId, body: text },
    { room_id: roomId, user_id: senderId, text },
  ];

  for (const payload of payloads) {
    const { error } = await client.from('room_messages').insert(payload);

    if (!error) {
      return true;
    }

    if (isColumnMissingError(error)) {
      continue;
    }

    if (isSchemaMissingError(error)) {
      return false;
    }

    throw new Error(error.message || 'Failed to save alternate room message.');
  }

  return false;
}

async function persistConversationUpdate(
  client: SupabaseClient,
  conversationId: string,
  assistantText: string,
): Promise<void> {
  const updatePayload = {
    last_message_text: assistantText,
    last_message_at: new Date().toISOString(),
  };

  const { error } = await client.from('conversations').update(updatePayload).eq('id', conversationId);
  if (error && !isSchemaMissingError(error) && !isColumnMissingError(error)) {
    console.log('[AssistantAPI] Conversation update warning:', error.message);
  }
}

async function persistConversationMessages(params: {
  client: SupabaseClient;
  conversation: ConversationContext;
  userId: string;
  userMessage: string;
  assistantText: string;
  saveUserMessage: boolean;
}): Promise<PersistenceResult> {
  const persistedAt = new Date().toISOString();
  let userMessageSaved = false;
  let assistantMessageSaved = false;
  let warning: string | null = null;

  try {
    if (params.conversation.storage === 'primary') {
      if (params.saveUserMessage) {
        userMessageSaved = await insertPrimaryMessage(
          params.client,
          params.conversation.conversationId,
          params.userId,
          params.userMessage,
          [params.userId],
        );
      }

      assistantMessageSaved = await insertPrimaryMessage(
        params.client,
        params.conversation.conversationId,
        ASSISTANT_SENDER_ID,
        params.assistantText,
        [params.userId],
      );

      await persistConversationUpdate(params.client, params.conversation.conversationId, params.assistantText);
    } else {
      if (params.saveUserMessage) {
        userMessageSaved = await insertRoomMessage(params.client, params.conversation.storageId, params.userId, params.userMessage);
      }

      assistantMessageSaved = await insertRoomMessage(params.client, params.conversation.storageId, ASSISTANT_SENDER_ID, params.assistantText);
    }
  } catch (error) {
    warning = getErrorMessage(error);
    console.log('[AssistantAPI] Persistence warning:', warning);
  }

  return {
    saved: assistantMessageSaved && (!params.saveUserMessage || userMessageSaved),
    userMessageSaved,
    assistantMessageSaved,
    persistedAt,
    warning,
  };
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: JSON_HEADERS,
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json() as AssistantRequestBody;
    const userMessage = readTrimmedString(body.message) ?? readTrimmedString(body.prompt);
    const requestedRoomKey = readTrimmedString(body.conversationId)
      ?? readTrimmedString(body.roomId)
      ?? readTrimmedString(body.roomSlug)
      ?? DEFAULT_ROOM_KEY;
    const requestedProjectId = readTrimmedString(body.projectId);
    const requestedModel = readTrimmedString(body.model) ?? DEFAULT_MODEL;
    const previousResponseId = readTrimmedString(body.previousResponseId);
    const systemPrompt = readTrimmedString(body.systemPrompt);
    const saveUserMessage = toBoolean(body.saveUserMessage, true);

    if (!userMessage) {
      return jsonResponse({ error: 'Message is required.' }, 400);
    }

    console.log('[AssistantAPI] Incoming request:', {
      roomKey: requestedRoomKey,
      requestedProjectId: requestedProjectId ?? WORKSPACE_PROJECT_ID ?? null,
      model: requestedModel,
      saveUserMessage,
      hasPreviousResponseId: !!previousResponseId,
    });

    const supabaseAdmin = createSupabaseAdminClient();
    const verifiedUser = await verifyUser(supabaseAdmin, request);
    const userContext = await loadUserContext(supabaseAdmin, verifiedUser);

    if (!isPrivilegedIVXRole(userContext.normalizedRole)) {
      console.log('[AssistantAPI] Blocked non-privileged request:', {
        userId: verifiedUser.id,
        email: verifiedUser.email ?? null,
        profileRole: userContext.role,
        normalizedRole: userContext.normalizedRole,
      });
      return jsonResponse({ error: 'Privileged IVX access is required.' }, 403);
    }

    const conversationContext = await resolveConversationContext(supabaseAdmin, requestedRoomKey, verifiedUser.id);
    const projectContext = await loadProjectContext(supabaseAdmin, requestedProjectId);

    console.log('[AssistantAPI] Loaded context:', {
      storage: conversationContext.storage,
      conversationId: conversationContext.conversationId,
      recentMessageCount: conversationContext.recentMessages.length,
      featuredDeals: projectContext.featuredDeals.length,
      selectedDeal: projectContext.selectedDeal?.id ?? null,
    });

    const instructions = buildInstructions({
      user: userContext,
      conversation: conversationContext,
      project: projectContext,
      systemPrompt,
    });

    const input = buildOpenAIInput({
      conversation: conversationContext,
      userId: verifiedUser.id,
      userMessage,
    });

    const openAIResult = await callAssistantModel({
      model: requestedModel,
      instructions,
      input,
      previousResponseId,
      metadata: {
        source: 'expo-api-assistant',
        projectId: projectContext.projectId,
        conversationId: conversationContext.conversationId,
        userId: verifiedUser.id,
      },
    });

    const persistence = await persistConversationMessages({
      client: supabaseAdmin,
      conversation: conversationContext,
      userId: verifiedUser.id,
      userMessage,
      assistantText: openAIResult.answer,
      saveUserMessage,
    });

    return jsonResponse({
      answer: openAIResult.answer,
      text: openAIResult.answer,
      responseId: openAIResult.responseId,
      conversationId: conversationContext.conversationId,
      roomTitle: conversationContext.title,
      roomSubtitle: conversationContext.subtitle,
      storage: conversationContext.storage,
      projectId: projectContext.projectId,
      saved: persistence.saved,
      persistence,
      provider: openAIResult.provider,
      usage: openAIResult.usage ?? null,
      context: {
        recentMessageCount: conversationContext.recentMessages.length,
        featuredDealCount: projectContext.featuredDeals.length,
        selectedDealId: projectContext.selectedDeal?.id ?? null,
        userRole: userContext.role,
        normalizedUserRole: userContext.normalizedRole,
      },
    });
  } catch (error) {
    const message = getErrorMessage(error);
    const status = message === 'Missing bearer token.' || message === 'Unauthorized request.'
      ? 401
      : message === 'Owner access is required.' || message === 'Privileged IVX access is required.'
        ? 403
        : message === 'Room not found.'
          ? 404
          : message === 'Supabase server environment variables are missing.'
            || message === 'SUPABASE_SERVICE_ROLE_KEY matches the anon key.'
            || message.startsWith('SUPABASE_SERVICE_ROLE_KEY has invalid role claim:')
            ? 503
            : 500;

    console.log('[AssistantAPI] Request failed:', message);
    return jsonResponse({ error: message }, status);
  }
}
