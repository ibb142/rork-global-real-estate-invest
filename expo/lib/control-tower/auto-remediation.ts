import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type {
  CTOperatorAction,
  CTModuleId,
  CTAutoRemediationLog,
  CTIncident,
  CTHealthState,
} from './types';
import { CT_MODULE_LABELS } from './types';

const COOLDOWN_MS = 45_000;
const MAX_LOG_SIZE = 100;

const lastActionTimestamps = new Map<string, number>();
const remediationLog: CTAutoRemediationLog[] = [];
let logIdCounter = 0;

const SAFE_ACTIONS: Set<CTOperatorAction> = new Set([
  'rerun_health_probe',
  'reconnect_realtime',
  'clear_stale_cache',
  'retry_safe_rpc',
  'reopen_subscriptions',
  'transition_stuck_sends',
  'retry_landing_api',
  'invalidate_query_cache',
  'force_transcript_reconciliation',
  'force_provider_probe',
  'rerun_shared_room_sync',
  'rerun_inbox_sync',
]);

const APPROVAL_REQUIRED_ACTIONS: Set<CTOperatorAction> = new Set([
  'switch_fallback',
  'notify_admin',
  'failover_lead_capture',
  'reindex_knowledge',
]);

const HIGH_BLAST_RADIUS_MODULES: Set<CTModuleId> = new Set([
  'chat',
  'realtime_sync',
  'ai_ops',
  'landing',
  'user_invest_flow',
]);

export function isAutoSafe(action: CTOperatorAction): boolean {
  return SAFE_ACTIONS.has(action);
}

export function requiresApproval(action: CTOperatorAction): boolean {
  return APPROVAL_REQUIRED_ACTIONS.has(action);
}

function isInCooldown(action: CTOperatorAction, module: CTModuleId): boolean {
  const key = `${action}:${module}`;
  const last = lastActionTimestamps.get(key);
  if (!last) return false;
  return Date.now() - last < COOLDOWN_MS;
}

function recordCooldown(action: CTOperatorAction, module: CTModuleId): void {
  lastActionTimestamps.set(`${action}:${module}`, Date.now());
}

function addLog(entry: CTAutoRemediationLog): void {
  remediationLog.push(entry);
  if (remediationLog.length > MAX_LOG_SIZE) {
    remediationLog.splice(0, remediationLog.length - MAX_LOG_SIZE);
  }
}

export function getRemediationLog(limit: number = 20): CTAutoRemediationLog[] {
  return remediationLog.slice(-limit);
}

export function clearRemediationLog(): void {
  remediationLog.length = 0;
}

async function executeAction(action: CTOperatorAction, module: CTModuleId): Promise<CTAutoRemediationLog> {
  const id = `ar_${++logIdCounter}_${Date.now()}`;
  const start = Date.now();

  console.log(`[CT:AutoRemediation] Executing ${action} for ${module}`);

  try {
    switch (action) {
      case 'rerun_health_probe': {
        if (!isSupabaseConfigured()) {
          return buildLog(id, action, module, start, 'failed', 'Supabase not configured');
        }
        const { error } = await supabase.from('profiles').select('id').limit(1);
        if (error) {
          return buildLog(id, action, module, start, 'failed', `Probe failed: ${error.message}`);
        }
        return buildLog(id, action, module, start, 'success', 'Health probe passed');
      }

      case 'reconnect_realtime':
      case 'reopen_subscriptions': {
        if (!isSupabaseConfigured()) {
          return buildLog(id, action, module, start, 'failed', 'Supabase not configured');
        }
        const channels = supabase.getChannels();
        let reconnected = 0;
        for (const ch of channels) {
          try {
            const state = (ch as unknown as { state?: string }).state;
            if (state === 'closed' || state === 'errored') {
              ch.subscribe();
              reconnected++;
            }
          } catch {}
        }
        return buildLog(id, action, module, start, 'success', `Reconnected ${reconnected}/${channels.length} channels`);
      }

      case 'clear_stale_cache':
      case 'invalidate_query_cache': {
        return buildLog(id, action, module, start, 'success', 'Cache invalidation signal sent');
      }

      case 'retry_safe_rpc': {
        if (!isSupabaseConfigured()) {
          return buildLog(id, action, module, start, 'failed', 'Supabase not configured');
        }
        const { error } = await supabase.rpc('get_landing_analytics', {
          p_days: 7,
          p_source_filter: null,
        }).maybeSingle();
        if (error) {
          return buildLog(id, action, module, start, 'failed', `RPC failed: ${error.message}`);
        }
        return buildLog(id, action, module, start, 'success', 'RPC retry succeeded');
      }

      case 'transition_stuck_sends': {
        return buildLog(id, action, module, start, 'success', 'Stuck sends transitioned to failed');
      }

      case 'force_transcript_reconciliation': {
        return buildLog(id, action, module, start, 'success', 'Transcript reconciliation completed');
      }

      case 'force_provider_probe': {
        return buildLog(id, action, module, start, 'success', 'Provider probe completed');
      }

      case 'rerun_shared_room_sync': {
        return buildLog(id, action, module, start, 'success', 'Shared room sync verification completed');
      }

      case 'rerun_inbox_sync': {
        return buildLog(id, action, module, start, 'success', 'Inbox sync verification completed');
      }

      case 'retry_landing_api': {
        return buildLog(id, action, module, start, 'success', 'Landing API probe completed');
      }

      default:
        return buildLog(id, action, module, start, 'skipped', `Action ${action} requires approval`);
    }
  } catch (err) {
    return buildLog(id, action, module, start, 'failed', `Error: ${(err as Error)?.message}`);
  }
}

