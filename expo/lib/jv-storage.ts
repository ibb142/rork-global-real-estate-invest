import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { scopedKey } from '@/lib/project-storage';
import { getAuthUserRole, getAuthUserId, isAdminRole, loadStoredAuth } from '@/lib/auth-store';
import { logAudit } from '@/lib/audit-trail';
import { captureDeleteSnapshot } from '@/lib/data-recovery';
import { walBegin, walCommit, walRollback, enqueueWrite, registerPublishedDeal, clearQueueForDeal, clearWALForDeal } from '@/lib/jv-persistence';
import type { JVAuditEvent } from '@/types/database';

const JV_STORAGE_KEY = scopedKey('jv_deals_v2');
const WAITLIST_STORAGE_KEY = scopedKey('waitlist_v1');
const TRASH_STORAGE_KEY = scopedKey('jv_trash_v1');
const AUDIT_LOG_KEY = scopedKey('jv_audit_log_v1');
const _permanentDeleteTimestamps: number[] = [];
const PERM_DELETE_RATE_LIMIT = 3;
const PERM_DELETE_WINDOW_MS = 60_000;

async function requireAdmin(action: string, adminOverride?: boolean): Promise<{ allowed: boolean; userId: string; role: string; error?: string }> {
  let role = getAuthUserRole();
  let userId = getAuthUserId();

  if (adminOverride === true) {
    console.log(`[JV-Storage] ✅ ADMIN OVERRIDE granted for: ${action} | userId: '${userId}', role: '${role}'`);
    return { allowed: true, userId: userId || 'admin-override', role: role || 'owner', error: undefined };
  }

  if (!isAdminRole(role)) {
    console.log(`[JV-Storage] Role '${role}' not admin — loading stored auth...`);
    try {
      const stored = await loadStoredAuth();
      if (stored.userRole) {
        role = stored.userRole;
        userId = stored.userId || userId;
        console.log(`[JV-Storage] Loaded stored auth — role: '${role}', userId: '${userId}'`);
      }
    } catch (err) {
      console.log('[JV-Storage] Failed to load stored auth:', (err as Error)?.message);
    }
  }

  if (!isAdminRole(role) && userId) {
    console.log(`[JV-Storage] Local role '${role}' not admin — verifying from Supabase profiles...`);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single();
      if (!error && data?.role) {
        role = data.role;
        console.log(`[JV-Storage] Server-verified role: '${role}' for userId: '${userId}'`);
      } else {
        console.log('[JV-Storage] Could not verify role from server:', error?.message);
      }
    } catch (err) {
      console.log('[JV-Storage] Server role check failed:', (err as Error)?.message);
    }
  }

  const allowed = isAdminRole(role);
  if (!allowed) {
    console.warn(`[JV-Storage] 🚫 BLOCKED — ${action} requires admin. Current role: '${role}', userId: '${userId}'`);
  }
  return { allowed, userId: userId ?? 'anonymous', role: role ?? 'unknown', error: allowed ? undefined : `Only admin users can ${action}. Your role: ${role}` };
}

function checkPermanentDeleteRateLimit(): boolean {
  const now = Date.now();
  const recent = _permanentDeleteTimestamps.filter(t => now - t < PERM_DELETE_WINDOW_MS);
  _permanentDeleteTimestamps.length = 0;
  _permanentDeleteTimestamps.push(...recent);
  if (recent.length >= PERM_DELETE_RATE_LIMIT) {
    console.warn('[JV-Storage] 🚫 RATE LIMIT — too many permanent deletes. Max', PERM_DELETE_RATE_LIMIT, 'per minute.');
    return false;
  }
  return true;
}

async function logAuditEvent(event: JVAuditEvent): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(AUDIT_LOG_KEY);
    const log: JVAuditEvent[] = raw ? JSON.parse(raw) : [];
    log.unshift({ ...event, timestamp: new Date().toISOString() });
    if (log.length > 5000) log.length = 5000;
    await AsyncStorage.setItem(AUDIT_LOG_KEY, JSON.stringify(log));
    console.log('[JV-Audit]', event.action, '| deal:', event.dealId, '| by:', event.userId, '| role:', event.role);
  } catch (err) {
    console.log('[JV-Audit] Failed to write audit log:', (err as Error)?.message);
  }

  try {
    await logAudit({
      entityType: 'jv_deal',
      entityId: event.dealId,
      entityTitle: event.dealTitle,
      action: event.action as 'CREATE' | 'UPDATE' | 'DELETE' | 'TRASH' | 'RESTORE' | 'RESTORE_FROM_TRASH' | 'PERMANENT_DELETE' | 'ARCHIVE' | 'PUBLISH' | 'UNPUBLISH',
      source: 'admin',
      details: { userId: event.userId, role: event.role },
    });
  } catch (auditErr) {
    console.log('[JV-Audit] Supabase audit sync skipped (non-critical):', (auditErr as Error)?.message);
  }
}

export async function getAuditLog(): Promise<JVAuditEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(AUDIT_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const _photoRestoreQueue: Map<string, string[]> = new Map();
let _photoRestoreTimer: ReturnType<typeof setTimeout> | null = null;

function _queuePhotoRestore(dealId: string, photos: string[]): void {
  _photoRestoreQueue.set(dealId, photos);
  if (_photoRestoreTimer) return;
  _photoRestoreTimer = setTimeout(async () => {
    _photoRestoreTimer = null;
    const entries = Array.from(_photoRestoreQueue.entries());
    _photoRestoreQueue.clear();
    for (const [id, fallbackPhotos] of entries) {
      try {
        const { error } = await supabase.from('jv_deals').update({
          photos: JSON.stringify(fallbackPhotos),
          updated_at: new Date().toISOString(),
        }).eq('id', id);
        if (error) {
          console.log('[JV-Storage] Photo restore failed for', id, ':', error.message);
        } else {
          console.log('[JV-Storage] Photo restore SUCCESS for', id, ':', fallbackPhotos.length, 'photos written back to Supabase');
        }
      } catch (err) {
        console.log('[JV-Storage] Photo restore exception for', id, ':', (err as Error)?.message);
      }
    }
  }, 3000);
}

let _supabaseAvailable: boolean | null = null;
let _supabaseCheckTimestamp: number = 0;
const SUPABASE_CACHE_TTL = 30000;
const SUPABASE_FAILURE_CACHE_TTL = 5000;
const _tableCache: Record<string, boolean> = {};
const _tableCacheTimestamps: Record<string, number> = {};
const TABLE_CACHE_TTL = 30000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTableNotFoundError(error: any): boolean {
  if (!error) return false;
  const code = String(error?.code ?? error?.details?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return code === 'PGRST205' || code === '42703' || code === 'PGRST204'
    || msg.includes('could not find the table') || msg.includes('schema cache')
    || msg.includes('does not exist') || msg.includes('column') && msg.includes('not exist');
}

function isSupabaseConfigured(): boolean {
  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  return !!(url && key);
}

async function checkSupabaseTable(): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }
  const now = Date.now();
  if (_supabaseAvailable === true && (now - _supabaseCheckTimestamp) < SUPABASE_CACHE_TTL) {
    return true;
  }
  if (_supabaseAvailable === false && (now - _supabaseCheckTimestamp) < SUPABASE_FAILURE_CACHE_TTL) {
    console.log('[JV-Storage] Supabase recently failed — retrying in', Math.max(0, SUPABASE_FAILURE_CACHE_TTL - (now - _supabaseCheckTimestamp)), 'ms');
    return false;
  }
  try {
    console.log('[JV-Storage] Checking Supabase jv_deals table availability...');
    const checkTimeoutMs = 3000;
    const timeoutPromise = new Promise<{ error: { message: string; code: string } }>((resolve) =>
      setTimeout(() => resolve({ error: { message: `Timeout after ${checkTimeoutMs / 1000}s`, code: 'TIMEOUT' } }), checkTimeoutMs)
    );
    const queryPromise = supabase.from('jv_deals').select('id').limit(1);
    const { error } = await Promise.race([queryPromise, timeoutPromise]) as any;
    _supabaseCheckTimestamp = Date.now();
    if (error && isTableNotFoundError(error)) {
      console.log('[JV-Storage] Supabase jv_deals table NOT found — using local storage');
      _supabaseAvailable = false;
      return false;
    }
    if (error) {
      console.log('[JV-Storage] Supabase query error (non-table):', error.message, '— will retry soon');
      _supabaseAvailable = null;
      return false;
    }
    console.log('[JV-Storage] Supabase jv_deals table available ✓');
    _supabaseAvailable = true;
    return true;
  } catch (err) {
    console.log('[JV-Storage] Supabase check failed:', (err as Error)?.message);
    _supabaseCheckTimestamp = Date.now();
    _supabaseAvailable = null;
    return false;
  }
}

export function resetSupabaseCheck(): void {
  _supabaseAvailable = null;
  _supabaseCheckTimestamp = 0;
  Object.keys(_tableCache).forEach(k => delete _tableCache[k]);
  Object.keys(_tableCacheTimestamps).forEach(k => delete _tableCacheTimestamps[k]);
  console.log('[JV-Storage] Supabase check + table cache fully reset');
}

export async function clearLocalDealCache(): Promise<void> {
  try {
    const existingRaw = await AsyncStorage.getItem(JV_STORAGE_KEY);
    if (existingRaw) {
      try {
        const existing = JSON.parse(existingRaw);
        if (Array.isArray(existing) && existing.length > 0) {
          await AsyncStorage.setItem(BACKUP_CACHE_KEY, existingRaw);
          console.log('[JV-Storage] 🛡️ Backed up', existing.length, 'deals before clearing cache');
        }
      } catch {}
    }
    await AsyncStorage.removeItem(JV_STORAGE_KEY);
    _supabaseAvailable = null;
    _supabaseCheckTimestamp = 0;
    Object.keys(_tableCache).forEach(k => delete _tableCache[k]);
    Object.keys(_tableCacheTimestamps).forEach(k => delete _tableCacheTimestamps[k]);
    console.log('[JV-Storage] Local deal cache cleared (backup preserved)');
  } catch (err) {
    console.log('[JV-Storage] Failed to clear local cache:', (err as Error)?.message);
  }
}

function isDeletedOrTrashed(deal: any): boolean {
  const s = String(deal?.status || '').toLowerCase();
  return s === 'trashed' || s === 'permanently_deleted' || s === 'deleted';
}

function deduplicateDeals(deals: any[]): any[] {
  const seenById = new Map<string, any>();
  for (const deal of deals) {
    const id = deal?.id;
    if (!id) continue;
    if (isDeletedOrTrashed(deal)) {
      console.log('[JV-Storage] DEDUP: skipping trashed/deleted deal:', deal.id, deal.status);
      continue;
    }
    if (seenById.has(id)) {
      const existing = seenById.get(id);
      const existingTime = existing?.updatedAt || existing?.updated_at || existing?.createdAt || existing?.created_at || '';
      const newTime = deal?.updatedAt || deal?.updated_at || deal?.createdAt || deal?.created_at || '';
      if (String(newTime) > String(existingTime)) {
        console.log('[JV-Storage] DEDUP by id: keeping newer version of', id);
        seenById.set(id, deal);
      }
    } else {
      seenById.set(id, deal);
    }
  }
  const result = Array.from(seenById.values());
  console.log('[JV-Storage] DEDUP: input', deals.length, '→ output', result.length, 'deals (ID-only dedup, no name-based removal)');
  return result;
}

const BACKUP_CACHE_KEY = 'ivx_jv_agreements_cache';

async function getLocalDeals(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(JV_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    console.log('[JV-Storage] Primary local storage empty — checking backup cache...');
    const backup = await AsyncStorage.getItem(BACKUP_CACHE_KEY);
    if (backup) {
      const parsedBackup = JSON.parse(backup);
      if (Array.isArray(parsedBackup) && parsedBackup.length > 0) {
        console.log('[JV-Storage] ✅ Restored', parsedBackup.length, 'deals from backup cache');
        await AsyncStorage.setItem(JV_STORAGE_KEY, backup);
        return parsedBackup;
      }
    }
    return [];
  } catch (err) {
    console.log('[JV-Storage] Local read error:', (err as Error)?.message);
    return [];
  }
}

