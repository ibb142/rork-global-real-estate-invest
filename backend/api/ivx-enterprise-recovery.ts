/**
 * IVX Enterprise Recovery API — new endpoints for the enterprise data
 * protection system. These extend the existing restore-center endpoints
 * with monitoring, validation, storage backup, financial protection, and
 * recovery objectives.
 *
 * All endpoints are owner-only (assertIVXOwnerOnly).
 *
 * Routes:
 *   GET  /api/ivx/recovery/objectives              — RPO/RTO targets and gaps
 *   GET  /api/ivx/recovery/monitoring               — unified monitoring dashboard
 *   GET  /api/ivx/recovery/alerts                   — recent recovery alerts
 *   GET  /api/ivx/recovery/validate                 — validate latest backup
 *   POST /api/ivx/recovery/validate                 — trigger validation now
 *   GET  /api/ivx/storage/audit                     — storage bucket audit
 *   GET  /api/ivx/storage/manifest/:bucket          — per-object manifest
 *   GET  /api/ivx/financial-protection/audit        — financial reconciliation
 *   GET  /api/ivx/recovery/runbook                  — disaster recovery runbook
 *   GET  /api/ivx/recovery/overview                 — full enterprise dashboard
 *
 * @module ivx-enterprise-recovery-api
 */

import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import { getRecoveryObjectiveReport } from '../services/ivx-enterprise-recovery-config';
import { runMonitoringChecks, readMonitoringState } from '../services/ivx-recovery-monitoring';
import { readRecoveryAlerts, validateLatestBackup, createRecoveryAlert } from '../services/ivx-backup-validation';
import { auditStorageBuckets, buildBucketManifest, readStorageManifest } from '../services/ivx-storage-backup';
import { runFinancialProtectionAudit } from '../services/ivx-financial-protection';
import { getDataVaultState, listSnapshots } from '../services/ivx-data-vault';
import { checkPitrStatus } from '../services/ivx-pitr-status';
import { PROTECTED_TABLES, readDestructiveOpAudit } from '../services/ivx-data-loss-guard';

const H = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
} as const;

function fail(status: number, error: string, detail?: string): Response {
  return new Response(JSON.stringify({ ok: false, error, detail }), { status, headers: H });
}

function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: H });
}

// ---------------------------------------------------------------------------

export function enterpriseRecoveryOptions(): Response {
  return new Response(null, { status: 204, headers: H });
}

// ---------------------------------------------------------------------------

/** GET /api/ivx/recovery/objectives — RPO/RTO targets and gaps */
export async function handleRecoveryObjectives(req: Request): Promise<Response> {
  const auth = await assertIVXOwnerOnly(req);
  if (!auth.ok) return fail(401, 'unauthorized', auth.reason);

  const state = await getDataVaultState();
  const pitr = await checkPitrStatus(state.totalSnapshots, state.lastSnapshotAt);
  const report = getRecoveryObjectiveReport(
    pitr.pitrDashboardConfirmed,
    state.totalSnapshots,
    state.lastSnapshotAt,
  );

  return json({ ok: true, ...report });
}

// ---------------------------------------------------------------------------

/** GET /api/ivx/recovery/monitoring — unified monitoring dashboard */
export async function handleRecoveryMonitoring(req: Request): Promise<Response> {
  const auth = await assertIVXOwnerOnly(req);
  if (!auth.ok) return fail(401, 'unauthorized', auth.reason);

  const report = await runMonitoringChecks();
  return json({ ok: true, ...report });
}

// ---------------------------------------------------------------------------

/** GET /api/ivx/recovery/alerts — recent recovery alerts */
export async function handleRecoveryAlerts(req: Request): Promise<Response> {
  const auth = await assertIVXOwnerOnly(req);
  if (!auth.ok) return fail(401, 'unauthorized', auth.reason);

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const alerts = await readRecoveryAlerts(limit);
  return json({ ok: true, alerts, count: alerts.length });
}

// ---------------------------------------------------------------------------

/** GET/POST /api/ivx/recovery/validate — validate latest backup */
export async function handleRecoveryValidate(req: Request): Promise<Response> {
  const auth = await assertIVXOwnerOnly(req);
  if (!auth.ok) return fail(401, 'unauthorized', auth.reason);

  const report = await validateLatestBackup();
  return json({ ok: true, ...report });
}

// ---------------------------------------------------------------------------

/** GET /api/ivx/storage/audit — storage bucket audit */
export async function handleStorageAudit(req: Request): Promise<Response> {
  const auth = await assertIVXOwnerOnly(req);
  if (!auth.ok) return fail(401, 'unauthorized', auth.reason);

  const report = await auditStorageBuckets();
  return json({ ok: true, ...report });
}

// ---------------------------------------------------------------------------

/** GET /api/ivx/storage/manifest/:bucket — per-object manifest */
export async function handleStorageManifest(req: Request, bucket: string): Promise<Response> {
  const auth = await assertIVXOwnerOnly(req);
  if (!auth.ok) return fail(401, 'unauthorized', auth.reason);

  if (!bucket || !/^[a-z0-9-]+$/.test(bucket)) {
    return fail(400, 'invalid_bucket_name');
  }

  const manifest = await buildBucketManifest(bucket);
  return json({ ok: true, ...manifest });
}

// ---------------------------------------------------------------------------

