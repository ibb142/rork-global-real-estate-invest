import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/supabase';
import type {
  ChatMessage,
  ChatRoomRuntimeSignals,
  ServiceRuntimeHealth,
} from '../types/chat';

type AIReplyResult = {
  answer: string;
  requestId: string;
  conversationId: string;
  model: string;
};

type OwnerCommandResult = {
  command: string;
  args: string;
  response: string;
  handled: boolean;
};

type KnowledgeQueryResult = {
  answer: string;
  source: 'knowledge' | 'ai_fallback';
  confidence: number;
};

const AI_API_PATH = '/api/ivx/owner-ai';
const AI_PROBE_TIMEOUT_MS = 8000;
const AI_REPLY_TIMEOUT_MS = 30000;
const OWNER_COMMAND_PREFIX = '/';

let cachedAIHealth: ServiceRuntimeHealth = 'inactive';
let lastProbeTimestamp = 0;
const PROBE_CACHE_TTL_MS = 60000;

const OWNER_COMMANDS: Record<string, { description: string; handler: (args: string) => string }> = {
  status: {
    description: 'Show current room and system status',
    handler: (_args: string) => {
      return 'Room status: checking live state. Use the room status card above for real-time backend status, storage mode, and delivery method.';
    },
  },
  help: {
    description: 'List available owner commands',
    handler: (_args: string) => {
      const commandList = Object.entries(OWNER_COMMANDS)
        .map(([cmd, info]) => `/${cmd} — ${info.description}`)
        .join('\n');
      return `Available owner commands:\n${commandList}`;
    },
  },
  clear: {
    description: 'Clear local message cache (does not delete server messages)',
    handler: (_args: string) => {
      return 'Local message cache cleared. Pull to refresh to reload from server.';
    },
  },
  broadcast: {
    description: 'Send a broadcast notification to all participants',
    handler: (args: string) => {
      if (!args.trim()) {
        return 'Usage: /broadcast <message>';
      }
      return `Broadcast queued: "${args.trim()}". Participants will be notified on next sync.`;
    },
  },
  reconnect: {
    description: 'Force reconnect to the shared room backend',
    handler: (_args: string) => {
      return 'Reconnect triggered. The room state manager will re-detect the backend and re-establish subscriptions.';
    },
  },
  probe: {
    description: 'Run a health probe on the AI backend',
    handler: (_args: string) => {
      return 'AI health probe triggered. Check the AI indicator badge for updated status.';
    },
  },
};

function getApiBaseUrl(): string {
  const rorkBase = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL ?? '').trim();
  if (rorkBase) {
    return rorkBase;
  }
  return '';
}

async function getAccessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch (error) {
    console.log('[AIReplyService] Failed to get access token:', (error as Error)?.message);
    return null;
  }
}

export async function probeAIBackendHealth(): Promise<ServiceRuntimeHealth> {
  const now = Date.now();
  if (now - lastProbeTimestamp < PROBE_CACHE_TTL_MS && cachedAIHealth !== 'inactive') {
    console.log('[AIReplyService] Using cached AI health:', cachedAIHealth);
    return cachedAIHealth;
  }

  console.log('[AIReplyService] Probing AI backend health...');

  if (!isSupabaseConfigured()) {
    console.log('[AIReplyService] Supabase not configured, AI unavailable');
    cachedAIHealth = 'inactive';
    lastProbeTimestamp = now;
    return cachedAIHealth;
  }

  const token = await getAccessToken();
  if (!token) {
    console.log('[AIReplyService] No auth token, AI health: inactive');
    cachedAIHealth = 'inactive';
    lastProbeTimestamp = now;
    return cachedAIHealth;
  }

  try {
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}${AI_API_PATH}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_PROBE_TIMEOUT_MS);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        message: 'health_probe',
        mode: 'chat',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      if (data.answer || data.status === 'ok') {
        console.log('[AIReplyService] AI backend probe: active');
        cachedAIHealth = 'active';
        lastProbeTimestamp = now;
        return cachedAIHealth;
      }
    }

    if (response.status === 401 || response.status === 403) {
      console.log('[AIReplyService] AI backend probe: auth rejected (inactive)');
      cachedAIHealth = 'inactive';
      lastProbeTimestamp = now;
      return cachedAIHealth;
    }

    if (response.status === 503 || response.status >= 500) {
      console.log('[AIReplyService] AI backend probe: degraded (server error)');
      cachedAIHealth = 'degraded';
      lastProbeTimestamp = now;
      return cachedAIHealth;
    }

    console.log('[AIReplyService] AI backend probe: degraded (status:', response.status, ')');
    cachedAIHealth = 'degraded';
    lastProbeTimestamp = now;
    return cachedAIHealth;
  } catch (error) {
    const message = (error as Error)?.message ?? '';
    if (message.includes('abort')) {
      console.log('[AIReplyService] AI backend probe: degraded (timeout)');
      cachedAIHealth = 'degraded';
    } else {
      console.log('[AIReplyService] AI backend probe: inactive (error:', message, ')');
      cachedAIHealth = 'inactive';
    }
    lastProbeTimestamp = now;
    return cachedAIHealth;
  }
}