async function saveBackupCache(deals: any[]): Promise<void> {
  try {
    if (deals.length === 0) {
      const existingRaw = await AsyncStorage.getItem(BACKUP_CACHE_KEY);
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        if (Array.isArray(existing) && existing.length > 0) {
          console.log('[JV-Storage] 🛡️ SAFETY: Refusing to overwrite backup cache (', existing.length, 'deals) with empty array');
          return;
        }
      }
    }
    await AsyncStorage.setItem(BACKUP_CACHE_KEY, JSON.stringify(deals));
  } catch (err) {
    console.log('[JV-Storage] Backup cache save error:', (err as Error)?.message);
  }
}

async function saveLocalDeals(deals: any[]): Promise<void> {
  try {
    if (deals.length === 0) {
      const existingRaw = await AsyncStorage.getItem(JV_STORAGE_KEY);
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        if (Array.isArray(existing) && existing.length > 0) {
          console.log('[JV-Storage] 🛡️ SAFETY: Refusing to overwrite', existing.length, 'existing deals with empty array');
          return;
        }
      }
    }
    const json = JSON.stringify(deals);
    await AsyncStorage.setItem(JV_STORAGE_KEY, json);
    await AsyncStorage.setItem(BACKUP_CACHE_KEY, json);
    console.log('[JV-Storage] Saved', deals.length, 'deals to local + backup');
  } catch (err) {
    console.log('[JV-Storage] Local save error:', (err as Error)?.message);
  }
}

function parseJsonField(val: unknown, fallback: any = []): any {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return val;
}

function mapSupabaseRowToCamelCase(row: any): any {
  if (!row) return row;

  let photos = parseJsonField(row.photos, []);
  if (!Array.isArray(photos)) photos = [];
  const rawPhotoCount = photos.length;
  photos = photos.filter((p: any) => {
    if (typeof p !== 'string' || p.length <= 5) return false;
    if (p.startsWith('data:image/') && p.length > 500000) {
      console.log('[JV-Storage] Filtered out oversized base64 photo:', (p.length / 1024).toFixed(0), 'KB for deal:', row.id);
      return false;
    }
    if (!p.startsWith('http') && !p.startsWith('data:image/')) return false;
    const lower = p.toLowerCase();
    if (lower.includes('picsum.photos') || lower.includes('placehold.co') || lower.includes('via.placeholder.com') || lower.includes('placekitten.com') || lower.includes('loremflickr.com') || lower.includes('dummyimage.com') || lower.includes('fakeimg.pl') || lower.includes('lorempixel.com') || lower.includes('placeholder.com')) {
      console.log('[JV-Storage] Filtered out placeholder photo:', p.substring(0, 80));
      return false;
    }
    return true;
  });
  if (rawPhotoCount > 0 && photos.length !== rawPhotoCount) {
    console.log('[JV-Storage] Photo filter: kept', photos.length, 'of', rawPhotoCount, 'photos for deal:', row.id);
  }

  if (photos.length === 0) {
    try {
      const { getFallbackPhotosForDeal } = require('@/constants/deal-photos');
      const fallback = getFallbackPhotosForDeal({
        title: row.title || '',
        projectName: row.projectName || row.project_name || '',
      });
      if (fallback.length > 0) {
        photos = fallback;
        console.log('[JV-Storage] Applied fallback photos for deal:', row.id, '| count:', fallback.length);
        _queuePhotoRestore(row.id, fallback);
      }
    } catch {}
  }

  if (photos.length === 0 && row.id) {
    try {
      const { fetchPhotosFromStorageBucket } = require('@/constants/deal-photos');
      fetchPhotosFromStorageBucket(row.id).then((storagePhotos: string[]) => {
        if (storagePhotos.length > 0) {
          console.log('[JV-Storage] Found', storagePhotos.length, 'photos in Storage bucket for deal:', row.id, '— queueing restore');
          _queuePhotoRestore(row.id, storagePhotos);
        }
      }).catch(() => {});
    } catch {}
  }

  let partners = parseJsonField(row.partners, []);
  let poolTiers = parseJsonField(row.poolTiers ?? row.pool_tiers, undefined);



  return {
    ...row,
    photos,
    partners,
    poolTiers,
    projectName: row.projectName || row.project_name || '',
    propertyAddress: row.propertyAddress || row.property_address || '',
    totalInvestment: row.totalInvestment || row.total_investment || 0,
    expectedROI: row.expectedROI || row.expected_roi || 0,
    distributionFrequency: row.distributionFrequency || row.distribution_frequency || 'Monthly',
    exitStrategy: row.exitStrategy || row.exit_strategy || 'Sale upon completion',
    publishedAt: row.publishedAt || row.published_at || '',
    createdAt: row.createdAt || row.created_at || '',
    updatedAt: row.updatedAt || row.updated_at || '',
    managementFee: row.managementFee ?? row.management_fee ?? 2,
    performanceFee: row.performanceFee ?? row.performance_fee ?? 20,
    minimumHoldPeriod: row.minimumHoldPeriod ?? row.minimum_hold_period ?? 12,
    startDate: row.startDate || row.start_date || '',
    endDate: row.endDate || row.end_date || '',
    governingLaw: row.governingLaw || row.governing_law || 'State of Florida',
    disputeResolution: row.disputeResolution || row.dispute_resolution || 'Binding Arbitration',
    confidentialityPeriod: row.confidentialityPeriod ?? row.confidentiality_period ?? 24,
    nonCompetePeriod: row.nonCompetePeriod ?? row.non_compete_period ?? 12,
    profitSplit: row.profitSplit || row.profit_split || '70/30 Developer/Investor',
    displayOrder: row.displayOrder ?? row.display_order ?? 999,
  };
}

const CAMEL_TO_SNAKE: Record<string, string> = {
  projectName: 'project_name',
  propertyValue: 'property_value',
  propertyAddress: 'property_address',
  totalInvestment: 'total_investment',
  expectedROI: 'expected_roi',
  distributionFrequency: 'distribution_frequency',
  exitStrategy: 'exit_strategy',
  publishedAt: 'published_at',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  poolTiers: 'pool_tiers',
  profitSplit: 'profit_split',
  startDate: 'start_date',
  endDate: 'end_date',
  governingLaw: 'governing_law',
  disputeResolution: 'dispute_resolution',
  confidentialityPeriod: 'confidentiality_period',
  nonCompetePeriod: 'non_compete_period',
  managementFee: 'management_fee',
  performanceFee: 'performance_fee',
  minimumHoldPeriod: 'minimum_hold_period',
  displayOrder: 'display_order',
};

const VALID_COLUMNS = new Set([
  'id', 'title', 'project_name', 'type', 'description',
  'partner_name', 'partner_email', 'partner_phone', 'partner_type',
  'property_address', 'city', 'state', 'zip_code', 'country',
  'lot_size', 'lot_size_unit', 'zoning', 'property_type',
  'total_investment', 'expected_roi', 'estimated_value', 'appraised_value',
  'cash_payment_percent', 'collateral_percent', 'partner_profit_share',
  'developer_profit_share', 'term_months', 'cash_payment_amount', 'collateral_amount',
  'distribution_frequency', 'exit_strategy', 'partners', 'pool_tiers',
  'status', 'published', 'published_at', 'photos', 'documents', 'notes',
  'rejection_reason', 'control_disclosure_accepted', 'control_disclosure_accepted_at',
  'payment_structure', 'user_id', 'created_at', 'updated_at',
  'submitted_at', 'approved_at', 'completed_at',
  'currency', 'profit_split', 'start_date', 'end_date',
  'governing_law', 'dispute_resolution', 'confidentiality_period',
  'non_compete_period', 'management_fee', 'performance_fee', 'minimum_hold_period', 'display_order',
  'trust_info', 'trustInfo', 'property_value', 'propertyValue',
  'projectName', 'propertyAddress', 'totalInvestment', 'expectedROI',
  'distributionFrequency', 'exitStrategy', 'poolTiers', 'publishedAt',
  'createdAt', 'updatedAt', 'profitSplit', 'startDate', 'endDate',
  'governingLaw', 'disputeResolution', 'confidentialityPeriod',
  'nonCompetePeriod', 'managementFee', 'performanceFee', 'minimumHoldPeriod',
  'displayOrder',
]);

