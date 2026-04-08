import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import type { ChatFileType, ChatMessage, ChatProvider, SendMessageInput } from '../types/chat';

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  text: string | null;
  file_url: string | null;
  file_type: string | null;
  created_at: string;
};

type SnapshotRow = {
  id: string;
  snapshot_type: string;
  data: Record<string, unknown> | null;
  created_at: string;
};

type ErrorLike = {
  code?: string;
  message?: string;
};

type ChatStorageMode = 'unknown' | 'primary' | 'fallback' | 'local';

const CHAT_TABLE = 'messages';
const CHAT_FALLBACK_TABLE = 'realtime_snapshots';
const CHAT_FALLBACK_PREFIX = 'chat_message:';
const CHAT_LOCAL_PREFIX = 'ivx_chat_room:';
const CHAT_LOCAL_MAX_MESSAGES = 250;
const CHAT_POLL_INTERVAL_MS = 2500;

let chatStorageMode: ChatStorageMode = 'unknown';

function normalizeFileType(value: string | null | undefined): ChatFileType | null {
  if (value === 'image' || value === 'video' || value === 'pdf' || value === 'file') {
    return value;
  }

  return null;
}

function readStringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sortMessages(left: ChatMessage, right: ChatMessage): number {
  return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
}

function isSchemaMissingError(error: ErrorLike | null | undefined): boolean {
  const code = (error?.code ?? '').toUpperCase();
  const message = (error?.message ?? '').toLowerCase();

  return code === 'PGRST204'
    || code === 'PGRST205'
    || code === '42P01'
    || message.includes('schema cache')
    || message.includes('could not find the table')
    || message.includes('does not exist')
    || (message.includes('relation') && message.includes('does not exist'));
}

function isPermissionError(error: ErrorLike | null | undefined): boolean {
  const code = (error?.code ?? '').toUpperCase();
  const message = (error?.message ?? '').toLowerCase();

  return code === '42501'
    || code === '401'
    || code === '403'
    || message.includes('row-level security')
    || message.includes('permission denied')
    || message.includes('not authorized')
    || message.includes('unauthorized')
    || message.includes('jwt')
    || message.includes('auth session missing')
    || message.includes('not_authenticated')
    || message.includes('anonymous')
    || message.includes('violates row-level security');
}

function isConnectivityError(error: ErrorLike | null | undefined): boolean {
  const message = (error?.message ?? '').toLowerCase();

  return message.includes('network request failed')
    || message.includes('failed to fetch')
    || message.includes('fetch failed')
    || message.includes('network timeout')
    || message.includes('timed out')
    || message.includes('timeout')
    || message.includes('abort');
}

function shouldUseLocalFallback(error: ErrorLike | null | undefined): boolean {
  return isPermissionError(error) || isConnectivityError(error);
}

function buildFallbackSnapshotType(conversationId: string): string {
  return `${CHAT_FALLBACK_PREFIX}${conversationId}`;
}

function getLocalStorageKey(conversationId: string): string {
  return `${CHAT_LOCAL_PREFIX}${conversationId}`;
}

function buildFallbackPayload(input: SendMessageInput, createdAt: string): Record<string, unknown> {
  return {
    conversationId: input.conversationId,
    senderId: input.senderId,
    text: input.text?.trim() ?? null,
    fileUrl: input.fileUrl ?? null,
    fileType: input.fileType ?? null,
    createdAt,
  };
}

