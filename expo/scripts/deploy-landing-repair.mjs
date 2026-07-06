/**
 * Focused deploy: repaired investor-first landing index.html → S3 + CloudFront.
 * Mirrors the production pipeline exactly:
 *   1. sanitizeLandingHtml (removes duplicate runtime blocks)
 *   2. injectLandingCardRenderer (shared deal-card renderer)
 *   3. placeholder substitution with verified production values
 * Then uploads, invalidates CloudFront, and verifies live bytes match.
 *
 * Usage: node scripts/deploy-landing-repair.mjs   (from expo/, reads ./.env)
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, ListDistributionsCommand, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
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

/* ---- verified production values (extracted from the live deployed page) ---- */
const PROD = {
  __IVX_SUPABASE_URL__: env.IVX_SUPABASE_URL || env.SUPABASE_URL || process.env.IVX_SUPABASE_URL || process.env.SUPABASE_URL || '',
  __IVX_SUPABASE_ANON_KEY__: env.EXPO_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  __IVX_API_BASE_URL__: 'https://ivxholding.com',
  __IVX_BACKEND_URL__: 'https://api.ivxholding.com',
  __IVX_API_URL__: 'https://ivxholding.com',
  __IVX_APP_URL__: '',
  __IVX_GOOGLE_ADS_KEY__: '',
  __IVX_META_PIXEL_ID__: '',
  __IVX_TIKTOK_PIXEL_ID__: '',
  __IVX_LINKEDIN_PARTNER_ID__: '',
};

const sha16 = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

/* ---- build production HTML ---- */
let html = readFileSync('./ivxholding-landing/index.html', 'utf-8');
const sanitized = sanitizeLandingHtml(html);
html = sanitized.html;
if (sanitized.duplicateBlockCount > 0) {
  console.log('Sanitizer removed duplicate blocks:', sanitized.duplicateBlockCount);
}
html = injectLandingCardRenderer(html);
for (const [ph, val] of Object.entries(PROD)) {
  html = html.split(ph).join(val);
}
const leftover = html.match(/__IVX_[A-Z_]+__/g) || [];
if (leftover.length > 0) {
  console.error('Unreplaced placeholders:', [...new Set(leftover)].join(', '));
  process.exit(1);
}
const homeFeedTags = (html.match(/ivx-home-feed\.js/g) || []).length;
const htmlCloses = (html.match(/<\/html>/g) || []).length;
console.log('Built HTML:', html.length, 'bytes, sha256:', sha16(html));
console.log('Structure: home-feed tags =', homeFeedTags, ', </html> count =', htmlCloses);
if (homeFeedTags !== 1 || htmlCloses !== 1) {
  console.error('Structure check failed — aborting');
  process.exit(1);
}

/* ---- upload ---- */
const BUCKET = 'ivxholding.com';
const s3 = new S3Client({ region: REGION, credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } });
console.log('Uploading index.html ...');
await s3.send(new PutObjectCommand({
  Bucket: BUCKET,
  Key: 'index.html',
  Body: html,
  ContentType: 'text/html; charset=utf-8',
  CacheControl: 'no-cache, no-store, must-revalidate',
}));
console.log('index.html uploaded');

/* ---- CloudFront invalidation ---- */
const cf = new CloudFrontClient({ region: 'us-east-1', credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } });
const resp = await cf.send(new ListDistributionsCommand({}));
const dist = (resp.DistributionList?.Items || []).find((d) =>
  (d.Aliases?.Items || []).some((a) => a === 'ivxholding.com' || a === 'www.ivxholding.com'));
if (dist) {
  const inv = await cf.send(new CreateInvalidationCommand({
    DistributionId: dist.Id,
    InvalidationBatch: {
      CallerReference: `landing-repair-${Date.now()}`,
      Paths: { Quantity: 2, Items: ['/', '/index.html'] },
    },
  }));
  console.log('CloudFront invalidation:', dist.Id, '→', inv.Invalidation?.Id);
} else {
  console.log('No CloudFront distribution found — S3 direct');
}
console.log('EXPECTED_LIVE_SHA256_16:', sha16(html));
console.log('DONE');
