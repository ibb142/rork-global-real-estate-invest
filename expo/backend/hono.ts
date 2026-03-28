/* eslint-disable no-var */
declare var process: { env: Record<string, string | undefined> };
declare var require: (id: string) => any;
/* eslint-enable no-var */

// NOTE: This file is 2500+ LOC. When refactoring, split into:
//   backend/routes/deals.ts, backend/routes/email.ts, backend/routes/sms.ts,
//   backend/routes/admin.ts, backend/routes/health.ts, backend/middleware/rate-limit.ts
// Each route module should export a Hono sub-app mounted in this file.

import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";
import { getSupabaseAdmin, isServiceRoleConfigured } from "../lib/supabase-admin";

function getEdgeFunctionUrl(): string {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectId = match ? match[1] : '';
  return projectId ? `https://${projectId}.supabase.co/functions/v1/runtime-deals` : '';
}

function getSupabaseProjectId(): string {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match ? match[1] : '';
}

const S3_BUCKET = (process.env.S3_BUCKET || 'ivxholding.com').trim();
const GITHUB_REPO = (process.env.GITHUB_REPO || 'ibb142/rork-global-real-estate-invest').trim();

let _dealCache: { deals: Record<string, unknown>[]; source: string; timestamp: number } | null = null;
const DEAL_CACHE_TTL = 10_000;

const _emailRateLimit: Map<string, { count: number; resetAt: number }> = new Map();
const EMAIL_RATE_LIMIT_MAX = 10;
const EMAIL_RATE_LIMIT_WINDOW = 60_000;
const RATE_LIMIT_CLEANUP_INTERVAL = 300_000;

const _rateLimitCleanupInterval = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of _emailRateLimit) {
    if (now > entry.resetAt) {
      _emailRateLimit.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) console.log(`[RATE-LIMIT] Cleaned ${cleaned} expired entries, ${_emailRateLimit.size} remaining`);
}, RATE_LIMIT_CLEANUP_INTERVAL);

try {
  if (typeof globalThis !== 'undefined' && 'unref' in Object((_rateLimitCleanupInterval as unknown))) {
    ((_rateLimitCleanupInterval as unknown) as { unref: () => void }).unref();
  }
} catch {}

function checkEmailRateLimit(senderKey: string): { allowed: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();
  const entry = _emailRateLimit.get(senderKey);
  if (!entry || now > entry.resetAt) {
    _emailRateLimit.set(senderKey, { count: 1, resetAt: now + EMAIL_RATE_LIMIT_WINDOW });
    return { allowed: true, remaining: EMAIL_RATE_LIMIT_MAX - 1, resetInMs: EMAIL_RATE_LIMIT_WINDOW };
  }
  if (entry.count >= EMAIL_RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetInMs: entry.resetAt - now };
  }
  entry.count++;
  return { allowed: true, remaining: EMAIL_RATE_LIMIT_MAX - entry.count, resetInMs: entry.resetAt - now };
}

function getAwsCredentials() {
  return {
    accessKey: (process.env.AWS_ACCESS_KEY_ID || '').trim(),
    secretKey: (process.env.AWS_SECRET_ACCESS_KEY || '').trim(),
    region: (process.env.AWS_REGION || 'us-east-1').trim(),
  };
}

const _toHex = (buf: ArrayBuffer): string => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');

async function _hmacSign(key: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyBytes = key instanceof Uint8Array ? new Uint8Array(key) : new Uint8Array(key);
  const ck = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', ck, encoder.encode(msg));
}

async function awsSigV4Sign(opts: {
  method: string;
  host: string;
  uri: string;
  service: string;
  contentType: string;
  payload: string;
  accessKey: string;
  secretKey: string;
  region: string;
  extraHeaders?: Record<string, string>;
}): Promise<{ url: string; headers: Record<string, string> }> {
  const encoder = new TextEncoder();
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.substring(0, 8);

  const payloadHash = _toHex(await crypto.subtle.digest('SHA-256', encoder.encode(opts.payload)));

  let headerNames = `content-type;host;x-amz-date`;
  let headerBlock = `content-type:${opts.contentType}\nhost:${opts.host}\nx-amz-date:${amzDate}\n`;

  if (opts.extraHeaders) {
    const sorted = Object.keys(opts.extraHeaders).sort();
    for (const k of sorted) {
      headerBlock = `${headerBlock.slice(0, -1)}\n${k}:${opts.extraHeaders[k]}\n`;
      headerNames += `;${k}`;
    }
  }

  if (opts.service === 'ses') {
    headerNames = 'content-type;host;x-amz-date';
    headerBlock = `content-type:${opts.contentType}\nhost:${opts.host}\nx-amz-date:${amzDate}\n`;
  }
  if (opts.service === 's3') {
    headerNames = 'content-type;host;x-amz-content-sha256;x-amz-date';
    headerBlock = `content-type:${opts.contentType}\nhost:${opts.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  }

  const canonicalRequest = `${opts.method}\n${opts.uri}\n\n${headerBlock}\n${headerNames}\n${payloadHash}`;
  const canonicalHash = _toHex(await crypto.subtle.digest('SHA-256', encoder.encode(canonicalRequest)));
  const credentialScope = `${dateStamp}/${opts.region}/${opts.service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalHash}`;

  const secretBytes = encoder.encode('AWS4' + opts.secretKey);
  const kDate = await _hmacSign(secretBytes, dateStamp);
  const kRegion = await _hmacSign(kDate, opts.region);
  const kService = await _hmacSign(kRegion, opts.service);
  const kSigning = await _hmacSign(kService, 'aws4_request');
  const signature = _toHex(await _hmacSign(kSigning, stringToSign));

  const authorization = `AWS4-HMAC-SHA256 Credential=${opts.accessKey}/${credentialScope}, SignedHeaders=${headerNames}, Signature=${signature}`;

  const headers: Record<string, string> = {
    'Content-Type': opts.contentType,
    'x-amz-date': amzDate,
    'Authorization': authorization,
  };
  if (opts.service === 's3') {
    headers['x-amz-content-sha256'] = payloadHash;
  }

  return { url: `https://${opts.host}${opts.uri}`, headers };
}

async function sesApiCall(action: string, params: URLSearchParams, retries = 2): Promise<{ ok: boolean; status: number; body: string }> {
  const { accessKey, secretKey, region } = getAwsCredentials();
  if (!accessKey || !secretKey) {
    return { ok: false, status: 500, body: 'AWS credentials not configured' };
  }
  const sesHost = `email.${region}.amazonaws.com`;
  params.set('Action', action);
  const payload = params.toString();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const signed = await awsSigV4Sign({
        method: 'POST',
        host: sesHost,
        uri: '/',
        service: 'ses',
        contentType: 'application/x-www-form-urlencoded',
        payload,
        accessKey,
        secretKey,
        region,
      });

      const response = await fetch(signed.url, {
        method: 'POST',
        headers: signed.headers,
        body: payload,
      });

      const body = await response.text();
      console.log(`[SES] ${action} attempt ${attempt + 1}: HTTP ${response.status}`);

      if (response.ok) {
        return { ok: true, status: response.status, body };
      }

      if (response.status >= 500 && attempt < retries) {
        console.log(`[SES] ${action} server error, retrying in ${(attempt + 1) * 1000}ms...`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
        continue;
      }

      if (body.includes('Throttling') && attempt < retries) {
        console.log(`[SES] ${action} throttled, retrying in ${(attempt + 1) * 2000}ms...`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }

      return { ok: false, status: response.status, body };
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Unknown error';
      console.log(`[SES] ${action} attempt ${attempt + 1} exception: ${msg}`);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
        continue;
      }
      return { ok: false, status: 0, body: msg };
    }
  }
  return { ok: false, status: 0, body: 'All retries exhausted' };
}

// Used by deploy endpoints for S3 uploads via shared signing
async function s3PutObject(key: string, body: string, contentType: string): Promise<{ ok: boolean; status: number; error?: string }> { // eslint-disable-line no-unused-vars
  const { accessKey, secretKey, region } = getAwsCredentials();
  if (!accessKey || !secretKey) {
    return { ok: false, status: 500, error: 'AWS credentials not configured' };
  }
  const bucket = S3_BUCKET;
  const usePathStyle = bucket.includes('.');
  const s3Host = usePathStyle
    ? (region === 'us-east-1' ? 's3.amazonaws.com' : `s3.${region}.amazonaws.com`)
    : `${bucket}.s3.${region}.amazonaws.com`;
  const canonicalUri = usePathStyle ? `/${bucket}/${key}` : `/${key}`;

  const signed = await awsSigV4Sign({
    method: 'PUT',
    host: s3Host,
    uri: canonicalUri,
    service: 's3',
    contentType,
    payload: body,
    accessKey,
    secretKey,
    region,
  });

  try {
    const response = await fetch(signed.url, {
      method: 'PUT',
      headers: signed.headers,
      body,
    });
    const respBody = response.ok ? '' : await response.text().catch(() => '');
    console.log(`[S3] PUT ${key}: HTTP ${response.status}${respBody ? ' — ' + respBody.substring(0, 300) : ''}`);
    return { ok: response.ok, status: response.status, error: respBody || undefined };
  } catch (err: unknown) {
    const msg = (err as Error)?.message || 'Unknown error';
    console.log(`[S3] PUT ${key} exception: ${msg}`);
    return { ok: false, status: 0, error: msg };
  }
}

function injectLandingCredentials(html: string, supabaseUrl: string, supabaseAnonKey: string, apiBaseUrl: string): string {
  let result = html;
  result = result.replace(/__IVX_SUPABASE_URL__/g, supabaseUrl);
  result = result.replace(/__IVX_SUPABASE_ANON_KEY__/g, supabaseAnonKey);
  result = result.replace(/__IVX_API_BASE_URL__/g, apiBaseUrl);
  result = result.replace(/__IVX_APP_URL__/g, apiBaseUrl);
  result = result.replace(/__IVX_BACKEND_URL__/g, apiBaseUrl);

  const metaReplacements: [string, string][] = [
    ['ivx-sb-url', supabaseUrl],
    ['ivx-sb-key', supabaseAnonKey],
    ['ivx-sb-url-fallback', supabaseUrl],
    ['ivx-sb-key-fallback', supabaseAnonKey],
    ['ivx-api-url', apiBaseUrl],
    ['ivx-backend-url', apiBaseUrl],
  ];
  for (const [name, value] of metaReplacements) {
    const pattern = new RegExp(`<meta\\s+name="${name}"\\s+content="[^"]*"`);
    const match = result.match(pattern);
    if (match) result = result.replace(match[0], `<meta name="${name}" content="${value}"`);
  }

  const jsVarReplacements: [RegExp, string][] = [
    [/var _FALLBACK_SUPABASE_URL = '[^']*';/, `var _FALLBACK_SUPABASE_URL = '${supabaseUrl}';`],
    [/var _FALLBACK_SUPABASE_KEY = '[^']*';/, `var _FALLBACK_SUPABASE_KEY = '${supabaseAnonKey}';`],
    [/var _RORK_API_URL = '[^']*';/, `var _RORK_API_URL = '${apiBaseUrl}';`],
    [/var _RORK_BACKEND_URL = '[^']*';/, `var _RORK_BACKEND_URL = '${apiBaseUrl}';`],
  ];
  for (const [pattern, replacement] of jsVarReplacements) {
    if (pattern.test(result)) result = result.replace(pattern, replacement);
  }

  return result;
}

let _readLocalFile: ((path: string) => string) | null = null;
try {
  const fs = require('fs');
  _readLocalFile = (p: string) => fs.readFileSync(p, 'utf-8');
} catch {}

function getSupabaseCredentials(): { url: string; key: string; serviceKey: string; isValid: boolean; isJwtKey: boolean; hasServiceRole: boolean } {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const isJwtKey = !!(key && key.startsWith('eyJ') && key.length > 30);
  const isValid = !!(url && url.length > 10 && key && key.length > 10 && isJwtKey);
  const hasServiceRole = !!(serviceKey && serviceKey.startsWith('eyJ') && serviceKey.length > 30);
  return { url, key, serviceKey, isValid, isJwtKey, hasServiceRole };
}

const app = new Hono();

async function verifyAdminAuth(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token || !token.startsWith('eyJ')) return false;
  const { hasServiceRole } = getSupabaseCredentials();
  if (!hasServiceRole) {
    console.log('[AUTH] DENIED — SUPABASE_SERVICE_ROLE_KEY not configured. Cannot verify admin tokens. Set the env var to enable auth.');
    return false;
  }
  try {
    const admin = getSupabaseAdmin();
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) {
      console.log('[AUTH] Token verification failed:', error?.message || 'no user');
      return false;
    }
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    const role = profile?.role || 'investor';
    const adminRoles = ['owner', 'ceo', 'staff', 'manager', 'analyst'];
    if (!adminRoles.includes(role)) {
      console.log('[AUTH] User', user.id, 'has role', role, '— not admin');
      return false;
    }
    console.log('[AUTH] Admin verified:', user.id, 'role:', role);
    return true;
  } catch (err: unknown) {
    console.log('[AUTH] Verification error:', (err as Error)?.message);
    return false;
  }
}

async function verifyAnyAuth(authHeader: string | undefined): Promise<{ authenticated: boolean; userId?: string; role?: string }> {
  if (!authHeader) return { authenticated: false };
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token || !token.startsWith('eyJ')) return { authenticated: false };
  const { hasServiceRole } = getSupabaseCredentials();
  if (!hasServiceRole) {
    console.log('[AUTH] DENIED — SUPABASE_SERVICE_ROLE_KEY not configured. Cannot verify user tokens. Set the env var to enable auth.');
    return { authenticated: false };
  }
  try {
    const admin = getSupabaseAdmin();
    const { data: { user }, error } = await admin.auth.getUser(token);
    if (error || !user) {
      console.log('[AUTH] Token verification failed:', error?.message || 'no user');
      return { authenticated: false };
    }
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    const role = profile?.role || 'investor';
    console.log('[AUTH] User verified:', user.id, 'role:', role);
    return { authenticated: true, userId: user.id, role };
  } catch (err: unknown) {
    console.log('[AUTH] Verification error:', (err as Error)?.message);
    return { authenticated: false };
  }
}

const ALLOWED_ORIGINS = [
  'https://ivxholding.com',
  'https://www.ivxholding.com',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3000',
  (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, ''),
].filter(Boolean);

app.use("*", cors({
  origin: (origin) => {
    if (!origin) return '*';
    if (ALLOWED_ORIGINS.some(o => origin.startsWith(o))) return origin;
    if (origin.includes('rork.app') || origin.includes('rorktest.dev') || origin.includes('expo.dev')) return origin;
    return '';
  },
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "apikey"],
  maxAge: 86400,
}));

app.use(
  "/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  }),
);

app.post("/track", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const event = body.event || 'unknown';
    const sessionId = body.sessionId || 'unknown';
    const properties = body.properties || {};
    const geo = body.geo || {};

    if (!isServiceRoleConfigured()) {
      console.log('[API] /track: service_role not configured');
      return c.json({ success: false, error: 'service_role not configured' }, 200);
    }

    const admin = getSupabaseAdmin();
    const row = {
      event,
      session_id: sessionId,
      properties: typeof properties === 'string' ? properties : JSON.stringify(properties),
      geo: typeof geo === 'string' ? geo : JSON.stringify(geo),
      created_at: new Date().toISOString(),
    };

    const { error } = await admin.from('landing_analytics').insert(row);
    if (error) {
      console.error('[API] /track insert error:', error.code, error.message);
      return c.json({ success: false, error: error.message }, 200);
    }

    console.log('[API] /track stored:', event, 'session:', sessionId.substring(0, 12));
    return c.json({ success: true });
  } catch (err) {
    console.error('[API] /track error:', (err as Error)?.message);
    return c.json({ success: false, error: (err as Error)?.message }, 200);
  }
});