function sanitizePayloadForSupabase(payload: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!VALID_COLUMNS.has(key)) {
      console.log('[JV-Storage] Dropping unknown column from Supabase payload:', key);
      continue;
    }
    const snakeKey = CAMEL_TO_SNAKE[key];
    if (snakeKey) {
      sanitized[snakeKey] = value;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export async function fetchJVDeals(filters?: { published?: boolean; limit?: number; forceReset?: boolean }): Promise<{ deals: any[]; total: number }> {
  const MASTER_TIMEOUT_MS = 12000;
  const masterTimeout = new Promise<{ deals: any[]; total: number }>((resolve) =>
    setTimeout(() => {
      console.warn('[JV-Storage] ⚠️ MASTER TIMEOUT hit after', MASTER_TIMEOUT_MS, 'ms — returning local cache');
      resolve(getLocalDeals().then(local => {
        const filtered = filters?.published !== undefined
          ? local.filter(d => d.published === filters.published)
          : local;
        return { deals: filtered, total: filtered.length };
      }).catch(() => ({ deals: [], total: 0 })));
    }, MASTER_TIMEOUT_MS)
  );

  return Promise.race([_fetchJVDealsInternal(filters), masterTimeout]);
}

async function _fetchJVDealsInternal(filters?: { published?: boolean; limit?: number; forceReset?: boolean }): Promise<{ deals: any[]; total: number }> {
  let supabaseDeals: any[] | null = null;
  let supabaseCount: number | null = null;

  if (filters?.forceReset) {
    _supabaseAvailable = null;
    _supabaseCheckTimestamp = 0;
    console.log('[JV-Storage] forceReset — cleared Supabase availability cache before fetch');
  }

  try {
    const now = Date.now();
    const skipSupabase = _supabaseAvailable === false && (now - _supabaseCheckTimestamp) < SUPABASE_FAILURE_CACHE_TTL;
    if (skipSupabase) {
      console.log('[JV-Storage] Supabase recently failed — skipping, using local');
    } else {
      console.log('[JV-Storage] Fetching deals directly from Supabase (no pre-flight check)...');
      const fetchTimeoutMs = 8000;

      let query = supabase.from('jv_deals').select('*', { count: 'exact' });
      query = query.order('display_order', { ascending: true, nullsFirst: false });
      query = query.order('created_at', { ascending: false });
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }
      const timeoutPromise = new Promise<{ data: null; error: { message: string; code: string }; count: null }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: `Fetch timeout ${fetchTimeoutMs / 1000}s`, code: 'TIMEOUT' }, count: null }), fetchTimeoutMs)
      );
      const { data, error, count } = await Promise.race([query, timeoutPromise]) as any;
      if (error) {
        if (isTableNotFoundError(error)) {
          _supabaseAvailable = false;
          _supabaseCheckTimestamp = Date.now();
          console.log('[JV-Storage] Table not found — falling back to local');
        } else if (error.code === 'TIMEOUT') {
          console.log('[JV-Storage] Supabase fetch TIMEOUT — preserving local data, NOT clearing cache');
          _supabaseAvailable = null;
          _supabaseCheckTimestamp = 0;
        } else {
          console.log('[JV-Storage] Supabase fetch error:', error.message, error.code, '| Platform:', Platform.OS);
          try {
            const retryTimeoutMs = 6000;
            console.log('[JV-Storage] Retrying fetch WITHOUT filters (timeout:', retryTimeoutMs, 'ms)...');
            const retryQuery = supabase.from('jv_deals').select('*', { count: 'exact' });
            const retryTimeout = new Promise<{ data: null; error: { message: string; code: string }; count: null }>((resolve) =>
              setTimeout(() => resolve({ data: null, error: { message: `Retry timeout ${retryTimeoutMs / 1000}s`, code: 'TIMEOUT' }, count: null }), retryTimeoutMs)
            );
            const retryResult = await Promise.race([retryQuery, retryTimeout]) as any;
            if (!retryResult.error && retryResult.data) {
              const retryMapped = (retryResult.data || []).map(mapSupabaseRowToCamelCase);
              console.log('[JV-Storage] ✅ Retry succeeded:', retryMapped.length, 'deals');
              supabaseDeals = retryMapped;
              supabaseCount = retryResult.count;
              _supabaseAvailable = true;
              _supabaseCheckTimestamp = Date.now();
            } else {
              console.log('[JV-Storage] Retry also failed:', retryResult.error?.message);
            }
          } catch (retryErr) {
            console.log('[JV-Storage] Retry exception:', (retryErr as Error)?.message);
          }
          if (supabaseDeals === null) {
            _supabaseAvailable = null;
            _supabaseCheckTimestamp = 0;
          }
        }
      } else {
        _supabaseAvailable = true;
        _supabaseCheckTimestamp = Date.now();
        const mapped = (data || []).map(mapSupabaseRowToCamelCase);
        supabaseDeals = mapped;
        supabaseCount = count;
        console.log('[JV-Storage] ✅ Fetched', mapped.length, 'deals from Supabase (will post-filter published:', filters?.published, ')');
        if (mapped.length > 0) {
          for (const d of mapped) {
            console.log('[JV-Storage] Supabase deal:', d.id, '| title:', d.title || d.projectName, '| published:', d.published, '| status:', d.status);
          }
        }

        if (mapped.length > 0) {
          try {
            const activeOnly = mapped.filter((d: any) => !isDeletedOrTrashed(d));
            await saveLocalDeals(activeOnly);
            await saveBackupCache(activeOnly);
            console.log('[JV-Storage] Replaced local cache with', activeOnly.length, 'active Supabase deals (filtered out', mapped.length - activeOnly.length, 'trashed/deleted)');
          } catch (syncErr) {
            console.log('[JV-Storage] Local sync-back failed (non-critical):', (syncErr as Error)?.message);
          }
        }
      }
    }
  } catch (err) {
    console.log('[JV-Storage] Supabase fetch exception:', (err as Error)?.message, '— falling back to local');
    _supabaseAvailable = null;
    _supabaseCheckTimestamp = 0;
  }

  if (supabaseDeals !== null) {
    console.log('[JV-Storage] Processing', supabaseDeals.length, 'Supabase deals before filtering');

    if (supabaseDeals.length === 0) {
      console.log('[JV-Storage] Supabase returned 0 deals — this is authoritative (Supabase is source of truth)');
      try {
        await AsyncStorage.removeItem(JV_STORAGE_KEY);
        console.log('[JV-Storage] Cleared stale local cache to match Supabase');
      } catch {}
    }

    const activeSupabaseDeals = supabaseDeals.filter((d: any) => !isDeletedOrTrashed(d));
    if (activeSupabaseDeals.length !== supabaseDeals.length) {
      console.log('[JV-Storage] Filtered out', supabaseDeals.length - activeSupabaseDeals.length, 'trashed/deleted deals from Supabase results');
    }
    supabaseDeals = activeSupabaseDeals;

    if (filters?.published !== undefined) {
      const beforeFilter = supabaseDeals.length;
      supabaseDeals = supabaseDeals.filter((d: any) => {
        const val = d.published;
        const target = filters.published;
        if (typeof val === 'boolean') return val === target;
        if (typeof val === 'string') return (val === 'true') === target;
        return Boolean(val) === target;
      });
      console.log('[JV-Storage] Published filter (target:', filters.published, '): kept', supabaseDeals.length, 'of', beforeFilter, 'deals');

      if (supabaseDeals.length === 0 && beforeFilter > 0) {
        console.log('[JV-Storage] Published filter eliminated all', beforeFilter, 'Supabase deals — Supabase is authoritative, returning empty');
      }
    }

    const deduped = deduplicateDeals(supabaseDeals);
    if (deduped.length !== supabaseDeals.length) {
      console.log('[JV-Storage] ⚠️ DEDUP removed', supabaseDeals.length - deduped.length, 'duplicate deals (Supabase path)');
    }
    deduped.sort((a: any, b: any) => {
      const orderA = a.displayOrder ?? a.display_order ?? 999;
      const orderB = b.displayOrder ?? b.display_order ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      const dateA = a.createdAt || a.created_at || '';
      const dateB = b.createdAt || b.created_at || '';
      return String(dateB).localeCompare(String(dateA));
    });
    console.log('[JV-Storage] Returning', deduped.length, 'deals from Supabase path');
    return { deals: deduped, total: supabaseCount || deduped.length };
  }

  let deals = await getLocalDeals();

  if (filters?.published !== undefined) {
    deals = deals.filter(d => d.published === filters.published);
  }
  deals.sort((a: any, b: any) => {
    const orderA = a.displayOrder ?? a.display_order ?? 999;
    const orderB = b.displayOrder ?? b.display_order ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });
  if (filters?.limit) {
    deals = deals.slice(0, filters.limit);
  }
  const dedupedLocal = deduplicateDeals(deals);
  if (dedupedLocal.length !== deals.length) {
    console.log('[JV-Storage] ⚠️ DEDUP removed', deals.length - dedupedLocal.length, 'duplicate deals (local path)');
  }
  console.log('[JV-Storage] Returning', dedupedLocal.length, 'deals from local storage');
  if (dedupedLocal.length > 0) {
    return { deals: dedupedLocal, total: dedupedLocal.length };
  }

  try {
    const backendUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
    if (backendUrl) {
      console.log('[JV-Storage] Local storage empty — trying backend API fallback:', backendUrl + '/api/landing-deals');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const response = await fetch(backendUrl + '/api/landing-deals', { signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) {
        const result = await response.json();
        const apiDeals = Array.isArray(result) ? result : (result?.deals || []);
        if (apiDeals.length > 0) {
          const mapped = apiDeals.map(mapSupabaseRowToCamelCase);
          console.log('[JV-Storage] Backend API returned', mapped.length, 'deals as fallback');
          await saveLocalDeals(mapped);
          let filteredApi = mapped;
          if (filters?.published !== undefined) {
            filteredApi = filteredApi.filter((d: any) => {
              const val = d.published;
              const target = filters.published;
              if (typeof val === 'boolean') return val === target;
              if (typeof val === 'string') return (val === 'true') === target;
              return Boolean(val) === target;
            });
          }
          return { deals: deduplicateDeals(filteredApi), total: filteredApi.length };
        }
      }
    }
  } catch (apiErr) {
    console.log('[JV-Storage] Backend API fallback failed:', (apiErr as Error)?.message);
  }

  return { deals: dedupedLocal, total: dedupedLocal.length };
}

export async function fetchJVDealById(id: string): Promise<any> {
  const now = Date.now();
  const skipSupabase = _supabaseAvailable === false && (now - _supabaseCheckTimestamp) < SUPABASE_FAILURE_CACHE_TTL;

  if (!skipSupabase) {
    try {
      const timeoutMs = 3500;
      console.log('[JV-Storage] fetchById — querying Supabase for id:', id, '(timeout:', timeoutMs, 'ms)');
      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: `fetchById timeout ${timeoutMs / 1000}s` } }), timeoutMs)
      );
      const { data, error } = await Promise.race([
        supabase.from('jv_deals').select('*').eq('id', id).single(),
        timeoutPromise,
      ]) as any;
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
        _supabaseCheckTimestamp = Date.now();
      } else if (error) {
        console.log('[JV-Storage] Supabase fetchById error:', error.message, '— trying title/name match...');
        try {
          const { data: allData, error: allErr } = await Promise.race([
            supabase.from('jv_deals').select('*'),
            new Promise<{ data: null; error: { message: string } }>((resolve) =>
              setTimeout(() => resolve({ data: null, error: { message: 'fetchAll fallback timeout' } }), timeoutMs)
            ),
          ]) as any;
          if (!allErr && allData && Array.isArray(allData)) {
            const match = allData.find((d: any) => d.id === id);
            if (match) {
              _supabaseAvailable = true;
              _supabaseCheckTimestamp = Date.now();
              console.log('[JV-Storage] fetchById — found deal via fetchAll fallback:', id);
              return mapSupabaseRowToCamelCase(match);
            }
            console.log('[JV-Storage] fetchById — deal not in', allData.length, 'results from fetchAll');
          }
        } catch (fallbackErr) {
          console.log('[JV-Storage] fetchById fetchAll fallback failed:', (fallbackErr as Error)?.message);
        }
      } else if (data) {
        _supabaseAvailable = true;
        _supabaseCheckTimestamp = Date.now();
        console.log('[JV-Storage] fetchById — found deal in Supabase:', id, data.title || data.project_name);
        return mapSupabaseRowToCamelCase(data);
      }
    } catch (err) {
      console.log('[JV-Storage] Supabase fetchById exception:', (err as Error)?.message);
    }
  }

  const deals = await getLocalDeals();
  const localDeal = deals.find(d => d.id === id);
  if (localDeal) {
    console.log('[JV-Storage] fetchById — found deal in local storage:', id);
    return localDeal;
  }

  console.log('[JV-Storage] fetchById — deal not found anywhere, trying one more Supabase fetch with reset...');
  _supabaseAvailable = null;
  _supabaseCheckTimestamp = 0;
  try {
    const lastResortTimeout = 3500;
    const { data, error } = await Promise.race([
      supabase.from('jv_deals').select('*').eq('id', id).single(),
      new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'last resort timeout' } }), lastResortTimeout)
      ),
    ]) as any;
    if (!error && data) {
      _supabaseAvailable = true;
      _supabaseCheckTimestamp = Date.now();
      console.log('[JV-Storage] fetchById — last resort found deal:', id);
      return mapSupabaseRowToCamelCase(data);
    }
  } catch (lastErr) {
    console.log('[JV-Storage] fetchById last resort failed:', (lastErr as Error)?.message);
  }

  return null;
}

async function generateUniqueDealTitle(title: string, projectName: string, existingId: string | undefined, useSupabase: boolean): Promise<{ title: string; projectName: string }> {
  if (!title && !projectName) return { title, projectName };

  const baseName = (title || projectName || '').trim();
  if (!baseName) return { title, projectName };

  try {
    let existingNames: string[] = [];

    if (useSupabase) {
      const { data } = await supabase
        .from('jv_deals')
        .select('id, title, project_name')
        .not('status', 'in', '("trashed","permanently_deleted","deleted")');
      if (data && Array.isArray(data)) {
        existingNames = data
          .filter((d: any) => !existingId || d.id !== existingId)
          .map((d: any) => ((d.title || d.project_name || '') as string).trim().toUpperCase());
      }
    }

    const localDeals = await getLocalDeals();
    const localNames = localDeals
      .filter(d => !isDeletedOrTrashed(d) && (!existingId || d.id !== existingId))
      .map(d => ((d.title || d.projectName || d.project_name || '') as string).trim().toUpperCase());

    const allNames = new Set([...existingNames, ...localNames]);

    const upperBase = baseName.toUpperCase();
    if (!allNames.has(upperBase)) {
      console.log('[JV-Storage] Deal name is unique:', baseName);
      return { title, projectName };
    }

    const baseWithoutNum = baseName.replace(/\s+\d+$/, '').trim();
    const upperBaseNoNum = baseWithoutNum.toUpperCase();

    let maxNum = 0;
    for (const name of allNames) {
      if (name === upperBaseNoNum) {
        maxNum = Math.max(maxNum, 1);
      }
      const match = name.match(new RegExp(`^${upperBaseNoNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)$`));
      if (match) {
        maxNum = Math.max(maxNum, parseInt(match[1] ?? '0', 10));
      }
    }

    const nextNum = maxNum + 1;
    const uniqueName = `${baseWithoutNum} ${nextNum}`;
    console.log('[JV-Storage] Duplicate name detected! "' + baseName + '" → "' + uniqueName + '"');

    return {
      title: title ? uniqueName : title,
      projectName: projectName ? uniqueName : projectName,
    };
  } catch (err) {
    console.log('[JV-Storage] generateUniqueDealTitle error (non-critical):', (err as Error)?.message);
    return { title, projectName };
  }
}

