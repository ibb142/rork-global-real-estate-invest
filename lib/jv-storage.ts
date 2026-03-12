import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';

const JV_STORAGE_KEY = 'ivx_jv_deals_v2';
const WAITLIST_STORAGE_KEY = 'ivx_waitlist_v1';
let _supabaseAvailable: boolean | null = null;
let _supabaseCheckTimestamp: number = 0;
const SUPABASE_CACHE_TTL = 30000;
const _tableCache: Record<string, boolean> = {};
const _tableCacheTimestamps: Record<string, number> = {};
const TABLE_CACHE_TTL = 60000;

function isTableNotFoundError(error: any): boolean {
  if (!error) return false;
  const code = error.code || error?.details?.code || '';
  const msg = (error.message || '').toLowerCase();
  return code === 'PGRST205' || msg.includes('could not find the table') || msg.includes('schema cache');
}

async function checkSupabaseTable(): Promise<boolean> {
  const now = Date.now();
  if (_supabaseAvailable !== null && (now - _supabaseCheckTimestamp) < SUPABASE_CACHE_TTL) {
    return _supabaseAvailable;
  }
  if (_supabaseAvailable === false && (now - _supabaseCheckTimestamp) < SUPABASE_CACHE_TTL) {
    return false;
  }
  try {
    console.log('[JV-Storage] Checking Supabase jv_deals table availability...');
    const { error } = await supabase.from('jv_deals').select('id').limit(1);
    _supabaseCheckTimestamp = now;
    if (error && isTableNotFoundError(error)) {
      console.log('[JV-Storage] Supabase jv_deals table NOT found — using local storage');
      _supabaseAvailable = false;
      return false;
    }
    if (error) {
      console.log('[JV-Storage] Supabase query error (non-table):', error.message);
      _supabaseAvailable = false;
      return false;
    }
    console.log('[JV-Storage] Supabase jv_deals table available ✓');
    _supabaseAvailable = true;
    return true;
  } catch (err) {
    console.log('[JV-Storage] Supabase check failed:', (err as Error)?.message);
    _supabaseCheckTimestamp = now;
    _supabaseAvailable = false;
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

export async function fetchJVDeals(filters?: { published?: boolean; limit?: number }): Promise<{ deals: any[]; total: number }> {
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    try {
      let query = supabase.from('jv_deals').select('*', { count: 'exact' });
      if (filters?.published !== undefined) {
        query = query.eq('published', filters.published);
      }
      query = query.order('createdAt', { ascending: false });
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }
      const { data, error, count } = await query;
      if (error) {
        if (isTableNotFoundError(error)) {
          _supabaseAvailable = false;
          _supabaseCheckTimestamp = Date.now();
          console.log('[JV-Storage] Table disappeared — falling back to local');
        } else {
          console.log('[JV-Storage] Supabase fetch error:', error.message, '— retrying Supabase on next call');
          _supabaseAvailable = null;
          _supabaseCheckTimestamp = 0;
          throw error;
        }
      } else {
        console.log('[JV-Storage] Fetched', data?.length ?? 0, 'deals from Supabase (published filter:', filters?.published, ')');
        return { deals: data || [], total: count || (data?.length ?? 0) };
      }
    } catch (err) {
      if (!isTableNotFoundError(err)) {
        console.log('[JV-Storage] Supabase fetch exception:', (err as Error)?.message, '— will retry');
        _supabaseAvailable = null;
        _supabaseCheckTimestamp = 0;
      }
    }
  }

  let deals = await getLocalDeals();
  if (filters?.published !== undefined) {
    deals = deals.filter(d => d.published === filters.published);
  }
  deals.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  if (filters?.limit) {
    deals = deals.slice(0, filters.limit);
  }
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
        return null;
      } else {
        return data;
      }
    } catch (err) {
      console.log('[JV-Storage] Supabase fetchById exception:', (err as Error)?.message);
    }
  }

  const deals = await getLocalDeals();
  return deals.find(d => d.id === id) || null;
}

export async function upsertJVDeal(payload: Record<string, unknown>): Promise<{ data: any; error: null } | { data: null; error: Error }> {
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    try {
      const { data, error } = await supabase.from('jv_deals').upsert({
        ...payload,
        updatedAt: new Date().toISOString(),
      }).select().single();
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
        console.log('[JV-Storage] Table not found on upsert — falling back to local');
      } else if (error) {
        console.log('[JV-Storage] Supabase upsert error:', error.message);
        return { data: null, error: new Error(error.message) };
      } else {
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

export async function updateJVDeal(id: string, updates: Record<string, unknown>): Promise<{ data: any; error: null } | { data: null; error: Error }> {
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    try {
      const { data, error } = await supabase.from('jv_deals').update({
        ...updates,
        updatedAt: new Date().toISOString(),
      }).eq('id', id).select().single();
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
      } else if (error) {
        return { data: null, error: new Error(error.message) };
      } else {
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

export async function deleteJVDeal(id: string): Promise<{ error: Error | null }> {
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    try {
      const { error } = await supabase.from('jv_deals').delete().eq('id', id);
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
      } else if (error) {
        return { error: new Error(error.message) };
      } else {
        return { error: null };
      }
    } catch (err) {
      if (!isTableNotFoundError(err)) {
        return { error: err as Error };
      }
    }
  }

  const deals = await getLocalDeals();
  const filtered = deals.filter(d => d.id !== id);
  await saveLocalDeals(filtered);
  console.log('[JV-Storage] Deleted deal locally:', id);
  return { error: null };
}

export async function deleteAllJVDeals(): Promise<{ error: Error | null; count: number }> {
  const useSupabase = await checkSupabaseTable();

  if (useSupabase) {
    try {
      const { error, count } = await supabase.from('jv_deals').delete().neq('id', '');
      if (error && isTableNotFoundError(error)) {
        _supabaseAvailable = false;
      } else if (error) {
        return { error: new Error(error.message), count: 0 };
      } else {
        return { error: null, count: count ?? 0 };
      }
    } catch (err) {
      if (!isTableNotFoundError(err)) {
        return { error: err as Error, count: 0 };
      }
    }
  }

  const deals = await getLocalDeals();
  const count = deals.length;
  await saveLocalDeals([]);
  console.log('[JV-Storage] Deleted all deals locally:', count);
  return { error: null, count };
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
