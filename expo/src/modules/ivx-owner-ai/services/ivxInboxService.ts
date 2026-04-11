import { getIVXOwnerAuthContext, getIVXSupabaseClient } from '@/lib/ivx-supabase-client';
import { type IVXConversation, type IVXInboxItem } from '@/shared/ivx';
import { ivxChatService } from './ivxChatService';
import { resolveIVXTables, buildInboxUpsertPayload } from './ivxTableResolver';

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

async function ensureInboxState(conversation: IVXConversation): Promise<void> {
  const client = getIVXSupabaseClient();
  const ownerContext = await getIVXOwnerAuthContext();
  const tables = await resolveIVXTables();
  const { payload, onConflict } = buildInboxUpsertPayload(tables.schema, conversation.id, ownerContext.userId);

  const upsertResult = await client.from(tables.inboxState).upsert(payload, {
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
  const conversation = await ivxChatService.bootstrapOwnerConversation();
  await ensureInboxState(conversation);

  const conversationResult = await client.from(tables.conversations).select('*').eq('id', conversation.id).single();
  if (conversationResult.error) {
    console.log('[IVXInboxService] Failed to load conversation:', conversationResult.error.message);
    throw new Error(conversationResult.error.message);
  }

  const inboxStateResult = await client.from(tables.inboxState).select('*').eq('conversation_id', conversation.id).eq('user_id', ownerContext.userId).maybeSingle();
  if (inboxStateResult.error) {
    console.log('[IVXInboxService] Failed to load inbox state (non-blocking):', inboxStateResult.error.message);
  }

  return [mapInboxItem(conversationResult.data as IVXConversationRow, (inboxStateResult.data ?? null) as IVXInboxStateRow | null)];
}

async function markOwnerConversationAsRead(conversationId?: string): Promise<void> {
  const client = getIVXSupabaseClient();
  const ownerContext = await getIVXOwnerAuthContext();
  const tables = await resolveIVXTables();
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

  const updateResult = await client.from(tables.inboxState).update(updatePayload).eq('conversation_id', conversation.id).eq('user_id', ownerContext.userId);

  if (updateResult.error) {
    console.log('[IVXInboxService] Failed to mark inbox as read (non-blocking):', updateResult.error.message);
  }
}

async function subscribeToOwnerInbox(onChange: (items: IVXInboxItem[]) => void): Promise<() => void> {
  const client = getIVXSupabaseClient();
  const ownerContext = await getIVXOwnerAuthContext();
  const tables = await resolveIVXTables();
  const conversation = await ivxChatService.bootstrapOwnerConversation();

  const reloadInbox = async (): Promise<void> => {
    const items = await loadOwnerInbox();
    onChange(items);
  };

  const channel = client.channel(`ivx-owner-inbox:${ownerContext.userId}`).on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: tables.inboxState,
    filter: `user_id=eq.${ownerContext.userId}`,
  }, () => {
    console.log('[IVXInboxService] Inbox state changed, reloading');
    void reloadInbox();
  }).on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: tables.conversations,
    filter: `id=eq.${conversation.id}`,
  }, () => {
    console.log('[IVXInboxService] Conversation summary changed, reloading');
    void reloadInbox();
  }).subscribe((status) => {
    console.log('[IVXInboxService] Realtime status:', status);
  });

  return () => {
    console.log('[IVXInboxService] Removing inbox realtime channel');
    void client.removeChannel(channel);
  };
}

export const ivxInboxService = {
  loadOwnerInbox,
  markOwnerConversationAsRead,
  subscribeToOwnerInbox,
};
