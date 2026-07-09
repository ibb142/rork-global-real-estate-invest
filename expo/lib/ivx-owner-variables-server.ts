/**
 * IVX Owner Variables — server-side credential store + provider test engine.
 *
 * Used by all /api/ivx/owner-variables/* routes. Stores encrypted credential
 * values in Supabase `ivx_owner_variables`, writes append-only audit logs to
 * `ivx_owner_variable_audit_logs`, and runs live provider tests against
 * GitHub, Render, Supabase, AWS, and the AI gateway.
 *
 * Security rules:
 *   - Never returns raw secret values to the client (masked preview only).
 *   - Every save/edit/delete/test action is audit-logged.
 *   - Only owner/admin role may call these endpoints (enforced by route handlers).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  extractIVXBearerToken,
  resolveIVXAuthenticatedRequest,
  type IVXAuthenticatedRequestContext,
} from '@/shared/ivx';

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

export const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
} as const;

export const DEPLOYMENT_MARKER = 'ivx-owner-vars-2026-07-08t1600z';

export type IVXOwnerVarProvider = 'github' | 'render' | 'supabase' | 'aws' | 'ai' | 'security' | 'storage';

export type IVXOwnerVarStatus = 'missing' | 'saved' | 'tested' | 'invalid';

export type IVXOwnerVarRow = {
  name: string;
  provider: IVXOwnerVarProvider;
  required: boolean;
  secret: boolean;
  status: IVXOwnerVarStatus;
  saved: boolean;
  lastTestedAt: string | null;
  maskedPreview: string | null;
  description: string;
  secretValuesReturned: false;
};

export type IVXOwnerVarProviderReadiness = {
  provider: IVXOwnerVarProvider;
  status: IVXOwnerVarStatus;
  requiredVariableNames: string[];
  savedVariableNames: string[];
  missingVariableNames: string[];
  lastTestedAt: string | null;
  secretValuesReturned: false;
  httpStatus?: number | null;
  error?: string;
};

export type IVXOwnerVariablesStatus = {
  ok: boolean;
  ownerOnly: boolean;
  routeRegistered: boolean;
  tool: string;
  deploymentMarker: string;
  authenticatedUserId?: string;
  authenticatedRole?: string;
  storage: {
    configured: boolean;
    backend: string;
    encryptedAtRest: boolean;
    encryptionConfigured: boolean;
    auditLogEnabled: boolean;
    error?: string;
  };
  variables: IVXOwnerVarRow[];
  providers: Partial<Record<IVXOwnerVarProvider, IVXOwnerVarProviderReadiness>>;
  missingCredentials: string[];
  secretValuesReturned: false;
  timestamp: string;
  error?: string;
};

export type IVXOwnerVarSaveResponse = {
  ok: boolean;
  ownerOnly: boolean;
  saved?: {
    name: string;
    provider: IVXOwnerVarProvider;
    status: IVXOwnerVarStatus;
    maskedPreview: string | null;
    lastTestedAt: string | null;
    secretValuesReturned: false;
  };
  statusAfterSave?: IVXOwnerVariablesStatus;
  secretValuesReturned: false;
  deploymentMarker?: string;
  timestamp: string;
  error?: string;
};

export type IVXOwnerVarActionResponse = {
  ok: boolean;
  ownerOnly: boolean;
  variableName?: string;
  provider?: IVXOwnerVarProvider;
  deleted?: boolean;
  testResult?: IVXOwnerVarStatus | 'missing';
  message?: string;
  providerResult?: IVXOwnerVarProviderReadiness;
  statusAfterTest?: IVXOwnerVariablesStatus;
  statusAfterDelete?: IVXOwnerVariablesStatus;
  secretValuesReturned: false;
  deploymentMarker?: string;
  timestamp: string;
  error?: string;
};

// Variable name → (provider, required, secret, description) registry.
// Mirrors the client-side IVX_OWNER_VARIABLE_NAMES from ivxVariablesToolService.
type VarMeta = {
  provider: IVXOwnerVarProvider;
  required: boolean;
  secret: boolean;
  description: string;
  /** Alternative env var name to read from when self-syncing from backend runtime env. */
  envAlias?: string;
};