app.post("/track-batch", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({ events: [] }));
    const events = Array.isArray(body.events) ? body.events : [];

    if (events.length === 0) {
      return c.json({ success: true, stored: 0 });
    }

    if (!isServiceRoleConfigured()) {
      return c.json({ success: false, error: 'service_role not configured' }, 200);
    }

    const admin = getSupabaseAdmin();
    const rows = events.slice(0, 50).map((e: Record<string, unknown>) => ({
      event: (e.event as string) || 'unknown',
      session_id: (e.sessionId as string) || 'unknown',
      properties: e.properties ? JSON.stringify(e.properties) : null,
      geo: e.geo ? JSON.stringify(e.geo) : null,
      created_at: new Date().toISOString(),
    }));

    const { error } = await admin.from('landing_analytics').insert(rows);
    if (error) {
      console.error('[API] /track-batch error:', error.message);
      return c.json({ success: false, error: error.message }, 200);
    }

    console.log('[API] /track-batch stored', rows.length, 'events');
    return c.json({ success: true, stored: rows.length });
  } catch (err) {
    console.error('[API] /track-batch error:', (err as Error)?.message);
    return c.json({ success: false, error: (err as Error)?.message }, 200);
  }
});

app.get("/", (c) => {
  return c.json({ status: "ok", message: "IVX Holdings API is running", ts: Date.now(), v: 4 });
});

app.get("/ping", (c) => {
  return c.json({ status: "ok", ts: Date.now(), v: 4 });
});

app.get("/health", async (c) => {
  const { url: supabaseUrl, key: supabaseAnonKey, isValid, hasServiceRole } = getSupabaseCredentials();
  const awsAccessKey = (process.env.AWS_ACCESS_KEY_ID || "").trim();
  const awsSecretKey = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();

  let supabaseReachable = false;
  let supabaseLatency = 0;
  if (isValid) {
    try {
      const start = Date.now();
      if (hasServiceRole) {
        const admin = getSupabaseAdmin();
        const { error } = await admin.from('jv_deals').select('id').limit(1);
        supabaseReachable = !error;
        if (error) console.log('[API] health: admin ping error:', error.message);
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`${supabaseUrl}/rest/v1/jv_deals?select=id&limit=1`, {
          headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
          signal: controller.signal,
        });
        clearTimeout(timeout);
        supabaseReachable = res.ok;
      }
      supabaseLatency = Date.now() - start;
    } catch (err: unknown) {
      console.log('[API] health: Supabase ping failed:', (err as Error)?.message);
    }
  }

  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    services: {
      supabase: {
        configured: isValid,
        reachable: supabaseReachable,
        latencyMs: supabaseLatency,
        serviceRoleConfigured: isServiceRoleConfigured(),
      },
      aws: {
        configured: !!(awsAccessKey && awsSecretKey),
      },
      backend: {
        running: true,
      },
    },
  });
});

app.get("/landing-config", (c) => {
  const apiBaseUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || "").trim().replace(/\/$/, "");
  const { url: sbUrl, key: sbKey, isValid } = getSupabaseCredentials();

  console.log('[API] landing-config served | API:', apiBaseUrl || 'not set', '| Supabase:', isValid ? 'valid' : 'missing');

  return c.json({
    apiBaseUrl,
    appUrl: apiBaseUrl,
    backendUrl: apiBaseUrl,
    supabaseUrl: sbUrl || '',
    supabaseAnonKey: sbKey || '',
    projectId: getSupabaseProjectId(),
    hasSupabase: isValid,
    servedAt: new Date().toISOString(),
  });
});

const FALLBACK_DEALS: Record<string, unknown>[] = [
  {
    id: 'casa-rosario-001',
    title: 'CASA ROSARIO',
    project_name: 'ONE STOP DEVELOPMENT TWO LLC',
    projectName: 'ONE STOP DEVELOPMENT TWO LLC',
    type: 'development',
    description: 'Premium residential development by ONE STOP DEVELOPMENT TWO LLC. Active JV deal open for qualified and individual investors. Fractional ownership via tokenized shares or direct JV partnership.',
    property_address: '20231 Sw 51st Ct, Pembroke Pines, FL 33332',
    propertyAddress: '20231 Sw 51st Ct, Pembroke Pines, FL 33332',
    city: 'Pembroke Pines',
    state: 'FL',
    country: 'USA',
    total_investment: 1400000,
    totalInvestment: 1400000,
    expected_roi: 30,
    expectedROI: 30,
    management_fee: 2,
    performance_fee: 20,
    minimum_hold_period: 12,
    distribution_frequency: 'Quarterly',
    distributionFrequency: 'Quarterly',
    exit_strategy: 'Sale upon completion',
    exitStrategy: 'Sale upon completion',
    start_date: '2026-01-01',
    end_date: '2028-01-01',
    governing_law: 'State of Florida',
    dispute_resolution: 'Binding Arbitration',
    profit_split: '70/30 Developer/Investor',
    status: 'active',
    published: true,
    partners: [{ name: 'ONE STOP DEVELOPMENT TWO LLC', role: 'Developer / Managing Partner', share: 70 }],
    pool_tiers: [
      { id: 'casa-jv-direct', label: 'JV Direct Investment', type: 'jv_direct', targetAmount: 980000, minInvestment: 1000, currentRaised: 0, investorCount: 0, status: 'open' },
      { id: 'casa-token-shares', label: 'Token Shares', type: 'token_shares', targetAmount: 420000, minInvestment: 50, currentRaised: 0, investorCount: 0, status: 'open' },
    ],
    poolTiers: [
      { id: 'casa-jv-direct', label: 'JV Direct Investment', type: 'jv_direct', targetAmount: 980000, minInvestment: 1000, currentRaised: 0, investorCount: 0, status: 'open' },
      { id: 'casa-token-shares', label: 'Token Shares', type: 'token_shares', targetAmount: 420000, minInvestment: 50, currentRaised: 0, investorCount: 0, status: 'open' },
    ],
    photos: [],
  },
  {
    id: 'perez-residence-001',
    title: 'PEREZ RESIDENCE',
    project_name: 'ONE STOP DEVELOPMENT LLC',
    projectName: 'ONE STOP DEVELOPMENT LLC',
    type: 'development',
    description: 'Premium residential development by ONE STOP DEVELOPMENT LLC. Active JV deal open for investment with 25% expected ROI. Located in the exclusive Southwest Ranches area of South Florida.',
    property_address: 'SW 70 Place, Southwest Ranches, FL',
    propertyAddress: 'SW 70 Place, Southwest Ranches, FL',
    city: 'Southwest Ranches',
    state: 'FL',
    country: 'USA',
    total_investment: 2500000,
    totalInvestment: 2500000,
    expected_roi: 25,
    expectedROI: 25,
    management_fee: 2,
    performance_fee: 20,
    minimum_hold_period: 12,
    distribution_frequency: 'Quarterly',
    distributionFrequency: 'Quarterly',
    exit_strategy: 'Sale upon completion',
    exitStrategy: 'Sale upon completion',
    start_date: '2026-01-01',
    end_date: '2028-01-01',
    governing_law: 'State of Florida',
    dispute_resolution: 'Binding Arbitration',
    profit_split: '70/30 Developer/Investor',
    status: 'active',
    published: true,
    partners: [{ name: 'ONE STOP DEVELOPMENT LLC', role: 'Developer / Managing Partner', share: 70 }],
    pool_tiers: [
      { id: 'pr-jv-direct', label: 'JV Direct Investment', type: 'jv_direct', targetAmount: 1750000, minInvestment: 1000, currentRaised: 0, investorCount: 0, status: 'open' },
      { id: 'pr-token-shares', label: 'Token Shares', type: 'token_shares', targetAmount: 750000, minInvestment: 50, currentRaised: 0, investorCount: 0, status: 'open' },
    ],
    poolTiers: [
      { id: 'pr-jv-direct', label: 'JV Direct Investment', type: 'jv_direct', targetAmount: 1750000, minInvestment: 1000, currentRaised: 0, investorCount: 0, status: 'open' },
      { id: 'pr-token-shares', label: 'Token Shares', type: 'token_shares', targetAmount: 750000, minInvestment: 50, currentRaised: 0, investorCount: 0, status: 'open' },
    ],
    photos: [
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/c8k2juku0luha726co335',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/wkg02bbgbjye7unkpszdq',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/p2sfoeogfdp81v6ujsfex',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/aq5tzx3cey16ap048w9eo',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/kf3sr3spog4ui09pjnq42',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/pnn66tovlkr1ggnk71njd',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/4l6fzhi3g4s8gg2tyou7t',
      'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/wfccv7phw2jjpif4hs8fy',
    ],
  },
];

