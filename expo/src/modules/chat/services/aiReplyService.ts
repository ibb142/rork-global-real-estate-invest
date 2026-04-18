import { generateText as toolkitGenerateText } from '@rork-ai/toolkit-sdk';
import { IVX_OWNER_AI_PROFILE, IVX_OWNER_AI_ROOM_ID, IVX_OWNER_AI_ROOM_SLUG } from '@/constants/ivx-owner-ai';
import { buildOwnerTrustPromptBlock } from '@/src/modules/ivx-owner-ai/services/ownerTrust';
import { getIVXOwnerAIConfigAudit } from '@/lib/ivx-supabase-client';
import { isDevTestModeEnabled } from '@/lib/dev-test-mode';
import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  getIVXOwnerAIErrorDiagnostics,
  ivxAIRequestService,
  type IVXOwnerAIProbeResult,
} from '@/src/modules/ivx-owner-ai/services/ivxAIRequestService';
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
  source: 'remote_api' | 'toolkit_fallback' | 'unknown';
  endpoint?: string;
  deploymentMarker?: string;
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

const OWNER_COMMAND_PREFIX = '/';

function safeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try { return String(value); } catch { return ''; }
}

function safeTrimARS(value: unknown): string {
  return safeString(value).trim();
}

function extractToolkitText(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw.trim();
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (typeof record.text === 'string' && record.text.trim()) {
      return record.text.trim();
    }
    if (typeof record.content === 'string' && record.content.trim()) {
      return record.content.trim();
    }
    if (typeof record.answer === 'string' && record.answer.trim()) {
      return record.answer.trim();
    }
  }
  return '';
}

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
      if (!safeTrimARS(args)) {
        return 'Usage: /broadcast <message>';
      }
      return `Broadcast queued: "${safeTrimARS(args)}". Participants will be notified on next sync.`;
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

function createRequestUuid(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID();
  }

  const seed = `${Date.now().toString(16).padStart(12, '0')}${Math.random().toString(16).slice(2).padEnd(20, '0')}`.slice(0, 32);
  return `${seed.slice(0, 8)}-${seed.slice(8, 12)}-4${seed.slice(13, 16)}-a${seed.slice(17, 20)}-${seed.slice(20, 32)}`;
}

function buildToolkitPrompt(input: {
  messageText: string;
  conversationId: string;
  senderLabel?: string | null;
}): string {
  const senderLabel = input.senderLabel?.trim() || 'Owner';
  const ownerRoomAuthenticated = input.conversationId === IVX_OWNER_AI_ROOM_ID || input.conversationId === IVX_OWNER_AI_ROOM_SLUG;
  const devTestMode = isDevTestModeEnabled();
  const trustPolicy = buildOwnerTrustPromptBlock({
    messageText: input.messageText,
    ownerRoomAuthenticated: ownerRoomAuthenticated || devTestMode,
    backendAdminVerified: devTestMode,
    fallbackModeActive: !devTestMode,
    devTestModeActive: devTestMode,
  });
  return [
    `You are ${IVX_OWNER_AI_PROFILE.name}.`,
    'Respond with concise owner-first guidance for IVX operations, chat, inbox, uploads, knowledge base, and owner commands.',
    trustPolicy,
    'You are running in the in-app fallback path, so do not claim server-side actions were completed unless the user already confirmed them.',
    `Conversation ID: ${input.conversationId}`,
    `Sender label: ${senderLabel}`,
    `Owner request: ${input.messageText}`,
  ].join('\n\n');
}

function shouldFallbackToToolkit(status: number | null, message: string): boolean {
  if (status !== null && status !== 401 && status !== 403) {
    return true;
  }

  const normalizedMessage = message.toLowerCase();
  return normalizedMessage.includes('network request failed')
    || normalizedMessage.includes('failed to fetch')
    || normalizedMessage.includes('load failed')
    || normalizedMessage.includes('not found')
    || normalizedMessage.includes('abort')
    || normalizedMessage.includes('unreachable')
    || normalizedMessage.includes('timeout')
    || normalizedMessage.includes('routing');
}

