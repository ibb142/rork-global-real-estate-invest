import AsyncStorage from '@react-native-async-storage/async-storage';

export type MessageReactionRecord = {
  /** map of emoji -> array of user ids who reacted */
  byEmoji: Record<string, string[]>;
};

export type MessageReactionSummary = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

export type ConversationReactionsMap = Record<string, MessageReactionRecord>;

const STORAGE_PREFIX = 'ivx_chat_reactions:';

function getStorageKey(conversationId: string): string {
  return `${STORAGE_PREFIX}${conversationId}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

function normalizeMap(value: unknown): ConversationReactionsMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const out: ConversationReactionsMap = {};
  for (const [messageId, record] of Object.entries(value as Record<string, unknown>)) {
    if (!record || typeof record !== 'object') {
      continue;
    }
    const byEmoji = (record as { byEmoji?: unknown }).byEmoji;
    if (!byEmoji || typeof byEmoji !== 'object') {
      continue;
    }
    const cleanedByEmoji: Record<string, string[]> = {};
    for (const [emoji, userIds] of Object.entries(byEmoji as Record<string, unknown>)) {
      if (isStringArray(userIds) && userIds.length > 0) {
        const unique = Array.from(new Set(userIds.filter((id) => id.trim().length > 0)));
        if (unique.length > 0) {
          cleanedByEmoji[emoji] = unique;
        }
      }
    }
    if (Object.keys(cleanedByEmoji).length > 0) {
      out[messageId] = { byEmoji: cleanedByEmoji };
    }
  }
  return out;
}

export async function loadConversationReactions(conversationId: string): Promise<ConversationReactionsMap> {
  const key = getStorageKey(conversationId);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return {};
    }
    return normalizeMap(JSON.parse(raw));
  } catch (error) {
    console.log('[messageReactions] Load failed:', error instanceof Error ? error.message : 'unknown');
    return {};
  }
}

async function writeConversationReactions(conversationId: string, map: ConversationReactionsMap): Promise<void> {
  const key = getStorageKey(conversationId);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(map));
  } catch (error) {
    console.log('[messageReactions] Save failed:', error instanceof Error ? error.message : 'unknown');
  }
}

export async function toggleReactionPersisted(
  conversationId: string,
  messageId: string,
  emoji: string,
  userId: string,
): Promise<ConversationReactionsMap> {
  const map = await loadConversationReactions(conversationId);
  const nextMap = applyToggle(map, messageId, emoji, userId);
  await writeConversationReactions(conversationId, nextMap);
  return nextMap;
}

export function applyToggle(
  map: ConversationReactionsMap,
  messageId: string,
  emoji: string,
  userId: string,
): ConversationReactionsMap {
  const trimmedUser = userId.trim();
  if (!trimmedUser || !messageId || !emoji) {
    return map;
  }

  const existing = map[messageId]?.byEmoji ?? {};
  const currentUsers = existing[emoji] ?? [];
  const has = currentUsers.includes(trimmedUser);

  const nextUsers = has
    ? currentUsers.filter((id) => id !== trimmedUser)
    : [...currentUsers, trimmedUser];

  const nextByEmoji: Record<string, string[]> = { ...existing };
  if (nextUsers.length > 0) {
    nextByEmoji[emoji] = nextUsers;
  } else {
    delete nextByEmoji[emoji];
  }

  const next: ConversationReactionsMap = { ...map };
  if (Object.keys(nextByEmoji).length > 0) {
    next[messageId] = { byEmoji: nextByEmoji };
  } else {
    delete next[messageId];
  }

  return next;
}

export function summarizeReactions(
  record: MessageReactionRecord | undefined,
  currentUserId: string,
): MessageReactionSummary[] {
  if (!record) {
    return [];
  }
  const trimmedUser = currentUserId.trim();
  return Object.entries(record.byEmoji)
    .map(([emoji, userIds]) => ({
      emoji,
      count: userIds.length,
      reactedByMe: trimmedUser.length > 0 && userIds.includes(trimmedUser),
    }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => (b.count - a.count) || a.emoji.localeCompare(b.emoji));
}