async function fetchDealPhotosFromStorage(dealId: string, supabaseUrl: string, supabaseAnonKey: string): Promise<string[]> {
  if (!supabaseUrl || !supabaseAnonKey) return [];
  try {
    const listUrl = `${supabaseUrl}/storage/v1/object/list/deal-photos?prefix=${encodeURIComponent(dealId + '/')}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(listUrl, {
      headers: { 'Authorization': `Bearer ${supabaseAnonKey}`, 'apikey': supabaseAnonKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const files = await res.json() as Array<{ name: string }>;
    if (!Array.isArray(files) || files.length === 0) return [];
    const photos = files
      .filter(f => f.name && /\.(jpg|jpeg|png|webp)$/i.test(f.name))
      .map(f => `${supabaseUrl}/storage/v1/object/public/deal-photos/${dealId}/${f.name}`);
    if (photos.length > 0) {
      console.log('[API] Found', photos.length, 'photos in Storage for deal:', dealId);
    }
    return photos;
  } catch (err) {
    console.log('[API] Storage photo fetch failed for', dealId, ':', (err as Error)?.message);
    return [];
  }
}

function sortDealsByDisplayOrder(deals: Record<string, unknown>[]): Record<string, unknown>[] {
  return deals.sort((a, b) => {
    const orderA = (a.display_order as number) ?? (a.displayOrder as number) ?? 999;
    const orderB = (b.display_order as number) ?? (b.displayOrder as number) ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    const dateA = (a.created_at as string) || (a.createdAt as string) || '';
    const dateB = (b.created_at as string) || (b.createdAt as string) || '';
    return dateB > dateA ? 1 : (dateB < dateA ? -1 : 0);
  });
}

function mapSupabaseRow(row: Record<string, unknown>): Record<string, unknown> {
  const mapped = { ...row };
  if (!mapped.title && mapped.name) mapped.title = mapped.name;
  if (!mapped.projectName) mapped.projectName = mapped.project_name || mapped.name || '';
  if (!mapped.project_name) mapped.project_name = mapped.projectName || mapped.name || '';
  if (!mapped.totalInvestment) mapped.totalInvestment = mapped.total_investment || mapped.amount || 0;
  if (!mapped.total_investment) mapped.total_investment = mapped.totalInvestment || mapped.amount || 0;
  if (!mapped.expectedROI && mapped.expected_roi !== undefined) mapped.expectedROI = mapped.expected_roi;
  if (!mapped.expected_roi && mapped.expectedROI !== undefined) mapped.expected_roi = mapped.expectedROI;
  if (!mapped.propertyAddress && mapped.property_address) mapped.propertyAddress = mapped.property_address;
  if (!mapped.property_address && mapped.propertyAddress) mapped.property_address = mapped.propertyAddress;
  if (!mapped.distributionFrequency && mapped.distribution_frequency) mapped.distributionFrequency = mapped.distribution_frequency;
  if (!mapped.distribution_frequency && mapped.distributionFrequency) mapped.distribution_frequency = mapped.distributionFrequency;
  if (!mapped.exitStrategy && mapped.exit_strategy) mapped.exitStrategy = mapped.exit_strategy;
  if (!mapped.exit_strategy && mapped.exitStrategy) mapped.exit_strategy = mapped.exitStrategy;
  if (mapped.is_published !== undefined && mapped.published === undefined) {
    mapped.published = mapped.is_published;
  }
  if (!mapped.status) mapped.status = (mapped.is_published || mapped.published) ? 'active' : 'draft';
  if (typeof mapped.photos === 'string') {
    try { mapped.photos = JSON.parse(mapped.photos as string); } catch { mapped.photos = []; }
  }
  if (!Array.isArray(mapped.photos)) mapped.photos = [];
  const STOCK_DOMAINS = ['unsplash.com','images.unsplash.com','source.unsplash.com','pexels.com','images.pexels.com','pixabay.com','stocksnap.io','picsum.photos','placehold.co','via.placeholder.com','placekitten.com','loremflickr.com','dummyimage.com','fakeimg.pl'];
  mapped.photos = (mapped.photos as string[]).filter((p: string) => {
    if (typeof p !== 'string' || p.length <= 5) return false;
    if (p.startsWith('data:image/') && p.length > 200000) {
      console.log('[API] SKIPPED base64 photo from deal:', (mapped.id || 'unknown'), '(', (p.length / 1024).toFixed(0), 'KB — too large for API)');
      return false;
    }
    const lower = p.toLowerCase();
    for (const domain of STOCK_DOMAINS) {
      if (lower.includes(domain)) {
        console.log('[API] BLOCKED stock photo from deal:', (mapped.id || 'unknown'), p.substring(0, 60));
        return false;
      }
    }
    return true;
  });
  if (typeof mapped.partners === 'string') {
    try { mapped.partners = JSON.parse(mapped.partners as string); } catch { mapped.partners = []; }
  }
  if (typeof mapped.pool_tiers === 'string') {
    try { mapped.pool_tiers = JSON.parse(mapped.pool_tiers as string); } catch { mapped.pool_tiers = []; }
  }
  if (typeof mapped.poolTiers === 'string') {
    try { mapped.poolTiers = JSON.parse(mapped.poolTiers as string); } catch { mapped.poolTiers = []; }
  }
  if (!mapped.poolTiers && mapped.pool_tiers) mapped.poolTiers = mapped.pool_tiers;
  if (!mapped.pool_tiers && mapped.poolTiers) mapped.pool_tiers = mapped.poolTiers;
  if (mapped.display_order !== undefined && mapped.displayOrder === undefined) mapped.displayOrder = mapped.display_order;
  if (mapped.displayOrder !== undefined && mapped.display_order === undefined) mapped.display_order = mapped.displayOrder;
  return mapped;
}

app.get("/landing-deals", async (c) => {
  const { url: supabaseUrl, key: supabaseAnonKey, isValid, isJwtKey, hasServiceRole } = getSupabaseCredentials();
  const startTime = Date.now();

  console.log("[API] landing-deals request received");
  console.log("[API] Supabase URL:", supabaseUrl ? supabaseUrl.substring(0, 40) + '...' : 'NOT SET', '| Key:', supabaseAnonKey ? supabaseAnonKey.substring(0, 10) + '...' : 'NOT SET', '| Valid:', isValid, '| JWT:', isJwtKey, '| ServiceRole:', hasServiceRole);

  if (_dealCache && Date.now() - _dealCache.timestamp < DEAL_CACHE_TTL) {
    console.log(`[API] landing-deals: serving from memory cache (${_dealCache.deals.length} deals, age: ${Math.round((Date.now() - _dealCache.timestamp) / 1000)}s)`);
    return c.json({ deals: _dealCache.deals, source: 'memory_cache_' + _dealCache.source, servedAt: new Date().toISOString() });
  }

  if (!isValid) {
    console.log('[API] landing-deals: Supabase not configured or key not JWT format — serving fallback immediately');
    console.log('[API] DIAGNOSTIC: URL length:', supabaseUrl?.length || 0, '| Key length:', supabaseAnonKey?.length || 0, '| Key starts with eyJ:', supabaseAnonKey?.startsWith('eyJ'));
    _dealCache = { deals: FALLBACK_DEALS, source: 'fallback_no_credentials', timestamp: Date.now() };
    return c.json({ deals: FALLBACK_DEALS, source: "fallback_no_credentials", servedAt: new Date().toISOString() });
  }

  const mergeFallbackPhotos = async (mapped: Record<string, unknown>[]): Promise<Record<string, unknown>[]> => {
    for (const deal of mapped) {
      const photos = Array.isArray(deal.photos) ? deal.photos : [];
      if (photos.length === 0) {
        const fb = FALLBACK_DEALS.find((f) => f.id === deal.id || (f.title as string || '').toUpperCase() === ((deal.title as string || deal.name as string || '').toUpperCase()));
        if (fb && Array.isArray(fb.photos) && fb.photos.length > 0) {
          deal.photos = fb.photos;
        }
      }
      if ((Array.isArray(deal.photos) ? deal.photos : []).length === 0 && deal.id) {
        try {
          const storagePhotos = await fetchDealPhotosFromStorage(deal.id as string, supabaseUrl, supabaseAnonKey);
          if (storagePhotos.length > 0) {
            deal.photos = storagePhotos;
            console.log('[API] Populated', storagePhotos.length, 'Storage photos for deal:', deal.id);
          }
        } catch (_storageErr) {
          console.log('[API] Storage photo lookup failed for deal:', deal.id, (_storageErr as Error)?.message);
        }
      }
    }
    return mapped;
  };

  if (hasServiceRole) {
    try {
      console.log('[API] landing-deals: Using service_role admin client (bypasses RLS)');
      const admin = getSupabaseAdmin();
      let adminData: Record<string, unknown>[] | null = null;
      let adminSource = 'supabase_admin';

      const { data: pubData, error: pubErr } = await admin.from('jv_deals').select('*').eq('published', true).order('display_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
      if (!pubErr && pubData && pubData.length > 0) {
        adminData = pubData as Record<string, unknown>[];
        console.log('[API] landing-deals: admin published query OK —', pubData.length, 'deals');
      } else {
        if (pubErr) console.log('[API] landing-deals: admin published query error:', pubErr.message, '| code:', pubErr.code, '| details:', pubErr.details, '— trying without filter');
        else console.log('[API] landing-deals: admin published query returned 0 deals — trying without filter');
        const { data: allDeals, error: allErr } = await admin.from('jv_deals').select('*').order('display_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
        if (!allErr && allDeals && allDeals.length > 0) {
          adminData = allDeals as Record<string, unknown>[];
          adminSource = 'supabase_admin_all';
          console.log('[API] landing-deals: admin all-deals query OK —', allDeals.length, 'deals');
        } else if (allErr) {
          console.log('[API] landing-deals: admin all-deals query error:', allErr.message, '| code:', allErr.code, '| details:', allErr.details);
        } else {
          console.log('[API] landing-deals: admin all-deals query returned 0 deals');
        }
      }

      if (adminData && adminData.length > 0) {
        const mapped = sortDealsByDisplayOrder(await mergeFallbackPhotos(adminData.map((row: Record<string, unknown>) => mapSupabaseRow(row))));
        console.log(`[API] landing-deals: ${adminSource} returned ${mapped.length} deals in ${Date.now() - startTime}ms`);
        _dealCache = { deals: mapped, source: adminSource, timestamp: Date.now() };
        return c.json({ deals: mapped, source: adminSource, servedAt: new Date().toISOString() });
      }
    } catch (adminErr: unknown) {
      console.log('[API] landing-deals: admin client exception:', (adminErr as Error)?.message, '| stack:', (adminErr as Error)?.stack?.substring(0, 200));
    }
  } else {
    console.log('[API] landing-deals: No service_role key — skipping admin client, using REST queries');
  }

  const headers: Record<string, string> = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation",
  };

  const queries = [
    `${supabaseUrl}/rest/v1/jv_deals?select=*&order=display_order.asc.nullslast,created_at.desc.nullslast`,
    `${supabaseUrl}/rest/v1/jv_deals?select=*&published=eq.true&order=display_order.asc.nullslast,created_at.desc.nullslast`,
    `${supabaseUrl}/rest/v1/jv_deals?select=*&status=eq.active&order=display_order.asc.nullslast,created_at.desc.nullslast`,
  ];

  const queryTimeouts = [8000, 6000, 5000];

  for (let i = 0; i < queries.length; i++) {
    try {
      const timeoutMs = queryTimeouts[i] || 5000;
      console.log(`[API] landing-deals trying Supabase REST query #${i + 1} (timeout: ${timeoutMs}ms)...`);
      console.log(`[API] landing-deals query URL: ${queries[i]?.substring(0, 120)}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(queries[i] as string, { headers, signal: controller.signal });
      clearTimeout(timeout);
      console.log(`[API] landing-deals query #${i + 1} HTTP status: ${response.status} in ${Date.now() - startTime}ms`);
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.log(`[API] landing-deals query #${i + 1} failed: HTTP ${response.status}`, body.substring(0, 300));
        if (response.status === 401 || response.status === 403) {
          console.log('[API] landing-deals: Auth error (401/403) — Supabase key likely invalid or RLS blocking anon. Response:', body.substring(0, 200));
          break;
        }
        continue;
      }
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const mapped = sortDealsByDisplayOrder(await mergeFallbackPhotos(data.map((row: Record<string, unknown>) => mapSupabaseRow(row))));
        console.log(`[API] landing-deals query #${i + 1} returned ${mapped.length} deals in ${Date.now() - startTime}ms`);
        _dealCache = { deals: mapped, source: 'supabase_rest', timestamp: Date.now() };
        return c.json({ deals: mapped, source: 'supabase_rest', queryUsed: i + 1, servedAt: new Date().toISOString() });
      }
      console.log(`[API] landing-deals query #${i + 1} returned ${Array.isArray(data) ? '0 deals (empty array)' : 'non-array response: ' + JSON.stringify(data).substring(0, 100)}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      const isTimeout = message.includes('abort') || message.includes('timeout');
      console.log(`[API] landing-deals query #${i + 1} error: ${message}${isTimeout ? ' [TIMEOUT]' : ''} (elapsed: ${Date.now() - startTime}ms)`);
    }
  }

  console.log('[API] landing-deals: All REST queries failed — trying with retry after 1s delay...');
  await new Promise(resolve => setTimeout(resolve, 1000));
  try {
    const retryUrl = `${supabaseUrl}/rest/v1/jv_deals?select=*&order=created_at.desc.nullslast`;
    console.log('[API] landing-deals: RETRY attempt...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(retryUrl, { headers, signal: controller.signal });
    clearTimeout(timeout);
    console.log(`[API] landing-deals: RETRY HTTP status: ${response.status} in ${Date.now() - startTime}ms`);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const mapped = await mergeFallbackPhotos(data.map((row: Record<string, unknown>) => mapSupabaseRow(row)));
        console.log(`[API] landing-deals: RETRY returned ${mapped.length} deals in ${Date.now() - startTime}ms`);
        _dealCache = { deals: mapped, source: 'supabase_rest_retry', timestamp: Date.now() };
        return c.json({ deals: mapped, source: 'supabase_rest_retry', servedAt: new Date().toISOString() });
      }
    }
  } catch (err: unknown) {
    console.log('[API] landing-deals: RETRY error:', (err as Error)?.message);
  }

  try {
    console.log('[API] landing-deals: All direct queries exhausted — trying Edge Function...');
    const edgeFnUrl = getEdgeFunctionUrl();
    if (!edgeFnUrl) {
      console.log('[API] landing-deals: Edge Function URL not available (Supabase URL not set)');
      _dealCache = { deals: FALLBACK_DEALS, source: 'fallback', timestamp: Date.now() };
      return c.json({ deals: FALLBACK_DEALS, source: 'fallback', servedAt: new Date().toISOString() });
    }
    const efUrl = edgeFnUrl + '?owner=' + encodeURIComponent('Ivan Perez');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const efRes = await fetch(efUrl, {
      headers: {
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (efRes.ok) {
      const efData = await efRes.json() as { deals?: unknown[] };
      if (Array.isArray(efData?.deals) && efData.deals.length > 0) {
        console.log(`[API] landing-deals: Edge Function returned ${efData.deals.length} deals in ${Date.now() - startTime}ms`);
        const mapped = await mergeFallbackPhotos((efData.deals as Record<string, unknown>[]).map((row: Record<string, unknown>) => mapSupabaseRow(row)));
        _dealCache = { deals: mapped, source: 'edge_function', timestamp: Date.now() };
        return c.json({ deals: mapped, source: 'edge_function', servedAt: new Date().toISOString() });
      }
    } else {
      console.log('[API] landing-deals: Edge Function HTTP', efRes.status, await efRes.text().catch(() => ''));
    }
  } catch (err: unknown) {
    console.log('[API] landing-deals: Edge Function error:', (err as Error)?.message);
  }

  console.log(`[API] landing-deals: ALL SOURCES EXHAUSTED in ${Date.now() - startTime}ms — serving ${FALLBACK_DEALS.length} fallback deals`);
  _dealCache = { deals: FALLBACK_DEALS, source: 'fallback', timestamp: Date.now() };
  return c.json({ deals: FALLBACK_DEALS, source: "fallback", servedAt: new Date().toISOString() });
});

app.get("/landing-page", async (c) => {
  const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseCredentials();
  const apiBaseUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || "").trim().replace(/\/$/, "");

  console.log('[API] landing-page: Serving HTML with runtime credentials');

  let html = '';
  if (_readLocalFile) {
    const localPaths = [
      './ivxholding-landing/index.html',
      '../ivxholding-landing/index.html',
      'ivxholding-landing/index.html',
    ];
    for (const p of localPaths) {
      try {
        const content = _readLocalFile(p);
        if (content && content.includes('IVX Holdings')) {
          html = content;
          console.log('[API] landing-page: Loaded HTML from', p);
          break;
        }
      } catch {}
    }
  }

  if (!html) {
    try {
      console.log('[API] landing-page: Fetching HTML from ivxholding.com...');
      const res = await fetch('https://ivxholding.com', { headers: { Accept: 'text/html' } });
      if (res.ok) html = await res.text();
    } catch (err: unknown) {
      console.log('[API] landing-page: Fetch error:', (err as Error)?.message);
    }
  }

  if (!html || !html.includes('IVX Holdings')) {
    return c.text('Landing page HTML not available', 404);
  }

  html = injectLandingCredentials(html, supabaseUrl, supabaseAnonKey, apiBaseUrl);

  console.log('[API] landing-page: Served with credentials injected (' + html.length + ' bytes)');

  return c.html(html);
});

app.post("/deploy-landing", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized — admin access required' }, 401);
  }

  const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseCredentials();
  const apiBaseUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || "").trim().replace(/\/$/, "");
  const awsAccessKey = (process.env.AWS_ACCESS_KEY_ID || "").trim();
  const awsSecretKey = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();

  console.log("[API] deploy-landing request received");
  console.log("[API] Supabase configured:", !!(supabaseUrl && supabaseAnonKey));
  console.log("[API] AWS configured:", !!(awsAccessKey && awsSecretKey));

  if (!supabaseUrl || !supabaseAnonKey) {
    return c.json({ success: false, errors: ["Supabase credentials not configured"], filesUploaded: [] }, 500);
  }

  const configJson = JSON.stringify({
    supabaseUrl,
    supabaseAnonKey,
    apiBaseUrl,
    appUrl: apiBaseUrl,
    backendUrl: apiBaseUrl,
    deployedAt: new Date().toISOString(),
  }, null, 2);

  const filesUploaded: string[] = [];
  const errors: string[] = [];
  const s3Errors: string[] = [];

  if (awsAccessKey && awsSecretKey) {
    const configResult = await s3PutObject("ivx-config.json", configJson, "application/json");
    if (configResult.ok) {
      filesUploaded.push("ivx-config.json");
    } else {
      errors.push("Failed to upload ivx-config.json to S3");
    }

    try {
      let html = '';
      const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
      if (typeof body.html === 'string' && (body.html as string).length > 1000 && (body.html as string).includes('IVX Holdings')) {
        html = body.html as string;
        console.log('[API] Using HTML from POST body (' + html.length + ' bytes)');
      }
      if (!html && _readLocalFile) {
        const localPaths = [
          './ivxholding-landing/index.html',
          '../ivxholding-landing/index.html',
          'ivxholding-landing/index.html',
        ];
        for (const p of localPaths) {
          try {
            const content = _readLocalFile(p);
            if (content && content.includes('IVX Holdings')) {
              html = content;
              console.log('[API] Loaded local landing HTML from:', p, '(' + html.length + ' bytes)');
              break;
            }
          } catch {}
        }
      }
      if (!html || !html.includes('IVX Holdings')) {
        console.log("[API] Fetching current landing HTML from ivxholding.com...");
        const htmlResponse = await fetch("https://ivxholding.com", { headers: { Accept: "text/html" } });
        if (htmlResponse.ok) {
          html = await htmlResponse.text();
        }
      }
      if (html && html.includes("IVX Holdings")) {
        html = injectLandingCredentials(html, supabaseUrl, supabaseAnonKey, apiBaseUrl);

        const htmlResult = await s3PutObject("index.html", html, "text/html; charset=utf-8");
        if (htmlResult.ok) {
          filesUploaded.push("index.html");
          console.log("[API] index.html deployed with real credentials (", html.length, "bytes)");
        } else {
          errors.push("Failed to upload index.html to S3");
          if (htmlResult.error) s3Errors.push(htmlResult.error);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.log("[API] HTML deploy error:", message);
      errors.push("HTML deploy error: " + message);
    }
  } else {
    console.log("[API] AWS credentials not configured — config will be served from /landing-config only");
    errors.push("AWS credentials not configured — S3 upload skipped. Deals still served via /landing-deals and /landing-config.");
  }

  const success = filesUploaded.length > 0 || (!awsAccessKey && !!(supabaseUrl && supabaseAnonKey));
  const allErrors = [...errors, ...s3Errors];
  console.log("[API] deploy-landing complete:", success ? "SUCCESS" : "PARTIAL", "| files:", filesUploaded.join(", "), "| errors:", allErrors.length);

  return c.json({ success, filesUploaded, errors: allErrors, s3Details: s3Errors, servedAt: new Date().toISOString() });
});

app.post("/upload-landing-html", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized — admin access required' }, 401);
  }

  const { url: supabaseUrl, key: supabaseAnonKey } = getSupabaseCredentials();
  const apiBaseUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || "").trim().replace(/\/$/, "");

  console.log("[API] upload-landing-html: received request");

  const { accessKey: ulhAwsKey, secretKey: ulhAwsSecret } = getAwsCredentials();
  if (!ulhAwsKey || !ulhAwsSecret) {
    return c.json({ success: false, error: "AWS credentials not configured" }, 500);
  }

  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  let html = typeof body.html === "string" ? (body.html as string) : "";
  if (!html || html.length < 1000 || !html.includes("IVX Holdings")) {
    return c.json({ success: false, error: "HTML content required (min 1000 chars, must contain IVX Holdings)" }, 400);
  }

  console.log("[API] upload-landing-html: Got HTML from body (", html.length, "bytes)");

  html = injectLandingCredentials(html, supabaseUrl, supabaseAnonKey, apiBaseUrl);

  const uploadResult = await s3PutObject("index.html", html, "text/html; charset=utf-8");
  if (uploadResult.ok) {
    console.log("[API] upload-landing-html: index.html deployed (", html.length, "bytes)");
    return c.json({ success: true, message: "index.html deployed to S3", htmlSize: html.length, hasBanner: html.includes("app-banner-section") });
  } else {
    console.log("[API] upload-landing-html: S3 PUT failed:", uploadResult.error);
    return c.json({ success: false, error: `S3 PUT failed: ${uploadResult.error}`, details: (uploadResult.error || '').substring(0, 300) }, 500);
  }
});

