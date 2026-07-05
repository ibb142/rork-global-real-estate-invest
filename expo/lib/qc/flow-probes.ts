import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { runStorageIntegrityCheck } from '@/lib/project-storage';
import { createDiagnosticEvent } from './diagnostic-events';
import type { QCProbeResult, QCDiagnosticEvent, QCFlowId, QCModuleId } from './types';

const PROBE_TIMEOUT_MS = 5000;

async function timedProbe<T>(fn: () => Promise<T>, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<{ result: T | null; latencyMs: number; error: string | null; timedOut: boolean }> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new Error(`Probe timed out after ${timeoutMs}ms`)));
      }),
    ]);
    return { result, latencyMs: Date.now() - start, error: null, timedOut: false };
  } catch (err) {
    const msg = (err as Error)?.message ?? 'Unknown error';
    return { result: null, latencyMs: Date.now() - start, error: msg, timedOut: msg.includes('timed out') };
  } finally {
    clearTimeout(timeout);
  }
}

function buildProbeResult(
  probeId: string,
  flow: QCFlowId,
  module: QCModuleId,
  status: 'pass' | 'warn' | 'fail' | 'skip',
  latencyMs: number,
  message: string,
  details?: string,
  events?: QCDiagnosticEvent[],
): QCProbeResult {
  return {
    probeId,
    flow,
    module,
    status,
    latencyMs,
    message,
    details,
    timestamp: new Date().toISOString(),
    diagnosticEvents: events ?? [],
  };
}

export async function probeAuthSession(): Promise<QCProbeResult> {
  if (!isSupabaseConfigured()) {
    return buildProbeResult('auth-session', 'auth_session', 'supabase_auth', 'skip', 0, 'Supabase not configured');
  }

  const { result, latencyMs, error } = await timedProbe(async () => {
    const { data, error: authErr } = await supabase.auth.getSession();
    if (authErr) throw new Error(authErr.message);
    return data;
  });

  if (error) {
    const evt = createDiagnosticEvent({
      flow: 'auth_session',
      module: 'supabase_auth',
      severity: 'critical',
      title: 'Auth session check failed',
      summary: error,
      failingStep: 'supabase.auth.getSession()',
      likelyFile: 'lib/supabase.ts',
      autoHealEligible: false,
    });
    return buildProbeResult('auth-session', 'auth_session', 'supabase_auth', 'fail', latencyMs, `Auth error: ${error}`, undefined, [evt]);
  }

  if (latencyMs > 3000) {
    const evt = createDiagnosticEvent({
      flow: 'auth_session',
      module: 'supabase_auth',
      severity: 'warning',
      title: 'Auth session slow',
      summary: `Auth check took ${latencyMs}ms`,
      failingStep: 'supabase.auth.getSession() latency',
      autoHealEligible: false,
    });
    return buildProbeResult('auth-session', 'auth_session', 'supabase_auth', 'warn', latencyMs, `Auth slow (${latencyMs}ms)`, undefined, [evt]);
  }

  return buildProbeResult('auth-session', 'auth_session', 'supabase_auth', 'pass', latencyMs, `Auth OK (${latencyMs}ms)`);
}

export async function probeRealtimeSync(): Promise<QCProbeResult> {
  if (!isSupabaseConfigured()) {
    return buildProbeResult('realtime-sync', 'realtime_sync', 'supabase_realtime', 'skip', 0, 'Supabase not configured');
  }

  const start = Date.now();
  try {
    const channels = supabase.getChannels();
    const latencyMs = Date.now() - start;
    const activeCount = channels.length;

    if (activeCount === 0) {
      const evt = createDiagnosticEvent({
        flow: 'realtime_sync',
        module: 'supabase_realtime',
        severity: 'warning',
        title: 'No active realtime channels',
        summary: 'WebSocket idle — no subscriptions',
        failingStep: 'supabase.getChannels()',
        autoHealEligible: true,
        suggestedHealAction: 'reconnect_realtime',
      });
      return buildProbeResult('realtime-sync', 'realtime_sync', 'supabase_realtime', 'warn', latencyMs, 'No active channels', undefined, [evt]);
    }

    return buildProbeResult('realtime-sync', 'realtime_sync', 'supabase_realtime', 'pass', latencyMs, `${activeCount} channel(s) active`);
  } catch (err) {
    const latencyMs = Date.now() - start;
    const evt = createDiagnosticEvent({
      flow: 'realtime_sync',
      module: 'supabase_realtime',
      severity: 'critical',
      title: 'Realtime check failed',
      summary: (err as Error)?.message ?? 'Unknown',
      failingStep: 'supabase.getChannels()',
      autoHealEligible: true,
      suggestedHealAction: 'reconnect_realtime',
    });
    return buildProbeResult('realtime-sync', 'realtime_sync', 'supabase_realtime', 'fail', latencyMs, `Error: ${(err as Error)?.message}`, undefined, [evt]);
  }
}

