import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { scopedKey } from '@/lib/project-storage';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const WAL_KEY = scopedKey('jv_wal_v1');
const WRITE_QUEUE_KEY = scopedKey('jv_write_queue_v1');
const INTEGRITY_SNAPSHOT_KEY = scopedKey('jv_integrity_snapshot_v1');
const PUBLISHED_REGISTRY_KEY = scopedKey('jv_published_registry_v1');

export interface WALEntry {
  id: string;
  timestamp: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'PUBLISH' | 'UNPUBLISH';
  dealId: string;
  dealTitle: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  committed: boolean;
  rolledBack: boolean;
  retryCount: number;
}

export interface WriteQueueItem {
  id: string;
  timestamp: string;
  operation: 'upsert' | 'update' | 'delete';
  table: string;
  payload: Record<string, unknown>;
  dealId: string;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  lastAttempt?: string;
}

export interface PublishedDealRecord {
  dealId: string;
  title: string;
  projectName: string;
  publishedAt: string;
  lastVerifiedAt: string;
  photoCount: number;
  photos: string[];
  snapshotData: Record<string, unknown>;
  version: number;
}

export interface IntegrityReport {
  checkedAt: string;
  totalPublished: number;
  verified: number;
  missing: number;
  restored: number;
  mismatched: number;
  errors: string[];
}

const MAX_WAL_ENTRIES = 200;
const MAX_QUEUE_ITEMS = 50;
const MAX_PUBLISHED_RECORDS = 100;
const WAL_AUTO_CLEANUP_DAYS = 7;
const STALE_QUEUE_ITEM_HOURS = 48;

async function getWAL(): Promise<WALEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(WAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.log('[WAL] Read error:', (err as Error)?.message);
    return [];
  }
}

async function saveWAL(entries: WALEntry[]): Promise<void> {
  try {
    if (entries.length > MAX_WAL_ENTRIES) {
      entries = entries.slice(0, MAX_WAL_ENTRIES);
    }
    await AsyncStorage.setItem(WAL_KEY, JSON.stringify(entries));
  } catch (err) {
    console.log('[WAL] Save error:', (err as Error)?.message);
  }
}