app.post("/sync-landing-github", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized — admin access required' }, 401);
  }

  const githubToken = (process.env.GITHUB_TOKEN || '').trim();
  if (!githubToken) {
    return c.json({ success: false, error: 'GITHUB_TOKEN not configured' }, 500);
  }

  const REPO = GITHUB_REPO;
  const BRANCH = 'main';
  const FILE_PATH = 'ivxholding-landing/index.html';
  const API = 'https://api.github.com';

  try {
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const htmlContent = (body.html as string) || '';
    if (!htmlContent || htmlContent.length < 1000) {
      return c.json({ success: false, error: 'HTML content required (min 1000 chars)' }, 400);
    }

    console.log('[API] sync-landing-github: Pushing', htmlContent.length, 'bytes to', REPO);

    const ghHeaders = {
      'Authorization': `token ${githubToken}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'IVX-Landing-Deploy',
    };

    const existingRes = await fetch(`${API}/repos/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`, { headers: ghHeaders });
    let sha = '';
    if (existingRes.ok) {
      const existing = await existingRes.json() as Record<string, unknown>;
      sha = (existing.sha as string) || '';
    }

    const base64Content = btoa(unescape(encodeURIComponent(htmlContent)));
    const putBody: Record<string, unknown> = {
      message: `Deploy landing page v7 - Casa Rosario live [${new Date().toISOString()}]`,
      content: base64Content,
      branch: BRANCH,
    };
    if (sha) putBody.sha = sha;

    const putRes = await fetch(`${API}/repos/${REPO}/contents/${FILE_PATH}`, {
      method: 'PUT',
      headers: ghHeaders,
      body: JSON.stringify(putBody),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      console.log('[API] sync-landing-github: GitHub PUT failed:', putRes.status, errText.substring(0, 500));
      return c.json({ success: false, error: `GitHub API error: HTTP ${putRes.status}`, details: errText.substring(0, 300) }, 500);
    }

    const result = await putRes.json() as Record<string, unknown>;
    console.log('[API] sync-landing-github: SUCCESS — pushed to', REPO);
    return c.json({ success: true, sha: (result.content as Record<string, unknown>)?.sha, message: 'Pushed to GitHub — deployment will auto-sync' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.log('[API] sync-landing-github: Error:', message);
    return c.json({ success: false, error: message }, 500);
  }
});

app.get("/db-setup", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized — admin access required' }, 401);
  }

  const { url: supabaseUrl, key: supabaseAnonKey, isValid, hasServiceRole } = getSupabaseCredentials();

  if (!isValid) {
    return c.json({ success: false, error: 'Supabase not configured' }, 500);
  }

  const checks: Record<string, unknown> = {};
  checks.serviceRoleConfigured = hasServiceRole;

  const useAdmin = hasServiceRole;
  let adminClient: ReturnType<typeof getSupabaseAdmin> | null = null;
  if (useAdmin) {
    try { adminClient = getSupabaseAdmin(); } catch {}
  }

  const sbHeaders: Record<string, string> = {
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${supabaseAnonKey}`,
    'Content-Type': 'application/json',
  };

  try {
    console.log('[API] db-setup: Running verification...', useAdmin ? '(using service_role)' : '(using anon key)');

    if (adminClient) {
      const { data: rpcData, error: rpcErr } = await adminClient.rpc('db_verify');
      if (!rpcErr) {
        console.log('[API] db-setup: db_verify RPC result:', JSON.stringify(rpcData).substring(0, 500));
        checks.db_verify = rpcData;
      } else {
        console.log('[API] db-setup: db_verify RPC error:', rpcErr.message);
        checks.db_verify = { error: rpcErr.message };
      }
    } else {
      const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/db_verify`, {
        method: 'POST',
        headers: sbHeaders,
        body: '{}',
      });
      if (rpcRes.ok) {
        const rpcData = await rpcRes.json();
        console.log('[API] db-setup: db_verify RPC result:', JSON.stringify(rpcData).substring(0, 500));
        checks.db_verify = rpcData;
      } else {
        const rpcErr = await rpcRes.text();
        console.log('[API] db-setup: db_verify RPC not available:', rpcRes.status, rpcErr.substring(0, 200));
        checks.db_verify = { error: 'RPC not found', status: rpcRes.status };
      }
    }

    const testTables = ['jv_deals', 'landing_deals', 'audit_trail', 'waitlist', 'landing_analytics', 'profiles', 'wallets'];
    const tableResults: Record<string, unknown> = {};
    for (const table of testTables) {
      try {
        if (adminClient) {
          const { data, error } = await adminClient.from(table).select('id').limit(1);
          if (!error) {
            tableResults[table] = { exists: true, rows: Array.isArray(data) ? data.length : 0 };
          } else {
            tableResults[table] = { exists: false, error: error.message };
          }
          continue;
        }
        const r = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id&limit=1`, { headers: sbHeaders });
        const body = await r.text();
        if (r.ok) {
          const data = JSON.parse(body);
          tableResults[table] = { exists: true, rows: Array.isArray(data) ? data.length : 0 };
        } else {
          tableResults[table] = { exists: false, error: body.substring(0, 150) };
        }
      } catch (err: unknown) {
        tableResults[table] = { exists: false, error: (err as Error)?.message };
      }
    }
    checks.tables = tableResults;

    const colTest = await fetch(`${supabaseUrl}/rest/v1/jv_deals?select=id,title,status,published,"totalInvestment","expectedROI",photos,city,state&limit=5`, { headers: sbHeaders });
    if (colTest.ok) {
      const deals = await colTest.json();
      checks.jv_deals_data = { columns_ok: true, deals };
    } else {
      const colErr = await colTest.text();
      checks.jv_deals_data = { columns_ok: false, error: colErr.substring(0, 200), fix: 'Run supabase-definitive-fix.sql in Supabase SQL Editor' };
    }

    const allOk = Object.values(tableResults).every((t: unknown) => (t as Record<string, unknown>)?.exists === true);
    checks.overall_status = allOk ? 'ALL_TABLES_READY' : 'NEEDS_FIX';
    checks.fix_instructions = allOk ? 'Database is ready!' : 'Go to Supabase Dashboard > SQL Editor > New Query > Paste supabase-definitive-fix.sql > Click Run';

    return c.json({ success: true, checks, timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    return c.json({ success: false, error: (err as Error)?.message, checks }, 500);
  }
});

app.post("/auto-deploy-tables", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized — admin access required' }, 401);
  }

  const { hasServiceRole } = getSupabaseCredentials();
  if (!hasServiceRole) {
    return c.json({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
  }

  try {
    const adminClient = getSupabaseAdmin();
    console.log('[AUTO-DEPLOY] Starting automatic table deployment...');

    const ALL_TABLES = [
      'jv_deals', 'landing_deals', 'audit_trail', 'waitlist',
      'profiles', 'wallets', 'holdings', 'transactions', 'notifications',
      'analytics_events', 'analytics_dashboard', 'analytics_kpi',
      'analytics_retention', 'analytics_investments',
      'system_health', 'system_metrics', 'staff_activity', 'staff_activity_log',
      'signups', 'applications', 'ai_brain_status',
      'auto_repair_scans', 'repair_logs',
      'ipx_holdings', 'ipx_purchases',
      'earn_accounts', 'earn_deposits', 'earn_payouts',
      'kyc_verifications', 'kyc_documents',
      'referrals', 'referral_invites',
      'sms_reports', 'sms_messages',
      'lender_sync_stats', 'lender_sync_config', 'synced_lenders',
      'lender_sync_jobs', 'imported_lenders',
      'orders', 'support_tickets', 'influencer_applications', 'push_tokens',
      'properties', 'market_data', 'market_index',
      'image_registry', 'app_config', 'landing_analytics',
      'retargeting_dashboard', 'audience_segments', 'ad_pixels',
      'utm_analytics', 'search_discovery', 're_engagement_triggers',
      'engagement_scoring', 'emails',
    ];

    const existing: string[] = [];
    const missing: string[] = [];

    for (const table of ALL_TABLES) {
      try {
        const { error } = await adminClient.from(table).select('*', { count: 'exact', head: true });
        if (error && (error.message || '').toLowerCase().includes('does not exist')) {
          missing.push(table);
        } else {
          existing.push(table);
        }
      } catch {
        missing.push(table);
      }
    }

    console.log('[AUTO-DEPLOY] Existing:', existing.length, '| Missing:', missing.length);

    if (missing.length === 0) {
      return c.json({
        success: true,
        message: 'All tables exist — no deployment needed',
        existing: existing.length,
        missing: 0,
        tables_missing: [],
        timestamp: new Date().toISOString(),
      });
    }

    const { data: rpcResult, error: rpcError } = await adminClient.rpc('auto_setup_all_tables');

    if (!rpcError && rpcResult) {
      console.log('[AUTO-DEPLOY] RPC auto_setup_all_tables succeeded:', JSON.stringify(rpcResult).substring(0, 300));
      return c.json({
        success: true,
        message: 'Tables deployed via RPC',
        rpc_result: rpcResult,
        missing_before: missing,
        timestamp: new Date().toISOString(),
      });
    }

    console.log('[AUTO-DEPLOY] RPC not available:', rpcError?.message, '— returning missing tables for manual setup');
    return c.json({
      success: false,
      message: 'Tables missing — run supabase-master.sql in Supabase SQL Editor',
      existing: existing.length,
      missing: missing.length,
      tables_missing: missing,
      instructions: 'Go to Admin > Supabase SQL > Copy MASTER SETUP > Paste in Supabase SQL Editor > Run',
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    console.log('[AUTO-DEPLOY] Error:', (err as Error)?.message);
    return c.json({ success: false, error: (err as Error)?.message }, 500);
  }
});

app.post("/deploy-sql", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized — admin access required' }, 401);
  }

  const { hasServiceRole } = getSupabaseCredentials();
  if (!hasServiceRole) {
    return c.json({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
  }

  let body: { sql?: string; scriptId?: string; scriptName?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const sql = (body.sql || '').trim();
  if (!sql) {
    return c.json({ success: false, error: 'No SQL provided' }, 400);
  }

  if (sql.length > 500_000) {
    return c.json({ success: false, error: 'SQL too large (max 500KB)' }, 400);
  }

  const scriptId = body.scriptId || 'unknown';
  const scriptName = body.scriptName || 'unknown';
  console.log(`[DEPLOY-SQL] Deploying script: ${scriptName} (${scriptId}) — ${sql.length} chars`);

  try {
    const adminClient = getSupabaseAdmin();

    const { data: rpcData, error: rpcError } = await adminClient.rpc('ivx_exec_sql', { sql_text: sql });

    if (!rpcError) {
      console.log(`[DEPLOY-SQL] SUCCESS via RPC — script: ${scriptName}`);
      return c.json({
        success: true,
        method: 'rpc',
        scriptId,
        scriptName,
        result: rpcData,
        timestamp: new Date().toISOString(),
      });
    }

    const rpcMsg = (rpcError.message || '').toLowerCase();
    if (rpcMsg.includes('could not find the function') || rpcMsg.includes('does not exist')) {
      console.log('[DEPLOY-SQL] ivx_exec_sql function not found — bootstrap required');
      return c.json({
        success: false,
        error: 'BOOTSTRAP_REQUIRED',
        message: 'The ivx_exec_sql function does not exist in your database. Run the Bootstrap script first from Admin > Supabase SQL.',
        scriptId,
        timestamp: new Date().toISOString(),
      }, 400);
    }

    console.log(`[DEPLOY-SQL] RPC error for ${scriptName}:`, rpcError.message);
    return c.json({
      success: false,
      error: rpcError.message,
      scriptId,
      scriptName,
      timestamp: new Date().toISOString(),
    }, 500);
  } catch (err: unknown) {
    console.log('[DEPLOY-SQL] Exception:', (err as Error)?.message);
    return c.json({ success: false, error: (err as Error)?.message }, 500);
  }
});

app.post("/deploy-sql-check", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const { hasServiceRole } = getSupabaseCredentials();
  if (!hasServiceRole) {
    return c.json({ ready: false, reason: 'no_service_role' });
  }

  try {
    const adminClient = getSupabaseAdmin();
    const { error } = await adminClient.rpc('ivx_exec_sql', { sql_text: 'SELECT 1' });
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('could not find the function') || msg.includes('does not exist')) {
        return c.json({ ready: false, reason: 'bootstrap_required' });
      }
      return c.json({ ready: false, reason: 'rpc_error', error: error.message });
    }
    return c.json({ ready: true, reason: 'ok' });
  } catch (err: unknown) {
    return c.json({ ready: false, reason: 'exception', error: (err as Error)?.message });
  }
});

