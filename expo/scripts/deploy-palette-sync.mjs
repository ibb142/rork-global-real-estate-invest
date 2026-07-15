/**
 * Focused deploy: upload the palette-synced capture.html (+ /capture) and
 * landing-support-chat.css to the ivxholding.com S3 bucket and invalidate
 * CloudFront. Mirrors deploy-landing.mjs placeholder replacement exactly.
 *
 * Usage: node scripts/deploy-palette-sync.mjs   (from expo/, reads ./.env)
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

/* ---- capture.html: same placeholder replacement as deploy-landing.mjs ---- */
let captureHtml = readFileSync('./ivxholding-landing/capture.html', 'utf-8');
captureHtml = captureHtml.replace(/__IVX_BACKEND_URL__/g, backendUrl);

for (const key of ['capture.html', 'capture']) {
  console.log(`Uploading ${key} ...`);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: captureHtml,
    ContentType: 'text/html; charset=utf-8',
    CacheControl: 'no-cache, no-store, must-revalidate',
  }));
  console.log(`${key} uploaded`);
}

/* ---- landing-support-chat.css ---- */
const chatCss = readFileSync('./ivxholding-landing/landing-support-chat.css', 'utf-8');
console.log('Uploading landing-support-chat.css ...');
await s3.send(new PutObjectCommand({
  Bucket: BUCKET,
  Key: 'landing-support-chat.css',
  Body: chatCss,
  ContentType: 'text/css; charset=utf-8',
  CacheControl: 'public, max-age=300',
}));
console.log('landing-support-chat.css uploaded');

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
        CallerReference: `palette-sync-${Date.now()}`,
        Paths: { Quantity: 3, Items: ['/capture', '/capture.html', '/landing-support-chat.css'] },
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