export async function probeAnalyticsRpc(): Promise<QCProbeResult> {
  if (!isSupabaseConfigured()) {
    return buildProbeResult('analytics-rpc', 'analytics_rpc', 'analytics_engine', 'skip', 0, 'Supabase not configured');
  }

  const { latencyMs, error } = await timedProbe(async () => {
    const { error: rpcErr } = await supabase.rpc('get_landing_analytics', { time_range: '7d' });
    if (rpcErr) throw new Error(rpcErr.message);
    return true;
  });

  if (error) {
    const isMissing = error.includes('does not exist') || error.includes('could not find');
    const evt = createDiagnosticEvent({
      flow: 'analytics_rpc',
      module: 'analytics_engine',
      severity: isMissing ? 'warning' : 'critical',
      title: 'Analytics RPC failed',
      summary: error,
      failingStep: 'supabase.rpc(get_landing_analytics)',
      likelyFile: 'lib/analytics-server.ts',
      autoHealEligible: !isMissing,
      suggestedHealAction: isMissing ? undefined : 'retry_rpc',
    });
    return buildProbeResult('analytics-rpc', 'analytics_rpc', 'analytics_engine', isMissing ? 'warn' : 'fail', latencyMs, error, undefined, [evt]);
  }

  return buildProbeResult('analytics-rpc', 'analytics_rpc', 'analytics_engine', 'pass', latencyMs, `RPC OK (${latencyMs}ms)`);
}

export async function probeStorageUpload(): Promise<QCProbeResult> {
  if (!isSupabaseConfigured()) {
    return buildProbeResult('storage-upload', 'storage_upload', 'supabase_storage', 'skip', 0, 'Supabase not configured');
  }

  const { latencyMs, error } = await timedProbe(async () => {
    const { data, error: listErr } = await supabase.storage.listBuckets();
    if (listErr) throw new Error(typeof listErr === 'string' ? listErr : (listErr as { message?: string }).message ?? 'Unknown storage error');
    return data;
  });

  if (error) {
    const evt = createDiagnosticEvent({
      flow: 'storage_upload',
      module: 'supabase_storage',
      severity: 'critical',
      title: 'Storage bucket check failed',
      summary: error,
      failingStep: 'supabase.storage.listBuckets()',
      likelyFile: 'lib/photo-upload.ts',
      autoHealEligible: false,
    });
    return buildProbeResult('storage-upload', 'storage_upload', 'supabase_storage', 'fail', latencyMs, error, undefined, [evt]);
  }

  return buildProbeResult('storage-upload', 'storage_upload', 'supabase_storage', 'pass', latencyMs, `Storage accessible (${latencyMs}ms)`);
}

export async function probeStorageIsolation(): Promise<QCProbeResult> {
  const start = Date.now();
  try {
    const result = await runStorageIntegrityCheck();
    const latencyMs = Date.now() - start;

    if (!result.passed) {
      const evt = createDiagnosticEvent({
        flow: 'storage_isolation',
        module: 'supabase_storage',
        severity: 'warning',
        title: 'Storage isolation issues',
        summary: result.issues.join('; '),
        failingStep: 'runStorageIntegrityCheck()',
        likelyFile: 'lib/project-storage.ts',
        autoHealEligible: true,
        suggestedHealAction: 'clear_stale_cache',
      });
      return buildProbeResult('storage-isolation', 'storage_isolation', 'supabase_storage', 'warn', latencyMs, result.issues[0] ?? 'Issues found', undefined, [evt]);
    }

    return buildProbeResult('storage-isolation', 'storage_isolation', 'supabase_storage', 'pass', latencyMs, `Isolation OK — project ${result.projectId}`);
  } catch (err) {
    const latencyMs = Date.now() - start;
    return buildProbeResult('storage-isolation', 'storage_isolation', 'supabase_storage', 'fail', latencyMs, (err as Error)?.message ?? 'Unknown');
  }
}

