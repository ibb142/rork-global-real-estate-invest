import { IVX_OWNER_AI_PROFILE, IVX_OWNER_AI_ROOM_ID, IVX_OWNER_AI_ROOM_SLUG } from '@/constants/ivx-owner-ai';
import { getIVXOwnerAuthContext, getIVXSupabaseClient } from '@/lib/ivx-supabase-client';
import {
  IVX_OWNER_AI_BUCKET,
  type IVXAttachmentKind,
  type IVXConversation,
  type IVXMessage,
  type IVXUploadInput,
} from '@/shared/ivx';
import { ivxFileUploadService } from './ivxFileUploadService';
import {
  resolveIVXTables,
  mapGenericMessageRow,
  buildMessageInsertPayload,
  buildInboxUpsertPayload,
  type ResolvedTables,
} from './ivxTableResolver';

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

const IVX_OWNER_FILE_URL_TTL_SECONDS = 60 * 60;

function nowIso(): string {
  return new Date().toISOString();
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim() ?? '';
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function getMessagePreview(value: string | null): string | null {
  const trimmedValue = trimOrNull(value);
  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.length <= 80) {
    return trimmedValue;
  }

  return `${trimmedValue.slice(0, 77)}...`;
}

function getAttachmentKindFromMime(mimeType: string | null | undefined): IVXAttachmentKind {
  const normalizedMimeType = mimeType?.trim().toLowerCase() ?? '';

  if (!normalizedMimeType) {
    return 'file';
  }

  if (normalizedMimeType.startsWith('image/')) {
    return 'image';
  }

  if (normalizedMimeType.startsWith('video/')) {
    return 'video';
  }

  if (normalizedMimeType === 'application/pdf') {
    return 'pdf';
  }

  return 'file';
}

function mapConversation(row: Record<string, unknown>): IVXConversation {
  return {
    id: (row.id ?? '') as string,
    slug: (row.slug ?? '') as string,
    title: (row.title ?? '') as string,
    subtitle: (row.subtitle ?? null) as string | null,
    createdAt: (row.created_at ?? nowIso()) as string,
    updatedAt: (row.updated_at ?? nowIso()) as string,
    lastMessageText: (row.last_message_text ?? null) as string | null,
    lastMessageAt: (row.last_message_at ?? null) as string | null,
  };
}

function isRemoteUrl(value: string | null | undefined): boolean {
  const trimmedValue = value?.trim() ?? '';
  return /^https?:\/\//i.test(trimmedValue);
}

async function resolveAttachmentUrl(rawAttachmentUrl: string | null): Promise<string | null> {
  const trimmedAttachmentUrl = trimOrNull(rawAttachmentUrl);

  if (!trimmedAttachmentUrl) {
    return null;
  }

  if (isRemoteUrl(trimmedAttachmentUrl)) {
    return trimmedAttachmentUrl;
  }

  const client = getIVXSupabaseClient();
  const signedUrlResult = await client.storage.from(IVX_OWNER_AI_BUCKET).createSignedUrl(trimmedAttachmentUrl, IVX_OWNER_FILE_URL_TTL_SECONDS);

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    console.log('[IVXChatService] Failed to sign attachment URL:', signedUrlResult.error?.message ?? 'missing signed url');
    return null;
  }

  return signedUrlResult.data.signedUrl;
}

async function mapMessage(row: Record<string, unknown>): Promise<IVXMessage> {
  const normalized = mapGenericMessageRow(row);
  return {
    id: normalized.id,
    conversationId: normalized.conversation_id,
    senderUserId: normalized.sender_user_id,
    senderRole: normalized.sender_role,
    senderLabel: normalized.sender_label,
    body: normalized.body,
    attachmentUrl: await resolveAttachmentUrl(normalized.attachment_url),
    attachmentName: normalized.attachment_name,
    attachmentMime: normalized.attachment_mime,
    attachmentSize: normalized.attachment_size,
    attachmentKind: (normalized.attachment_kind as IVXAttachmentKind | null) ?? getAttachmentKindFromMime(normalized.attachment_mime),
    createdAt: normalized.created_at,
    updatedAt: normalized.updated_at,
  };
}

