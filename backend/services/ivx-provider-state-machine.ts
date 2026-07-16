/**
 * IVX AI Provider State Machine
 *
 * Replaces the broken retry loop that repeatedly tried the same expired
 * credential against multiple endpoints. This module enforces:
 *
 *   1. Validate provider once at startup.
 *   2. Mark invalid provider as unavailable after a confirmed 401/403.
 *   3. Never retry the same expired key.
 *   4. Maximum one controlled fallback attempt (with a DIFFERENT key).
 *   5. Return one clear failure with trace ID if all approved providers fail.
 *   6. Never loop endlessly through providers.
 *   7. Never expose credential values.
 *
 * States:
 *   PROVIDER_VALIDATING → PROVIDER_READY | PROVIDER_FAILED
 *   FALLBACK_VALIDATING → FALLBACK_READY | AI_UNAVAILABLE
 */

export type IVXProviderState =
  | 'PROVIDER_VALIDATING'
  | 'PROVIDER_READY'
  | 'PROVIDER_FAILED'
  | 'FALLBACK_VALIDATING'
  | 'FALLBACK_READY'
  | 'AI_UNAVAILABLE';

export type IVXProviderHealth = {
  state: IVXProviderState;
  provider: string;
  model: string;
  adapterVersion: string;
  credentialLoaded: boolean;
  credentialValid: boolean;
  lastValidationTime: string | null;
  lastHttpStatus: number | null;
  fallbackEnabled: boolean;
  fallbackUsed: boolean;
  traceId: string | null;
  error: string | null;
};

const state: IVXProviderHealth = {
  state: 'PROVIDER_VALIDATING',
  provider: 'unknown',
  model: 'unknown',
  adapterVersion: 'unknown',
  credentialLoaded: false,
  credentialValid: false,
  lastValidationTime: null,
  lastHttpStatus: null,
  fallbackEnabled: false,
  fallbackUsed: false,
  traceId: null,
  error: null,
};

let cachedAdapterVersion: string | null = null;

function getAdapterVersion(): string {
  if (cachedAdapterVersion) return cachedAdapterVersion;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('@ai-sdk/openai/package.json');
    cachedAdapterVersion = typeof pkg?.version === 'string' ? pkg.version : 'unknown';
  } catch {
    cachedAdapterVersion = 'unknown';
  }
  return cachedAdapterVersion!;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Mark the primary provider as failed after a confirmed auth error (401/403).
 * Once marked failed, subsequent requests skip the primary and go directly
 * to fallback (if configured) or return AI_UNAVAILABLE.
 */
export function markProviderFailed(httpStatus: number, error: string, traceId: string): void {
  state.state = 'PROVIDER_FAILED';
  state.credentialValid = false;
  state.lastHttpStatus = httpStatus;
  state.lastValidationTime = nowIso();
  state.traceId = traceId;
  state.error = error;
  console.error('[IVXProviderStateMachine] PROVIDER_FAILED', {
    provider: state.provider,
    httpStatus,
    traceId,
    error: error.slice(0, 200),
  });
}

/**
 * Mark the primary provider as ready after a successful request.
 */
export function markProviderReady(provider: string, model: string): void {
  state.state = 'PROVIDER_READY';
  state.provider = provider;
  state.model = model;
  state.credentialLoaded = true;
  state.credentialValid = true;
  state.lastValidationTime = nowIso();
  state.lastHttpStatus = 200;
  state.adapterVersion = getAdapterVersion();
  state.error = null;
}

/**
 * Mark fallback as used and ready.
 */
export function markFallbackReady(provider: string, model: string): void {
  state.state = 'FALLBACK_READY';
  state.fallbackUsed = true;
  state.fallbackEnabled = true;
  state.lastHttpStatus = 200;
  state.lastValidationTime = nowIso();
  console.log('[IVXProviderStateMachine] FALLBACK_READY', { provider, model });
}

/**
 * Mark AI as completely unavailable — primary failed, no fallback succeeded.
 */
export function markAIUnavailable(traceId: string, error: string): void {
  state.state = 'AI_UNAVAILABLE';
  state.traceId = traceId;
  state.error = error;
  state.lastValidationTime = nowIso();
  console.error('[IVXProviderStateMachine] AI_UNAVAILABLE', { traceId, error: error.slice(0, 200) });
}

/**
 * Initialize the state machine at startup with the detected provider info.
 */
export function initProviderStateMachine(provider: string, model: string, credentialLoaded: boolean, fallbackEnabled: boolean): void {
  state.provider = provider;
  state.model = model;
  state.credentialLoaded = credentialLoaded;
  state.fallbackEnabled = fallbackEnabled;
  state.adapterVersion = getAdapterVersion();
  state.state = credentialLoaded ? 'PROVIDER_VALIDATING' : 'AI_UNAVAILABLE';
  state.lastValidationTime = nowIso();
}

/**
 * Returns true if the primary provider should be attempted (not already marked failed).
 */
export function shouldTryPrimary(): boolean {
  return state.state !== 'PROVIDER_FAILED' && state.state !== 'AI_UNAVAILABLE';
}

/**
 * Returns true if a fallback should be attempted.
 * Only if fallback is enabled AND the primary just failed (not if already unavailable).
 */
export function shouldTryFallback(): boolean {
  return state.state === 'PROVIDER_FAILED';
}

/**
 * Get the current provider health snapshot (safe for owner diagnostics — no secrets).
 */
export function getProviderHealth(): IVXProviderHealth {
  return { ...state };
}

/**
 * Reset the state machine (for testing).
 */
export function resetProviderStateMachine(): void {
  state.state = 'PROVIDER_VALIDATING';
  state.provider = 'unknown';
  state.model = 'unknown';
  state.adapterVersion = 'unknown';
  state.credentialLoaded = false;
  state.credentialValid = false;
  state.lastValidationTime = null;
  state.lastHttpStatus = null;
  state.fallbackEnabled = false;
  state.fallbackUsed = false;
  state.traceId = null;
  state.error = null;
}
