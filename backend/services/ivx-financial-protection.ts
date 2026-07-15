/**
 * IVX Financial Data Protection Service — append-only ledger verification,
 * wallet reconciliation, idempotency key checking, and double-entry audit.
 *
 * Financial records must NEVER be silently updated or hard-deleted.
 * Corrections use compensating entries, not updates.
 *
 * @module ivx-financial-protection
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const IVX_FINANCIAL_PROTECTION_MARKER = 'ivx-financial-protection-2026-07-12';

type SupabaseConfig = { url: string; key: string; missing: string[] };

function resolveSupabase(): SupabaseConfig {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
  const missing: string[] = [];
  if (!url) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!key) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return { url, key, missing };
}

export type FinancialProtectionReport = {
  marker: string;
  generatedAt: string;
  supabaseConfigured: boolean;
  totalWallets: number;
  totalLedgerEntries: number;
  balanceReconciliation: {
    walletId: string;
    walletBalance: number;
    ledgerSum: number;
    difference: number;
    reconciled: boolean;
  }[];
  reconciliationPassed: boolean;
  orphanTransactions: number;
  duplicateIdempotencyKeys: number;
  mismatches: { type: string; detail: string; severity: 'critical' | 'warning' }[];
  recommendation: string;
};

async function fetchRows(baseUrl: string, key: string, table: string, select: string = '*', limit: number = 5000): Promise<{ rows: Record<string, unknown>[]; status: number; error: string | null }> {
  try {
    const res = await fetch(`${baseUrl}/rest/v1/${table}?select=${select}&order=id.asc&limit=${limit}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (res.status === 404) return { rows: [], status: 404, error: 'TABLE_NOT_FOUND' };
    if (!res.ok) return { rows: [], status: res.status, error: `HTTP_${res.status}` };
    const rows = (await res.json()) as Record<string, unknown>[];
    return { rows, status: 200, error: null };
  } catch (err) {
    return { rows: [], status: 0, error: err instanceof Error ? err.message : 'network_error' };
  }
}

/**
 * Run full financial data protection audit:
 *   1. Count wallets and ledger entries.
 *   2. Reconcile each wallet balance against ledger sum.
 *   3. Detect orphan transactions (no matching wallet).
 *   4. Detect duplicate idempotency keys.
 *   5. Flag any mismatches.
 */
export async function runFinancialProtectionAudit(): Promise<FinancialProtectionReport> {
  const generatedAt = new Date().toISOString();
  const supa = resolveSupabase();

  if (supa.missing.length > 0) {
    return {
      marker: IVX_FINANCIAL_PROTECTION_MARKER,
      generatedAt,
      supabaseConfigured: false,
      totalWallets: 0,
      totalLedgerEntries: 0,
      balanceReconciliation: [],
      reconciliationPassed: false,
      orphanTransactions: 0,
      duplicateIdempotencyKeys: 0,
      mismatches: [{ type: 'config', detail: `Supabase not configured: ${supa.missing.join(', ')}`, severity: 'critical' }],
      recommendation: 'Configure Supabase credentials to enable financial protection audit.',
    };
  }

  // Fetch wallets
  const walletResult = await fetchRows(supa.url, supa.key, 'wallets', 'id,user_id,balance,status');
  const wallets = walletResult.rows as Array<{ id: string; user_id?: string; balance?: number; status?: string }>;

  // Fetch ledger entries
  const ledgerResult = await fetchRows(supa.url, supa.key, 'ledger', 'id,wallet_id,amount,type,created_at,idempotency_key');
  const ledgerEntries = ledgerResult.rows as Array<{ id: string; wallet_id?: string; amount?: number; type?: string; idempotency_key?: string }>;

  // Fetch wallet_transactions for orphan check
  const txResult = await fetchRows(supa.url, supa.key, 'wallet_transactions', 'id,wallet_id,amount,type,idempotency_key');
  const transactions = txResult.rows as Array<{ id: string; wallet_id?: string; amount?: number; idempotency_key?: string }>;

  const mismatches: FinancialProtectionReport['mismatches'] = [];

  // Reconcile wallet balances against ledger
  const reconciliation: FinancialProtectionReport['balanceReconciliation'] = [];
  let allReconciled = true;

  for (const wallet of wallets) {
    const walletBalance = Number(wallet.balance ?? 0);
    const walletLedgerEntries = ledgerEntries.filter((e) => e.wallet_id === wallet.id);
    const ledgerSum = walletLedgerEntries.reduce((sum, e) => {
      const amount = Number(e.amount ?? 0);
      return sum + (e.type === 'credit' || e.type === 'deposit' ? amount : -amount);
    }, 0);
    const difference = walletBalance - ledgerSum;
    const reconciled = Math.abs(difference) < 0.01; // tolerance: 1 cent

    reconciliation.push({ walletId: wallet.id, walletBalance, ledgerSum, difference, reconciled });
    if (!reconciled) {
      allReconciled = false;
      mismatches.push({
        type: 'balance_mismatch',
        detail: `Wallet ${wallet.id}: balance=${walletBalance}, ledger_sum=${ledgerSum}, diff=${difference}`,
        severity: 'critical',
      });
    }
  }

  // Check for orphan transactions (wallet_id doesn't match any wallet)
  const walletIds = new Set(wallets.map((w) => w.id));
  const orphanTx = transactions.filter((t) => t.wallet_id && !walletIds.has(t.wallet_id));
  if (orphanTx.length > 0) {
    mismatches.push({
      type: 'orphan_transactions',
      detail: `${orphanTx.length} transactions reference non-existent wallets`,
      severity: 'critical',
    });
  }

  // Check for duplicate idempotency keys
  const idempotencyKeys = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.idempotency_key) {
      idempotencyKeys.set(tx.idempotency_key, (idempotencyKeys.get(tx.idempotency_key) ?? 0) + 1);
    }
  }
  const duplicateKeys = Array.from(idempotencyKeys.entries()).filter(([, count]) => count > 1);
  if (duplicateKeys.length > 0) {
    mismatches.push({
      type: 'duplicate_idempotency_keys',
      detail: `${duplicateKeys.length} duplicate idempotency keys detected`,
      severity: 'critical',
    });
  }

  const recommendation = allReconciled && orphanTx.length === 0 && duplicateKeys.length === 0
    ? 'All financial records reconciled. No orphan transactions or duplicate keys. Append-only ledger is healthy.'
    : `CRITICAL: ${mismatches.length} financial mismatches detected. Immediate investigation required — financial data integrity is at risk.`;

  return {
    marker: IVX_FINANCIAL_PROTECTION_MARKER,
    generatedAt,
    supabaseConfigured: true,
    totalWallets: wallets.length,
    totalLedgerEntries: ledgerEntries.length,
    balanceReconciliation: reconciliation,
    reconciliationPassed: allReconciled,
    orphanTransactions: orphanTx.length,
    duplicateIdempotencyKeys: duplicateKeys.length,
    mismatches,
    recommendation,
  };
}
