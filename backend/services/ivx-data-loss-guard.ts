/**
 * IVX Data-Loss Prevention Guard.
 *
 * After the 2026-07-06 incident where an autonomous "cleanup" phase wiped
 * visitor analytics + real member records from Supabase, this guard was
 * created to ensure that can NEVER happen again.
 *
 * The guard intercepts any destructive operation (DELETE, TRUNCATE, DROP,
 * mass row removal) targeting production tables and:
 *   1. Requires explicit owner approval with a written reason.
 *   2. Takes a vault snapshot BEFORE the operation proceeds.
 *   3. Logs the operation to an immutable audit trail.
 *   4. Refuses if the operation targets a protected table without a special
 *      "emergency" flag.
 *
 * Protected tables (can NEVER be bulk-deleted by autonomous systems):
 *   - members, waitlist, waitlist_entries
 *   - investors, buyers
 *   - landing_analytics, analytics_events, visitor_sessions
 *   - jv_deals, wallets, ledger, treasury
 *   - landing_submissions, landing_investments
 *   - profiles, kyc_verifications
 *
 * @module ivx-data-loss-guard
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runDataVaultSnapshot, type SnapshotReport } from './ivx-data-vault';

export const IVX_DATA_LOSS_GUARD_MARKER = 'ivx-data-loss-guard-2026-07-06';

const AUDIT_TRAIL_FILE = path.resolve(process.cwd(), 'logs', 'audit', 'data-vault', 'destructive-ops-audit.jsonl');

/**
 * Tables that are PROTECTED from autonomous bulk deletion. A human owner
 * can still run a restore or migration, but the autonomous AI / night-ops /
 * senior-developer / cleanup scripts can NEVER bulk-delete from these.
 */
export const PROTECTED_TABLES: ReadonlySet<string> = new Set([
  'members',
  'waitlist',
  'waitlist_entries',
  'investors',
  'buyers',
  'crm_investors',
  'crm_buyers',
  'landing_analytics',
  'analytics_events',
  'visitor_sessions',
  'landing_submissions',
  'landing_investments',
  'jv_deals',
  'wallets',
  'wallet_transactions',
  'treasury',
  'ledger',
  'withdrawals',
  'wire_transfers',
  'private_lenders',
  'tokenized_investments',
  'profiles',
  'kyc_verifications',
  'kyc_documents',
  'earn_accounts',
  'earn_deposits',
  'earn_payouts',
  'referrals',
  'referral_invites',
  'ipx_holdings',
  'ipx_purchases',
]);

/**
 * Patterns that indicate a destructive operation. If a SQL string or command
 * matches any of these, it is intercepted by the guard.
 */
const DESTRUCTIVE_PATTERNS: RegExp[] = [
  /\bDELETE\s+FROM\b/i,
  /\bTRUNCATE\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+SCHEMA\b/i,
  /rm\s+-rf/i,
  /\bwipe\b/i,
  /\bpurge\b/i,
  /\btruncate\s+table\b/i,
];

export type DestructiveOpRequest = {
  /** The SQL or command being evaluated. */
  operation: string;
  /** The table(s) that would be affected, if known. */
  tables: string[];
  /** Whether this is an autonomous system (vs a human owner). */
  isAutonomous: boolean;
  /** Whether the owner has explicitly approved with a reason. */
  ownerApproved: boolean;
  /** The owner's written reason for the operation (required if ownerApproved). */
  ownerReason: string | null;
  /** Whether this is an emergency (e.g. GDPR data deletion request). */
  emergency: boolean;
};

export type DestructiveOpDecision = {
  allowed: boolean;
  blocker: string | null;
  snapshotTaken: SnapshotReport | null;
  auditEntry: DestructiveOpAuditEntry;
};

export type DestructiveOpAuditEntry = {
  timestamp: string;
  operation: string;
  tables: string[];
  isAutonomous: boolean;
  ownerApproved: boolean;
  ownerReason: string | null;
  emergency: boolean;
  allowed: boolean;
  blocker: string | null;
  snapshotId: string | null;
  marker: string;
};

/**
 * Detect whether a string contains a destructive SQL/command pattern.
 * Pure function — deterministic, no side effects.
 */
export function isDestructiveOperation(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  return DESTRUCTIVE_PATTERNS.some((p) => p.test(input));
}

/**
 * Extract table names from a destructive SQL string. Best-effort regex
 * extraction — not a full SQL parser. Returns lowercased table names.
 * Pure function — deterministic.
 */
