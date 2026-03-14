import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { scopedKey } from '@/lib/project-storage';

const JV_STORAGE_KEY = scopedKey('jv_deals_v2');
const WAITLIST_STORAGE_KEY = scopedKey('waitlist_v1');
const TRASH_STORAGE_KEY = scopedKey('jv_trash_v1');
let _supabaseAvailable: boolean | null = null;
let _supabaseCheckTimestamp: number = 0;
const SUPABASE_CACHE_TTL = 6000;
const SUPABASE_FAILURE_CACHE_TTL = 1000;
const _tableCache: Record<string, boolean> = {};
const _tableCacheTimestamps: Record<string, number> = {};
const TABLE_CACHE_TTL = 8000;

function isTableNotFoundError(error: any): boolean {
  if (!error) return false;
  const code = error.code || error?.details?.code || '';
  const msg = (error.message || '').toLowerCase();
  return code === 'PGRST205' || msg.includes('could not find the table') || msg.includes('schema cache');
}

async function checkSupabaseTable(): Promise<boolean> {
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
      setTimeout(() => resolve({ error: { message: 'Timeout after 5s', code: 'TIMEOUT' } }), 5000)
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

async function getLocalDeals(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(JV_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.log('[JV-Storage] Local read error:', (err as Error)?.message);
    return [];
  }
}

async function saveLocalDeals(deals: any[]): Promise<void> {
  try {
    await AsyncStorage.setItem(JV_STORAGE_KEY, JSON.stringify(deals));
    console.log('[JV-Storage] Saved', deals.length, 'deals locally');
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
  photos = photos.filter((p: any) => typeof p === 'string' && p.length > 5);

  let partners = parseJsonField(row.partners, []);
  let poolTiers = parseJsonField(row.poolTiers ?? row.pool_tiers, undefined);

  console.log('[JV-Storage] mapRow id:', row.id, '| photos:', photos.length, '| raw photos type:', typeof row.photos, '| poolTiers:', poolTiers ? 'yes' : 'no');

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

function sanitizePayloadForSupabase(payload: Record<string, unknown>): Record<string, unknown> {
  const validColumns = new Set([
    'id', 'title', 'projectName', 'type', 'description',
    'partner_name', 'partner_email', 'partner_phone', 'partner_type',
    'propertyAddress', 'property_address', 'city', 'state', 'zip_code', 'country',
    'lot_size', 'lot_size_unit', 'zoning', 'property_type',
    'totalInvestment', 'expectedROI', 'estimated_value', 'appraised_value',
    'cash_payment_percent', 'collateral_percent', 'partner_profit_share',
    'developer_profit_share', 'term_months', 'cash_payment_amount', 'collateral_amount',
    'distributionFrequency', 'exitStrategy', 'partners', 'poolTiers',
    'status', 'published', 'publishedAt', 'photos', 'documents', 'notes',
    'rejection_reason', 'control_disclosure_accepted', 'control_disclosure_accepted_at',
    'payment_structure', 'user_id', 'createdAt', 'updatedAt',
    'submitted_at', 'approved_at', 'completed_at',
    'currency', 'profitSplit', 'startDate', 'endDate',
    'governingLaw', 'disputeResolution', 'confidentialityPeriod',
    'nonCompetePeriod', 'managementFee', 'performanceFee', 'minimumHoldPeriod',
  ]);
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (validColumns.has(key)) {
      sanitized[key] = value;
    } else {
      console.log('[JV-Storage] Dropping unknown column from Supabase payload:', key);
    }
  }
  return sanitized;
}

export async function fetchJVDeals(filters?: { published?: boolean; limit?: number }): Promise<{ deals: any[]; total: number }> {
  let supabaseDeals: any[] | null = null;
  let supabaseCount: number | null = null;

  try {
    const useSupabase = await checkSupabaseTable();
    if (useSupabase) {
      let query = supabase.from('jv_deals').select('*', { count: 'exact' });
      if (filters?.published !== undefined) {
        query = query.eq('published', filters.published);
      }
      query = query.order('created_at', { ascending: false });
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }
      const timeoutPromise = new Promise<{ data: null; error: { message: string; code: string }; count: null }>((resolve) =>
        setTimeout(() => resolve({ data: null, error: { message: 'Fetch timeout 8s', code: 'TIMEOUT' }, count: null }), 8000)
      );
      const { data, error, count } = await Promise.race([query, timeoutPromise]) as any;
      if (error) {
        if (isTableNotFoundError(error)) {
          _supabaseAvailable = false;
          _supabaseCheckTimestamp = Date.now();
          console.log('[JV-Storage] Table disappeared — falling back to local');
        } else {
          console.log('[JV-Storage] Supabase fetch error:', error.message, error.code, '— retrying without filter');
          if (filters?.published !== undefined) {
            try {
              const retryQuery = supabase.from('jv_deals').select('*', { count: 'exact' });
              const retryResult = await Promise.race([retryQuery, timeoutPromise]) as any;
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
        const mapped = (data || []).map(mapSupabaseRowToCamelCase);
        supabaseDeals = mapped;
        supabaseCount = count;
        console.log('[JV-Storage] Fetched', mapped.length, 'deals from Supabase (published filter:', filters?.published, ')');

        if (mapped.length === 0 && filters?.published !== undefined) {
          console.log('[JV-Storage] Published filter returned 0 deals — no auto-publish, returning empty');
        }
      }
    }
  } catch (err) {
    console.log('[JV-Storage] Supabase fetch exception:', (err as Error)?.message, '— falling back to local');
    _supabaseAvailable = null;
    _supabaseCheckTimestamp = 0;
  }

  if (supabaseDeals !== null) {
    supabaseDeals.sort((a: any, b: any) => {
      const dateA = a.createdAt || a.created_at || '';
      const dateB = b.createdAt || b.created_at || '';
      return String(dateB).localeCompare(String(dateA));
    });
    return { deals: supabaseDeals, total: supabaseCount || supabaseDeals.length };
  }

  let deals = await getLocalDeals();

  if (filters?.published !== undefined) {
    deals = deals.filter(d => d.published === filters.published);
  }
  deals.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (filters?.limit) {
    deals = deals.slice(0, filters.limit);
  }
  console.log('[JV-Storage] Returning', deals.length, 'deals from local storage');
  return { deals, total: deals.length };
}

export async function fetchJVDealById(id: string): Promise<any> {
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    try {
      const { data, error } = await supabase.from('jv_deals').select('*').eq('id', id).single();
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
      } else if (error) {
        console.log('[JV-Storage] Supabase fetchById error:', error.message);
      } else {
        return mapSupabaseRowToCamelCase(data);
      }
    } catch (err) {
      console.log('[JV-Storage] Supabase fetchById exception:', (err as Error)?.message);
    }
  }

  const deals = await getLocalDeals();
  const localDeal = deals.find(d => d.id === id);
  if (localDeal) return localDeal;

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
        updatedAt: new Date().toISOString(),
      }).select().single();
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
        console.log('[JV-Storage] Table not found on upsert — falling back to local');
      } else if (error) {
        console.log('[JV-Storage] Supabase upsert error:', error.message, '| code:', error.code, '| details:', JSON.stringify(error).substring(0, 500));
        return { data: null, error: new Error(error.message) };
      } else {
        console.log('[JV-Storage] Supabase upsert SUCCESS — id:', data?.id, 'published:', data?.published);
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
        updatedAt: new Date().toISOString(),
      }).eq('id', id).select().single();
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
      } else if (error) {
        console.log('[JV-Storage] Supabase update error:', error.message, '| code:', error.code, '| details:', JSON.stringify(error).substring(0, 500));
        return { data: null, error: new Error(error.message) };
      } else {
        console.log('[JV-Storage] Supabase update SUCCESS — id:', data?.id, 'published:', data?.published);
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
  deals[idx] = { ...deals[idx], ...updates, updatedAt: new Date().toISOString() };
  await saveLocalDeals(deals);
  console.log('[JV-Storage] Updated deal locally:', id);
  return { data: deals[idx], error: null };
}