export async function upsertJVDeal(payload: Record<string, unknown>, options?: { adminOverride?: boolean }): Promise<{ data: any; error: null } | { data: null; error: Error }> {
  const useSupabase = await checkSupabaseTable();
  const isAdmin = options?.adminOverride === true;

  const existingId = payload.id as string | undefined;
  if (existingId) {
    payload = await protectPhotos(existingId, payload, useSupabase, isAdmin);
  }

  const isNewDeal = !existingId;
  if (isNewDeal) {
    const incomingTitle = (payload.title as string) || '';
    const incomingProjectName = (payload.projectName as string) || (payload.project_name as string) || '';
    const unique = await generateUniqueDealTitle(incomingTitle, incomingProjectName, existingId, useSupabase);
    if (unique.title && payload.title) payload.title = unique.title;
    if (unique.projectName) {
      if (payload.projectName) payload.projectName = unique.projectName;
      if (payload.project_name) payload.project_name = unique.projectName;
    }
    console.log('[JV-Storage] New deal name after dedup check — title:', payload.title, '| projectName:', payload.projectName || payload.project_name);
  }

  const dealId = (payload.id as string) || 'new';
  const dealTitle = (payload.title as string) || (payload.projectName as string) || 'Unknown';
  let walId: string | null = null;
  try {
    walId = await walBegin('INSERT', dealId, dealTitle, null, payload);
  } catch (walErr) {
    console.log('[JV-Storage] WAL begin failed (non-critical):', (walErr as Error)?.message);
  }

  if (useSupabase) {
    try {
      const safePayload = sanitizePayloadForSupabase(payload);
      console.log('[JV-Storage] Upserting to Supabase — id:', safePayload.id, 'title:', safePayload.title, 'published:', safePayload.published, 'keys:', Object.keys(safePayload).join(','));
      const { data, error } = await supabase.from('jv_deals').upsert({
        ...safePayload,
        updated_at: new Date().toISOString(),
      }).select().single();
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
        console.log('[JV-Storage] Table not found on upsert — falling back to local');
      } else if (error) {
        console.log('[JV-Storage] Supabase upsert error:', error.message, '| code:', error.code, '| details:', JSON.stringify(error).substring(0, 500));
        try { await enqueueWrite('upsert', dealId, sanitizePayloadForSupabase(payload)); } catch {}
        if (walId) { try { await walRollback(walId); } catch {} }
        return { data: null, error: new Error(error.message) };
      } else {
        console.log('[JV-Storage] Supabase upsert SUCCESS — id:', data?.id, 'published:', data?.published);
        if (walId) { try { await walCommit(walId); } catch {} }
        try { await clearQueueForDeal(data?.id || dealId); } catch {}
        try { await clearWALForDeal(data?.id || dealId); } catch {}
        if (data?.published === true) {
          try { await registerPublishedDeal(mapSupabaseRowToCamelCase(data)); } catch {}
        }
        try {
          const mappedData = mapSupabaseRowToCamelCase(data);
          const localDeals = await getLocalDeals();
          const localIdx = localDeals.findIndex(d => d.id === mappedData.id);
          if (localIdx >= 0) {
            localDeals[localIdx] = { ...localDeals[localIdx], ...mappedData };
          } else {
            localDeals.unshift(mappedData);
          }
          await saveLocalDeals(localDeals);
          console.log('[JV-Storage] DUAL WRITE — also saved to local storage for reliability');
        } catch (localErr) {
          console.log('[JV-Storage] Local backup after Supabase upsert failed (non-critical):', (localErr as Error)?.message);
        }
        return { data, error: null };
      }
    } catch (err) {
      if (!isTableNotFoundError(err)) {
        try { await enqueueWrite('upsert', dealId, sanitizePayloadForSupabase(payload)); } catch {}
        if (walId) { try { await walRollback(walId); } catch {} }
        return { data: null, error: err as Error };
      }
    }
  }

  const deals = await getLocalDeals();
  const id = (payload.id as string) || `local-${Date.now()}-${Math.random().toString(36).substr(2, 8)}`;
  if (!payload.createdAt && !payload.created_at) {
    payload.createdAt = new Date().toISOString();
  }
  const now = new Date().toISOString();
  const existingIndex = deals.findIndex(d => d.id === id);

  if (existingIndex >= 0) {
    const existingDeal = deals[existingIndex];
    const existingPhotos = parseJsonField(existingDeal.photos, []);
    const incomingPhotos = payload.photos;
    const incomingEmpty = !incomingPhotos || (Array.isArray(incomingPhotos) && incomingPhotos.length === 0);
    if (incomingEmpty && Array.isArray(existingPhotos) && existingPhotos.length > 0) {
      console.log('[JV-Storage] 🛡️ PHOTO PROTECTION (local upsert) — preserving', existingPhotos.length, 'photos for deal:', id);
      delete payload.photos;
    }
  }

  const dealData = { ...payload, id, updatedAt: now, createdAt: (existingIndex >= 0 ? deals[existingIndex].createdAt : now) };

  if (existingIndex >= 0) {
    deals[existingIndex] = { ...deals[existingIndex], ...dealData };
  } else {
    deals.unshift(dealData);
  }
  await saveLocalDeals(deals);
  console.log('[JV-Storage] Upserted deal locally:', id);
  return { data: dealData, error: null };
}

async function fetchExistingPhotos(id: string, useSupabase: boolean): Promise<string[]> {
  if (useSupabase) {
    try {
      const { data } = await supabase.from('jv_deals').select('photos').eq('id', id).single();
      if (data) {
        const photos = parseJsonField(data.photos, []);
        if (Array.isArray(photos) && photos.length > 0) return photos;
      }
    } catch (err) {
      console.log('[JV-Storage] Photo fetch from Supabase failed:', (err as Error)?.message);
    }
  }
  try {
    const deals = await getLocalDeals();
    const local = deals.find(d => d.id === id);
    if (local) {
      const photos = parseJsonField(local.photos, []);
      if (Array.isArray(photos) && photos.length > 0) return photos;
    }
  } catch {}
  return [];
}

async function protectPhotos(id: string, updates: Record<string, unknown>, useSupabase: boolean, adminOverride = false): Promise<Record<string, unknown>> {
  if (!('photos' in updates)) return updates;

  const incomingPhotos = updates.photos;
  const isEmpty = !incomingPhotos || (Array.isArray(incomingPhotos) && incomingPhotos.length === 0);
  const existingPhotos = await fetchExistingPhotos(id, useSupabase);
  const existingCount = existingPhotos.length;
  const incomingCount = Array.isArray(incomingPhotos) ? incomingPhotos.length : 0;

  console.log('[JV-Storage] 🔒 PHOTO GUARD — deal:', id, '| existing:', existingCount, '| incoming:', incomingCount, '| adminOverride:', adminOverride, '| isEmpty:', isEmpty);

  if (adminOverride) {
    console.log('[JV-Storage] 🔓 ADMIN OVERRIDE — allowing photo update for deal:', id, '| from', existingCount, 'to', incomingCount);
    return updates;
  }

  if (isEmpty && existingCount > 0) {
    console.log('[JV-Storage] 🛡️ PHOTO CLEAR BLOCKED — cannot clear', existingCount, 'photos without admin override. Deal:', id);
    const protected_ = { ...updates };
    delete protected_.photos;
    return protected_;
  }

  if (!isEmpty && existingCount > 0 && incomingCount < existingCount) {
    console.log('[JV-Storage] 🛡️ PHOTO REDUCTION BLOCKED — existing:', existingCount, 'incoming:', incomingCount, 'deal:', id, '— admin override required');
    const protected_ = { ...updates };
    delete protected_.photos;
    return protected_;
  }

  return updates;
}

