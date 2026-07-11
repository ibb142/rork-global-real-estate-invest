import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  ensureGithubTokenHydrated,
  isCredibleGithubToken,
  resetGithubTokenHydrationCacheForTests,
  resolveGithubToken,
} from './ivx-github-token-resolver';

const REAL_SHAPED_TOKEN = 'ghp_AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const STORED_TOKEN = 'github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz';

let originalEnvToken: string | undefined;

beforeEach(() => {
  originalEnvToken = process.env.GITHUB_TOKEN;
  resetGithubTokenHydrationCacheForTests();
});

afterEach(() => {
  if (originalEnvToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalEnvToken;
  resetGithubTokenHydrationCacheForTests();
});

describe('isCredibleGithubToken — placeholder and shape rejection', () => {
  test('rejects the literal PLACEHOLDER value that broke production', () => {
    expect(isCredibleGithubToken('PLACEHOLDER')).toBe(false);
    expect(isCredibleGithubToken('placeholder')).toBe(false);
  });

  test('rejects all forbidden evidence values', () => {
    for (const bad of ['UNKNOWN', 'PENDING', 'MOCK', 'SIMULATED', 'GENERATED']) {
      expect(isCredibleGithubToken(bad)).toBe(false);
    }
  });

  test('rejects empty, null, and non-token strings', () => {
    expect(isCredibleGithubToken('')).toBe(false);
    expect(isCredibleGithubToken(null)).toBe(false);
    expect(isCredibleGithubToken(undefined)).toBe(false);
    expect(isCredibleGithubToken('not-a-token')).toBe(false);
    expect(isCredibleGithubToken('ghp_short')).toBe(false);
  });

  test('accepts real GitHub token shapes', () => {
    expect(isCredibleGithubToken(REAL_SHAPED_TOKEN)).toBe(true);
    expect(isCredibleGithubToken(STORED_TOKEN)).toBe(true);
    expect(isCredibleGithubToken('0123456789abcdef0123456789abcdef01234567')).toBe(true);
  });
});

describe('resolveGithubToken — env vs owner variables store', () => {
  test('credible env token wins without touching the store', async () => {
    process.env.GITHUB_TOKEN = REAL_SHAPED_TOKEN;
    let storeRead = false;
    const resolution = await resolveGithubToken(async () => {
      storeRead = true;
      return STORED_TOKEN;
    });
    expect(resolution.token).toBe(REAL_SHAPED_TOKEN);
    expect(resolution.source).toBe('process.env');
    expect(resolution.envValueRejected).toBe(false);
    expect(storeRead).toBe(false);
  });

  test('PLACEHOLDER env value is rejected and the stored token is used', async () => {
    process.env.GITHUB_TOKEN = 'PLACEHOLDER';
    const resolution = await resolveGithubToken(async () => STORED_TOKEN);
    expect(resolution.token).toBe(STORED_TOKEN);
    expect(resolution.source).toBe('owner_variables');
    expect(resolution.envValueRejected).toBe(true);
  });

  test('empty env falls back to the stored token', async () => {
    delete process.env.GITHUB_TOKEN;
    const resolution = await resolveGithubToken(async () => STORED_TOKEN);
    expect(resolution.token).toBe(STORED_TOKEN);
    expect(resolution.source).toBe('owner_variables');
    expect(resolution.envValueRejected).toBe(false);
  });

  test('placeholder env + placeholder store → none (never sends garbage to GitHub)', async () => {
    process.env.GITHUB_TOKEN = 'PLACEHOLDER';
    const resolution = await resolveGithubToken(async () => 'MOCK');
    expect(resolution.token).toBe('');
    expect(resolution.source).toBe('none');
    expect(resolution.envValueRejected).toBe(true);
  });

  test('store read failure is handled — returns none, never throws', async () => {
    delete process.env.GITHUB_TOKEN;
    const resolution = await resolveGithubToken(async () => {
      throw new Error('store offline');
    });
    expect(resolution.token).toBe('');
    expect(resolution.source).toBe('none');
  });
});

describe('ensureGithubTokenHydrated — self-healing process.env', () => {
  test('writes the stored token into process.env when env held PLACEHOLDER', async () => {
    process.env.GITHUB_TOKEN = 'PLACEHOLDER';
    const resolution = await ensureGithubTokenHydrated(async () => STORED_TOKEN);
    expect(resolution.source).toBe('owner_variables');
    expect(process.env.GITHUB_TOKEN).toBe(STORED_TOKEN);
  });

  test('clears a placeholder from process.env when no replacement exists', async () => {
    process.env.GITHUB_TOKEN = 'PLACEHOLDER';
    const resolution = await ensureGithubTokenHydrated(async () => '');
    expect(resolution.source).toBe('none');
    expect(process.env.GITHUB_TOKEN).toBe('');
  });

  test('caches the resolution — store is read once within the TTL', async () => {
    process.env.GITHUB_TOKEN = 'PLACEHOLDER';
    let reads = 0;
    const reader = async (): Promise<string> => {
      reads += 1;
      return STORED_TOKEN;
    };
    await ensureGithubTokenHydrated(reader);
    await ensureGithubTokenHydrated(reader);
    await ensureGithubTokenHydrated(reader);
    expect(reads).toBe(1);
  });

  test('a credible env token is left untouched', async () => {
    process.env.GITHUB_TOKEN = REAL_SHAPED_TOKEN;
    await ensureGithubTokenHydrated(async () => STORED_TOKEN);
    expect(process.env.GITHUB_TOKEN).toBe(REAL_SHAPED_TOKEN);
  });
});
