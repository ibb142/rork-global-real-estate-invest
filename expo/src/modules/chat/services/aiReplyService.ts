import { generateText as toolkitGenerateText } from '@rork-ai/toolkit-sdk';
import { IVX_OWNER_AI_PROFILE } from '@/constants/ivx-owner-ai';
import { getIVXOwnerAIEndpoint } from '@/lib/ivx-supabase-client';
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

function createLocalAIRequestId(prefix: string): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return `${prefix}-${cryptoRef.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildToolkitPrompt(input: {
  messageText: string;
  conversationId: string;
  senderLabel?: string | null;
}): string {
  const senderLabel = input.senderLabel?.trim() || 'Owner';
  return [
    `You are ${IVX_OWNER_AI_PROFILE.name}.`,
    'Respond with concise owner-first guidance for IVX operations, chat, inbox, uploads, knowledge base, and owner commands.',
    'You are running in the in-app fallback path, so do not claim server-side actions were completed unless the user already confirmed them.',
    `Conversation ID: ${input.conversationId}`,
    `Sender label: ${senderLabel}`,
    `Owner request: ${input.messageText}`,
  ].join('\n\n');
}

function shouldFallbackToToolkit(status: number | null, message: string): boolean {
  const normalizedMessage = message.toLowerCase();

  if (status !== null && status !== 401 && status !== 403 && (status === 404 || status === 405 || status >= 500)) {
    return true;
  }

  return normalizedMessage.includes('network request failed')
    || normalizedMessage.includes('failed to fetch')
    || normalizedMessage.includes('load failed')
    || normalizedMessage.includes('not found')
    || normalizedMessage.includes('abort');
}

async function probeToolkitFallbackHealth(): Promise<ServiceRuntimeHealth> {
  try {
    const answer = (await toolkitGenerateText({
      messages: [{ role: 'user', content: 'Reply with READY only.' }],
    })).trim();

    if (!answer) {
      console.log('[AIReplyService] Toolkit fallback probe returned empty output');
      return 'inactive';
    }

    console.log('[AIReplyService] Toolkit fallback probe: available');
    return 'degraded';
  } catch (error) {
    console.log('[AIReplyService] Toolkit fallback probe failed:', (error as Error)?.message ?? 'unknown');
    return 'inactive';
  }
}

async function requestToolkitAIReply(
  messageText: string,
  conversationId: string,
  senderLabel?: string | null,
): Promise<AIReplyResult> {
  const prompt = buildToolkitPrompt({
    messageText,
    conversationId,
    senderLabel,
  });
  const answer = (await toolkitGenerateText({
    messages: [{ role: 'user', content: prompt }],
  })).trim();

  if (!answer) {
    throw new Error('AI returned an empty fallback response.');
  }

  console.log('[AIReplyService] Toolkit fallback reply received, length:', answer.length);
  cachedAIHealth = 'degraded';
  lastProbeTimestamp = Date.now();

  return {
    answer,
    requestId: createLocalAIRequestId('toolkit-ai'),
    conversationId,
    model: 'rork-toolkit-fallback',
  };
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
    console.log('[AIReplyService] Supabase not configured, probing toolkit fallback');
    cachedAIHealth = await probeToolkitFallbackHealth();
    lastProbeTimestamp = now;
    return cachedAIHealth;
  }

  const token = await getAccessToken();
  if (!token) {
    console.log('[AIReplyService] No auth token, probing toolkit fallback');
    cachedAIHealth = await probeToolkitFallbackHealth();
    lastProbeTimestamp = now;
    return cachedAIHealth;
  }

  try {
    const url = getIVXOwnerAIEndpoint();

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

    const fallbackHealth = shouldFallbackToToolkit(response.status, `status:${response.status}`)
      ? await probeToolkitFallbackHealth()
      : 'inactive';

    console.log('[AIReplyService] AI backend probe fallback result:', fallbackHealth, 'status:', response.status);
    cachedAIHealth = fallbackHealth;
    lastProbeTimestamp = now;
    return cachedAIHealth;
  } catch (error) {
    const message = (error as Error)?.message ?? '';
    if (shouldFallbackToToolkit(null, message)) {
      console.log('[AIReplyService] AI backend probe failed, trying toolkit fallback:', message);
      cachedAIHealth = await probeToolkitFallbackHealth();
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
    console.log('[AIReplyService] No auth token for remote AI reply, using toolkit fallback');
    return await requestToolkitAIReply(messageText, conversationId, senderLabel);
  }

  const url = getIVXOwnerAIEndpoint();

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
      const errorMessage = (errorData as { error?: string }).error ?? `AI API returned ${response.status}`;
      if (shouldFallbackToToolkit(response.status, errorMessage)) {
        console.log('[AIReplyService] Remote AI reply unavailable, switching to toolkit fallback:', response.status, errorMessage);
        return await requestToolkitAIReply(messageText, conversationId, senderLabel);
      }
      throw new Error(errorMessage);
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

    if (shouldFallbackToToolkit(null, msg)) {
      console.log('[AIReplyService] Falling back to toolkit AI reply');
      return await requestToolkitAIReply(messageText, conversationId, senderLabel);
    }

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
