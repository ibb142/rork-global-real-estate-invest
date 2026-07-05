/**
 * Focused deploy: upload the unified-feed landing files (index.html with the
 * v20260704a reels cache-buster + ivx-reels.js with Deals/Project Reels tabs
 * and FEATURED badges) to the ivxholding.com S3 bucket and invalidate
 * CloudFront. Mirrors deploy-landing.mjs placeholder replacement exactly.
 *
 * Usage: node scripts/deploy-unified-feed.mjs   (from expo/, reads ./.env)
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, ListDistributionsCommand, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { readFileSync } from 'fs';

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

const backendUrl = 'https://api.ivxholding.com';

/* ---- index.html: same placeholder replacement as deploy-landing.mjs ---- */
let indexHtml = readFileSync('./ivxholding-landing/index.html', 'utf-8');
indexHtml = indexHtml.replace(/__IVX_BACKEND_URL__/g, backendUrl);
indexHtml = indexHtml.replace(/__IVX_API_URL__/g, 'https://ivxholding.com');

for (const key of ['index.html']) {
  console.log(`Uploading ${key} ...`);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: indexHtml,
    ContentType: 'text/html; charset=utf-8',
    CacheControl: 'no-cache, no-store, must-revalidate',
  }));
  console.log(`${key} uploaded`);
}

/* ---- ivx-reels.js ---- */
const reelsJs = readFileSync('./ivxholding-landing/ivx-reels.js', 'utf-8');
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
    const inv = await cf.send(new CreateInvalidationCommand({
      DistributionId: dist.Id,
      InvalidationBatch: {
        CallerReference: `unified-feed-${Date.now()}`,
        Paths: { Quantity: 3, Items: ['/', '/index.html', '/ivx-reels.js'] },
      },
    }));
    console.log('CloudFront invalidation triggered on', dist.Id, '→', inv.Invalidation?.Id);
  } else {
    console.log('No CloudFront distribution found — S3 direct');
  }
} catch (e) {
  console.warn('CloudFront invalidation skipped:', e.message);
}
console.log('DONE');
