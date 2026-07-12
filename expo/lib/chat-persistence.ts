import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMessage } from '@/types';

/**
 * Conversation persistence for the in-app Chat. Messages are saved per chat
 * `source` so a conversation resumes after the app restarts, while staying
 * bounded so old turns never bloat storage. Attachments still uploading at
 * save time are normalized to a stable state so a resumed conversation never
 * shows a permanent "uploading" spinner.
 */

const KEY_PREFIX = '@ivx_chat_history_v1:';
const MAX_PERSISTED_MESSAGES = 80;

function storageKey(source: string): string {
  return `${KEY_PREFIX}${source}`;
}

function normalizeForPersistence(messages: ChatMessage[]): ChatMessage[] {
  return messages.slice(-MAX_PERSISTED_MESSAGES).map((message) => {
    if (!message.attachments || message.attachments.length === 0) {
      return message;
    }

    return {
      ...message,
      attachments: message.attachments.map((attachment) => {
        if (attachment.status === 'uploading') {
          return attachment.url
            ? { ...attachment, status: 'ready' as const }
            : { ...attachment, status: 'failed' as const, error: attachment.error ?? 'Upload was interrupted.' };
        }
        return attachment;
      }),
    };
  });
}

/** Load a previously saved conversation for a chat source, or null if none. */
export async function loadChatHistory(source: string): Promise<ChatMessage[] | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(source));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as ChatMessage[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    return parsed.filter((message) => typeof message?.id === 'string' && typeof message?.message === 'string');
  } catch (error) {
    console.log('[ChatPersistence] Load failed:', (error as Error)?.message);
    return null;
  }
}

/** Persist the current conversation for a chat source (bounded + normalized). */
export async function saveChatHistory(source: string, messages: ChatMessage[]): Promise<void> {
  try {
    if (messages.length === 0) {
      return;
    }
    await AsyncStorage.setItem(storageKey(source), JSON.stringify(normalizeForPersistence(messages)));
  } catch (error) {
    console.log('[ChatPersistence] Save failed:', (error as Error)?.message);
  }
}

/** Clear the saved conversation for a chat source. */
export async function clearChatHistory(source: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKey(source));
  } catch (error) {
    console.log('[ChatPersistence] Clear failed:', (error as Error)?.message);
  }
}
