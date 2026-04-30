import { generateText } from 'ai';

export type IVXAIModule = 'owner-room' | 'p0-ai-assistant' | 'p1-plan-creator' | 'public-chat' | string;
export type IVXAIMessageRole = 'user' | 'assistant';

export type IVXAITextMessage = {
  role: IVXAIMessageRole;
  content: string;
};

export type IVXAIProviderMetadata = {
  provider: 'chatgpt';
  source: 'remote_api';
  model: string;
  endpoint: string | null;
  runtime: 'vercel_ai_gateway';
  ivxAI: {
    architecture: 'ivx-ai';
    phase: 'phase_1';
    layer: 'ivx_ai_runtime_wrapper';
    module: string;
    providerDependency: 'chatgpt_current_baseline';
    requestId: string | null;
    generatedAt: string;
  };
};

export type IVXAITextResult = {
  text: string;
  usage: unknown;
  providerMetadata: IVXAIProviderMetadata;
};

type IVXAIGatewayFailureContext = {
  module: string;
  requestId: string | null;
  model: string;
  endpoint: string | null;
  status?: number | null;
  responseBody?: unknown;
};

export type IVXAIConfigurationSnapshot = {
  configured: boolean;
  hasGatewayUrl: boolean;
  hasGatewayApiKey: boolean;
  model: string;
  endpoint: string | null;
  runtime: 'vercel_ai_gateway';
  layer: 'ivx_ai_runtime_wrapper';
  phase: 'phase_1';
};

const GATEWAY_BASE_PATH = '/v2/vercel/v3/ai';
const DEFAULT_IVX_AI_MODEL = 'openai/gpt-4o-mini';

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nowIso(): string {
  return new Date().toISOString();
}

function getIVXAIGatewayRootUrl(): string {
  return readTrimmed(process.env.EXPO_PUBLIC_IVX_AI_GATEWAY_URL)
    || readTrimmed(process.env.IVX_AI_GATEWAY_URL)
    || readTrimmed(process.env.EXPO_PUBLIC_TOOLKIT_URL)
    || 'https://toolkit.rork.com';
}

function getIVXAIGatewayApiKey(): string {
  return readTrimmed(process.env.AI_GATEWAY_API_KEY);
}

function buildGatewayBaseUrl(rootUrl: string): string | null {
  const gatewayRootUrl = readTrimmed(rootUrl).replace(/\/+$/, '');
  if (!gatewayRootUrl) {
    return null;
  }

  if (gatewayRootUrl.endsWith('/v3/ai') || gatewayRootUrl.endsWith(GATEWAY_BASE_PATH)) {
    return gatewayRootUrl;
  }

  return new URL(GATEWAY_BASE_PATH, `${gatewayRootUrl}/`).toString().replace(/\/+$/, '');
}

function getGatewayBaseUrl(): string | null {
  return buildGatewayBaseUrl(getIVXAIGatewayRootUrl());
}

function getGatewayBaseUrlCandidates(): string[] {
  const configured = getGatewayBaseUrl();
  const candidates = [configured];
  const configuredRoot = getIVXAIGatewayRootUrl();
  const configuredHost = (() => {
    try {
      return new URL(configuredRoot).hostname;
    } catch {
      return '';
    }
  })();

  if (configuredHost === 'ai.ivxholding.com') {
    candidates.push(buildGatewayBaseUrl('https://ai-gateway.vercel.sh/v3/ai'));
  }

  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))];
}

function ensureIVXAIGatewayEnvironment(): void {
  const apiKey = getIVXAIGatewayApiKey();
  if (!apiKey) {
    throw new Error('IVX AI runtime is not configured.');
  }

  if (!readTrimmed(process.env.AI_GATEWAY_API_KEY)) {
    process.env.AI_GATEWAY_API_KEY = apiKey;
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function extractGatewayFailureContext(error: unknown): { status: number | null; responseBody: unknown } {
  const record = readRecord(error);
  const response = readRecord(record.response);
  const cause = readRecord(record.cause);
  const status = typeof record.statusCode === 'number'
    ? record.statusCode
    : typeof record.status === 'number'
      ? record.status
      : typeof record.responseStatus === 'number'
        ? record.responseStatus
        : typeof response.status === 'number'
          ? response.status
          : typeof cause.status === 'number'
            ? cause.status
            : null;
  const responseBody = record.responseBody
    ?? response.body
    ?? response.data
    ?? record.data
    ?? record.body
    ?? cause.responseBody
    ?? cause.body
    ?? null;
  return { status, responseBody };
}

function normalizeGatewayFailure(error: unknown, context: IVXAIGatewayFailureContext): Error {
  const message = error instanceof Error ? error.message : 'Gateway request failed';
  const body = typeof context.responseBody === 'string'
    ? context.responseBody.slice(0, 600)
    : context.responseBody && typeof context.responseBody === 'object'
      ? JSON.stringify(context.responseBody).slice(0, 600)
      : null;
  const detail = [
    `IVX AI gateway request failed for ${context.module}.`,
    `endpoint=${context.endpoint ?? 'unresolved'}`,
    `model=${context.model}`,
    context.status ? `status=${context.status}` : null,
    `providerError=${message}`,
    body ? `responseBody=${body}` : null,
  ].filter(Boolean).join(' ');
  const normalized = new Error(detail);
  normalized.name = 'IVXAIGatewayRequestError';
  return normalized;
}

function normalizeMessages(messages: IVXAITextMessage[] | undefined): IVXAITextMessage[] {
  return (messages ?? [])
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: readTrimmed(message.content),
    }))
    .filter((message) => message.content.length > 0);
}

