import { supabase, isSupabaseConfigured } from './supabase';
import { cacheData, getCachedData } from './api-resilience';

export async function fallbackFetchDeals(): Promise<Record<string, unknown>[]> {
  if (!isSupabaseConfigured()) {
    const cached = await getCachedData<Record<string, unknown>[]>('deals');
    return cached?.data ?? [];
  }

  try {
    const { data, error } = await supabase
      .from('jv_deals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.log('[Fallback] Deals query error:', error.message);
      const cached = await getCachedData<Record<string, unknown>[]>('deals');
      return cached?.data ?? [];
    }

    const result = data || [];
    void cacheData('deals', result);
    return result;
  } catch (err) {
    console.log('[Fallback] Deals fetch error:', (err as Error)?.message);
    const cached = await getCachedData<Record<string, unknown>[]>('deals');
    return cached?.data ?? [];
  }
}

export async function fallbackFetchProperties(): Promise<Record<string, unknown>[]> {
  if (!isSupabaseConfigured()) {
    const cached = await getCachedData<Record<string, unknown>[]>('properties');
    return cached?.data ?? [];
  }

  try {
    const { data, error } = await supabase
      .from('properties')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.log('[Fallback] Properties query error:', error.message);
      const cached = await getCachedData<Record<string, unknown>[]>('properties');
      return cached?.data ?? [];
    }

    const result = data || [];
    void cacheData('properties', result);
    return result;
  } catch (err) {
    console.log('[Fallback] Properties fetch error:', (err as Error)?.message);
    const cached = await getCachedData<Record<string, unknown>[]>('properties');
    return cached?.data ?? [];
  }
}

export async function fallbackFetchProfile(userId: string): Promise<Record<string, unknown> | null> {
  if (!isSupabaseConfigured()) {
    const cached = await getCachedData<Record<string, unknown>>(`profile_${userId}`);
    return cached?.data ?? null;
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.log('[Fallback] Profile query error:', error.message);
      const cached = await getCachedData<Record<string, unknown>>(`profile_${userId}`);
      return cached?.data ?? null;
    }

    if (data) {
      void cacheData(`profile_${userId}`, data);
    }
    return data;
  } catch (err) {
    console.log('[Fallback] Profile fetch error:', (err as Error)?.message);
    const cached = await getCachedData<Record<string, unknown>>(`profile_${userId}`);
    return cached?.data ?? null;
  }
}

export async function fallbackFetchWallet(userId: string): Promise<Record<string, unknown> | null> {
  if (!isSupabaseConfigured()) {
    const cached = await getCachedData<Record<string, unknown>>(`wallet_${userId}`);
    return cached?.data ?? null;
  }

  try {
    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      const cached = await getCachedData<Record<string, unknown>>(`wallet_${userId}`);
      return cached?.data ?? null;
    }

    if (data) {
      void cacheData(`wallet_${userId}`, data);
    }
    return data;
  } catch {
    const cached = await getCachedData<Record<string, unknown>>(`wallet_${userId}`);
    return cached?.data ?? null;
  }
}

export async function fallbackFetchHoldings(userId: string): Promise<Record<string, unknown>[]> {
  if (!isSupabaseConfigured()) {
    const cached = await getCachedData<Record<string, unknown>[]>(`holdings_${userId}`);
    return cached?.data ?? [];
  }

  try {
    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', userId);

    if (error) {
      const cached = await getCachedData<Record<string, unknown>[]>(`holdings_${userId}`);
      return cached?.data ?? [];
    }

    const result = data || [];
    void cacheData(`holdings_${userId}`, result);
    return result;
  } catch {
    const cached = await getCachedData<Record<string, unknown>[]>(`holdings_${userId}`);
    return cached?.data ?? [];
  }
}

export async function fallbackFetchNotifications(userId: string): Promise<Record<string, unknown>[]> {
  if (!isSupabaseConfigured()) {
    const cached = await getCachedData<Record<string, unknown>[]>(`notifications_${userId}`);
    return cached?.data ?? [];
  }

  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      const cached = await getCachedData<Record<string, unknown>[]>(`notifications_${userId}`);
      return cached?.data ?? [];
    }

    const result = data || [];
    void cacheData(`notifications_${userId}`, result);
    return result;
  } catch {
    const cached = await getCachedData<Record<string, unknown>[]>(`notifications_${userId}`);
    return cached?.data ?? [];
  }
}

export async function fallbackFetchTransactions(userId: string, page: number = 1, limit: number = 20): Promise<{ transactions: Record<string, unknown>[]; total: number }> {
  if (!isSupabaseConfigured()) {
    const cached = await getCachedData<{ transactions: Record<string, unknown>[]; total: number }>(`transactions_${userId}_${page}`);
    return cached?.data ?? { transactions: [], total: 0 };
  }

  try {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      const cached = await getCachedData<{ transactions: Record<string, unknown>[]; total: number }>(`transactions_${userId}_${page}`);
      return cached?.data ?? { transactions: [], total: 0 };
    }

    const result = { transactions: data || [], total: count || 0 };
    void cacheData(`transactions_${userId}_${page}`, result);
    return result;
  } catch {
    const cached = await getCachedData<{ transactions: Record<string, unknown>[]; total: number }>(`transactions_${userId}_${page}`);
    return cached?.data ?? { transactions: [], total: 0 };
  }
}