export async function probeDealPublish(): Promise<QCProbeResult> {
  if (!isSupabaseConfigured()) {
    return buildProbeResult('deal-publish', 'admin_publish_deal', 'deal_engine', 'skip', 0, 'Supabase not configured');
  }

  const { result, latencyMs, error } = await timedProbe(async () => {
    const { data, error: dbErr } = await supabase.from('jv_deals').select('id, published, title').limit(3);
    if (dbErr) throw new Error(dbErr.message);
    return (data ?? []) as Array<{ id: string; published: boolean | null; title: string | null }>;
  });

  if (error) {
    const isMissing = error.includes('does not exist') || error.includes('could not find');
    const evt = createDiagnosticEvent({
      flow: 'admin_publish_deal',
      module: 'deal_engine',
      severity: isMissing ? 'warning' : 'critical',
      title: 'Deal table probe failed',
      summary: error,
      failingStep: 'supabase.from(jv_deals).select()',
      likelyFile: 'lib/canonical-deals.ts',
      autoHealEligible: false,
    });
    return buildProbeResult('deal-publish', 'admin_publish_deal', 'deal_engine', isMissing ? 'warn' : 'fail', latencyMs, error, undefined, [evt]);
  }

  const published = (result ?? []).filter((d) => d.published === true).length;
  return buildProbeResult('deal-publish', 'admin_publish_deal', 'deal_engine', 'pass', latencyMs, `Deals OK (${published} published, ${latencyMs}ms)`);
}

export async function probeUserInvest(): Promise<QCProbeResult> {
  if (!isSupabaseConfigured()) {
    return buildProbeResult('user-invest', 'user_invest', 'deal_engine', 'skip', 0, 'Supabase not configured');
  }

  const { latencyMs, error } = await timedProbe(async () => {
    const { error: dbErr } = await supabase.from('transactions').select('id').limit(1);
    if (dbErr) throw new Error(dbErr.message);
    return true;
  });

  if (error) {
    const isMissing = error.includes('does not exist') || error.includes('could not find');
    if (isMissing) {
      return buildProbeResult('user-invest', 'user_invest', 'deal_engine', 'warn', latencyMs, 'Transactions table not found');
    }
    const evt = createDiagnosticEvent({
      flow: 'user_invest',
      module: 'deal_engine',
      severity: 'critical',
      title: 'Investment flow probe failed',
      summary: error,
      failingStep: 'supabase.from(transactions).select()',
      autoHealEligible: false,
    });
    return buildProbeResult('user-invest', 'user_invest', 'deal_engine', 'fail', latencyMs, error, undefined, [evt]);
  }

  return buildProbeResult('user-invest', 'user_invest', 'deal_engine', 'pass', latencyMs, `Investment path OK (${latencyMs}ms)`);
}

export async function probeChatRoom(): Promise<QCProbeResult> {
  if (!isSupabaseConfigured()) {
    return buildProbeResult('chat-room', 'chat_room', 'chat_engine', 'skip', 0, 'Supabase not configured');
  }

  const events: QCDiagnosticEvent[] = [];
  const start = Date.now();

  const { error: convErr } = await timedProbe(async () => {
    const { error: dbErr } = await supabase.from('conversations').select('id').limit(1);
    if (dbErr) throw new Error(dbErr.message);
    return true;
  });

  if (convErr) {
    const isMissing = convErr.includes('does not exist') || convErr.includes('could not find');
    if (!isMissing) {
      events.push(createDiagnosticEvent({
        flow: 'chat_room',
        module: 'chat_engine',
        severity: 'critical',
        title: 'Conversations table unreachable',
        summary: convErr,
        failingStep: 'supabase.from(conversations).select()',
        likelyFile: 'src/modules/chat/services/supabaseChatProvider.ts',
        autoHealEligible: false,
      }));
    }
  }

  const channels = supabase.getChannels();
  const chatChannels = channels.filter((ch) => {
    const topic = (ch as unknown as { topic?: string }).topic ?? '';
    return topic.includes('chat') || topic.includes('message') || topic.includes('room');
  });

  const latencyMs = Date.now() - start;

  if (events.length > 0) {
    return buildProbeResult('chat-room', 'chat_room', 'chat_engine', 'fail', latencyMs, events[0]?.summary ?? 'Chat probe failed', `Chat channels: ${chatChannels.length}`, events);
  }

  if (convErr) {
    return buildProbeResult('chat-room', 'chat_room', 'chat_engine', 'warn', latencyMs, 'Conversations table missing — local fallback expected', `Chat channels: ${chatChannels.length}`);
  }

  return buildProbeResult('chat-room', 'chat_room', 'chat_engine', 'pass', latencyMs, `Chat OK (${latencyMs}ms, ${chatChannels.length} channel(s))`);
}