export function resolveIVXAIModel(explicitModel?: string | null, envCandidates: string[] = []): string {
  const explicit = readTrimmed(explicitModel);
  if (explicit) {
    return explicit;
  }

  for (const envName of envCandidates) {
    const candidate = readTrimmed(process.env[envName]);
    if (candidate) {
      return candidate;
    }
  }

  return DEFAULT_IVX_AI_MODEL;
}

export function getIVXAIEndpoint(model: string = DEFAULT_IVX_AI_MODEL): string | null {
  const baseUrl = getGatewayBaseUrl();
  if (!baseUrl) {
    return null;
  }

  return `${baseUrl}/${model}`;
}

export function isIVXAIConfigured(): boolean {
  return getIVXAIGatewayRootUrl().length > 0 && getIVXAIGatewayApiKey().length > 0;
}

export function getIVXAIConfigurationSnapshot(model: string = DEFAULT_IVX_AI_MODEL): IVXAIConfigurationSnapshot {
  const hasGatewayUrl = getIVXAIGatewayRootUrl().length > 0;
  const hasGatewayApiKey = getIVXAIGatewayApiKey().length > 0;
  return {
    configured: hasGatewayUrl && hasGatewayApiKey,
    hasGatewayUrl,
    hasGatewayApiKey,
    model,
    endpoint: getIVXAIEndpoint(model),
    runtime: 'vercel_ai_gateway',
    layer: 'ivx_ai_runtime_wrapper',
    phase: 'phase_1',
  };
}

export async function requestIVXAIText(input: {
  module: IVXAIModule;
  requestId?: string | null;
  model?: string | null;
  system?: string | null;
  prompt?: string | null;
  messages?: IVXAITextMessage[];
}): Promise<IVXAITextResult> {
  const model = resolveIVXAIModel(input.model);
  const endpoint = getIVXAIEndpoint(model);
  const messages = normalizeMessages(input.messages);
  const prompt = readTrimmed(input.prompt);
  const system = readTrimmed(input.system);

  if (!prompt && messages.length === 0) {
    throw new Error('IVX AI request requires a prompt or messages.');
  }

  const baseUrlCandidates = getGatewayBaseUrlCandidates();
  if (baseUrlCandidates.length === 0) {
    throw new Error('IVX AI runtime is not configured.');
  }

  console.log('[IVXAI] Routing request through IVX AI Phase 1 wrapper:', {
    module: input.module,
    requestId: input.requestId ?? null,
    model,
    endpoint,
    baseUrlCandidates,
    hasSystem: system.length > 0,
    promptLength: prompt.length,
    messageCount: messages.length,
    authKeySource: 'AI_GATEWAY_API_KEY',
    requestShape: messages.length > 0 ? 'messages' : 'prompt',
    phase: 'phase_1',
    layer: 'ivx_ai_runtime_wrapper',
  });

  let result: Awaited<ReturnType<typeof generateText>> | null = null;
  let lastError: unknown = null;
  let lastFailure: { status: number | null; responseBody: unknown } = { status: null, responseBody: null };
  let successfulBaseUrl = baseUrlCandidates[0];

  for (const baseURL of baseUrlCandidates) {
    ensureIVXAIGatewayEnvironment();
    try {
      result = messages.length > 0
        ? await generateText({
            model,
            system: system.length > 0 ? system : undefined,
            messages,
          })
        : await generateText({
            model,
            system: system.length > 0 ? system : undefined,
            prompt,
          });
      successfulBaseUrl = baseURL;
      break;
    } catch (error) {
      const failure = extractGatewayFailureContext(error);
      lastError = error;
      lastFailure = failure;
      console.error('[IVXAI] Gateway request failed:', {
        module: input.module,
        requestId: input.requestId ?? null,
        model,
            endpoint: `${baseURL}/${model}`,
        status: failure.status,
        error: error instanceof Error ? error.message : 'Gateway request failed',
        responseBodyType: typeof failure.responseBody,
        responseBodyPreview: typeof failure.responseBody === 'string'
          ? failure.responseBody.slice(0, 400)
          : failure.responseBody && typeof failure.responseBody === 'object'
            ? JSON.stringify(failure.responseBody).slice(0, 400)
            : null,
        errorName: error instanceof Error ? error.name : null,
      });
    }
  }

  if (!result) {
    throw normalizeGatewayFailure(lastError, {
      module: input.module,
      requestId: input.requestId ?? null,
      model,
      endpoint,
      status: lastFailure.status,
      responseBody: lastFailure.responseBody,
    });
  }

  const text = readTrimmed(result.text);
  if (!text) {
    throw new Error('IVX AI runtime returned an empty response.');
  }

  const providerMetadata: IVXAIProviderMetadata = {
    provider: 'chatgpt',
    source: 'remote_api',
    model,
    endpoint: `${successfulBaseUrl}/${model}`,
    runtime: 'vercel_ai_gateway',
    ivxAI: {
      architecture: 'ivx-ai',
      phase: 'phase_1',
      layer: 'ivx_ai_runtime_wrapper',
      module: input.module,
      providerDependency: 'chatgpt_current_baseline',
      requestId: input.requestId ?? null,
      generatedAt: nowIso(),
    },
  };

  console.log('[IVXAI] Request completed through IVX AI wrapper:', {
    module: input.module,
    requestId: input.requestId ?? null,
    provider: providerMetadata.provider,
    source: providerMetadata.source,
    model,
    answerLength: text.length,
  });

  return {
    text,
    usage: result.usage ?? null,
    providerMetadata,
  };
}
