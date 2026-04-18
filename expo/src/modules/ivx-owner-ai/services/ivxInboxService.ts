import { getIVXOwnerAuthContext, getIVXSupabaseClient } from '@/lib/ivx-supabase-client';
import { type IVXConversation, type IVXInboxItem } from '@/shared/ivx';
import { ivxChatService } from './ivxChatService';
import { resolveIVXTables, buildInboxUpsertPayload, getScopedSupabaseClient, getRealtimeSchema } from './ivxTableResolver';

type IVXConversationRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  last_message_text: string | null;
  last_message_at: string | null;
};

type IVXInboxStateRow = {
  conversation_id: string;
  user_id: string;
  unread_count: number | null;
  last_read_at: string | null;
};

function nowIso(): string {
  return new Date().toISOString();
}

function mapInboxItem(conversation: IVXConversationRow, inboxState: IVXInboxStateRow | null): IVXInboxItem {
  return {
    conversationId: conversation.id,
    slug: conversation.slug,
    title: conversation.title,
    subtitle: conversation.subtitle,
    unreadCount: inboxState?.unread_count ?? 0,
    lastReadAt: inboxState?.last_read_at ?? null,
    lastMessageText: conversation.last_message_text,
    lastMessageAt: conversation.last_message_at,
  };
}

function getRowsFromSelectResult(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  }

  if (data && typeof data === 'object') {
    return [data as Record<string, unknown>];
  }

  return [];
}

function getFirstRowFromSelectResult(data: unknown, context: string): Record<string, unknown> | null {
  const rows = getRowsFromSelectResult(data);

  if (rows.length > 1) {
    console.log(`[IVXInboxService] ${context} returned multiple rows; using the first row to avoid singular coercion failure:`, {
      rowCount: rows.length,
    });
  }

  return rows[0] ?? null;
}

async function ensureInboxState(conversation: IVXConversation): Promise<void> {
  const client = getIVXSupabaseClient();
  const ownerContext = await getIVXOwnerAuthContext();
  const tables = await resolveIVXTables();
  const scopedClient = getScopedSupabaseClient(client, tables.dbSchema);
  const { payload, onConflict } = buildInboxUpsertPayload(tables.schema, conversation.id, ownerContext.userId);

  const upsertResult = await scopedClient.from(tables.inboxState).upsert(payload, {
    onConflict,
  });

  if (upsertResult.error) {
    console.log('[IVXInboxService] Failed to ensure inbox state (non-blocking):', upsertResult.error.message);
  }
}

async function loadOwnerInbox(): Promise<IVXInboxItem[]> {
  const client = getIVXSupabaseClient();
  const ownerContext = await getIVXOwnerAuthContext();
  const tables = await resolveIVXTables();
  const scopedClient = getScopedSupabaseClient(client, tables.dbSchema);
  const conversation = await ivxChatService.bootstrapOwnerConversation();
  await ensureInboxState(conversation);

  const conversationResult = await scopedClient.from(tables.conversations).select('*').eq('id', conversation.id).limit(2);
  if (conversationResult.error) {
    console.log('[IVXInboxService] Failed to load conversation:', conversationResult.error.message);
    throw new Error(conversationResult.error.message);
  }

  const inboxStateResult = await scopedClient.from(tables.inboxState).select('*').eq('conversation_id', conversation.id).eq('user_id', ownerContext.userId).limit(2);
  if (inboxStateResult.error) {
    console.log('[IVXInboxService] Failed to load inbox state (non-blocking):', inboxStateResult.error.message);
  }

  const conversationRow = getFirstRowFromSelectResult(conversationResult.data, 'Inbox conversation lookup');
  if (!conversationRow) {
    throw new Error('Inbox conversation lookup returned no rows.');
  }

  const inboxStateRow = getFirstRowFromSelectResult(inboxStateResult.data, 'Inbox state lookup');
  return [mapInboxItem(conversationRow as IVXConversationRow, (inboxStateRow ?? null) as IVXInboxStateRow | null)];
}

async function markOwnerConversationAsRead(conversationId?: string): Promise<void> {
  const client = getIVXSupabaseClient();
  const ownerContext = await getIVXOwnerAuthContext();
  const tables = await resolveIVXTables();
  const scopedClient = getScopedSupabaseClient(client, tables.dbSchema);
  const conversation = conversationId
    ? { id: conversationId } as IVXConversation
    : await ivxChatService.bootstrapOwnerConversation();

  const updatePayload: Record<string, unknown> = {
    unread_count: 0,
    last_read_at: nowIso(),
  };

  if (tables.schema === 'ivx') {
    updatePayload.updated_at = nowIso();
  }

  const updateResult = await scopedClient.from(tables.inboxState).update(updatePayload).eq('conversation_id', conversation.id).eq('user_id', ownerContext.userId);

  if (updateResult.error) {
    console.log('[IVXInboxService] Failed to mark inbox as read (non-blocking):', updateResult.error.message);
  }
}

async function subscribeToOwnerInbox(onChange: (items: IVXInboxItem[]) => void): Promise<() => void> {
  const client = getIVXSupabaseClient();
  const ownerContext = await getIVXOwnerAuthContext();
  const tables = await resolveIVXTables();
  const conversation = await ivxChatService.bootstrapOwnerConversation();
  const realtimeSchema = getRealtimeSchema(tables);

  const reloadInbox = async (): Promise<void> => {
    const items = await loadOwnerInbox();
    onChange(items);
  };

  let closed = false;
  let unsubscribeStarted = false;
  let channelTerminated = false;
  const channelName = `ivx-owner-inbox:${ownerContext.userId}`;

  const channel = client.channel(channelName).on('postgres_changes', {
    event: '*',
    schema: realtimeSchema,
    table: tables.inboxState,
    filter: `user_id=eq.${ownerContext.userId}`,
  }, () => {
    if (closed) {
      return;
    }
    console.log('[IVXInboxService] Inbox state changed, reloading');
    void reloadInbox();
  }).on('postgres_changes', {
    event: '*',
    schema: realtimeSchema,
    table: tables.conversations,
    filter: `id=eq.${conversation.id}`,
  }, () => {
    if (closed) {
      return;
    }
    console.log('[IVXInboxService] Conversation summary changed, reloading');
    void reloadInbox();
  }).subscribe((status) => {
    const normalizedStatus = String(status ?? '').toLowerCase();
    console.log('[IVXInboxService] Realtime status:', normalizedStatus);
    if (normalizedStatus === 'closed') {
      channelTerminated = true;
      closed = true;
    }
  });

  const safeClose = (reason: string): void => {
    if (unsubscribeStarted) {
      return;
    }

    unsubscribeStarted = true;
    closed = true;
    console.log('[IVXInboxService] Closing inbox realtime channel:', reason, 'channel:', channelName, 'alreadyTerminated:', channelTerminated);

    if (!channelTerminated) {
      try {
        void channel.unsubscribe();
      } catch (error) {
        console.log('[IVXInboxService] Inbox realtime unsubscribe note:', error instanceof Error ? error.message : 'unknown');
      }
    }
  };

  return () => {
    safeClose('cleanup');
  };
}

export const ivxInboxService = {
  loadOwnerInbox,
  markOwnerConversationAsRead,
  subscribeToOwnerInbox,
};
