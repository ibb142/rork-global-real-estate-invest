/**
 * IVX Chat Realtime — Socket.IO layer for the production Hono server.
 *
 * Mounts the same realtime protocol the Expo client (expo/lib/chat-room-client.ts)
 * and web chat expect: chat:welcome, room:join → room:joined/room:state,
 * chat:send → chat:message broadcast + AI assistant reply.
 *
 * Attached to the @hono/node-server HTTP server in server.ts so REST and
 * realtime share one process, one port, and one message store.
 */
import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { ChatStorage } from './chat-storage';
import type { ChatRoomMessage } from './chat-types';
import { generatePublicChatAnswer } from './public-chat-ai';

type JoinRoomPayload = {
  roomId?: unknown;
  username?: unknown;
};

type SendMessagePayload = {
  roomId?: unknown;
  username?: unknown;
  text?: unknown;
  source?: unknown;
};

type SocketLike = {
  id: string;
  data: {
    roomId?: string;
    username?: string;
  };
  join: (roomId: string) => Promise<void> | void;
  leave: (roomId: string) => Promise<void> | void;
  emit: (event: string, payload: unknown) => void;
  handshake: {
    address: string;
  };
  on: (event: string, listener: (...args: any[]) => void) => void;
};

const REALTIME_MARKER = 'ivx-chat-realtime-hono-2026-07-10';
const MAX_USERNAME_LENGTH = 32;
const MAX_MESSAGE_LENGTH = 1200;
const DEFAULT_ROOM_ID = 'main-room';

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeRoomId(value: unknown): string {
  return readTrimmed(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
}

function sanitizeUsername(value: unknown): string {
  const normalized = readTrimmed(value).replace(/\s+/g, ' ').slice(0, MAX_USERNAME_LENGTH);
  return normalized || 'Guest';
}

function sanitizeMessage(value: unknown): string {
  return readTrimmed(value).replace(/\s+/g, ' ').slice(0, MAX_MESSAGE_LENGTH);
}

function createCorsOrigins(): string[] {
  const frontendUrl = readTrimmed(process.env.CHAT_FRONTEND_URL) || 'https://chat.ivxholding.com';
  const configured = readTrimmed(process.env.CHAT_ALLOWED_ORIGINS);
  const fallback = `${frontendUrl},https://ivxholding.com,https://api.ivxholding.com,http://localhost:8081,http://localhost:19006,http://localhost:3000`;
  return (configured || fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export type ChatRealtimeHandle = {
  io: SocketIOServer;
  storage: ChatStorage;
  close: () => void;
};

/**
 * Attaches the Socket.IO realtime chat layer to the production HTTP server.
 * Returns a handle exposing the io instance and storage for diagnostics/shutdown.
 */
export function attachChatRealtime(httpServer: HttpServer): ChatRealtimeHandle {
  const socketPath = readTrimmed(process.env.CHAT_SOCKET_PATH) || '/socket.io';
  const databasePath = readTrimmed(process.env.CHAT_DATABASE_PATH) || './data/chat-room.sqlite';
  const defaultRoomId = sanitizeRoomId(process.env.CHAT_ROOM_ID) || DEFAULT_ROOM_ID;
  const storage = new ChatStorage(databasePath);
  const roomMembers = new Map<string, Set<string>>();

  const io = new SocketIOServer(httpServer, {
    path: socketPath,
    cors: {
      origin: createCorsOrigins(),
      methods: ['GET', 'POST'],
    },
  });

  function emitRoomState(roomId: string): void {
    io.to(roomId).emit('room:state', {
      roomId,
      onlineCount: roomMembers.get(roomId)?.size ?? 0,
    });
  }

  function removeSocketFromRoom(socket: SocketLike): void {
    const roomId = socket.data.roomId;
    if (!roomId) {
      return;
    }
    const members = roomMembers.get(roomId);
    members?.delete(socket.id);
    if (members && members.size === 0) {
      roomMembers.delete(roomId);
    }
    void socket.leave(roomId);
    socket.data.roomId = undefined;
    emitRoomState(roomId);
  }

  function joinSocketToRoom(socket: SocketLike, payload: JoinRoomPayload): void {
    const roomId = sanitizeRoomId(payload.roomId) || defaultRoomId;
    const username = sanitizeUsername(payload.username);

    if (socket.data.roomId && socket.data.roomId !== roomId) {
      removeSocketFromRoom(socket);
    }

    void socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.username = username;

    const members = roomMembers.get(roomId) ?? new Set<string>();
    members.add(socket.id);
    roomMembers.set(roomId, members);

    socket.emit('room:joined', {
      ok: true,
      roomId,
      username,
      onlineCount: members.size,
      deploymentMarker: REALTIME_MARKER,
    });
    emitRoomState(roomId);

    console.log('[ChatRealtime] Socket joined room', {
      socketId: socket.id,
      roomId,
      username,
      onlineCount: members.size,
    });
  }

  function createStoredMessage(payload: SendMessagePayload, socket: SocketLike): ChatRoomMessage {
    const roomId = socket.data.roomId || sanitizeRoomId(payload.roomId) || defaultRoomId;
    const username = socket.data.username || sanitizeUsername(payload.username);
    const text = sanitizeMessage(payload.text);
    const source = payload.source === 'assistant' || payload.source === 'system' ? payload.source : 'user';

    if (!text) {
      throw new Error('Message text is required.');
    }

    return storage.createMessage({ roomId, username, text, source });
  }

  function broadcastMessage(message: ChatRoomMessage): void {
    io.to(message.roomId).emit('chat:message', message);
    console.log('[ChatRealtime] Message broadcast', {
      messageId: message.id,
      roomId: message.roomId,
      source: message.source,
    });
  }

  async function createAssistantReply(userMessage: ChatRoomMessage): Promise<ChatRoomMessage> {
    const history = storage
      .listMessages(userMessage.roomId, 24)
      .filter((message) => message.id !== userMessage.id)
      .map((message) => ({
        role: message.source === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: message.text,
      }));

    const result = await generatePublicChatAnswer({
      message: userMessage.text,
      history,
      sessionId: userMessage.roomId,
    });

    return storage.createMessage({
      roomId: userMessage.roomId,
      username: 'IVX Owner AI',
      text: result.answer,
      source: 'assistant',
    });
  }

  io.on('connection', (socket) => {
    const typedSocket = socket as unknown as SocketLike;
    console.log('[ChatRealtime] Socket connected', {
      socketId: typedSocket.id,
      address: typedSocket.handshake.address,
    });

    typedSocket.emit('chat:welcome', {
      ok: true,
      roomId: defaultRoomId,
      deploymentMarker: REALTIME_MARKER,
    });

    typedSocket.on('room:join', (payload: JoinRoomPayload) => {
      try {
        joinSocketToRoom(typedSocket, payload);
      } catch (error) {
        console.log('[ChatRealtime] room:join failed', {
          socketId: typedSocket.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
        typedSocket.emit('chat:error', { error: 'Unable to join room.' });
      }
    });

    typedSocket.on('chat:send', async (payload: SendMessagePayload, acknowledgement?: (data: unknown) => void) => {
      try {
        if (!typedSocket.data.roomId) {
          joinSocketToRoom(typedSocket, payload);
        }

        const message = createStoredMessage(payload, typedSocket);
        broadcastMessage(message);
        acknowledgement?.({ ok: true, message });

        const assistantMessage = await createAssistantReply(message);
        broadcastMessage(assistantMessage);
      } catch (error) {
        console.log('[ChatRealtime] chat:send failed', {
          socketId: typedSocket.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
        const safeError = 'Unable to send message right now. Please try again.';
        typedSocket.emit('chat:error', { error: safeError });
        acknowledgement?.({ ok: false, error: safeError });
      }
    });

    typedSocket.on('disconnect', (reason: string) => {
      console.log('[ChatRealtime] Socket disconnected', {
        socketId: typedSocket.id,
        reason,
      });
      removeSocketFromRoom(typedSocket);
    });
  });

  console.log('[ChatRealtime] Socket.IO attached to production server', {
    socketPath,
    defaultRoomId,
    databasePath,
    deploymentMarker: REALTIME_MARKER,
  });

  return {
    io,
    storage,
    close: () => {
      io.close();
      storage.close();
    },
  };
}
