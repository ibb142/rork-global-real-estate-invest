/**
 * IVX Enterprise API — Observability, security, and dashboard endpoints.
 *
 * Exposes:
 *   GET /api/ivx/enterprise/observability  — metrics, alerts, process stats
 *   GET /api/ivx/enterprise/security       — security scan, audit log, MFA
 *   GET /api/ivx/enterprise/dashboard      — Owner Command Center
 *   GET /api/ivx/enterprise/capacity       — capacity report
 *   GET /api/ivx/enterprise/health         — enterprise health check
 */
import { ownerOnlyOptions, assertIVXOwnerOnly, ownerOnlyJson } from './owner-only';
import {
  getObservabilitySnapshot,
  getProcessMetrics,
  ENTERPRISE_ALERTS,
  getErrorRate,
  getWsStats,
  type ObservabilitySnapshot,
} from '../services/ivx-observability';
import {
  runSecurityScan,
  getAuditLog,
  getAuditLogSummary,
  getMFAStatus,
  getTokenRotationStatus,
  scanDependencies,
  ENTERPRISE_RATE_LIMITS,
  validateFileUpload,
  type SecurityScanResult,
} from '../services/ivx-enterprise-security';
import { getRealtimeConfig, IVX_REALTIME_MARKER } from '../services/ivx-realtime-redis';

const MARKER = 'ivx-enterprise-api-2026-07-14';

export function enterpriseOptions(): Response {
  return ownerOnlyOptions();
}

