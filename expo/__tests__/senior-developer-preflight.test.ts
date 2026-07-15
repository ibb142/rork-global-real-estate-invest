import { describe, expect, test } from 'bun:test';
import {
  evaluateSeniorDeveloperPreflight,
  type SeniorDeveloperPreflight,
} from '@/src/modules/ivx-developer/seniorDeveloperPreflightService';

const OWNER_ALLOWLIST = ['owner@ivx.holdings'] as const;
// A structurally valid three-segment token (not a real credential).
const VALID_JWT = 'aaaa.bbbb.cccc';
// A 64-char hex token like IVX_OWNER_TOKEN — must NOT be accepted.
const HEX_TOKEN = 'a'.repeat(64);

describe('evaluateSeniorDeveloperPreflight', () => {
  test('missing session blocks run', () => {
    const result = evaluateSeniorDeveloperPreflight({
      accessToken: null,
      userEmail: null,
      ownerAllowlist: OWNER_ALLOWLIST,
    });
    expect(result.ownerSessionPresent).toBe(false);
    expect(result.tokenPresent).toBe(false);
    expect(result.readyToRun).toBe(false);
    expect(result.blockReason).toContain('No owner session');
  });

  test('non-JWT (hex) token blocks run', () => {
    const result = evaluateSeniorDeveloperPreflight({
      accessToken: HEX_TOKEN,
      userEmail: 'owner@ivx.holdings',
      ownerAllowlist: OWNER_ALLOWLIST,
    });
    expect(result.tokenPresent).toBe(true);
    expect(result.tokenSegmentCount).toBe(1);
    expect(result.tokenLooksLikeSupabaseJwt).toBe(false);
    expect(result.readyToRun).toBe(false);
    expect(result.blockReason).toContain('not a valid owner session token');
  });

  test('valid Supabase JWT for allowlisted owner allows run', () => {
    const result = evaluateSeniorDeveloperPreflight({
      accessToken: VALID_JWT,
      userEmail: 'Owner@IVX.holdings',
      ownerAllowlist: OWNER_ALLOWLIST,
    });
    expect(result.tokenSegmentCount).toBe(3);
    expect(result.tokenLooksLikeSupabaseJwt).toBe(true);
    expect(result.userEmailPresent).toBe(true);
    expect(result.ownerEmailAllowlisted).toBe(true);
    expect(result.readyToRun).toBe(true);
    expect(result.blockReason).toBeNull();
  });

  test('valid JWT but non-allowlisted email blocks run', () => {
    const result = evaluateSeniorDeveloperPreflight({
      accessToken: VALID_JWT,
      userEmail: 'stranger@example.com',
      ownerAllowlist: OWNER_ALLOWLIST,
    });
    expect(result.tokenLooksLikeSupabaseJwt).toBe(true);
    expect(result.ownerEmailAllowlisted).toBe(false);
    expect(result.readyToRun).toBe(false);
    expect(result.blockReason).toContain('not on the owner allow-list');
  });

  test('readyToRun=true enables execution', () => {
    const result = evaluateSeniorDeveloperPreflight({
      accessToken: VALID_JWT,
      userEmail: 'owner@ivx.holdings',
      ownerAllowlist: OWNER_ALLOWLIST,
    });
    expect(result.readyToRun).toBe(true);
  });

  test('empty allowlist falls back to any signed-in email', () => {
    const result = evaluateSeniorDeveloperPreflight({
      accessToken: VALID_JWT,
      userEmail: 'anyone@example.com',
      ownerAllowlist: [],
    });
    expect(result.ownerEmailAllowlisted).toBe(true);
    expect(result.readyToRun).toBe(true);
  });

  test('no token value is printed in the result', () => {
    const result: SeniorDeveloperPreflight = evaluateSeniorDeveloperPreflight({
      accessToken: VALID_JWT,
      userEmail: 'owner@ivx.holdings',
      ownerAllowlist: OWNER_ALLOWLIST,
    });
    const serialized = JSON.stringify(result);
    expect(serialized.includes(VALID_JWT)).toBe(false);
    expect(serialized.includes('aaaa')).toBe(false);
    expect(serialized.includes('owner@ivx.holdings')).toBe(false);
  });
});