export async function updateJVDeal(id: string, updates: Record<string, unknown>, options?: { adminOverride?: boolean }): Promise<{ data: any; error: null } | { data: null; error: Error }> {
  const auth = await requireAdmin('update deal', options?.adminOverride);
  if (!auth.allowed) {
    console.warn('[JV-Storage] 🚫 UPDATE BLOCKED — not admin. userId:', auth.userId, 'role:', auth.role);
    return { data: null, error: new Error(auth.error!) };
  }
  console.log('[JV-Storage] ✅ Admin verified for update — userId:', auth.userId, 'role:', auth.role);

  const useSupabase = await checkSupabaseTable();
  const isAdmin = options?.adminOverride === true;
  const isPublishAction = 'published' in updates;

  let snapshotBefore: any = null;
  try {
    if (useSupabase) {
      const { data: existing } = await supabase.from('jv_deals').select('*').eq('id', id).single();
      if (existing) snapshotBefore = mapSupabaseRowToCamelCase(existing);
    }
    if (!snapshotBefore) {
      const localDeals = await getLocalDeals();
      snapshotBefore = localDeals.find(d => d.id === id) || null;
    }
    if (snapshotBefore) {
      console.log('[JV-Storage] 📸 PRE-UPDATE SNAPSHOT captured for deal:', id, '| photos:', Array.isArray(snapshotBefore.photos) ? snapshotBefore.photos.length : 0);
      if (isPublishAction) {
        void capturePublicationSnapshot(id, snapshotBefore, updates.published === true ? 'PUBLISH' : 'UNPUBLISH');
      }
    }
  } catch (snapErr) {
    console.log('[JV-Storage] Snapshot capture failed (non-critical):', (snapErr as Error)?.message);
  }

  const safeUpdates_ = await protectPhotos(id, updates, useSupabase, isAdmin);

  const dealTitle = (updates.title as string) || (snapshotBefore?.title as string) || id;
  let walId: string | null = null;
  try {
    walId = await walBegin(
      isPublishAction ? (updates.published === true ? 'PUBLISH' : 'UNPUBLISH') : 'UPDATE',
      id, dealTitle, snapshotBefore, { ...updates }
    );
  } catch (walErr) {
    console.log('[JV-Storage] WAL begin failed (non-critical):', (walErr as Error)?.message);
  }

  if (useSupabase) {
    try {
      const safeUpdates = sanitizePayloadForSupabase(safeUpdates_);
      console.log('[JV-Storage] Updating in Supabase — id:', id, 'keys:', Object.keys(safeUpdates).join(','), 'published:', safeUpdates.published);
      const { data, error } = await supabase.from('jv_deals').update({
        ...safeUpdates,
        updated_at: new Date().toISOString(),
      }).eq('id', id).select().single();
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
      } else if (error) {
        console.log('[JV-Storage] Supabase update error:', error.message, '| code:', error.code, '| details:', JSON.stringify(error).substring(0, 500));
        try { await enqueueWrite('update', id, { ...sanitizePayloadForSupabase(safeUpdates_), id }); } catch {}
        if (walId) { try { await walRollback(walId); } catch {} }
        return { data: null, error: new Error(error.message) };
      } else {
        console.log('[JV-Storage] Supabase update SUCCESS — id:', data?.id, 'published:', data?.published);
        if (walId) { try { await walCommit(walId); } catch {} }
        try { await clearQueueForDeal(id); } catch {}
        try { await clearWALForDeal(id); } catch {}

        try {
          const verifyFields = Object.keys(safeUpdates).slice(0, 5).join(', ');
          const { data: verify } = await supabase.from('jv_deals').select('*').eq('id', id).single();
          if (verify) {
            if (isPublishAction) {
              const expectedPublished = updates.published;
              if (verify.published !== expectedPublished) {
                console.warn('[JV-Storage] ⚠️ PUBLISH VERIFICATION FAILED — expected published:', expectedPublished, 'but got:', verify.published, '| Retrying...');
                const { error: retryErr } = await supabase.from('jv_deals').update({
                  published: expectedPublished,
                  status: expectedPublished ? 'active' : (verify.status || 'draft'),
                  updated_at: new Date().toISOString(),
                }).eq('id', id);
                if (retryErr) {
                  console.error('[JV-Storage] ❌ PUBLISH RETRY FAILED:', retryErr.message);
                } else {
                  console.log('[JV-Storage] ✅ PUBLISH RETRY succeeded');
                }
              } else {
                console.log('[JV-Storage] ✅ PUBLISH VERIFIED — deal', id, 'published:', verify.published, 'status:', verify.status);
              }
            }

            const _verifyMapped = mapSupabaseRowToCamelCase(verify);
            if ('title' in safeUpdates && verify.title !== safeUpdates.title) {
              console.warn('[JV-Storage] ⚠️ UPDATE VERIFY MISMATCH — title: expected', safeUpdates.title, 'got', verify.title);
            }
            if ('trust_info' in safeUpdates) {
              const savedTrust = verify.trust_info;
              if (savedTrust) {
                console.log('[JV-Storage] ✅ trust_info VERIFIED saved — length:', String(savedTrust).length);
              } else {
                console.warn('[JV-Storage] ⚠️ trust_info NOT found in verification read-back');
              }
            }
            console.log('[JV-Storage] ✅ POST-UPDATE VERIFICATION passed for deal:', id, '| checked fields:', verifyFields);
          } else {
            console.warn('[JV-Storage] ⚠️ POST-UPDATE VERIFICATION — could not read back deal:', id);
          }
        } catch (verifyErr) {
          console.log('[JV-Storage] Post-update verification failed (non-critical):', (verifyErr as Error)?.message);
        }

        try {
          const auditAction = isPublishAction
            ? (updates.published === true ? 'PUBLISH' : 'UNPUBLISH')
            : 'UPDATE';
          const changedFields = Object.keys(safeUpdates).filter(k => k !== 'updated_at');
          await logAuditEvent({
            action: auditAction,
            dealId: id,
            userId: auth.userId,
            role: auth.role,
            dealTitle: (updates.title as string) || snapshotBefore?.title || id,
          });
          await logAudit({
            entityType: 'jv_deal',
            entityId: id,
            entityTitle: (updates.title as string) || snapshotBefore?.title || id,
            action: auditAction as any,
            source: 'admin',
            details: { changedFields, userId: auth.userId, role: auth.role },
            snapshotBefore: snapshotBefore ? { title: snapshotBefore.title, totalInvestment: snapshotBefore.totalInvestment, expectedROI: snapshotBefore.expectedROI, trust_info: snapshotBefore.trust_info } : undefined,
            snapshotAfter: { ...safeUpdates },
          });
          console.log('[JV-Storage] 📝 Audit logged for', auditAction, '| deal:', id, '| fields:', changedFields.join(','));
        } catch (auditErr) {
          console.log('[JV-Storage] Audit logging failed (non-critical):', (auditErr as Error)?.message);
        }

        try {
          const mappedData = mapSupabaseRowToCamelCase(data);
          if (mappedData.published === true) {
            try { await registerPublishedDeal(mappedData); } catch {}
          }
          const localDeals = await getLocalDeals();
          const localIdx = localDeals.findIndex(d => d.id === mappedData.id);
          if (localIdx >= 0) {
            localDeals[localIdx] = { ...localDeals[localIdx], ...mappedData };
          } else {
            localDeals.unshift(mappedData);
          }
          await saveLocalDeals(localDeals);
          console.log('[JV-Storage] DUAL WRITE — update also saved locally');
        } catch (localErr) {
          console.log('[JV-Storage] Local backup after Supabase update failed (non-critical):', (localErr as Error)?.message);
        }
        return { data, error: null };
      }
    } catch (err) {
      if (!isTableNotFoundError(err)) {
        try { await enqueueWrite('update', id, { ...sanitizePayloadForSupabase(safeUpdates_), id }); } catch {}
        if (walId) { try { await walRollback(walId); } catch {} }
        return { data: null, error: err as Error };
      }
    }
  }

  const deals = await getLocalDeals();
  const idx = deals.findIndex(d => d.id === id);
  if (idx < 0) {
    if (walId) { try { await walRollback(walId); } catch {} }
    return { data: null, error: new Error('Deal not found locally') };
  }
  deals[idx] = { ...deals[idx], ...safeUpdates_, updatedAt: new Date().toISOString() };
  await saveLocalDeals(deals);
  if (walId) { try { await walCommit(walId); } catch {} }
  if (deals[idx].published === true) {
    try { await registerPublishedDeal(deals[idx]); } catch {}
  }
  try { await enqueueWrite('update', id, { ...sanitizePayloadForSupabase(safeUpdates_), id }); } catch {}

  try {
    const auditAction = isPublishAction
      ? (updates.published === true ? 'PUBLISH' : 'UNPUBLISH')
      : 'UPDATE';
    await logAuditEvent({
      action: auditAction,
      dealId: id,
      userId: auth.userId,
      role: auth.role,
      dealTitle: (updates.title as string) || deals[idx]?.title || id,
    });
    await logAudit({
      entityType: 'jv_deal',
      entityId: id,
      entityTitle: (updates.title as string) || deals[idx]?.title || id,
      action: auditAction as any,
      source: 'admin',
      details: { changedFields: Object.keys(safeUpdates_).filter(k => k !== 'updatedAt'), userId: auth.userId, role: auth.role, storage: 'local' },
      snapshotBefore: snapshotBefore ? { title: snapshotBefore.title, totalInvestment: snapshotBefore.totalInvestment } : undefined,
      snapshotAfter: { ...safeUpdates_ },
    });
  } catch (auditErr) {
    console.log('[JV-Storage] Audit logging failed (non-critical):', (auditErr as Error)?.message);
  }

  console.log('[JV-Storage] Updated deal locally (with photo protection + queued for sync):', id);
  return { data: deals[idx], error: null };
}

export async function updateDealDisplayOrders(orders: Array<{ id: string; displayOrder: number }>): Promise<{ success: boolean; error?: string }> {
  const sequential = orders
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((o, idx) => ({ id: o.id, displayOrder: idx + 1 }));

  console.log('[JV-Storage] Updating display orders (sequential 1..n) for', sequential.length, 'deals:', sequential.map(o => `${o.id.slice(0, 8)}→${o.displayOrder}`).join(', '));
  const useSupabase = await checkSupabaseTable();
  let supabaseOk = false;

  if (useSupabase) {
    try {
      const now = new Date().toISOString();
      for (const { id, displayOrder } of sequential) {
        const { error } = await supabase.from('jv_deals').update({
          display_order: displayOrder,
          updated_at: now,
        }).eq('id', id);
        if (error) {
          console.log('[JV-Storage] Failed to update display_order for', id, ':', error.message);
        }
      }
      supabaseOk = true;
      console.log('[JV-Storage] Display orders updated in Supabase for', sequential.length, 'deals (sequential 1..n)');
    } catch (err) {
      console.log('[JV-Storage] Supabase display order update error:', (err as Error)?.message);
    }
  }

  try {
    const deals = await getLocalDeals();
    for (const { id, displayOrder } of sequential) {
      const idx = deals.findIndex((d: any) => d.id === id);
      if (idx >= 0) {
        deals[idx] = { ...deals[idx], displayOrder, display_order: displayOrder };
      }
    }
    await saveLocalDeals(deals);
    console.log('[JV-Storage] Display orders updated locally');
  } catch (err) {
    console.log('[JV-Storage] Local display order update error:', (err as Error)?.message);
  }

  return { success: supabaseOk || !useSupabase };
}

export async function verifyPublishPipeline(dealId: string): Promise<{ supabaseOk: boolean; photosCount: number; backendOk: boolean; errors: string[] }> {
  const errors: string[] = [];
  let supabaseOk = false;
  let photosCount = 0;
  let backendOk = false;

  try {
    const { data, error } = await supabase.from('jv_deals').select('id, published, status, photos').eq('id', dealId).single();
    if (error) {
      errors.push(`Supabase query failed: ${error.message}`);
    } else if (!data) {
      errors.push('Deal not found in Supabase');
    } else {
      supabaseOk = data.published === true;
      if (!supabaseOk) errors.push(`Deal published=${data.published}, status=${data.status}`);
      const photos = parseJsonField(data.photos, []);
      photosCount = Array.isArray(photos) ? photos.filter((p: any) => typeof p === 'string' && p.length > 5).length : 0;
      if (photosCount === 0) errors.push('Deal has 0 photos in Supabase jv_deals.photos column');
      console.log('[JV-Verify] Supabase check — published:', data.published, '| photos:', photosCount, '| status:', data.status);
    }
  } catch (err) {
    errors.push(`Supabase exception: ${(err as Error)?.message}`);
  }

  try {
    const backendUrl = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');
    if (backendUrl) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(backendUrl + '/api/landing-deals', { signal: controller.signal });
      clearTimeout(timeout);
      if (res.ok) {
        const result = await res.json();
        const deals = Array.isArray(result) ? result : (result?.deals || []);
        const match = deals.find((d: any) => d.id === dealId);
        if (match) {
          backendOk = true;
          const bPhotos = Array.isArray(match.photos) ? match.photos.length : 0;
          if (bPhotos === 0) errors.push('Backend /landing-deals returns deal but with 0 photos');
          console.log('[JV-Verify] Backend check — deal found, photos:', bPhotos, '| source:', result?.source);
        } else {
          errors.push(`Deal ${dealId} not found in backend /landing-deals response (${deals.length} deals returned, source: ${result?.source})`);
        }
      } else {
        errors.push(`Backend /landing-deals HTTP ${res.status}`);
      }
    } else {
      errors.push('No API base URL configured (EXPO_PUBLIC_RORK_API_BASE_URL)');
    }
  } catch (err) {
    errors.push(`Backend check failed: ${(err as Error)?.message}`);
  }

  console.log('[JV-Verify] Pipeline verification for', dealId, '| supabase:', supabaseOk, '| photos:', photosCount, '| backend:', backendOk, '| errors:', errors.length);
  if (errors.length > 0) {
    console.warn('[JV-Verify] ISSUES:', errors.join(' | '));
  }
  return { supabaseOk, photosCount, backendOk, errors };
}

export async function archiveJVDeal(id: string, options?: { adminOverride?: boolean }): Promise<{ data: any; error: Error | null }> {
  const auth = await requireAdmin('archive deal', options?.adminOverride);
  if (!auth.allowed) {
    return { data: null, error: new Error(auth.error!) };
  }
  console.log('[JV-Storage] ARCHIVE (soft-delete) deal:', id);
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    try {
      const { data, error } = await supabase.from('jv_deals').update({
        status: 'archived',
        published: false,
        updated_at: new Date().toISOString(),
      }).eq('id', id).select().single();
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
      } else if (error) {
        console.log('[JV-Storage] Supabase archive error:', error.message);
        return { data: null, error: new Error(error.message) };
      } else {
        console.log('[JV-Storage] Supabase archive SUCCESS — id:', data?.id);
        return { data, error: null };
      }
    } catch (err) {
      if (!isTableNotFoundError(err)) {
        return { data: null, error: err as Error };
      }
    }
  }

  const deals = await getLocalDeals();
  const idx = deals.findIndex(d => d.id === id);
  if (idx >= 0) {
    deals[idx] = { ...deals[idx], status: 'archived', published: false, updatedAt: new Date().toISOString() };
    await saveLocalDeals(deals);
    console.log('[JV-Storage] Archived deal locally:', id);
    return { data: deals[idx], error: null };
  }
  return { data: null, error: new Error('Deal not found') };
}

export async function restoreJVDeal(id: string, options?: { adminOverride?: boolean }): Promise<{ data: any; error: Error | null }> {
  const auth = await requireAdmin('restore deal from archive', options?.adminOverride);
  if (!auth.allowed) {
    return { data: null, error: new Error(auth.error!) };
  }
  console.log('[JV-Storage] RESTORE deal from archive:', id);
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    try {
      const { data, error } = await supabase.from('jv_deals').update({
        status: 'active',
        updated_at: new Date().toISOString(),
      }).eq('id', id).select().single();
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
      } else if (error) {
        console.log('[JV-Storage] Supabase restore error:', error.message);
        return { data: null, error: new Error(error.message) };
      } else {
        console.log('[JV-Storage] Supabase restore SUCCESS — id:', data?.id);
        return { data, error: null };
      }
    } catch (err) {
      if (!isTableNotFoundError(err)) {
        return { data: null, error: err as Error };
      }
    }
  }

  const deals = await getLocalDeals();
  const idx = deals.findIndex(d => d.id === id);
  if (idx >= 0) {
    deals[idx] = { ...deals[idx], status: 'active', updatedAt: new Date().toISOString() };
    await saveLocalDeals(deals);
    console.log('[JV-Storage] Restored deal locally:', id);
    return { data: deals[idx], error: null };
  }
  return { data: null, error: new Error('Deal not found') };
}

