import { getIVXSupabaseClient } from '@/lib/ivx-supabase-client';
import { IVX_OWNER_AI_TABLES } from '@/shared/ivx';

export type ResolvedTableSchema = 'ivx' | 'generic' | 'none';

export type ResolvedTables = {
  schema: ResolvedTableSchema;
  conversations: string;
  messages: string;
  inboxState: string;
};

const IVX_TABLES: ResolvedTables = {
  schema: 'ivx',
  conversations: IVX_OWNER_AI_TABLES.conversations,
  messages: IVX_OWNER_AI_TABLES.messages,
  inboxState: IVX_OWNER_AI_TABLES.inboxState,
};

const GENERIC_TABLES: ResolvedTables = {
  schema: 'generic',
  conversations: 'conversations',
  messages: 'messages',
  inboxState: 'conversation_participants',
};

const NONE_TABLES: ResolvedTables = {
  schema: 'none',
  conversations: IVX_OWNER_AI_TABLES.conversations,
  messages: IVX_OWNER_AI_TABLES.messages,
  inboxState: IVX_OWNER_AI_TABLES.inboxState,
};

let cachedResolution: ResolvedTables | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60_000;

async function canQueryTable(table: string, field: string): Promise<boolean> {
  try {
    const client = getIVXSupabaseClient();
    const { error } = await client.from(table).select(field).limit(1);
    if (error) {
      console.log(`[IVXTableResolver] Probe failed for ${table}:`, error.message);
      return false;
    }
    console.log(`[IVXTableResolver] Probe OK for ${table}`);
    return true;
  } catch (err) {
    console.log(`[IVXTableResolver] Probe exception for ${table}:`, err instanceof Error ? err.message : 'unknown');
    return false;
  }
}

export async function resolveIVXTables(): Promise<ResolvedTables> {
  const now = Date.now();
  if (cachedResolution && (now - cachedAt) < CACHE_TTL_MS) {
    return cachedResolution;
  }

  console.log('[IVXTableResolver] Probing for available tables...');

  const ivxConvOk = await canQueryTable(IVX_OWNER_AI_TABLES.conversations, 'id');
  const ivxMsgOk = await canQueryTable(IVX_OWNER_AI_TABLES.messages, 'id');

  if (ivxConvOk && ivxMsgOk) {
    console.log('[IVXTableResolver] RESOLVED: Using IVX tables (ivx_conversations, ivx_messages)');
    cachedResolution = IVX_TABLES;
    cachedAt = Date.now();
    return IVX_TABLES;
  }

  const genConvOk = await canQueryTable('conversations', 'id');
  const genMsgOk = await canQueryTable('messages', 'id');

  if (genConvOk && genMsgOk) {
    console.log('[IVXTableResolver] RESOLVED: Using generic tables (conversations, messages)');
    cachedResolution = GENERIC_TABLES;
    cachedAt = Date.now();
    return GENERIC_TABLES;
  }

  console.log('[IVXTableResolver] RESOLVED: No tables found — will use ivx defaults (will fail gracefully)');
  cachedResolution = NONE_TABLES;
  cachedAt = Date.now();
  return NONE_TABLES;
}

export function invalidateTableResolverCache(): void {
  cachedResolution = null;
  cachedAt = 0;
  console.log('[IVXTableResolver] Cache invalidated');
}

export function getDetectedSchema(): ResolvedTableSchema {
  return cachedResolution?.schema ?? 'none';
}

export function mapGenericMessageRow(row: Record<string, unknown>): {
  id: string;
  conversation_id: string;
  sender_user_id: string | null;
  sender_role: 'owner' | 'assistant' | 'system';
  sender_label: string | null;
  body: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  attachment_mime: string | null;
  attachment_size: number | null;
  attachment_kind: string | null;
  created_at: string;
  updated_at: string;
} {
  const senderIdRaw = (row.sender_user_id ?? row.sender_id ?? null) as string | null;
  const senderRole = (row.sender_role ?? 'owner') as 'owner' | 'assistant' | 'system';
  const body = (row.body ?? row.text ?? null) as string | null;
  const attachmentUrl = (row.attachment_url ?? row.file_url ?? null) as string | null;
  const attachmentName = (row.attachment_name ?? row.file_name ?? null) as string | null;
  const attachmentMime = (row.attachment_mime ?? row.file_mime ?? null) as string | null;
  const attachmentSize = (row.attachment_size ?? row.file_size ?? null) as number | null;
  const attachmentKind = (row.attachment_kind ?? null) as string | null;

  return {
    id: row.id as string,
    conversation_id: row.conversation_id as string,
    sender_user_id: senderIdRaw,
    sender_role: senderRole,
    sender_label: (row.sender_label ?? null) as string | null,
    body,
    attachment_url: attachmentUrl,
    attachment_name: attachmentName,
    attachment_mime: attachmentMime,
    attachment_size: attachmentSize,
    attachment_kind: attachmentKind,
    created_at: (row.created_at ?? new Date().toISOString()) as string,
    updated_at: (row.updated_at ?? new Date().toISOString()) as string,
  };
}

export function buildMessageInsertPayload(
  schema: ResolvedTableSchema,
  input: {
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
  },
): Record<string, unknown> {
  const now = new Date().toISOString();

  if (schema === 'generic') {
    return {
      conversation_id: input.conversationId,
      sender_id: input.senderUserId ?? 'unknown',
      sender_label: input.senderLabel,
      body: input.body,
      text: input.body,
      file_url: input.attachmentUrl ?? null,
      file_name: input.attachmentName ?? null,
      file_mime: input.attachmentMime ?? null,
      file_size: input.attachmentSize ?? null,
      created_at: now,
      updated_at: now,
    };
  }

  return {
    conversation_id: input.conversationId,
    sender_user_id: input.senderUserId,
    sender_role: input.senderRole,
    sender_label: input.senderLabel,
    body: input.body,
    attachment_url: input.attachmentUrl ?? null,
    attachment_name: input.attachmentName ?? null,
    attachment_mime: input.attachmentMime ?? null,
    attachment_size: input.attachmentSize ?? null,
    attachment_kind: input.attachmentKind ?? 'text',
    created_at: now,
    updated_at: now,
  };
}

export function buildInboxUpsertPayload(
  schema: ResolvedTableSchema,
  conversationId: string,
  userId: string,
): { payload: Record<string, unknown>; onConflict: string } {
  const now = new Date().toISOString();

  if (schema === 'generic') {
    return {
      payload: {
        conversation_id: conversationId,
        user_id: userId,
        unread_count: 0,
        last_read_at: now,
      },
      onConflict: 'conversation_id,user_id',
    };
  }

  return {
    payload: {
      conversation_id: conversationId,
      user_id: userId,
      unread_count: 0,
      last_read_at: now,
      updated_at: now,
    },
    onConflict: 'conversation_id,user_id',
  };
}