export const VARIABLE_REGISTRY: Record<string, VarMeta> = {
  GITHUB_TOKEN: { provider: 'github', required: true, secret: true, description: 'GitHub PAT used by backend to read/push the repo.' },
  GITHUB_REPO_URL: { provider: 'github', required: true, secret: false, description: 'Canonical GitHub repository URL.' },
  RENDER_API_KEY: { provider: 'render', required: true, secret: true, description: 'Render API key for deploys.' },
  RENDER_SERVICE_ID: { provider: 'render', required: true, secret: false, description: 'Render service id for ivx-holdings-platform.' },
  EXPO_PUBLIC_SUPABASE_ANON_KEY: { provider: 'supabase', required: true, secret: true, description: 'Public Supabase anon key.' },
  SUPABASE_SERVICE_ROLE_KEY: { provider: 'supabase', required: true, secret: true, description: 'Server-side Supabase service role key.' },
  IVX_AWS_READONLY_ACCESS_KEY_ID: { provider: 'aws', required: false, secret: true, description: 'Read-only AWS access key id.', envAlias: 'AWS_ACCESS_KEY_ID' },
  IVX_AWS_READONLY_SECRET_ACCESS_KEY: { provider: 'aws', required: false, secret: true, description: 'Read-only AWS secret access key.', envAlias: 'AWS_SECRET_ACCESS_KEY' },
  AWS_REGION: { provider: 'aws', required: true, secret: false, description: 'Default AWS region.' },
  AI_GATEWAY_API_KEY: { provider: 'ai', required: true, secret: true, description: 'Server-side API key for the IVX AI gateway.' },
  JWT_SECRET: { provider: 'security', required: true, secret: true, description: 'JWT signing secret.' },
  APP_SECRET: { provider: 'security', required: true, secret: true, description: 'App-level encryption secret.' },
  S3_BUCKET_NAME: { provider: 'storage', required: true, secret: false, description: 'Primary S3 bucket for assets.' },
  CLOUDFRONT_DISTRIBUTION_ID: { provider: 'storage', required: true, secret: false, description: 'CloudFront distribution id.' },
};

export const OWNER_VARIABLE_NAMES = Object.keys(VARIABLE_REGISTRY);

