/**
 * IVX GitHub Token Resolver — permanent fix for the PLACEHOLDER credential bug.
 *
 * Root cause (audited 2026-07-11): the Render service env var GITHUB_TOKEN was
 * set to the literal string "PLACEHOLDER" (11 chars). Every GitHub code path
 * read `process.env.GITHUB_TOKEN` first; a non-empty placeholder is truthy, so
 * it was sent to the GitHub API verbatim → 401 Bad credentials — while the real
 * encrypted token sat unused in the ivx_owner_variables store.
 *
 * This resolver:
 *   1. Rejects placeholder/forbidden values and anything that does not have a
 *      real GitHub token shape.
 *   2. Falls back to the encrypted Owner Variables store (decrypted server-side).
 *   3. Hydrates `process.env.GITHUB_TOKEN` with the good value so every
 *      downstream reader self-heals, or clears it to '' so code paths report an
 *      honest "not configured" instead of a fake 401.
 *
 * Pure resolution logic — the store reader is injectable for tests.
 */

import { getIVXOwnerVariableStoredValue } from '../api/ivx-owner-variables';
import { isForbiddenEvidenceValue } from './ivx-deployment-state-machine';

export type GithubTokenSource = 'process.env' | 'owner_variables' | 'none';

export interface GithubTokenResolution {
  /** The usable token, or '' when no credible token exists anywhere. */
  token: string;
  source: GithubTokenSource;
  /** True when process.env held a placeholder/garbage value that was rejected. */
  envValueRejected: boolean;
  detail: string;
}

const GITHUB_TOKEN_SHAPE = /^(ghp_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|gho_[A-Za-z0-9]{16,}|ghu_[A-Za-z0-9]{16,}|ghs_[A-Za-z0-9]{16,}|ghr_[A-Za-z0-9]{16,}|[0-9a-f]{40})$/;

/**
 * A value is a credible GitHub token only when it is not a forbidden
 * placeholder AND matches a real GitHub token shape.
 */
export function isCredibleGithubToken(value: string | null | undefined): boolean {
  const normalized = (value ?? '').trim();
  if (!normalized) return false;
  if (isForbiddenEvidenceValue(normalized)) return false;
  return GITHUB_TOKEN_SHAPE.test(normalized);
}

type StoredValueReader = (name: 'GITHUB_TOKEN') => Promise<string>;

/**
 * Resolve the GitHub token: env first (only if credible), then the encrypted
 * Owner Variables store. Never returns a placeholder.
 */
export async function resolveGithubToken(
  readStored: StoredValueReader = getIVXOwnerVariableStoredValue,
): Promise<GithubTokenResolution> {
  const envValue = (process.env.GITHUB_TOKEN ?? '').trim();
  const envValueRejected = envValue.length > 0 && !isCredibleGithubToken(envValue);

  if (envValue && !envValueRejected) {
    return { token: envValue, source: 'process.env', envValueRejected: false, detail: 'process.env token accepted (credible GitHub token shape).' };
  }

  let stored = '';
  try {
    stored = (await readStored('GITHUB_TOKEN')).trim();
  } catch {
    stored = '';
  }

  if (isCredibleGithubToken(stored)) {
    return {
      token: stored,
      source: 'owner_variables',
      envValueRejected,
      detail: envValueRejected
        ? `process.env.GITHUB_TOKEN rejected (placeholder/non-token value, len=${envValue.length}); using decrypted Owner Variables token.`
        : 'process.env.GITHUB_TOKEN empty; using decrypted Owner Variables token.',
    };
  }

  return {
    token: '',
    source: 'none',
    envValueRejected,
    detail: envValueRejected
      ? `process.env.GITHUB_TOKEN rejected (placeholder/non-token value, len=${envValue.length}) and no credible token in Owner Variables store.`
      : 'No GitHub token in process.env or Owner Variables store.',
  };
}

let hydratedAtMs = 0;
let lastResolution: GithubTokenResolution | null = null;
const HYDRATION_TTL_MS = 60_000;

/**
 * Resolve and write the result back into `process.env.GITHUB_TOKEN` so all
 * downstream readers (sync or async) self-heal. A rejected placeholder with no
 * replacement clears the env var so callers report "not configured" honestly.
 * Cached for 60s; a token rotation in the store is picked up within a minute.
 */
export async function ensureGithubTokenHydrated(
  readStored: StoredValueReader = getIVXOwnerVariableStoredValue,
): Promise<GithubTokenResolution> {
  const now = Date.now();
  if (lastResolution && now - hydratedAtMs < HYDRATION_TTL_MS) return lastResolution;

  const resolution = await resolveGithubToken(readStored);
  if (resolution.source === 'owner_variables') {
    process.env.GITHUB_TOKEN = resolution.token;
    console.log('[IVXGithubToken] Hydrated GITHUB_TOKEN from Owner Variables store:', {
      envValueRejected: resolution.envValueRejected,
      tokenLength: resolution.token.length,
    });
  } else if (resolution.source === 'none' && resolution.envValueRejected) {
    process.env.GITHUB_TOKEN = '';
    console.log('[IVXGithubToken] Cleared placeholder GITHUB_TOKEN from process.env (no credible replacement found).');
  }

  hydratedAtMs = now;
  lastResolution = resolution;
  return resolution;
}

/** Test-only: reset the hydration cache. */
export function resetGithubTokenHydrationCacheForTests(): void {
  hydratedAtMs = 0;
  lastResolution = null;
}
