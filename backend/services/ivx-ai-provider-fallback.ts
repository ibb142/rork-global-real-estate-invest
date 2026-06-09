/**
 * IVX AI Multi-Provider Fallback Chain
 *
 * Adds a safe, opt-in fallback abstraction around `requestIVXAIText`. The
 * primary provider stays the existing Vercel AI Gateway path
 * (`AI_GATEWAY_API_KEY`). Fallbacks are ONLY registered when their
 * provider-specific env var is set; otherwise the chain is a no-op and the
 * caller still sees the original primary failure.
 *
 * Hard rules:
 *   - never log API keys, never log prompt content, never echo bodies
 *   - never return secret values from the status endpoint (name + status only)
 *   - never invoke a fallback unless its env key exists
 *   - never use a fallback for streaming (yet) — only for completion replies
 *   - classified failures (auth/quota/timeout/network/unknown) so callers can
 *     decide policy; only retryable classes trigger fallback
 */

export type IVXProviderName = 'vercel_ai_gateway' | 'openai_direct' | 'anthropic_direct';
export type IVXProviderFailureClass =
  | 'auth'
  | 'quota'
  | 'rate_limit'
  | 'timeout'
  | 'network'
  | 'bad_request'
  | 'server_error'
  | 'unknown';

export type IVXProviderStatus = {
  name: IVXProviderName;
  role: 'primary' | 'fallback';
  configured: boolean;
  /** Which env var(s) gate this provider. Never returns the actual value. */
  envGates: string[];
};

export type IVXProviderInvocationResult = {
  text: string;
  provider: IVXProviderName;
  model: string;
  latencyMs: number;
};

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasEnv(name: string): boolean {
  return readTrimmed(process.env[name]).length > 0;
}

/** Public, secret-free provider snapshot for the owner status route. */
export function getIVXProviderChainSnapshot(): {
  primary: IVXProviderStatus;
  fallbacks: IVXProviderStatus[];
  fallbackEnabled: boolean;
} {
  const primary: IVXProviderStatus = {
    name: 'vercel_ai_gateway',
    role: 'primary',
    configured: hasEnv('AI_GATEWAY_API_KEY'),
    envGates: ['AI_GATEWAY_API_KEY'],
  };
  const fallbacks: IVXProviderStatus[] = [
    {
      name: 'openai_direct',
      role: 'fallback',
      configured: hasEnv('OPENAI_API_KEY'),
      envGates: ['OPENAI_API_KEY'],
    },
    {
      name: 'anthropic_direct',
      role: 'fallback',
      configured: hasEnv('ANTHROPIC_API_KEY'),
      envGates: ['ANTHROPIC_API_KEY'],
    },
  ];
  const fallbackEnabled = fallbacks.some((p) => p.configured);
  return { primary, fallbacks, fallbackEnabled };
}

/** Map a thrown gateway error into a coarse class. */
export function classifyProviderFailure(error: unknown): IVXProviderFailureClass {
  if (!error) return 'unknown';
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  const statusMatch = message.match(/status=(\d{3})/);
  const status = statusMatch ? Number.parseInt(statusMatch[1], 10) : null;

  if (name === 'IVXAIGatewayTimeoutError' || message.includes('timed out') || message.includes('etimedout')) {
    return 'timeout';
  }
  if (status === 401 || status === 403 || message.includes('unauthor') || message.includes('forbidden')) {
    return 'auth';
  }
  if (status === 429 || message.includes('rate-limit') || message.includes('rate limit')) {
    return 'rate_limit';
  }
  if (message.includes('insufficient_quota') || message.includes('quota')) {
    return 'quota';
  }
  if (status && status >= 500) {
    return 'server_error';
  }
  if (status === 400 || status === 422) {
    return 'bad_request';
  }
  if (message.includes('econnreset') || message.includes('fetch failed') || message.includes('network')) {
    return 'network';
  }
  return 'unknown';
}

