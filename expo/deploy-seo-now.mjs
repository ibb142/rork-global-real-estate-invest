import {
  S3Client,
  PutObjectCommand,
  PutBucketWebsiteCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import {
  CloudFrontClient,
  ListDistributionsCommand,
  CreateInvalidationCommand,
} from '@aws-sdk/client-cloudfront';
import { readFileSync } from 'fs';

const BUCKET = 'ivxholding.com';
const rawRegion = (process.env.AWS_REGION || '').trim();
const REGION = /^[a-z]{2}-[a-z]+-[0-9]$/.test(rawRegion) ? rawRegion : 'us-east-1';
const ACCESS_KEY = (process.env.AWS_ACCESS_KEY_ID || '').trim();
const SECRET_KEY = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error('MISSING AWS CREDENTIALS');
  process.exit(1);
}

const s3 = new S3Client({
  region: REGION,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

async function put(key, body, contentType, cacheControl) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl,
  }));
  console.log(`  uploaded ${key} (${contentType})`);
}

async function main() {
  console.log(`Region: ${REGION}  Bucket: ${BUCKET}`);
  await s3.send(new HeadBucketCommand({ Bucket: BUCKET }));
  console.log('Bucket reachable.');

  const backendUrl = (process.env.EXPO_PUBLIC_IVX_API_BASE_URL || '').trim().replace(/\/$/, '');

  const robots = readFileSync('./ivxholding-landing/robots.txt', 'utf-8');
  await put('robots.txt', robots, 'text/plain; charset=utf-8', 'public, max-age=3600');

  const sitemap = readFileSync('./ivxholding-landing/sitemap.xml', 'utf-8');
  await put('sitemap.xml', sitemap, 'application/xml; charset=utf-8', 'public, max-age=3600');

  let captureHtml = readFileSync('./ivxholding-landing/capture.html', 'utf-8');
  captureHtml = captureHtml.replace(/__IVX_BACKEND_URL__/g, backendUrl);
  for (const key of ['capture.html', 'capture']) {
    await put(key, captureHtml, 'text/html; charset=utf-8', 'no-cache, no-store, must-revalidate');
  }

  console.log('Re-asserting bucket website routing (index + error fallback)...');
  await s3.send(new PutBucketWebsiteCommand({
    Bucket: BUCKET,
    WebsiteConfiguration: {
      IndexDocument: { Suffix: 'index.html' },
      ErrorDocument: { Key: 'index.html' },
    },
  }));

  console.log('CloudFront invalidation...');
  const cf = new CloudFrontClient({
    region: 'us-east-1',
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
  });
  const distResp = await cf.send(new ListDistributionsCommand({}));
  const dists = distResp.DistributionList?.Items || [];
  let distId = null;
  for (const dist of dists) {
    const aliases = dist.Aliases?.Items || [];
    if (aliases.includes('ivxholding.com') || aliases.includes('www.ivxholding.com')) {
      distId = dist.Id;
      break;
    }
  }
  if (distId) {
    await cf.send(new CreateInvalidationCommand({
      DistributionId: distId,
      InvalidationBatch: {
        CallerReference: `seo-deploy-${Date.now()}`,
        Paths: { Quantity: 4, Items: ['/robots.txt', '/sitemap.xml', '/capture', '/capture.html'] },
      },
    }));
    console.log(`  invalidated on ${distId}`);
  } else {
    console.log('  no CloudFront distribution matched ivxholding.com');
  }

  console.log('DONE');
}

main().catch((e) => {
  console.error('FAILED:', e.name, e.message);
  process.exit(1);
});
