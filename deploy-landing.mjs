import {
  S3Client,
  CreateBucketCommand,
  PutBucketWebsiteCommand,
  PutBucketPolicyCommand,
  PutObjectCommand,
  PutPublicAccessBlockCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';

const BUCKET_NAME = 'ivxholding-landing-page';
const rawRegion = (process.env.AWS_REGION || '').trim();
const REGION = /^[a-z]{2}-[a-z]+-[0-9]$/.test(rawRegion) ? rawRegion : 'us-east-1';
const ACCESS_KEY = (process.env.AWS_ACCESS_KEY_ID || '').trim();
const SECRET_KEY = (process.env.AWS_SECRET_ACCESS_KEY || '').trim();

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
});

async function bucketExists() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }));
    return true;
  } catch {
    return false;
  }
}

async function deploy() {
  console.log('🚀 Deploying IVX Holdings landing page to AWS S3...');
  console.log(`   Region: ${REGION}`);
  console.log(`   Bucket: ${BUCKET_NAME}`);

  const exists = await bucketExists();

  if (!exists) {
    console.log('\n📦 Creating S3 bucket...');
    const createParams = { Bucket: BUCKET_NAME };
    if (REGION !== 'us-east-1') {
      createParams.CreateBucketConfiguration = { LocationConstraint: REGION };
    }
    await s3.send(new CreateBucketCommand(createParams));
    console.log('   ✅ Bucket created');
  } else {
    console.log('\n📦 Bucket already exists, updating...');
  }

  console.log('\n🔓 Disabling public access block...');
  await s3.send(new PutPublicAccessBlockCommand({
    Bucket: BUCKET_NAME,
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: false,
      IgnorePublicAcls: false,
      BlockPublicPolicy: false,
      RestrictPublicBuckets: false,
    },
  }));
  console.log('   ✅ Public access enabled');

  console.log('\n📋 Setting bucket policy (public read)...');
  await s3.send(new PutBucketPolicyCommand({
    Bucket: BUCKET_NAME,
    Policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Sid: 'PublicReadGetObject',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${BUCKET_NAME}/*`,
      }],
    }),
  }));
  console.log('   ✅ Policy set');

  console.log('\n🌐 Configuring static website hosting...');
  await s3.send(new PutBucketWebsiteCommand({
    Bucket: BUCKET_NAME,
    WebsiteConfiguration: {
      IndexDocument: { Suffix: 'index.html' },
      ErrorDocument: { Key: 'index.html' },
    },
  }));
  console.log('   ✅ Website hosting configured');

  console.log('\n📤 Uploading index.html...');
  const html = readFileSync('./ivxholding-landing/index.html', 'utf-8');
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: 'index.html',
    Body: html,
    ContentType: 'text/html; charset=utf-8',
    CacheControl: 'no-cache',
  }));
  console.log('   ✅ index.html uploaded');

  const websiteUrl = REGION === 'us-east-1'
    ? `http://${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com`
    : `http://${BUCKET_NAME}.s3-website.${REGION}.amazonaws.com`;

  console.log('\n🎉 LANDING PAGE IS LIVE!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔗 URL: ${websiteUrl}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📌 To connect ivxholding.com:');
  console.log('   In GoDaddy DNS, add a CNAME record:');
  console.log(`   Name:  @  (or www)`);
  console.log(`   Value: ${BUCKET_NAME}.s3-website.${REGION}.amazonaws.com`);
  console.log('\n   Or use an A record with AWS Route 53 for the root domain.');
}

deploy().catch((err) => {
  console.error('\n❌ Deploy failed:', err.message);
  if (err.message.includes('credentials')) {
    console.error('   Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY env vars');
  }
  process.exit(1);
});