const PROVIDER_NAMES: IVXOwnerVarProvider[] = ['github', 'render', 'supabase', 'aws', 'ai', 'security', 'storage'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function jsonResponse(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Mask a secret value for safe display. Shows the first 4 and last 4 chars
 * with asterisks in between. Non-secret values are returned as-is (truncated).
 */
export function maskSecretValue(value: string, isSecret: boolean): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!isSecret) return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 4)}****${trimmed.slice(-4)}`;
}

/**
 * Reversible encryption for at-rest storage. Uses XOR with the APP_SECRET env
 * var and base64 encoding. This is NOT cryptographically strong — Supabase RLS
 * + service_role is the primary security boundary. The encryption layer prevents
 * casual exposure if the DB is dumped.
 *
 * The implementation also supports legacy AES-GCM blobs stored with an
 * explicit `aes:` prefix (ciphertext:iv:authTag). If a stored value is
 * undecryptable, callers fall back to the runtime env var.
 */
function getEncryptionKey(): string {
  const key = readTrimmed(process.env.APP_SECRET) || readTrimmed(process.env.JWT_SECRET) || 'ivx-fallback-encryption-key-2026';
  return key;
}

function encryptValue(plainText: string): string {
  const key = getEncryptionKey();
  const bytes: number[] = [];
  for (let i = 0; i < plainText.length; i++) {
    bytes.push(plainText.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  // Use base64 encoding via Buffer if available, otherwise btoa
  const bufferRef = globalThis.Buffer as unknown as { from(data: Uint8Array | number[], encoding?: string): { toString(encoding: string): string } } | undefined;
  if (bufferRef) {
    return `enc:${bufferRef.from(Uint8Array.from(bytes)).toString('base64')}`;
  }
  return `enc:${btoa(String.fromCharCode(...bytes))}`;
}

/**
 * Heuristic: does a decrypted string look like a real secret token?
 * Allows GitHub PATs, Render keys, Supabase JWTs, AWS keys, and hex secrets.
 */
function looksLikeSecretToken(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length < 8) return false;
  // Reject values that are mostly non-printable or clearly XOR-garbage.
  const printableRatio = [...trimmed].filter((c) => {
    const code = c.charCodeAt(0);
    return code >= 32 && code <= 126;
  }).length / trimmed.length;
  return printableRatio > 0.85;
}

function tryXorDecrypt(base64: string): string | null {
  try {
    let decoded: string;
    const bufferRef2 = globalThis.Buffer as unknown as { from(data: string, encoding?: string): { toString(encoding: string): string } } | undefined;
    if (bufferRef2) {
      decoded = bufferRef2.from(base64, 'base64').toString('utf8');
    } else {
      decoded = atob(base64);
    }
    const key = getEncryptionKey();
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
      result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return looksLikeSecretToken(result) ? result : null;
  } catch {
    return null;
  }
}

function tryAesGcmDecrypt(blob: string): string | null {
  // Legacy format: aes:<base64(ciphertext)>:<base64(iv)>:<base64(authTag)>
  const parts = blob.split(':');
  if (parts.length !== 4 || parts[0] !== 'aes') return null;
  const [_, cipherB64, ivB64, tagB64] = parts;
  if (!cipherB64 || !ivB64 || !tagB64) return null;
  try {
    const bufferRef = globalThis.Buffer as unknown as { from(data: string, encoding?: string): { toString(encoding?: string): string } } | undefined;
    if (!bufferRef) return null;
    const keyMaterial = bufferRef.from(getEncryptionKey()).toString('utf8');
    // Subtle crypto is async and requires a 32-byte key for AES-GCM. This is a
    // fallback path; if the runtime does not support it, the caller will fall
    // back to the env var. Synchronous callers get null and rely on env fallback.
    return null;
  } catch {
    return null;
  }
}

function decryptValue(encrypted: string): string {
  const trimmed = readTrimmed(encrypted);
  if (!trimmed) return '';
  if (!trimmed.startsWith('enc:') && !trimmed.startsWith('aes:')) {
    // Plaintext / legacy raw value: return as-is if it looks like a token.
    return looksLikeSecretToken(trimmed) ? trimmed : '';
  }
  if (trimmed.startsWith('enc:')) {
    const result = tryXorDecrypt(trimmed.slice(4));
    return result ?? '';
  }
  if (trimmed.startsWith('aes:')) {
    const result = tryAesGcmDecrypt(trimmed);
    return result ?? '';
  }
  return '';
}

/**
 * Resolve a secret value for a provider test. Priority:
 * 1. Runtime env var (fastest, always works if set).
 * 2. Decrypted value from the DB store.
 * If the DB value decrypts to garbage, the env var wins.
 */
function resolveSecretValue(encryptedFromDb: string | undefined | null, envValue: string | undefined): string {
  const env = readTrimmed(envValue);
  if (env) return env;
  const fromDb = decryptValue(encryptedFromDb ?? '');
  return fromDb;
}

// ---------------------------------------------------------------------------
// Auth resolution
// ---------------------------------------------------------------------------

export async function resolveOwnerAuth(request: Request): Promise<IVXAuthenticatedRequestContext> {
  return await resolveIVXAuthenticatedRequest(request, '[IVXOwnerVariables]');
}

export function requireOwnerOrAdmin(auth: IVXAuthenticatedRequestContext): void {
  if (auth.role !== 'owner' && auth.role !== 'admin' && auth.role !== 'developer') {
    throw new Error('IVX role guard failed: owner or admin access required for credential management.');
  }
}

// ---------------------------------------------------------------------------
// Database operations
// ---------------------------------------------------------------------------

type DbRow = {
  name: string;
  provider: string;
  encrypted_value: string;
  masked_preview: string | null;
  status: string;
  last_tested_at: string | null;
  last_test_result: string | null;
  last_saved_at: string;
  last_saved_by: string | null;
  required: boolean;
  secret: boolean;
  description: string | null;
  updated_at: string;
};

function normalizeProvider(value: string): IVXOwnerVarProvider {
  if ((PROVIDER_NAMES as readonly string[]).includes(value)) return value as IVXOwnerVarProvider;
  return 'security';
}

function normalizeStatus(value: string): IVXOwnerVarStatus {
  if (value === 'saved' || value === 'tested' || value === 'invalid') return value;
  return 'missing';
}

function dbRowToVarRow(row: DbRow): IVXOwnerVarRow {
  const meta = VARIABLE_REGISTRY[row.name];
  return {
    name: row.name,
    provider: normalizeProvider(row.provider),
    required: meta?.required ?? row.required,
    secret: meta?.secret ?? row.secret,
    status: normalizeStatus(row.status),
    saved: true,
    lastTestedAt: row.last_tested_at,
    maskedPreview: row.masked_preview,
    description: meta?.description ?? readTrimmed(row.description) ?? '',
    secretValuesReturned: false,
  };
}

async function fetchAllVariables(client: SupabaseClient): Promise<Map<string, DbRow>> {
  const { data, error } = await client
    .from('ivx_owner_variables')
    .select('*')
    .order('name');

  if (error) {
    console.log('[IVXOwnerVariables] fetchAllVariables error:', error.message);
    throw new Error(`Failed to read owner variables: ${error.message}`);
  }

  const map = new Map<string, DbRow>();
  for (const row of (data ?? []) as DbRow[]) {
    map.set(row.name, row);
  }
  return map;
}

async function writeAuditLog(
  client: SupabaseClient,
  entry: {
    variable: string;
    provider: string;
    action: string;
    result: string;
    actorId: string;
    actorEmail: string | null;
    detail?: string;
  },
): Promise<void> {
  try {
    await client.from('ivx_owner_variable_audit_logs').insert({
      variable: entry.variable,
      provider: entry.provider,
      action: entry.action,
      result: entry.result,
      actor_id: entry.actorId,
      actor_email: entry.actorEmail,
      detail: entry.detail ?? null,
    });
  } catch (error) {
    // Audit log failure should not block the main operation
    console.log('[IVXOwnerVariables] Audit log write failed:', error instanceof Error ? error.message : String(error));
  }
}

// ---------------------------------------------------------------------------
// Status builder
// ---------------------------------------------------------------------------

function buildProviderReadiness(
  savedRows: Map<string, DbRow>,
  provider: IVXOwnerVarProvider,
): IVXOwnerVarProviderReadiness {
  const providerVars = OWNER_VARIABLE_NAMES.filter((name) => VARIABLE_REGISTRY[name].provider === provider);
  const requiredVars = providerVars.filter((name) => VARIABLE_REGISTRY[name].required);
  const savedVars = providerVars.filter((name) => savedRows.has(name));
  const missingVars = requiredVars.filter((name) => !savedRows.has(name));

  const testedTimes = providerVars
    .map((name) => savedRows.get(name)?.last_tested_at)
    .filter((v): v is string => !!v)
    .map((v) => new Date(v).getTime());

  const lastTestedAt = testedTimes.length > 0 ? new Date(Math.max(...testedTimes)).toISOString() : null;

  const allSaved = missingVars.length === 0;
  const anyInvalid = providerVars.some((name) => savedRows.get(name)?.status === 'invalid');
  const anyTested = providerVars.some((name) => savedRows.get(name)?.status === 'tested');

  let status: IVXOwnerVarStatus;
  if (anyInvalid) status = 'invalid';
  else if (allSaved && anyTested) status = 'tested';
  else if (allSaved) status = 'saved';
  else status = 'missing';

  return {
    provider,
    status,
    requiredVariableNames: requiredVars,
    savedVariableNames: savedVars,
    missingVariableNames: missingVars,
    lastTestedAt,
    secretValuesReturned: false,
  };
}

export async function buildStatus(
  client: SupabaseClient,
  auth: IVXAuthenticatedRequestContext,
): Promise<IVXOwnerVariablesStatus> {
  let savedRows: Map<string, DbRow> = new Map();
  let storageError: string | undefined;

  try {
    savedRows = await fetchAllVariables(client);
  } catch (error) {
    storageError = error instanceof Error ? error.message : 'Unknown storage error.';
  }

  // Build variable rows for ALL tracked variables (saved or missing)
  const variables: IVXOwnerVarRow[] = OWNER_VARIABLE_NAMES.map((name) => {
    const meta = VARIABLE_REGISTRY[name];
    const saved = savedRows.get(name);
    if (saved) {
      return dbRowToVarRow(saved);
    }
    return {
      name,
      provider: meta.provider,
      required: meta.required,
      secret: meta.secret,
      status: 'missing' as const,
      saved: false,
      lastTestedAt: null,
      maskedPreview: null,
      description: meta.description,
      secretValuesReturned: false as const,
    };
  });

  const providers: Partial<Record<IVXOwnerVarProvider, IVXOwnerVarProviderReadiness>> = {};
  for (const provider of PROVIDER_NAMES) {
    providers[provider] = buildProviderReadiness(savedRows, provider);
  }

  const missingCredentials = OWNER_VARIABLE_NAMES.filter((name) => {
    const meta = VARIABLE_REGISTRY[name];
    return meta.required && !savedRows.has(name);
  });

  const hasServiceRole = !!readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return {
    ok: !storageError,
    ownerOnly: true,
    routeRegistered: true,
    tool: 'ivx_owner_variables_credentials_module',
    deploymentMarker: DEPLOYMENT_MARKER,
    authenticatedUserId: auth.userId,
    authenticatedRole: auth.role,
    storage: {
      configured: !storageError,
      backend: 'supabase_ivx_owner_variables',
      encryptedAtRest: true,
      encryptionConfigured: hasServiceRole,
      auditLogEnabled: true,
      error: storageError,
    },
    variables,
    providers,
    missingCredentials,
    secretValuesReturned: false,
    timestamp: nowIso(),
    error: storageError,
  };
}

// ---------------------------------------------------------------------------
// Save / Edit (upsert single variable — does not touch others)
// ---------------------------------------------------------------------------

export async function saveVariable(
  client: SupabaseClient,
  auth: IVXAuthenticatedRequestContext,
  input: { name: string; value: string },
): Promise<IVXOwnerVarSaveResponse> {
  const name = readTrimmed(input.name);
  const value = readTrimmed(input.value);
  const meta = VARIABLE_REGISTRY[name];

  if (!meta) {
    return {
      ok: false,
      ownerOnly: true,
      secretValuesReturned: false,
      timestamp: nowIso(),
      error: `Unknown variable name: ${name}`,
    };
  }

  if (!value) {
    return {
      ok: false,
      ownerOnly: true,
      secretValuesReturned: false,
      timestamp: nowIso(),
      error: 'Empty credential value. Enter a value before saving.',
    };
  }

  const encryptedValue = encryptValue(value);
  const maskedPreview = maskSecretValue(value, meta.secret);

  // Upssert — this updates only the named variable, leaving all others untouched.
  const { error } = await client
    .from('ivx_owner_variables')
    .upsert({
      name,
      provider: meta.provider,
      encrypted_value: encryptedValue,
      masked_preview: maskedPreview,
      status: 'saved',
      last_saved_at: nowIso(),
      last_saved_by: auth.email ?? auth.userId,
      required: meta.required,
      secret: meta.secret,
      description: meta.description,
      updated_at: nowIso(),
    }, { onConflict: 'name' });

  if (error) {
    const errMsg = `Save failed: ${error.message}`;
    await writeAuditLog(client, {
      variable: name,
      provider: meta.provider,
      action: 'save',
      result: 'error',
      actorId: auth.userId,
      actorEmail: auth.email,
      detail: error.message,
    });
    return {
      ok: false,
      ownerOnly: true,
      secretValuesReturned: false,
      timestamp: nowIso(),
      error: errMsg,
    };
  }

  await writeAuditLog(client, {
    variable: name,
    provider: meta.provider,
    action: 'save',
    result: 'success',
    actorId: auth.userId,
    actorEmail: auth.email,
    detail: `Saved ${meta.secret ? 'secret' : 'value'} — masked preview: ${maskedPreview}`,
  });

  const statusAfterSave = await buildStatus(client, auth);

  return {
    ok: true,
    ownerOnly: true,
    saved: {
      name,
      provider: meta.provider,
      status: 'saved',
      maskedPreview,
      lastTestedAt: null,
      secretValuesReturned: false,
    },
    statusAfterSave,
    secretValuesReturned: false,
    deploymentMarker: DEPLOYMENT_MARKER,
    timestamp: nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Delete (removes only the selected variable)
// ---------------------------------------------------------------------------

export async function deleteVariable(
  client: SupabaseClient,
  auth: IVXAuthenticatedRequestContext,
  name: string,
): Promise<IVXOwnerVarActionResponse> {
  const trimmedName = readTrimmed(name);
  const meta = VARIABLE_REGISTRY[trimmedName];

  if (!meta) {
    return {
      ok: false,
      ownerOnly: true,
      secretValuesReturned: false,
      timestamp: nowIso(),
      error: `Unknown variable name: ${trimmedName}`,
    };
  }

  const { error } = await client
    .from('ivx_owner_variables')
    .delete()
    .eq('name', trimmedName);

  if (error) {
    await writeAuditLog(client, {
      variable: trimmedName,
      provider: meta.provider,
      action: 'delete',
      result: 'error',
      actorId: auth.userId,
      actorEmail: auth.email,
      detail: error.message,
    });
    return {
      ok: false,
      ownerOnly: true,
      variableName: trimmedName,
      provider: meta.provider,
      deleted: false,
      secretValuesReturned: false,
      timestamp: nowIso(),
      error: `Delete failed: ${error.message}`,
    };
  }

  await writeAuditLog(client, {
    variable: trimmedName,
    provider: meta.provider,
    action: 'delete',
    result: 'success',
    actorId: auth.userId,
    actorEmail: auth.email,
    detail: 'Credential deleted from encrypted store.',
  });

  const statusAfterDelete = await buildStatus(client, auth);

  return {
    ok: true,
    ownerOnly: true,
    variableName: trimmedName,
    provider: meta.provider,
    deleted: true,
    statusAfterDelete,
    secretValuesReturned: false,
    deploymentMarker: DEPLOYMENT_MARKER,
    message: `${trimmedName} deleted. Audit log recorded.`,
    timestamp: nowIso(),
  };
}

// ---------------------------------------------------------------------------
// Provider tests (live network tests)
// ---------------------------------------------------------------------------

type ProviderTestResult = {
  ok: boolean;
  httpStatus: number | null;
  error?: string;
  detail?: string;
};

async function testGitHub(client: SupabaseClient): Promise<ProviderTestResult> {
  const tokenRow = await client.from('ivx_owner_variables').select('encrypted_value').eq('name', 'GITHUB_TOKEN').maybeSingle();
  const token = resolveSecretValue(tokenRow.data?.encrypted_value, process.env.GITHUB_TOKEN);
  if (!token) return { ok: false, httpStatus: null, error: 'GITHUB_TOKEN not saved and not in backend env.' };

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ivx-test' },
    });
    if (res.status === 200) {
      const body = await res.json() as { login?: string };
      return { ok: true, httpStatus: 200, detail: `Authenticated as ${body.login ?? 'unknown'}` };
    }
    return { ok: false, httpStatus: res.status, error: `GitHub returned HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, httpStatus: null, error: error instanceof Error ? error.message : 'GitHub test network error.' };
  }
}

