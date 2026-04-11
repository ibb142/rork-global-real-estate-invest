import { generateText } from '@rork-ai/toolkit-sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { IVX_OWNER_AI_PROFILE, IVX_OWNER_AI_ROOM_ID, IVX_OWNER_AI_ROOM_SLUG } from '../../expo/constants/ivx-owner-ai';
import { IVX_OWNER_AI_TABLES, type IVXConversation, type IVXOwnerAIRequest, type IVXOwnerAIResponse } from '../../expo/shared/ivx';
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';

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

function getConversationPreview(value: string): string {
  return value.length <= 120 ? value : `${value.slice(0, 117)}...`;
}

async function ensureOwnerConversation(client: SupabaseClient): Promise<IVXConversation> {
  const existingResult = await client.from(IVX_OWNER_AI_TABLES.conversations).select('*').eq('slug', IVX_OWNER_AI_ROOM_SLUG).maybeSingle();

  if (existingResult.error) {
    throw new Error(existingResult.error.message);
  }

  const existingConversation = existingResult.data as IVXConversationRow | null;
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
    const fallbackResult = await client.from(IVX_OWNER_AI_TABLES.conversations).select('*').eq('slug', IVX_OWNER_AI_ROOM_SLUG).single();
    if (fallbackResult.error) {
      throw new Error(fallbackResult.error.message);
    }
    return mapConversation(fallbackResult.data as IVXConversationRow);
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
}): Promise<void> {
  const insertResult = await client.from(IVX_OWNER_AI_TABLES.messages).insert({
    conversation_id: input.conversationId,
    sender_role: input.senderRole,
    sender_label: input.senderLabel,
    body: input.body,
    attachment_kind: input.senderRole === 'assistant' ? 'command' : 'text',
    created_at: nowIso(),
    updated_at: nowIso(),
  });

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
  }
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

async function logAIRequest(client: SupabaseClient, input: {
  requestId: string;
  conversationId: string;
  userId: string;
  prompt: string;
  responseText: string;
  status: 'completed' | 'failed';
  model: string;
}): Promise<void> {
  const insertResult = await client.from(IVX_OWNER_AI_TABLES.aiRequests).insert({
    id: input.requestId,
    conversation_id: input.conversationId,
    user_id: input.userId,
    prompt: input.prompt,
    response_text: input.responseText,
    status: input.status,
    model: input.model,
    created_at: nowIso(),
    updated_at: nowIso(),
  });

  if (insertResult.error) {
    throw new Error(insertResult.error.message);
  }
}

function buildPromptText(input: {
  prompt: string;
  email: string | null;
  conversation: IVXConversation;
  recentMessages: IVXMessageRow[];
  mode: 'chat' | 'command';
}): string {
  const transcript = input.recentMessages.map((message) => {
    const label = message.sender_label ?? message.sender_role;
    const body = message.body ?? '';
    return `${label}: ${body}`;
  }).join('\n');

  return [
    `You are ${IVX_OWNER_AI_PROFILE.name}.`,
    'Respond with concise owner-first guidance for IVX operations, chat, inbox, uploads, knowledge base, and owner commands.',
    `Mode: ${input.mode}`,
    `Conversation: ${input.conversation.title}`,
    `Owner email: ${input.email ?? 'unknown'}`,
    transcript.length > 0 ? `Recent messages:\n${transcript}` : 'Recent messages: none',
    `Owner request: ${input.prompt}`,
  ].join('\n\n');
}

function getErrorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('authorization') || message.includes('owner access') || message.includes('invalid owner session')) {
    return 401;
  }
  return 500;
}

export function OPTIONS(): Response {
  return ownerOnlyOptions();
}

export async function handleIVXOwnerAIRequest(request: Request): Promise<Response> {
  try {
    const ownerContext = await assertIVXOwnerOnly(request);
    const body = await request.json() as IVXOwnerAIRequest;
    const prompt = readTrimmedString(body.message);
    const mode = body.mode === 'command' ? 'command' : 'chat';
    const senderLabel = readTrimmedString(body.senderLabel) || ownerContext.email || 'IVX Owner';
    const model = readTrimmedString(process.env.IVX_OWNER_AI_MODEL) || 'gpt-4.1-mini';

    if (!prompt) {
      return ownerOnlyJson({ error: 'Message is required.' }, 400);
    }

    const conversation = await ensureOwnerConversation(ownerContext.client);
    const requestId = createRequestId();

    await insertMessage(ownerContext.client, {
      conversationId: conversation.id,
      senderRole: 'owner',
      senderLabel,
      body: prompt,
    });

    const recentMessages = await loadRecentMessages(ownerContext.client, conversation.id);
    const promptText = buildPromptText({
      prompt,
      email: ownerContext.email,
      conversation,
      recentMessages,
      mode,
    });
    const answer = (await generateText(promptText)).trim();

    await insertMessage(ownerContext.client, {
      conversationId: conversation.id,
      senderRole: 'assistant',
      senderLabel: IVX_OWNER_AI_PROFILE.name,
      body: answer,
    });

    await updateConversationSummary(ownerContext.client, conversation.id, answer);
    await logAIRequest(ownerContext.client, {
      requestId,
      conversationId: conversation.id,
      userId: ownerContext.userId,
      prompt,
      responseText: answer,
      status: 'completed',
      model,
    });

    const responsePayload: IVXOwnerAIResponse = {
      requestId,
      conversationId: conversation.id,
      answer,
      model,
      status: 'ok',
    };

    return ownerOnlyJson(responsePayload);
  } catch (error) {
    const status = getErrorStatus(error);
    const message = error instanceof Error ? error.message : 'Unable to process the IVX Owner AI request.';
    return ownerOnlyJson({ error: message }, status);
  }
}
