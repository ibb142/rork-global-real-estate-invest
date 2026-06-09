import 'dotenv/config';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { ChatStorage } from './chat-storage';
import type { ChatRoomMessage, ChatRoomState } from './chat-types';
import {
  generatePublicChatAnswer,
  getPublicChatHealthSnapshot,
  sanitizePublicChatHistory,
  type PublicChatHistoryItem,
} from './public-chat-ai';

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

const DEPLOYMENT_MARKER = 'ivx-chat-room-express-2026-04-23t1200z';
const MAX_USERNAME_LENGTH = 32;
const MAX_MESSAGE_LENGTH = 1200;
const DEFAULT_LIMIT = 80;
const DEFAULT_ROOM_ID = sanitizeRoomId(process.env.CHAT_ROOM_ID) || 'main-room';
const PORT = parsePort(process.env.CHAT_API_PORT ?? process.env.PORT, 3000);
const HOST = readTrimmed(process.env.HOST) || '0.0.0.0';
const SOCKET_PATH = readTrimmed(process.env.CHAT_SOCKET_PATH) || '/socket.io';
const CHAT_FRONTEND_URL = readTrimmed(process.env.CHAT_FRONTEND_URL) || 'https://chat.ivxholding.com';
const CHAT_API_URL = readTrimmed(process.env.CHAT_API_URL) || 'https://api.ivxholding.com';
const CHAT_DATABASE_PATH = readTrimmed(process.env.CHAT_DATABASE_PATH) || './data/chat-room.sqlite';
const roomMembers = new Map<string, Set<string>>();

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nowIso(): string {
  return new Date().toISOString();
}

function parsePort(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(readTrimmed(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sanitizeRoomId(value: unknown): string {
  const normalized = readTrimmed(value).toLowerCase().replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 40);
  return normalized || '';
}

function sanitizeUsername(value: unknown): string {
  const normalized = readTrimmed(value).replace(/\s+/g, ' ').slice(0, MAX_USERNAME_LENGTH);
  return normalized || 'Guest';
}

function sanitizeMessage(value: unknown): string {
  return readTrimmed(value).replace(/\s+/g, ' ').slice(0, MAX_MESSAGE_LENGTH);
}

function readLimit(value: unknown): number {
  const parsed = Number.parseInt(readTrimmed(value), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(parsed, 1), 200);
}

function createCorsOrigins(): string[] {
  const configured = readTrimmed(process.env.CHAT_ALLOWED_ORIGINS);
  const fallback = `${CHAT_FRONTEND_URL},http://localhost:8081,http://localhost:19006,http://localhost:3000`;
  return (configured || fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizePublicChatHistory(history: unknown): PublicChatHistoryItem[] {
  if (!Array.isArray(history)) {
    return [];
  }

  return sanitizePublicChatHistory(
    history
      .map((item) => {
        const record = item as Record<string, unknown>;
        const role = record.role === 'assistant' ? 'assistant' : record.role === 'user' ? 'user' : null;
        const content = readTrimmed(record.content);
        if (!role || !content) {
          return null;
        }

        return { role, content } satisfies PublicChatHistoryItem;
      })
      .filter((item): item is PublicChatHistoryItem => item !== null),
  );
}

const allowedOrigins = createCorsOrigins();
const storage = new ChatStorage(CHAT_DATABASE_PATH);
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  path: SOCKET_PATH,
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: allowedOrigins, methods: ['GET', 'POST', 'OPTIONS'] }));

app.use((request: Request, _response: Response, next: NextFunction) => {
  console.log('[ChatAPI] Incoming request', {
    method: request.method,
    path: request.path,
    ip: request.ip,
    deploymentMarker: DEPLOYMENT_MARKER,
  });
  next();
});

function buildHealthPayload() {
  const publicChatHealth = getPublicChatHealthSnapshot();

  return {
    ok: true,
    status: 'healthy',
    service: 'ivx-chat-room-api',
    deploymentMarker: DEPLOYMENT_MARKER,
    frontendUrl: CHAT_FRONTEND_URL,
    apiUrl: CHAT_API_URL,
    socketPath: SOCKET_PATH,
    defaultRoomId: DEFAULT_ROOM_ID,
    messageCount: storage.getTotalMessageCount(),
    aiEnabled: publicChatHealth.aiEnabled,
    openAIModel: publicChatHealth.openAIModel,
    aiProvider: publicChatHealth.aiProvider,
    aiEndpoint: publicChatHealth.aiEndpoint,
    routes: [
      'GET /',
      'GET /health',
      'GET /readiness',
      'GET /api/health',
      'GET /messages',
      'GET /public/messages',
      'GET /api/messages',
      'GET /api/public/messages',
      'GET /rooms',
      'GET /public/rooms',
      'GET /api/rooms',
      'GET /api/public/rooms',
      'POST /messages',
      'POST /public/send-message',
      'POST /api/messages',
      'POST /api/send-message',
      'POST /api/public/send-message',
      'POST /chat',
      'POST /api/chat',
      'POST /public/chat',
      'POST /api/public/chat',
    ],
    timestamp: nowIso(),
  };
}

async function handlePublicChat(request: Request, response: Response): Promise<void> {
  try {
    const prompt = sanitizeMessage((request.body as { message?: unknown } | undefined)?.message);
    const sessionId = sanitizeRoomId((request.body as { sessionId?: unknown } | undefined)?.sessionId) || DEFAULT_ROOM_ID;
    const requestId = `public-${Date.now()}`;
    const history = normalizePublicChatHistory((request.body as { history?: unknown } | undefined)?.history);

    const result = await generatePublicChatAnswer({
      message: prompt || 'Hello from chat.ivxholding.com',
      history,
      sessionId,
    });

    response.json({
      ok: true,
      requestId,
      sessionId,
      answer: result.answer,
      model: result.model,
      source: result.source,
      endpoint: result.endpoint,
      deploymentMarker: DEPLOYMENT_MARKER,
      rateLimitRemaining: 999,
      rateLimitResetAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      timestamp: nowIso(),
    });
  } catch (error) {
    response.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to process public chat request.',
      deploymentMarker: DEPLOYMENT_MARKER,
    });
  }
}