app.post("/deploy-html", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized — admin access required' }, 401);
  }

  const awsAccessKey = (process.env.AWS_ACCESS_KEY_ID || "").trim();
  const awsSecretKey = (process.env.AWS_SECRET_ACCESS_KEY || "").trim();
  const awsRegion = (process.env.AWS_REGION || "us-east-1").trim();

  if (!awsAccessKey || !awsSecretKey) {
    return c.json({ success: false, error: "AWS credentials not configured" }, 500);
  }

  let body: { html?: string; key?: string } = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const html = body.html || "";
  const key = body.key || "index.html";

  if (!html || html.length < 500) {
    return c.json({ success: false, error: "HTML content too short or missing" }, 400);
  }

  console.log(`[API] deploy-html: Uploading ${key} (${html.length} bytes) to S3`);

  const encoder = new TextEncoder();
  const toHex = (buf: ArrayBuffer): string => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");

  const bucket = S3_BUCKET;
  const now = new Date();
  const iso = now.toISOString();
  const amzDate = iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.substring(0, 8);
  const usePathStyle = bucket.includes('.');
  const s3Host = usePathStyle
    ? (awsRegion === 'us-east-1' ? 's3.amazonaws.com' : `s3.${awsRegion}.amazonaws.com`)
    : `${bucket}.s3.${awsRegion}.amazonaws.com`;
  const canonicalUri = usePathStyle ? `/${bucket}/${key}` : `/${key}`;
  const url = `https://${s3Host}${canonicalUri}`;
  const contentType = key.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8';

  const payloadHash = toHex(await crypto.subtle.digest("SHA-256", encoder.encode(html)));
  const canonicalHeaders = `content-type:${contentType}\nhost:${s3Host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const canonicalHash = toHex(await crypto.subtle.digest("SHA-256", encoder.encode(canonicalRequest)));
  const credentialScope = `${dateStamp}/${awsRegion}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalHash}`;

  const hmac = async (k: ArrayBuffer | Uint8Array, msg: string): Promise<ArrayBuffer> => {
    const keyBytes = new Uint8Array(k instanceof Uint8Array ? k : k);
    const ck = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", ck, encoder.encode(msg));
  };

  const secretBytes = encoder.encode("AWS4" + awsSecretKey);
  const kDate = await hmac(secretBytes, dateStamp);
  const kRegion = await hmac(kDate, awsRegion);
  const kService = await hmac(kRegion, "s3");
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${awsAccessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        "Authorization": authorization,
      },
      body: html,
    });

    if (response.ok || response.status === 200) {
      console.log(`[API] deploy-html: ${key} uploaded (${html.length} bytes)`);
      return c.json({ success: true, key, size: html.length, servedAt: new Date().toISOString() });
    }

    const errText = await response.text().catch(() => "");
    console.log(`[API] deploy-html: ${key} upload failed: HTTP ${response.status}`, errText.substring(0, 300));
    return c.json({ success: false, error: `S3 upload failed: HTTP ${response.status}`, details: errText.substring(0, 300) });
  } catch (err: unknown) {
    console.log(`[API] deploy-html: Exception:`, (err as Error)?.message);
    return c.json({ success: false, error: (err as Error)?.message || "Upload failed" });
  }
});

app.post("/send-email", async (c) => {
  const auth = await verifyAnyAuth(c.req.header('Authorization'));
  if (!auth.authenticated) {
    console.log('[EMAIL] Unauthorized send-email attempt — no valid token');
    return c.json({ success: false, error: 'Authentication required to send emails. Please log in first.' }, 401);
  }
  console.log(`[EMAIL] Authenticated user: ${auth.userId || 'unknown'} role: ${auth.role || 'unknown'}`);

  const { accessKey: awsAccessKey, secretKey: awsSecretKey, region: awsRegion } = getAwsCredentials();

  if (!awsAccessKey || !awsSecretKey) {
    console.log('[EMAIL] AWS credentials not configured');
    return c.json({ success: false, error: 'AWS credentials not configured — cannot send via SES' }, 500);
  }

  let body: {
    from?: string;
    fromName?: string;
    to: string;
    cc?: string;
    bcc?: string;
    subject: string;
    body: string;
    replyTo?: string;
    attachments?: Array<{ name: string; mimeType: string; base64Data: string }>;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  if (!body.to || !body.subject) {
    return c.json({ success: false, error: 'Missing required fields: to, subject' }, 400);
  }

  const senderEmail = (body.from || 'noreply@ivxholding.com').trim();
  const senderName = (body.fromName || 'IVX Holdings').trim();

  const rateKey = senderEmail.toLowerCase();
  const rateCheck = checkEmailRateLimit(rateKey);
  if (!rateCheck.allowed) {
    console.log(`[EMAIL] Rate limit exceeded for ${rateKey}. Resets in ${Math.round(rateCheck.resetInMs / 1000)}s`);
    return c.json({
      success: false,
      error: `Rate limit exceeded — max ${EMAIL_RATE_LIMIT_MAX} emails per minute. Try again in ${Math.ceil(rateCheck.resetInMs / 1000)} seconds.`,
      retryAfterMs: rateCheck.resetInMs,
    }, 429);
  }

  const safeName = senderName.replace(/[^a-zA-Z0-9 .\u002D]/g, '').trim() || 'IVX Holdings';

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const toAddressesPre = body.to.split(',').map((e: string) => e.trim()).filter(Boolean);
  const invalidRecipients = toAddressesPre.filter(e => !emailRegex.test(e));
  if (invalidRecipients.length > 0) {
    return c.json({ success: false, error: `Invalid email address(es): ${invalidRecipients.join(', ')}` }, 400);
  }
  if (!emailRegex.test(senderEmail)) {
    return c.json({ success: false, error: `Invalid sender email: ${senderEmail}` }, 400);
  }
  const fromField = `"${safeName}" <${senderEmail}>`;

  console.log(`[EMAIL] Sending via AWS SES: ${senderEmail} -> ${body.to} | Subject: ${body.subject} | Remaining: ${rateCheck.remaining}`);

  const toAddresses = toAddressesPre;
  const ccAddresses = body.cc ? body.cc.split(',').map((e: string) => e.trim()).filter(Boolean) : [];
  const bccAddresses = body.bcc ? body.bcc.split(',').map((e: string) => e.trim()).filter(Boolean) : [];

  const sanitizedBody = body.body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
  const htmlBody = sanitizedBody.replace(/\n/g, '<br/>');
  const professionalHtml = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,address=no,email=no,date=no,url=no">
<title>IVX Holdings</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>*{margin:0;padding:0;box-sizing:border-box;}body{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}img{border:0;height:auto;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}a{color:#FFD700;text-decoration:none;}@media only screen and (max-width:620px){.email-container{width:100%!important;max-width:100%!important;}.content-pad{padding:24px 20px!important;}.header-pad{padding:20px!important;}.footer-pad{padding:16px 20px!important;}}</style>
</head>
<body style="margin:0;padding:0;word-spacing:normal;background-color:#0A0A0A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<div role="article" aria-roledescription="email" lang="en" style="text-size-adjust:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0A;">
<tr><td style="padding:40px 16px;" align="center">
<table role="presentation" class="email-container" width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

<!-- HEADER -->
<tr><td class="header-pad" style="background-color:#111111;padding:28px 36px;border-radius:16px 16px 0 0;border-bottom:1px solid #1E1E1E;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr>
<td style="text-align:left;vertical-align:middle;">
<span style="color:#FFD700;font-size:24px;font-weight:800;letter-spacing:2px;line-height:1;">IVX</span><span style="color:#FFFFFF;font-size:24px;font-weight:300;letter-spacing:2px;line-height:1;"> HOLDINGS</span>
</td>
<td style="text-align:right;vertical-align:middle;">
<span style="display:inline-block;background-color:#FFD700;color:#0A0A0A;font-size:9px;font-weight:700;letter-spacing:1.5px;padding:4px 10px;border-radius:4px;text-transform:uppercase;">Enterprise</span>
</td>
</tr>
</table>
</td></tr>

<!-- GOLD ACCENT LINE -->
<tr><td style="height:2px;background:linear-gradient(90deg,#FFD700 0%,#B8860B 50%,#FFD700 100%);font-size:0;line-height:0;">&nbsp;</td></tr>

<!-- BODY -->
<tr><td class="content-pad" style="background-color:#141414;padding:36px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td>
<p style="margin:0 0 6px;font-size:12px;color:#6A6A6A;letter-spacing:0.3px;">From: ${senderName} &lt;${senderEmail}&gt;</p>
<h1 style="margin:0 0 28px;font-size:22px;color:#FFFFFF;font-weight:600;line-height:1.35;letter-spacing:-0.3px;">${(body.subject || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')}</h1>
<div style="font-size:15px;color:#CCCCCC;line-height:1.75;letter-spacing:0.1px;">${htmlBody}</div>
</td></tr>
</table>
</td></tr>

<!-- SIGNATURE -->
<tr><td class="content-pad" style="background-color:#141414;padding:0 36px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="border-top:1px solid #2A2A2A;padding-top:24px;">
<table role="presentation" cellpadding="0" cellspacing="0">
<tr>
<td style="width:4px;background-color:#FFD700;border-radius:2px;" valign="top">&nbsp;</td>
<td style="padding-left:16px;">
<p style="margin:0 0 3px;font-size:15px;font-weight:600;color:#FFFFFF;">${senderName}</p>
<p style="margin:0 0 3px;font-size:13px;color:#9A9A9A;">${senderEmail}</p>
<p style="margin:0 0 8px;font-size:12px;color:#FFD700;font-weight:500;">IVX Holdings Ltd.</p>
<p style="margin:0;font-size:11px;color:#6A6A6A;">1001 Brickell Bay Drive, Suite 2700, Miami, FL 33131</p>
<p style="margin:4px 0 0;font-size:11px;color:#6A6A6A;"><a href="tel:+15616443503" style="color:#6A6A6A;text-decoration:none;">+1 (561) 644-3503</a> &nbsp;|&nbsp; <a href="https://ivxholding.com" style="color:#FFD700;text-decoration:none;">ivxholding.com</a></p>
</td>
</tr>
</table>
</td></tr>
</table>
</td></tr>

<!-- FOOTER -->
<tr><td class="footer-pad" style="background-color:#0F0F0F;padding:24px 36px;border-radius:0 0 16px 16px;border-top:1px solid #1E1E1E;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="text-align:center;">
<p style="margin:0 0 8px;font-size:11px;color:#6A6A6A;line-height:1.5;">IVX Holdings Ltd. &nbsp;&bull;&nbsp; Global Real Estate Investment Platform</p>
<p style="margin:0 0 8px;font-size:11px;">
<a href="https://ivxholding.com" style="color:#FFD700;text-decoration:none;font-weight:500;">ivxholding.com</a>
&nbsp;&nbsp;&bull;&nbsp;&nbsp;
<a href="mailto:support@ivxholding.com" style="color:#9A9A9A;text-decoration:none;">support@ivxholding.com</a>
</p>
<p style="margin:0 0 12px;font-size:10px;color:#4A4A4A;">Secured by AWS SES &nbsp;&bull;&nbsp; DKIM Authenticated &nbsp;&bull;&nbsp; AES-256 Encrypted</p>
<p style="margin:0;font-size:9px;color:#3A3A3A;line-height:1.6;">This email is confidential and intended solely for the addressed recipient. If received in error, please notify the sender and delete immediately. &copy; ${new Date().getFullYear()} IVX Holdings Ltd. All rights reserved.</p>
</td></tr>
</table>
</td></tr>

</table>
</td></tr>
</table>
</div>
</body>
</html>`;

  const hasAttachments = body.attachments && body.attachments.length > 0;

  // --- PRE-SEND: Check sandbox mode & verify all recipients ---
  const allRecipients = [...toAddresses, ...ccAddresses, ...bccAddresses];
  const quotaCheckParams = new URLSearchParams();
  const quotaCheckResult = await sesApiCall('GetSendQuota', quotaCheckParams, 1);
  const isSandbox = quotaCheckResult.ok && quotaCheckResult.body.includes('<Max24HourSend>200');

  if (isSandbox) {
    console.log('[EMAIL] SES is in SANDBOX mode — checking all recipient verifications before sending');
    const unverifiedBeforeSend: string[] = [];
    const verifyCheckParams = new URLSearchParams();
    const allToCheck = [senderEmail, ...allRecipients];
    allToCheck.forEach((addr, i) => {
      verifyCheckParams.append(`Identities.member.${i + 1}`, addr);
    });
    const verifyCheckResult = await sesApiCall('GetIdentityVerificationAttributes', verifyCheckParams, 1);

    for (const addr of allToCheck) {
      const isAddrVerified = verifyCheckResult.body.includes(addr) && verifyCheckResult.body.includes('<VerificationStatus>Success</VerificationStatus>');
      if (!isAddrVerified) {
        const singleCheckParams = new URLSearchParams();
        singleCheckParams.append('Identities.member.1', addr);
        const singleResult = await sesApiCall('GetIdentityVerificationAttributes', singleCheckParams, 1);
        const singleVerified = singleResult.ok && singleResult.body.includes('<VerificationStatus>Success</VerificationStatus>');
        if (!singleVerified) {
          unverifiedBeforeSend.push(addr);
        }
      }
    }

    if (unverifiedBeforeSend.length > 0) {
      console.log(`[EMAIL] Sandbox: unverified addresses found: ${unverifiedBeforeSend.join(', ')}`);
      for (const addr of unverifiedBeforeSend) {
        const vp = new URLSearchParams();
        vp.append('EmailAddress', addr);
        const vr = await sesApiCall('VerifyEmailIdentity', vp, 1);
        console.log(`[EMAIL] Auto-verify sent to ${addr}: ${vr.ok ? 'success' : 'failed'}`);
      }
      return c.json({
        success: false,
        error: `SES is in Sandbox mode. The following addresses must be verified before sending: ${unverifiedBeforeSend.join(', ')}. Verification emails have been sent — check each inbox and click the confirmation link.`,
        sandboxMode: true,
        unverifiedAddresses: unverifiedBeforeSend,
        fix: [
          ...unverifiedBeforeSend.map(e => `Check ${e} inbox for AWS verification email and click the link`),
          'Or request SES Production Access in AWS Console → SES → Account Dashboard → Request Production Access',
        ],
      }, 400);
    }
    console.log('[EMAIL] Sandbox mode: all sender + recipients verified — proceeding to send');
  }

  let result: { ok: boolean; status: number; body: string };

  if (hasAttachments) {
    // --- SendRawEmail with MIME encoding for attachments ---
    console.log(`[EMAIL] Using SendRawEmail (MIME) — ${body.attachments!.length} attachment(s)`);
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).substring(2)}`;
    const mimeParts: string[] = [];

    mimeParts.push(`From: ${fromField}`);
    mimeParts.push(`To: ${toAddresses.join(', ')}`);
    if (ccAddresses.length > 0) mimeParts.push(`Cc: ${ccAddresses.join(', ')}`);
    mimeParts.push(`Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(body.subject)))}?=`);
    mimeParts.push('MIME-Version: 1.0');
    mimeParts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    if (body.replyTo) mimeParts.push(`Reply-To: ${body.replyTo}`);
    mimeParts.push('');
    mimeParts.push(`--${boundary}`);
    mimeParts.push('Content-Type: multipart/alternative; boundary="alt_boundary"');
    mimeParts.push('');

    mimeParts.push('--alt_boundary');
    mimeParts.push('Content-Type: text/plain; charset=UTF-8');
    mimeParts.push('Content-Transfer-Encoding: quoted-printable');
    mimeParts.push('');
    mimeParts.push(body.body);
    mimeParts.push('');

    mimeParts.push('--alt_boundary');
    mimeParts.push('Content-Type: text/html; charset=UTF-8');
    mimeParts.push('Content-Transfer-Encoding: quoted-printable');
    mimeParts.push('');
    mimeParts.push(professionalHtml);
    mimeParts.push('');
    mimeParts.push('--alt_boundary--');

    for (const att of body.attachments!) {
      const attMimeType = att.mimeType || 'application/octet-stream';
      const safeFileName = att.name.replace(/[^a-zA-Z0-9._\-\s]/g, '_');
      mimeParts.push('');
      mimeParts.push(`--${boundary}`);
      mimeParts.push(`Content-Type: ${attMimeType}; name="${safeFileName}"`);
      mimeParts.push('Content-Transfer-Encoding: base64');
      mimeParts.push(`Content-Disposition: attachment; filename="${safeFileName}"`);
      mimeParts.push('');
      let b64 = att.base64Data;
      if (b64.includes(',')) {
        b64 = b64.split(',')[1];
      }
      const chunkSize = 76;
      for (let i = 0; i < b64.length; i += chunkSize) {
        mimeParts.push(b64.substring(i, i + chunkSize));
      }
    }

    mimeParts.push('');
    mimeParts.push(`--${boundary}--`);

    const rawMessage = mimeParts.join('\r\n');
    const rawBase64 = btoa(unescape(encodeURIComponent(rawMessage)));

    const rawParams = new URLSearchParams();
    rawParams.append('RawMessage.Data', rawBase64);
    bccAddresses.forEach((addr: string, i: number) => {
      rawParams.append(`Destinations.member.${toAddresses.length + ccAddresses.length + i + 1}`, addr);
    });

    result = await sesApiCall('SendRawEmail', rawParams, 2);
    console.log(`[EMAIL] SendRawEmail result: ok=${result.ok} status=${result.status}`);
  } else {
    // --- Standard SendEmail (no attachments) ---
    const params = new URLSearchParams();
    params.append('Source', fromField);
    params.append('Message.Subject.Data', body.subject);
    params.append('Message.Subject.Charset', 'UTF-8');
    params.append('Message.Body.Text.Data', body.body);
    params.append('Message.Body.Text.Charset', 'UTF-8');
    params.append('Message.Body.Html.Data', professionalHtml);
    params.append('Message.Body.Html.Charset', 'UTF-8');

    toAddresses.forEach((addr: string, i: number) => {
      params.append(`Destination.ToAddresses.member.${i + 1}`, addr);
    });
    ccAddresses.forEach((addr: string, i: number) => {
      params.append(`Destination.CcAddresses.member.${i + 1}`, addr);
    });
    bccAddresses.forEach((addr: string, i: number) => {
      params.append(`Destination.BccAddresses.member.${i + 1}`, addr);
    });

    if (body.replyTo) {
      params.append('ReplyToAddresses.member.1', body.replyTo);
    }

    result = await sesApiCall('SendEmail', params, 2);
    console.log(`[EMAIL] SendEmail result: ok=${result.ok} status=${result.status}`);
  }

  if (result.ok) {
    const messageIdMatch = result.body.match(/<MessageId>([^<]+)<\/MessageId>/);
    const messageId = messageIdMatch ? messageIdMatch[1] : 'unknown';
    console.log(`[EMAIL] Email sent successfully via AWS SES. MessageId: ${messageId}`);

    const { hasServiceRole } = getSupabaseCredentials();
    if (hasServiceRole) {
      try {
        const emailId = `email-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const admin = getSupabaseAdmin();
        const { error: storeError } = await admin.from('emails').upsert({
          id: emailId,
          account_id: auth.userId || 'admin',
          folder: 'sent',
          from_name: safeName,
          from_email: senderEmail,
          to_recipients: JSON.stringify(toAddresses.map((e: string) => ({ email: e, name: '' }))),
          cc_recipients: ccAddresses.length > 0 ? JSON.stringify(ccAddresses.map((e: string) => ({ email: e, name: '' }))) : null,
          subject: body.subject,
          body: body.body,
          email_date: new Date().toISOString(),
          is_read: true,
          is_starred: false,
          is_flagged: false,
          has_attachments: hasAttachments || false,
          priority: 'normal',
          ses_message_id: messageId,
        });
        if (storeError) {
          console.log(`[EMAIL] Store to DB failed (non-critical): ${storeError.message}`);
        } else {
          console.log(`[EMAIL] Stored in DB: ${emailId}`);
        }
      } catch (storeErr) {
        console.log(`[EMAIL] Store error (non-critical): ${(storeErr as Error)?.message}`);
      }
    }

    return c.json({ success: true, messageId, provider: 'aws_ses', region: awsRegion, rateLimitRemaining: rateCheck.remaining });
  } else {
    const errorMatch = result.body.match(/<Message>([^<]+)<\/Message>/);
    const errorMessage = errorMatch ? errorMatch[1] : `SES error HTTP ${result.status}`;
    console.log(`[EMAIL] SES send failed: ${errorMessage}`);
    console.log(`[EMAIL] SES full response: ${result.body.substring(0, 500)}`);

    if (result.body.includes('MessageRejected') || result.body.includes('not verified')) {
      console.log(`[EMAIL] SENDER NOT VERIFIED — attempting auto-verify for ${senderEmail}`);
      const verifyParams = new URLSearchParams();
      verifyParams.append('EmailAddress', senderEmail);
      const verifyResult = await sesApiCall('VerifyEmailIdentity', verifyParams, 1);
      console.log(`[EMAIL] Auto-verify request for ${senderEmail}: ${verifyResult.ok ? 'sent' : 'failed'}`);

      const recipientEmails = toAddresses;
      const unverifiedRecipients: string[] = [];
      for (const recipientEmail of recipientEmails) {
        const checkParams = new URLSearchParams();
        checkParams.append('Identities.member.1', recipientEmail);
        const checkResult = await sesApiCall('GetIdentityVerificationAttributes', checkParams, 1);
        const isVerified = checkResult.ok && checkResult.body.includes('<VerificationStatus>Success</VerificationStatus>');
        if (!isVerified) {
          unverifiedRecipients.push(recipientEmail);
          const verRecipientParams = new URLSearchParams();
          verRecipientParams.append('EmailAddress', recipientEmail);
          const verRecipientResult = await sesApiCall('VerifyEmailIdentity', verRecipientParams, 1);
          console.log(`[EMAIL] Auto-verify recipient ${recipientEmail}: ${verRecipientResult.ok ? 'verification email sent' : 'failed'}`);
        }
      }

      const domainVerifyParams = new URLSearchParams();
      domainVerifyParams.append('Domain', 'ivxholding.com');
      const domainResult = await sesApiCall('VerifyDomainIdentity', domainVerifyParams, 1);
      let domainToken = '';
      if (domainResult.ok) {
        const tokenMatch = domainResult.body.match(/<VerificationToken>([^<]+)<\/VerificationToken>/);
        domainToken = tokenMatch ? tokenMatch[1] : '';
        console.log(`[EMAIL] Domain verification token for ivxholding.com: ${domainToken}`);
      }

      return c.json({
        success: false,
        error: `Email identity not verified in SES (${awsRegion}). Auto-verification emails have been sent.`,
        sesError: errorMessage,
        provider: 'aws_ses',
        autoVerify: {
          senderVerificationSent: verifyResult.ok,
          senderEmail,
          unverifiedRecipients,
          recipientVerificationsSent: unverifiedRecipients.length,
          domainVerificationToken: domainToken || undefined,
        },
        fix: [
          `1. Check ${senderEmail} inbox for AWS verification email and click the link`,
          ...unverifiedRecipients.map(e => `2. Check ${e} inbox for AWS verification email and click the link (sandbox mode)`),
          domainToken ? `3. Add TXT record _amazonses.ivxholding.com = ${domainToken} to DNS for domain verification` : '',
          `4. Or request SES Production Access in AWS Console to skip recipient verification`,
        ].filter(Boolean),
      }, 400);
    }

    if (result.body.includes('AccessDenied') || result.body.includes('not authorized')) {
      return c.json({
        success: false,
        error: 'AWS IAM user does not have SES permissions. Add AmazonSESFullAccess policy.',
        sesError: errorMessage,
        provider: 'aws_ses',
      }, 403);
    }

    return c.json({ success: false, error: errorMessage, provider: 'aws_ses' }, 500);
  }
});

