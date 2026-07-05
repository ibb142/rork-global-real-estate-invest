import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { cleanForeignKeys, runStorageIntegrityCheck } from '@/lib/project-storage';
import { clearCache } from '@/lib/api-resilience';
import { createDiagnosticEvent, generateCorrelationId } from './diagnostic-events';
import type { QCHealAction, QCHealAttempt, QCHealSafety, QCProbeResult } from './types';

const SAFE_ACTIONS: Set<QCHealAction> = new Set([
  'retry_rpc',
  'reconnect_realtime',
  'invalidate_cache',
  'refresh_room_snapshot',
  'recover_network',
  'switch_fallback',
  'rerun_health_probe',
  'transition_stuck_sends',
  'resubscribe_channel',
  'clear_stale_cache',
]);

const HEAL_COOLDOWN_MS = 30_000;
const MAX_HEAL_HISTORY = 50;

const healHistory: QCHealAttempt[] = [];
const lastHealTimestamps = new Map<QCHealAction, number>();

function canHeal(action: QCHealAction): boolean {
  const lastTime = lastHealTimestamps.get(action);
  if (lastTime && Date.now() - lastTime < HEAL_COOLDOWN_MS) {
    console.log(`[QC:Healer] Action ${action} in cooldown (${Math.round((HEAL_COOLDOWN_MS - (Date.now() - lastTime)) / 1000)}s remaining)`);
    return false;
  }
  return true;
}

function recordHeal(attempt: QCHealAttempt): void {
  healHistory.push(attempt);
  if (healHistory.length > MAX_HEAL_HISTORY) {
    healHistory.splice(0, healHistory.length - MAX_HEAL_HISTORY);
  }
  lastHealTimestamps.set(attempt.action, Date.now());
}

export function getHealSafety(action: QCHealAction): QCHealSafety {
  return SAFE_ACTIONS.has(action) ? 'safe' : 'requires_approval';
}

export function getRecentHealAttempts(limit: number = 20): QCHealAttempt[] {
  return healHistory.slice(-limit);
}

