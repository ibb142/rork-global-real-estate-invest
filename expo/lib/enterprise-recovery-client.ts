/**
 * IVX Enterprise Recovery API client — calls the backend recovery endpoints.
 * All endpoints require owner JWT authentication.
 */

import { getIVXAccessToken } from './ivx-supabase-client';

const API_BASE = (process.env.EXPO_PUBLIC_IVX_API_BASE_URL || 'https://api.ivxholding.com').replace(/\/+$/, '');

async function authedFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const token = await getIVXAccessToken();
  if (!token) throw new Error('Owner authentication required for recovery API');
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
}

async function authedJson<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await authedFetch(path, options);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------

export type RecoveryObjectives = {
  marker: string;
  generatedAt: string;
  objectives: {
    rpoTargetMinutes: number;
    rtoTargetMinutes: number;
    criticalRpoMinutes: number;
    storageRpoHours: number;
    dailyRetentionDays: number;
    monthlyRetentionMonths: number;
    restoreDrillFrequencyDays: number;
    drDrillFrequencyDays: number;
    snapshotFrequencyHours: number;
    offsiteCopyFrequencyHours: number;
    pitrRetentionDays: number;
  };
  justification: string[];
  supportedValues: Record<string, string>;
  gaps: string[];
};

export async function fetchRecoveryObjectives(): Promise<RecoveryObjectives> {
  return authedJson('/api/ivx/recovery/objectives');
}

// ---------------------------------------------------------------------------

export type MonitoringReport = {
  marker: string;
  generatedAt: string;
  checks: {
    service: string;
    entity: string;
    status: 'healthy' | 'warning' | 'critical';
    detail: string;
    lastChecked: string;
  }[];
  overallStatus: 'healthy' | 'warning' | 'critical';
  activeAlerts: number;
  rpoCompliant: boolean;
  rtoCompliant: boolean;
  recommendation: string;
};

export async function fetchMonitoringReport(): Promise<MonitoringReport> {
  return authedJson('/api/ivx/recovery/monitoring');
}

// ---------------------------------------------------------------------------

export type RecoveryAlert = {
  alertId: string;
  timestamp: string;
  service: string;
  entity: string;
  severity: 'critical' | 'warning' | 'info';
  traceId: string;
  affectedRecords: number;
  message: string;
  ownerActionRequired: string | null;
  automaticResponse: string;
};

export async function fetchRecoveryAlerts(limit: number = 100): Promise<{ alerts: RecoveryAlert[]; count: number }> {
  return authedJson(`/api/ivx/recovery/alerts?limit=${limit}`);
}

// ---------------------------------------------------------------------------

export type BackupValidationReport = {
  marker: string;
  validatedAt: string;
  snapshotId: string | null;
  checks: {
    check: string;
    passed: boolean;
    detail: string;
    severity: 'critical' | 'warning' | 'info';
  }[];
  passed: number;
  failed: number;
  overallPassed: boolean;
  alerts: RecoveryAlert[];
};

export async function fetchBackupValidation(): Promise<BackupValidationReport> {
  return authedJson('/api/ivx/recovery/validate');
}

// ---------------------------------------------------------------------------

export type StorageBackupReport = {
  marker: string;
  generatedAt: string;
  supabaseConfigured: boolean;
  buckets: {
    bucket: string;
    exists: boolean;
    objectCount: number;
    totalBytes: number;
    versioning: boolean;
    publicRead: boolean;
    lastModified: string | null;
    error: string | null;
  }[];
  totalObjects: number;
  totalBytes: number;
  bucketsProtected: number;
  offSiteCopyReady: boolean;
};

export async function fetchStorageAudit(): Promise<StorageBackupReport> {
  return authedJson('/api/ivx/storage/audit');
}

// ---------------------------------------------------------------------------

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

export async function fetchFinancialProtection(): Promise<FinancialProtectionReport> {
  return authedJson('/api/ivx/financial-protection/audit');
}

// ---------------------------------------------------------------------------

export type RecoveryOverview = {
  ok: boolean;
  marker: string;
  generatedAt: string;
  objectives: RecoveryObjectives;
  monitoring: MonitoringReport;
  vault: {
    state: {
      marker: string;
      config: { intervalMs: number; enabled: boolean; maxSnapshots: number; tables: string[] };
      lastSnapshotAt: string | null;
      lastSnapshotId: string | null;
      totalSnapshots: number;
      nextScheduledRun: string | null;
    };
    recentSnapshots: { snapshotId: string; path: string; sizeBytes: number; mtime: string; totalRows: number; tableCount: number }[];
    totalSnapshots: number;
  };
  pitr: {
    supabaseReachable: boolean;
    pitrDashboardConfirmed: boolean | null;
    pitrAlert: string | null;
    restoreWindowNote: string;
    newestWriteAt: string | null;
  };
  guard: {
    protectedTablesCount: number;
    protectedTables: string[];
    recentAudit: { timestamp: string; operation: string; allowed: boolean; blocker: string | null }[];
    blockedCount: number;
  };
  validation: BackupValidationReport;
  financial: {
    totalWallets: number;
    totalLedgerEntries: number;
    reconciliationPassed: boolean;
    orphanTransactions: number;
    duplicateIdempotencyKeys: number;
    mismatches: { type: string; detail: string; severity: string }[];
    recommendation: string;
  };
  storage: {
    bucketsProtected: number;
    totalObjects: number;
    totalBytes: number;
    buckets: StorageBackupReport['buckets'];
  };
  activeAlerts: number;
  overallStatus: 'healthy' | 'warning' | 'critical';
};

export async function fetchRecoveryOverview(): Promise<RecoveryOverview> {
  return authedJson('/api/ivx/recovery/overview');
}

// ---------------------------------------------------------------------------

export async function triggerSnapshot(): Promise<{ ok: boolean; snapshotId: string }> {
  return authedJson('/api/ivx/data-vault/snapshot', { method: 'POST' });
}

export async function runRecoveryDrill(): Promise<{ ok: boolean; overallPassed: boolean; summary: { passed: number; failed: number; total: number } }> {
  return authedJson('/api/ivx/restore-center/drill', { method: 'POST' });
}

export async function generateReport(): Promise<{ ok: boolean; report: { recoveryRisk: string; recommendation: string } }> {
  return authedJson('/api/ivx/restore-center/report', { method: 'POST' });
}