function mapRow(row: Partial<MessageRow>): ChatMessage {
  return {
    id: row.id ?? '',
    conversationId: row.conversation_id ?? '',
    senderId: row.sender_id ?? '',
    text: row.text ?? null,
    fileUrl: row.file_url ?? null,
    fileType: normalizeFileType(row.file_type),
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function mapSnapshotRow(row: Partial<SnapshotRow>): ChatMessage {
  const payload = isRecord(row.data) ? row.data : {};
  const createdAt = readStringValue(payload.createdAt) ?? row.created_at ?? new Date().toISOString();

  return {
    id: row.id ?? '',
    conversationId: readStringValue(payload.conversationId) ?? '',
    senderId: readStringValue(payload.senderId) ?? '',
    text: readStringValue(payload.text),
    fileUrl: readStringValue(payload.fileUrl),
    fileType: normalizeFileType(readStringValue(payload.fileType)),
    createdAt,
  };
}

function coerceLocalMessage(value: unknown, conversationId: string): ChatMessage | null {
  if (!isRecord(value)) {
    return null;
  }

  const normalizedConversationId = readStringValue(value.conversationId) ?? conversationId;
  const senderId = readStringValue(value.senderId);
  const createdAt = readStringValue(value.createdAt) ?? new Date().toISOString();
  const id = readStringValue(value.id) ?? `local-${createdAt}`;

  if (!normalizedConversationId || !senderId) {
    return null;
  }

  return {
    id,
    conversationId: normalizedConversationId,
    senderId,
    text: readStringValue(value.text),
    fileUrl: readStringValue(value.fileUrl),
    fileType: normalizeFileType(readStringValue(value.fileType)),
    createdAt,
  };
}

async function listMessagesFromLocal(conversationId: string): Promise<ChatMessage[]> {
  console.log('[SupabaseChatProvider] Loading local fallback messages for conversation:', conversationId);

  try {
    const raw = await AsyncStorage.getItem(getLocalStorageKey(conversationId));
    if (!raw) {
      return [];
    }

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    const messages = parsed
      .map((item) => coerceLocalMessage(item, conversationId))
      .filter((item): item is ChatMessage => !!item)
      .sort(sortMessages);

    console.log('[SupabaseChatProvider] Loaded local fallback messages:', messages.length);
    return messages;
  } catch (error) {
    console.log('[SupabaseChatProvider] Local listMessages error:', (error as Error)?.message ?? 'Unknown error');
    return [];
  }
}

async function saveMessagesToLocal(conversationId: string, messages: ChatMessage[]): Promise<void> {
  const normalizedMessages = [...messages].sort(sortMessages).slice(-CHAT_LOCAL_MAX_MESSAGES);
  await AsyncStorage.setItem(getLocalStorageKey(conversationId), JSON.stringify(normalizedMessages));
}

async function appendLocalMessage(input: SendMessageInput): Promise<void> {
  const createdAt = new Date().toISOString();
  const nextMessage: ChatMessage = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    conversationId: input.conversationId,
    senderId: input.senderId,
    text: input.text?.trim() ?? null,
    fileUrl: input.fileUrl ?? null,
    fileType: input.fileType ?? null,
    createdAt,
  };

  const existingMessages = await listMessagesFromLocal(input.conversationId);
  await saveMessagesToLocal(input.conversationId, [...existingMessages, nextMessage]);
  console.log('[SupabaseChatProvider] Local fallback message saved:', nextMessage.id);
}

async function listMessagesFromFallback(conversationId: string): Promise<ChatMessage[]> {
  console.log('[SupabaseChatProvider] Loading fallback snapshot messages for conversation:', conversationId);

  const { data, error } = await supabase
    .from(CHAT_FALLBACK_TABLE)
    .select('id, snapshot_type, data, created_at')
    .eq('snapshot_type', buildFallbackSnapshotType(conversationId))
    .order('created_at', { ascending: true });

  if (error) {
    if (isSchemaMissingError(error)) {
      console.log('[SupabaseChatProvider] Snapshot fallback table missing. Switching to local fallback.');
      chatStorageMode = 'local';
      return listMessagesFromLocal(conversationId);
    }

    if (shouldUseLocalFallback(error)) {
      console.log('[SupabaseChatProvider] Snapshot access unavailable. Switching to local fallback.');
      chatStorageMode = 'local';
      return listMessagesFromLocal(conversationId);
    }

    console.log('[SupabaseChatProvider] Fallback listMessages error:', error.message);
    throw new Error(error.message || 'Failed to load the chat room.');
  }

  const messages = (data ?? [])
    .map((row) => mapSnapshotRow(row as Partial<SnapshotRow>))
    .filter((message) => message.conversationId === conversationId || !message.conversationId)
    .sort(sortMessages);

  chatStorageMode = 'fallback';
  console.log('[SupabaseChatProvider] Loaded fallback messages:', messages.length);
  return messages;
}

async function sendMessageToFallback(input: SendMessageInput): Promise<void> {
  const createdAt = new Date().toISOString();
  console.log('[SupabaseChatProvider] Writing fallback snapshot message:', {
    conversationId: input.conversationId,
    senderId: input.senderId,
    hasText: !!input.text?.trim(),
    hasFile: !!input.fileUrl,
  });

  const { error } = await supabase.from(CHAT_FALLBACK_TABLE).insert({
    snapshot_type: buildFallbackSnapshotType(input.conversationId),
    data: buildFallbackPayload(input, createdAt),
    active_visitors: 0,
  });

  if (error) {
    if (isSchemaMissingError(error)) {
      console.log('[SupabaseChatProvider] Snapshot fallback table missing during send. Switching to local fallback.');
      chatStorageMode = 'local';
      await appendLocalMessage(input);
      return;
    }

    if (shouldUseLocalFallback(error)) {
      console.log('[SupabaseChatProvider] Snapshot write unavailable. Switching to local fallback.');
      chatStorageMode = 'local';
      await appendLocalMessage(input);
      return;
    }

    console.log('[SupabaseChatProvider] Fallback sendMessage error:', error.message);
    throw new Error(error.message || 'Failed to send the message.');
  }

  chatStorageMode = 'fallback';
}

async function listMessagesWithFallback(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from(CHAT_TABLE)
    .select('id, conversation_id, sender_id, text, file_url, file_type, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    if (isSchemaMissingError(error)) {
      console.log('[SupabaseChatProvider] Primary messages table missing. Falling back to realtime snapshots.');
      return listMessagesFromFallback(conversationId);
    }

    if (shouldUseLocalFallback(error)) {
      console.log('[SupabaseChatProvider] Primary room unavailable. Switching to local fallback.');
      chatStorageMode = 'local';
      return listMessagesFromLocal(conversationId);
    }

    console.log('[SupabaseChatProvider] listMessages error:', error.message);
    throw new Error(error.message || 'Failed to load chat messages.');
  }

  chatStorageMode = 'primary';
  const messages = (data ?? []).map((row) => mapRow(row as Partial<MessageRow>)).sort(sortMessages);
  console.log('[SupabaseChatProvider] Loaded messages:', messages.length);
  return messages;
}