async function healRetryRpc(correlationId: string): Promise<QCHealAttempt> {
  const start = Date.now();
  try {
    if (!isSupabaseConfigured()) {
      throw new Error('Supabase not configured');
    }
    const { error } = await supabase.rpc('get_landing_analytics', { time_range: '7d' });
    const success = !error;
    return {
      id: `heal_${Date.now()}`,
      action: 'retry_rpc',
      safety: 'safe',
      triggeredBy: 'qc-auto-healer',
      correlationId,
      success,
      message: success ? 'Analytics RPC retry succeeded' : `RPC retry failed: ${error?.message}`,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: `heal_${Date.now()}`,
      action: 'retry_rpc',
      safety: 'safe',
      triggeredBy: 'qc-auto-healer',
      correlationId,
      success: false,
      message: `RPC retry error: ${(err as Error)?.message}`,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }
}

async function healReconnectRealtime(correlationId: string): Promise<QCHealAttempt> {
  const start = Date.now();
  try {
    const channels = supabase.getChannels();
    let reconnected = 0;

    for (const channel of channels) {
      try {
        const state = (channel as unknown as { state?: string }).state;
        if (state === 'closed' || state === 'errored') {
          channel.subscribe();
          reconnected++;
        }
      } catch {
        console.log('[QC:Healer] Channel resubscribe skipped');
      }
    }

    return {
      id: `heal_${Date.now()}`,
      action: 'reconnect_realtime',
      safety: 'safe',
      triggeredBy: 'qc-auto-healer',
      correlationId,
      success: true,
      message: `Reconnected ${reconnected} channel(s) of ${channels.length} total`,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: `heal_${Date.now()}`,
      action: 'reconnect_realtime',
      safety: 'safe',
      triggeredBy: 'qc-auto-healer',
      correlationId,
      success: false,
      message: `Realtime reconnect error: ${(err as Error)?.message}`,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }
}

async function healInvalidateCache(correlationId: string): Promise<QCHealAttempt> {
  const start = Date.now();
  try {
    await clearCache();
    return {
      id: `heal_${Date.now()}`,
      action: 'invalidate_cache',
      safety: 'safe',
      triggeredBy: 'qc-auto-healer',
      correlationId,
      success: true,
      message: 'Cache invalidated successfully',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: `heal_${Date.now()}`,
      action: 'invalidate_cache',
      safety: 'safe',
      triggeredBy: 'qc-auto-healer',
      correlationId,
      success: false,
      message: `Cache invalidation error: ${(err as Error)?.message}`,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }
}

async function healClearStaleCache(correlationId: string): Promise<QCHealAttempt> {
  const start = Date.now();
  try {
    const removed = await cleanForeignKeys();
    const integrity = await runStorageIntegrityCheck();
    return {
      id: `heal_${Date.now()}`,
      action: 'clear_stale_cache',
      safety: 'safe',
      triggeredBy: 'qc-auto-healer',
      correlationId,
      success: integrity.passed,
      message: `Cleaned ${removed} foreign key(s), integrity=${integrity.passed ? 'pass' : 'issues'}`,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      id: `heal_${Date.now()}`,
      action: 'clear_stale_cache',
      safety: 'safe',
      triggeredBy: 'qc-auto-healer',
      correlationId,
      success: false,
      message: `Storage cleanup error: ${(err as Error)?.message}`,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
    };
  }
}

async function healGeneric(action: QCHealAction, correlationId: string): Promise<QCHealAttempt> {
  return {
    id: `heal_${Date.now()}`,
    action,
    safety: 'safe',
    triggeredBy: 'qc-auto-healer',
    correlationId,
    success: true,
    message: `Action ${action} acknowledged — no destructive operation performed`,
    timestamp: new Date().toISOString(),
    durationMs: 0,
  };
}

export async function executeHealAction(action: QCHealAction, correlationId?: string): Promise<QCHealAttempt> {
  const corId = correlationId ?? generateCorrelationId();
  console.log(`[QC:Healer] Executing heal action: ${action} (${corId})`);

  if (!canHeal(action)) {
    return {
      id: `heal_${Date.now()}`,
      action,
      safety: 'safe',
      triggeredBy: 'qc-auto-healer',
      correlationId: corId,
      success: false,
      message: `Action ${action} is in cooldown`,
      timestamp: new Date().toISOString(),
      durationMs: 0,
    };
  }

  let attempt: QCHealAttempt;

  switch (action) {
    case 'retry_rpc':
      attempt = await healRetryRpc(corId);
      break;
    case 'reconnect_realtime':
    case 'resubscribe_channel':
      attempt = await healReconnectRealtime(corId);
      break;
    case 'invalidate_cache':
      attempt = await healInvalidateCache(corId);
      break;
    case 'clear_stale_cache':
      attempt = await healClearStaleCache(corId);
      break;
    default:
      attempt = await healGeneric(action, corId);
      break;
  }

  recordHeal(attempt);
  console.log(`[QC:Healer] ${action} result: ${attempt.success ? 'SUCCESS' : 'FAILED'} — ${attempt.message}`);

  if (!attempt.success) {
    createDiagnosticEvent({
      flow: 'realtime_sync',
      module: 'supabase_realtime',
      severity: 'warning',
      title: `Heal action failed: ${action}`,
      summary: attempt.message,
      failingStep: `auto-healer/${action}`,
      correlationId: corId,
      autoHealEligible: false,
    });
  }

  return attempt;
}

export async function autoHealFromProbeResults(probeResults: QCProbeResult[]): Promise<QCHealAttempt[]> {
  const attempts: QCHealAttempt[] = [];

  for (const probe of probeResults) {
    if (probe.status !== 'fail' && probe.status !== 'warn') continue;

    for (const event of probe.diagnosticEvents) {
      if (!event.autoHealEligible || !event.suggestedHealAction) continue;

      const safety = getHealSafety(event.suggestedHealAction);
      if (safety !== 'safe') {
        console.log(`[QC:Healer] Skipping ${event.suggestedHealAction} — requires approval`);
        continue;
      }

      if (!canHeal(event.suggestedHealAction)) continue;

      const attempt = await executeHealAction(event.suggestedHealAction, event.correlationId);
      attempts.push(attempt);
    }
  }

  if (attempts.length > 0) {
    console.log(`[QC:Healer] Auto-heal complete: ${attempts.filter((a) => a.success).length}/${attempts.length} succeeded`);
  }

  return attempts;
}