export async function requestAIReply(
  messageText: string,
  conversationId: string,
  senderLabel?: string | null,
): Promise<AIReplyResult> {
  console.log('[AIReplyService] Requesting AI reply for:', messageText.slice(0, 60));

  const token = await getAccessToken();
  if (!token) {
    throw new Error('Authentication required for AI replies.');
  }

  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${AI_API_PATH}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_REPLY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        conversationId,
        message: messageText,
        senderLabel: senderLabel ?? null,
        mode: 'chat',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error((errorData as { error?: string }).error ?? `AI API returned ${response.status}`);
    }

    const data = await response.json() as AIReplyResult;

    if (!data.answer) {
      throw new Error('AI returned an empty response.');
    }

    console.log('[AIReplyService] AI reply received, length:', data.answer.length);

    cachedAIHealth = 'active';
    lastProbeTimestamp = Date.now();

    return data;
  } catch (error) {
    clearTimeout(timeout);
    const msg = (error as Error)?.message ?? 'Unknown error';
    console.log('[AIReplyService] AI reply failed:', msg);

    if (msg.includes('abort') || msg.includes('timeout')) {
      cachedAIHealth = 'degraded';
    }

    throw error;
  }
}

export function parseOwnerCommand(text: string): OwnerCommandResult | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith(OWNER_COMMAND_PREFIX)) {
    return null;
  }

  const parts = trimmed.slice(OWNER_COMMAND_PREFIX.length).split(/\s+/);
  const command = (parts[0] ?? '').toLowerCase();
  const args = parts.slice(1).join(' ');

  if (!command) {
    return null;
  }

  const handler = OWNER_COMMANDS[command];
  if (!handler) {
    return {
      command,
      args,
      response: `Unknown command: /${command}. Type /help to see available commands.`,
      handled: true,
    };
  }

  console.log('[AIReplyService] Owner command detected:', command, 'args:', args);
  return {
    command,
    args,
    response: handler.handler(args),
    handled: true,
  };
}

export async function requestKnowledgeAnswer(
  query: string,
  conversationId: string,
  senderLabel?: string | null,
): Promise<KnowledgeQueryResult> {
  console.log('[AIReplyService] Knowledge query:', query.slice(0, 60));

  try {
    const result = await requestAIReply(
      `[Knowledge Query] ${query}`,
      conversationId,
      senderLabel,
    );

    return {
      answer: result.answer,
      source: 'ai_fallback',
      confidence: 0.7,
    };
  } catch (error) {
    console.log('[AIReplyService] Knowledge query failed:', (error as Error)?.message);
    throw error;
  }
}

export function invalidateAIHealthCache(): void {
  cachedAIHealth = 'inactive';
  lastProbeTimestamp = 0;
  console.log('[AIReplyService] AI health cache invalidated');
}

export function getCachedAIHealth(): ServiceRuntimeHealth {
  return cachedAIHealth;
}

export function buildRuntimeSignalsFromProbe(aiHealth: ServiceRuntimeHealth): ChatRoomRuntimeSignals {
  const ownerCommandHealth: ServiceRuntimeHealth = aiHealth === 'active' ? 'active' : 'inactive';
  const knowledgeHealth: ServiceRuntimeHealth = aiHealth === 'active' ? 'active' : 'inactive';

  return {
    aiBackendHealth: aiHealth,
    knowledgeBackendHealth: knowledgeHealth,
    ownerCommandAvailability: ownerCommandHealth,
    codeAwareServiceAvailability: 'inactive',
    aiResponseState: 'inactive',
  };
}

export function createAssistantChatMessage(
  conversationId: string,
  text: string,
  senderLabel?: string,
): ChatMessage {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  const id = cryptoRef?.randomUUID?.()
    ?? `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    conversationId,
    senderId: 'ivx-owner-ai-assistant',
    senderLabel: senderLabel ?? 'IVX Owner AI',
    text,
    createdAt: new Date().toISOString(),
    sendStatus: 'sent',
    optimistic: false,
  };
}

export function createCommandResponseMessage(
  conversationId: string,
  text: string,
): ChatMessage {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  const id = cryptoRef?.randomUUID?.()
    ?? `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    conversationId,
    senderId: 'ivx-owner-ai-system',
    senderLabel: 'System',
    text,
    createdAt: new Date().toISOString(),
    sendStatus: 'sent',
    optimistic: false,
  };
}
