import { io, type Socket } from 'socket.io-client';

export type ChatMessageSource = 'user' | 'assistant' | 'system';

export interface ChatRoomMessage {
  id: string;
  roomId: string;
  username: string;
  text: string;
  source: ChatMessageSource;
  createdAt: string;
}

export type ChatRoomAIProvider = 'chatgpt' | 'fallback';

export interface ChatRoomHealthResponse {
  ok: boolean;
  status: string;
  service: string;
  deploymentMarker: string;
  frontendUrl: string;
  apiUrl: string;
  socketPath: string;
  defaultRoomId: string;
  messageCount: number;
  aiEnabled: boolean;
  openAIModel: string;
  aiProvider?: ChatRoomAIProvider;
  aiEndpoint?: string | null;
  timestamp: string;
}

export interface ChatRoomMessagesResponse {
  ok: boolean;
  roomId: string;
  messages: ChatRoomMessage[];
  deploymentMarker: string;
}

export interface ChatRoomRoomResponse {
  ok: boolean;
  room: {
    roomId: string;
    onlineCount: number;
    messageCount: number;
  };
  deploymentMarker: string;
}

export interface ChatRoomSendResponse {
  ok: boolean;
  message: ChatRoomMessage;
  assistantMessage?: ChatRoomMessage;
  ai?: {
    source: ChatRoomAIProvider;
    model: string;
    endpoint: string | null;
  };
  deploymentMarker: string;
  timestamp?: string;
}

export interface ChatRoomJoinPayload {
  roomId: string;
  username: string;
}

export interface ChatRoomSendPayload {
  roomId: string;
  username: string;
  text: string;
  source?: ChatMessageSource;
}

export interface ChatRoomJoinedPayload {
  ok: boolean;
  roomId: string;
  username: string;
  onlineCount: number;
  deploymentMarker: string;
}

export interface ChatRoomStatePayload {
  roomId: string;
  onlineCount: number;
}

export interface ChatSocketAcknowledgement {
  ok: boolean;
  message?: ChatRoomMessage;
  error?: string;
}

export interface ChatSocketServerEvents {
  'chat:welcome': (payload: { ok: boolean; roomId: string; deploymentMarker: string }) => void;
  'room:joined': (payload: ChatRoomJoinedPayload) => void;
  'room:state': (payload: ChatRoomStatePayload) => void;
  'chat:message': (payload: ChatRoomMessage) => void;
  'chat:error': (payload: { error: string }) => void;
}

export interface ChatSocketClientEvents {
  'room:join': (payload: ChatRoomJoinPayload) => void;
  'chat:send': (payload: ChatRoomSendPayload, acknowledgement?: (payload: ChatSocketAcknowledgement) => void) => void;
}

export type ChatSocket = Socket<ChatSocketServerEvents, ChatSocketClientEvents>;

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeRoomId(value: unknown): string {
  const normalized = readTrimmed(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40);
  return normalized || '';
}

function getBrowserHostname(): string {
  if (typeof window === 'undefined' || typeof window.location?.hostname !== 'string') {
    return '';
  }

  return window.location.hostname.trim().toLowerCase();
}

export function getChatApiBaseUrl(): string {
  const configured = readTrimmed(process.env.EXPO_PUBLIC_CHAT_API_URL).replace(/\/$/, '');
  if (configured) {
    return configured;
  }

  const hostname = getBrowserHostname();
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:3000';
  }

  if (hostname === 'chat.ivxholding.com') {
    return 'https://api.ivxholding.com';
  }

  return 'https://api.ivxholding.com';
}

export function getChatSocketPath(): string {
  return readTrimmed(process.env.EXPO_PUBLIC_CHAT_SOCKET_PATH) || '/socket.io';
}

export function getDefaultChatRoomId(): string {
  return sanitizeRoomId(process.env.EXPO_PUBLIC_CHAT_DEFAULT_ROOM_ID) || 'main-room';
}

async function parseErrorResponse(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  if (!text) {
    return `Request failed with HTTP ${response.status}.`;
  }

  try {
    const parsed = JSON.parse(text) as { error?: string };
    return readTrimmed(parsed.error) || `Request failed with HTTP ${response.status}.`;
  } catch {
    return text.slice(0, 240);
  }
}

export async function fetchChatHealth(): Promise<ChatRoomHealthResponse> {
  const url = `${getChatApiBaseUrl()}/health`;
  console.log('[ChatRoomClient] Fetching health', { url });
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  return await response.json() as ChatRoomHealthResponse;
}

export async function fetchChatMessages(roomId: string, limit: number = 80): Promise<ChatRoomMessagesResponse> {
  const url = `${getChatApiBaseUrl()}/api/public/messages?roomId=${encodeURIComponent(roomId)}&limit=${encodeURIComponent(String(limit))}`;
  console.log('[ChatRoomClient] Fetching messages', { url, roomId, limit });
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  return await response.json() as ChatRoomMessagesResponse;
}

export async function fetchChatRoomState(roomId: string): Promise<ChatRoomRoomResponse> {
  const url = `${getChatApiBaseUrl()}/api/public/rooms?roomId=${encodeURIComponent(roomId)}`;
  console.log('[ChatRoomClient] Fetching room state', { url, roomId });
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  return await response.json() as ChatRoomRoomResponse;
}

export async function sendChatMessage(payload: ChatRoomSendPayload): Promise<ChatRoomSendResponse> {
  const url = `${getChatApiBaseUrl()}/api/public/send-message`;
  console.log('[ChatRoomClient] Sending HTTP message', {
    url,
    roomId: payload.roomId,
    username: payload.username,
    preview: payload.text.slice(0, 120),
  });
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  return await response.json() as ChatRoomSendResponse;
}

export function createChatSocket(): ChatSocket {
  const baseUrl = getChatApiBaseUrl();
  const socketPath = getChatSocketPath();
  console.log('[ChatRoomClient] Creating Socket.IO client', {
    baseUrl,
    socketPath,
  });

  return io(baseUrl, {
    path: socketPath,
    transports: ['websocket', 'polling'],
    timeout: 8000,
    autoConnect: true,
  });
}