function createRoomState(roomId: string): ChatRoomState {
  return {
    roomId,
    onlineCount: roomMembers.get(roomId)?.size ?? 0,
  };
}

function emitRoomState(roomId: string): void {
  const payload = createRoomState(roomId);
  io.to(roomId).emit('room:state', payload);
  console.log('[ChatAPI] Room state emitted', payload);
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

  socket.leave(roomId);
  socket.data.roomId = undefined;
  emitRoomState(roomId);
}

function joinSocketToRoom(socket: SocketLike, payload: JoinRoomPayload): ChatRoomState {
  const roomId = sanitizeRoomId(payload.roomId) || DEFAULT_ROOM_ID;
  const username = sanitizeUsername(payload.username);

  if (socket.data.roomId && socket.data.roomId !== roomId) {
    removeSocketFromRoom(socket);
  }

  socket.join(roomId);
  socket.data.roomId = roomId;
  socket.data.username = username;

  const members = roomMembers.get(roomId) ?? new Set<string>();
  members.add(socket.id);
  roomMembers.set(roomId, members);

  const state = createRoomState(roomId);
  socket.emit('room:joined', {
    ok: true,
    roomId,
    username,
    onlineCount: state.onlineCount,
    deploymentMarker: DEPLOYMENT_MARKER,
  });
  emitRoomState(roomId);

  console.log('[ChatAPI] Socket joined room', {
    socketId: socket.id,
    roomId,
    username,
    onlineCount: state.onlineCount,
  });

  return state;
}

function createStoredMessage(payload: SendMessagePayload): ChatRoomMessage {
  const roomId = sanitizeRoomId(payload.roomId) || DEFAULT_ROOM_ID;
  const username = sanitizeUsername(payload.username);
  const text = sanitizeMessage(payload.text);
  const source = payload.source === 'assistant' || payload.source === 'system' ? payload.source : 'user';

  if (!text) {
    throw new Error('Message text is required.');
  }

  return storage.createMessage({ roomId, username, text, source });
}

function broadcastMessage(message: ChatRoomMessage): void {
  io.to(message.roomId).emit('chat:message', message);
  console.log('[ChatAPI] Message broadcast', {
    messageId: message.id,
    roomId: message.roomId,
    username: message.username,
    source: message.source,
  });
}