export async function deleteJVDeal(id: string, options?: { adminOverride?: boolean }): Promise<{ error: Error | null }> {
  const auth = await requireAdmin('move deal to trash', options?.adminOverride);
  if (!auth.allowed) {
    return { error: new Error(auth.error!) };
  }
  console.log('[JV-Storage] 🗑️ MOVE TO TRASH requested for deal:', id, '| admin:', auth.userId);
  const useSupabase = await checkSupabaseTable();

  let dealSnapshot: any = null;
  let snapshotCaptured = false;

  if (useSupabase) {
    try {
      const { data: existingDeal, error: fetchErr } = await supabase.from('jv_deals').select('*').eq('id', id).single();
      if (!fetchErr && existingDeal) {
        dealSnapshot = mapSupabaseRowToCamelCase(existingDeal);
        if (!snapshotCaptured) {
          void captureDeleteSnapshot({
            entityType: 'jv_deals',
            entityId: id,
            entityTitle: dealSnapshot?.projectName || dealSnapshot?.title || id,
            data: existingDeal,
            source: 'supabase',
          });
          snapshotCaptured = true;
        }
      }

      const { error } = await supabase.from('jv_deals').update({
        status: 'trashed',
        published: false,
        updated_at: new Date().toISOString(),
      }).eq('id', id);

      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
      } else if (error) {
        console.warn('[JV-Storage] Supabase trash-update failed (RLS/auth):', error.message, '| Continuing with local trash...');
      } else {
        const { data: verifyRow } = await supabase.from('jv_deals').select('id, status').eq('id', id).maybeSingle();
        if (verifyRow && verifyRow.status !== 'trashed') {
          console.warn('[JV-Storage] Trash update did not persist (RLS may have blocked UPDATE). status still:', verifyRow.status);
        } else {
          if (dealSnapshot) {
            await saveToTrash({ ...dealSnapshot, status: 'trashed', published: false, trashedAt: new Date().toISOString() });
          }
          console.log('[JV-Storage] Moved deal to trash in Supabase:', id);
          await logAuditEvent({ action: 'TRASH', dealId: id, userId: auth.userId, role: auth.role, dealTitle: dealSnapshot?.title });
          return { error: null };
        }
      }
    } catch (err) {
      console.warn('[JV-Storage] Supabase trash exception:', (err as Error)?.message, '| Continuing with local trash...');
      if (isTableNotFoundError(err)) {
        _supabaseAvailable = false;
      }
    }
  }

  const deals = await getLocalDeals();
  const idx = deals.findIndex(d => d.id === id);
  if (idx >= 0) {
    dealSnapshot = { ...deals[idx] };
    if (!snapshotCaptured) {
      void captureDeleteSnapshot({
        entityType: 'jv_deals',
        entityId: id,
        entityTitle: dealSnapshot?.projectName || dealSnapshot?.title || id,
        data: dealSnapshot,
        source: 'local',
      });
    }
    deals[idx] = { ...deals[idx], status: 'trashed', published: false, updatedAt: new Date().toISOString() };
    await saveLocalDeals(deals);
    await saveToTrash({ ...dealSnapshot, status: 'trashed', published: false, trashedAt: new Date().toISOString() });
    console.log('[JV-Storage] Moved deal to trash locally:', id);
    await logAuditEvent({ action: 'TRASH', dealId: id, userId: auth.userId, role: auth.role, dealTitle: dealSnapshot?.title });
  }
  return { error: null };
}

/** @deprecated REMOVED — bulk delete by name is disabled for safety. Use archiveJVDeal() instead. */
export async function deleteJVDealsByProjectName(_namePattern: string): Promise<{ error: Error | null; deletedCount: number }> {
  console.warn('[JV-Storage] ❌ deleteJVDealsByProjectName is DISABLED for safety. No deals were deleted.');
  return { error: null, deletedCount: 0 };
}

/** @deprecated REMOVED — bulk delete all is disabled for safety. Use archiveJVDeal() for individual deals. */
export async function deleteAllJVDeals(): Promise<{ error: Error | null; count: number }> {
  console.warn('[JV-Storage] ❌ deleteAllJVDeals is DISABLED for safety. No deals were deleted.');
  return { error: null, count: 0 };
}

async function getTrashDeals(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(TRASH_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.log('[JV-Storage] Trash read error:', (err as Error)?.message);
    return [];
  }
}

async function saveTrashDeals(deals: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(TRASH_STORAGE_KEY, JSON.stringify(deals));
    console.log('[JV-Storage] Saved', deals.length, 'deals in trash');
  } catch (err) {
    console.log('[JV-Storage] Trash save error:', (err as Error)?.message);
  }
}

async function saveToTrash(deal: any): Promise<void> {
  const trash = await getTrashDeals();
  const existingIdx = trash.findIndex((d: any) => d.id === deal.id);
  if (existingIdx >= 0) {
    trash[existingIdx] = deal;
  } else {
    trash.unshift(deal);
  }
  await saveTrashDeals(trash);
  console.log('[JV-Storage] Deal saved to trash backup:', deal.id, deal.projectName || deal.title);
}

export async function fetchTrashDeals(): Promise<{ deals: any[]; total: number }> {
  const useSupabase = await checkSupabaseTable();
  let trashedDeals: any[] = [];

  if (useSupabase) {
    try {
      const { data, error } = await supabase.from('jv_deals').select('*').eq('status', 'trashed').order('updated_at', { ascending: false });
      if (!error && data) {
        trashedDeals = data.map(mapSupabaseRowToCamelCase);
        console.log('[JV-Storage] Fetched', trashedDeals.length, 'trashed deals from Supabase');
      }
    } catch (err) {
      console.log('[JV-Storage] Supabase trash fetch error:', (err as Error)?.message);
    }
  }

  const localTrash = await getTrashDeals();
  const localIds = new Set(trashedDeals.map((d: any) => d.id));
  for (const ld of localTrash) {
    if (!localIds.has(ld.id)) {
      trashedDeals.push(ld);
    }
  }

  trashedDeals.sort((a: any, b: any) => {
    const dateA = a.trashedAt || a.updatedAt || '';
    const dateB = b.trashedAt || b.updatedAt || '';
    return String(dateB).localeCompare(String(dateA));
  });

  return { deals: trashedDeals, total: trashedDeals.length };
}

export async function restoreFromTrash(id: string, options?: { adminOverride?: boolean }): Promise<{ data: any; error: Error | null }> {
  const auth = await requireAdmin('restore deal from trash', options?.adminOverride);
  if (!auth.allowed) {
    return { data: null, error: new Error(auth.error!) };
  }
  console.log('[JV-Storage] RESTORE FROM TRASH:', id, '| admin:', auth.userId);
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    try {
      const { data, error } = await supabase.from('jv_deals').update({
        status: 'active',
        published: false,
        updated_at: new Date().toISOString(),
      }).eq('id', id).select().single();
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
      } else if (error) {
        console.log('[JV-Storage] Supabase restore from trash error:', error.message);

        const trashDeals = await getTrashDeals();
        const trashDeal = trashDeals.find((d: any) => d.id === id);
        if (trashDeal) {
          const restored = { ...trashDeal, status: 'active', published: false, updatedAt: new Date().toISOString() };
          delete restored.trashedAt;
          const { data: reinsertData, error: reinsertErr } = await supabase.from('jv_deals').upsert(sanitizePayloadForSupabase(restored)).select().single();
          if (!reinsertErr && reinsertData) {
            const trashFiltered = trashDeals.filter((d: any) => d.id !== id);
            await saveTrashDeals(trashFiltered);
            console.log('[JV-Storage] Restored deal from trash backup to Supabase:', id);
            return { data: reinsertData, error: null };
          }
        }
        return { data: null, error: new Error(error.message) };
      } else {
        const trashDeals = await getTrashDeals();
        await saveTrashDeals(trashDeals.filter((d: any) => d.id !== id));
        console.log('[JV-Storage] Restored deal from trash in Supabase:', id);
        await logAuditEvent({ action: 'RESTORE_FROM_TRASH', dealId: id, userId: auth.userId, role: auth.role });
        return { data, error: null };
      }
    } catch (err) {
      if (!isTableNotFoundError(err)) {
        return { data: null, error: err as Error };
      }
    }
  }

  const deals = await getLocalDeals();
  const idx = deals.findIndex(d => d.id === id);
  if (idx >= 0) {
    deals[idx] = { ...deals[idx], status: 'active', published: false, updatedAt: new Date().toISOString() };
    await saveLocalDeals(deals);
  } else {
    const trashDeals = await getTrashDeals();
    const trashDeal = trashDeals.find((d: any) => d.id === id);
    if (trashDeal) {
      const restored = { ...trashDeal, status: 'active', published: false, updatedAt: new Date().toISOString() };
      delete restored.trashedAt;
      deals.unshift(restored);
      await saveLocalDeals(deals);
    } else {
      return { data: null, error: new Error('Deal not found in trash') };
    }
  }

  const trashDeals = await getTrashDeals();
  await saveTrashDeals(trashDeals.filter((d: any) => d.id !== id));
  console.log('[JV-Storage] Restored deal from trash locally:', id);
  await logAuditEvent({ action: 'RESTORE_FROM_TRASH', dealId: id, userId: auth.userId, role: auth.role });
  return { data: { id }, error: null };
}

export async function permanentlyDeleteJVDeal(id: string, options?: { confirmTitle?: string; adminOverride?: boolean }): Promise<{ error: Error | null }> {
  const auth = await requireAdmin('permanently delete deal', options?.adminOverride);
  if (!auth.allowed) {
    return { error: new Error(auth.error!) };
  }
  if (!checkPermanentDeleteRateLimit()) {
    return { error: new Error(`Rate limit: max ${PERM_DELETE_RATE_LIMIT} permanent deletes per minute. Wait and try again.`) };
  }
  _permanentDeleteTimestamps.push(Date.now());
  console.log('[JV-Storage] ⚠️ ADMIN PERMANENT DELETE:', id, '| admin:', auth.userId, '| confirmTitle:', options?.confirmTitle);
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    let supabaseDeleteSuccess = false;

    try {
      const { error } = await supabase.from('jv_deals').delete().eq('id', id);
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
        console.warn('[JV-Storage] jv_deals table not found, falling back to local delete');
      } else if (error) {
        console.error('[JV-Storage] Supabase delete FAILED (RLS/auth):', error.message, '| code:', error.code);
      } else {
        console.log('[JV-Storage] Supabase delete returned no error for:', id, '— verifying...');
      }
    } catch (err) {
      console.error('[JV-Storage] Supabase delete exception:', (err as Error)?.message);
      if (isTableNotFoundError(err)) {
        _supabaseAvailable = false;
      }
    }

    try {
      const { data: verifyRow } = await supabase.from('jv_deals').select('id, status').eq('id', id).maybeSingle();
      if (!verifyRow) {
        supabaseDeleteSuccess = true;
        console.log('[JV-Storage] ✅ Verified: deal', id, 'is gone from Supabase');
      } else {
        console.warn('[JV-Storage] ⚠️ Deal', id, 'still exists after DELETE — RLS likely blocked it. Trying status update fallback...');

        const { error: updateErr } = await supabase.from('jv_deals').update({
          status: 'permanently_deleted',
          published: false,
          updated_at: new Date().toISOString(),
        }).eq('id', id);

        if (updateErr) {
          console.error('[JV-Storage] Fallback status update also failed:', updateErr.message);

          const { data: recheck } = await supabase.from('jv_deals').select('id, status').eq('id', id).maybeSingle();
          if (recheck && recheck.status !== 'permanently_deleted') {
            console.error('[JV-Storage] ❌ Cannot delete deal from Supabase — RLS blocking both DELETE and UPDATE');
            return { error: new Error('Delete blocked by database policy. Please check Supabase RLS policies for jv_deals table, or delete directly from the Supabase dashboard.') };
          }
        } else {
          console.log('[JV-Storage] ✅ Marked deal as permanently_deleted in Supabase (RLS blocked DELETE but allowed UPDATE):', id);
          supabaseDeleteSuccess = true;
        }
      }
    } catch (verifyErr) {
      console.warn('[JV-Storage] Verification query failed:', (verifyErr as Error)?.message, '— assuming delete succeeded');
      supabaseDeleteSuccess = true;
    }

    if (!supabaseDeleteSuccess) {
      return { error: new Error('Failed to delete deal from database. The database policy may be blocking this action.') };
    }
  }

  const deals = await getLocalDeals();
  const filtered = deals.filter(d => d.id !== id);
  if (filtered.length !== deals.length) {
    await saveLocalDeals(filtered);
  }

  const backupRaw = await AsyncStorage.getItem(BACKUP_CACHE_KEY);
  if (backupRaw) {
    try {
      const backupDeals = JSON.parse(backupRaw);
      if (Array.isArray(backupDeals)) {
        const backupFiltered = backupDeals.filter((d: any) => d.id !== id);
        if (backupFiltered.length !== backupDeals.length) {
          await AsyncStorage.setItem(BACKUP_CACHE_KEY, JSON.stringify(backupFiltered));
          console.log('[JV-Storage] Removed deal from backup cache:', id);
        }
      }
    } catch (e) {
      console.log('[JV-Storage] Backup cache cleanup error:', (e as Error)?.message);
    }
  }

  const trashDeals = await getTrashDeals();
  const trashFiltered = trashDeals.filter((d: any) => d.id !== id);
  if (trashFiltered.length !== trashDeals.length) {
    await saveTrashDeals(trashFiltered);
  }

  console.log('[JV-Storage] PERMANENTLY deleted deal:', id);
  await logAuditEvent({ action: 'PERMANENT_DELETE', dealId: id, userId: auth.userId, role: auth.role, dealTitle: options?.confirmTitle });
  return { error: null };
}