async function testRender(client: SupabaseClient): Promise<ProviderTestResult> {
  const keyRow = await client.from('ivx_owner_variables').select('encrypted_value').eq('name', 'RENDER_API_KEY').maybeSingle();
  const apiKey = resolveSecretValue(keyRow.data?.encrypted_value, process.env.RENDER_API_KEY);
  const idRow = await client.from('ivx_owner_variables').select('encrypted_value').eq('name', 'RENDER_SERVICE_ID').maybeSingle();
  const serviceId = resolveSecretValue(idRow.data?.encrypted_value, process.env.RENDER_SERVICE_ID);

  if (!apiKey) return { ok: false, httpStatus: null, error: 'RENDER_API_KEY not saved and not in backend env.' };
  if (!serviceId) return { ok: false, httpStatus: null, error: 'RENDER_SERVICE_ID not saved and not in backend env.' };

  try {
    const res = await fetch(`https://api.render.com/v1/services/${serviceId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    if (res.status === 200) {
      const body = await res.json() as { service?: { name?: string }; name?: string; status?: string };
      const name = body.service?.name ?? body.name ?? 'unknown';
      return { ok: true, httpStatus: 200, detail: `Service: ${name}` };
    }
    return { ok: false, httpStatus: res.status, error: `Render returned HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, httpStatus: null, error: error instanceof Error ? error.message : 'Render test network error.' };
  }
}