async function createAssistantReply(userMessage: ChatRoomMessage): Promise<{
  assistantMessage: ChatRoomMessage;
  ai: {
    source: 'chatgpt' | 'fallback';
    model: string;
    endpoint: string | null;
  };
}> {
  const history = storage
    .listMessages(userMessage.roomId, 24)
    .filter((message) => message.id !== userMessage.id);

  const result = await generatePublicChatAnswer({
    message: userMessage.text,
    history: history.map((message) => ({
      role: message.source === 'assistant' ? 'assistant' : 'user',
      content: message.text,
    })),
    sessionId: userMessage.roomId,
  });

  const assistantMessage = storage.createMessage({
    roomId: userMessage.roomId,
    username: 'IVX Owner AI',
    text: result.answer,
    source: 'assistant',
  });

  console.log('[ChatAPI] Assistant reply created', {
    userMessageId: userMessage.id,
    assistantMessageId: assistantMessage.id,
    roomId: userMessage.roomId,
    model: result.model,
    source: result.source,
    endpoint: result.endpoint,
  });

  return {
    assistantMessage,
    ai: {
      source: result.source,
      model: result.model,
      endpoint: result.endpoint,
    },
  };
}

app.get('/', (_request: Request, response: Response) => {
  response.json({
    ok: true,
    service: 'ivx-chat-room-api',
    deploymentMarker: DEPLOYMENT_MARKER,
    routes: [
      'GET /health',
      'GET /messages',
      'GET /public/messages',
      'GET /api/messages',
      'GET /api/public/messages',
      'GET /rooms',
      'GET /public/rooms',
      'GET /api/rooms',
      'GET /api/public/rooms',
      'POST /messages',
      'POST /public/send-message',
      'POST /api/messages',
      'POST /api/send-message',
      'POST /api/public/send-message',
      'POST /chat',
      'POST /api/chat',
      'POST /public/chat',
      'POST /api/public/chat',
    ],
  });
});

app.get('/health', (_request: Request, response: Response) => {
  response.json(buildHealthPayload());
});

app.get('/readiness', (_request: Request, response: Response) => {
  response.json(buildHealthPayload());
});

app.get('/api/health', (_request: Request, response: Response) => {
  response.json(buildHealthPayload());
});

app.get('/api/readiness', (_request: Request, response: Response) => {
  response.json(buildHealthPayload());
});

