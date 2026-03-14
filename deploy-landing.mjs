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

const BUCKET_NAME = 'ivxholding.com';
const WWW_BUCKET = 'www.ivxholding.com';
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

async function bucketExists(name) {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: name }));
    return true;
  } catch {
    return false;
  }
}

async function setupBucket(name) {
  const exists = await bucketExists(name);

  if (!exists) {
    console.log(`\n📦 Creating bucket: ${name}`);
    const createParams = { Bucket: name };
    if (REGION !== 'us-east-1') {
      createParams.CreateBucketConfiguration = { LocationConstraint: REGION };
    }
    await s3.send(new CreateBucketCommand(createParams));
    console.log('   ✅ Bucket created');
  } else {
    console.log(`\n📦 Bucket exists: ${name}`);
  }

  await s3.send(new PutPublicAccessBlockCommand({
    Bucket: name,
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: false,
      IgnorePublicAcls: false,
      BlockPublicPolicy: false,
      RestrictPublicBuckets: false,
    },
  }));

  await s3.send(new PutBucketPolicyCommand({
    Bucket: name,
    Policy: JSON.stringify({
      Version: '2012-10-17',
      Statement: [{
        Sid: 'PublicReadGetObject',
        Effect: 'Allow',
        Principal: '*',
        Action: 's3:GetObject',
        Resource: `arn:aws:s3:::${name}/*`,
      }],
    }),
  }));
}

async function deploy() {
  console.log('🚀 Deploying IVX Holdings landing page...');
  console.log(`   Region: ${REGION}`);

  await setupBucket(BUCKET_NAME);

  console.log('\n🌐 Configuring static website hosting for root domain...');
  await s3.send(new PutBucketWebsiteCommand({
    Bucket: BUCKET_NAME,
    WebsiteConfiguration: {
      IndexDocument: { Suffix: 'index.html' },
      ErrorDocument: { Key: 'index.html' },
    },
  }));
  console.log('   ✅ Root bucket website hosting configured');

  await setupBucket(WWW_BUCKET);

  console.log('\n🔀 Configuring www redirect to root domain...');
  await s3.send(new PutBucketWebsiteCommand({
    Bucket: WWW_BUCKET,
    WebsiteConfiguration: {
      RedirectAllRequestsTo: {
        HostName: 'ivxholding.com',
        Protocol: 'http',
      },
    },
  }));
  console.log('   ✅ www redirect configured');

  console.log('\n📤 Uploading index.html...');
  const apiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL || 'https://ivxholding.com').trim().replace(/\/$/, '');
  const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const appUrl = (process.env.EXPO_PUBLIC_APP_URL || process.env.EXPO_PUBLIC_RORK_API_BASE_URL || '').trim().replace(/\/$/, '');
  let html = readFileSync('./ivxholding-landing/index.html', 'utf-8');
  html = html.replace(/__IVX_API_BASE_URL__/g, apiBaseUrl);
  html = html.replace(/__IVX_SUPABASE_URL__/g, supabaseUrl);
  html = html.replace(/__IVX_SUPABASE_ANON_KEY__/g, supabaseAnonKey);
  html = html.replace(/__IVX_APP_URL__/g, appUrl);
  if (apiBaseUrl) {
    console.log(`   🔗 API URL injected: ${apiBaseUrl}`);
  } else {
    console.warn('   ⚠️  EXPO_PUBLIC_API_BASE_URL not set');
  }
  if (supabaseUrl && supabaseAnonKey) {
    console.log(`   🔗 Supabase URL injected: ${supabaseUrl}`);
  } else {
    console.warn('   ⚠️  EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY not set — live deals will not load');
  }
  if (appUrl) {
    console.log(`   🔗 App URL injected: ${appUrl}`);
  } else {
    console.warn('   ⚠️  App URL not set — invest buttons will open waitlist funnel instead of app');
  }

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: 'index.html',
    Body: html,
    ContentType: 'text/html; charset=utf-8',
    CacheControl: 'no-cache, no-store, must-revalidate',
  }));
  console.log('   ✅ index.html uploaded');

  console.log('\n🖼️  Uploading logo...');
  const logoBuffer = readFileSync('./assets/images/ivx-logo.png');
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: 'ivx-logo.png',
    Body: logoBuffer,
    ContentType: 'image/png',
    CacheControl: 'public, max-age=31536000',
  }));
  console.log('   ✅ logo uploaded');

  const websiteEndpoint = REGION === 'us-east-1'
    ? `${BUCKET_NAME}.s3-website-us-east-1.amazonaws.com`
    : `${BUCKET_NAME}.s3-website-${REGION}.amazonaws.com`;

  const wwwEndpoint = REGION === 'us-east-1'
    ? `${WWW_BUCKET}.s3-website-us-east-1.amazonaws.com`
    : `${WWW_BUCKET}.s3-website-${REGION}.amazonaws.com`;

  console.log('\n🎉 DEPLOYMENT COMPLETE!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔗 Direct URL: http://${websiteEndpoint}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📌 Route 53 DNS Records needed:');
  console.log('');
  console.log('   ROOT DOMAIN (ivxholding.com):');
  console.log('   Type:  A (Alias)');
  console.log('   Name:  @ (or leave blank)');
  console.log(`   Value: ${websiteEndpoint}`);
  console.log('');
  console.log('   WWW SUBDOMAIN:');
  console.log('   Type:  CNAME');
  console.log('   Name:  www');
  console.log(`   Value: ${wwwEndpoint}`);
  console.log('');
  console.log('⚠️  NOTE: S3 website hosting is HTTP only.');
  console.log('   For HTTPS, add CloudFront in front of the bucket.');
}

deploy().catch((err) => {
  console.error('\n❌ Deploy failed:', err.message);
  if (err.message.includes('credentials') || err.message.includes('InvalidAccessKeyId')) {
    console.error('   → Check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY');
  }
  if (err.message.includes('BucketAlreadyOwnedByYou')) {
    console.error('   → Bucket already exists and is owned by you — that is fine, continuing...');
  }
  process.exit(1);
});