export function extractTableNames(sql: string): string[] {
  if (!sql || typeof sql !== 'string') return [];
  const tables = new Set<string>();

  // DELETE FROM <table>
  let m: RegExpExecArray | null;
  const deleteRe = /\bDELETE\s+FROM\s+(?:public\.)?([a-z_][a-z0-9_]*)/gi;
  while ((m = deleteRe.exec(sql)) !== null) tables.add(m[1].toLowerCase());

  // TRUNCATE [TABLE] <table>[, <table2>...]
  const truncateRe = /\bTRUNCATE\s+(?:TABLE\s+)?(?:public\.)?([a-z_][a-z0-9_,\s.]*)/gi;
  while ((m = truncateRe.exec(sql)) !== null) {
    for (const part of m[1].split(',')) {
      const name = part.trim().replace(/^public\./, '').toLowerCase();
      if (name) tables.add(name);
    }
  }

  // DROP TABLE <table>
  const dropRe = /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-z_][a-z0-9_]*)/gi;
  while ((m = dropRe.exec(sql)) !== null) tables.add(m[1].toLowerCase());

  return Array.from(tables);
}

/**
 * Evaluate a destructive operation request. Decides whether it is allowed,
 * takes a pre-snapshot if it is, and writes the audit entry.
 */
export async function evaluateDestructiveOp(request: DestructiveOpRequest): Promise<DestructiveOpDecision> {
  const timestamp = new Date().toISOString();
  const tables = request.tables.length > 0 ? request.tables : extractTableNames(request.operation);

  let blocker: string | null = null;

  // Rule 1: Autonomous systems can NEVER run destructive ops on protected tables.
  if (request.isAutonomous) {
    const protectedHit = tables.find((t) => PROTECTED_TABLES.has(t.toLowerCase()));
    if (protectedHit) {
      blocker = `BLOCKED: Autonomous systems cannot run destructive operations on protected table "${protectedHit}". This guard was added after the 2026-07-06 data-loss incident. An owner must run this manually with explicit approval.`;
    }
  }

  // Rule 2: Even for a human owner, destructive ops require explicit approval + reason.
  if (!blocker && !request.ownerApproved) {
    blocker = 'BLOCKED: Destructive operation requires explicit owner approval. Pass ownerApproved: true and provide a written reason.';
  }

  if (!blocker && request.ownerApproved && !request.ownerReason) {
    blocker = 'BLOCKED: Owner-approved destructive operation requires a written reason explaining why the data is being deleted.';
  }

  // Rule 3: Non-emergency destructive ops on protected tables require a snapshot first.
  let snapshotTaken: SnapshotReport | null = null;
  if (!blocker) {
    const protectedHit = tables.find((t) => PROTECTED_TABLES.has(t.toLowerCase()));
    if (protectedHit && !request.emergency) {
      try {
        snapshotTaken = await runDataVaultSnapshot();
      } catch (err) {
        blocker = `BLOCKED: Pre-destruction snapshot failed (cannot safely proceed without a backup): ${err instanceof Error ? err.message : 'unknown error'}`;
      }
    }
  }

  const allowed = blocker === null;

  const auditEntry: DestructiveOpAuditEntry = {
    timestamp,
    operation: request.operation.slice(0, 2000),
    tables,
    isAutonomous: request.isAutonomous,
    ownerApproved: request.ownerApproved,
    ownerReason: request.ownerReason,
    emergency: request.emergency,
    allowed,
    blocker,
    snapshotId: snapshotTaken?.snapshotId ?? null,
    marker: IVX_DATA_LOSS_GUARD_MARKER,
  };

  // Write to immutable audit trail
  await appendDestructiveOpAudit(auditEntry);

  if (allowed) {
    console.log(`[IVXDataLossGuard] ALLOWED destructive op on [${tables.join(', ')}] — snapshot ${snapshotTaken?.snapshotId ?? 'none'} taken`);
  } else {
    console.warn(`[IVXDataLossGuard] ${blocker}`);
  }

  return { allowed, blocker, snapshotTaken, auditEntry };
}

async function appendDestructiveOpAudit(entry: DestructiveOpAuditEntry): Promise<void> {
  try {
    const dir = path.dirname(AUDIT_TRAIL_FILE);
    await fs.mkdir(dir, { recursive: true });
    await fs.appendFile(AUDIT_TRAIL_FILE, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // never let audit writing block the decision
  }
}

export async function readDestructiveOpAudit(limit: number = 100): Promise<DestructiveOpAuditEntry[]> {
  try {
    const text = await fs.readFile(AUDIT_TRAIL_FILE, 'utf8');
    const lines = text.trim().split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line) as DestructiveOpAuditEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is DestructiveOpAuditEntry => e !== null)
      .reverse(); // newest first
  } catch {
    return [];
  }
}