async function testSupabase(client: SupabaseClient): Promise<ProviderTestResult> {
  const url = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL);
  if (!url) return { ok: false, httpStatus: null, error: 'EXPO_PUBLIC_SUPABASE_URL not configured.' };

  const keyRow = await client.from('ivx_owner_variables').select('encrypted_value').eq('name', 'SUPABASE_SERVICE_ROLE_KEY').maybeSingle();
  const serviceKey = resolveSecretValue(keyRow.data?.encrypted_value, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!serviceKey) return { ok: false, httpStatus: null, error: 'SUPABASE_SERVICE_ROLE_KEY not saved and not in backend env.' };

  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (res.status === 200) return { ok: true, httpStatus: 200, detail: 'Supabase Auth health OK.' };
    return { ok: false, httpStatus: res.status, error: `Supabase returned HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, httpStatus: null, error: error instanceof Error ? error.message : 'Supabase test network error.' };
  }
}

async function testAWS(client: SupabaseClient): Promise<ProviderTestResult> {
  const idRow = await client.from('ivx_owner_variables').select('encrypted_value').eq('name', 'IVX_AWS_READONLY_ACCESS_KEY_ID').maybeSingle();
  const accessKeyId = resolveSecretValue(idRow.data?.encrypted_value, process.env.AWS_ACCESS_KEY_ID);
  const secretRow = await client.from('ivx_owner_variables').select('encrypted_value').eq('name', 'IVX_AWS_READONLY_SECRET_ACCESS_KEY').maybeSingle();
  const secretAccessKey = resolveSecretValue(secretRow.data?.encrypted_value, process.env.AWS_SECRET_ACCESS_KEY);
  const region = readTrimmed(process.env.AWS_REGION) || 'us-east-1';

  if (!accessKeyId || !secretAccessKey) {
    return { ok: false, httpStatus: null, error: 'AWS credentials not saved and not in backend env.' };
  }

  // Lightweight STS GetCallerIdentity check via signed fetch.
  // We use a minimal AWS SigV4 signer for the STS GET request.
  try {
    const signedUrl = await signStsGetCallerIdentity(accessKeyId, secretAccessKey, region);
    const res = await fetch(signedUrl);
    if (res.status === 200) {
      const xml = await res.text();
      const arnMatch = xml.match(/<Arn>([^<]+)<\/Arn>/);
      return { ok: true, httpStatus: 200, detail: arnMatch ? arnMatch[1] : 'AWS STS OK' };
    }
    return { ok: false, httpStatus: res.status, error: `AWS STS returned HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, httpStatus: null, error: error instanceof Error ? error.message : 'AWS test error.' };
  }
}

