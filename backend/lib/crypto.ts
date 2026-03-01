import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';

const BCRYPT_COST = 12;

let bunPasswordAvailable = false;
try {
  if (typeof (globalThis as any).Bun?.password?.hash === 'function') {
    bunPasswordAvailable = true;
    console.log('[Crypto] Bun.password available (bcrypt)');
  }
} catch {
  console.log('[Crypto] Bun.password not available, using PBKDF2 fallback');
}

export async function hashPassword(password: string): Promise<string> {
  if (bunPasswordAvailable) {
    const hash = await (globalThis as any).Bun.password.hash(password, {
      algorithm: 'bcrypt',
      cost: BCRYPT_COST,
    });
    console.log('[Crypto] Password hashed with bcrypt');
    return hash;
  }

  const salt = randomBytes(32).toString('hex');
  const hash = pbkdf2Sync(password, salt, 310000, 64, 'sha512').toString('hex');
  console.log('[Crypto] Password hashed with PBKDF2');
  return `pbkdf2$${salt}$${hash}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (bunPasswordAvailable && !storedHash.startsWith('pbkdf2$')) {
    try {
      return await (globalThis as any).Bun.password.verify(password, storedHash);
    } catch (e) {
      console.error('[Crypto] Bcrypt verify error:', e);
      return false;
    }
  }

  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 3) return false;
    const [, salt, hash] = parts;
    const computed = pbkdf2Sync(password, salt!, 310000, 64, 'sha512').toString('hex');
    try {
      return timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(hash!, 'hex'));
    } catch {
      return false;
    }
  }

  return false;
}

export function generateSecureToken(bytes: number = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function generateOTP(): string {
  const num = randomBytes(4).readUInt32BE(0) % 1000000;
  return num.toString().padStart(6, '0');
}

export function tokenExpiry(minutes: number): string {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

export function isTokenExpired(expiry: string): boolean {
  return new Date(expiry).getTime() < Date.now();
}
