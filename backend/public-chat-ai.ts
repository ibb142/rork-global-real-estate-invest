import { IVX_OWNER_AI_PROFILE } from '../expo/constants/ivx-owner-ai';
import { getIVXAIEndpoint, isIVXAIConfigured, requestIVXAIText, resolveIVXAIModel, type IVXAIProviderMetadata } from './ivx-ai-runtime';
import type { ChatRoomMessage } from './chat-types';

export type PublicChatRole = 'user' | 'assistant';

export type PublicChatHistoryItem = {
  role: PublicChatRole;
  content: string;
};

export type PublicChatSource = 'chatgpt' | 'fallback';

export type PublicChatAnswerResult = {
  answer: string;
  model: string;
  source: PublicChatSource;
  endpoint: string | null;
  providerMetadata?: IVXAIProviderMetadata;
};

const MAX_HISTORY_ITEMS = 8;
const MAX_HISTORY_ITEM_LENGTH = 600;
const DEFAULT_PUBLIC_CHAT_MODEL = 'openai/gpt-4o-mini';

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getPublicChatModel(): string {
  return resolveIVXAIModel(
    readTrimmed(process.env.PUBLIC_CHAT_MODEL) || readTrimmed(process.env.OPENAI_MODEL) || DEFAULT_PUBLIC_CHAT_MODEL,
  );
}

function getGatewayModelEndpoint(): string | null {
  return getIVXAIEndpoint(getPublicChatModel());
}

export function isPublicChatAIConfigured(): boolean {
  return isIVXAIConfigured();
}

export function getPublicChatHealthSnapshot(): {
  aiEnabled: boolean;
  openAIModel: string;
  aiProvider: 'chatgpt' | 'fallback';
  aiEndpoint: string | null;
  ivxAIArchitecture: 'ivx-ai';
  ivxAIPhase: 'phase_1';
  ivxAIRuntimeLayer: 'ivx_ai_runtime_wrapper';
} {
  const aiEnabled = isPublicChatAIConfigured();
  return {
    aiEnabled,
    openAIModel: getPublicChatModel(),
    aiProvider: aiEnabled ? 'chatgpt' : 'fallback',
    aiEndpoint: getGatewayModelEndpoint(),
    ivxAIArchitecture: 'ivx-ai',
    ivxAIPhase: 'phase_1',
    ivxAIRuntimeLayer: 'ivx_ai_runtime_wrapper',
  };
}

function sanitizeHistoryItem(item: PublicChatHistoryItem): PublicChatHistoryItem | null {
  const role = item.role === 'assistant' ? 'assistant' : item.role === 'user' ? 'user' : null;
  const content = readTrimmed(item.content).slice(0, MAX_HISTORY_ITEM_LENGTH);
  if (!role || !content) {
    return null;
  }

  return {
    role,
    content,
  };
}

export function sanitizePublicChatHistory(history: PublicChatHistoryItem[]): PublicChatHistoryItem[] {
  return history
    .map(sanitizeHistoryItem)
    .filter((item): item is PublicChatHistoryItem => item !== null)
    .slice(-MAX_HISTORY_ITEMS);
}

export function mapRoomMessagesToPublicChatHistory(messages: ChatRoomMessage[]): PublicChatHistoryItem[] {
  return sanitizePublicChatHistory(
    messages.map((message) => ({
      role: message.source === 'assistant' ? 'assistant' : 'user',
      content: message.text,
    })),
  );
}

function buildTranscript(history: PublicChatHistoryItem[]): string {
  if (history.length === 0) {
    return 'No previous messages.';
  }

  return history.map((item) => `${item.role === 'assistant' ? 'Assistant' : 'User'}: ${item.content}`).join('\n');
}