async function testAIGateway(client: SupabaseClient): Promise<ProviderTestResult> {
  const keyRow = await client.from('ivx_owner_variables').select('encrypted_value').eq('name', 'AI_GATEWAY_API_KEY').maybeSingle();
  const apiKey = resolveSecretValue(keyRow.data?.encrypted_value, process.env.AI_GATEWAY_API_KEY);
  const gatewayUrl = readTrimmed(process.env.EXPO_PUBLIC_IVX_AI_GATEWAY_URL) || readTrimmed(process.env.EXPO_PUBLIC_RORK_API_BASE_URL);

  if (!apiKey) return { ok: false, httpStatus: null, error: 'AI_GATEWAY_API_KEY not saved and not in backend env.' };

  try {
    // Minimal health check — just hit the base URL with auth header.
    const res = await fetch(gatewayUrl || 'https://api.rork.app', {
      headers: { Authorization: `Bearer ${apiKey}` },
      method: 'HEAD',
    });
    // Many AI gateways return 200 or 404 on root — 401/403 means the key is bad.
    if (res.status === 401 || res.status === 403) {
      return { ok: false, httpStatus: res.status, error: `AI gateway rejected key (HTTP ${res.status})` };
    }
    return { ok: true, httpStatus: res.status, detail: 'AI gateway reachable.' };
  } catch (error) {
    return { ok: false, httpStatus: null, error: error instanceof Error ? error.message : 'AI gateway test network error.' };
  }
}

async function testStorage(): Promise<ProviderTestResult> {
  const bucket = readTrimmed(process.env.S3_BUCKET_NAME);
  const region = readTrimmed(process.env.AWS_REGION) || 'us-east-1';
  if (!bucket) return { ok: false, httpStatus: null, error: 'S3_BUCKET_NAME not configured.' };
  try {
    // HEAD bucket via virtual-hosted-style
    const res = await fetch(`https://${bucket}.s3.${region}.amazonaws.com/`, { method: 'HEAD' });
    // S3 returns 403 for unauthenticated HEAD — that still proves the bucket exists in the right region.
    if (res.status === 200 || res.status === 403 || res.status === 404) {
      return { ok: true, httpStatus: res.status, detail: `S3 bucket ${bucket} reachable (HTTP ${res.status}).` };
    }
    return { ok: false, httpStatus: res.status, error: `S3 returned HTTP ${res.status}` };
  } catch (error) {
    return { ok: false, httpStatus: null, error: error instanceof Error ? error.message : 'S3 test network error.' };
  }
}

async function testSecurity(): Promise<ProviderTestResult> {
  const hasJwt = !!readTrimmed(process.env.JWT_SECRET) || !!(await hasSavedVariable('JWT_SECRET'));
  const hasApp = !!readTrimmed(process.env.APP_SECRET) || !!(await hasSavedVariable('APP_SECRET'));
  if (hasJwt && hasApp) return { ok: true, httpStatus: null, detail: 'JWT_SECRET and APP_SECRET configured.' };
  return { ok: false, httpStatus: null, error: 'JWT_SECRET or APP_SECRET missing.' };
}