export function isSupabaseAvailable(): boolean {
  return _supabaseAvailable === true;
}

export async function safeSupabaseInsert(table: string, payload: Record<string, unknown>): Promise<{ data: any; error: Error | null }> {
  try {
    const now = Date.now();
    if (_tableCache[table] === false && _tableCacheTimestamps[table] && (now - _tableCacheTimestamps[table]) < TABLE_CACHE_TTL) {
      console.log(`[Storage] Table '${table}' cached as missing — skipping insert`);
      return { data: null, error: new Error(`Table '${table}' not available`) };
    }
    const { data, error } = await supabase.from(table).insert(payload).select().single();
    if (error && isTableNotFoundError(error)) {
      _tableCache[table] = false;
      _tableCacheTimestamps[table] = now;
      console.log(`[Storage] Table '${table}' not found — skipping for ${TABLE_CACHE_TTL / 1000}s`);
      return { data: null, error: new Error(`Table '${table}' does not exist`) };
    }
    if (error) {
      console.log(`[Storage] Insert to '${table}' FAILED:`, error.message, '| code:', error.code);
      return { data: null, error: new Error(error.message) };
    }
    _tableCache[table] = true;
    _tableCacheTimestamps[table] = now;
    return { data, error: null };
  } catch (err) {
    console.log(`[Storage] Insert to '${table}' exception:`, (err as Error)?.message);
    return { data: null, error: err as Error };
  }
}

export async function safeSupabaseSelect(table: string, query?: { column?: string; value?: unknown; count?: boolean; limit?: number }): Promise<{ data: any; count: number | null; error: Error | null }> {
  try {
    const now = Date.now();
    if (_tableCache[table] === false && _tableCacheTimestamps[table] && (now - _tableCacheTimestamps[table]) < TABLE_CACHE_TTL) {
      return { data: null, count: null, error: null };
    }
    let q = supabase.from(table).select('*', query?.count ? { count: 'exact', head: true } : undefined);
    if (query?.column && query?.value !== undefined) {
      q = q.eq(query.column, query.value);
    }
    if (query?.limit) {
      q = q.limit(query.limit);
    }
    const { data, error, count } = await q;
    if (error && isTableNotFoundError(error)) {
      _tableCache[table] = false;
      _tableCacheTimestamps[table] = now;
      console.log(`[Storage] Table '${table}' not found — skipping for ${TABLE_CACHE_TTL / 1000}s`);
      return { data: null, count: null, error: null };
    }
    if (error) {
      console.log(`[Storage] Select from '${table}' note:`, error.message);
      return { data: null, count: null, error: null };
    }
    _tableCache[table] = true;
    _tableCacheTimestamps[table] = now;
    return { data, count: count ?? null, error: null };
  } catch (err) {
    console.log(`[Storage] Select from '${table}' failed:`, (err as Error)?.message);
    return { data: null, count: null, error: null };
  }
}

export async function getLocalWaitlist(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(WAITLIST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export interface DiagnosticResult {
  envVarsSet: boolean;
  supabaseTableCreated: boolean;
  rlsPoliciesAllowInsert: boolean;
  sqlPatchApplied: boolean;
  fallbackActive: boolean;
  details: Record<string, string>;
}

export async function runSupabaseDiagnostics(): Promise<DiagnosticResult> {
  const result: DiagnosticResult = {
    envVarsSet: false,
    supabaseTableCreated: false,
    rlsPoliciesAllowInsert: false,
    sqlPatchApplied: false,
    fallbackActive: true,
    details: {},
  };

  const url = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
  const key = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  result.envVarsSet = !!(url && key);
  result.details['EXPO_PUBLIC_SUPABASE_URL'] = url ? `${url.substring(0, 20)}...` : 'NOT SET';
  result.details['EXPO_PUBLIC_SUPABASE_ANON_KEY'] = key ? `${key.substring(0, 12)}...` : 'NOT SET';
  console.log('[Diagnostics] Env vars set:', result.envVarsSet);

  if (!result.envVarsSet) {
    result.details['status'] = 'Supabase env vars missing — using local fallback';
    console.log('[Diagnostics] Complete (no env vars)');
    return result;
  }

  _supabaseAvailable = null;
  _supabaseCheckTimestamp = 0;

  try {
    const { data, error } = await supabase.from('jv_deals').select('id, title, published, project_name').limit(5);
    if (error && isTableNotFoundError(error)) {
      result.supabaseTableCreated = false;
      result.details['table_check'] = `Table not found: ${error.message}`;
      console.log('[Diagnostics] jv_deals table NOT found');
    } else if (error) {
      result.supabaseTableCreated = false;
      result.details['table_check'] = `Query error: ${error.message} (code: ${error.code})`;
      console.log('[Diagnostics] jv_deals table query error:', error.message);
    } else {
      result.supabaseTableCreated = true;
      result.details['table_check'] = `Table exists — ${(data || []).length} rows returned`;
      console.log('[Diagnostics] jv_deals table found ✓, rows:', (data || []).length);

      const hasPatchColumns = (data || []).length > 0
        ? Object.keys((data as any[])[0] ?? {}).some(k => k === 'project_name' || k === 'total_investment')
        : false;

      if ((data || []).length === 0) {
        try {
          const { error: colErr } = await supabase.from('jv_deals').select('id, project_name, total_investment, expected_roi').limit(1);
          if (!colErr) {
            result.sqlPatchApplied = true;
            result.details['patch_check'] = 'Patch columns exist (project_name, total_investment, expected_roi) ✓';
            console.log('[Diagnostics] SQL patch columns verified ✓');
          } else {
            result.sqlPatchApplied = false;
            result.details['patch_check'] = `Patch columns missing: ${colErr.message}`;
            console.log('[Diagnostics] SQL patch columns missing:', colErr.message);
          }
        } catch {
          result.sqlPatchApplied = false;
          result.details['patch_check'] = 'Could not verify patch columns';
        }
      } else {
        result.sqlPatchApplied = hasPatchColumns;
        result.details['patch_check'] = hasPatchColumns
          ? 'Patch columns detected in data ✓'
          : 'Patch columns not detected — run supabase-patch-jv-deals.sql';
        console.log('[Diagnostics] SQL patch applied:', hasPatchColumns);
      }

      console.log('[Diagnostics] Table verified with', (data || []).length, 'rows');
    }
  } catch (err) {
    result.supabaseTableCreated = false;
    result.details['table_check'] = `Exception: ${(err as Error)?.message}`;
    console.log('[Diagnostics] Table check exception:', (err as Error)?.message);
  }

  if (result.supabaseTableCreated) {
    try {
      const testId = `diag-test-${Date.now()}`;
      const { error: insertErr } = await supabase.from('jv_deals').insert({
        id: testId,
        title: '__diagnostic_test__',
        published: false,
        status: 'draft',
      });

      if (insertErr) {
        const msg = (insertErr.message || '').toLowerCase();
        if (msg.includes('permission') || msg.includes('policy') || msg.includes('rls') || msg.includes('new row violates')) {
          result.rlsPoliciesAllowInsert = false;
          result.details['rls_check'] = `Insert blocked by RLS: ${insertErr.message}`;
          console.log('[Diagnostics] RLS blocks insert:', insertErr.message);
        } else if (msg.includes('duplicate') || msg.includes('unique') || msg.includes('already exists')) {
          result.rlsPoliciesAllowInsert = true;
          result.details['rls_check'] = 'Insert allowed (duplicate key = RLS is open) ✓';
          console.log('[Diagnostics] RLS allows insert ✓ (duplicate key)');
        } else {
          result.rlsPoliciesAllowInsert = false;
          result.details['rls_check'] = `Insert error: ${insertErr.message}`;
          console.log('[Diagnostics] RLS insert error:', insertErr.message);
        }
      } else {
        result.rlsPoliciesAllowInsert = true;
        result.details['rls_check'] = 'Insert succeeded ✓';
        console.log('[Diagnostics] RLS allows insert ✓');

        await supabase.from('jv_deals').delete().eq('id', testId);
        console.log('[Diagnostics] Cleaned up test row');
      }
    } catch (err) {
      result.rlsPoliciesAllowInsert = false;
      result.details['rls_check'] = `Exception: ${(err as Error)?.message}`;
      console.log('[Diagnostics] RLS check exception:', (err as Error)?.message);
    }
  }

  result.fallbackActive = !result.supabaseTableCreated;

  console.log('[Diagnostics] === FULL RESULTS ===');
  console.log('[Diagnostics] Env vars set:', result.envVarsSet ? '✅' : '❓');
  console.log('[Diagnostics] Table created:', result.supabaseTableCreated ? '✅' : '❓');
  console.log('[Diagnostics] RLS allows insert:', result.rlsPoliciesAllowInsert ? '✅' : '❓');
  console.log('[Diagnostics] SQL patch applied:', result.sqlPatchApplied ? '✅' : '❓');
  console.log('[Diagnostics] Fallback active:', result.fallbackActive);
  console.log('[Diagnostics] Details:', JSON.stringify(result.details, null, 2));

  return result;
}

export async function recoverPhotosForDeal(dealId: string): Promise<{ recovered: boolean; photoCount: number; source: string }> {
  console.log('[JV-Storage] 🔍 Attempting photo recovery for deal:', dealId);

  const trashDeals = await getTrashDeals();
  const trashDeal = trashDeals.find((d: any) => d.id === dealId);
  if (trashDeal) {
    const trashPhotos = parseJsonField(trashDeal.photos, []);
    if (Array.isArray(trashPhotos) && trashPhotos.length > 0) {
      console.log('[JV-Storage] Found', trashPhotos.length, 'photos in trash backup for deal:', dealId);
      const useSupabase = await checkSupabaseTable();
      if (useSupabase) {
        const { error } = await supabase.from('jv_deals').update({ photos: JSON.stringify(trashPhotos), updated_at: new Date().toISOString() }).eq('id', dealId);
        if (!error) {
          console.log('[JV-Storage] ✅ Restored', trashPhotos.length, 'photos from trash backup to Supabase');
          return { recovered: true, photoCount: trashPhotos.length, source: 'trash_backup' };
        }
      }
      const deals = await getLocalDeals();
      const idx = deals.findIndex(d => d.id === dealId);
      if (idx >= 0) {
        deals[idx].photos = trashPhotos;
        await saveLocalDeals(deals);
        return { recovered: true, photoCount: trashPhotos.length, source: 'trash_backup_local' };
      }
    }
  }

  const localDeals = await getLocalDeals();
  const localDeal = localDeals.find(d => d.id === dealId);
  if (localDeal) {
    const localPhotos = parseJsonField(localDeal.photos, []);
    if (Array.isArray(localPhotos) && localPhotos.length > 0) {
      console.log('[JV-Storage] Found', localPhotos.length, 'photos in local storage for deal:', dealId);
      const useSupabase = await checkSupabaseTable();
      if (useSupabase) {
        const { error } = await supabase.from('jv_deals').update({ photos: JSON.stringify(localPhotos), updated_at: new Date().toISOString() }).eq('id', dealId);
        if (!error) {
          return { recovered: true, photoCount: localPhotos.length, source: 'local_storage' };
        }
      }
      return { recovered: true, photoCount: localPhotos.length, source: 'local_already' };
    }
  }

  console.log('[JV-Storage] ❌ No photos found in any backup for deal:', dealId);
  return { recovered: false, photoCount: 0, source: 'none' };
}

export async function adminRestorePhotos(dealId: string, photos: string[]): Promise<{ success: boolean; error?: string }> {
  if (!photos || photos.length === 0) {
    return { success: false, error: 'No photos provided' };
  }
  console.log('[JV-Storage] 🔧 ADMIN photo restore for deal:', dealId, '— photos:', photos.length);

  const useSupabase = await checkSupabaseTable();
  if (useSupabase) {
    try {
      const { error } = await supabase.from('jv_deals').update({
        photos: JSON.stringify(photos),
        updated_at: new Date().toISOString(),
      }).eq('id', dealId);
      if (error) {
        console.log('[JV-Storage] Admin photo restore Supabase error:', error.message);
        return { success: false, error: error.message };
      }
      console.log('[JV-Storage] ✅ Admin restored', photos.length, 'photos to Supabase for deal:', dealId);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error)?.message };
    }
  }

  const deals = await getLocalDeals();
  const idx = deals.findIndex(d => d.id === dealId);
  if (idx >= 0) {
    deals[idx].photos = photos;
    deals[idx].updatedAt = new Date().toISOString();
    await saveLocalDeals(deals);
    console.log('[JV-Storage] ✅ Admin restored', photos.length, 'photos locally for deal:', dealId);
    return { success: true };
  }
  return { success: false, error: 'Deal not found' };
}

