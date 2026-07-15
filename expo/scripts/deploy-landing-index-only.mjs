/*
 * Minimal deploy — uploads the repaired index.html to S3 + invalidates CloudFront.
 * Bypasses the broken landing-static-api.mjs import so we can ship the investor-first
 * fix (legacy 24-video grid removed) immediately.
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, ListDistributionsCommand, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { readFileSync } from 'fs';

const BUCKET = 'ivxholding.com';
const WWW_BUCKET = 'www.ivxholding.com';
const REGION = (process.env.AWS_REGION || 'us-east-1').trim();
const ACCESS_KEY = (process.env.AWS_ACCESS_KEY_ID || '').trim();
const SECRET_KEY = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();
const CACHE_CONTROL = 'no-cache, no-store, must-revalidate';

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error('AWS credentials missing');
  process.exit(1);
}

const s3 = new S3Client({ region: REGION, credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } });
const cf = new CloudFrontClient({ region: 'us-east-1', credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } });

const html = readFileSync('ivxholding-landing/index.html', 'utf8');
console.log('[deploy] index.html bytes:', html.length);

async function upload(bucket) {
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: 'index.html',
    Body: html,
    ContentType: 'text/html; charset=utf-8',
    CacheControl: CACHE_CONTROL,
  }));
  console.log('[deploy] uploaded index.html to bucket:', bucket);
}

async function invalidate() {
  const list = await cf.send(new ListDistributionsCommand({}));
  const dist = list.DistributionList?.Items?.find(d => d?.Aliases?.Items?.includes('ivxholding.com'));
  if (!dist) { console.warn('[deploy] no CloudFront distribution found for ivxholding.com'); return null; }
  const id = dist.Id;
  const ref = `investor-first-${Date.now()}`;
  await cf.send(new CreateInvalidationCommand({
    DistributionId: id,
    InvalidationBatch: {
      CallerReference: ref,
      Paths: { Quantity: 2, Items: ['/index.html', '/'] },
    },
  }));
  console.log('[deploy] CloudFront invalidation created:', ref, 'on distribution:', id);
  return id;
}

try {
  await upload(BUCKET);
  try { await upload(WWW_BUCKET); } catch (e) { console.warn('[deploy] www bucket skipped:', e.message); }
  const distId = await invalidate();
  console.log('[deploy] DONE. Distribution:', distId || 'n/a');
} catch (e) {
  console.error('[deploy] FAILED:', e.message);
  process.exit(1);
}
