import { cleanForeignKeys, runStorageIntegrityCheck } from '@/lib/project-storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { runStartupHealthCheck } from '@/lib/startup-health';
import {
  runFullHealthCheck,
  type HealthCheck as FullHealthCheck,
  type SystemHealthSnapshot,
} from '@/lib/system-health-checker';

export type AIOpsOverallStatus = 'healthy' | 'degraded' | 'critical';
export type AIOpsSeverity = 'healthy' | 'warning' | 'critical';
export type AIOpsCapabilityLevel = 'automatic' | 'assisted' | 'human_required';
export type AIOpsCapabilityStatus = 'available' | 'partial' | 'blocked';
export type AIOpsRepairAction =
  | 'rerun-scan'
  | 'check-storage-integrity'
  | 'clean-foreign-storage-keys'
  | 'verify-supabase-config'
  | 'verify-landing-reachability'
  | 'inspect-realtime';

export interface AIOpsMetric {
  id: string;
  label: string;
  value: string;
  tone: AIOpsSeverity;
}

export interface AIOpsModuleStatus {
  id: string;
  title: string;
  subtitle: string;
  status: AIOpsSeverity;
  detail: string;
}

export interface AIOpsIncident {
  id: string;
  title: string;
  source: string;
  severity: AIOpsSeverity;
  summary: string;
  recommendedAction?: AIOpsRepairAction;
  autoRepairEligible: boolean;
}

export interface AIOpsCapability {
  id: string;
  title: string;
  level: AIOpsCapabilityLevel;
  status: AIOpsCapabilityStatus;
  detail: string;
}

export interface AIOpsRepairResult {
  action: AIOpsRepairAction;
  success: boolean;
  title: string;
  message: string;
  details: string[];
  executedAt: string;
}

export interface AIOpsSnapshot {
  scannedAt: string;
  overallStatus: AIOpsOverallStatus;
  honestyStatement: string;
  promise: string;
  metrics: AIOpsMetric[];
  modules: AIOpsModuleStatus[];
  incidents: AIOpsIncident[];
  capabilities: AIOpsCapability[];
}

export interface RunAIOpsScanOptions {
  force?: boolean;
  fullHealthSnapshot?: SystemHealthSnapshot;
}

interface AIOpsSnapshotCacheEntry {
  snapshot: AIOpsSnapshot;
  timestamp: number;
}

const AI_OPS_SNAPSHOT_CACHE_MS = 120_000;

let cachedAIOpsSnapshot: AIOpsSnapshotCacheEntry | null = null;
let inFlightAIOpsSnapshot: Promise<AIOpsSnapshot> | null = null;

function getCachedAIOpsSnapshot(): AIOpsSnapshot | null {
  if (!cachedAIOpsSnapshot) {
    return null;
  }

  const ageMs = Date.now() - cachedAIOpsSnapshot.timestamp;
  if (ageMs > AI_OPS_SNAPSHOT_CACHE_MS) {
    cachedAIOpsSnapshot = null;
    return null;
  }

  console.log('[AIOps] Returning cached snapshot from', ageMs, 'ms ago');
  return cachedAIOpsSnapshot.snapshot;
}

function setCachedAIOpsSnapshot(snapshot: AIOpsSnapshot): void {
  cachedAIOpsSnapshot = {
    snapshot,
    timestamp: Date.now(),
  };
}

function toSeverityFromFullStatus(status: 'green' | 'yellow' | 'red'): AIOpsSeverity {
  if (status === 'red') {
    return 'critical';
  }
  if (status === 'yellow') {
    return 'warning';
  }
  return 'healthy';
}

function toSeverityFromStartupStatus(status: 'pass' | 'warn' | 'fail'): AIOpsSeverity {
  if (status === 'fail') {
    return 'critical';
  }
  if (status === 'warn') {
    return 'warning';
  }
  return 'healthy';
}

function toOverallStatus(criticalCount: number, warningCount: number): AIOpsOverallStatus {
  if (criticalCount > 0) {
    return 'critical';
  }
  if (warningCount > 0) {
    return 'degraded';
  }
  return 'healthy';
}

function toMetricTone(status: AIOpsOverallStatus): AIOpsSeverity {
  if (status === 'degraded') {
    return 'warning';
  }

  return status;
}

function findCheck(checks: FullHealthCheck[], id: string): FullHealthCheck | undefined {
  return checks.find((check) => check.id === id);
}

function getRealtimeChannelCount(): number {
  const client = supabase as unknown as { getChannels?: () => unknown[] };
  const channels = client.getChannels?.() ?? [];
  return channels.length;
}

