import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { scopedKey } from '@/lib/project-storage';
import { getAuthUserRole, getAuthUserId, isAdminRole, loadStoredAuth } from '@/lib/auth-store';
import { logAudit } from '@/lib/audit-trail';
import { captureDeleteSnapshot } from '@/lib/data-recovery';
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
    console.log(`[JV-Storage] Role '${role}' not admin — attempting to load stored auth...`);
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

  const allowed = isAdminRole(role);
  if (!allowed) {
    console.warn(`[JV-Storage] 🚫 BLOCKED — ${action} requires admin. Current role: '${role}', userId: '${userId}'`);
  }
  return { allowed, userId, role, error: allowed ? undefined : `Only admin users can ${action}. Your role: ${role}` };
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

let _supabaseAvailable: boolean | null = null;
let _supabaseCheckTimestamp: number = 0;
const SUPABASE_CACHE_TTL = 8000;
const SUPABASE_FAILURE_CACHE_TTL = 1000;
const _tableCache: Record<string, boolean> = {};
const _tableCacheTimestamps: Record<string, number> = {};
const TABLE_CACHE_TTL = 3000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isTableNotFoundError(error: any): boolean {
  if (!error) return false;
  const code = String(error?.code ?? error?.details?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return code === 'PGRST205' || msg.includes('could not find the table') || msg.includes('schema cache');
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
    const timeoutPromise = new Promise<{ error: { message: string; code: string } }>((resolve) =>
      setTimeout(() => resolve({ error: { message: 'Timeout after 4s', code: 'TIMEOUT' } }), 4000)
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
    await AsyncStorage.removeItem(JV_STORAGE_KEY);
    _supabaseAvailable = null;
    _supabaseCheckTimestamp = 0;
    Object.keys(_tableCache).forEach(k => delete _tableCache[k]);
    Object.keys(_tableCacheTimestamps).forEach(k => delete _tableCacheTimestamps[k]);
    console.log('[JV-Storage] Local deal cache + Supabase cache fully cleared');
  } catch (err) {
    console.log('[JV-Storage] Failed to clear local cache:', (err as Error)?.message);
  }
}

function deduplicateDeals(deals: any[]): any[] {
  const seenById = new Map<string, any>();
  for (const deal of deals) {
    const id = deal?.id;
    if (!id) continue;
    if (seenById.has(id)) {
      const existing = seenById.get(id);
      const existingTime = existing?.updatedAt || existing?.updated_at || existing?.createdAt || existing?.created_at || '';
      const newTime = deal?.updatedAt || deal?.updated_at || deal?.createdAt || deal?.created_at || '';
      if (String(newTime) > String(existingTime)) {
        seenById.set(id, deal);
      }
    } else {
      seenById.set(id, deal);
    }
  }
  const byId = Array.from(seenById.values());

  const seenByName = new Map<string, any>();
  for (const deal of byId) {
    const name = (deal?.projectName || deal?.project_name || deal?.title || '').trim().toUpperCase();
    if (!name) {
      seenByName.set(deal.id, deal);
      continue;
    }
    if (seenByName.has(name)) {
      const existing = seenByName.get(name);
      const existingTime = existing?.updatedAt || existing?.updated_at || existing?.createdAt || existing?.created_at || '';
      const newTime = deal?.updatedAt || deal?.updated_at || deal?.createdAt || deal?.created_at || '';
      const existingPhotos = Array.isArray(existing?.photos) ? existing.photos.length : 0;
      const newPhotos = Array.isArray(deal?.photos) ? deal.photos.length : 0;
      if (newPhotos > existingPhotos || (newPhotos === existingPhotos && String(newTime) > String(existingTime))) {
        console.log('[JV-Storage] DEDUP by name: keeping newer/better version of "' + name + '" (id:', deal.id, 'over', existing.id, ')');
        seenByName.set(name, deal);
      } else {
        console.log('[JV-Storage] DEDUP by name: skipping duplicate "' + name + '" (id:', deal.id, 'kept:', existing.id, ')');
      }
    } else {
      seenByName.set(name, deal);
    }
  }
  return Array.from(seenByName.values());
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
    await AsyncStorage.setItem(BACKUP_CACHE_KEY, JSON.stringify(deals));
  } catch (err) {
    console.log('[JV-Storage] Backup cache save error:', (err as Error)?.message);
  }
}

async function saveLocalDeals(deals: any[]): Promise<void> {
  try {
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
  photos = photos.filter((p: any) => typeof p === 'string' && p.length > 5 && (p.startsWith('http') || p.startsWith('data:image/')) && !String(p).includes('picsum.photos') && !String(p).includes('placehold.co') && !String(p).includes('via.placeholder.com') && !String(p).includes('placekitten.com') && !String(p).includes('loremflickr.com'));

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
    distributionFrequency: row.distributionFrequency || row.distribution_frequency || '',
    exitStrategy: row.exitStrategy || row.exit_strategy || '',
    publishedAt: row.publishedAt || row.published_at || '',
    createdAt: row.createdAt || row.created_at || '',
    updatedAt: row.updatedAt || row.updated_at || '',
  };
}

