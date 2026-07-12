/**
 * IVX Runtime Variables service (owner-only).
 *
 * Thin client over the owner-gated runtime-variables API so the in-app Runtime
 * Variables screen can show every required credential's status, run REAL
 * verification probes, and sync a runtime-present variable into the Render
 * service env (the real injection path).
 *
 * Never receives or stores a secret value — the backend returns presence/masked
 * + verification pass/fail only.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

export type VarScope = 'client' | 'server' | 'build' | 'runtime' | 'sandbox';

export type VarStatus =
  | 'MISSING_FROM_RORK'
  | 'PRESENT_IN_RORK_NOT_INJECTED'
  | 'PRESENT_IN_RUNTIME'
  | 'PRESENT_BUT_INVALID'
  | 'PRESENT_BUT_UNAUTHORIZED'
  | 'VERIFIED';

export type RuntimeVariableStatus = {
  name: string;
  aliases: string[];
  isPublic: boolean;
  scopes: VarScope[];
  usedBy: string[];
  verifyKind: string;
  knownInRork: boolean;
  description: string;
  resolvedFrom: string | null;
  present: boolean;
  masked: string | null;
  valueLength: number;
  status: VarStatus;
  publicWarning: boolean;
  lastVerifiedAt: string | null;
  verifyDetail: string | null;
};

export type RuntimeVariablesReport = {
  marker: string;
  generatedAt: string;
  runtimeLabel: string;
  total: number;
  present: number;
  missing: number;
  variables: RuntimeVariableStatus[];
};

export type VariableVerification = {
  name: string;
  verifyKind: string;
  status: VarStatus;
  ok: boolean;
  httpStatus: number | null;
  detail: string;
  verifiedAt: string;
};

export type SyncResult = {
  ok: boolean;
  httpStatus: number | null;
  detail: string;
};

function backendBaseUrl(): string {
  return getDirectApiBaseUrl().replace(/\/+$/, '');
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 300) };
  }
}

function readError(payload: unknown, fallback: string): string {
  const record = readRecord(payload);
  return typeof record.error === 'string' && record.error.trim() ? record.error.trim() : fallback;
}

async function ownerToken(): Promise<string> {
  const accessToken = await getIVXAccessToken();
  if (!accessToken) {
    throw new Error('Owner session token unavailable. Sign in again.');
  }
  return accessToken;
}

/** Fetch the presence/status report (no network probes). */
export async function getRuntimeVariablesReport(): Promise<RuntimeVariablesReport> {
  const accessToken = await ownerToken();
  const response = await fetch(`${backendBaseUrl()}/api/ivx/runtime-variables`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(readError(payload, `Runtime-variables request failed with HTTP ${response.status}.`));
  }
  return readRecord(payload).report as RuntimeVariablesReport;
}

/** Run REAL verification probes for all variables. */
export async function verifyAllRuntimeVariables(): Promise<RuntimeVariablesReport> {
  const accessToken = await ownerToken();
  const response = await fetch(`${backendBaseUrl()}/api/ivx/runtime-variables/verify`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({}),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(readError(payload, `Verification failed with HTTP ${response.status}.`));
  }
  return readRecord(payload).report as RuntimeVariablesReport;
}

/** Run a REAL verification probe for a single variable. */
export async function verifyRuntimeVariable(name: string): Promise<VariableVerification> {
  const accessToken = await ownerToken();
  const response = await fetch(`${backendBaseUrl()}/api/ivx/runtime-variables/verify`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ name }),
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(readError(payload, `Verification failed with HTTP ${response.status}.`));
  }
  return readRecord(payload).result as VariableVerification;
}

/**
 * Sync a runtime-present variable into the Render service env (the real
 * injection path). Requires a registered-owner bearer; never sends a value.
 */
export async function syncRuntimeVariable(name: string): Promise<SyncResult> {
  const accessToken = await ownerToken();
  const response = await fetch(`${backendBaseUrl()}/api/ivx/runtime-variables/sync`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ name }),
  });
  const payload = await parseResponse(response);
  const record = readRecord(payload);
  const result = readRecord(record.result);
  return {
    ok: response.ok && record.ok === true,
    httpStatus: typeof result.httpStatus === 'number' ? result.httpStatus : response.status,
    detail: typeof result.detail === 'string' && result.detail.trim()
      ? result.detail.trim()
      : readError(payload, `Sync failed with HTTP ${response.status}.`),
  };
}