/** Failure classes safe to retry against a different provider. */
export function isFailureRetryable(cls: IVXProviderFailureClass): boolean {
  return cls === 'timeout'
    || cls === 'rate_limit'
    || cls === 'quota'
    || cls === 'server_error'
    || cls === 'network';
}

type FallbackInput = {
  module: string;
  requestId: string | null;
  system: string;
  prompt: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  maxOutputTokens: number | null | undefined;
  timeoutMs: number;
};

async function callOpenAIDirect(input: FallbackInput): Promise<IVXProviderInvocationResult> {
  const apiKey = readTrimmed(process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error('openai_direct fallback not configured');
  const model = readTrimmed(process.env.IVX_OPENAI_FALLBACK_MODEL) || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';
  const chatMessages: { role: string; content: string }[] = [];
  if (input.system) chatMessages.push({ role: 'system', content: input.system });
  if (input.messages.length > 0) {
    for (const m of input.messages) chatMessages.push({ role: m.role, content: m.content });
  } else if (input.prompt) {
    chatMessages.push({ role: 'user', content: input.prompt });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Never logged anywhere in this module.
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: chatMessages,
        max_tokens: input.maxOutputTokens ?? undefined,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`openai_direct status=${response.status}`);
    }
    const json = await response.json() as { choices?: { message?: { content?: string } }[] };
    const text = readTrimmed(json.choices?.[0]?.message?.content ?? '');
    if (!text) throw new Error('openai_direct empty response');
    return { text, provider: 'openai_direct', model, latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

async function callAnthropicDirect(input: FallbackInput): Promise<IVXProviderInvocationResult> {
  const apiKey = readTrimmed(process.env.ANTHROPIC_API_KEY);
  if (!apiKey) throw new Error('anthropic_direct fallback not configured');
  const model = readTrimmed(process.env.IVX_ANTHROPIC_FALLBACK_MODEL) || 'claude-3-5-haiku-latest';
  const url = 'https://api.anthropic.com/v1/messages';
  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  if (input.messages.length > 0) {
    for (const m of input.messages) messages.push({ role: m.role, content: m.content });
  } else if (input.prompt) {
    messages.push({ role: 'user', content: input.prompt });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        system: input.system || undefined,
        messages,
        max_tokens: input.maxOutputTokens ?? 1024,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`anthropic_direct status=${response.status}`);
    }
    const json = await response.json() as { content?: { type?: string; text?: string }[] };
    const text = readTrimmed(
      (json.content ?? [])
        .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text as string)
        .join('\n'),
    );
    if (!text) throw new Error('anthropic_direct empty response');
    return { text, provider: 'anthropic_direct', model, latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Try configured fallback providers in order. Returns the first success.
 * Returns `null` if no fallback is configured OR all configured fallbacks
 * failed. Never throws — caller stays in control of the original error.
 *
 * Logs are intentionally low-fidelity: provider name + failure class only.
 * No prompt text, no API keys, no response bodies.
 */
export async function attemptProviderFallback(input: FallbackInput): Promise<IVXProviderInvocationResult | null> {
  const chain: { name: IVXProviderName; run: (i: FallbackInput) => Promise<IVXProviderInvocationResult> }[] = [];
  if (hasEnv('OPENAI_API_KEY')) chain.push({ name: 'openai_direct', run: callOpenAIDirect });
  if (hasEnv('ANTHROPIC_API_KEY')) chain.push({ name: 'anthropic_direct', run: callAnthropicDirect });
  if (chain.length === 0) return null;

  for (const link of chain) {
    try {
      const result = await link.run(input);
      console.log('[IVXAI][fallback] provider succeeded', {
        module: input.module,
        requestId: input.requestId,
        provider: link.name,
        model: result.model,
        latencyMs: result.latencyMs,
      });
      return result;
    } catch (error) {
      const cls = classifyProviderFailure(error);
      console.error('[IVXAI][fallback] provider failed', {
        module: input.module,
        requestId: input.requestId,
        provider: link.name,
        failureClass: cls,
        // Intentionally NOT logging error.message in case provider responses
        // echo prompts; class + name is enough for diagnostics.
      });
    }
  }
  return null;
}
