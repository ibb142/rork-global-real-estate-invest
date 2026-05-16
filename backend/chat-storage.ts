import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ChatMessageSource, ChatRoomMessage } from './chat-types';

type ChatStorageFile = {
  messages: ChatRoomMessage[];
};

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;
const MAX_STORED_MESSAGES = 5_000;

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return `${prefix}-${cryptoRef.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isMessageSource(value: unknown): value is ChatMessageSource {
  return value === 'user' || value === 'assistant' || value === 'system';
}

function normalizeMessage(value: unknown): ChatRoomMessage | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  const roomId = typeof record.roomId === 'string' ? record.roomId.trim() : '';
  const username = typeof record.username === 'string' ? record.username.trim() : '';
  const text = typeof record.text === 'string' ? record.text : '';
  const source = isMessageSource(record.source) ? record.source : null;
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt.trim() : '';

  if (!id || !roomId || !username || !source || !createdAt) {
    return null;
  }

  return {
    id,
    roomId,
    username,
    text,
    source,
    createdAt,
  };
}

function sanitizeLimit(limit: number): number {
  return Number.isFinite(limit) ? Math.min(Math.max(limit, 1), MAX_LIMIT) : DEFAULT_LIMIT;
}

function parseStorageFile(text: string): ChatRoomMessage[] {
  const parsed = JSON.parse(text) as Partial<ChatStorageFile>;
  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  return messages
    .map(normalizeMessage)
    .filter((message): message is ChatRoomMessage => message !== null)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
    .slice(-MAX_STORED_MESSAGES);
}

export class ChatStorage {
  private readonly databasePath: string;
  private messages: ChatRoomMessage[] = [];

  constructor(databasePath: string) {
    this.databasePath = databasePath.endsWith('.json') ? databasePath : `${databasePath}.json`;
    mkdirSync(dirname(this.databasePath), { recursive: true });
    this.messages = this.loadMessages();
    console.log('[ChatStorage] Portable JSON storage ready', {
      databasePath: this.databasePath,
      messageCount: this.messages.length,
      maxStoredMessages: MAX_STORED_MESSAGES,
    });
  }

  private loadMessages(): ChatRoomMessage[] {
    if (!existsSync(this.databasePath)) {
      console.log('[ChatStorage] No existing message store found; starting empty', { databasePath: this.databasePath });
      return [];
    }

    try {
      const text = readFileSync(this.databasePath, 'utf8');
      const messages = parseStorageFile(text);
      console.log('[ChatStorage] Message store loaded', {
        databasePath: this.databasePath,
        messageCount: messages.length,
      });
      return messages;
    } catch (error) {
      console.log('[ChatStorage] Message store load failed; starting empty', {
        databasePath: this.databasePath,
        error: error instanceof Error ? error.message : 'unknown',
      });
      return [];
    }
  }

  private persistMessages(): void {
    const trimmedMessages = this.messages.slice(-MAX_STORED_MESSAGES);
    this.messages = trimmedMessages;
    const temporaryPath = `${this.databasePath}.tmp`;
    const payload: ChatStorageFile = { messages: trimmedMessages };
    writeFileSync(temporaryPath, JSON.stringify(payload), 'utf8');
    renameSync(temporaryPath, this.databasePath);
    console.log('[ChatStorage] Message store persisted', {
      databasePath: this.databasePath,
      messageCount: trimmedMessages.length,
    });
  }

  listMessages(roomId: string, limit: number = DEFAULT_LIMIT): ChatRoomMessage[] {
    const safeLimit = sanitizeLimit(limit);
    return this.messages
      .filter((message) => message.roomId === roomId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .slice(-safeLimit);
  }

  createMessage(input: {
    roomId: string;
    username: string;
    text: string;
    source: ChatMessageSource;
  }): ChatRoomMessage {
    const message: ChatRoomMessage = {
      id: createId('chat-message'),
      roomId: input.roomId,
      username: input.username,
      text: input.text,
      source: input.source,
      createdAt: nowIso(),
    };

    this.messages.push(message);
    this.persistMessages();

    console.log('[ChatStorage] Message stored', {
      messageId: message.id,
      roomId: message.roomId,
      username: message.username,
      source: message.source,
    });

    return message;
  }

  getRoomMessageCount(roomId: string): number {
    return this.messages.filter((message) => message.roomId === roomId).length;
  }

  getTotalMessageCount(): number {
    return this.messages.length;
  }

  /**
   * Lists rooms whose roomId begins with the supplied prefix.
   * Returns the room id, total message count, last activity timestamp,
   * the last message preview (truncated to 160 chars), and the distinct usernames seen.
   * Results are sorted by lastUpdatedAt descending.
   */
  listRoomsWithPrefix(prefix: string, limit: number = 50): Array<{
    roomId: string;
    messageCount: number;
    lastUpdatedAt: string;
    lastMessagePreview: string;
    usernames: string[];
  }> {
    const safeLimit = Math.min(Math.max(Math.floor(limit), 1), 200);
    const grouped = new Map<string, {
      roomId: string;
      messageCount: number;
      lastUpdatedAt: string;
      lastMessagePreview: string;
      usernames: Set<string>;
    }>();

    for (const message of this.messages) {
      if (!message.roomId.startsWith(prefix)) continue;
      const entry = grouped.get(message.roomId);
      if (!entry) {
        grouped.set(message.roomId, {
          roomId: message.roomId,
          messageCount: 1,
          lastUpdatedAt: message.createdAt,
          lastMessagePreview: message.text.slice(0, 160),
          usernames: new Set([message.username]),
        });
        continue;
      }
      entry.messageCount += 1;
      entry.usernames.add(message.username);
      if (message.createdAt.localeCompare(entry.lastUpdatedAt) > 0) {
        entry.lastUpdatedAt = message.createdAt;
        entry.lastMessagePreview = message.text.slice(0, 160);
      }
    }

    return Array.from(grouped.values())
      .map((entry) => ({
        roomId: entry.roomId,
        messageCount: entry.messageCount,
        lastUpdatedAt: entry.lastUpdatedAt,
        lastMessagePreview: entry.lastMessagePreview,
        usernames: Array.from(entry.usernames),
      }))
      .sort((left, right) => right.lastUpdatedAt.localeCompare(left.lastUpdatedAt))
      .slice(0, safeLimit);
  }

  close(): void {
    console.log('[ChatStorage] Storage close requested', {
      databasePath: this.databasePath,
      messageCount: this.messages.length,
    });
  }
}