app.get("/ses-status", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized — admin access required' }, 401);
  }
  const { accessKey, region } = getAwsCredentials();

  if (!accessKey) {
    return c.json({
      configured: false,
      error: 'AWS credentials not set',
      fix: 'Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION to environment variables',
    });
  }

  const params = new URLSearchParams();
  const result = await sesApiCall('GetSendQuota', params, 1);

  if (result.ok) {
    const max24Match = result.body.match(/<Max24HourSend>([^<]+)</);
    const sent24Match = result.body.match(/<SentLast24Hours>([^<]+)</);
    const maxRateMatch = result.body.match(/<MaxSendRate>([^<]+)</);

    const max24 = max24Match ? parseFloat(max24Match[1]) : 0;
    const isSandbox = max24 <= 200;

    return c.json({
      configured: true,
      provider: 'aws_ses',
      region,
      quota: {
        max24Hour: max24,
        sentLast24Hours: sent24Match ? parseFloat(sent24Match[1]) : 0,
        maxSendRate: maxRateMatch ? parseFloat(maxRateMatch[1]) : 0,
      },
      sandboxMode: isSandbox,
      status: 'active',
      timestamp: new Date().toISOString(),
    });
  } else {
    const errorMatch = result.body.match(/<Message>([^<]+)<\/Message>/);
    return c.json({
      configured: true,
      provider: 'aws_ses',
      region,
      status: 'error',
      error: errorMatch ? errorMatch[1] : `HTTP ${result.status}`,
      fix: 'Ensure IAM user has AmazonSESFullAccess policy and SES is enabled in ' + region,
    });
  }
});

app.post("/store-email", async (c) => {
  const auth = await verifyAnyAuth(c.req.header('Authorization'));
  if (!auth.authenticated) {
    console.log('[EMAIL] Unauthorized store-email attempt');
    return c.json({ success: false, error: 'Unauthorized — authentication required' }, 401);
  }
  console.log(`[EMAIL] store-email by user: ${auth.userId || 'unknown'} role: ${auth.role || 'unknown'}`);

  const { hasServiceRole } = getSupabaseCredentials();
  if (!hasServiceRole) {
    return c.json({ success: false, error: 'Service role not configured — emails stored locally only' }, 500);
  }

  let body: {
    id: string;
    accountId: string;
    folder: string;
    fromName: string;
    fromEmail: string;
    toRecipients: { name: string; email: string }[];
    ccRecipients?: { name: string; email: string }[];
    subject: string;
    body: string;
    date: string;
    isRead: boolean;
    isStarred: boolean;
    isFlagged: boolean;
    hasAttachments: boolean;
    labels?: string[];
    priority?: string;
    sesMessageId?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON' }, 400);
  }

  try {
    const admin = getSupabaseAdmin();
    const { error } = await admin.from('emails').upsert({
      id: body.id,
      account_id: body.accountId,
      folder: body.folder,
      from_name: body.fromName,
      from_email: body.fromEmail,
      to_recipients: JSON.stringify(body.toRecipients),
      cc_recipients: body.ccRecipients ? JSON.stringify(body.ccRecipients) : null,
      subject: body.subject,
      body: body.body,
      email_date: body.date,
      is_read: body.isRead,
      is_starred: body.isStarred,
      is_flagged: body.isFlagged,
      has_attachments: body.hasAttachments,
      labels: body.labels ? JSON.stringify(body.labels) : null,
      priority: body.priority || 'normal',
      ses_message_id: body.sesMessageId || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (error) {
      console.log('[EMAIL] Store error:', error.message);
      return c.json({ success: false, error: error.message }, 500);
    }

    console.log('[EMAIL] Stored email:', body.id, body.folder, body.subject);
    return c.json({ success: true, id: body.id });
  } catch (err: unknown) {
    console.log('[EMAIL] Store exception:', (err as Error)?.message);
    return c.json({ success: false, error: (err as Error)?.message }, 500);
  }
});

app.get("/emails", async (c) => {
  const auth = await verifyAnyAuth(c.req.header('Authorization'));
  if (!auth.authenticated) {
    console.log('[EMAIL] Unauthorized emails fetch attempt');
    return c.json({ success: false, emails: [], error: 'Unauthorized — authentication required' }, 401);
  }
  console.log(`[EMAIL] emails fetch by user: ${auth.userId || 'unknown'} role: ${auth.role || 'unknown'}`);

  const { hasServiceRole } = getSupabaseCredentials();
  if (!hasServiceRole) {
    return c.json({ success: false, emails: [], error: 'Service role not configured' });
  }

  const accountId = c.req.query('accountId') || '';
  const folder = c.req.query('folder') || 'inbox';
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    const admin = getSupabaseAdmin();
    let query = admin.from('emails').select('*').order('email_date', { ascending: false }).range(offset, offset + limit - 1);

    if (accountId) {
      query = query.eq('account_id', accountId);
    }
    if (folder && folder !== 'all') {
      query = query.eq('folder', folder);
    }

    const { data, error } = await query;

    if (error) {
      console.log('[EMAIL] Fetch error:', error.message);
      return c.json({ success: false, emails: [], error: error.message });
    }

    const emails = (data || []).map((row: Record<string, unknown>) => ({
      id: row.id,
      accountId: row.account_id,
      folder: row.folder,
      from: { name: row.from_name, email: row.from_email },
      to: typeof row.to_recipients === 'string' ? JSON.parse(row.to_recipients as string) : (row.to_recipients || []),
      cc: row.cc_recipients ? (typeof row.cc_recipients === 'string' ? JSON.parse(row.cc_recipients as string) : row.cc_recipients) : undefined,
      subject: row.subject,
      body: row.body,
      date: row.email_date,
      isRead: row.is_read,
      isStarred: row.is_starred,
      isFlagged: row.is_flagged,
      hasAttachments: row.has_attachments,
      labels: row.labels ? (typeof row.labels === 'string' ? JSON.parse(row.labels as string) : row.labels) : [],
      priority: row.priority || 'normal',
      sesMessageId: row.ses_message_id,
    }));

    console.log(`[EMAIL] Fetched ${emails.length} emails for account=${accountId} folder=${folder}`);
    return c.json({ success: true, emails, total: emails.length });
  } catch (err: unknown) {
    console.log('[EMAIL] Fetch exception:', (err as Error)?.message);
    return c.json({ success: false, emails: [], error: (err as Error)?.message });
  }
});

app.post("/email-action", async (c) => {
  const auth = await verifyAnyAuth(c.req.header('Authorization'));
  if (!auth.authenticated) {
    console.log('[EMAIL] Unauthorized email-action attempt');
    return c.json({ success: false, error: 'Unauthorized — authentication required' }, 401);
  }
  console.log(`[EMAIL] email-action by user: ${auth.userId || 'unknown'} role: ${auth.role || 'unknown'}`);

  const { hasServiceRole } = getSupabaseCredentials();
  if (!hasServiceRole) {
    return c.json({ success: false, error: 'Service role not configured' }, 500);
  }

  let body: {
    emailId: string;
    action: 'read' | 'unread' | 'star' | 'unstar' | 'flag' | 'unflag' | 'move' | 'delete';
    folder?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON' }, 400);
  }

  try {
    const admin = getSupabaseAdmin();
    let updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    switch (body.action) {
      case 'read': updateData.is_read = true; break;
      case 'unread': updateData.is_read = false; break;
      case 'star': updateData.is_starred = true; break;
      case 'unstar': updateData.is_starred = false; break;
      case 'flag': updateData.is_flagged = true; break;
      case 'unflag': updateData.is_flagged = false; break;
      case 'move': updateData.folder = body.folder || 'inbox'; break;
      case 'delete': updateData.folder = 'trash'; break;
    }

    const { error } = await admin.from('emails').update(updateData).eq('id', body.emailId);

    if (error) {
      console.log('[EMAIL] Action error:', error.message);
      return c.json({ success: false, error: error.message }, 500);
    }

    console.log('[EMAIL] Action:', body.action, 'on', body.emailId);
    return c.json({ success: true });
  } catch (err: unknown) {
    console.log('[EMAIL] Action exception:', (err as Error)?.message);
    return c.json({ success: false, error: (err as Error)?.message }, 500);
  }
});

app.get("/ses-identities", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized — admin access required' }, 401);
  }

  const { accessKey, region } = getAwsCredentials();

  if (!accessKey) {
    return c.json({ configured: false, identities: [], error: 'AWS credentials not set' });
  }

  const domainParams = new URLSearchParams();
  domainParams.append('IdentityType', 'Domain');
  const domainResult = await sesApiCall('ListIdentities', domainParams, 1);

  const emailParams = new URLSearchParams();
  emailParams.append('IdentityType', 'EmailAddress');
  const emailResult = await sesApiCall('ListIdentities', emailParams, 1);

  const identities: string[] = [];
  const verifiedEmails: string[] = [];

  if (domainResult.ok) {
    const memberMatches = domainResult.body.matchAll(/<member>([^<]+)<\/member>/g);
    for (const m of memberMatches) {
      identities.push(m[1]);
    }
  }

  if (emailResult.ok) {
    const emailMatches = emailResult.body.matchAll(/<member>([^<]+)<\/member>/g);
    for (const m of emailMatches) {
      verifiedEmails.push(m[1]);
    }
  }

  const allIdentities = [...identities, ...verifiedEmails];
  let verificationStatuses: Record<string, string> = {};

  if (allIdentities.length > 0) {
    const verifyParams = new URLSearchParams();
    allIdentities.forEach((id, i) => {
      verifyParams.append(`Identities.member.${i + 1}`, id);
    });
    const verifyResult = await sesApiCall('GetIdentityVerificationAttributes', verifyParams, 1);
    if (verifyResult.ok) {
      const entryPattern = /<entry>\s*<key>([^<]+)<\/key>\s*<value>\s*<VerificationStatus>([^<]+)<\/VerificationStatus>/g;
      let match;
      while ((match = entryPattern.exec(verifyResult.body)) !== null) {
        verificationStatuses[match[1]] = match[2];
      }
    }
  }

  const hasIvxDomain = identities.some(i => i.includes('ivxholding.com'));
  const ivxDomainVerified = verificationStatuses['ivxholding.com'] === 'Success';

  const confirmedEmails = verifiedEmails.filter(e => verificationStatuses[e] === 'Success');

  console.log(`[SES] Identities: ${identities.length} domains, ${verifiedEmails.length} emails, ${confirmedEmails.length} verified`);
  console.log(`[SES] Verification statuses:`, JSON.stringify(verificationStatuses));

  return c.json({
    configured: true,
    identities,
    verifiedEmails: confirmedEmails,
    pendingEmails: verifiedEmails.filter(e => verificationStatuses[e] !== 'Success'),
    verificationStatuses,
    hasIvxDomain,
    ivxDomainVerified,
    region,
    status: ivxDomainVerified ? 'domain_verified' : hasIvxDomain ? 'domain_pending' : 'needs_domain_verification',
    timestamp: new Date().toISOString(),
  });
});

app.post("/verify-ses-email", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized — admin access required' }, 401);
  }

  const { accessKey, region } = getAwsCredentials();
  if (!accessKey) {
    return c.json({ success: false, error: 'AWS credentials not configured' }, 500);
  }

  let body: { email: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  if (!body.email || !body.email.includes('@')) {
    return c.json({ success: false, error: 'Valid email address required' }, 400);
  }

  const emailToVerify = body.email.trim();
  console.log(`[SES] Requesting verification for: ${emailToVerify}`);

  const params = new URLSearchParams();
  params.append('EmailAddress', emailToVerify);
  const result = await sesApiCall('VerifyEmailIdentity', params, 1);

  if (result.ok) {
    console.log(`[SES] Verification email sent to ${emailToVerify}. User must click the link.`);
    return c.json({
      success: true,
      email: emailToVerify,
      message: `Verification email sent to ${emailToVerify}. Please check the inbox and click the verification link from AWS.`,
      region,
    });
  } else {
    const errorMatch = result.body.match(/<Message>([^<]+)<\/Message>/);
    const errorMessage = errorMatch ? errorMatch[1] : `SES error HTTP ${result.status}`;
    console.log(`[SES] Verification failed: ${errorMessage}`);
    return c.json({ success: false, error: errorMessage }, 500);
  }
});

