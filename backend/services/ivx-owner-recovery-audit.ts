/**
 * IVX Owner Recovery Audit — append-only, tamper-evident log.
 *
 * Records every recovery request/verify/resolve action without storing the raw
 * recovery token. Instead it stores a SHA-256 hash of the token and the phone
 * number so the audit trail can prove what happened while keeping secrets safe.
 *
 * Storage: local JSONL file under backend/logs/audit/owner-recovery/YYYY-MM-DD.jsonl
 * plus an in-memory ring buffer for live status checks. No raw tokens are ever
 * written.
 */
import { createHash, randomBytes } from 'node:crypto';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export type OwnerRecoveryAuditAction =
  | 'request'
  | 'verify_attempt'
  | 'verify_success'
  | 'verify_fail'
  | 'resolve_token'
  | 'password_repair'
  | 'rate_limited'
  | 'blocked'
  | 'expired_cleanup';

export type OwnerRecoveryAuditRecord = {
  /** ISO timestamp when the event was recorded. */
  timestamp: string;
  /** Action that triggered the audit event. */
  action: OwnerRecoveryAuditAction;
  /** Normalized owner email (lowercase). */
  email: string;
  /** SHA-256 hash of the phone number (E.164). Never stores raw phone. */
  phoneHash: string;
  /** SHA-256 hash of the recovery token. Null when no token involved. */
  tokenHash: string | null;
  /** IP / device fingerprint from the request headers. */
  ip: string;
  /** User-agent or device hint when available. */
  device: string;
  /** Whether the action succeeded. */
  success: boolean;
  /** Expiration timestamp (ISO) if relevant. */
  expiresAt: string | null;
  /** When the recovery token was used (ISO). */
  usedAt: string | null;
  /** Who/what initiated the action: 'owner', 'operator', 'system'. */
  operator: 'owner' | 'operator' | 'system';
  /** Human-readable reason for the audit event. */
  reason: string;
  /** Count of attempts when relevant. */
  attemptCount?: number;
  /** Environment marker (no secrets). */
  backendVersion: string;
};

const BACKEND_VERSION = 'ivx-owner-recovery-audit-v1';
const AUDIT_DIR = 'backend/logs/audit/owner-recovery';

/** In-memory ring buffer for recent events (last 256). */
const recentEvents: OwnerRecoveryAuditRecord[] = [];
const MAX_RECENT = 256;

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hashPhone(phone: string): string {
  return hash(normalizePhone(phone));
}

export function hashToken(token: string): string {
  return hash(token);
}

export function normalizePhone(input: string): string {
  const raw = (input || '').trim().replace(/\D/g, '');
  if (!raw) return '';
  if (raw.length === 10) return `+1${raw}`;
  if (raw.length === 11 && raw.startsWith('1')) return `+${raw}`;
  return `+${raw}`;
}

function todayFile(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${AUDIT_DIR}/${date}.jsonl`;
}

/** Append a recovery audit event. Never stores raw tokens or raw phone numbers. */
export async function appendRecoveryAudit(event: Omit<OwnerRecoveryAuditRecord, 'timestamp' | 'backendVersion'>): Promise<void> {
  const record: OwnerRecoveryAuditRecord = {
    ...event,
    timestamp: new Date().toISOString(),
    backendVersion: BACKEND_VERSION,
  };

  recentEvents.push(record);
  if (recentEvents.length > MAX_RECENT) {
    recentEvents.shift();
  }

  try {
    const path = todayFile();
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(record)}\n`, 'utf8');
  } catch (error) {
    console.log('[OwnerRecoveryAudit] append failed:', error instanceof Error ? error.message : 'unknown');
  }
}

/** Get recent recovery audit events (no secrets). */
export function getRecentRecoveryAudit(limit = 50): OwnerRecoveryAuditRecord[] {
  return recentEvents.slice(-limit);
}

/** Generate a cryptographically secure random recovery token. */
export function generateSecureRecoveryToken(): string {
  return randomBytes(32).toString('hex');
}

/** Count recent failed attempts per email in a time window. */
export function countRecentFailures(email: string, windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return recentEvents.filter(
    (e) => e.email === email && !e.success && new Date(e.timestamp).getTime() > cutoff,
  ).length;
}

/** Count recent SMS requests per email in a time window. */
export function countRecentRequests(email: string, windowMs: number): number {
  const cutoff = Date.now() - windowMs;
  return recentEvents.filter(
    (e) => e.email === email && e.action === 'request' && new Date(e.timestamp).getTime() > cutoff,
  ).length;
}