async function sendMessageWithFallback(input: SendMessageInput): Promise<void> {
  const trimmedText = input.text?.trim();
  const { error } = await supabase.from(CHAT_TABLE).insert({
    conversation_id: input.conversationId,
    sender_id: input.senderId,
    text: trimmedText ?? null,
    file_url: input.fileUrl ?? null,
    file_type: input.fileType ?? null,
  });

  if (error) {
    if (isSchemaMissingError(error)) {
      console.log('[SupabaseChatProvider] Primary messages table missing during send. Falling back to realtime snapshots.');
      await sendMessageToFallback({
        ...input,
        text: trimmedText,
      });
      return;
    }

    if (shouldUseLocalFallback(error)) {
      console.log('[SupabaseChatProvider] Primary send unavailable. Switching to local fallback.');
      chatStorageMode = 'local';
      await appendLocalMessage({
        ...input,
        text: trimmedText,
      });
      return;
    }

    console.log('[SupabaseChatProvider] sendMessage error:', error.message);
    throw new Error(error.message || 'Failed to send the message.');
  }

  chatStorageMode = 'primary';
}

function createPrimaryRealtimeChannel(
  conversationId: string,
  seenMessageIds: Set<string>,
  onMessage: (message: ChatMessage) => void,
): () => void {
  const channelName = `messages:${conversationId}:${Date.now()}`;
  console.log('[SupabaseChatProvider] Subscribing to realtime channel:', channelName);

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: CHAT_TABLE,
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const nextMessage = mapRow(payload.new as Partial<MessageRow>);
        if (!nextMessage.id || seenMessageIds.has(nextMessage.id)) {
          return;
        }

        seenMessageIds.add(nextMessage.id);
        chatStorageMode = 'primary';
        console.log('[SupabaseChatProvider] Realtime message received:', nextMessage.id);
        onMessage(nextMessage);
      },
    )
    .subscribe((status) => {
      console.log('[SupabaseChatProvider] Channel status:', channelName, status);
    });

  return () => {
    console.log('[SupabaseChatProvider] Removing realtime channel:', channelName);
    void supabase.removeChannel(channel);
  };
}

export const supabaseChatProvider: ChatProvider = {
  async listMessages(conversationId: string): Promise<ChatMessage[]> {
    console.log('[SupabaseChatProvider] Loading messages for conversation:', conversationId);

    if (!conversationId.trim()) {
      return [];
    }

    return listMessagesWithFallback(conversationId);
  },

  async sendMessage(input: SendMessageInput): Promise<void> {
    const trimmedText = input.text?.trim();
    const hasText = !!trimmedText;
    const hasFile = !!input.fileUrl;

    if (!hasText && !hasFile) {
      throw new Error('Please enter a message or attach a file before sending.');
    }

    console.log('[SupabaseChatProvider] Sending message:', {
      conversationId: input.conversationId,
      senderId: input.senderId,
      hasText,
      hasFile,
      fileType: input.fileType ?? null,
    });

    await sendMessageWithFallback({
      ...input,
      text: trimmedText,
    });
  },

  subscribeToMessages(
    conversationId: string,
    onMessage: (message: ChatMessage) => void,
  ): () => void {
    if (!conversationId.trim()) {
      return () => {};
    }

    const seenMessageIds = new Set<string>();
    let pollCancelled = false;
    let cleanupRealtimeChannel = () => {};

    const pollForMessages = async (): Promise<void> => {
      if (pollCancelled) {
        return;
      }

      try {
        const latestMessages = await listMessagesWithFallback(conversationId);
        latestMessages.forEach((message) => {
          if (!message.id || seenMessageIds.has(message.id)) {
            return;
          }

          seenMessageIds.add(message.id);
          onMessage(message);
        });
      } catch (error) {
        console.log('[SupabaseChatProvider] Polling subscription error:', (error as Error)?.message ?? 'Unknown error');
      }
    };

    void (async () => {
      await pollForMessages();
      if (!pollCancelled && chatStorageMode === 'primary') {
        cleanupRealtimeChannel = createPrimaryRealtimeChannel(conversationId, seenMessageIds, onMessage);
      }
    })();

    const pollingInterval = setInterval(() => {
      void pollForMessages();
    }, CHAT_POLL_INTERVAL_MS);

    return () => {
      pollCancelled = true;
      clearInterval(pollingInterval);
      cleanupRealtimeChannel();
    };
  },
};