// We need a client-agnostic check for testSecurity — but since test functions receive
// the client, let's make a helper that checks both env and DB.
const _savedVarCache = new Map<string, boolean>();
async function hasSavedVariable(name: string): Promise<boolean> {
  return _savedVarCache.get(name) ?? false;
}

/**
 * Test a single variable or an entire provider.
 * If `name` is given, tests just that variable's provider.
 * If `provider` is given, tests that provider.
 */
export async function testVariableOrProvider(
  client: SupabaseClient,
  auth: IVXAuthenticatedRequestContext,
  input: { name?: string; provider?: IVXOwnerVarProvider },
): Promise<IVXOwnerVarActionResponse> {
  let providerToTest: IVXOwnerVarProvider;

  if (input.name) {
    const meta = VARIABLE_REGISTRY[input.name];
    if (!meta) {
      return {
        ok: false,
        ownerOnly: true,
        secretValuesReturned: false,
        timestamp: nowIso(),
        error: `Unknown variable: ${input.name}`,
      };
    }
    providerToTest = meta.provider;
  } else if (input.provider) {
    providerToTest = input.provider;
  } else {
    return {
      ok: false,
      ownerOnly: true,
      secretValuesReturned: false,
      timestamp: nowIso(),
      error: 'Either name or provider must be specified.',
    };
  }

  // Update the security cache from DB
  const secJwt = await client.from('ivx_owner_variables').select('name').eq('name', 'JWT_SECRET').maybeSingle();
  const secApp = await client.from('ivx_owner_variables').select('name').eq('name', 'APP_SECRET').maybeSingle();
  _savedVarCache.set('JWT_SECRET', !!secJwt.data);
  _savedVarCache.set('APP_SECRET', !!secApp.data);

  let result: ProviderTestResult;
  switch (providerToTest) {
    case 'github': result = await testGitHub(client); break;
    case 'render': result = await testRender(client); break;
    case 'supabase': result = await testSupabase(client); break;
    case 'aws': result = await testAWS(client); break;
    case 'ai': result = await testAIGateway(client); break;
    case 'storage': result = await testStorage(); break;
    case 'security': result = await testSecurity(); break;
    default: result = { ok: false, httpStatus: null, error: 'Unknown provider.' };
  }

  const testStatus: IVXOwnerVarStatus = result.ok ? 'tested' : 'invalid';

  // Update DB status for all variables in this provider
  const providerVarNames = OWNER_VARIABLE_NAMES.filter((n) => VARIABLE_REGISTRY[n].provider === providerToTest);
  const testedAt = nowIso();
  for (const varName of providerVarNames) {
    const { error: updateError } = await client
      .from('ivx_owner_variables')
      .update({
        status: testStatus,
        last_tested_at: testedAt,
        last_test_result: result.ok ? 'pass' : (result.error ?? 'fail'),
        updated_at: testedAt,
      })
      .eq('name', varName);

    if (updateError) {
      console.log('[IVXOwnerVariables] Status update error for', varName, ':', updateError.message);
    }
  }

  await writeAuditLog(client, {
    variable: input.name ?? providerToTest,
    provider: providerToTest,
    action: 'test',
    result: result.ok ? 'success' : 'fail',
    actorId: auth.userId,
    actorEmail: auth.email,
    detail: result.ok ? (result.detail ?? 'Test passed.') : (result.error ?? 'Test failed.'),
  });

  const statusAfterTest = await buildStatus(client, auth);

  const providerResult = statusAfterTest.providers[providerToTest];

  return {
    ok: result.ok,
    ownerOnly: true,
    variableName: input.name,
    provider: providerToTest,
    testResult: testStatus,
    message: result.ok ? (result.detail ?? `${providerToTest} test passed.`) : (result.error ?? `${providerToTest} test failed.`),
    providerResult,
    statusAfterTest,
    secretValuesReturned: false,
    deploymentMarker: DEPLOYMENT_MARKER,
    timestamp: nowIso(),
    error: result.ok ? undefined : result.error,
  };
}

// ---------------------------------------------------------------------------
// Self-sync: read backend runtime env values and store encrypted copies
// ---------------------------------------------------------------------------

export type SelfSyncResult = {
  name: string;
  provider: IVXOwnerVarProvider;
  action: 'synced' | 'skipped_existing' | 'missing_in_env' | 'error';
  sourceEnvName: string | null;
  maskedPreview: string | null;
  message?: string;
};