const CAMEL_TO_SNAKE: Record<string, string> = {
  projectName: 'project_name',
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
  'non_compete_period', 'management_fee', 'performance_fee', 'minimum_hold_period',
  'projectName', 'propertyAddress', 'totalInvestment', 'expectedROI',
  'distributionFrequency', 'exitStrategy', 'poolTiers', 'publishedAt',
  'createdAt', 'updatedAt', 'profitSplit', 'startDate', 'endDate',
  'governingLaw', 'disputeResolution', 'confidentialityPeriod',
  'nonCompetePeriod', 'managementFee', 'performanceFee', 'minimumHoldPeriod',
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
      let query = supabase.from('jv_deals').select('*', { count: 'exact' }).neq('status', 'permanently_deleted').neq('status', 'trashed').neq('status', 'archived');
      if (filters?.published !== undefined) {
        query = query.eq('published', filters.published);
      }
      query = query.order('created_at', { ascending: false });
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }
      const timeoutPromise = new Promise<{ data: null; error: { message: string; code: string }; count: null }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'Fetch timeout 5s', code: 'TIMEOUT' }, count: null }), 5000)
      );
      const { data, error, count } = await Promise.race([query, timeoutPromise]) as any;
      if (error) {
        if (isTableNotFoundError(error)) {
          _supabaseAvailable = false;
          _supabaseCheckTimestamp = Date.now();
          console.log('[JV-Storage] Table not found — falling back to local');
        } else {
          console.log('[JV-Storage] Supabase fetch error:', error.message, error.code);
          if (filters?.published !== undefined) {
            try {
              console.log('[JV-Storage] Retrying without published filter...');
              const retryQuery = supabase.from('jv_deals').select('*', { count: 'exact' }).neq('status', 'permanently_deleted').neq('status', 'trashed').neq('status', 'archived');
              const retryTimeout = new Promise<{ data: null; error: { message: string; code: string }; count: null }>((resolve) =>
                setTimeout(() => resolve({ data: null, error: { message: 'Retry timeout 4s', code: 'TIMEOUT' }, count: null }), 4000)
              );
              const retryResult = await Promise.race([retryQuery, retryTimeout]) as any;
              if (!retryResult.error && retryResult.data) {
                const retryMapped = (retryResult.data || []).map(mapSupabaseRowToCamelCase);
                console.log('[JV-Storage] Retry without filter got', retryMapped.length, 'deals');
                supabaseDeals = retryMapped;
                supabaseCount = retryResult.count;
              }
            } catch (retryErr) {
              console.log('[JV-Storage] Retry also failed:', (retryErr as Error)?.message);
            }
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
        console.log('[JV-Storage] ✅ Fetched', mapped.length, 'deals from Supabase (published filter:', filters?.published, ')');

        if (mapped.length > 0) {
          try {
            const dedupedMapped = deduplicateDeals(mapped);
            await saveLocalDeals(dedupedMapped);
            await saveBackupCache(dedupedMapped);
            console.log('[JV-Storage] Replaced local cache with', dedupedMapped.length, 'deduplicated Supabase deals');
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
    const localDeals = await getLocalDeals();
    if (localDeals.length > 0) {
      const supabaseIds = new Set(supabaseDeals.map((d: any) => d.id));
      const orphanedLocal = localDeals.filter(ld => {
        if (supabaseIds.has(ld.id)) return false;
        if (ld.status === 'trashed' || ld.status === 'archived') return false;
        if (typeof ld.id === 'string' && ld.id.startsWith('local-')) return true;
        return false;
      });
      if (orphanedLocal.length > 0) {
        console.log('[JV-Storage] Found', orphanedLocal.length, 'local-only deals NOT in Supabase — syncing up (only local- prefixed IDs)');
        for (const orphan of orphanedLocal) {
          supabaseDeals.push(orphan);
          try {
            const safePayload = sanitizePayloadForSupabase(orphan);
            const { error: syncErr } = await supabase.from('jv_deals').upsert({
              ...safePayload,
              updated_at: new Date().toISOString(),
            });
            if (syncErr) {
              console.log('[JV-Storage] Orphan sync failed for', orphan.id, ':', syncErr.message);
            } else {
              console.log('[JV-Storage] Orphan synced to Supabase:', orphan.id);
            }
          } catch (syncExc) {
            console.log('[JV-Storage] Orphan sync exception:', (syncExc as Error)?.message);
          }
        }
      } else {
        const nonLocalOrphans = localDeals.filter(ld => {
          if (supabaseIds.has(ld.id)) return false;
          if (ld.status === 'trashed' || ld.status === 'archived') return false;
          if (typeof ld.id === 'string' && ld.id.startsWith('local-')) return false;
          return true;
        });
        if (nonLocalOrphans.length > 0) {
          console.log('[JV-Storage] Found', nonLocalOrphans.length, 'non-local deals missing from Supabase — cleaning local copies (likely permanently deleted)');
          const cleanedDeals = localDeals.filter(ld => !nonLocalOrphans.some(o => o.id === ld.id));
          if (cleanedDeals.length !== localDeals.length) {
            await saveLocalDeals(cleanedDeals);
            console.log('[JV-Storage] Cleaned', localDeals.length - cleanedDeals.length, 'stale local deals');
          }
        }
      }
    }

    if (filters?.published !== undefined) {
      supabaseDeals = supabaseDeals.filter((d: any) => {
        const val = d.published;
        const target = filters.published;
        if (typeof val === 'boolean') return val === target;
        if (typeof val === 'string') return (val === 'true') === target;
        return Boolean(val) === target;
      });
    }

    const deduped = deduplicateDeals(supabaseDeals);
    if (deduped.length !== supabaseDeals.length) {
      console.log('[JV-Storage] ⚠️ DEDUP removed', supabaseDeals.length - deduped.length, 'duplicate deals (Supabase path)');
    }
    deduped.sort((a: any, b: any) => {
      const dateA = a.createdAt || a.created_at || '';
      const dateB = b.createdAt || b.created_at || '';
      return String(dateB).localeCompare(String(dateA));
    });
    return { deals: deduped, total: supabaseCount || deduped.length };
  }

  let deals = await getLocalDeals();

  if (filters?.published !== undefined) {
    deals = deals.filter(d => d.published === filters.published);
  }
  deals.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (filters?.limit) {
    deals = deals.slice(0, filters.limit);
  }
  const dedupedLocal = deduplicateDeals(deals);
  if (dedupedLocal.length !== deals.length) {
    console.log('[JV-Storage] ⚠️ DEDUP removed', deals.length - dedupedLocal.length, 'duplicate deals (local path)');
  }
  console.log('[JV-Storage] Returning', dedupedLocal.length, 'deals from local storage');
  return { deals: dedupedLocal, total: dedupedLocal.length };
}

export async function fetchJVDealById(id: string): Promise<any> {
  const now = Date.now();
  const skipSupabase = _supabaseAvailable === false && (now - _supabaseCheckTimestamp) < SUPABASE_FAILURE_CACHE_TTL;

  if (!skipSupabase) {
    try {
      console.log('[JV-Storage] fetchById — querying Supabase directly for id:', id);
      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'fetchById timeout 5s' } }), 5000)
      );
      const { data, error } = await Promise.race([
        supabase.from('jv_deals').select('*').eq('id', id).single(),
        timeoutPromise,
      ]) as any;
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
        _supabaseCheckTimestamp = Date.now();
      } else if (error) {
        console.log('[JV-Storage] Supabase fetchById error:', error.message);
      } else if (data) {
        _supabaseAvailable = true;
        _supabaseCheckTimestamp = Date.now();
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

  return null;
}