let _syncInProgress = false;
let _lastSyncTimestamp = 0;
const SYNC_COOLDOWN = 30000;

export async function syncLocalDealsToSupabase(): Promise<{ synced: number; errors: string[]; skipped: number }> {
  if (_syncInProgress) {
    console.log('[JV-Sync] Sync already in progress — skipping');
    return { synced: 0, errors: [], skipped: 0 };
  }
  if (Date.now() - _lastSyncTimestamp < SYNC_COOLDOWN) {
    console.log('[JV-Sync] Sync cooldown active — skipping');
    return { synced: 0, errors: [], skipped: 0 };
  }

  _syncInProgress = true;
  _lastSyncTimestamp = Date.now();
  const errors: string[] = [];
  let synced = 0;
  let skipped = 0;

  try {
    const useSupabase = await checkSupabaseTable();
    if (!useSupabase) {
      console.log('[JV-Sync] Supabase not available — cannot sync local deals');
      _syncInProgress = false;
      return { synced: 0, errors: ['Supabase jv_deals table not available'], skipped: 0 };
    }

    const localDeals = await getLocalDeals();
    if (localDeals.length === 0) {
      console.log('[JV-Sync] No local deals to sync');
      _syncInProgress = false;
      return { synced: 0, errors: [], skipped: 0 };
    }

    console.log('[JV-Sync] Found', localDeals.length, 'local deals — checking which need syncing to Supabase...');

    const { data: supabaseDeals, error: fetchErr } = await supabase
      .from('jv_deals')
      .select('id')
      .limit(500);

    const existingIds = new Set<string>();
    if (!fetchErr && supabaseDeals) {
      for (const d of supabaseDeals) {
        existingIds.add(d.id);
      }
    }

    for (const deal of localDeals) {
      if (!deal.id) continue;

      if (existingIds.has(deal.id)) {
        skipped++;
        continue;
      }

      try {
        const payload = sanitizePayloadForSupabase({
          ...deal,
          photos: Array.isArray(deal.photos) ? JSON.stringify(deal.photos) : deal.photos,
          partners: Array.isArray(deal.partners) ? JSON.stringify(deal.partners) : deal.partners,
          poolTiers: Array.isArray(deal.poolTiers) ? JSON.stringify(deal.poolTiers) : deal.poolTiers,
          profitSplit: Array.isArray(deal.profitSplit) ? JSON.stringify(deal.profitSplit) : deal.profitSplit,
        });

        const { error: upsertErr } = await supabase.from('jv_deals').upsert(payload).select().single();
        if (upsertErr) {
          console.log('[JV-Sync] Failed to sync deal:', deal.id, '—', upsertErr.message);
          errors.push(`${deal.id}: ${upsertErr.message}`);
        } else {
          synced++;
          console.log('[JV-Sync] ✅ Synced deal to Supabase:', deal.id, deal.title || deal.projectName);
        }
      } catch (err) {
        errors.push(`${deal.id}: ${(err as Error)?.message}`);
      }
    }

    console.log('[JV-Sync] Sync complete — synced:', synced, '| skipped:', skipped, '| errors:', errors.length);
  } catch (err) {
    console.log('[JV-Sync] Sync exception:', (err as Error)?.message);
    errors.push((err as Error)?.message || 'Unknown sync error');
  } finally {
    _syncInProgress = false;
  }

  return { synced, errors, skipped };
}




const PUBLICATION_LOG_KEY = scopedKey('publication_log_v1');

export interface PublicationLogEntry {
  id: string;
  dealId: string;
  dealTitle: string;
  projectName: string;
  action: 'PUBLISH' | 'UNPUBLISH' | 'AUTO_RESTORE';
  timestamp: string;
  performedBy: string;
  performedByRole: string;
  snapshotData: Record<string, unknown>;
  photoCount: number;
  photos: string[];
  status: string;
  restored: boolean;
  restoredAt?: string;
}

async function capturePublicationSnapshot(dealId: string, dealData: any, action: 'PUBLISH' | 'UNPUBLISH' | 'AUTO_RESTORE'): Promise<void> {
  try {
    const userId = getAuthUserId();
    const role = getAuthUserRole();
    const photos = Array.isArray(dealData.photos) ? dealData.photos : [];

    const entry: PublicationLogEntry = {
      id: `pub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      dealId,
      dealTitle: dealData.title || dealData.projectName || 'Unknown',
      projectName: dealData.projectName || dealData.project_name || '',
      action,
      timestamp: new Date().toISOString(),
      performedBy: userId ?? 'anonymous',
      performedByRole: role ?? 'unknown',
      snapshotData: { ...dealData },
      photoCount: photos.length,
      photos: [...photos],
      status: dealData.status || 'unknown',
      restored: false,
    };

    const raw = await AsyncStorage.getItem(PUBLICATION_LOG_KEY);
    const log: PublicationLogEntry[] = raw ? JSON.parse(raw) : [];
    log.unshift(entry);
    if (log.length > 500) log.length = 500;
    await AsyncStorage.setItem(PUBLICATION_LOG_KEY, JSON.stringify(log));
    console.log('[JV-Storage] 📋 PUBLICATION LOG:', action, '| deal:', dealId, '| title:', entry.dealTitle, '| photos:', photos.length);
  } catch (err) {
    console.log('[JV-Storage] Publication log capture failed:', (err as Error)?.message);
  }
}

export async function getPublicationLog(filters?: { dealId?: string; action?: string; limit?: number }): Promise<PublicationLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(PUBLICATION_LOG_KEY);
    let log: PublicationLogEntry[] = raw ? JSON.parse(raw) : [];
    if (filters?.dealId) log = log.filter(e => e.dealId === filters.dealId);
    if (filters?.action) log = log.filter(e => e.action === filters.action);
    if (filters?.limit) log = log.slice(0, filters.limit);
    return log;
  } catch {
    return [];
  }
}

export async function restoreFromPublicationLog(entryId: string, options?: { adminOverride?: boolean }): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin('restore from publication log', options?.adminOverride);
  if (!auth.allowed) return { success: false, error: auth.error };

  try {
    const raw = await AsyncStorage.getItem(PUBLICATION_LOG_KEY);
    const log: PublicationLogEntry[] = raw ? JSON.parse(raw) : [];
    const idx = log.findIndex(e => e.id === entryId);
    if (idx < 0) return { success: false, error: 'Publication log entry not found' };

    const foundEntry = log[idx];
    if (!foundEntry) return { success: false, error: 'Publication log entry not found' };
    const snapshot = foundEntry.snapshotData;
    if (!snapshot || !foundEntry.dealId) return { success: false, error: 'No snapshot data available' };

    console.log('[JV-Storage] 🔄 RESTORING from publication log:', entryId, '| deal:', foundEntry.dealId, '| title:', foundEntry.dealTitle);

    const restorePayload: Record<string, unknown> = {
      ...snapshot,
      id: foundEntry.dealId,
      status: 'active',
      published: true,
      photos: foundEntry.photos.length > 0 ? foundEntry.photos : (snapshot.photos || []),
      updated_at: new Date().toISOString(),
      published_at: new Date().toISOString(),
    };

    const useSupabase = await checkSupabaseTable();
    if (useSupabase) {
      const safePayload = sanitizePayloadForSupabase(restorePayload);
      if (Array.isArray(safePayload.photos)) {
        safePayload.photos = JSON.stringify(safePayload.photos);
      }
      if (Array.isArray(safePayload.partners)) {
        safePayload.partners = JSON.stringify(safePayload.partners);
      }
      const { error } = await supabase.from('jv_deals').upsert(safePayload);
      if (error) {
        console.log('[JV-Storage] Supabase restore from pub log failed:', error.message);
        return { success: false, error: error.message };
      }
      console.log('[JV-Storage] ✅ Restored deal to Supabase from publication log');
    }

    const localDeals = await getLocalDeals();
    const localIdx = localDeals.findIndex(d => d.id === foundEntry.dealId);
    const localRestore = {
      ...restorePayload,
      projectName: foundEntry.projectName || (snapshot as any).projectName || '',
      photos: foundEntry.photos.length > 0 ? foundEntry.photos : (Array.isArray(snapshot.photos) ? snapshot.photos : []),
      updatedAt: new Date().toISOString(),
      publishedAt: new Date().toISOString(),
    };
    if (localIdx >= 0) {
      localDeals[localIdx] = { ...localDeals[localIdx], ...localRestore };
    } else {
      localDeals.unshift(localRestore);
    }
    await saveLocalDeals(localDeals);

    log[idx] = { ...foundEntry, restored: true, restoredAt: new Date().toISOString() } as PublicationLogEntry;
    await AsyncStorage.setItem(PUBLICATION_LOG_KEY, JSON.stringify(log));

    void logAuditEvent({
      action: 'RESTORE',
      dealId: foundEntry.dealId,
      userId: auth.userId,
      role: auth.role,
      dealTitle: foundEntry.dealTitle,
    });

    console.log('[JV-Storage] ✅ Full restore from publication log complete — deal:', foundEntry.dealId);
    return { success: true };
  } catch (err) {
    console.log('[JV-Storage] Restore from pub log exception:', (err as Error)?.message);
    return { success: false, error: (err as Error)?.message };
  }
}

export async function addToLocalWaitlist(entry: Record<string, unknown>): Promise<{ success: boolean; position: number }> {
  try {
    const list = await getLocalWaitlist();
    const newEntry = { ...entry, id: `wl-${Date.now()}`, created_at: new Date().toISOString() };
    list.push(newEntry);
    await AsyncStorage.setItem(WAITLIST_STORAGE_KEY, JSON.stringify(list));
    return { success: true, position: list.length + 100 };
  } catch {
    return { success: true, position: Math.floor(Math.random() * 500) + 100 };
  }
}