app.get("/ses-verification-status", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized — admin access required' }, 401);
  }

  const { accessKey, region } = getAwsCredentials();
  if (!accessKey) {
    return c.json({ success: false, error: 'AWS credentials not configured' }, 500);
  }

  const email = c.req.query('email');
  if (!email) {
    return c.json({ success: false, error: 'Email query param required' }, 400);
  }

  const params = new URLSearchParams();
  params.append('Identities.member.1', email.trim());
  const result = await sesApiCall('GetIdentityVerificationAttributes', params, 1);

  if (result.ok) {
    const statusMatch = result.body.match(/<VerificationStatus>([^<]+)<\/VerificationStatus>/);
    const status = statusMatch ? statusMatch[1] : 'NotStarted';
    return c.json({ success: true, email: email.trim(), status, verified: status === 'Success', region });
  } else {
    return c.json({ success: false, error: `HTTP ${result.status}` }, 500);
  }
});

app.get("/email-diagnostic", async (c) => {
  const { accessKey, secretKey, region } = getAwsCredentials();
  const { isValid, hasServiceRole } = getSupabaseCredentials();
  const API_BASE = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim();

  const diagnostic: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    steps: [] as { step: number; name: string; status: 'green' | 'yellow' | 'red'; detail: string }[],
  };

  const steps = diagnostic.steps as { step: number; name: string; status: 'green' | 'yellow' | 'red'; detail: string }[];

  steps.push({
    step: 1, name: 'API Backend Running',
    status: 'green', detail: 'Backend is responding',
  });

  steps.push({
    step: 2, name: 'API_BASE URL Configured',
    status: API_BASE ? 'green' : 'red',
    detail: API_BASE ? `API base: ${API_BASE}` : 'EXPO_PUBLIC_RORK_API_BASE_URL not set',
  });

  steps.push({
    step: 3, name: 'Supabase Configured',
    status: isValid ? 'green' : 'yellow',
    detail: isValid ? 'Supabase URL and key configured' : 'Supabase not configured (email storage disabled)',
  });

  steps.push({
    step: 4, name: 'Supabase Service Role',
    status: hasServiceRole ? 'green' : 'yellow',
    detail: hasServiceRole ? 'Service role configured (auth verification active)' : 'No service role — any JWT token accepted for auth',
  });

  steps.push({
    step: 5, name: 'AWS Credentials',
    status: (accessKey && secretKey) ? 'green' : 'red',
    detail: (accessKey && secretKey) ? `AWS region: ${region}` : 'AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY missing',
  });

  if (accessKey && secretKey) {
    const quotaParams = new URLSearchParams();
    const quotaResult = await sesApiCall('GetSendQuota', quotaParams, 1);

    if (quotaResult.ok) {
      const max24Match = quotaResult.body.match(/<Max24HourSend>([^<]+)</);
      const sent24Match = quotaResult.body.match(/<SentLast24Hours>([^<]+)</);
      const max24 = max24Match ? parseFloat(max24Match[1]) : 0;
      const sent24 = sent24Match ? parseFloat(sent24Match[1]) : 0;
      const isSandbox = max24 <= 200;

      steps.push({
        step: 6, name: 'SES API Access',
        status: 'green', detail: `SES accessible in ${region}`,
      });

      steps.push({
        step: 7, name: 'SES Sandbox Mode',
        status: isSandbox ? 'yellow' : 'green',
        detail: isSandbox
          ? `SANDBOX MODE (quota: ${max24}/day, sent: ${sent24}). Recipients must be verified. Request Production Access in AWS Console.`
          : `Production mode (quota: ${max24}/day, sent: ${sent24})`,
      });
    } else {
      const errMatch = quotaResult.body.match(/<Message>([^<]+)<\/Message>/);
      steps.push({
        step: 6, name: 'SES API Access',
        status: 'red',
        detail: `SES API error: ${errMatch ? errMatch[1] : 'HTTP ' + quotaResult.status}. Add AmazonSESFullAccess policy to IAM user.`,
      });
      steps.push({ step: 7, name: 'SES Sandbox Mode', status: 'red', detail: 'Cannot check — SES API not accessible' });
    }

    const domainParams = new URLSearchParams();
    domainParams.append('Identities.member.1', 'ivxholding.com');
    const domainCheck = await sesApiCall('GetIdentityVerificationAttributes', domainParams, 1);
    const domainVerified = domainCheck.ok && domainCheck.body.includes('<VerificationStatus>Success</VerificationStatus>');

    steps.push({
      step: 8, name: 'SES Domain (ivxholding.com) Verified',
      status: domainVerified ? 'green' : 'red',
      detail: domainVerified
        ? 'ivxholding.com is verified in SES'
        : 'ivxholding.com NOT verified. Run POST /api/verify-ses-domain or verify in AWS Console > SES > Verified Identities.',
    });

    const senderParams = new URLSearchParams();
    senderParams.append('Identities.member.1', 'noreply@ivxholding.com');
    const senderCheck = await sesApiCall('GetIdentityVerificationAttributes', senderParams, 1);
    const senderVerified = senderCheck.ok && senderCheck.body.includes('<VerificationStatus>Success</VerificationStatus>');

    steps.push({
      step: 9, name: 'Sender Email (noreply@ivxholding.com) Verified',
      status: senderVerified || domainVerified ? 'green' : 'red',
      detail: domainVerified
        ? 'Domain verified — all @ivxholding.com emails are valid senders'
        : senderVerified
          ? 'noreply@ivxholding.com individually verified'
          : 'Sender not verified. Verify domain or individual email in SES.',
    });
  } else {
    steps.push({ step: 6, name: 'SES API Access', status: 'red', detail: 'Cannot check — no AWS credentials' });
    steps.push({ step: 7, name: 'SES Sandbox Mode', status: 'red', detail: 'Cannot check — no AWS credentials' });
    steps.push({ step: 8, name: 'SES Domain Verified', status: 'red', detail: 'Cannot check — no AWS credentials' });
    steps.push({ step: 9, name: 'Sender Email Verified', status: 'red', detail: 'Cannot check — no AWS credentials' });
  }

  const redCount = steps.filter(s => s.status === 'red').length;
  const yellowCount = steps.filter(s => s.status === 'yellow').length;
  const greenCount = steps.filter(s => s.status === 'green').length;

  diagnostic.summary = {
    total: steps.length,
    green: greenCount,
    yellow: yellowCount,
    red: redCount,
    canSendEmails: redCount === 0 || (steps.filter(s => s.status === 'red').every(s => s.step > 7)),
    overallStatus: redCount > 0 ? 'issues_found' : yellowCount > 0 ? 'warnings' : 'all_clear',
  };

  console.log(`[EMAIL-DIAG] ${greenCount} green, ${yellowCount} yellow, ${redCount} red`);

  return c.json(diagnostic);
});

app.post("/verify-ses-domain", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized — admin access required' }, 401);
  }

  const { accessKey, region } = getAwsCredentials();
  if (!accessKey) {
    return c.json({ success: false, error: 'AWS credentials not configured' }, 500);
  }

  const body = await c.req.json().catch(() => ({})) as { domain?: string };
  const domain = (body.domain || 'ivxholding.com').trim();

  console.log(`[SES] Requesting domain verification for: ${domain}`);

  const params = new URLSearchParams();
  params.append('Domain', domain);
  const result = await sesApiCall('VerifyDomainIdentity', params, 1);

  if (result.ok) {
    const tokenMatch = result.body.match(/<VerificationToken>([^<]+)<\/VerificationToken>/);
    const verificationToken = tokenMatch ? tokenMatch[1] : '';

    const dkimParams = new URLSearchParams();
    dkimParams.append('Domain', domain);
    const dkimResult = await sesApiCall('VerifyDomainDkim', dkimParams, 1);

    const dkimTokens: string[] = [];
    if (dkimResult.ok) {
      const dkimMatches = dkimResult.body.matchAll(/<member>([^<]+)<\/member>/g);
      for (const m of dkimMatches) {
        dkimTokens.push(m[1]);
      }
    }

    console.log(`[SES] Domain verification token: ${verificationToken}`);
    console.log(`[SES] DKIM tokens: ${dkimTokens.join(', ')}`);

    return c.json({
      success: true,
      domain,
      region,
      verificationToken,
      dnsRecords: [
        {
          type: 'TXT',
          name: `_amazonses.${domain}`,
          value: verificationToken,
          purpose: 'Domain verification',
        },
        ...dkimTokens.map((token, i) => ({
          type: 'CNAME',
          name: `${token}._domainkey.${domain}`,
          value: `${token}.dkim.amazonses.com`,
          purpose: `DKIM signing key ${i + 1}`,
        })),
      ],
      instructions: [
        `1. Add TXT record: _amazonses.${domain} = ${verificationToken}`,
        ...dkimTokens.map((token, i) =>
          `${i + 2}. Add CNAME: ${token}._domainkey.${domain} -> ${token}.dkim.amazonses.com`
        ),
        `${dkimTokens.length + 2}. Wait 15-60 minutes for DNS propagation`,
        `${dkimTokens.length + 3}. Check status at GET /api/ses-verification-status?email=${domain}`,
      ],
    });
  } else {
    const errorMatch = result.body.match(/<Message>([^<]+)<\/Message>/);
    return c.json({ success: false, error: errorMatch ? errorMatch[1] : `HTTP ${result.status}` }, 500);
  }
});

app.post("/send-sms", async (c) => {
  const auth = await verifyAnyAuth(c.req.header('Authorization'));
  if (!auth.authenticated) {
    console.log('[SMS] Unauthorized send-sms attempt — no valid token');
    return c.json({ success: false, error: 'Authentication required to send SMS. Please log in first.' }, 401);
  }
  console.log(`[SMS] Authenticated user: ${auth.userId || 'unknown'} role: ${auth.role || 'unknown'}`);

  const { accessKey: awsAccessKey, secretKey: awsSecretKey, region: awsRegion } = getAwsCredentials();

  if (!awsAccessKey || !awsSecretKey) {
    console.log('[SMS] AWS credentials not configured');
    return c.json({ success: false, error: 'AWS credentials not configured — cannot send via SNS' }, 500);
  }

  let body: {
    phoneNumber: string;
    message: string;
    senderId?: string;
  };

  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  if (!body.phoneNumber || !body.message) {
    return c.json({ success: false, error: 'Missing required fields: phoneNumber, message' }, 400);
  }

  let phone = body.phoneNumber.replace(/[^\d+]/g, '');
  if (!phone.startsWith('+')) {
    phone = '+1' + phone;
  }

  const phoneRegex = /^\+[1-9]\d{6,14}$/;
  if (!phoneRegex.test(phone)) {
    return c.json({ success: false, error: `Invalid phone number format: ${phone}. Use E.164 format (e.g., +15616443503)` }, 400);
  }

  if (body.message.length > 1600) {
    return c.json({ success: false, error: 'Message too long. Maximum 1600 characters.' }, 400);
  }

  console.log(`[SMS] Sending via AWS SNS to ${phone} | Message length: ${body.message.length} chars | Region: ${awsRegion}`);

  const snsHost = `sns.${awsRegion}.amazonaws.com`;
  const params = new URLSearchParams();
  params.set('Action', 'Publish');
  params.set('PhoneNumber', phone);
  params.set('Message', body.message);
  params.set('MessageAttributes.entry.1.Name', 'AWS.SNS.SMS.SMSType');
  params.set('MessageAttributes.entry.1.Value.DataType', 'String');
  params.set('MessageAttributes.entry.1.Value.StringValue', 'Transactional');
  if (body.senderId) {
    params.set('MessageAttributes.entry.2.Name', 'AWS.SNS.SMS.SenderID');
    params.set('MessageAttributes.entry.2.Value.DataType', 'String');
    params.set('MessageAttributes.entry.2.Value.StringValue', body.senderId.substring(0, 11));
  }
  const payload = params.toString();

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const signed = await awsSigV4Sign({
        method: 'POST',
        host: snsHost,
        uri: '/',
        service: 'sns',
        contentType: 'application/x-www-form-urlencoded',
        payload,
        accessKey: awsAccessKey,
        secretKey: awsSecretKey,
        region: awsRegion,
      });

      const response = await fetch(signed.url, {
        method: 'POST',
        headers: signed.headers,
        body: payload,
      });

      const respBody = await response.text();
      console.log(`[SNS] Publish attempt ${attempt + 1}: HTTP ${response.status}`);

      if (response.ok) {
        const messageIdMatch = respBody.match(/<MessageId>([^<]+)<\/MessageId>/);
        const messageId = messageIdMatch ? messageIdMatch[1] : 'unknown';
        console.log(`[SMS] SMS sent successfully via AWS SNS. MessageId: ${messageId} | To: ${phone}`);

        try {
          if (isServiceRoleConfigured()) {
            const db = getSupabaseAdmin();
            const now = new Date().toISOString();
            await db.from('sms_messages').insert({
              type: 'manual',
              status: 'sent',
              message: body.message,
              recipient_phone: phone,
              sent_at: now,
              created_at: now,
              delivered_at: now,
            });
            console.log('[SMS] Logged sent message to sms_messages');

            try {
              await db.rpc('increment_sms_counter', { counter_name: 'total_sent' });
              console.log('[SMS] Incremented total_sent counter via rpc');
            } catch {
              const { data: report } = await db.from('sms_reports').select('total_sent').eq('id', 'default').single();
              const currentCount = (report && typeof report === 'object' && 'total_sent' in report) ? Number(report.total_sent) : 0;
              await db.from('sms_reports').upsert({
                id: 'default',
                total_sent: currentCount + 1,
                last_report_time: now,
                updated_at: now,
              });
              console.log('[SMS] Incremented total_sent via upsert fallback');
            }
          }
        } catch (logErr) {
          console.log('[SMS] Failed to log SMS to Supabase (non-critical):', (logErr as Error)?.message);
        }

        return c.json({
          success: true,
          messageId,
          provider: 'aws_sns',
          region: awsRegion,
          phoneNumber: phone,
          messageLength: body.message.length,
        });
      }

      if (response.status >= 500 && attempt < 2) {
        console.log(`[SNS] Server error, retrying in ${(attempt + 1) * 1000}ms...`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
        continue;
      }

      if (respBody.includes('Throttling') && attempt < 2) {
        console.log(`[SNS] Throttled, retrying in ${(attempt + 1) * 2000}ms...`);
        await new Promise(r => setTimeout(r, (attempt + 1) * 2000));
        continue;
      }

      const errorMatch = respBody.match(/<Message>([^<]+)<\/Message>/);
      const errorMessage = errorMatch ? errorMatch[1] : `SNS error HTTP ${response.status}`;
      console.log(`[SMS] SNS send failed: ${errorMessage}`);
      console.log(`[SMS] SNS full response: ${respBody.substring(0, 500)}`);

      if (respBody.includes('AuthorizationError') || respBody.includes('not authorized')) {
        return c.json({
          success: false,
          error: 'AWS IAM user does not have SNS permissions. Add AmazonSNSFullAccess policy.',
          snsError: errorMessage,
          provider: 'aws_sns',
          fix: [
            '1. Go to AWS Console > IAM > Users',
            '2. Find your IAM user',
            '3. Attach policy: AmazonSNSFullAccess',
            '4. If in SMS sandbox, add phone number in SNS > Text messaging > Sandbox',
          ],
        }, 403);
      }

      if (respBody.includes('OptInRequired') || respBody.includes('opted out') || respBody.includes('sandbox')) {
        return c.json({
          success: false,
          error: 'SNS SMS Sandbox — phone number must be verified first.',
          snsError: errorMessage,
          provider: 'aws_sns',
          fix: [
            '1. Go to AWS Console > SNS > Text messaging (SMS)',
            '2. Check if account is in SMS Sandbox',
            `3. Add destination phone number: ${phone}`,
            '4. Verify the phone number via the OTP code sent',
            '5. Or request production access to send to any number',
          ],
        }, 400);
      }

      try {
        if (isServiceRoleConfigured()) {
          const db = getSupabaseAdmin();
          const now = new Date().toISOString();
          await db.from('sms_messages').insert({
            type: 'manual',
            status: 'failed',
            message: body.message,
            recipient_phone: phone,
            error: errorMessage,
            sent_at: now,
            created_at: now,
          });
          const { data: report } = await db.from('sms_reports').select('total_failed').eq('id', 'default').single();
          const currentFailed = (report as any)?.total_failed ?? 0;
          await db.from('sms_reports').upsert({ id: 'default', total_failed: currentFailed + 1, updated_at: now });
          console.log('[SMS] Logged failed message to sms_messages');
        }
      } catch (logErr) {
        console.log('[SMS] Failed to log error to Supabase (non-critical):', (logErr as Error)?.message);
      }

      return c.json({ success: false, error: errorMessage, provider: 'aws_sns' }, 500);
    } catch (err: unknown) {
      const msg = (err as Error)?.message || 'Unknown error';
      console.log(`[SNS] Publish attempt ${attempt + 1} exception: ${msg}`);
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 1000));
        continue;
      }

      try {
        if (isServiceRoleConfigured()) {
          const db = getSupabaseAdmin();
          const now = new Date().toISOString();
          await db.from('sms_messages').insert({
            type: 'manual',
            status: 'failed',
            message: body.message,
            recipient_phone: phone,
            error: msg,
            sent_at: now,
            created_at: now,
          });
          const { data: report } = await db.from('sms_reports').select('total_failed').eq('id', 'default').single();
          const currentFailed = (report as any)?.total_failed ?? 0;
          await db.from('sms_reports').upsert({ id: 'default', total_failed: currentFailed + 1, updated_at: now });
        }
      } catch (logErr) {
        console.log('[SMS] Failed to log exception to Supabase:', (logErr as Error)?.message);
      }

      return c.json({ success: false, error: msg, provider: 'aws_sns' }, 500);
    }
  }

  return c.json({ success: false, error: 'All retries exhausted', provider: 'aws_sns' }, 500);
});

