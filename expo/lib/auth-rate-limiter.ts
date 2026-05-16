const AUTH_ATTEMPTS: Map<string, { count: number; firstAttempt: number; lockedUntil: number }> = new Map();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000;
const LOCKOUT_MS = 60 * 1000;

export function checkAuthRateLimit(identifier: string): { allowed: boolean; remainingAttempts: number; lockedUntilMs: number } {
  const now = Date.now();
  const entry = AUTH_ATTEMPTS.get(identifier);

  if (!entry) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS, lockedUntilMs: 0 };
  }

  if (entry.lockedUntil > now) {
    const remainingSec = Math.ceil((entry.lockedUntil - now) / 1000);
    console.log(`[RateLimit] ${identifier} locked for ${remainingSec} more seconds`);
    return { allowed: false, remainingAttempts: 0, lockedUntilMs: entry.lockedUntil };
  }

  if (now - entry.firstAttempt > WINDOW_MS) {
    AUTH_ATTEMPTS.delete(identifier);
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS, lockedUntilMs: 0 };
  }

  const remaining = MAX_ATTEMPTS - entry.count;
  return { allowed: remaining > 0, remainingAttempts: Math.max(0, remaining), lockedUntilMs: entry.lockedUntil };
}

export function recordAuthAttempt(identifier: string, success: boolean) {
  if (success) {
    AUTH_ATTEMPTS.delete(identifier);
    console.log(`[RateLimit] ${identifier} cleared on success`);
    return;
  }

  const now = Date.now();
  const entry = AUTH_ATTEMPTS.get(identifier);

  if (!entry || now - entry.firstAttempt > WINDOW_MS) {
    AUTH_ATTEMPTS.set(identifier, { count: 1, firstAttempt: now, lockedUntil: 0 });
    console.log(`[RateLimit] ${identifier} attempt 1/${MAX_ATTEMPTS}`);
    return;
  }

  entry.count++;
  console.log(`[RateLimit] ${identifier} attempt ${entry.count}/${MAX_ATTEMPTS}`);

  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOCKOUT_MS;
    console.log(`[RateLimit] ${identifier} LOCKED for ${LOCKOUT_MS / 1000} seconds`);
  }

  AUTH_ATTEMPTS.set(identifier, entry);
}

export function clearAuthAttempts(identifier: string): boolean {
  const existed = AUTH_ATTEMPTS.has(identifier);
  AUTH_ATTEMPTS.delete(identifier);
  if (existed) {
    console.log(`[RateLimit] ${identifier} cooldown cleared manually`);
  }
  return existed;
}

export function getRateLimitMessage(lockedUntilMs: number): string {
  const remainingSec = Math.max(1, Math.ceil((lockedUntilMs - Date.now()) / 1000));
  return `Too many failed attempts. Please try again in ${remainingSec} second${remainingSec === 1 ? '' : 's'}.`;
}