export async function walBegin(
  operation: WALEntry['operation'],
  dealId: string,
  dealTitle: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): Promise<string> {
  const entryId = `wal_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const entry: WALEntry = {
    id: entryId,
    timestamp: new Date().toISOString(),
    operation,
    dealId,
    dealTitle,
    before,
    after,
    committed: false,
    rolledBack: false,
    retryCount: 0,
  };
  const wal = await getWAL();
  wal.unshift(entry);
  await saveWAL(wal);
  console.log('[WAL] BEGIN:', operation, '| deal:', dealId, '| walId:', entryId);
  return entryId;
}

export async function walCommit(walId: string): Promise<void> {
  const wal = await getWAL();
  const idx = wal.findIndex(e => e.id === walId);
  if (idx >= 0 && wal[idx]) {
    wal[idx]!.committed = true;
    await saveWAL(wal);
    console.log('[WAL] COMMIT:', walId, '| deal:', wal[idx]!.dealId);
  }
}

export async function walRollback(walId: string): Promise<Record<string, unknown> | null> {
  const wal = await getWAL();
  const idx = wal.findIndex(e => e.id === walId);
  if (idx < 0 || !wal[idx]) {
    console.log('[WAL] Rollback failed — entry not found:', walId);
    return null;
  }
  const entry = wal[idx]!;
  if (entry.committed) {
    console.log('[WAL] Cannot rollback committed entry:', walId);
    return null;
  }
  entry.rolledBack = true;
  await saveWAL(wal);
  console.log('[WAL] ROLLBACK:', walId, '| deal:', entry.dealId, '| restoring before-state');
  return entry.before;
}

export async function walReplayUncommitted(): Promise<{ replayed: number; failed: number }> {
  const wal = await getWAL();
  const uncommitted = wal.filter(e => !e.committed && !e.rolledBack && e.retryCount < 3);
  let replayed = 0;
  let failed = 0;

  for (const entry of uncommitted) {
    if (!entry.before) continue;
    console.log('[WAL] Replaying uncommitted:', entry.id, '| op:', entry.operation, '| deal:', entry.dealId);

    try {
      if (entry.operation === 'PUBLISH' || entry.operation === 'UPDATE' || entry.operation === 'INSERT') {
        if (entry.after) {
          const localRaw = await AsyncStorage.getItem(scopedKey('jv_deals_v2'));
          const localDeals: Record<string, unknown>[] = localRaw ? JSON.parse(localRaw) : [];
          const localIdx = localDeals.findIndex((d: any) => d.id === entry.dealId);
          if (localIdx >= 0) {
            localDeals[localIdx] = { ...localDeals[localIdx], ...entry.after };
          } else {
            localDeals.unshift(entry.after);
          }
          await AsyncStorage.setItem(scopedKey('jv_deals_v2'), JSON.stringify(localDeals));
          replayed++;
          const walIdx = wal.findIndex(e => e.id === entry.id);
          if (walIdx >= 0 && wal[walIdx]) {
            wal[walIdx]!.committed = true;
          }
          console.log('[WAL] Replay SUCCESS:', entry.id);
        }
      }
    } catch (err) {
      failed++;
      const walIdx = wal.findIndex(e => e.id === entry.id);
      if (walIdx >= 0 && wal[walIdx]) {
        wal[walIdx]!.retryCount++;
      }
      console.log('[WAL] Replay FAILED:', entry.id, (err as Error)?.message);
    }
  }

  await saveWAL(wal);
  if (uncommitted.length > 0) {
    console.log('[WAL] Replay complete — replayed:', replayed, '| failed:', failed, '| total uncommitted:', uncommitted.length);
  }
  return { replayed, failed };
}

async function getWriteQueue(): Promise<WriteQueueItem[]> {
  try {
    const raw = await AsyncStorage.getItem(WRITE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveWriteQueue(queue: WriteQueueItem[]): Promise<void> {
  try {
    if (queue.length > MAX_QUEUE_ITEMS) {
      queue = queue.slice(0, MAX_QUEUE_ITEMS);
    }
    await AsyncStorage.setItem(WRITE_QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.log('[WriteQueue] Save error:', (err as Error)?.message);
  }
}

export async function enqueueWrite(
  operation: WriteQueueItem['operation'],
  dealId: string,
  payload: Record<string, unknown>
): Promise<string> {
  const itemId = `wq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const item: WriteQueueItem = {
    id: itemId,
    timestamp: new Date().toISOString(),
    operation,
    table: 'jv_deals',
    payload,
    dealId,
    retryCount: 0,
    maxRetries: 5,
  };
  const queue = await getWriteQueue();
  queue.push(item);
  await saveWriteQueue(queue);
  console.log('[WriteQueue] Enqueued:', operation, '| deal:', dealId, '| queueId:', itemId);
  return itemId;
}

