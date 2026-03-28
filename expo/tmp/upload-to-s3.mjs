import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { readFileSync } from 'fs';

const region = 'us-east-1';
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

if (!accessKeyId || !secretAccessKey) {
  console.error('AWS credentials not found in environment');
  console.log('AWS_ACCESS_KEY_ID set:', !!accessKeyId);
  console.log('AWS_SECRET_ACCESS_KEY set:', !!secretAccessKey);
  process.exit(1);
}

console.log('AWS credentials found, uploading...');

const s3 = new S3Client({
  region,
  credentials: { accessKeyId, secretAccessKey },
});

const cf = new CloudFrontClient({
  region,
  credentials: { accessKeyId, secretAccessKey },
});

const html = readFileSync('./ivxholding-landing/index.html', 'utf-8');

// Upload to S3
const putResult = await s3.send(new PutObjectCommand({
  Bucket: 'ivxholding.com',
  Key: 'index.html',
  Body: html,
  ContentType: 'text/html; charset=utf-8',
  CacheControl: 'no-cache, no-store, must-revalidate',
}));
console.log('S3 upload success:', putResult.$metadata.httpStatusCode);

// Invalidate CloudFront
const invResult = await cf.send(new CreateInvalidationCommand({
  DistributionId: 'E1C0DEI0VKCUYN',
  InvalidationBatch: {
    CallerReference: `deploy-${Date.now()}`,
    Paths: {
      Quantity: 1,
      Items: ['/*'],
    },
  },
}));
console.log('CloudFront invalidation created:', invResult.Invalidation?.Id);
console.log('Status:', invResult.Invalidation?.Status);
console.log('Done! Landing page deployed to https://ivxholding.com');
