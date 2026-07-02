/**
 * IVX Google Play Deployment Tool
 *
 * Uses the Google Play Developer REST API to:
 *   - Verify service account credentials
 *   - List apps in the Play Console
 *   - Get app details (package name, track status)
 *   - List active tracks (production, beta, alpha, internal)
 *   - Get latest track releases
 *   - Check review status and publishing state
 *
 * Authentication: Google Play uses OAuth2 service account JWT.
 * Credentials come from IVX_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON or
 * GOOGLE_PLAY_SERVICE_ACCOUNT_JSON (a JSON key file string).
 * The JWT is signed with the private key from that JSON.
 *
 * No secret values are ever returned.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface GooglePlayApp {
  packageName: string;
  title: string | null;
  developerName: string | null;
}

export interface GooglePlayTrack {
  track: string;
  versionCodes: number[];
  releases: Array<{
    name: string;
    versionCodes: number[];
    status: string;
    userFraction: number | null;
  }>;
}

export interface GooglePlayToolResult {
  ok: boolean;
  error: string | null;
  authenticated: boolean;
  apps?: GooglePlayApp[];
  tracks?: GooglePlayTrack[];
  appInfo?: GooglePlayApp;
}

// ─── Credential Helpers ──────────────────────────────────────────────

function getServiceAccountJson(): string {
  return (process.env.IVX_GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ??
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON ?? '').trim();
}

function isConfigured(): boolean {
  return getServiceAccountJson().length > 0;
}

// ─── JWT Generation (no external crypto dependency) ──────────────────

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

function parseServiceAccount(json: string): ServiceAccountKey | null {
  try {
    return JSON.parse(json) as ServiceAccountKey;
  } catch {
    return null;
  }
}

/**
 * Base64url encode without padding.
 */
function base64url(input: Uint8Array | ArrayBuffer): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Import a PEM private key using Web Crypto API (available in Deno/Node 20+).
 */
async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  // Remove PEM headers and get base64 content
  const pemContents = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  // Decode base64 to binary
  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Generate an OAuth2 JWT for Google Play Developer API access.
 */
async function generateJwt(sa: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: sa.private_key_id };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: sa.token_uri,
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = base64url(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const cryptoKey = await importPrivateKey(sa.private_key);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Exchange JWT for an OAuth2 access token.
 */
async function getAccessToken(sa: ServiceAccountKey): Promise<{ ok: boolean; token: string | null; error: string | null }> {
  try {
    const jwt = await generateJwt(sa);
    const res = await fetch(sa.token_uri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, token: null, error: `OAuth token exchange failed: HTTP ${res.status}: ${text.slice(0, 300)}` };
    }
    const data = await res.json() as { access_token?: string };
    return { ok: true, token: data.access_token ?? null, error: null };
  } catch (err) {
    return { ok: false, token: null, error: `OAuth error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── API Operations ──────────────────────────────────────────────────

const PLAY_API = 'https://androidpublisher.googleapis.com/androidpublisher/v3';

async function playFetch<T = unknown>(
  path: string,
  token: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  const url = path.startsWith('http') ? path : `${PLAY_API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (opts.body) headers['Content-Type'] = 'application/json';

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    const data = text ? (() => { try { return JSON.parse(text) as T; } catch { return null; } })() : null;
    if (!res.ok) {
      return { ok: false, status: res.status, data, error: `Play API ${res.status}: ${text.slice(0, 500)}` };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Public Operations ───────────────────────────────────────────────

export async function verifyCredentials(): Promise<GooglePlayToolResult> {
  const json = getServiceAccountJson();
  if (!json) return { ok: false, error: 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not configured', authenticated: false };

  const sa = parseServiceAccount(json);
  if (!sa) return { ok: false, error: 'Invalid service account JSON format', authenticated: false };

  const tokenResult = await getAccessToken(sa);
  if (!tokenResult.ok || !tokenResult.token) {
    return { ok: false, error: tokenResult.error, authenticated: false };
  }

  return {
    ok: true,
    error: null,
    authenticated: true,
    appInfo: {
      packageName: sa.project_id ?? 'unknown',
      title: null,
      developerName: sa.client_email ?? 'unknown',
    },
  };
}

export async function listTracks(packageName: string): Promise<GooglePlayToolResult> {
  const json = getServiceAccountJson();
  if (!json) return { ok: false, error: 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not configured', authenticated: false };

  const sa = parseServiceAccount(json);
  if (!sa) return { ok: false, error: 'Invalid service account JSON', authenticated: false };

  const tokenResult = await getAccessToken(sa);
  if (!tokenResult.ok || !tokenResult.token) {
    return { ok: false, error: tokenResult.error, authenticated: false };
  }

  // First create an edit session
  const editResult = await playFetch<{ id: string }>(
    `/applications/${encodeURIComponent(packageName)}/edits`,
    tokenResult.token,
    { method: 'POST', body: {} },
  );

  let editId: string | null = null;
  if (editResult.ok && editResult.data) {
    editId = editResult.data.id;
  }

  // List tracks
  const tracksResult = await playFetch<{ tracks: Array<{ track: string; releases: Array<{ name: string; versionCodes: number[]; status: string; userFraction: number | null }> }> }>(
    editId
      ? `/applications/${encodeURIComponent(packageName)}/edits/${editId}/tracks`
      : `/applications/${encodeURIComponent(packageName)}/tracks`,
    tokenResult.token,
  );

  const tracks: GooglePlayTrack[] = (tracksResult.data?.tracks ?? []).map(t => ({
    track: t.track,
    versionCodes: t.releases?.flatMap(r => r.versionCodes ?? []) ?? [],
    releases: t.releases?.map(r => ({
      name: r.name ?? '',
      versionCodes: r.versionCodes ?? [],
      status: r.status ?? 'unknown',
      userFraction: r.userFraction ?? null,
    })) ?? [],
  }));

  return {
    ok: tracksResult.ok,
    error: tracksResult.error,
    authenticated: true,
    tracks,
  };
}

export async function getAppInfo(packageName: string): Promise<GooglePlayToolResult> {
  const json = getServiceAccountJson();
  if (!json) return { ok: false, error: 'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not configured', authenticated: false };

  const sa = parseServiceAccount(json);
  if (!sa) return { ok: false, error: 'Invalid service account JSON', authenticated: false };

  const tokenResult = await getAccessToken(sa);
  if (!tokenResult.ok || !tokenResult.token) {
    return { ok: false, error: tokenResult.error, authenticated: false };
  }

  // Get app details
  const appResult = await playFetch<Record<string, unknown>>(
    `/applications/${encodeURIComponent(packageName)}`,
    tokenResult.token,
  );

  return {
    ok: appResult.ok,
    error: appResult.error,
    authenticated: true,
    appInfo: {
      packageName,
      title: appResult.data ? String(appResult.data.title ?? null) : null,
      developerName: null,
    },
  };
}

export async function getFullGooglePlayStatus(): Promise<GooglePlayToolResult> {
  const verify = await verifyCredentials();
  if (!verify.ok) return verify;

  // If we have a package name, get tracks
  const packageName = process.env.IVX_GOOGLE_PLAY_PACKAGE_NAME ??
    process.env.GOOGLE_PLAY_PACKAGE_NAME ?? '';

  if (packageName) {
    const tracks = await listTracks(packageName);
    return {
      ok: tracks.ok,
      error: tracks.error,
      authenticated: true,
      tracks: tracks.tracks,
      appInfo: verify.appInfo,
    };
  }

  return verify;
}