export async function upsertJVDeal(payload: Record<string, unknown>, options?: { adminOverride?: boolean }): Promise<{ data: any; error: null } | { data: null; error: Error }> {
  const useSupabase = await checkSupabaseTable();
  const isAdmin = options?.adminOverride === true;

  const existingId = payload.id as string | undefined;
  if (existingId) {
    payload = await protectPhotos(existingId, payload, useSupabase, isAdmin);
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
        return { data: null, error: new Error(error.message) };
      } else {
        console.log('[JV-Storage] Supabase upsert SUCCESS — id:', data?.id, 'published:', data?.published);
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
  const useSupabase = await checkSupabaseTable();
  const isAdmin = options?.adminOverride === true;

  const safeUpdates_ = await protectPhotos(id, updates, useSupabase, isAdmin);

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
        return { data: null, error: new Error(error.message) };
      } else {
        console.log('[JV-Storage] Supabase update SUCCESS — id:', data?.id, 'published:', data?.published);
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
          console.log('[JV-Storage] DUAL WRITE — update also saved locally');
        } catch (localErr) {
          console.log('[JV-Storage] Local backup after Supabase update failed (non-critical):', (localErr as Error)?.message);
        }
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
  if (idx < 0) {
    return { data: null, error: new Error('Deal not found locally') };
  }
  deals[idx] = { ...deals[idx], ...safeUpdates_, updatedAt: new Date().toISOString() };
  await saveLocalDeals(deals);
  console.log('[JV-Storage] Updated deal locally (with photo protection):', id);
  return { data: deals[idx], error: null };
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
        ? Object.keys(data[0]).some(k => k === 'project_name' || k === 'total_investment')
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