/** GET /api/ivx/storage/manifest-history — storage manifest history */
export async function handleStorageManifestHistory(req: Request): Promise<Response> {
  const auth = await assertIVXOwnerOnly(req);
  if (!auth.ok) return fail(401, 'unauthorized', auth.reason);

  const history = await readStorageManifest(50);
  return json({ ok: true, history, count: history.length });
}

// ---------------------------------------------------------------------------

/** GET /api/ivx/financial-protection/audit — financial reconciliation */
export async function handleFinancialProtectionAudit(req: Request): Promise<Response> {
  const auth = await assertIVXOwnerOnly(req);
  if (!auth.ok) return fail(401, 'unauthorized', auth.reason);

  const report = await runFinancialProtectionAudit();
  return json({ ok: true, ...report });
}

// ---------------------------------------------------------------------------

/** GET /api/ivx/recovery/runbook — disaster recovery runbook (metadata) */
export async function handleRecoveryRunbook(req: Request): Promise<Response> {
  const auth = await assertIVXOwnerOnly(req);
  if (!auth.ok) return fail(401, 'unauthorized', auth.reason);

  return json({
    ok: true,
    runbook: {
      path: 'docs/DISASTER-RECOVERY-RUNBOOK.md',
      scenarios: [
        'accidental_deletion',
        'bad_migration',
        'compromised_credentials',
        'corrupted_database',
        'supabase_outage',
        'render_outage',
        'region_outage',
        'storage_deletion',
        'ransomware_hostile_mutation',
        'wrong_project_deployment',
      ],
      endpoints: {
        dataVault: '/api/ivx/data-vault/*',
        restoreCenter: '/api/ivx/restore-center/*',
        monitoring: '/api/ivx/recovery/monitoring',
        alerts: '/api/ivx/recovery/alerts',
        objectives: '/api/ivx/recovery/objectives',
        storage: '/api/ivx/storage/audit',
        financial: '/api/ivx/financial-protection/audit',
      },
    },
  });
}

// ---------------------------------------------------------------------------

/** GET /api/ivx/recovery/overview — full enterprise dashboard */
export async function handleRecoveryOverview(req: Request): Promise<Response> {
  const auth = await assertIVXOwnerOnly(req);
  if (!auth.ok) return fail(401, 'unauthorized', auth.reason);

  const [objectivesState, monitoring, vaultState, pitr, snapshots, guardAudit, validation, financial, storage] = await Promise.all([
    getDataVaultState(),
    runMonitoringChecks(),
    getDataVaultState(),
    checkPitrStatus(),
    listSnapshots(10),
    readDestructiveOpAudit(20),
    validateLatestBackup(),
    runFinancialProtectionAudit(),
    auditStorageBuckets(),
  ]);

  const objectivesReport = getRecoveryObjectiveReport(
    pitr.pitrDashboardConfirmed,
    vaultState.totalSnapshots,
    vaultState.lastSnapshotAt,
  );

  return json({
    ok: true,
    marker: 'ivx-enterprise-recovery-overview-2026-07-12',
    generatedAt: new Date().toISOString(),
    objectives: objectivesReport,
    monitoring,
    vault: {
      state: vaultState,
      recentSnapshots: snapshots,
      totalSnapshots: vaultState.totalSnapshots,
    },
    pitr: {
      supabaseReachable: pitr.supabaseReachable,
      pitrDashboardConfirmed: pitr.pitrDashboardConfirmed,
      pitrAlert: pitr.pitrAlert,
      restoreWindowNote: pitr.restoreWindowNote,
      newestWriteAt: pitr.newestWriteAt,
    },
    guard: {
      protectedTablesCount: PROTECTED_TABLES.size,
      protectedTables: Array.from(PROTECTED_TABLES).sort(),
      recentAudit: guardAudit.slice(0, 10),
      blockedCount: guardAudit.filter((a) => !a.allowed).length,
    },
    validation,
    financial: {
      totalWallets: financial.totalWallets,
      totalLedgerEntries: financial.totalLedgerEntries,
      reconciliationPassed: financial.reconciliationPassed,
      orphanTransactions: financial.orphanTransactions,
      duplicateIdempotencyKeys: financial.duplicateIdempotencyKeys,
      mismatches: financial.mismatches,
      recommendation: financial.recommendation,
    },
    storage: {
      bucketsProtected: storage.bucketsProtected,
      totalObjects: storage.totalObjects,
      totalBytes: storage.totalBytes,
      buckets: storage.buckets,
    },
    activeAlerts: validation.alerts.length,
    overallStatus: monitoring.overallStatus,
  });
}

// ---------------------------------------------------------------------------

/** POST /api/ivx/recovery/alert — create a manual alert */
export async function handleCreateAlert(req: Request): Promise<Response> {
  const auth = await assertIVXOwnerOnly(req);
  if (!auth.ok) return fail(401, 'unauthorized', auth.reason);

  try {
    const body = await req.json() as {
      service: string;
      entity: string;
      severity: 'critical' | 'warning' | 'info';
      message: string;
      ownerActionRequired?: string;
      affectedRecords?: number;
    };

    if (!body.service || !body.message) {
      return fail(400, 'missing_required_fields', 'service and message are required');
    }

    const alert = await createRecoveryAlert({
      service: body.service,
      entity: body.entity || 'manual',
      severity: body.severity || 'info',
      message: body.message,
      ownerActionRequired: body.ownerActionRequired ?? null,
      affectedRecords: body.affectedRecords,
    });

    return json({ ok: true, alert });
  } catch {
    return fail(400, 'invalid_json_body');
  }
}
