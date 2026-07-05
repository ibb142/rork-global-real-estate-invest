/**
 * Focused deploy: upload the fixed index.html + ivx-reels.js to the ivxholding.com
 * S3 bucket and invalidate CloudFront. Mirrors deploy-landing.mjs placeholder
 * replacement exactly, but only touches the two files needed for the video feed fix.
 *
 * Usage: node scripts/deploy-reels-fix.mjs   (from expo/, reads ./.env)
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, ListDistributionsCommand, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { readFileSync } from 'fs';
import { injectLandingCardRenderer } from './landing-card-renderer-injector.mjs';
import { sanitizeLandingHtml } from './landing-html-sanitizer.mjs';

/* ---- load env from ./.env (line-by-line, tolerates polluted lines) ---- */
const envText = readFileSync('./.env', 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const ACCESS_KEY = env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '';
const SECRET_KEY = env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '';
const REGION = env.AWS_REGION || 'us-east-1';
if (!ACCESS_KEY || !SECRET_KEY) {
  console.error('Missing AWS credentials');
  process.exit(1);
}

const BUCKET = 'ivxholding.com';
const s3 = new S3Client({ region: REGION, credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } });

/* ---- placeholder values: preserve live behavior, fix backend url ---- */
const apiBaseUrl = 'https://ivxholding.com';
const backendUrl = 'https://api.ivxholding.com';
const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

let html = readFileSync('./ivxholding-landing/index.html', 'utf-8');
const sanitized = sanitizeLandingHtml(html);
html = sanitized.html;
html = injectLandingCardRenderer(html);
html = html.replace(/__IVX_API_BASE_URL__/g, apiBaseUrl);
html = html.replace(/__IVX_SUPABASE_URL__/g, supabaseUrl);
html = html.replace(/__IVX_SUPABASE_ANON_KEY__/g, supabaseAnonKey);
html = html.replace(/__IVX_APP_URL__/g, '');
html = html.replace(/__IVX_BACKEND_URL__/g, backendUrl);
html = html.replace(/__IVX_GOOGLE_ADS_KEY__/g, '');
html = html.replace(/__IVX_META_PIXEL_ID__/g, '');
html = html.replace(/__IVX_TIKTOK_PIXEL_ID__/g, '');
html = html.replace(/__IVX_LINKEDIN_PARTNER_ID__/g, '');

const reelsJs = readFileSync('./ivxholding-landing/ivx-reels.js', 'utf-8');

console.log('Uploading index.html (backend meta =', backendUrl + ') ...');
await s3.send(new PutObjectCommand({
  Bucket: BUCKET,
  Key: 'index.html',
  Body: html,
  ContentType: 'text/html; charset=utf-8',
  CacheControl: 'no-cache, no-store, must-revalidate',
}));
console.log('index.html uploaded');

console.log('Uploading ivx-reels.js ...');
await s3.send(new PutObjectCommand({
  Bucket: BUCKET,
  Key: 'ivx-reels.js',
  Body: reelsJs,
  ContentType: 'application/javascript; charset=utf-8',
  CacheControl: 'public, max-age=300',
}));
console.log('ivx-reels.js uploaded');

/* ---- CloudFront invalidation ---- */
try {
  const cf = new CloudFrontClient({ region: 'us-east-1', credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } });
  const resp = await cf.send(new ListDistributionsCommand({}));
  const dist = (resp.DistributionList?.Items || []).find((d) =>
    (d.Aliases?.Items || []).some((a) => a === 'ivxholding.com' || a === 'www.ivxholding.com'));
  if (dist) {
    await cf.send(new CreateInvalidationCommand({
      DistributionId: dist.Id,
      InvalidationBatch: {
        CallerReference: `reels-fix-${Date.now()}`,
        Paths: { Quantity: 3, Items: ['/', '/index.html', '/ivx-reels.js'] },
      },
    }));
    console.log('CloudFront invalidation triggered on', dist.Id);
  } else {
    console.log('No CloudFront distribution found — S3 direct');
  }
} catch (e) {
  console.warn('CloudFront invalidation skipped:', e.message);
}
console.log('DONE');
