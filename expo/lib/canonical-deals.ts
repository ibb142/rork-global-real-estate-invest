import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  mapDealToCardModel,
  CANONICAL_MIN_INVESTMENT,
  CANONICAL_DISTRIBUTION_LABEL,
  type PublishedDealCardModel,
} from '@/lib/published-deal-card-model';
import type { ParsedJVDeal } from '@/lib/parse-deal';

export interface CanonicalDealResult {
  deals: PublishedDealCardModel[];
  source: 'supabase' | 'backend' | 'cache' | 'empty';
  fetchedAt: string;
  count: number;
}

const BACKEND_URL = (process.env.EXPO_PUBLIC_RORK_API_BASE_URL || process.env.EXPO_PUBLIC_API_BASE_URL || '').trim().replace(/\/$/, '');

let _cachedResult: CanonicalDealResult | null = null;
let _cacheTimestamp = 0;
let _lastETag: string | null = null;
let _fetchLatencyMs: number | null = null;
let _fetchCount = 0;
let _cacheHitCount = 0;
const CACHE_TTL = 60_000;

export async function fetchCanonicalDeals(forceRefresh = false): Promise<CanonicalDealResult> {
  const now = Date.now();
  if (!forceRefresh && _cachedResult && (now - _cacheTimestamp) < CACHE_TTL) {
    _cacheHitCount++;
    console.log('[CanonicalDeals] Cache hit (age:', Math.round((now - _cacheTimestamp) / 1000), 's, hits:', _cacheHitCount, ')');
    return _cachedResult;
  }

  _fetchCount++;
  const fetchStart = Date.now();

  let result = await fetchFromSupabase();
  if (result.source === 'empty' && BACKEND_URL) {
    result = await fetchFromBackend();
  }

  _fetchLatencyMs = Date.now() - fetchStart;
  console.log('[CanonicalDeals] Fetch #' + _fetchCount, '| latency:', _fetchLatencyMs + 'ms', '| deals:', result.count);

  if (result.deals.length > 0) {
    _cachedResult = result;
    _cacheTimestamp = now;
  }

  return result;
}

async function fetchFromSupabase(): Promise<CanonicalDealResult> {
  if (!isSupabaseConfigured()) {
    console.log('[CanonicalDeals] Supabase not configured');
    return { deals: [], source: 'empty', fetchedAt: new Date().toISOString(), count: 0 };
  }

  try {
    console.log('[CanonicalDeals] Fetching from Supabase jv_deals (single source of truth)...');
    const { data, error } = await supabase
      .from('jv_deals')
      .select('*')
      .eq('published', true)
      .in('status', ['active', 'published', 'live'])
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('schema cache') || msg.includes('could not find')) {
        console.log('[CanonicalDeals] jv_deals table not found');
        return { deals: [], source: 'empty', fetchedAt: new Date().toISOString(), count: 0 };
      }
      console.log('[CanonicalDeals] Supabase query error:', error.message);
      return { deals: [], source: 'empty', fetchedAt: new Date().toISOString(), count: 0 };
    }

    if (!data || data.length === 0) {
      console.log('[CanonicalDeals] No published deals found in Supabase');
      return { deals: [], source: 'supabase', fetchedAt: new Date().toISOString(), count: 0 };
    }

    const cards = (data as Record<string, unknown>[]).map(row => mapDealToCardModel(row));
    console.log('[CanonicalDeals] Fetched', cards.length, 'canonical deals from Supabase');
    return {
      deals: cards,
      source: 'supabase',
      fetchedAt: new Date().toISOString(),
      count: cards.length,
    };
  } catch (err) {
    console.log('[CanonicalDeals] Supabase fetch error:', (err as Error)?.message);
    return { deals: [], source: 'empty', fetchedAt: new Date().toISOString(), count: 0 };
  }
}

async function fetchFromBackend(): Promise<CanonicalDealResult> {
  if (!BACKEND_URL) {
    return { deals: [], source: 'empty', fetchedAt: new Date().toISOString(), count: 0 };
  }

  try {
    console.log('[CanonicalDeals] Fetching from backend API...');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response = await fetch(BACKEND_URL + '/api/published-jv-deals', {
      signal: controller.signal,
    }).catch(() => null);

    if (!response || !response.ok) {
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), 8000);
      response = await fetch(BACKEND_URL + '/api/landing-deals', {
        signal: controller2.signal,
      }).catch(() => null);
      clearTimeout(timeout2);
    }

    clearTimeout(timeout);

    if (!response || !response.ok) {
      console.log('[CanonicalDeals] Backend fetch failed:', response?.status);
      return { deals: [], source: 'empty', fetchedAt: new Date().toISOString(), count: 0 };
    }

    const result = await response.json();
    const rawDeals = Array.isArray(result) ? result : (result?.deals || []);
    const cards = rawDeals.map((row: Record<string, unknown>) => mapDealToCardModel(row));

    console.log('[CanonicalDeals] Fetched', cards.length, 'canonical deals from backend');
    return {
      deals: cards,
      source: 'backend',
      fetchedAt: new Date().toISOString(),
      count: cards.length,
    };
  } catch (err) {
    console.log('[CanonicalDeals] Backend fetch error:', (err as Error)?.message);
    return { deals: [], source: 'empty', fetchedAt: new Date().toISOString(), count: 0 };
  }
}

export function invalidateCanonicalCache(): void {
  _cachedResult = null;
  _cacheTimestamp = 0;
  _lastETag = null;
  console.log('[CanonicalDeals] Cache invalidated');
}

export function getCanonicalCacheStats() {
  return {
    hasCachedData: !!_cachedResult,
    cacheAge: _cachedResult ? Date.now() - _cacheTimestamp : null,
    cacheTTL: CACHE_TTL,
    lastFetchLatencyMs: _fetchLatencyMs,
    totalFetches: _fetchCount,
    cacheHits: _cacheHitCount,
    cacheHitRate: _fetchCount + _cacheHitCount > 0
      ? Math.round((_cacheHitCount / (_fetchCount + _cacheHitCount)) * 100)
      : 0,
    cachedDealCount: _cachedResult?.count ?? 0,
    cachedSource: _cachedResult?.source ?? null,
    lastETag: _lastETag,
  } as const;
}

export function getCanonicalConstants() {
  return {
    minInvestment: CANONICAL_MIN_INVESTMENT,
    distributionFrequency: CANONICAL_DISTRIBUTION_LABEL,
    platformName: 'IVX Holdings LLC',
  } as const;
}

export function canonicalCardToParsedDeal(card: PublishedDealCardModel): ParsedJVDeal {
  return {
    id: card.id,
    title: card.title,
    projectName: card.developerName,
    type: card.dealType,
    expectedROI: card.expectedROI,
    totalInvestment: card.totalInvestment,
    propertyValue: card.propertyValue || 0,
    partners: card.partnersCount,
    description: card.descriptionShort,
    propertyAddress: card.addressFull,
    distributionFrequency: card.distributionFrequency,
    exitStrategy: card.exitStrategy,
    photos: card.photos,
    published: true,
    publishedAt: card.publishedAt,
    created_at: card.publishedAt,
    status: card.status,
    city: card.city,
    state: card.state,
    country: card.country,
    trustInfo: card.rawTrustInfo,
  };
}
