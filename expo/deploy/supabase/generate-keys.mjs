#!/usr/bin/env node
import crypto from 'crypto';

const JWT_SECRET = process.argv[2] || process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('Usage: node generate-keys.mjs <JWT_SECRET>');
  console.error('  JWT_SECRET must be at least 32 characters.');
  console.error('  Generate one with: openssl rand -hex 32');
  process.exit(1);
}

function base64url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function createJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const data = `${headerB64}.${payloadB64}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(data)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${data}.${signature}`;
}

const now = Math.floor(Date.now() / 1000);
const tenYears = 10 * 365 * 24 * 60 * 60;

const anonPayload = {
  role: 'anon',
  iss: 'supabase',
  iat: now,
  exp: now + tenYears,
};

const serviceRolePayload = {
  role: 'service_role',
  iss: 'supabase',
  iat: now,
  exp: now + tenYears,
};

const ANON_KEY = createJWT(anonPayload, JWT_SECRET);
const SERVICE_ROLE_KEY = createJWT(serviceRolePayload, JWT_SECRET);
const SECRET_KEY_BASE = crypto.randomBytes(64).toString('hex');
const POSTGRES_PASSWORD = crypto.randomBytes(24).toString('hex');

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  IVX Holdings — Self-Hosted Supabase Keys');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('# Add these to your .env.supabase file:');
console.log('');
console.log(`JWT_SECRET=${JWT_SECRET}`);
console.log(`ANON_KEY=${ANON_KEY}`);
console.log(`SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}`);
console.log(`SECRET_KEY_BASE=${SECRET_KEY_BASE}`);
console.log(`POSTGRES_PASSWORD=${POSTGRES_PASSWORD}`);
console.log('');
console.log('# For app .env (update these):');
console.log(`EXPO_PUBLIC_SUPABASE_URL=https://db.ivxholding.com`);
console.log(`EXPO_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}`);
console.log(`SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}`);
console.log(`SUPABASE_DB_PASSWORD=${POSTGRES_PASSWORD}`);
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  IMPORTANT: Save these securely. Do NOT commit to git.');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