export async function archiveJVDeal(id: string): Promise<{ data: any; error: Error | null }> {
  console.log('[JV-Storage] ARCHIVE (soft-delete) deal:', id);
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    try {
      const { data, error } = await supabase.from('jv_deals').update({
        status: 'archived',
        published: false,
        updatedAt: new Date().toISOString(),
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

export async function restoreJVDeal(id: string): Promise<{ data: any; error: Error | null }> {
  console.log('[JV-Storage] RESTORE deal from archive:', id);
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    try {
      const { data, error } = await supabase.from('jv_deals').update({
        status: 'active',
        updatedAt: new Date().toISOString(),
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

export async function deleteJVDeal(id: string): Promise<{ error: Error | null }> {
  console.log('[JV-Storage] 🗑️ MOVE TO TRASH requested for deal:', id);
  const useSupabase = await checkSupabaseTable();

  let dealSnapshot: any = null;

  if (useSupabase) {
    try {
      const { data: existingDeal, error: fetchErr } = await supabase.from('jv_deals').select('*').eq('id', id).single();
      if (!fetchErr && existingDeal) {
        dealSnapshot = mapSupabaseRowToCamelCase(existingDeal);
      }

      const { error } = await supabase.from('jv_deals').update({
        status: 'trashed',
        published: false,
        updatedAt: new Date().toISOString(),
      }).eq('id', id);

      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
      } else if (error) {
        return { error: new Error(error.message) };
      } else {
        if (dealSnapshot) {
          await saveToTrash({ ...dealSnapshot, status: 'trashed', published: false, trashedAt: new Date().toISOString() });
        }
        console.log('[JV-Storage] Moved deal to trash in Supabase:', id);
        return { error: null };
      }
    } catch (err) {
      if (!isTableNotFoundError(err)) {
        return { error: err as Error };
      }
    }
  }

  const deals = await getLocalDeals();
  const idx = deals.findIndex(d => d.id === id);
  if (idx >= 0) {
    dealSnapshot = { ...deals[idx] };
    deals[idx] = { ...deals[idx], status: 'trashed', published: false, updatedAt: new Date().toISOString() };
    await saveLocalDeals(deals);
    await saveToTrash({ ...dealSnapshot, status: 'trashed', published: false, trashedAt: new Date().toISOString() });
    console.log('[JV-Storage] Moved deal to trash locally:', id);
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

export async function restoreFromTrash(id: string): Promise<{ data: any; error: Error | null }> {
  console.log('[JV-Storage] RESTORE FROM TRASH:', id);
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    try {
      const { data, error } = await supabase.from('jv_deals').update({
        status: 'active',
        published: false,
        updatedAt: new Date().toISOString(),
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
  return { data: { id }, error: null };
}

export async function permanentlyDeleteJVDeal(id: string): Promise<{ error: Error | null }> {
  console.log('[JV-Storage] ⚠️ ADMIN PERMANENT DELETE:', id);
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    try {
      const { error } = await supabase.from('jv_deals').delete().eq('id', id);
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
      } else if (error) {
        return { error: new Error(error.message) };
      } else {
        console.log('[JV-Storage] PERMANENTLY deleted deal from Supabase:', id);
      }
    } catch (err) {
      if (!isTableNotFoundError(err)) {
        return { error: err as Error };
      }
    }
  }

  const deals = await getLocalDeals();
  const filtered = deals.filter(d => d.id !== id);
  if (filtered.length !== deals.length) {
    await saveLocalDeals(filtered);
  }

  const trashDeals = await getTrashDeals();
  const trashFiltered = trashDeals.filter((d: any) => d.id !== id);
  if (trashFiltered.length !== trashDeals.length) {
    await saveTrashDeals(trashFiltered);
  }

  console.log('[JV-Storage] PERMANENTLY deleted deal:', id);
  return { error: null };
}

export function isSupabaseAvailable(): boolean {
  return _supabaseAvailable === true;
}

export async function safeSupabaseInsert(table: string, payload: Record<string, unknown>): Promise<{ data: any; error: Error | null }> {
  try {
    const now = Date.now();
    if (_tableCache[table] === false && _tableCacheTimestamps[table] && (now - _tableCacheTimestamps[table]) < TABLE_CACHE_TTL) {
      return { data: null, error: null };
    }
    const { data, error } = await supabase.from(table).insert(payload).select().single();
    if (error && isTableNotFoundError(error)) {
      _tableCache[table] = false;
      _tableCacheTimestamps[table] = now;
      console.log(`[Storage] Table '${table}' not found — skipping for ${TABLE_CACHE_TTL / 1000}s`);
      return { data: null, error: null };
    }
    if (error) {
      console.log(`[Storage] Insert to '${table}' note:`, error.message);
      return { data: null, error: null };
    }
    _tableCache[table] = true;
    _tableCacheTimestamps[table] = now;
    return { data, error: null };
  } catch (err) {
    console.log(`[Storage] Insert to '${table}' failed:`, (err as Error)?.message);
    return { data: null, error: null };
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

/** @deprecated REMOVED — restoreCasaRosarioIfNeeded is disabled. All deals managed via Admin Panel only. */
export async function restoreCasaRosarioIfNeeded(): Promise<void> {
  console.log('[JV-Storage] restoreCasaRosarioIfNeeded is DISABLED — all deals managed via Admin Panel');
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
        const { error } = await supabase.from('jv_deals').update({ photos: JSON.stringify(trashPhotos), updatedAt: new Date().toISOString() }).eq('id', dealId);
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
        const { error } = await supabase.from('jv_deals').update({ photos: JSON.stringify(localPhotos), updatedAt: new Date().toISOString() }).eq('id', dealId);
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
        updatedAt: new Date().toISOString(),
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

export async function purgeAllPublishedDeals(): Promise<{ deleted: number; localCleared: number }> {
  const PURGE_FLAG_KEY = scopedKey('jv_purge_done_v3');
  try {
    const alreadyDone = await AsyncStorage.getItem(PURGE_FLAG_KEY);
    if (alreadyDone === 'true') {
      console.log('[JV-Storage] Purge v3 already completed — skipping');
      return { deleted: 0, localCleared: 0 };
    }
  } catch {}

  let deleted = 0;
  let localCleared = 0;

  try {
    const useSupabase = await checkSupabaseTable();
    if (useSupabase) {
      const { data: allDeals, error: fetchErr } = await supabase
        .from('jv_deals')
        .select('id, title, published, status');

      if (!fetchErr && allDeals && allDeals.length > 0) {
        console.log('[JV-Storage] PURGE v3: Found', allDeals.length, 'deals in Supabase — permanently deleting ALL');
        for (const deal of allDeals) {
          const { error: delErr } = await supabase
            .from('jv_deals')
            .delete()
            .eq('id', deal.id);
          if (!delErr) {
            deleted++;
            console.log('[JV-Storage] PURGE v3: Deleted deal:', deal.id, deal.title);
          } else {
            console.log('[JV-Storage] PURGE v3: Failed to delete deal:', deal.id, delErr.message);
          }
        }
      } else {
        console.log('[JV-Storage] PURGE v3: No deals found in Supabase (or error:', fetchErr?.message, ')');
      }
    }
  } catch (err) {
    console.log('[JV-Storage] PURGE v3: Supabase error:', (err as Error)?.message);
  }

  try {
    const localDeals = await getLocalDeals();
    if (localDeals.length > 0) {
      localCleared = localDeals.length;
      console.log('[JV-Storage] PURGE v3: Clearing', localCleared, 'deals from local storage');
      await AsyncStorage.removeItem(JV_STORAGE_KEY);
    }
  } catch (err) {
    console.log('[JV-Storage] PURGE v3: Local clear error:', (err as Error)?.message);
  }

  try {
    await AsyncStorage.setItem(PURGE_FLAG_KEY, 'true');
    console.log('[JV-Storage] PURGE v3: Complete — deleted:', deleted, '| local cleared:', localCleared);
  } catch {}

  return { deleted, localCleared };
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
