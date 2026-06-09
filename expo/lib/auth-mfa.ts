import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { sanitizeEmail, sanitizePasswordForSignIn } from './auth-helpers';

export type AuthenticatorLevel = 'aal1' | 'aal2' | null;
export type MfaFactorType = 'totp' | 'phone';

export interface ParsedMfaFactor {
  id: string;
  factorType: MfaFactorType;
  friendlyName: string;
  status: string;
}

export interface ParsedMfaEnrollment {
  factorId: string;
  secret: string;
  uri: string;
  qrCode: string;
  friendlyName: string;
}

export interface ParsedMfaAssurance {
  currentLevel: AuthenticatorLevel;
  nextLevel: AuthenticatorLevel;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseAuthenticatorLevel(value: unknown): AuthenticatorLevel {
  if (value === 'aal1' || value === 'aal2') {
    return value;
  }

  return null;
}

function readString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
}

function parseFactor(value: unknown): ParsedMfaFactor | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const id = readString(record, ['id']);
  const rawFactorType = readString(record, ['factor_type', 'factorType']);
  const factorType = rawFactorType === 'phone' ? 'phone' : rawFactorType === 'totp' ? 'totp' : null;
  if (!id || !factorType) {
    return null;
  }

  return {
    id,
    factorType,
    friendlyName: readString(record, ['friendly_name', 'friendlyName']) || (factorType === 'totp' ? 'Authenticator app' : 'Phone verification'),
    status: readString(record, ['status']) || 'unknown',
  };
}

function factorArrayFromValue(value: unknown): ParsedMfaFactor[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => parseFactor(entry))
    .filter((entry): entry is ParsedMfaFactor => !!entry);
}

export function extractVerifiedMfaFactors(value: unknown): ParsedMfaFactor[] {
  const record = asRecord(value);
  if (!record) {
    return [];
  }

  const allFactors = [
    ...factorArrayFromValue(record.all),
    ...factorArrayFromValue(record.totp),
    ...factorArrayFromValue(record.phone),
  ];

  const deduped = new Map<string, ParsedMfaFactor>();
  for (const factor of allFactors) {
    if (!deduped.has(factor.id)) {
      deduped.set(factor.id, factor);
    }
  }

  return Array.from(deduped.values()).filter((factor) => factor.status.toLowerCase() === 'verified');
}

export function extractFirstVerifiedMfaFactor(value: unknown): ParsedMfaFactor | null {
  return extractVerifiedMfaFactors(value)[0] ?? null;
}

export function extractMfaAssurance(value: unknown): ParsedMfaAssurance {
  const record = asRecord(value);
  if (!record) {
    return { currentLevel: null, nextLevel: null };
  }

  return {
    currentLevel: parseAuthenticatorLevel(record.currentLevel ?? record.current_level ?? record.currentAal),
    nextLevel: parseAuthenticatorLevel(record.nextLevel ?? record.next_level ?? record.nextAal),
  };
}

export function extractMfaEnrollment(value: unknown): ParsedMfaEnrollment | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const factorId = readString(record, ['id']);
  const friendlyName = readString(record, ['friendly_name', 'friendlyName']) || 'Authenticator app';
  const totp = asRecord(record.totp);

  if (!factorId || !totp) {
    return null;
  }

  return {
    factorId,
    friendlyName,
    secret: readString(totp, ['secret']),
    uri: readString(totp, ['uri']),
    qrCode: readString(totp, ['qr_code', 'qrCode']),
  };
}

export function extractChallengeId(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  return readString(record, ['id', 'challenge_id', 'challengeId']) || null;
}

export function extractVerifiedSession(value: unknown): Session | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const session = record.session;
  return session && typeof session === 'object' ? (session as Session) : null;
}

export async function getMfaChallengeRequirement(client: SupabaseClient): Promise<{
  required: boolean;
  factor: ParsedMfaFactor | null;
  currentLevel: AuthenticatorLevel;
  nextLevel: AuthenticatorLevel;
}> {
  const assuranceResult = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceResult.error) {
    throw assuranceResult.error;
  }

  const assurance = extractMfaAssurance(assuranceResult.data);
  if (assurance.currentLevel === 'aal1' && assurance.nextLevel === 'aal2') {
    const factorsResult = await client.auth.mfa.listFactors();
    if (factorsResult.error) {
      throw factorsResult.error;
    }

    return {
      required: true,
      factor: extractFirstVerifiedMfaFactor(factorsResult.data),
      currentLevel: assurance.currentLevel,
      nextLevel: assurance.nextLevel,
    };
  }

  return {
    required: false,
    factor: null,
    currentLevel: assurance.currentLevel,
    nextLevel: assurance.nextLevel,
  };
}

export async function verifyPasswordWithEphemeralClient(email: string, password: string): Promise<{
  valid: boolean;
  message: string;
}> {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const anonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const normalizedEmail = sanitizeEmail(email);

  if (!url || !anonKey) {
    return {
      valid: false,
      message: 'Supabase is not configured, so the current password could not be verified.',
    };
  }

  const client = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: normalizedEmail,
      password: sanitizePasswordForSignIn(password),
    });

    if (error) {
      return {
        valid: false,
        message: error.message || 'Current password verification failed.',
      };
    }

    return {
      valid: !!data.session || !!data.user,
      message: 'Current password verified.',
    };
  } catch (error: unknown) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : 'Current password verification failed.',
    };
  } finally {
    try {
      await client.auth.signOut();
    } catch {
    }
  }
}