function createCapabilities(): AIOpsCapability[] {
  return [
    {
      id: 'safe-storage-repair',
      title: 'Storage isolation cleanup',
      level: 'automatic',
      status: 'available',
      detail: 'AI can detect foreign AsyncStorage keys, re-run integrity checks, and remove leaked scoped keys safely.',
    },
    {
      id: 'health-rescan',
      title: 'Continuous health rescans',
      level: 'automatic',
      status: 'available',
      detail: 'AI can re-run startup and full health checks, summarize incidents, and keep an updated operations view.',
    },
    {
      id: 'incident-triage',
      title: 'Incident triage and recommendations',
      level: 'assisted',
      status: 'available',
      detail: 'AI can classify issues, propose next actions, and surface what is safe to repair versus what needs approval.',
    },
    {
      id: 'frontend-backend-code-editing',
      title: 'Autonomous code patching',
      level: 'human_required',
      status: 'blocked',
      detail: 'AI should not silently modify production frontend/backend code and deploy it without review or approval.',
    },
    {
      id: 'aws-and-secrets',
      title: 'AWS, secrets, and infrastructure control',
      level: 'human_required',
      status: 'blocked',
      detail: 'AI can inspect configuration health, but secret rotation, infra changes, and production risk changes still require a human owner.',
    },
    {
      id: 'payments-and-db',
      title: 'Payments, schema changes, and irreversible operations',
      level: 'human_required',
      status: 'blocked',
      detail: 'AI can detect failures and prepare recovery steps, but money movement, migrations, and destructive fixes require human oversight.',
    },
  ];
}