function handleRoomState(request: Request, response: Response): void {
  const roomId = sanitizeRoomId(request.query.roomId) || DEFAULT_ROOM_ID;
  response.json({
    ok: true,
    room: {
      roomId,
      onlineCount: roomMembers.get(roomId)?.size ?? 0,
      messageCount: storage.getRoomMessageCount(roomId),
    },
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

function handleMessagesGet(request: Request, response: Response): void {
  const roomId = sanitizeRoomId(request.query.roomId) || DEFAULT_ROOM_ID;
  const limit = readLimit(request.query.limit);
  const messages = storage.listMessages(roomId, limit);
  response.json({
    ok: true,
    roomId,
    messages,
    deploymentMarker: DEPLOYMENT_MARKER,
  });
}

app.get('/rooms', handleRoomState);
app.get('/public/rooms', handleRoomState);
app.get('/api/rooms', handleRoomState);
app.get('/api/public/rooms', handleRoomState);

app.get('/messages', handleMessagesGet);
app.get('/public/messages', handleMessagesGet);
app.get('/api/messages', handleMessagesGet);
app.get('/api/public/messages', handleMessagesGet);

async function handleCreateMessage(request: Request, response: Response): Promise<void> {
  try {
    const message = createStoredMessage(request.body as SendMessagePayload);
    broadcastMessage(message);
    const assistantReply = await createAssistantReply(message);
    broadcastMessage(assistantReply.assistantMessage);

    response.status(201).json({
      ok: true,
      message,
      assistantMessage: assistantReply.assistantMessage,
      ai: assistantReply.ai,
      deploymentMarker: DEPLOYMENT_MARKER,
      timestamp: nowIso(),
    });
  } catch (error) {
    response.status(400).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Unable to store message.',
      deploymentMarker: DEPLOYMENT_MARKER,
    });
  }
}

app.post('/messages', handleCreateMessage);
app.post('/public/send-message', handleCreateMessage);
app.post('/api/messages', handleCreateMessage);
app.post('/api/send-message', handleCreateMessage);
app.post('/api/public/send-message', handleCreateMessage);

app.post('/chat', async (_request: Request, response: Response) => {
  response.status(200).json({
    messages: [
      {
        role: 'assistant',
        content: 'Test reply from backend',
      },
    ],
  });
});

app.post('/api/chat', async (_request: Request, response: Response) => {
  response.status(200).json({
    messages: [
      {
        role: 'assistant',
        content: 'Test reply from backend',
      },
    ],
  });
});

app.post('/public/chat', handlePublicChat);
app.post('/api/public/chat', handlePublicChat);
app.options('/public/chat', (_request: Request, response: Response) => {
  response.status(204).send();
});
app.options('/api/public/chat', (_request: Request, response: Response) => {
  response.status(204).send();
});
app.options('/public/messages', (_request: Request, response: Response) => {
  response.status(204).send();
});
app.options('/api/public/messages', (_request: Request, response: Response) => {
  response.status(204).send();
});
app.options('/public/rooms', (_request: Request, response: Response) => {
  response.status(204).send();
});
app.options('/api/public/rooms', (_request: Request, response: Response) => {
  response.status(204).send();
});
app.options('/public/send-message', (_request: Request, response: Response) => {
  response.status(204).send();
});
app.options('/api/public/send-message', (_request: Request, response: Response) => {
  response.status(204).send();
});

io.on('connection', (socket) => {
  const typedSocket = socket as unknown as SocketLike;
  console.log('[ChatAPI] Socket connected', {
    socketId: typedSocket.id,
    address: typedSocket.handshake.address,
  });

  typedSocket.emit('chat:welcome', {
    ok: true,
    roomId: DEFAULT_ROOM_ID,
    deploymentMarker: DEPLOYMENT_MARKER,
  });

  typedSocket.on('room:join', (payload: JoinRoomPayload) => {
    try {
      joinSocketToRoom(typedSocket, payload);
    } catch (error) {
      typedSocket.emit('chat:error', {
        error: error instanceof Error ? error.message : 'Unable to join room.',
      });
    }
  });

  typedSocket.on('chat:send', async (payload: SendMessagePayload, acknowledgement?: (data: unknown) => void) => {
    try {
      if (!typedSocket.data.roomId) {
        joinSocketToRoom(typedSocket, payload);
      }

      const message = createStoredMessage({
        roomId: typedSocket.data.roomId,
        username: typedSocket.data.username,
        text: payload.text,
        source: payload.source,
      });
      broadcastMessage(message);
      acknowledgement?.({ ok: true, message });

      const assistantReply = await createAssistantReply(message);
      broadcastMessage(assistantReply.assistantMessage);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unable to send message.';
      typedSocket.emit('chat:error', { error: errorMessage });
      acknowledgement?.({ ok: false, error: errorMessage });
    }
  });

  typedSocket.on('disconnect', (reason: string) => {
    console.log('[ChatAPI] Socket disconnected', {
      socketId: typedSocket.id,
      reason,
    });
    removeSocketFromRoom(typedSocket);
  });
});

function shutdown(signal: string): void {
  console.log('[ChatAPI] Shutdown requested', {
    signal,
    deploymentMarker: DEPLOYMENT_MARKER,
  });

  io.close(() => {
    console.log('[ChatAPI] Socket.IO server closed');
  });
  httpServer.close(() => {
    console.log('[ChatAPI] HTTP server closed');
    storage.close();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

httpServer.listen(PORT, HOST, () => {
  console.log('[ChatAPI] Express chat server online', {
    host: HOST,
    port: PORT,
    frontendUrl: CHAT_FRONTEND_URL,
    apiUrl: CHAT_API_URL,
    socketPath: SOCKET_PATH,
    databasePath: CHAT_DATABASE_PATH,
    deploymentMarker: DEPLOYMENT_MARKER,
  });
});