app.get("/sns-status", async (c) => {
  const isAdmin = await verifyAdminAuth(c.req.header('Authorization'));
  if (!isAdmin) {
    return c.json({ success: false, error: 'Unauthorized — admin access required' }, 401);
  }
  const { accessKey: awsAccessKey, secretKey: awsSecretKey, region: awsRegion } = getAwsCredentials();

  if (!awsAccessKey || !awsSecretKey) {
    return c.json({
      configured: false,
      error: 'AWS credentials not set',
      fix: 'Add AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION to environment variables',
    });
  }

  const snsHost = `sns.${awsRegion}.amazonaws.com`;
  const params = new URLSearchParams();
  params.set('Action', 'GetSMSAttributes');
  params.set('attributes.member.1', 'DefaultSMSType');
  params.set('attributes.member.2', 'MonthlySpendLimit');
  params.set('attributes.member.3', 'DefaultSenderID');
  const payload = params.toString();

  try {
    const signed = await awsSigV4Sign({
      method: 'POST',
      host: snsHost,
      uri: '/',
      service: 'sns',
      contentType: 'application/x-www-form-urlencoded',
      payload,
      accessKey: awsAccessKey,
      secretKey: awsSecretKey,
      region: awsRegion,
    });

    const response = await fetch(signed.url, {
      method: 'POST',
      headers: signed.headers,
      body: payload,
    });

    const respBody = await response.text();
    console.log(`[SNS] GetSMSAttributes: HTTP ${response.status}`);

    if (response.ok) {
      const spendMatch = respBody.match(/MonthlySpendLimit[\s\S]*?<value>([^<]+)<\/value>/);
      const typeMatch = respBody.match(/DefaultSMSType[\s\S]*?<value>([^<]+)<\/value>/);
      const senderMatch = respBody.match(/DefaultSenderID[\s\S]*?<value>([^<]+)<\/value>/);

      return c.json({
        configured: true,
        provider: 'aws_sns',
        region: awsRegion,
        status: 'active',
        smsAttributes: {
          defaultSMSType: typeMatch ? typeMatch[1] : 'Transactional',
          monthlySpendLimit: spendMatch ? parseFloat(spendMatch[1]) : 1.0,
          defaultSenderId: senderMatch ? senderMatch[1] : 'not set',
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      const errorMatch = respBody.match(/<Message>([^<]+)<\/Message>/);
      return c.json({
        configured: true,
        provider: 'aws_sns',
        region: awsRegion,
        status: 'error',
        error: errorMatch ? errorMatch[1] : `HTTP ${response.status}`,
        fix: 'Ensure IAM user has AmazonSNSFullAccess policy',
      });
    }
  } catch (err: unknown) {
    return c.json({
      configured: false,
      error: (err as Error)?.message || 'Unknown error',
      provider: 'aws_sns',
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// JV INVESTMENT PURCHASE — Service Role (bypasses RLS)
// ══════════════════════════════════════════════════════════════════════════════
app.post("/purchase-jv", async (c) => {
  console.log('[API] POST /purchase-jv');

  if (!isServiceRoleConfigured()) {
    return c.json({ success: false, message: 'Service role not configured. Contact support.' }, 500);
  }

  const auth = await verifyAnyAuth(c.req.header('Authorization'));
  if (!auth.authenticated || !auth.userId) {
    return c.json({ success: false, message: 'Authentication required. Please log in or create an account.' }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json() as Record<string, unknown>;
  } catch {
    return c.json({ success: false, message: 'Invalid request body' }, 400);
  }

  const jvDealId = typeof body.jvDealId === 'string' ? body.jvDealId : '';
  const jvTitle = typeof body.jvTitle === 'string' ? body.jvTitle : '';
  const jvProjectName = typeof body.jvProjectName === 'string' ? body.jvProjectName : '';
  const investmentPool = typeof body.investmentPool === 'string' ? body.investmentPool : 'token_shares';
  const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount) || 0;
  const equityPercent = typeof body.equityPercent === 'number' ? body.equityPercent : Number(body.equityPercent) || 0;
  const expectedROI = typeof body.expectedROI === 'number' ? body.expectedROI : Number(body.expectedROI) || 0;
  const paymentMethod = typeof body.paymentMethod === 'string' ? body.paymentMethod : 'bank';

  if (!jvDealId) return c.json({ success: false, message: 'Deal ID is required' }, 400);
  if (amount <= 0) return c.json({ success: false, message: 'Amount must be greater than 0' }, 400);
  if (amount > 10000000) return c.json({ success: false, message: 'Amount exceeds maximum' }, 400);

  const userId = auth.userId;
  const confirmationNumber = `JV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const transactionId = `txn_jv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const holdingId = `hold_jv_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  console.log('[API] JV Purchase:', { userId, jvDealId, amount, investmentPool, paymentMethod });

  try {
    const admin = getSupabaseAdmin();

    let dealVerified = false;
    try {
      const { data: dealData, error: dealError } = await admin
        .from('jv_deals')
        .select('*')
        .eq('id', jvDealId)
        .single();

      if (!dealError && dealData) {
        dealVerified = true;
        console.log('[API] Deal verified from DB:', jvDealId);
      } else {
        console.log('[API] Deal not in DB (may use fallback):', jvDealId, dealError?.message);
      }
    } catch (verifyErr) {
      console.log('[API] Deal verify exception:', (verifyErr as Error)?.message);
    }

    const KNOWN_DEALS = ['casa-rosario-001'];
    if (!dealVerified && !KNOWN_DEALS.includes(jvDealId)) {
      return c.json({ success: false, message: 'Deal not found or unavailable' }, 404);
    }

    const { data: walletData } = await admin
      .from('wallets')
      .select('id, available, invested')
      .eq('user_id', userId)
      .single();

    if (!walletData) {
      const { error: walletCreateErr } = await admin.from('wallets').insert({
        user_id: userId,
        available: 0,
        pending: 0,
        invested: 0,
        total: 0,
        currency: 'USD',
      });
      if (walletCreateErr) console.log('[API] Wallet create warning:', walletCreateErr.message);
    }

    if (paymentMethod === 'wallet') {
      const available = Number((walletData as Record<string, unknown> | null)?.available ?? 0);
      if (available < amount) {
        return c.json({
          success: false,
          message: `Insufficient wallet balance. Available: ${available.toFixed(2)}, Required: ${amount.toFixed(2)}`,
        }, 400);
      }

      const invested = Number((walletData as Record<string, unknown> | null)?.invested ?? 0);
      const { error: debitErr } = await admin
        .from('wallets')
        .update({
          available: Math.max(0, available - amount),
          invested: invested + amount,
          last_transaction_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (debitErr) {
        console.log('[API] Wallet debit failed:', debitErr.message);
        return c.json({ success: false, message: 'Wallet debit failed. Please retry.' }, 500);
      }
      console.log('[API] Wallet debited:', amount);
    }

    const investType = investmentPool === 'jv_direct' ? 'JV Direct Investment' : 'Token Shares';

    const { error: txError } = await admin.from('transactions').insert({
      id: transactionId,
      user_id: userId,
      type: 'buy',
      amount: amount,
      status: paymentMethod === 'wallet' ? 'completed' : 'pending',
      description: `${investType} in ${jvTitle} — ${equityPercent.toFixed(2)}% equity — Confirmation: ${confirmationNumber}`,
      property_id: jvDealId,
      property_name: jvProjectName,
    });

    if (txError) {
      console.log('[API] Transaction insert failed:', txError.message);
      return c.json({ success: false, message: 'Failed to record transaction. Please retry.' }, 500);
    }
    console.log('[API] Transaction recorded:', transactionId);

    const { data: existingHolding } = await admin
      .from('holdings')
      .select('id, shares, current_value, avg_cost_basis')
      .eq('user_id', userId)
      .eq('property_id', jvDealId)
      .single();

    let finalHoldingId = holdingId;
    const sharesCount = investmentPool === 'token_shares' ? Math.max(1, Math.floor(amount / 10)) : 1;

    if (existingHolding) {
      const eh = existingHolding as Record<string, unknown>;
      finalHoldingId = String(eh.id);
      const oldShares = Number(eh.shares ?? 0);
      const newShares = oldShares + sharesCount;
      const oldValue = Number(eh.current_value ?? 0);
      const newValue = oldValue + amount;
      const oldCostBasis = Number(eh.avg_cost_basis ?? 0) * oldShares;
      const newCostBasis = newShares > 0 ? (oldCostBasis + amount) / newShares : amount;

      const { error: updateErr } = await admin.from('holdings').update({
        shares: newShares,
        avg_cost_basis: Math.round(newCostBasis * 100) / 100,
        current_value: Math.round(newValue * 100) / 100,
      }).eq('id', eh.id);

      if (updateErr) {
        console.log('[API] Holding update failed:', updateErr.message);
        await admin.from('transactions').update({ status: 'failed' }).eq('id', transactionId);
        return c.json({ success: false, message: 'Failed to update holdings.' }, 500);
      }
      console.log('[API] Holding updated:', eh.id);
    } else {
      const { error: holdErr } = await admin.from('holdings').insert({
        id: holdingId,
        user_id: userId,
        property_id: jvDealId,
        shares: sharesCount,
        avg_cost_basis: amount,
        current_value: amount,
        total_return: 0,
        total_return_percent: 0,
        unrealized_pnl: 0,
        unrealized_pnl_percent: 0,
        purchase_date: new Date().toISOString(),
      });

      if (holdErr) {
        console.log('[API] Holding insert failed:', holdErr.message);
        await admin.from('transactions').update({ status: 'failed' }).eq('id', transactionId);
        return c.json({ success: false, message: 'Failed to create holdings.' }, 500);
      }
      console.log('[API] Holding created:', holdingId);
    }

    await admin.from('notifications').insert({
      user_id: userId,
      type: 'transaction',
      title: 'JV Investment Confirmed',
      message: `You invested ${amount.toLocaleString()} in ${jvProjectName} (${investType}). Equity: ${equityPercent.toFixed(2)}%. Confirmation: ${confirmationNumber}`,
      read: false,
    }).then(({ error }) => {
      if (error) console.log('[API] Notification insert warning:', error.message);
    });

    await admin.from('audit_trail').insert({
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      entity_type: 'transaction',
      entity_id: transactionId,
      entity_title: `JV Investment: ${jvProjectName}`,
      action: 'PURCHASE',
      user_id: userId,
      user_role: auth.role || 'investor',
      source: 'app',
      details: {
        jvDealId, jvTitle, jvProjectName, amount, equityPercent,
        expectedROI, investmentPool, paymentMethod, confirmationNumber,
        holdingId: finalHoldingId,
      },
    }).then(({ error }) => {
      if (error) console.log('[API] Audit trail warning:', error.message);
    });

    console.log('[API] JV Purchase COMPLETE:', confirmationNumber);

    return c.json({
      success: true,
      transactionId,
      holdingId: finalHoldingId,
      confirmationNumber,
      message: `Successfully invested ${amount.toLocaleString()} in ${jvProjectName}.`,
    });

  } catch (err: unknown) {
    console.error('[API] JV Purchase error:', (err as Error)?.message);
    return c.json({
      success: false,
      message: 'An unexpected error occurred. Please try again.',
    }, 500);
  }
});

app.post("/ensure-storage-bucket", async (c) => {
  const { hasServiceRole, url: supabaseUrl } = getSupabaseCredentials();
  if (!hasServiceRole) {
    return c.json({ success: false, error: 'SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
  }

  const bucketName = 'deal-photos';
  console.log('[API] ensure-storage-bucket: Checking bucket:', bucketName);

  try {
    const admin = getSupabaseAdmin();

    const { data: buckets, error: listErr } = await admin.storage.listBuckets();
    if (listErr) {
      console.log('[API] ensure-storage-bucket: listBuckets error:', listErr.message);
      return c.json({ success: false, error: 'Failed to list buckets: ' + listErr.message }, 500);
    }

    const exists = Array.isArray(buckets) && buckets.some((b: { name: string }) => b.name === bucketName);
    if (exists) {
      console.log('[API] ensure-storage-bucket: Bucket already exists');

      const { error: updateErr } = await admin.storage.updateBucket(bucketName, {
        public: true,
        fileSizeLimit: 50 * 1024 * 1024,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
      });
      if (updateErr) {
        console.log('[API] ensure-storage-bucket: updateBucket warning:', updateErr.message);
      }

      return c.json({ success: true, bucket: bucketName, created: false, message: 'Bucket already exists' });
    }

    console.log('[API] ensure-storage-bucket: Creating bucket:', bucketName);
    const { error: createErr } = await admin.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 50 * 1024 * 1024,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
    });

    if (createErr) {
      if (createErr.message?.includes('already exists')) {
        console.log('[API] ensure-storage-bucket: Bucket already exists (race)');
        return c.json({ success: true, bucket: bucketName, created: false, message: 'Bucket already exists' });
      }
      console.log('[API] ensure-storage-bucket: createBucket error:', createErr.message);
      return c.json({ success: false, error: 'Failed to create bucket: ' + createErr.message }, 500);
    }

    console.log('[API] ensure-storage-bucket: Bucket created successfully');

    try {
      const policyUrl = `${supabaseUrl}/rest/v1/rpc/setup_storage_policies`;
      const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
      await fetch(policyUrl, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      }).catch(() => {});
    } catch {}

    return c.json({ success: true, bucket: bucketName, created: true, message: 'Bucket created successfully' });
  } catch (err: unknown) {
    console.error('[API] ensure-storage-bucket error:', (err as Error)?.message);
    return c.json({ success: false, error: (err as Error)?.message || 'Unknown error' }, 500);
  }
});

export default app;