async function verifyLandingReachability(): Promise<{ success: boolean; message: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('https://ivxholding.com', {
      method: 'HEAD',
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        success: false,
        message: `Landing reachability check failed with HTTP ${response.status}`,
      };
    }

    return {
      success: true,
      message: `Landing responded with HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      message: (error as Error)?.message ?? 'Landing reachability check failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runAIOpsScan(options: RunAIOpsScanOptions = {}): Promise<AIOpsSnapshot> {
  const force = options.force ?? false;

  if (inFlightAIOpsSnapshot) {
    console.log('[AIOps] Joining in-flight AI operations scan');
    return inFlightAIOpsSnapshot;
  }

  if (!force) {
    const cachedSnapshot = getCachedAIOpsSnapshot();
    if (cachedSnapshot) {
      return cachedSnapshot;
    }
  }

  inFlightAIOpsSnapshot = (async (): Promise<AIOpsSnapshot> => {
    console.log('[AIOps] Running AI operations scan', force ? '(forced)' : '(cached mode)');

    const [startupHealth, fullHealth] = await Promise.all([
      runStartupHealthCheck({ force }),
      options.fullHealthSnapshot ? Promise.resolve(options.fullHealthSnapshot) : runFullHealthCheck({ force }),
    ]);

  const landingCheck = findCheck(fullHealth.checks, 'landing-page');
  const apiReadinessCheck = findCheck(fullHealth.checks, 'landing-api-readiness');
  const dbCheck = findCheck(fullHealth.checks, 'supabase-db');
  const authCheck = findCheck(fullHealth.checks, 'supabase-auth');
  const realtimeCheck = findCheck(fullHealth.checks, 'supabase-realtime');
  const awsCheck = findCheck(fullHealth.checks, 'aws-infra');
  const secureStoreCheck = findCheck(fullHealth.checks, 'secure-store');

  const moduleStatuses: AIOpsModuleStatus[] = [
    {
      id: 'frontend',
      title: 'Frontend + landing',
      subtitle: 'App shell, landing reachability, route rendering',
      status: landingCheck ? toSeverityFromFullStatus(landingCheck.status) : 'warning',
      detail: landingCheck?.message ?? 'Landing status unavailable',
    },
    {
      id: 'backend',
      title: 'Backend + Supabase API',
      subtitle: 'Database connectivity, API readiness, auth reachability',
      status: dbCheck?.status === 'red' || authCheck?.status === 'red' || apiReadinessCheck?.status === 'red'
        ? 'critical'
        : dbCheck?.status === 'yellow' || authCheck?.status === 'yellow' || apiReadinessCheck?.status === 'yellow'
          ? 'warning'
          : 'healthy',
      detail: [dbCheck?.message, authCheck?.message, apiReadinessCheck?.message].filter(Boolean).join(' · '),
    },
    {
      id: 'storage',
      title: 'Local storage isolation',
      subtitle: 'Project scoping, foreign-key cleanup, integrity audit',
      status: toSeverityFromStartupStatus(startupHealth.checks.storageIntegrity.status),
      detail: startupHealth.checks.storageIntegrity.message,
    },
    {
      id: 'realtime',
      title: 'Realtime sync layer',
      subtitle: 'Socket connectivity and subscription readiness',
      status: realtimeCheck ? toSeverityFromFullStatus(realtimeCheck.status) : 'warning',
      detail: realtimeCheck?.message ?? 'Realtime status unavailable',
    },
    {
      id: 'infrastructure',
      title: 'AWS + infra guardrails',
      subtitle: 'Environment presence and infra readiness only',
      status: awsCheck ? toSeverityFromFullStatus(awsCheck.status) : 'warning',
      detail: awsCheck?.message ?? 'AWS readiness unavailable',
    },
    {
      id: 'security',
      title: 'Security + session layer',
      subtitle: 'Auth state, secure token store, access boundaries',
      status: authCheck?.status === 'red' || secureStoreCheck?.status === 'red'
        ? 'critical'
        : authCheck?.status === 'yellow' || secureStoreCheck?.status === 'yellow'
          ? 'warning'
          : 'healthy',
      detail: [authCheck?.message, secureStoreCheck?.message].filter(Boolean).join(' · '),
    },
  ];

  const incidents: AIOpsIncident[] = [];

  if (startupHealth.checks.storageIntegrity.status !== 'pass') {
    incidents.push({
      id: 'storage-integrity',
      title: 'Storage isolation needs attention',
      source: 'project-storage',
      severity: toSeverityFromStartupStatus(startupHealth.checks.storageIntegrity.status),
      summary: startupHealth.checks.storageIntegrity.message,
      recommendedAction: 'check-storage-integrity',
      autoRepairEligible: true,
    });
  }

  if (startupHealth.warnings.length > 0) {
    const needsForeignCleanup = startupHealth.warnings.some((warning) => warning.toLowerCase().includes('foreign'));
    incidents.push({
      id: 'startup-warnings',
      title: 'Startup health warnings detected',
      source: 'startup-health',
      severity: startupHealth.errors.length > 0 ? 'critical' : 'warning',
      summary: [...startupHealth.warnings, ...startupHealth.errors].join(' · '),
      recommendedAction: needsForeignCleanup ? 'clean-foreign-storage-keys' : 'rerun-scan',
      autoRepairEligible: true,
    });
  }

  if (landingCheck && landingCheck.status !== 'green') {
    incidents.push({
      id: 'landing-reachability',
      title: 'Landing page health is degraded',
      source: 'landing-page',
      severity: toSeverityFromFullStatus(landingCheck.status),
      summary: landingCheck.message,
      recommendedAction: 'verify-landing-reachability',
      autoRepairEligible: true,
    });
  }

  if (realtimeCheck && realtimeCheck.status !== 'green') {
    incidents.push({
      id: 'realtime-sync',
      title: 'Realtime layer is not fully healthy',
      source: 'supabase-realtime',
      severity: toSeverityFromFullStatus(realtimeCheck.status),
      summary: realtimeCheck.message,
      recommendedAction: 'inspect-realtime',
      autoRepairEligible: true,
    });
  }

  if ((dbCheck && dbCheck.status !== 'green') || (authCheck && authCheck.status !== 'green')) {
    incidents.push({
      id: 'backend-core',
      title: 'Core backend requires review',
      source: 'supabase-core',
      severity: dbCheck?.status === 'red' || authCheck?.status === 'red' ? 'critical' : 'warning',
      summary: [dbCheck?.message, authCheck?.message].filter(Boolean).join(' · '),
      recommendedAction: 'verify-supabase-config',
      autoRepairEligible: false,
    });
  }

  if (awsCheck && awsCheck.status !== 'green') {
    incidents.push({
      id: 'aws-readiness',
      title: 'AWS infrastructure needs owner review',
      source: 'aws',
      severity: toSeverityFromFullStatus(awsCheck.status),
      summary: awsCheck.message,
      autoRepairEligible: false,
    });
  }

  const criticalCount = incidents.filter((incident) => incident.severity === 'critical').length;
  const warningCount = incidents.filter((incident) => incident.severity === 'warning').length;
  const automaticCount = createCapabilities().filter((capability) => capability.level === 'automatic' && capability.status === 'available').length;
  const autoRepairEligibleCount = incidents.filter((incident) => incident.autoRepairEligible).length;
  const healthyModuleCount = moduleStatuses.filter((moduleStatus) => moduleStatus.status === 'healthy').length;

  const overallStatus = toOverallStatus(criticalCount, warningCount);
  const metrics: AIOpsMetric[] = [
    {
      id: 'incidents',
      label: 'Open incidents',
      value: `${incidents.length}`,
      tone: incidents.length === 0 ? 'healthy' : toMetricTone(overallStatus),
    },
    {
      id: 'auto-repair-coverage',
      label: 'Safe auto-repair coverage',
      value: `${autoRepairEligibleCount}/${incidents.length || 1}`,
      tone: autoRepairEligibleCount > 0 ? 'healthy' : 'warning',
    },
    {
      id: 'healthy-modules',
      label: 'Healthy modules',
      value: `${healthyModuleCount}/${moduleStatuses.length}`,
      tone: healthyModuleCount === moduleStatuses.length ? 'healthy' : toMetricTone(overallStatus),
    },
    {
      id: 'available-automation',
      label: 'Available automation lanes',
      value: `${automaticCount}`,
      tone: automaticCount > 0 ? 'healthy' : 'warning',
    },
  ];

    const snapshot: AIOpsSnapshot = {
      scannedAt: new Date().toISOString(),
      overallStatus,
      honestyStatement: 'Honest answer: no AI can guarantee 100% no-crash, no-human app operations. What AI can do well is monitor, classify, retry safe fixes, clean isolated storage issues, and prepare repair steps fast.',
      promise: 'This control center is AI-assisted and self-healing for safe recoveries only. Code changes, deployments, payments, database migrations, AWS changes, and security-sensitive fixes still need human approval.',
      metrics,
      modules: moduleStatuses,
      incidents,
      capabilities: createCapabilities(),
    };

    setCachedAIOpsSnapshot(snapshot);
    return snapshot;
  })();

  return inFlightAIOpsSnapshot.finally(() => {
    inFlightAIOpsSnapshot = null;
  });
}

export async function executeSafeRepairAction(action: AIOpsRepairAction): Promise<AIOpsRepairResult> {
  console.log('[AIOps] Executing repair action:', action);

  if (action === 'rerun-scan') {
    const snapshot = await runAIOpsScan({ force: true });
    return {
      action,
      success: true,
      title: 'Scan refreshed',
      message: `AI operations scan completed with ${snapshot.incidents.length} incident(s).`,
      details: [snapshot.honestyStatement, snapshot.promise],
      executedAt: new Date().toISOString(),
    };
  }

  if (action === 'check-storage-integrity') {
    const result = await runStorageIntegrityCheck();
    return {
      action,
      success: result.passed,
      title: 'Storage integrity check complete',
      message: result.passed ? 'Project-scoped storage passed the integrity audit.' : 'Storage audit found issues that need review.',
      details: result.issues.length > 0 ? result.issues : [`Project ${result.projectId} storage is healthy.`],
      executedAt: new Date().toISOString(),
    };
  }

  if (action === 'clean-foreign-storage-keys') {
    const removed = await cleanForeignKeys();
    const result = await runStorageIntegrityCheck();
    return {
      action,
      success: result.passed,
      title: 'Foreign storage cleanup complete',
      message: `Removed ${removed} foreign key(s) and re-ran storage integrity.`,
      details: result.issues.length > 0 ? result.issues : ['Storage isolation is healthy after cleanup.'],
      executedAt: new Date().toISOString(),
    };
  }

  if (action === 'verify-supabase-config') {
    const hasSupabase = isSupabaseConfigured();
    const channelCount = getRealtimeChannelCount();
    return {
      action,
      success: hasSupabase,
      title: 'Supabase configuration inspected',
      message: hasSupabase ? 'Supabase environment is configured.' : 'Supabase configuration is incomplete.',
      details: [
        `Configured=${hasSupabase}`,
        `Realtime channels=${channelCount}`,
      ],
      executedAt: new Date().toISOString(),
    };
  }

  if (action === 'verify-landing-reachability') {
    const result = await verifyLandingReachability();
    return {
      action,
      success: result.success,
      title: 'Landing reachability checked',
      message: result.message,
      details: ['This check verifies response only. Rendering, backend correctness, and traffic spikes still need broader monitoring.'],
      executedAt: new Date().toISOString(),
    };
  }

  const channelCount = getRealtimeChannelCount();
  return {
    action,
    success: channelCount >= 0,
    title: 'Realtime inspection complete',
    message: `Realtime layer currently reports ${channelCount} active channel(s).`,
    details: ['AI can inspect connection state, but channel-level recovery across the entire app still needs app-specific resubscribe logic.'],
    executedAt: new Date().toISOString(),
  };
}