async function ensureInboxState(tables: ResolvedTables, conversationId: string, userId: string): Promise<void> {
  const client = getIVXSupabaseClient();
  const { payload, onConflict } = buildInboxUpsertPayload(tables.schema, conversationId, userId);

  const upsertResult = await client.from(tables.inboxState).upsert(payload, {
    onConflict,
  });

  if (upsertResult.error) {
    console.log('[IVXChatService] Failed to ensure inbox state (non-blocking):', upsertResult.error.message);
  }
}

async function updateConversationSummary(tables: ResolvedTables, conversationId: string, messagePreview: string | null): Promise<void> {
  const client = getIVXSupabaseClient();
  const updateResult = await client.from(tables.conversations).update({
    updated_at: nowIso(),
    last_message_text: getMessagePreview(messagePreview),
    last_message_at: nowIso(),
  }).eq('id', conversationId);

  if (updateResult.error) {
    console.log('[IVXChatService] Failed to update summary (non-blocking):', updateResult.error.message);
  }
}

async function insertMessage(tables: ResolvedTables, input: {
  conversationId: string;
  senderUserId: string | null;
  senderRole: string;
  senderLabel: string | null;
  body: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  attachmentKind?: string;
}): Promise<IVXMessage> {
  const client = getIVXSupabaseClient();
  const insertPayload = buildMessageInsertPayload(tables.schema, input);

  console.log('[IVXChatService] Inserting message into:', tables.messages, 'schema:', tables.schema);
  const insertResult = await client.from(tables.messages).insert(insertPayload).select('*').single();

  if (insertResult.error) {
    console.log('[IVXChatService] Failed to insert message:', insertResult.error.message);
    throw new Error(insertResult.error.message);
  }

  return await mapMessage(insertResult.data as Record<string, unknown>);
}

async function bootstrapOwnerConversation(): Promise<IVXConversation> {
  const client = getIVXSupabaseClient();
  const ownerContext = await getIVXOwnerAuthContext();
  const tables = await resolveIVXTables();

  console.log('[IVXChatService] Bootstrapping conversation using schema:', tables.schema, 'table:', tables.conversations);

  const existingResult = await client.from(tables.conversations).select('*').eq('slug', IVX_OWNER_AI_ROOM_SLUG).maybeSingle();

  if (existingResult.error) {
    console.log('[IVXChatService] Failed to read owner conversation:', existingResult.error.message);

    if (tables.schema === 'none') {
      console.log('[IVXChatService] No tables available — returning fallback conversation object');
      return {
        id: IVX_OWNER_AI_ROOM_ID,
        slug: IVX_OWNER_AI_ROOM_SLUG,
        title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
        subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
        createdAt: nowIso(),
        updatedAt: nowIso(),
        lastMessageText: null,
        lastMessageAt: null,
      };
    }

    throw new Error(existingResult.error.message);
  }

  const existingConversation = existingResult.data as Record<string, unknown> | null;
  if (existingConversation) {
    await ensureInboxState(tables, existingConversation.id as string, ownerContext.userId);
    return mapConversation(existingConversation);
  }

  const insertPayload: Record<string, unknown> = {
    id: IVX_OWNER_AI_ROOM_ID,
    slug: IVX_OWNER_AI_ROOM_SLUG,
    title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
    subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
    created_at: nowIso(),
    updated_at: nowIso(),
    last_message_text: null,
    last_message_at: null,
  };

  const insertResult = await client.from(tables.conversations).insert(insertPayload).select('*').single();

  if (insertResult.error) {
    console.log('[IVXChatService] Owner conversation insert returned:', insertResult.error.message);
    const fallbackResult = await client.from(tables.conversations).select('*').eq('slug', IVX_OWNER_AI_ROOM_SLUG).single();
    if (fallbackResult.error) {
      throw new Error(fallbackResult.error.message);
    }
    await ensureInboxState(tables, (fallbackResult.data as Record<string, unknown>).id as string, ownerContext.userId);
    return mapConversation(fallbackResult.data as Record<string, unknown>);
  }

  await ensureInboxState(tables, (insertResult.data as Record<string, unknown>).id as string, ownerContext.userId);
  return mapConversation(insertResult.data as Record<string, unknown>);
}

