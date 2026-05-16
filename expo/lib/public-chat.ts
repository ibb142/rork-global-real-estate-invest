import { getDirectApiBaseUrl } from '@/lib/api-base';

export type PublicChatRole = 'user' | 'assistant';

export type PublicChatHistoryItem = {
  role: PublicChatRole;
  content: string;
};

export type PublicChatApiResponse = {
  ok: true;
  requestId: string;
  sessionId: string;
  answer: string;
  model: string;
  source: 'chatgpt' | 'fallback';
  deploymentMarker: string;
  rateLimitRemaining: number;
  rateLimitResetAt: string;
  timestamp: string;
  endpoint: string | null;
};

export type PublicHealthResponse = {
  ok: boolean;
  status: string;
  service: string;
  deploymentMarker: string;
  routes: string[];
  aiEnabled?: boolean;
  openAIModel?: string;
  aiProvider?: 'chatgpt' | 'fallback';
  aiEndpoint?: string | null;
};

export type SendPublicChatInput = {
  message: string;
  history: PublicChatHistoryItem[];
  sessionId: string;
  requestId: string;
};

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

export async function fetchPublicChatHealth(): Promise<PublicHealthResponse> {
  const baseUrl = getDirectApiBaseUrl();
  const url = `${baseUrl}/health`;
  console.log('[PublicChat] Fetching health from:', url);

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const payload = await response.json() as PublicHealthResponse;
  console.log('[PublicChat] Health response:', payload);
  return payload;
}

export async function sendPublicChatMessage(input: SendPublicChatInput): Promise<PublicChatApiResponse> {
  const baseUrl = getDirectApiBaseUrl();
  const url = `${baseUrl}/public/chat`;
  console.log('[PublicChat] Sending message to:', url, {
    requestId: input.requestId,
    sessionId: input.sessionId,
    historyCount: input.history.length,
    preview: input.message.slice(0, 120),
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requestId: input.requestId,
      sessionId: input.sessionId,
      message: input.message,
      history: input.history,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorResponse(response));
  }

  const payload = await response.json() as PublicChatApiResponse;
  console.log('[PublicChat] Message response:', {
    requestId: payload.requestId,
    source: payload.source,
    model: payload.model,
    deploymentMarker: payload.deploymentMarker,
  });
  return payload;
}
