import { describe, expect, test } from 'bun:test';
import {
  evaluateOwnerProofGate,
  OWNER_LOGIN_PATH,
} from '@/src/modules/ivx-developer/seniorDeveloperPreflightService';

const OWNER_ALLOWLIST = ['owner@ivx.holdings'] as const;
const VALID_JWT = 'aaaa.bbbb.cccc';
const HEX_TOKEN = 'a'.repeat(64);

describe('evaluateOwnerProofGate', () => {
  test('no session -> OWNER_LOGIN_REQUIRED with login path', () => {
    const gate = evaluateOwnerProofGate({
      accessToken: null,
      userEmail: null,
      ownerAllowlist: OWNER_ALLOWLIST,
    });
    expect(gate.status).toBe('OWNER_LOGIN_REQUIRED');
    expect(gate.accessGranted).toBe(false);
    expect(gate.loginPath).toBe(OWNER_LOGIN_PATH);
  });

  test('hex (non-JWT) token -> OWNER_SESSION_INVALID', () => {
    const gate = evaluateOwnerProofGate({
      accessToken: HEX_TOKEN,
      userEmail: 'owner@ivx.holdings',
      ownerAllowlist: OWNER_ALLOWLIST,
    });
    expect(gate.status).toBe('OWNER_SESSION_INVALID');
    expect(gate.accessGranted).toBe(false);
    expect(gate.loginPath).toBe(OWNER_LOGIN_PATH);
  });

  test('valid JWT but wrong email -> OWNER_EMAIL_NOT_ALLOWED', () => {
    const gate = evaluateOwnerProofGate({
      accessToken: VALID_JWT,
      userEmail: 'stranger@example.com',
      ownerAllowlist: OWNER_ALLOWLIST,
    });
    expect(gate.status).toBe('OWNER_EMAIL_NOT_ALLOWED');
    expect(gate.accessGranted).toBe(false);
    expect(gate.loginPath).toBe(OWNER_LOGIN_PATH);
  });

  test('valid allowlisted owner -> OWNER_PROOF_READY', () => {
    const gate = evaluateOwnerProofGate({
      accessToken: VALID_JWT,
      userEmail: 'Owner@IVX.holdings',
      ownerAllowlist: OWNER_ALLOWLIST,
    });
    expect(gate.status).toBe('OWNER_PROOF_READY');
    expect(gate.accessGranted).toBe(true);
    expect(gate.loginPath).toBeNull();
    expect(gate.reason).toBeNull();
  });

  test('no token or email value is ever serialized', () => {
    const gate = evaluateOwnerProofGate({
      accessToken: VALID_JWT,
      userEmail: 'owner@ivx.holdings',
      ownerAllowlist: OWNER_ALLOWLIST,
    });
    const serialized = JSON.stringify(gate);
    expect(serialized.includes(VALID_JWT)).toBe(false);
    expect(serialized.includes('owner@ivx.holdings')).toBe(false);
  });
});