export async function processWriteQueue(): Promise<{ processed: number; failed: number; remaining: number }> {
  if (!isSupabaseConfigured()) {
    return { processed: 0, failed: 0, remaining: 0 };
  }

  const queue = await getWriteQueue();
  if (queue.length === 0) return { processed: 0, failed: 0, remaining: 0 };

  console.log('[WriteQueue] Processing', queue.length, 'queued writes...');
  let processed = 0;
  let failed = 0;
  const remaining: WriteQueueItem[] = [];

  for (const item of queue) {
    if (item.retryCount >= item.maxRetries) {
      console.log('[WriteQueue] Dropping item after max retries:', item.id, item.dealId);
      continue;
    }

    try {
      let error: any = null;

      if (item.operation === 'upsert') {
        const result = await supabase.from(item.table).upsert({
          ...item.payload,
          updated_at: new Date().toISOString(),
        });
        error = result.error;
      } else if (item.operation === 'update') {
        const result = await supabase.from(item.table).update({
          ...item.payload,
          updated_at: new Date().toISOString(),
        }).eq('id', item.dealId);
        error = result.error;
      }

      if (error) {
        const msg = (error.message || '').toLowerCase();
        if (msg.includes('could not find the table') || msg.includes('does not exist')) {
          console.log('[WriteQueue] Table not found — keeping in queue:', item.id);
          item.retryCount++;
          item.lastError = error.message;
          item.lastAttempt = new Date().toISOString();
          remaining.push(item);
          failed++;
        } else {
          console.log('[WriteQueue] Write failed:', item.id, error.message);
          item.retryCount++;
          item.lastError = error.message;
          item.lastAttempt = new Date().toISOString();
          remaining.push(item);
          failed++;
        }
      } else {
        processed++;
        console.log('[WriteQueue] Write SUCCESS:', item.id, '| deal:', item.dealId);
      }
    } catch (err) {
      item.retryCount++;
      item.lastError = (err as Error)?.message;
      item.lastAttempt = new Date().toISOString();
      remaining.push(item);
      failed++;
      console.log('[WriteQueue] Write exception:', item.id, (err as Error)?.message);
    }
  }

  await saveWriteQueue(remaining);
  console.log('[WriteQueue] Done — processed:', processed, '| failed:', failed, '| remaining:', remaining.length);
  return { processed, failed, remaining: remaining.length };
}

