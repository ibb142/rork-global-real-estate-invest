#!/usr/bin/env node
/**
 * Deploy landing page to S3 with real credentials injected.
 * Reads local index.html, replaces placeholders, uploads to S3.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHmac, createHash } from 'crypto';
import { config as loadEnv } from 'dotenv';
loadEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const API_BASE_URL = process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
const AWS_REGION = 'us-east-2'; // bucket is in us-east-2 per S3 redirect
const BUCKET = (process.env.S3_BUCKET_NAME || 'ivxholding-landing').trim();
const CF_DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID || '';

function sha256(data) {
  return createHash('sha256').update(data, 'utf8').digest('hex');
}

function hmacSha256(key, data) {
  return createHmac('sha256', key).update(data, 'utf8').digest();
}

function getSignatureKey(secretKey, dateStamp, region, service) {
  const kDate = hmacSha256('AWS4' + secretKey, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  return hmacSha256(kService, 'aws4_request');
}

async function s3PutObject(key, body, contentType, cacheControl) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').substring(0, 15) + 'Z'; // eslint-disable-line no-useless-escape
  const dateStamp = amzDate.substring(0, 8);
  const host = `${BUCKET}.s3.${AWS_REGION}.amazonaws.com`;
  const url = `https://${host}/${key}`;
  const payloadHash = sha256(body);

  const canonicalHeaders = [
    `cache-control:${cacheControl}`,
    `content-type:${contentType}`,
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';

  const signedHeaders = 'cache-control;content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = [
    'PUT',
    '/' + key,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${AWS_REGION}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  const signingKey = getSignatureKey(AWS_SECRET_ACCESS_KEY, dateStamp, AWS_REGION, 's3');
  const signature = hmacSha256(signingKey, stringToSign).toString('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  console.log(`[Deploy] Uploading ${key} to ${BUCKET}...`);
  const response = await fetch(url, {
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

  if (response.ok || response.status === 200) {
    console.log(`[Deploy] ✅ ${key} uploaded (${response.status})`);
    return true;
  }
  const errText = await response.text();
  console.error(`[Deploy] ❌ ${key} failed (${response.status}):`, errText.substring(0, 300));
  return false;
}

async function invalidateCloudFront() {
  if (!CF_DISTRIBUTION_ID) {
    console.log('[Deploy] No CloudFront distribution ID — skipping invalidation');
    return;
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:\-]|\.\d{3}/g, '').substring(0, 15) + 'Z'; // eslint-disable-line no-useless-escape
  const dateStamp = amzDate.substring(0, 8);
  const callerRef = Date.now().toString();

  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<InvalidationBatch xmlns="http://cloudfront.amazonaws.com/doc/2020-05-31/">
  <CallerReference>${callerRef}</CallerReference>
  <Paths>
    <Quantity>2</Quantity>
    <Items>
      <Path>/index.html</Path>
      <Path>/ivx-config.json</Path>
    </Items>
  </Paths>
</InvalidationBatch>`;

  const host = 'cloudfront.amazonaws.com';
  const path = `/2020-05-31/distribution/${CF_DISTRIBUTION_ID}/invalidation`;
  const payloadHash = sha256(xmlBody);

  const canonicalHeaders = [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
  ].join('\n') + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = ['POST', path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/us-east-1/cloudfront/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256(canonicalRequest)].join('\n');
  const signingKey = getSignatureKey(AWS_SECRET_ACCESS_KEY, dateStamp, 'us-east-1', 'cloudfront');
  const signature = hmacSha256(signingKey, stringToSign).toString('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  console.log('[Deploy] Invalidating CloudFront cache...');
  try {
    const response = await fetch(`https://${host}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/xml',
        'x-amz-content-sha256': payloadHash,
        'x-amz-date': amzDate,
        'Authorization': authorization,
      },
      body: xmlBody,
    });
    if (response.ok || response.status === 201) {
      console.log('[Deploy] ✅ CloudFront invalidation created');
    } else {
      const errText = await response.text();
      console.log('[Deploy] ⚠️ CloudFront invalidation response:', response.status, errText.substring(0, 200));
    }
  } catch (err) {
    console.log('[Deploy] ⚠️ CloudFront invalidation failed:', err.message);
  }
}

async function main() {
  console.log('[Deploy] Starting landing page deployment...');
  console.log('[Deploy] Supabase URL:', SUPABASE_URL ? SUPABASE_URL.substring(0, 40) + '...' : '(empty)');
  console.log('[Deploy] API Base URL:', API_BASE_URL || '(empty)');
  console.log('[Deploy] AWS Region:', AWS_REGION);
  console.log('[Deploy] Bucket:', BUCKET);

  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    console.error('[Deploy] ❌ AWS credentials not set');
    process.exit(1);
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[Deploy] ❌ Supabase credentials not set');
    process.exit(1);
  }

  const htmlPath = resolve(__dirname, '..', 'ivxholding-landing', 'index.html');
  console.log('[Deploy] Reading HTML from:', htmlPath);
  let html = readFileSync(htmlPath, 'utf-8');
  console.log('[Deploy] HTML length:', html.length);

  const backendUrl = API_BASE_URL.replace(/\/$/, '');

  html = html.replace(/__IVX_SUPABASE_URL__/g, SUPABASE_URL);
  html = html.replace(/__IVX_SUPABASE_ANON_KEY__/g, SUPABASE_ANON_KEY);
  html = html.replace(/__IVX_API_BASE_URL__/g, API_BASE_URL);
  html = html.replace(/__IVX_APP_URL__/g, API_BASE_URL);
  html = html.replace(/__IVX_BACKEND_URL__/g, backendUrl);
  html = html.replace(/__IVX_GOOGLE_ADS_KEY__/g, process.env.EXPO_PUBLIC_GOOGLE_ADS_API_KEY || '');
  html = html.replace(/__IVX_META_PIXEL_ID__/g, '');
  html = html.replace(/__IVX_TIKTOK_PIXEL_ID__/g, '');
  html = html.replace(/__IVX_LINKEDIN_PARTNER_ID__/g, '');

  const hasPlaceholders = html.includes('__IVX_');
  console.log('[Deploy] Placeholders remaining:', hasPlaceholders);
  if (hasPlaceholders) {
    const remaining = html.match(/__IVX_[A-Z_]+__/g) || [];
    console.log('[Deploy] Remaining placeholders:', [...new Set(remaining)].join(', '));
  }

  const hasJacksonville = html.includes('jacksonville-prime-fallback') || html.includes('JACKSONVILLE');
  console.log('[Deploy] Jacksonville fallback card present:', hasJacksonville);
  console.log('[Deploy] Perez fallback present:', html.includes('perez-residence-fallback'));
  console.log('[Deploy] Casa Rosario fallback present:', html.includes('casa-rosario-fallback'));

  const configJson = JSON.stringify({
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    apiBaseUrl: API_BASE_URL,
    appUrl: API_BASE_URL,
    backendUrl: backendUrl,
    deployedAt: new Date().toISOString(),
  });

  const results = [];

  results.push(await s3PutObject('index.html', html, 'text/html; charset=utf-8', 'no-cache, no-store, must-revalidate'));
  results.push(await s3PutObject('ivx-config.json', configJson, 'application/json', 'no-cache, no-store, must-revalidate'));

  await invalidateCloudFront();

  const allOk = results.every(r => r === true);
  console.log('\n[Deploy] ' + (allOk ? '✅ DEPLOYMENT SUCCESSFUL' : '❌ DEPLOYMENT HAD ERRORS'));
  console.log('[Deploy] Files uploaded:', results.filter(r => r).length, '/', results.length);
  console.log('[Deploy] Timestamp:', new Date().toISOString());

  if (!allOk) process.exit(1);
}

main().catch(err => {
  console.error('[Deploy] Fatal error:', err);
  process.exit(1);
});
