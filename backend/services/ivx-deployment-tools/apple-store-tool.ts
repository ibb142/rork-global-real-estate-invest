/**
 * IVX Apple App Store Deployment Tool
 *
 * Uses the App Store Connect REST API to:
 *   - Verify API key credentials
 *   - List apps in App Store Connect
 *   - Get app details (bundle ID, SKU, app store state)
 *   - List build submissions and their processing state
 *   - Check TestFlight beta build status
 *   - List App Store version submissions
 *   - Get beta testing group status
 *
 * Authentication: App Store Connect API uses JWT (ES256 algorithm)
 * signed with a private key (.p8 file content). Credentials:
 *   IVX_APPSTORE_KEY_ID / APPSTORE_KEY_ID
 *   IVX_APPSTORE_ISSUER_ID / APPSTORE_ISSUER_ID
 *   IVX_APPSTORE_PRIVATE_KEY / APPSTORE_PRIVATE_KEY (PEM P-256 key content)
 *
 * No secret values are ever returned.
 */

// ─── Types ───────────────────────────────────────────────────────────

export interface AppStoreApp {
  id: string;
  name: string;
  bundleId: string;
  sku: string | null;
  primaryLocale: string | null;
}

export interface AppStoreBuild {
  id: string;
  version: string;
  processingState: string;
  uploadedDate: string;
  expired: boolean;
}

export interface AppStoreVersion {
  id: string;
  versionString: string;
  appStoreState: string;
  releaseType: string | null;
  reviewState: string | null;
}

export interface AppStoreBetaBuild {
  id: string;
  version: string;
  processingState: string;
  betaReviewState: string;
}

export interface AppleStoreToolResult {
  ok: boolean;
  error: string | null;
  authenticated: boolean;
  apps?: AppStoreApp[];
  builds?: AppStoreBuild[];
  versions?: AppStoreVersion[];
  betaBuilds?: AppStoreBetaBuild[];
}

// ─── Credential Helpers ──────────────────────────────────────────────

function getKeyId(): string {
  return (process.env.IVX_APPSTORE_KEY_ID ?? process.env.APPSTORE_KEY_ID ?? '').trim();
}

function getIssuerId(): string {
  return (process.env.IVX_APPSTORE_ISSUER_ID ?? process.env.APPSTORE_ISSUER_ID ?? '').trim();
}

function getPrivateKey(): string {
  return (process.env.IVX_APPSTORE_PRIVATE_KEY ?? process.env.APPSTORE_PRIVATE_KEY ?? '').trim();
}

function isConfigured(): boolean {
  return getKeyId().length > 0 && getIssuerId().length > 0 && getPrivateKey().length > 0;
}

// ─── JWT Generation (ES256) ──────────────────────────────────────────

function base64url(input: Uint8Array | ArrayBuffer): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Import a P-256 private key from PEM format.
 */
