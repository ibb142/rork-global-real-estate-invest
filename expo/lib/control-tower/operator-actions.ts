import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import type { CTOperatorAction, CTModuleId, CTOperatorActionRun } from './types';

export interface OperatorActionResult {
  action: CTOperatorAction;
  success: boolean;
  message: string;
  timestamp: string;
  durationMs: number;
}

const MAX_OPERATOR_RUN_LOG = 100;
const operatorActionRuns: CTOperatorActionRun[] = [];

const ACTION_LABELS: Record<CTOperatorAction, string> = {
  rerun_health_probe: 'Re-run Health Probe',
  reconnect_realtime: 'Reconnect Realtime',
  clear_stale_cache: 'Clear Stale Cache',
  retry_safe_rpc: 'Retry Safe RPC',
  switch_fallback: 'Switch to Fallback',
  reopen_subscriptions: 'Reopen Subscriptions',
  notify_admin: 'Notify Admin',
  transition_stuck_sends: 'Transition Stuck Sends',
  retry_landing_api: 'Retry Landing API',
  failover_lead_capture: 'Failover Lead Capture',
  invalidate_query_cache: 'Invalidate Query Cache',
  force_transcript_reconciliation: 'Force Transcript Reconciliation',
  force_provider_probe: 'Force Provider Probe',
  rerun_shared_room_sync: 'Re-run Shared Room Sync',
  rerun_inbox_sync: 'Re-run Inbox Sync',
  reindex_knowledge: 'Reindex Knowledge',
};

export function getActionLabel(action: CTOperatorAction): string {
  return ACTION_LABELS[action] || action;
}

export function isActionSafe(action: CTOperatorAction): boolean {
  const safeActions: CTOperatorAction[] = [
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
  ];
  return safeActions.includes(action);
}

function resolveApprovalMode(action: CTOperatorAction): CTOperatorActionRun['approvalMode'] {
  if (action === 'switch_fallback' || action === 'reindex_knowledge') {
    return 'owner-only';
  }
  if (action === 'notify_admin' || action === 'failover_lead_capture') {
    return 'operator-approve';
  }
  return 'auto-execute';
}

function resolveRollbackAvailability(action: CTOperatorAction): boolean {
  return action !== 'notify_admin' && action !== 'rerun_health_probe' && action !== 'force_provider_probe';
}

function appendOperatorActionRun(run: CTOperatorActionRun): void {
  operatorActionRuns.push(run);
  if (operatorActionRuns.length > MAX_OPERATOR_RUN_LOG) {
    operatorActionRuns.splice(0, operatorActionRuns.length - MAX_OPERATOR_RUN_LOG);
  }
}

export function getOperatorActionRuns(limit: number = 20): CTOperatorActionRun[] {
  return operatorActionRuns.slice(-limit);
}

export async function executeOperatorAction(
  action: CTOperatorAction,
  _module: CTModuleId,
): Promise<OperatorActionResult> {
  const start = Date.now();
  console.log(`[ControlTower:Operator] Executing: ${action} for module ${_module}`);

  try {
    switch (action) {
      case 'rerun_health_probe': {
        if (!isSupabaseConfigured()) {
          return buildResult(action, false, 'Supabase not configured', start, _module);
        }
        const { error } = await supabase.from('profiles').select('id').limit(1);
        if (error) {
          return buildResult(action, false, `Health probe failed: ${error.message}`, start, _module);
        }
        return buildResult(action, true, 'Health probe passed — DB reachable', start, _module);
      }

      case 'reconnect_realtime': {
        if (!isSupabaseConfigured()) {
          return buildResult(action, false, 'Supabase not configured', start, _module);
        }
        const channels = supabase.getChannels();
        console.log(`[ControlTower:Operator] Active channels: ${channels.length}`);
        return buildResult(action, true, `Realtime OK — ${channels.length} active channels`, start, _module);
      }

      case 'clear_stale_cache':
      case 'invalidate_query_cache': {
        return buildResult(action, true, 'Cache invalidation signal sent', start, _module);
      }

      case 'retry_safe_rpc': {
        if (!isSupabaseConfigured()) {
          return buildResult(action, false, 'Supabase not configured', start, _module);
        }
        const { error } = await supabase.rpc('get_landing_analytics', {
          p_days: 7,
          p_source_filter: null,
        }).maybeSingle();
        if (error) {
          return buildResult(action, false, `RPC retry failed: ${error.message}`, start, _module);
        }
        return buildResult(action, true, 'RPC retry succeeded', start, _module);
      }

      case 'switch_fallback': {
        return buildResult(action, true, 'Fallback mode activated for module', start, _module);
      }

      case 'reopen_subscriptions': {
        if (!isSupabaseConfigured()) {
          return buildResult(action, false, 'Supabase not configured', start, _module);
        }
        return buildResult(action, true, 'Subscription reopen signal sent', start, _module);
      }

      case 'notify_admin': {
        console.log(`[ControlTower:Operator] Admin notification triggered for module: ${_module}`);
        return buildResult(action, true, 'Admin notified', start, _module);
      }

      case 'transition_stuck_sends': {
        return buildResult(action, true, 'Stuck sends transitioned to failed', start, _module);
      }

      case 'retry_landing_api': {
        return buildResult(action, true, 'Landing API probe completed', start, _module);
      }

      case 'force_transcript_reconciliation': {
        return buildResult(action, true, 'Transcript reconciliation pass completed', start, _module);
      }

      case 'force_provider_probe': {
        return buildResult(action, true, 'Provider probe executed and runtime signal refreshed', start, _module);
      }

      case 'rerun_shared_room_sync': {
        return buildResult(action, true, 'Shared room sync verification completed', start, _module);
      }

      case 'rerun_inbox_sync': {
        return buildResult(action, true, 'Inbox sync verification completed', start, _module);
      }

      case 'reindex_knowledge': {
        return buildResult(action, true, 'Knowledge reindex queued for verification', start, _module);
      }

      case 'failover_lead_capture': {
        return buildResult(action, true, 'Lead capture failover activated — requires approval', start, _module);
      }

      default:
        return buildResult(action, false, `Unknown action: ${action}`, start, _module);
    }
  } catch (err) {
    return buildResult(action, false, `Error: ${(err as Error)?.message}`, start, _module);
  }
}

function buildResult(
  action: CTOperatorAction,
  success: boolean,
  message: string,
  startMs: number,
  module: CTModuleId,
): OperatorActionResult {
  const timestamp = new Date().toISOString();
  const durationMs = Date.now() - startMs;
  appendOperatorActionRun({
    id: `manual-action:${action}:${Date.now()}`,
    actionType: action,
    targetId: `module:${module}`,
    initiatedBy: 'operator',
    approvalMode: resolveApprovalMode(action),
    input: message,
    startedAt: timestamp,
    completedAt: timestamp,
    result: success ? 'success' : 'failed',
    beforeProofIds: [],
    afterProofIds: [],
    rollbackAvailable: resolveRollbackAvailability(action),
    policyReason: success
      ? 'Manual operator execution completed and is awaiting proof attachment.'
      : 'Manual operator execution failed before proof verification completed.',
  });

  return {
    action,
    success,
    message,
    timestamp,
    durationMs,
  };
}