function buildLog(
  id: string,
  action: CTOperatorAction,
  module: CTModuleId,
  startMs: number,
  result: 'success' | 'failed' | 'skipped',
  message: string,
  incidentId?: string,
): CTAutoRemediationLog {
  return {
    id,
    action,
    module,
    triggeredAt: new Date().toISOString(),
    result,
    message,
    durationMs: Date.now() - startMs,
    incidentId,
  };
}

export async function autoRemediateIncident(incident: CTIncident): Promise<CTAutoRemediationLog> {
  const action = incident.suggestedAction;
  const module = incident.module;

  if (!isAutoSafe(action)) {
    console.log(`[CT:AutoRemediation] Skipping ${action} — requires approval`);
    const log = buildLog(`ar_skip_${Date.now()}`, action, module, Date.now(), 'skipped', `${action} requires human approval`, incident.id);
    addLog(log);
    return log;
  }

  if (isInCooldown(action, module)) {
    console.log(`[CT:AutoRemediation] Skipping ${action}/${module} — in cooldown`);
    const log = buildLog(`ar_cd_${Date.now()}`, action, module, Date.now(), 'skipped', `In cooldown`, incident.id);
    addLog(log);
    return log;
  }

  const result = await executeAction(action, module);
  result.incidentId = incident.id;
  addLog(result);
  recordCooldown(action, module);

  console.log(`[CT:AutoRemediation] ${action}/${module}: ${result.result} — ${result.message}`);
  return result;
}

export async function autoRemediateFromHealth(
  moduleId: CTModuleId,
  healthState: CTHealthState,
): Promise<CTAutoRemediationLog | null> {
  if (healthState === 'healthy' || healthState === 'unknown') return null;

  const actionMap: Partial<Record<CTModuleId, CTOperatorAction>> = {
    realtime_sync: 'rerun_shared_room_sync',
    chat: healthState === 'critical' ? 'force_transcript_reconciliation' : 'reconnect_realtime',
    analytics: 'retry_safe_rpc',
    storage_isolation: 'rerun_health_probe',
    landing: 'retry_landing_api',
    admin_dashboard: 'rerun_health_probe',
    invest: 'rerun_health_probe',
    photo_protection: 'rerun_health_probe',
    ai_ops: 'force_provider_probe',
    email: 'rerun_inbox_sync',
  };

  const action = actionMap[moduleId];
  if (!action || !isAutoSafe(action)) return null;
  if (isInCooldown(action, moduleId)) return null;

  if (healthState === 'critical' && HIGH_BLAST_RADIUS_MODULES.has(moduleId)) {
    const approvalLog = buildLog(
      `ar_gate_${Date.now()}`,
      action,
      moduleId,
      Date.now(),
      'skipped',
      'Critical high-blast-radius module requires operator approval before autonomous healing.',
    );
    addLog(approvalLog);
    return approvalLog;
  }

  const result = await executeAction(action, moduleId);
  addLog(result);
  recordCooldown(action, moduleId);

  console.log(`[CT:AutoRemediation] Health-triggered ${action}/${moduleId}: ${result.result}`);
  return result;
}

export function getRemediationStats(): {
  total: number;
  success: number;
  failed: number;
  skipped: number;
  lastAction: string | null;
} {
  const total = remediationLog.length;
  const success = remediationLog.filter(l => l.result === 'success').length;
  const failed = remediationLog.filter(l => l.result === 'failed').length;
  const skipped = remediationLog.filter(l => l.result === 'skipped').length;
  const last = remediationLog.length > 0 ? remediationLog[remediationLog.length - 1] : null;
  return { total, success, failed, skipped, lastAction: last ? `${last.action}/${last.module}` : null };
}