async function importEs256Key(pemKey: string): Promise<CryptoKey> {
  // Handle both PKCS8 and raw key formats
  let keyContent = pemKey;

  // If it's a raw base64 key (no PEM headers), wrap it
  if (!keyContent.includes('-----BEGIN')) {
    // .p8 files contain raw base64 — convert to PEM
    keyContent = `-----BEGIN PRIVATE KEY-----\n${keyContent}\n-----END PRIVATE KEY-----`;
  }

  const pemContents = keyContent
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/-----BEGIN EC PRIVATE KEY-----/, '')
    .replace(/-----END EC PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/**
 * Generate an App Store Connect JWT (ES256).
 */
async function generateAppStoreJwt(): Promise<{ ok: boolean; token: string | null; error: string | null }> {
  const keyId = getKeyId();
  const issuerId = getIssuerId();
  const privateKeyPem = getPrivateKey();

  if (!keyId || !issuerId || !privateKeyPem) {
    return { ok: false, token: null, error: 'APPSTORE_KEY_ID, APPSTORE_ISSUER_ID, and APPSTORE_PRIVATE_KEY are all required' };
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', typ: 'JWT', kid: keyId };
    const payload = {
      iss: issuerId,
      iat: now,
      exp: now + 1200, // 20 minutes
      aud: 'appstoreconnect-v1',
    };

    const headerB64 = base64url(new TextEncoder().encode(JSON.stringify(header)));
    const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(payload)));
    const signingInput = `${headerB64}.${payloadB64}`;

    const cryptoKey = await importEs256Key(privateKeyPem);
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      new TextEncoder().encode(signingInput),
    );

    // Web Crypto returns raw r||s for ECDSA — App Store expects raw format (not DER)
    return { ok: true, token: `${signingInput}.${base64url(signature)}`, error: null };
  } catch (err) {
    return { ok: false, token: null, error: `JWT generation error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── API Operations ──────────────────────────────────────────────────

const ASC_API = 'https://api.appstoreconnect.apple.com/v1';

async function ascFetch<T = unknown>(
  path: string,
  token: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  const url = path.startsWith('http') ? path : `${ASC_API}${path}`;
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
      return { ok: false, status: res.status, data, error: `ASC API ${res.status}: ${text.slice(0, 500)}` };
    }
    return { ok: true, status: res.status, data, error: null };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Public Operations ───────────────────────────────────────────────

export async function verifyCredentials(): Promise<AppleStoreToolResult> {
  if (!isConfigured()) {
    return { ok: false, error: 'App Store Connect credentials not configured (need KEY_ID, ISSUER_ID, PRIVATE_KEY)', authenticated: false };
  }

  const jwtResult = await generateAppStoreJwt();
  if (!jwtResult.ok || !jwtResult.token) {
    return { ok: false, error: jwtResult.error, authenticated: false };
  }

  // Test by listing apps
  const appsResult = await ascFetch<{ data: Array<{ id: string; attributes: { name: string; bundleId: string; sku: string | null; primaryLocale: string | null } }> }>(
    '/apps?limit=20',
    jwtResult.token,
  );

  if (!appsResult.ok) {
    return { ok: false, error: appsResult.error, authenticated: false };
  }

  const apps: AppStoreApp[] = (appsResult.data?.data ?? []).map(a => ({
    id: a.id,
    name: a.attributes?.name ?? 'unknown',
    bundleId: a.attributes?.bundleId ?? 'unknown',
    sku: a.attributes?.sku ?? null,
    primaryLocale: a.attributes?.primaryLocale ?? null,
  }));

  return {
    ok: true,
    error: null,
    authenticated: true,
    apps,
  };
}

export async function listBuilds(appId: string): Promise<AppleStoreToolResult> {
  const jwtResult = await generateAppStoreJwt();
  if (!jwtResult.ok || !jwtResult.token) {
    return { ok: false, error: jwtResult.error, authenticated: false };
  }

  const result = await ascFetch<{ data: Array<{ id: string; attributes: { version: string; processingState: string; uploadedDate: string; expired: boolean } }> }>(
    `/apps/${encodeURIComponent(appId)}/builds?limit=10`,
    jwtResult.token,
  );

  if (!result.ok) {
    return { ok: false, error: result.error, authenticated: true };
  }

  const builds: AppStoreBuild[] = (result.data?.data ?? []).map(b => ({
    id: b.id,
    version: b.attributes?.version ?? 'unknown',
    processingState: b.attributes?.processingState ?? 'unknown',
    uploadedDate: b.attributes?.uploadedDate ?? 'unknown',
    expired: b.attributes?.expired ?? false,
  }));

  return { ok: true, error: null, authenticated: true, builds };
}

export async function listAppStoreVersions(appId: string): Promise<AppleStoreToolResult> {
  const jwtResult = await generateAppStoreJwt();
  if (!jwtResult.ok || !jwtResult.token) {
    return { ok: false, error: jwtResult.error, authenticated: false };
  }

  const result = await ascFetch<{ data: Array<{ id: string; attributes: { versionString: string; appStoreState: string; releaseType: string | null; reviewState: string | null } }> }>(
    `/apps/${encodeURIComponent(appId)}/appStoreVersions?limit=10`,
    jwtResult.token,
  );

  if (!result.ok) {
    return { ok: false, error: result.error, authenticated: true };
  }

  const versions: AppStoreVersion[] = (result.data?.data ?? []).map(v => ({
    id: v.id,
    versionString: v.attributes?.versionString ?? 'unknown',
    appStoreState: v.attributes?.appStoreState ?? 'unknown',
    releaseType: v.attributes?.releaseType ?? null,
    reviewState: v.attributes?.reviewState ?? null,
  }));

  return { ok: true, error: null, authenticated: true, versions };
}

export async function listBetaBuilds(appId: string): Promise<AppleStoreToolResult> {
  const jwtResult = await generateAppStoreJwt();
  if (!jwtResult.ok || !jwtResult.token) {
    return { ok: false, error: jwtResult.error, authenticated: false };
  }

  // Get beta builds via the app's beta builds relationship
  const result = await ascFetch<{ data: Array<{ id: string; attributes: { version: string; processingState: string; betaReviewState: string } }> }>(
    `/apps/${encodeURIComponent(appId)}/betaBuildUsages?limit=10`,
    jwtResult.token,
  );

  if (!result.ok) {
    return { ok: false, error: result.error, authenticated: true };
  }

  const betaBuilds: AppStoreBetaBuild[] = (result.data?.data ?? []).map(b => ({
    id: b.id,
    version: b.attributes?.version ?? 'unknown',
    processingState: b.attributes?.processingState ?? 'unknown',
    betaReviewState: b.attributes?.betaReviewState ?? 'unknown',
  }));

  return { ok: true, error: null, authenticated: true, betaBuilds };
}

export async function getFullAppleStoreStatus(): Promise<AppleStoreToolResult> {
  const verify = await verifyCredentials();
  if (!verify.ok) return verify;

  // If we have apps, get details for the first one
  if (verify.apps && verify.apps.length > 0) {
    const appId = verify.apps[0].id;
    const [builds, versions] = await Promise.all([
      listBuilds(appId),
      listAppStoreVersions(appId),
    ]);

    return {
      ok: verify.ok,
      error: [verify.error, builds.error, versions.error].filter(Boolean).join('; ') || null,
      authenticated: true,
      apps: verify.apps,
      builds: builds.builds,
      versions: versions.versions,
    };
  }

  return verify;
}