async function probeToolkitFallbackHealth(): Promise<ServiceRuntimeHealth> {
  try {
    const rawProbeAnswer = await toolkitGenerateText({
      messages: [{ role: 'user', content: 'Reply with READY only.' }],
    });
    const answer = extractToolkitText(rawProbeAnswer);

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
  const rawAnswer = await toolkitGenerateText({
    messages: [{ role: 'user', content: prompt }],
  });
  const answer = extractToolkitText(rawAnswer);

  if (!answer) {
    console.log('[AIReplyService] Toolkit fallback returned non-usable output:', typeof rawAnswer, rawAnswer);
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
    source: 'toolkit_fallback',
  };
}

export async function probeAIBackendHealth(): Promise<IVXOwnerAIProbeResult> {
  const now = Date.now();
  const routingAudit = getIVXOwnerAIConfigAudit();
  if (now - lastProbeTimestamp < PROBE_CACHE_TTL_MS && cachedAIHealth !== 'inactive') {
    console.log('[AIReplyService] Using cached AI health:', cachedAIHealth);
    return {
      health: cachedAIHealth,
      roomStatus: null,
      source: cachedAIHealth === 'degraded' ? 'toolkit_fallback' : 'remote_api',
      endpoint: null,
      deploymentMarker: null,
      capabilities: null,
    };
  }

  console.log('[AIReplyService] Probing AI backend health...');

  if (!isSupabaseConfigured()) {
    console.log('[AIReplyService] Supabase not configured, probing toolkit fallback');
    cachedAIHealth = await probeToolkitFallbackHealth();
    lastProbeTimestamp = now;
    return {
      health: cachedAIHealth,
      roomStatus: null,
      source: 'toolkit_fallback',
      endpoint: null,
      deploymentMarker: null,
      capabilities: null,
    };
  }

  try {
    const probe = await ivxAIRequestService.probeOwnerAIHealth();
    cachedAIHealth = probe.health;
    lastProbeTimestamp = now;
    console.log('[AIReplyService] AI backend probe result:', {
      health: probe.health,
      source: probe.source,
      endpoint: probe.endpoint,
      deploymentMarker: probe.deploymentMarker,
    });
    return probe;
  } catch (error) {
    const message = (error as Error)?.message ?? '';
    if (routingAudit.currentEnvironment === 'development' && shouldFallbackToToolkit(null, message)) {
      console.log('[AIReplyService] AI backend probe failed, trying toolkit fallback:', message);
      cachedAIHealth = await probeToolkitFallbackHealth();
      lastProbeTimestamp = now;
      return {
        health: cachedAIHealth,
        roomStatus: null,
        source: 'toolkit_fallback',
        endpoint: null,
        deploymentMarker: null,
        capabilities: null,
      };
    }

    console.log('[AIReplyService] AI backend probe: inactive (error:', message, ')');
    cachedAIHealth = 'inactive';
    lastProbeTimestamp = now;
    return {
      health: 'inactive',
      roomStatus: null,
      source: 'unknown',
      endpoint: null,
      deploymentMarker: null,
      capabilities: null,
    };
  }
}

export async function requestAIReply(
  messageText: string,
  conversationId: string,
  senderLabel?: string | null,
): Promise<AIReplyResult> {
  const safeMessageText = safeString(messageText);
  console.log('[AIReplyService] Requesting AI reply for:', safeMessageText.slice(0, 60));

  const routingAudit = getIVXOwnerAIConfigAudit();
  try {
    const requestId = createRequestUuid();
    const response = await ivxAIRequestService.requestOwnerAI({
      requestId,
      conversationId,
      message: messageText,
      senderLabel: senderLabel ?? null,
      mode: 'chat',
      persistUserMessage: false,
      persistAssistantMessage: true,
      devTestModeActive: isDevTestModeEnabled(),
    });

    console.log('[AIReplyService] AI reply received:', {
      requestId: response.requestId,
      conversationId: response.conversationId,
      source: response.source,
      endpoint: response.endpoint,
      deploymentMarker: response.deploymentMarker,
      model: response.model,
      answerLength: response.answer.length,
    });

    cachedAIHealth = response.source === 'remote_api' ? 'active' : 'degraded';
    lastProbeTimestamp = Date.now();

    return {
      answer: response.answer,
      requestId: response.requestId,
      conversationId: response.conversationId,
      model: response.model,
      source: response.source ?? 'remote_api',
      endpoint: response.endpoint,
      deploymentMarker: response.deploymentMarker,
    };
  } catch (error) {
    const msg = (error as Error)?.message ?? 'Unknown error';
    const diagnostics = getIVXOwnerAIErrorDiagnostics(error);
    console.log('[AIReplyService] AI reply failed, falling back to toolkit:', {
      message: msg,
      routingPolicy: routingAudit.routingPolicy,
      diagnostics,
    });

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

export function parseOwnerCommand(text: unknown): OwnerCommandResult | null {
  const trimmed = safeTrimARS(text);
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

export function buildRuntimeSignalsFromProbe(probe: IVXOwnerAIProbeResult): ChatRoomRuntimeSignals {
  const ownerCommandHealth: ServiceRuntimeHealth = probe.health === 'active' ? 'active' : 'inactive';
  const knowledgeHealth: ServiceRuntimeHealth = probe.health === 'active' ? 'active' : 'inactive';

  return {
    aiBackendHealth: probe.health,
    aiBackendSource: probe.source,
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