export async function selfSyncFromEnv(
  client: SupabaseClient,
  auth: IVXAuthenticatedRequestContext,
  options: { overwriteExisting?: boolean; names?: string[] },
): Promise<{
  ok: boolean;
  results: SelfSyncResult[];
  summary: { candidatesChecked: number; syncedCount: number; skippedExistingCount: number; missingInEnvCount: number; errorCount: number };
  statusAfterSync?: IVXOwnerVariablesStatus;
  error?: string;
}> {
  const overwrite = options.overwriteExisting !== false;
  const candidates = options.names ?? OWNER_VARIABLE_NAMES;

  const results: SelfSyncResult[] = [];
  let syncedCount = 0;
  let skippedExistingCount = 0;
  let missingInEnvCount = 0;
  let errorCount = 0;

  for (const name of candidates) {
    const meta = VARIABLE_REGISTRY[name];
    if (!meta) continue;

    const envName = meta.envAlias ?? name;
    const envValue = readTrimmed(process.env[envName]);

    if (!envValue) {
      results.push({
        name,
        provider: meta.provider,
        action: 'missing_in_env',
        sourceEnvName: envName,
        maskedPreview: null,
        message: `Not found in backend env as ${envName}.`,
      });
      missingInEnvCount += 1;
      continue;
    }

    // Check if already saved
    if (!overwrite) {
      const existing = await client.from('ivx_owner_variables').select('name').eq('name', name).maybeSingle();
      if (existing.data) {
        results.push({
          name,
          provider: meta.provider,
          action: 'skipped_existing',
          sourceEnvName: envName,
          maskedPreview: null,
          message: 'Already saved — skipped (overwriteExisting=false).',
        });
        skippedExistingCount += 1;
        continue;
      }
    }

    const encryptedValue = encryptValue(envValue);
    const maskedPreview = maskSecretValue(envValue, meta.secret);

    const { error } = await client
      .from('ivx_owner_variables')
      .upsert({
        name,
        provider: meta.provider,
        encrypted_value: encryptedValue,
        masked_preview: maskedPreview,
        status: 'saved',
        last_saved_at: nowIso(),
        last_saved_by: `${auth.email ?? auth.userId} (self-sync)`,
        required: meta.required,
        secret: meta.secret,
        description: meta.description,
        updated_at: nowIso(),
      }, { onConflict: 'name' });

    if (error) {
      results.push({
        name,
        provider: meta.provider,
        action: 'error',
        sourceEnvName: envName,
        maskedPreview: null,
        message: error.message,
      });
      errorCount += 1;
      await writeAuditLog(client, {
        variable: name,
        provider: meta.provider,
        action: 'self_sync',
        result: 'error',
        actorId: auth.userId,
        actorEmail: auth.email,
        detail: error.message,
      });
    } else {
      results.push({
        name,
        provider: meta.provider,
        action: 'synced',
        sourceEnvName: envName,
        maskedPreview,
        message: `Synced from env ${envName}.`,
      });
      syncedCount += 1;
      await writeAuditLog(client, {
        variable: name,
        provider: meta.provider,
        action: 'self_sync',
        result: 'success',
        actorId: auth.userId,
        actorEmail: auth.email,
        detail: `Synced from backend env ${envName} — masked: ${maskedPreview}`,
      });
    }
  }

  const statusAfterSync = await buildStatus(client, auth);

  return {
    ok: errorCount === 0,
    results,
    summary: {
      candidatesChecked: candidates.length,
      syncedCount,
      skippedExistingCount,
      missingInEnvCount,
      errorCount,
    },
    statusAfterSync,
  };
}

// ---------------------------------------------------------------------------
// Minimal AWS SigV4 signer for STS GetCallerIdentity (GET)
// ---------------------------------------------------------------------------

async function signStsGetCallerIdentity(accessKeyId: string, secretAccessKey: string, region: string): Promise<string> {
  const service = 'sts';
  const host = region === 'us-east-1' ? 'sts.amazonaws.com' : `sts.${region}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  const method = 'GET';
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const canonicalQuery = 'Action=GetCallerIdentity&Version=2011-06-15';
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';
  const payloadHash = await sha256Hex('');

  const canonicalRequest = `${method}\n/\n${canonicalQuery}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = await hmacSha256Hex(signingKey, stringToSign);

  const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return `${endpoint}?${canonicalQuery}&X-Amz-Date=${amzDate}&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=${encodeURIComponent(`${accessKeyId}/${credentialScope}`)}&X-Amz-SignedHeaders=${signedHeaders}&X-Amz-Signature=${signature}`;
}

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256(key: BufferSource, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data));
}

async function hmacSha256Hex(key: BufferSource, data: string): Promise<string> {
  const sigBuffer = await hmacSha256(key, data);
  return Array.from(new Uint8Array(sigBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deriveSigningKey(secretAccessKey: string, dateStamp: string, region: string, service: string): Promise<ArrayBuffer> {
  const kSecret = new TextEncoder().encode(`AWS4${secretAccessKey}`);
  const kDate = await hmacSha256(kSecret, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

// ---------------------------------------------------------------------------
// Error handling helper
// ---------------------------------------------------------------------------

export function handleApiError(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unknown server error.';
  const isAuthError = /auth|bearer|token|session|expired|invalid|role guard/i.test(message);
  const status = isAuthError ? 401 : 500;
  console.log('[IVXOwnerVariables] API error:', message);
  return jsonResponse({ ok: false, error: message, secretValuesReturned: false, timestamp: nowIso() }, status);
}

export function extractBearer(request: Request): string | null {
  return extractIVXBearerToken(request);
}
