import { createHmac } from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  if (IS_PRODUCTION) {
    throw new Error('FATAL: JWT_SECRET must be set and at least 32 characters in production. Server cannot start.');
  }
  console.warn('[JWT] WARNING: JWT_SECRET not set or too short. Using insecure default for development only.');
}

if (IS_PRODUCTION && JWT_SECRET === 'ipx-dev-jwt-secret-32chars-min!!') {
  throw new Error('FATAL: Using development JWT_SECRET in production is not allowed.');
}

const EFFECTIVE_JWT_SECRET = JWT_SECRET || 'ipx-dev-jwt-secret-32chars-min!!';
const ACCESS_TOKEN_TTL = 15 * 60;
const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60;
const TWO_FACTOR_TOKEN_TTL = 5 * 60;

export interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  type: 'access' | 'refresh' | 'twoFactor';
  jti?: string;
  iat: number;
  exp: number;
}

function b64url(str: string): string {
  return Buffer.from(str).toString('base64url');
}

function b64urlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString();
}

function hmacSign(data: string): string {
  return createHmac('sha256', EFFECTIVE_JWT_SECRET).update(data).digest('base64url');
}

function createToken(payload: Omit<JWTPayload, 'iat' | 'exp'>, ttl: number): string {
  const now = Math.floor(Date.now() / 1000);
  const full: JWTPayload = { ...payload, iat: now, exp: now + ttl };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(full));
  const sig = hmacSign(`${header}.${body}`);
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, body, sig] = parts;
    const expected = hmacSign(`${header}.${body}`);

    if (!sig || !expected || sig.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (diff !== 0) return null;

    const payload = JSON.parse(b64urlDecode(body!)) as JWTPayload;

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      console.log('[JWT] Token expired for', payload.sub);
      return null;
    }

    return payload;
  } catch (e) {
    console.error('[JWT] Verify error:', e);
    return null;
  }
}

export function signAccessToken(userId: string, email: string, role: string): string {
  console.log('[JWT] Signing access token for', userId);
  return createToken({ sub: userId, email, role, type: 'access' }, ACCESS_TOKEN_TTL);
}

export function signRefreshToken(userId: string, email: string, role: string, jti: string): string {
  console.log('[JWT] Signing refresh token for', userId);
  return createToken({ sub: userId, email, role, type: 'refresh', jti }, REFRESH_TOKEN_TTL);
}

export function signTwoFactorToken(userId: string, email: string, role: string): string {
  console.log('[JWT] Signing 2FA temp token for', userId);
  return createToken({ sub: userId, email, role, type: 'twoFactor' }, TWO_FACTOR_TOKEN_TTL);
}