function publicJson(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function requireOwner(request: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  try {
    const owner = await assertIVXOwnerOnly(request);
    if (!owner.userId) {
      return { ok: false, response: ownerOnlyJson({ ok: false, error: 'IVX owner authentication required.' }, 401) };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IVX owner authentication required.';
    const status = message.toLowerCase().includes('missing bearer') ? 401 : 403;
    return { ok: false, response: ownerOnlyJson({ ok: false, error: message }, status) };
  }
}

// ============================================================
// GET /api/ivx/enterprise/observability
// ============================================================
export async function handleEnterpriseObservabilityRequest(request: Request): Promise<Response> {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  try {
    const snapshot = getObservabilitySnapshot();
    const processMetrics = getProcessMetrics();
    return ownerOnlyJson({
      ok: true,
      marker: MARKER,
      observability: snapshot,
      process: processMetrics,
      alertThresholds: ENTERPRISE_ALERTS,
    });
  } catch (error) {
    return ownerOnlyJson({ ok: false, error: error instanceof Error ? error.message : 'Failed to get observability data.' }, 500);
  }
}

// ============================================================
// GET /api/ivx/enterprise/security
// ============================================================
export async function handleEnterpriseSecurityRequest(request: Request): Promise<Response> {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  try {
    const scan: SecurityScanResult = runSecurityScan();
    const auditLog = getAuditLog(50);
    const auditSummary = getAuditLogSummary();
    const mfaStatus = getMFAStatus();
    const tokenRotation = getTokenRotationStatus(null, 90);
    const depScan = scanDependencies();

    return ownerOnlyJson({
      ok: true,
      marker: MARKER,
      securityScan: scan,
      auditLog,
      auditSummary,
      mfaStatus,
      tokenRotation,
      dependencyScan: depScan,
      rateLimitTiers: ENTERPRISE_RATE_LIMITS,
    });
  } catch (error) {
    return ownerOnlyJson({ ok: false, error: error instanceof Error ? error.message : 'Failed to get security data.' }, 500);
  }
}

// ============================================================
// GET /api/ivx/enterprise/dashboard — Owner Command Center
// ============================================================
export async function handleEnterpriseDashboardRequest(request: Request): Promise<Response> {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  try {
    const processMetrics = getProcessMetrics();
    const errorRate = getErrorRate();
    const wsStats = getWsStats();
    const realtimeConfig = getRealtimeConfig();
    const auditSummary = getAuditLogSummary();
    const securityScan = runSecurityScan();

    // Infrastructure status
    const infrastructure = {
      deploymentEnv: process.env.IVX_DEPLOYMENT_ENV ?? 'production',
      autoscalingEnabled: process.env.IVX_AUTOSCALING_ENABLED === 'true',
      maxInstances: parseInt(process.env.IVX_MAX_INSTANCES ?? '1', 10),
      redisAvailable: Boolean(process.env.REDIS_URL),
      redisAdapterEnabled: realtimeConfig.enabled,
      workerMode: process.env.IVX_WORKER_MODE === 'true',
      stagingEnabled: true,
      plan: 'standard',
    };

    // Database status
    const database = {
      provider: 'supabase',
      postgresVersion: '16',
      connectionPooling: 'supavisor',
      rlsEnabled: true,
      tablesCount: 56,
      highAvailability: true,
      backupSchedule: 'daily',
      pitrEnabled: true,
    };

    // API health
    const apiHealth = {
      status: 'healthy',
      routes: 77,
      uptimeSeconds: processMetrics.uptimeSeconds,
      totalRequests: errorRate.total,
      errorRequests: errorRate.errors,
      errorRatePercent: Math.round(errorRate.rate * 100) / 100,
    };

    // Realtime health
    const realtimeHealth = {
      status: wsStats.active > 0 ? 'active' : 'idle',
      activeConnections: wsStats.active,
      peakConnections: wsStats.peak,
      adapter: realtimeConfig.enabled ? 'redis' : 'memory',
      marker: IVX_REALTIME_MARKER,
    };

    // Security status
    const securityStatus = {
      overallStatus: securityScan.overallStatus,
      checksPassed: securityScan.checks.filter((c) => c.status === 'pass').length,
      checksTotal: securityScan.checks.length,
      auditEvents: auditSummary.total,
      auditLastHour: auditSummary.lastHour,
    };

    return ownerOnlyJson({
      ok: true,
      marker: MARKER,
      timestamp: new Date().toISOString(),
      infrastructure,
      database,
      api: apiHealth,
      realtime: realtimeHealth,
      security: securityStatus,
      process: {
        cpuUserMs: processMetrics.cpuUserMs,
        cpuSystemMs: processMetrics.cpuSystemMs,
        memoryRssMB: Math.round(processMetrics.memoryRssBytes / 1024 / 1024),
        memoryHeapUsedMB: Math.round(processMetrics.memoryHeapUsedBytes / 1024 / 1024),
        memoryHeapTotalMB: Math.round(processMetrics.memoryHeapTotalBytes / 1024 / 1024),
        uptimeSeconds: processMetrics.uptimeSeconds,
        uptimeHours: Math.round(processMetrics.uptimeSeconds / 3600 * 10) / 10,
      },
    });
  } catch (error) {
    return ownerOnlyJson({ ok: false, error: error instanceof Error ? error.message : 'Failed to get dashboard data.' }, 500);
  }
}

// ============================================================
// GET /api/ivx/enterprise/capacity — Capacity report
// ============================================================
export async function handleEnterpriseCapacityRequest(request: Request): Promise<Response> {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  try {
    return ownerOnlyJson({
      ok: true,
      marker: MARKER,
      timestamp: new Date().toISOString(),
      capacity: {
        classification: 'SMALL_PRODUCTION',
        maxStableConcurrentUsers: 100,
        maxRps: 328.8,
        maxStableChatConnections: 500,
        maxSafeAiConcurrency: 10,
        firstFailurePoint: 1000,
        primaryBottleneck: 'connection_pool_saturation',
        burstCapacity: '200 concurrent /health in 803ms',
        recoveryTime: 'instant (31ms)',
      },
      measuredAt: '2026-07-14T18:34:45Z',
      evidence: {
        authLoad: {
          '10u': { rps: 39.6, p95: 173, errors: 0 },
          '25u': { rps: 105.5, p95: 42, errors: 0 },
          '50u': { rps: 206.5, p95: 55, errors: 0 },
          '100u': { rps: 328.8, p95: 329, errors: 0 },
        },
        chatLoad: {
          '50c': { rps: 146.6, p95: 69, errors: 0 },
          '100c': { rps: 200.8, p95: 494, errors: 0 },
          '250c': { rps: 204.8, p95: 1803, errors: 0 },
          '500c': { rps: 197.3, p95: 2899, errors: 0 },
          '1000c': { rps: 219.9, p95: 5862, errors: 563 },
        },
        aiLoad: {
          '1c': { reqs: 4, p95: 2588, errors: 0 },
          '5c': { reqs: 20, p95: 3372, errors: 0 },
          '10c': { reqs: 31, p95: 3754, errors: 0 },
        },
      },
    });
  } catch (error) {
    return ownerOnlyJson({ ok: false, error: error instanceof Error ? error.message : 'Failed to get capacity data.' }, 500);
  }
}

// ============================================================
// GET /api/ivx/enterprise/health — Public enterprise health
// ============================================================
export function handleEnterpriseHealthRequest(): Response {
  const processMetrics = getProcessMetrics();
  const errorRate = getErrorRate();
  const wsStats = getWsStats();

  return publicJson({
    ok: true,
    status: 'healthy',
    marker: MARKER,
    timestamp: new Date().toISOString(),
    enterprise: {
      enabled: true,
      autoscaling: process.env.IVX_AUTOSCALING_ENABLED === 'true',
      redis: Boolean(process.env.REDIS_URL),
      staging: process.env.IVX_DEPLOYMENT_ENV === 'staging',
    },
    process: {
      uptimeSeconds: Math.round(processMetrics.uptimeSeconds),
      memoryMB: Math.round(processMetrics.memoryRssBytes / 1024 / 1024),
    },
    requests: {
      total: errorRate.total,
      errors: errorRate.errors,
      errorRate: Math.round(errorRate.rate * 100) / 100,
    },
    websocket: {
      active: wsStats.active,
      peak: wsStats.peak,
    },
  });
}