async function listOwnerMessages(): Promise<IVXMessage[]> {
  const client = getIVXSupabaseClient();
  const tables = await resolveIVXTables();
  const conversation = await bootstrapOwnerConversation();

  console.log('[IVXChatService] Listing messages from:', tables.messages, 'conversation:', conversation.id);
  const messageResult = await client.from(tables.messages).select('*').eq('conversation_id', conversation.id).order('created_at', { ascending: true });

  if (messageResult.error) {
    console.log('[IVXChatService] Failed to list messages:', messageResult.error.message);
    throw new Error(messageResult.error.message);
  }

  return await Promise.all((messageResult.data ?? []).map((row) => mapMessage(row as Record<string, unknown>)));
}

async function sendOwnerTextMessage(input: {
  body: string;
  senderLabel?: string | null;
}): Promise<IVXMessage> {
  const ownerContext = await getIVXOwnerAuthContext();
  const tables = await resolveIVXTables();
  const conversation = await bootstrapOwnerConversation();
  const body = trimOrNull(input.body);

  if (!body) {
    throw new Error('Type a message before sending.');
  }

  console.log('[IVXChatService] Sending owner text message:', {
    conversationId: conversation.id,
    userId: ownerContext.userId,
    bodyLength: body.length,
    schema: tables.schema,
  });

  const message = await insertMessage(tables, {
    conversationId: conversation.id,
    senderUserId: ownerContext.userId,
    senderRole: 'owner',
    senderLabel: trimOrNull(input.senderLabel) ?? ownerContext.email,
    body,
    attachmentKind: 'text',
  });

  await updateConversationSummary(tables, conversation.id, body);
  await ensureInboxState(tables, conversation.id, ownerContext.userId);
  return message;
}

async function sendOwnerAttachmentMessage(input: {
  upload: IVXUploadInput;
  body?: string | null;
  senderLabel?: string | null;
}): Promise<IVXMessage> {
  const ownerContext = await getIVXOwnerAuthContext();
  const tables = await resolveIVXTables();
  const conversation = await bootstrapOwnerConversation();
  const uploadedFile = await ivxFileUploadService.uploadOwnerFile({
    upload: input.upload,
    conversationId: conversation.id,
  });
  const body = trimOrNull(input.body);
  const attachmentKind = getAttachmentKindFromMime(uploadedFile.mimeType);

  console.log('[IVXChatService] Sending owner attachment message:', {
    conversationId: conversation.id,
    userId: ownerContext.userId,
    fileName: uploadedFile.fileName,
    mimeType: uploadedFile.mimeType,
    schema: tables.schema,
  });

  const message = await insertMessage(tables, {
    conversationId: conversation.id,
    senderUserId: ownerContext.userId,
    senderRole: 'owner',
    senderLabel: trimOrNull(input.senderLabel) ?? ownerContext.email,
    body,
    attachmentUrl: uploadedFile.path,
    attachmentName: uploadedFile.fileName,
    attachmentMime: uploadedFile.mimeType,
    attachmentSize: uploadedFile.size,
    attachmentKind,
  });

  await updateConversationSummary(tables, conversation.id, body ?? uploadedFile.fileName);
  await ensureInboxState(tables, conversation.id, ownerContext.userId);
  return message;
}

async function subscribeToOwnerMessages(onMessage: (message: IVXMessage) => void): Promise<() => void> {
  const client = getIVXSupabaseClient();
  const tables = await resolveIVXTables();
  const conversation = await bootstrapOwnerConversation();

  console.log('[IVXChatService] Setting up realtime on:', tables.messages, 'conversation:', conversation.id);

  const channel = client.channel(`ivx-owner-room:${conversation.id}`).on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: tables.messages,
    filter: `conversation_id=eq.${conversation.id}`,
  }, (payload) => {
    console.log('[IVXChatService] Incoming realtime message on', tables.messages);
    void mapMessage(payload.new as Record<string, unknown>)
      .then((message) => onMessage(message))
      .catch((error: unknown) => {
        console.log('[IVXChatService] Failed to hydrate realtime message:', error instanceof Error ? error.message : 'unknown');
      });
  }).subscribe((status) => {
    console.log('[IVXChatService] Realtime status:', status);
  });

  return () => {
    console.log('[IVXChatService] Removing realtime channel for owner room');
    void client.removeChannel(channel);
  };
}

export const ivxChatService = {
  bootstrapOwnerConversation,
  listOwnerMessages,
  sendOwnerTextMessage,
  sendOwnerAttachmentMessage,
  subscribeToOwnerMessages,
};
