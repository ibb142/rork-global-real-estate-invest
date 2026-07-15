import { createGateway, generateText, streamText } from 'ai';
import { acquireAIQueueSlot, classifyRequestLane, type IVXAIQueueLane } from './services/ivx-ai-queue';
import { estimatePromptTokens, recordProviderTelemetry } from './services/ivx-provider-telemetry';
import { attemptProviderFallback, classifyProviderFailure, isFailureRetryable } from './services/ivx-ai-provider-fallback';

export type IVXAIModule = 'owner-room' | 'p0-ai-assistant' | 'p1-plan-creator' | 'public-chat' | string;
export type IVXAIMessageRole = 'user' | 'assistant';

export type IVXAITextMessage = {
  role: IVXAIMessageRole;
  content: string;
};

export type IVXAIImageAttachment = {
  url: string;
  mimeType?: string | null;
};

/**
 * A non-image binary attachment (PDF for OCR, video for understanding) passed to
 * a multimodal model as a `file` content part. `data` may be a URL, a base64
 * string, or raw bytes.
 */
export type IVXAIFileAttachment = {
  data: string | Uint8Array | ArrayBuffer;
  mediaType: string;
  filename?: string | null;
};

export type IVXAIProviderMetadata = {
  provider: 'chatgpt';
  source: 'remote_api';
  model: string;
  endpoint: string | null;
  runtime: 'ivx_ai_gateway';
  ivxAI: {
    architecture: 'ivx-ai';
    phase: 'agent_runtime_v2';
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
  runtime: 'ivx_ai_gateway';
  layer: 'ivx_ai_runtime_wrapper';
  phase: 'agent_runtime_v2';
};

const GATEWAY_BASE_PATH = '/v3/ai';
// Full multimodal model billed against the paid Vercel AI Gateway balance.
// gpt-4o-mini is a free-tier model that Vercel rate-limits and is the weakest
// vision model; gpt-4o gives real image + document analysis with no free-tier
// caps. Override with IVX_AI_MODEL / PUBLIC_CHAT_MODEL / OPENAI_MODEL if needed.
const DEFAULT_IVX_AI_MODEL = readTrimmed(process.env.IVX_AI_MODEL) || 'openai/gpt-4o';

// Adaptive timeout floor / ceiling. Short prompts resolve fast (floor), large
// reports get more headroom (ceiling). Tuned so a 12k-token report has ~90s
// to complete instead of dying at the legacy 8s wall.
const IVX_AI_TIMEOUT_FLOOR_MS = (() => {
  const raw = Number.parseInt(readTrimmed(process.env.IVX_AI_GATEWAY_TIMEOUT_MS) || '15000', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 15_000;
})();
const IVX_AI_TIMEOUT_CEIL_MS = (() => {
  const raw = Number.parseInt(readTrimmed(process.env.IVX_AI_GATEWAY_TIMEOUT_CEIL_MS) || '120000', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 120_000;
})();

/**
 * Compute an adaptive hard timeout based on the size of the work.
 *
 * Budget heuristics:
 *  - Base latency: floor (covers handshake + first-token latency)
 *  - Output budget: ~50ms per maxOutputToken (gpt-4o-mini sustains ~20 tok/s)
 *  - Prompt budget: ~2ms per prompt char (covers large context ingestion)
 * Clamped to [floor, ceiling].
 */
export function computeAdaptiveTimeoutMs(input: {
  promptChars: number;
  maxOutputTokens: number | null | undefined;
}): number {
  const outputBudget = (input.maxOutputTokens ?? 1500) * 50;
  const promptBudget = input.promptChars * 2;
  const budget = IVX_AI_TIMEOUT_FLOOR_MS + outputBudget + promptBudget;
  return Math.min(IVX_AI_TIMEOUT_CEIL_MS, Math.max(IVX_AI_TIMEOUT_FLOOR_MS, budget));
}

function runWithHardTimeout<T>(label: string, promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const err = new Error(`${label} timed out after ${timeoutMs}ms`);
      err.name = 'IVXAIGatewayTimeoutError';
      reject(err);
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nowIso(): string {
  return new Date().toISOString();
}

// Backend MUST talk directly to the canonical Vercel AI Gateway so the paid
// AI_GATEWAY_API_KEY bearer reaches Vercel intact. Any client-facing proxy
// (EXPO_PUBLIC_IVX_AI_GATEWAY_URL, e.g. ai.ivxholding.com) is intended for
// the frontend only and may strip the Authorization header, which causes the
// gateway to fall back to anonymous free-tier rate limits and return the
// "Free tier requests on this model are rate-limited" 429 even when the
// account has paid balance. The server-only override IVX_AI_GATEWAY_URL is
// honored for advanced routing; otherwise we go direct to Vercel.
function getIVXAIGatewayRootUrl(): string {
  const configured = readTrimmed(process.env.IVX_AI_GATEWAY_URL);
  // Rork independence guard (2026-07-07): never honor a gateway URL that
  // points at a Rork-hosted domain, even if a stale env var is still set on
  // the host. This makes the runtime self-healing: production cannot route
  // through toolkit.rork.com regardless of env var state.
  if (configured && !isRorkDomain(configured)) {
    return configured;
  }
  return 'https://ai-gateway.vercel.sh' /* INTENTIONAL: Vercel AI Gateway is the AI provider (not Vercel hosting). Backend-only, never in APK. */;
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

function isRorkDomain(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes('toolkit.rork.com')
    || lower.includes('api.rork.com')
    || lower.endsWith('.rork.com')
    || lower.includes('rork-direct.workers.dev');
}

function getGatewayBaseUrlCandidates(): string[] {
  const configured = getGatewayBaseUrl();
  const canonical = buildGatewayBaseUrl('https://ai-gateway.vercel.sh' /* INTENTIONAL: Vercel AI Gateway is the AI provider (not Vercel hosting). Backend-only, never in APK. */);
  // Always include the canonical Vercel gateway as a fallback candidate so a
  // misconfigured IVX_AI_GATEWAY_URL cannot strand the backend on a proxy that
  // strips auth headers (which causes free-tier 429s on a paid account).
  //
  // Rork toolkit cutover (2026-07-07): the Rork toolkit URL is no longer a
  // candidate. The IVX AI runtime now relies exclusively on IVX-owned
  // providers: the Vercel AI Gateway (AI_GATEWAY_API_KEY) as primary, and
  // OpenAI direct / Anthropic direct as fallbacks (see
  // ivx-ai-provider-fallback.ts). If none of these keys are configured the
  // runtime throws a clear configuration error instead of silently falling
  // back to a Rork-hosted endpoint.
  //
  // Rork independence guard (2026-07-07): any candidate that resolves to a
  // Rork domain is filtered out, so a stale IVX_AI_GATEWAY_URL env var on the
  // host cannot silently re-route production through toolkit.rork.com.
  const candidates = [configured, canonical].filter((c): c is string => c !== null && !isRorkDomain(c));

  return [...new Set(candidates)];
}

function ensureIVXAIGatewayEnvironment(): void {
  const apiKey = getIVXAIGatewayApiKey();
  if (!apiKey) {
    // Rork toolkit cutover (2026-07-07): the Rork toolkit key is no longer
    // accepted as a gateway bearer. The runtime now requires an IVX-owned
    // provider key: AI_GATEWAY_API_KEY (Vercel AI Gateway, primary) or
    // OPENAI_API_KEY / ANTHROPIC_API_KEY (direct fallbacks, handled by
    // attemptProviderFallback in ivx-ai-provider-fallback.ts).
    throw new Error(
      'IVX AI runtime is not configured. Set AI_GATEWAY_API_KEY (Vercel AI Gateway) ' +
        'or OPENAI_API_KEY / ANTHROPIC_API_KEY (direct fallbacks) on the backend host.',
    );
  }

  if (!readTrimmed(process.env.AI_GATEWAY_API_KEY)) {
    process.env.AI_GATEWAY_API_KEY = apiKey;
  }
}

// Rork toolkit cutover (2026-07-07): the Rork toolkit native URL, key
// resolver, isRorkToolkitBaseUrl, and callRorkToolkitNative function have been
// removed. The IVX AI runtime no longer routes to toolkit.rork.com under any
// condition. All AI traffic now flows through IVX-owned providers: the Vercel
// AI Gateway (AI_GATEWAY_API_KEY) as primary, and OpenAI direct / Anthropic
// direct as fallbacks (see ivx-ai-provider-fallback.ts).

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
    runtime: 'ivx_ai_gateway',
    layer: 'ivx_ai_runtime_wrapper',
    phase: 'agent_runtime_v2',
  };
}

export async function requestIVXAIText(input: {
  module: IVXAIModule;
  requestId?: string | null;
  model?: string | null;
  system?: string | null;
  prompt?: string | null;
  messages?: IVXAITextMessage[];
  images?: IVXAIImageAttachment[];
  files?: IVXAIFileAttachment[];
  maxOutputTokens?: number;
}): Promise<IVXAITextResult> {
  const model = resolveIVXAIModel(input.model);
  const endpoint = getIVXAIEndpoint(model);
  const messages = normalizeMessages(input.messages);
  const prompt = readTrimmed(input.prompt);
  const system = readTrimmed(input.system);
  const images = (input.images ?? [])
    .map((img) => ({ url: readTrimmed(img.url), mimeType: readTrimmed(img.mimeType ?? '') || null }))
    .filter((img) => img.url.length > 0);
  const files = (input.files ?? []).filter(
    (file) => readTrimmed(file.mediaType).length > 0 && file.data != null,
  );

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
    maxOutputTokens: input.maxOutputTokens ?? null,
    phase: 'agent_runtime_v2',
    layer: 'ivx_ai_runtime_wrapper',
  });

  // Adaptive timeout + queue gating: long prompts/reports get more time and a
  // dedicated lane so they cannot block normal chat under contention.
  const promptChars = prompt.length + system.length + messages.reduce((sum, m) => sum + m.content.length, 0);
  const adaptiveTimeoutMs = computeAdaptiveTimeoutMs({ promptChars, maxOutputTokens: input.maxOutputTokens });
  const queueLane: IVXAIQueueLane = classifyRequestLane({ promptChars, maxOutputTokens: input.maxOutputTokens });
  const queueSlot = await acquireAIQueueSlot(queueLane);
  const callStartedAt = Date.now();

  let result: Awaited<ReturnType<typeof generateText>> | null = null;
  let lastError: unknown = null;
  let lastFailure: { status: number | null; responseBody: unknown } = { status: null, responseBody: null };
  let successfulBaseUrl = baseUrlCandidates[0];
  let retryCount = 0;

  for (const baseURL of baseUrlCandidates) {
    ensureIVXAIGatewayEnvironment();
    try {
      const gatewayProvider = createGateway({
        apiKey: getIVXAIGatewayApiKey(),
        baseURL,
      });
      const callTimeoutMs = adaptiveTimeoutMs;
      if (images.length > 0 || files.length > 0) {
        // Multimodal request: build a single user message with text + image/file
        // parts so multimodal models (gpt-4o family for images/PDF OCR, video-
        // capable models for video) can actually see the attachments.
        const baseMessages = messages.length > 0
          ? messages.slice(0, -1)
          : [];
        const lastTextMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        const userText = readTrimmed(
          (lastTextMessage && lastTextMessage.role === 'user' ? lastTextMessage.content : '') || prompt
        ) || 'Describe the attached file(s).';
        const multimodalUser = {
          role: 'user' as const,
          content: [
            { type: 'text' as const, text: userText },
            ...images.map((img) => ({ type: 'image' as const, image: img.url })),
            ...files.map((file) => ({ type: 'file' as const, data: file.data, mediaType: file.mediaType })),
          ],
        };
        const finalMessages = lastTextMessage && lastTextMessage.role === 'user'
          ? [...baseMessages, multimodalUser]
          : [...messages, multimodalUser];
        result = await runWithHardTimeout('IVX AI gateway (multimodal)', generateText({
          model: gatewayProvider(model),
          system: system.length > 0 ? system : undefined,
          maxOutputTokens: input.maxOutputTokens,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          messages: finalMessages as any,
        }), callTimeoutMs);
      } else {
        result = messages.length > 0
          ? await runWithHardTimeout('IVX AI gateway (messages)', generateText({
              model: gatewayProvider(model),
              system: system.length > 0 ? system : undefined,
              maxOutputTokens: input.maxOutputTokens,
              messages,
            }), callTimeoutMs)
          : await runWithHardTimeout('IVX AI gateway (prompt)', generateText({
              model: gatewayProvider(model),
              system: system.length > 0 ? system : undefined,
              maxOutputTokens: input.maxOutputTokens,
              prompt,
            }), callTimeoutMs);
      }
      successfulBaseUrl = baseURL;
      break;
    } catch (error) {
      retryCount += 1;
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
    queueSlot.release();
    const failureMessage = lastError instanceof Error ? lastError.message : 'Gateway request failed';
    const isTimeout = lastError instanceof Error && lastError.name === 'IVXAIGatewayTimeoutError';

    // Multi-provider fallback chain. Only invoked when:
    //   - all primary gateway base URLs failed
    //   - failure is in a retryable class (timeout / rate_limit / quota / 5xx / network)
    //   - at least one fallback provider has its env key configured
    // Fallbacks NEVER log API keys or prompt content.
    const failureClass = classifyProviderFailure(lastError);
    if (isFailureRetryable(failureClass)) {
      const fallbackResult = await attemptProviderFallback({
        module: String(input.module),
        requestId: input.requestId ?? null,
        system,
        prompt,
        messages,
        maxOutputTokens: input.maxOutputTokens ?? null,
        timeoutMs: adaptiveTimeoutMs,
      });
      if (fallbackResult) {
        const fallbackMetadata: IVXAIProviderMetadata = {
          provider: 'chatgpt',
          source: 'remote_api',
          model: fallbackResult.model,
          endpoint: null,
          runtime: 'ivx_ai_gateway',
          ivxAI: {
            architecture: 'ivx-ai',
            phase: 'agent_runtime_v2',
            layer: 'ivx_ai_runtime_wrapper',
            module: input.module,
            providerDependency: 'chatgpt_current_baseline',
            requestId: input.requestId ?? null,
            generatedAt: nowIso(),
          },
        };
        recordProviderTelemetry({
          traceId: input.requestId ?? null,
          module: String(input.module),
          model: fallbackResult.model,
          endpoint: null,
          promptChars,
          promptTokensEstimated: estimatePromptTokens(promptChars),
          completionTokens: null,
          totalTokens: null,
          latencyMs: Date.now() - callStartedAt,
          retryCount: Math.max(0, retryCount - 1),
          status: 'ok',
          httpStatus: 200,
          failureReason: `primary_failed_${failureClass}_fallback=${fallbackResult.provider}`,
          maxOutputTokens: input.maxOutputTokens ?? null,
          adaptiveTimeoutMs,
          queueWaitMs: queueSlot.waitMs,
        });
        console.log('[IVXAI] Recovered via fallback provider:', {
          module: input.module,
          requestId: input.requestId ?? null,
          primaryFailureClass: failureClass,
          fallbackProvider: fallbackResult.provider,
          fallbackModel: fallbackResult.model,
        });
        return {
          text: fallbackResult.text,
          usage: null,
          providerMetadata: fallbackMetadata,
        };
      }
    }

    recordProviderTelemetry({
      traceId: input.requestId ?? null,
      module: String(input.module),
      model,
      endpoint,
      promptChars,
      promptTokensEstimated: estimatePromptTokens(promptChars),
      completionTokens: null,
      totalTokens: null,
      latencyMs: Date.now() - callStartedAt,
      retryCount: Math.max(0, retryCount - 1),
      status: isTimeout ? 'timeout' : 'failed',
      httpStatus: lastFailure.status,
      failureReason: failureMessage,
      maxOutputTokens: input.maxOutputTokens ?? null,
      adaptiveTimeoutMs,
      queueWaitMs: queueSlot.waitMs,
    });
    throw normalizeGatewayFailure(lastError, {
      module: input.module,
      requestId: input.requestId ?? null,
      model,
      endpoint,
      status: lastFailure.status,
      responseBody: lastFailure.responseBody,
    });
  }
  queueSlot.release();

  const text = readTrimmed(result.text);
  if (!text) {
    throw new Error('IVX AI runtime returned an empty response.');
  }

  const providerMetadata: IVXAIProviderMetadata = {
    provider: 'chatgpt',
    source: 'remote_api',
    model,
    endpoint: `${successfulBaseUrl}/${model}`,
    runtime: 'ivx_ai_gateway',
    ivxAI: {
      architecture: 'ivx-ai',
      phase: 'agent_runtime_v2',
      layer: 'ivx_ai_runtime_wrapper',
      module: input.module,
      providerDependency: 'chatgpt_current_baseline',
      requestId: input.requestId ?? null,
      generatedAt: nowIso(),
    },
  };

  const usageRecord = (result.usage ?? null) as { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null;
  recordProviderTelemetry({
    traceId: input.requestId ?? null,
    module: String(input.module),
    model,
    endpoint: `${successfulBaseUrl}/${model}`,
    promptChars,
    promptTokensEstimated: estimatePromptTokens(promptChars),
    completionTokens: typeof usageRecord?.outputTokens === 'number' ? usageRecord.outputTokens : null,
    totalTokens: typeof usageRecord?.totalTokens === 'number' ? usageRecord.totalTokens : null,
    latencyMs: Date.now() - callStartedAt,
    retryCount,
    status: 'ok',
    httpStatus: 200,
    failureReason: null,
    maxOutputTokens: input.maxOutputTokens ?? null,
    adaptiveTimeoutMs,
    queueWaitMs: queueSlot.waitMs,
  });

  console.log('[IVXAI] Request completed through IVX AI wrapper:', {
    module: input.module,
    requestId: input.requestId ?? null,
    provider: providerMetadata.provider,
    source: providerMetadata.source,
    model,
    answerLength: text.length,
    latencyMs: Date.now() - callStartedAt,
    adaptiveTimeoutMs,
    queueLane,
    queueWaitMs: queueSlot.waitMs,
  });

  return {
    text,
    usage: result.usage ?? null,
    providerMetadata,
  };
}

export type IVXAIStreamChunk = {
  type: 'delta' | 'done' | 'error';
  delta?: string;
  text?: string;
  error?: string;
  usage?: unknown;
  providerMetadata?: IVXAIProviderMetadata;
};

/**
 * Streaming variant of `requestIVXAIText`. Yields delta chunks as they arrive
 * from the gateway, then a final `done` chunk with full text + usage + provider
 * metadata. Records the same telemetry shape as the non-streaming path.
 *
 * Failures are yielded as a single `error` chunk (no throw) so SSE consumers
 * never see a half-open stream.
 */
export async function* streamIVXAIText(input: {
  module: IVXAIModule;
  requestId?: string | null;
  model?: string | null;
  system?: string | null;
  prompt?: string | null;
  messages?: IVXAITextMessage[];
  maxOutputTokens?: number;
}): AsyncGenerator<IVXAIStreamChunk, void, void> {
  const model = resolveIVXAIModel(input.model);
  const messages = normalizeMessages(input.messages);
  const prompt = readTrimmed(input.prompt);
  const system = readTrimmed(input.system);

  if (!prompt && messages.length === 0) {
    yield { type: 'error', error: 'IVX AI request requires a prompt or messages.' };
    return;
  }

  const baseUrlCandidates = getGatewayBaseUrlCandidates();
  if (baseUrlCandidates.length === 0) {
    yield { type: 'error', error: 'IVX AI runtime is not configured.' };
    return;
  }

  const promptChars = prompt.length + system.length + messages.reduce((sum, m) => sum + m.content.length, 0);
  const adaptiveTimeoutMs = computeAdaptiveTimeoutMs({ promptChars, maxOutputTokens: input.maxOutputTokens });
  const queueLane = classifyRequestLane({ promptChars, maxOutputTokens: input.maxOutputTokens });
  const queueSlot = await acquireAIQueueSlot(queueLane);
  const callStartedAt = Date.now();

  ensureIVXAIGatewayEnvironment();
  const baseURL = baseUrlCandidates[0];

  let accumulated = '';
  let lastError: string | null = null;
  let usage: unknown = null;
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; }, adaptiveTimeoutMs);

  try {
    const gatewayProvider = createGateway({ apiKey: getIVXAIGatewayApiKey(), baseURL });
    const streamResult = streamText({
      model: gatewayProvider(model),
      system: system.length > 0 ? system : undefined,
      maxOutputTokens: input.maxOutputTokens,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(messages.length > 0 ? { messages } as any : { prompt }),
    });

    for await (const delta of streamResult.textStream) {
      if (timedOut) {
        lastError = `IVX AI stream timed out after ${adaptiveTimeoutMs}ms`;
        break;
      }
      accumulated += delta;
      yield { type: 'delta', delta };
    }

    if (!timedOut) {
      try {
        usage = await streamResult.usage;
      } catch {
        usage = null;
      }
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'IVX AI stream failed';
  } finally {
    clearTimeout(timer);
    queueSlot.release();
  }

  const usageRecord = usage as { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null;
  recordProviderTelemetry({
    traceId: input.requestId ?? null,
    module: String(input.module),
    model,
    endpoint: `${baseURL}/${model}`,
    promptChars,
    promptTokensEstimated: estimatePromptTokens(promptChars),
    completionTokens: typeof usageRecord?.outputTokens === 'number' ? usageRecord.outputTokens : null,
    totalTokens: typeof usageRecord?.totalTokens === 'number' ? usageRecord.totalTokens : null,
    latencyMs: Date.now() - callStartedAt,
    retryCount: 0,
    status: lastError ? (timedOut ? 'timeout' : 'failed') : 'ok',
    httpStatus: lastError ? null : 200,
    failureReason: lastError,
    maxOutputTokens: input.maxOutputTokens ?? null,
    adaptiveTimeoutMs,
    queueWaitMs: queueSlot.waitMs,
  });

  if (lastError && accumulated.length === 0) {
    yield { type: 'error', error: lastError };
    return;
  }

  const providerMetadata: IVXAIProviderMetadata = {
    provider: 'chatgpt',
    source: 'remote_api',
    model,
    endpoint: `${baseURL}/${model}`,
    runtime: 'ivx_ai_gateway',
    ivxAI: {
      architecture: 'ivx-ai',
      phase: 'agent_runtime_v2',
      layer: 'ivx_ai_runtime_wrapper',
      module: input.module,
      providerDependency: 'chatgpt_current_baseline',
      requestId: input.requestId ?? null,
      generatedAt: nowIso(),
    },
  };

  yield {
    type: 'done',
    text: accumulated,
    usage,
    providerMetadata,
    ...(lastError ? { error: lastError } : {}),
  };
}