function buildSystemPrompt(sessionId: string): string {
  return [
    `You are ${IVX_OWNER_AI_PROFILE.name}, the IVX AI assistant for the IVX public chat room.`,
    'Be concise, practical, and trustworthy.',
    'Help with IVX onboarding, investing basics, product navigation, API status checks, and deployment troubleshooting.',
    'Do not claim production changes, account access, AWS console actions, or billing actions were completed unless the user explicitly confirms them.',
    'If a request needs credentials, infrastructure console access, or legal approval, say that clearly and give the next safe step.',
    `Session: ${sessionId}`,
  ].join('\n\n');
}

export function buildFallbackAnswer(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('api') || normalized.includes('backend') || normalized.includes('health')) {
    return 'The app frontend is intended to run on chat.ivxholding.com and the API on api.ivxholding.com. If live replies fail, confirm DNS first, then check GET /health and POST /public/chat on the API host.';
  }

  if (normalized.includes('invest') || normalized.includes('real estate') || normalized.includes('property')) {
    return 'IVX is designed to make real-estate participation easier to understand. A good beginner flow is: learn the deal, review the timeline and return assumptions, understand the risks, then only invest after reading the actual documents.';
  }

  if (normalized.includes('login') || normalized.includes('sign up') || normalized.includes('account')) {
    return 'For account issues, keep the flow simple: sign up, verify your email, complete profile steps, then continue into the app. If a real account or verification issue is blocking progress, route it to human support.';
  }

  if (normalized.includes('deploy') || normalized.includes('production') || normalized.includes('ec2')) {
    return 'For a production-safe EC2 deployment, run the API behind HTTPS, keep /health live, restart the process with a supervisor, and only point chat.ivxholding.com at the exported web build after api.ivxholding.com is healthy.';
  }

  return 'I can help with IVX onboarding, beginner investing questions, product navigation, API checks, and deployment readiness. Ask one specific question and I will answer clearly.';
}

async function requestIVXAIAnswer(input: {
  message: string;
  history: PublicChatHistoryItem[];
  sessionId: string;
}): Promise<PublicChatAnswerResult> {
  const endpoint = getGatewayModelEndpoint();
  if (!isPublicChatAIConfigured() || !endpoint) {
    throw new Error('IVX AI proxy configuration is missing.');
  }

  const result = await requestIVXAIText({
    module: 'public-chat',
    requestId: input.sessionId,
    model: getPublicChatModel(),
    system: buildSystemPrompt(input.sessionId),
    prompt: [
      'Recent public chat transcript:',
      buildTranscript(input.history),
      '',
      `User message: ${input.message}`,
      '',
      'Reply directly to the user message. If the user asks for an exact token or proof string, include it exactly.',
    ].join('\n'),
  });

  return {
    answer: result.text,
    model: result.providerMetadata.model,
    source: 'chatgpt',
    endpoint: result.providerMetadata.endpoint,
    providerMetadata: result.providerMetadata,
  };
}

export async function generatePublicChatAnswer(input: {
  message: string;
  history: PublicChatHistoryItem[];
  sessionId: string;
}): Promise<PublicChatAnswerResult> {
  const history = sanitizePublicChatHistory(input.history);

  try {
    if (isPublicChatAIConfigured()) {
      const result = await requestIVXAIAnswer({
        message: input.message,
        history,
        sessionId: input.sessionId,
      });
      console.log('[PublicChatAI] IVX AI reply generated:', {
        model: result.model,
        endpoint: result.endpoint,
        historyCount: history.length,
        answerLength: result.answer.length,
      });
      return result;
    }
  } catch (error) {
    console.log('[PublicChatAI] IVX AI request failed, falling back:', error instanceof Error ? error.message : 'unknown');
  }

  return {
    answer: buildFallbackAnswer(input.message),
    model: isPublicChatAIConfigured() ? getPublicChatModel() : 'ivx-local-fallback',
    source: 'fallback',
    endpoint: getGatewayModelEndpoint(),
  };
}

export function buildPublicChatTranscript(history: PublicChatHistoryItem[]): string {
  return buildTranscript(sanitizePublicChatHistory(history));
}