export async function probePhotoProtection(): Promise<QCProbeResult> {
  if (!isSupabaseConfigured()) {
    return buildProbeResult('photo-protection', 'photo_protection', 'photo_engine', 'skip', 0, 'Supabase not configured');
  }

  const { latencyMs, error } = await timedProbe(async () => {
    const { error: storageErr } = await supabase.storage.from('deal-photos').list('', { limit: 1 });
    if (storageErr) throw new Error(typeof storageErr === 'string' ? storageErr : (storageErr as { message?: string }).message ?? 'Unknown');
    return true;
  });

  if (error) {
    const evt = createDiagnosticEvent({
      flow: 'photo_protection',
      module: 'photo_engine',
      severity: error.includes('not found') || error.includes('Bucket') ? 'warning' : 'critical',
      title: 'Photo storage probe failed',
      summary: error,
      failingStep: 'supabase.storage.from(deal-photos).list()',
      likelyFile: 'lib/photo-upload.ts',
      autoHealEligible: false,
    });
    return buildProbeResult('photo-protection', 'photo_protection', 'photo_engine', error.includes('not found') ? 'warn' : 'fail', latencyMs, error, undefined, [evt]);
  }

  return buildProbeResult('photo-protection', 'photo_protection', 'photo_engine', 'pass', latencyMs, `Photo storage OK (${latencyMs}ms)`);
}

export async function probeTrashRecovery(): Promise<QCProbeResult> {
  if (!isSupabaseConfigured()) {
    return buildProbeResult('trash-recovery', 'trash_recovery', 'supabase_db', 'skip', 0, 'Supabase not configured');
  }

  const { latencyMs, error } = await timedProbe(async () => {
    const { error: dbErr } = await supabase.from('audit_trail').select('id').limit(1);
    if (dbErr) throw new Error(dbErr.message);
    return true;
  });

  if (error) {
    const isMissing = error.includes('does not exist') || error.includes('could not find');
    if (isMissing) {
      return buildProbeResult('trash-recovery', 'trash_recovery', 'supabase_db', 'warn', latencyMs, 'Audit trail table not found');
    }
    return buildProbeResult('trash-recovery', 'trash_recovery', 'supabase_db', 'fail', latencyMs, error);
  }

  return buildProbeResult('trash-recovery', 'trash_recovery', 'supabase_db', 'pass', latencyMs, `Trash/recovery path OK (${latencyMs}ms)`);
}

export async function runAllFlowProbes(): Promise<QCProbeResult[]> {
  console.log('[QC:Probes] Starting all flow probes...');
  const start = Date.now();

  const results = await Promise.all([
    probeAuthSession(),
    probeRealtimeSync(),
    probeAnalyticsRpc(),
    probeStorageUpload(),
    probeStorageIsolation(),
    probeDealPublish(),
    probeUserInvest(),
    probeChatRoom(),
    probePhotoProtection(),
    probeTrashRecovery(),
  ]);

  const duration = Date.now() - start;
  const passed = results.filter((r) => r.status === 'pass').length;
  const warned = results.filter((r) => r.status === 'warn').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  console.log(`[QC:Probes] Complete in ${duration}ms — pass=${passed} warn=${warned} fail=${failed}`);
  return results;
}
