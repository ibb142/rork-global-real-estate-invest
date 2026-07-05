/**
 * Focused deploy: updated ivx-reels.js → S3 + CloudFront.
 * The reels module now defaults to the Project Reels channel (construction
 * updates, drone footage) instead of the Deals channel — so the main page
 * stays investor-first while the Reels icon opens the dedicated module.
 *
 * Usage: node scripts/deploy-reels-js.mjs   (from expo/, reads ./.env)
 */
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, ListDistributionsCommand, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';

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

const BUCKET = 'ivxholding-landing';
const BUCKET_REGION = 'us-east-2';
const sha16 = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

const s3 = new S3Client({ region: BUCKET_REGION, credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } });
const cf = new CloudFrontClient({ region: 'us-east-1', credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY } });

/* ---- read & upload ivx-reels.js ---- */
const localJs = readFileSync('./ivxholding-landing/ivx-reels.js', 'utf-8');
console.log('Local ivx-reels.js:', localJs.length, 'bytes, sha16:', sha16(localJs));

/* sanity: confirm Project Reels is now the default channel */
if (localJs.indexOf("channel: '__reels'") === -1) {
  console.error('ABORT: local ivx-reels.js does not default to Project Reels channel');
  process.exit(1);
}
console.log('Verified: Project Reels is the default channel');

await s3.send(new PutObjectCommand({
  Bucket: BUCKET,
  Key: 'ivx-reels.js',
  Body: localJs,
  ContentType: 'application/javascript; charset=utf-8',
  CacheControl: 'public, max-age=300',
}));
console.log('ivx-reels.js uploaded to S3');

/* ---- find the CloudFront distribution for ivxholding.com ---- */
const distList = await cf.send(new ListDistributionsCommand({}));
const dist = distList.DistributionList?.Items?.find(
  (d) => (d.Aliases?.Items || []).some((a) => a.includes('ivxholding.com'))
);
if (!dist) {
  console.error('No CloudFront distribution for ivxholding.com found');
  process.exit(1);
}
const distId = dist.Id;
console.log('CloudFront distribution:', distId);

const inv = await cf.send(new CreateInvalidationCommand({
  DistributionId: distId,
  InvalidationBatch: {
    CallerReference: `reels-js-${Date.now()}`,
    Paths: { Quantity: 1, Items: ['/ivx-reels.js*'] },
  },
}));
console.log('CloudFront invalidation:', distId, '→', inv.Invalidation.Id);

/* ---- verify live bytes match ---- */
await new Promise((r) => setTimeout(r, 18000));
const liveRes = await fetch('https://ivxholding.com/ivx-reels.js?v=' + Date.now(), { cache: 'no-store' });
const liveJs = await liveRes.text();
console.log('Live ivx-reels.js:', liveJs.length, 'bytes, sha16:', sha16(liveJs));
console.log('Live HTTP:', liveRes.status);
if (liveJs.indexOf("channel: '__reels'") !== -1) {
  console.log('VERIFIED LIVE: Project Reels is the default channel on the deployed site');
} else {
  console.error('MISMATCH: live ivx-reels.js still defaults to Deals channel');
  process.exit(1);
}
console.log('DONE');