async function getPublishedRegistry(): Promise<PublishedDealRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(PUBLISHED_REGISTRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function savePublishedRegistry(records: PublishedDealRecord[]): Promise<void> {
  try {
    if (records.length > MAX_PUBLISHED_RECORDS) {
      records = records.slice(0, MAX_PUBLISHED_RECORDS);
    }
    await AsyncStorage.setItem(PUBLISHED_REGISTRY_KEY, JSON.stringify(records));
  } catch (err) {
    console.log('[PublishedRegistry] Save error:', (err as Error)?.message);
  }
}

export async function registerPublishedDeal(deal: Record<string, unknown>): Promise<void> {
  const dealId = deal.id as string;
  if (!dealId) return;

  const photos = Array.isArray(deal.photos) ? deal.photos as string[] : [];
  const record: PublishedDealRecord = {
    dealId,
    title: (deal.title as string) || '',
    projectName: (deal.projectName as string) || (deal.project_name as string) || '',
    publishedAt: (deal.publishedAt as string) || (deal.published_at as string) || new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
    photoCount: photos.length,
    photos: [...photos],
    snapshotData: { ...deal },
    version: (deal.version as number) || 1,
  };

  const registry = await getPublishedRegistry();
  const idx = registry.findIndex(r => r.dealId === dealId);
  if (idx >= 0) {
    registry[idx] = record;
  } else {
    registry.unshift(record);
  }
  await savePublishedRegistry(registry);
  console.log('[PublishedRegistry] Registered deal:', dealId, '| title:', record.title, '| photos:', photos.length);
}

export async function unregisterPublishedDeal(dealId: string): Promise<void> {
  const registry = await getPublishedRegistry();
  const filtered = registry.filter(r => r.dealId !== dealId);
  if (filtered.length !== registry.length) {
    await savePublishedRegistry(filtered);
    console.log('[PublishedRegistry] Unregistered deal:', dealId);
  }
}

export async function runPublicationIntegrityCheck(): Promise<IntegrityReport> {
  const report: IntegrityReport = {
    checkedAt: new Date().toISOString(),
    totalPublished: 0,
    verified: 0,
    missing: 0,
    restored: 0,
    mismatched: 0,
    errors: [],
  };

  const registry = await getPublishedRegistry();
  report.totalPublished = registry.length;

  if (registry.length === 0) {
    console.log('[Watchdog] No published deals in registry — nothing to verify');
    return report;
  }

  console.log('[Watchdog] Running integrity check on', registry.length, 'published deals...');

  const localRaw = await AsyncStorage.getItem(scopedKey('jv_deals_v2'));
  const localDeals: Record<string, unknown>[] = localRaw ? JSON.parse(localRaw) : [];
  const localMap = new Map<string, Record<string, unknown>>();
  for (const d of localDeals) {
    if (d.id) localMap.set(d.id as string, d);
  }

  let supabaseMap = new Map<string, Record<string, unknown>>();
  if (isSupabaseConfigured()) {
    try {
      const ids = registry.map(r => r.dealId);
      const { data, error } = await supabase
        .from('jv_deals')
        .select('*')
        .in('id', ids);

      if (!error && data) {
        for (const row of data) {
          supabaseMap.set(row.id, row);
        }
      } else if (error) {
        const msg = (error.message || '').toLowerCase();
        if (!msg.includes('could not find the table')) {
          report.errors.push(`Supabase query error: ${error.message}`);
        }
      }
    } catch (err) {
      report.errors.push(`Supabase fetch failed: ${(err as Error)?.message}`);
    }
  }

  let localChanged = false;

  for (const record of registry) {
    const supabaseRow = supabaseMap.get(record.dealId);
    const localRow = localMap.get(record.dealId);

    if (supabaseRow) {
      const isPublished = supabaseRow.published === true;
      const status = String(typeof supabaseRow.status === 'string' ? supabaseRow.status : '').toLowerCase();
      const isTrashed = status === 'trashed' || status === 'permanently_deleted' || status === 'deleted';

      if (isPublished && !isTrashed) {
        report.verified++;
        const regIdx = registry.findIndex(r => r.dealId === record.dealId);
        if (regIdx >= 0 && registry[regIdx]) {
          registry[regIdx]!.lastVerifiedAt = new Date().toISOString();
        }
        continue;
      }

      if (!isPublished || isTrashed) {
        console.log('[Watchdog] Deal', record.dealId, 'found in Supabase but NOT published (published:', supabaseRow.published, 'status:', supabaseRow.status, ') — auto-restoring...');
        report.mismatched++;

        try {
          const { error: restoreErr } = await supabase.from('jv_deals').update({
            published: true,
            status: 'active',
            published_at: record.publishedAt || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }).eq('id', record.dealId);

          if (!restoreErr) {
            report.restored++;
            console.log('[Watchdog] AUTO-RESTORED deal in Supabase:', record.dealId);
          } else {
            report.errors.push(`Restore failed for ${record.dealId}: ${restoreErr.message}`);
          }
        } catch (err) {
          report.errors.push(`Restore exception for ${record.dealId}: ${(err as Error)?.message}`);
        }
      }
    } else {
      if (isSupabaseConfigured() && supabaseMap.size > 0) {
        console.log('[Watchdog] Deal', record.dealId, 'MISSING from Supabase — attempting full re-insert from snapshot...');
        report.missing++;

        try {
          const snapshot = record.snapshotData;
          if (snapshot && Object.keys(snapshot).length > 0) {
            const photos = record.photos.length > 0 ? record.photos : (Array.isArray(snapshot.photos) ? snapshot.photos : []);
            const partners = snapshot.partners;

            const insertPayload: Record<string, unknown> = {
              id: record.dealId,
              title: record.title || snapshot.title,
              project_name: record.projectName || (snapshot as any).projectName || (snapshot as any).project_name || '',
              type: snapshot.type || 'development',
              description: snapshot.description || '',
              property_address: (snapshot as any).propertyAddress || (snapshot as any).property_address || '',
              city: snapshot.city || '',
              state: snapshot.state || '',
              total_investment: (snapshot as any).totalInvestment || (snapshot as any).total_investment || 0,
              expected_roi: (snapshot as any).expectedROI || (snapshot as any).expected_roi || 0,
              distribution_frequency: (snapshot as any).distributionFrequency || (snapshot as any).distribution_frequency || '',
              exit_strategy: (snapshot as any).exitStrategy || (snapshot as any).exit_strategy || '',
              status: 'active',
              published: true,
              published_at: record.publishedAt || new Date().toISOString(),
              photos: Array.isArray(photos) ? JSON.stringify(photos) : (typeof photos === 'string' ? photos : '[]'),
              partners: Array.isArray(partners) ? JSON.stringify(partners) : (typeof partners === 'string' ? partners : '[]'),
              updated_at: new Date().toISOString(),
            };

            const { error: upsertErr } = await supabase.from('jv_deals').upsert(insertPayload);
            if (!upsertErr) {
              report.restored++;
              console.log('[Watchdog] FULL RE-INSERT SUCCESS for deal:', record.dealId);
            } else {
              report.errors.push(`Re-insert failed for ${record.dealId}: ${upsertErr.message}`);
            }
          } else {
            report.errors.push(`No snapshot data for ${record.dealId} — cannot restore`);
          }
        } catch (err) {
          report.errors.push(`Re-insert exception for ${record.dealId}: ${(err as Error)?.message}`);
        }
      }
    }

    if (!localRow) {
      console.log('[Watchdog] Deal', record.dealId, 'missing from local cache — restoring from registry snapshot...');
      const restoreLocal: Record<string, unknown> = {
        ...record.snapshotData,
        id: record.dealId,
        title: record.title,
        projectName: record.projectName,
        published: true,
        status: 'active',
        photos: record.photos,
        updatedAt: new Date().toISOString(),
      };
      localDeals.unshift(restoreLocal);
      localChanged = true;
      console.log('[Watchdog] Restored deal to local cache:', record.dealId);
    }
  }

  if (localChanged) {
    try {
      await AsyncStorage.setItem(scopedKey('jv_deals_v2'), JSON.stringify(localDeals));
      console.log('[Watchdog] Updated local cache after integrity check');
    } catch (err) {
      report.errors.push(`Local cache save failed: ${(err as Error)?.message}`);
    }
  }

  await savePublishedRegistry(registry);

  try {
    const raw = await AsyncStorage.getItem(INTEGRITY_SNAPSHOT_KEY);
    const history: IntegrityReport[] = raw ? JSON.parse(raw) : [];
    history.unshift(report);
    if (history.length > 50) history.length = 50;
    await AsyncStorage.setItem(INTEGRITY_SNAPSHOT_KEY, JSON.stringify(history));
  } catch {}

  console.log('[Watchdog] Integrity check complete:', JSON.stringify(report));
  return report;
}

export async function getIntegrityHistory(): Promise<IntegrityReport[]> {
  try {
    const raw = await AsyncStorage.getItem(INTEGRITY_SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function getWriteQueueStatus(): Promise<{ pending: number; items: WriteQueueItem[] }> {
  const queue = await getWriteQueue();
  return { pending: queue.length, items: queue };
}

export async function getWALStatus(): Promise<{ total: number; uncommitted: number; entries: WALEntry[] }> {
  const wal = await getWAL();
  const uncommitted = wal.filter(e => !e.committed && !e.rolledBack).length;
  return { total: wal.length, uncommitted, entries: wal.slice(0, 20) };
}

export async function cleanupWAL(): Promise<number> {
  const wal = await getWAL();
  const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const filtered = wal.filter(e => new Date(e.timestamp).getTime() > cutoff || !e.committed);
  const removed = wal.length - filtered.length;
  if (removed > 0) {
    await saveWAL(filtered);
    console.log('[WAL] Cleaned up', removed, 'old committed entries');
  }
  return removed;
}

let _watchdogInterval: ReturnType<typeof setInterval> | null = null;
let _watchdogRunning = false;
const WATCHDOG_INTERVAL = 60_000;
const WRITE_QUEUE_INTERVAL = 30_000;
let _writeQueueInterval: ReturnType<typeof setInterval> | null = null;

export async function autoCleanStaleItems(): Promise<void> {
  try {
    const wal = await getWAL();
    const cutoff = Date.now() - (WAL_AUTO_CLEANUP_DAYS * 24 * 60 * 60 * 1000);
    const fresh = wal.filter(e => {
      const ts = new Date(e.timestamp).getTime();
      return ts > cutoff || (!e.committed && !e.rolledBack);
    });
    if (fresh.length < wal.length) {
      await saveWAL(fresh);
      console.log(`[Persistence] Auto-cleaned ${wal.length - fresh.length} stale WAL entries`);
    }

    const queue = await getWriteQueue();
    const queueCutoff = Date.now() - (STALE_QUEUE_ITEM_HOURS * 60 * 60 * 1000);
    const freshQueue = queue.filter(item => {
      const ts = new Date(item.timestamp).getTime();
      return ts > queueCutoff || item.retryCount < item.maxRetries;
    });
    if (freshQueue.length < queue.length) {
      await saveWriteQueue(freshQueue);
      console.log(`[Persistence] Auto-cleaned ${queue.length - freshQueue.length} stale queue items`);
    }
  } catch (err) {
    console.log('[Persistence] Auto-clean error:', (err as Error)?.message);
  }
}

export function startPersistenceEngine(): () => void {
  console.log('[Persistence] Starting persistence engine (WAL + WriteQueue + Watchdog)...');

  setTimeout(async () => {
    try {
      const { replayed, failed } = await walReplayUncommitted();
      if (replayed > 0 || failed > 0) {
        console.log('[Persistence] WAL replay on startup — replayed:', replayed, '| failed:', failed);
      }
    } catch (err) {
      console.log('[Persistence] WAL replay error:', (err as Error)?.message);
    }
  }, 3000);

  setTimeout(async () => {
    try {
      const result = await processWriteQueue();
      if (result.processed > 0 || result.remaining > 0) {
        console.log('[Persistence] Write queue processed on startup:', result);
      }
    } catch (err) {
      console.log('[Persistence] Write queue error:', (err as Error)?.message);
    }
  }, 5000);

  setTimeout(async () => {
    try {
      await cleanupWAL();
    } catch {}
  }, 10000);

  _watchdogInterval = setInterval(async () => {
    if (_watchdogRunning) return;
    _watchdogRunning = true;
    try {
      await runPublicationIntegrityCheck();
    } catch (err) {
      console.log('[Watchdog] Periodic check error:', (err as Error)?.message);
    } finally {
      _watchdogRunning = false;
    }
  }, WATCHDOG_INTERVAL);

  _writeQueueInterval = setInterval(async () => {
    try {
      await processWriteQueue();
    } catch (err) {
      console.log('[WriteQueue] Periodic process error:', (err as Error)?.message);
    }
  }, WRITE_QUEUE_INTERVAL);

  let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;
  let visibilityHandler: (() => void) | null = null;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    visibilityHandler = () => {
      if (!document.hidden) {
        console.log('[Persistence] Tab visible — replaying WAL + processing queue...');
        void walReplayUncommitted();
        void processWriteQueue();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  } else {
    appStateSubscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        console.log('[Persistence] App foregrounded — replaying WAL + processing queue...');
        void walReplayUncommitted();
        void processWriteQueue();
      }
    });
  }

  return () => {
    console.log('[Persistence] Stopping persistence engine...');
    if (_watchdogInterval) {
      clearInterval(_watchdogInterval);
      _watchdogInterval = null;
    }
    if (_writeQueueInterval) {
      clearInterval(_writeQueueInterval);
      _writeQueueInterval = null;
    }
    if (visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityHandler);
    }
    if (appStateSubscription) {
      appStateSubscription.remove();
    }
  };
}
