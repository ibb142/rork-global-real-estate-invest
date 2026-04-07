#!/usr/bin/env node
import { readFileSync } from 'fs';
import { fetchStaticLandingApiPayloads } from './landing-static-api.mjs';
import { injectLandingCardRenderer } from './landing-card-renderer-injector.mjs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHmac, createHash } from 'crypto';
import { config as loadEnv } from 'dotenv';
loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const API_BASE_URL = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim();
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
const GOOGLE_ADS_KEY = process.env.EXPO_PUBLIC_GOOGLE_ADS_API_KEY || '';

const BUCKET = 'ivxholding.com';
const REGION = 'us-east-1';

function sha256(data) { return createHash('sha256').update(data, 'utf8').digest('hex'); }
function hmacSha256(key, data) { return createHmac('sha256', key).update(data, 'utf8').digest(); }
function getSignatureKey(secretKey, dateStamp, region, service) {
  const kDate = hmacSha256('AWS4' + secretKey, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

async function s3PutPathStyle(key, body, contentType, cacheControl) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').substring(0, 15) + 'Z';
  const dateStamp = amzDate.substring(0, 8);
  const host = 's3.amazonaws.com';
  const s3Path = '/' + BUCKET + '/' + key;
  const url = 'https://' + host + s3Path;
  const payloadHash = sha256(body);

  const canonicalHeaders = [
    'cache-control:' + cacheControl,
    'content-type:' + contentType,
    'host:' + host,
    'x-amz-content-sha256:' + payloadHash,
    'x-amz-date:' + amzDate,
  ].join('\n') + '\n';
  const signedHeaders = 'cache-control;content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = ['PUT', s3Path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = dateStamp + '/' + REGION + '/s3/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256(canonicalRequest)].join('\n');
  const signingKey = getSignatureKey(AWS_SECRET_ACCESS_KEY, dateStamp, REGION, 's3');
  const signature = hmacSha256(signingKey, stringToSign).toString('hex');
  const authorization = 'AWS4-HMAC-SHA256 Credential=' + AWS_ACCESS_KEY_ID + '/' + credentialScope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;

  console.log('[Deploy] Uploading ' + key + ' to s3://' + BUCKET + '/' + key + ' (path-style)...');
  const r = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': amzDate,
      'Authorization': authorization,
    },
    body,
  });

  if (r.ok || r.status === 200) {
    console.log('[Deploy] ✅ ' + key + ' uploaded (' + r.status + ')');
    return true;
  }
  const errText = await r.text();
  console.error('[Deploy] ❌ ' + key + ' failed (' + r.status + '):', errText.substring(0, 400));
  return false;
}

async function main() {
  console.log('[Deploy] === Landing Page Deploy (path-style to ivxholding.com bucket) ===');
  console.log('[Deploy] Supabase URL:', SUPABASE_URL ? SUPABASE_URL.substring(0, 40) + '...' : '(empty)');
  console.log('[Deploy] API Base URL:', API_BASE_URL || '(empty)');

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.error('[Deploy] ❌ AWS credentials not set'); process.exit(1);
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[Deploy] ❌ Supabase credentials not set'); process.exit(1);
  }

  const htmlPath = resolve(__dirname, '..', 'ivxholding-landing', 'index.html');
  let html = readFileSync(htmlPath, 'utf-8');
  html = injectLandingCardRenderer(html);
  console.log('[Deploy] HTML length:', html.length);

  const backendUrl = API_BASE_URL.replace(/\/$/, '');

  html = html.replace(/__IVX_SUPABASE_URL__/g, SUPABASE_URL);
  html = html.replace(/__IVX_SUPABASE_ANON_KEY__/g, SUPABASE_ANON_KEY);
  html = html.replace(/__IVX_API_BASE_URL__/g, API_BASE_URL);
  html = html.replace(/__IVX_APP_URL__/g, API_BASE_URL);
  html = html.replace(/__IVX_BACKEND_URL__/g, backendUrl);
  html = html.replace(/__IVX_GOOGLE_ADS_KEY__/g, GOOGLE_ADS_KEY);
  html = html.replace(/__IVX_META_PIXEL_ID__/g, '');
  html = html.replace(/__IVX_TIKTOK_PIXEL_ID__/g, '');
  html = html.replace(/__IVX_LINKEDIN_PARTNER_ID__/g, '');

  const remaining = html.match(/__IVX_[A-Z_]+__/g) || [];
  if (remaining.length > 0) {
    console.log('[Deploy] ⚠️ Remaining placeholders:', [...new Set(remaining)].join(', '));
  } else {
    console.log('[Deploy] ✅ All placeholders replaced');
  }

  console.log('[Deploy] Jacksonville present:', html.includes('jacksonville-prime-fallback'));
  console.log('[Deploy] Perez present:', html.includes('perez-residence-fallback'));
  console.log('[Deploy] Casa Rosario present:', html.includes('casa-rosario-fallback'));
  console.log('[Deploy] Supabase URL in HTML:', html.includes('kvclcdjmjghndxsngfzb.supabase.co'));

  const configJson = JSON.stringify({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    apiBaseUrl: API_BASE_URL,
    appUrl: API_BASE_URL,
    backendUrl: backendUrl,
    deployedAt: new Date().toISOString(),
  });
  const { dealsPayload, healthPayload } = await fetchStaticLandingApiPayloads({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    directApiBaseUrl: backendUrl,
  });
  const dealsJson = JSON.stringify(dealsPayload);
  const healthJson = JSON.stringify(healthPayload);

  const cacheControl = 'no-cache, no-store, must-revalidate';
  const r1 = await s3PutPathStyle('index.html', html, 'text/html; charset=utf-8', cacheControl);
  const r2 = await s3PutPathStyle('ivx-config.json', configJson, 'application/json', cacheControl);
  const r3 = await s3PutPathStyle('api/landing-deals', dealsJson, 'application/json', cacheControl);
  const r4 = await s3PutPathStyle('api/published-jv-deals', dealsJson, 'application/json', cacheControl);
  const r5 = await s3PutPathStyle('health', healthJson, 'application/json', cacheControl);

  console.log('\n[Deploy] ' + (r1 && r2 && r3 && r4 && r5 ? '✅ DEPLOYMENT SUCCESSFUL' : '❌ DEPLOYMENT HAD ERRORS'));
  console.log('[Deploy] Timestamp:', new Date().toISOString());

  if (!r1 || !r2 || !r3 || !r4 || !r5) process.exit(1);
}

main().catch(err => { console.error('[Deploy] Fatal:', err); process.exit(1); });
