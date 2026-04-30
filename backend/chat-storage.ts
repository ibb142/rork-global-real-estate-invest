import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ChatMessageSource, ChatRoomMessage } from './chat-types';

type ChatMessageRow = {
  id: string;
  room_id: string;
  username: string;
  text: string;
  source: ChatMessageSource;
  created_at: string;
};

const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 200;

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

function mapRow(row: ChatMessageRow): ChatRoomMessage {
  return {
    id: row.id,
    roomId: row.room_id,
    username: row.username,
    text: row.text,
    source: row.source,
    createdAt: row.created_at,
  };
}

export class ChatStorage {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec('PRAGMA journal_mode = WAL;');
    this.database.exec('PRAGMA synchronous = NORMAL;');
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        username TEXT NOT NULL,
        text TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;
    `);
    this.database.exec('CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created_at ON chat_messages (room_id, created_at);');
    console.log('[ChatStorage] SQLite ready', { databasePath });
  }

  listMessages(roomId: string, limit: number = DEFAULT_LIMIT): ChatRoomMessage[] {
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), MAX_LIMIT) : DEFAULT_LIMIT;
    const statement = this.database.prepare(`
      SELECT id, room_id, username, text, source, created_at
      FROM chat_messages
      WHERE room_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    const rows = statement.all(roomId, safeLimit) as ChatMessageRow[];
    return rows.reverse().map(mapRow);
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

    const statement = this.database.prepare(`
      INSERT INTO chat_messages (id, room_id, username, text, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    statement.run(message.id, message.roomId, message.username, message.text, message.source, message.createdAt);

    console.log('[ChatStorage] Message stored', {
      messageId: message.id,
      roomId: message.roomId,
      username: message.username,
      source: message.source,
    });

    return message;
  }

  getRoomMessageCount(roomId: string): number {
    const statement = this.database.prepare('SELECT COUNT(*) AS count FROM chat_messages WHERE room_id = ?');
    const result = statement.get(roomId) as { count?: number } | undefined;
    return typeof result?.count === 'number' ? result.count : 0;
  }

  getTotalMessageCount(): number {
    const statement = this.database.prepare('SELECT COUNT(*) AS count FROM chat_messages');
    const result = statement.get() as { count?: number } | undefined;
    return typeof result?.count === 'number' ? result.count : 0;
  }

  close(): void {
    this.database.close();
  }
}
