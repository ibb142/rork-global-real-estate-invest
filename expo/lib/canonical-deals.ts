import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  mapDealToCardModel,
  CANONICAL_MIN_INVESTMENT,
  CANONICAL_DISTRIBUTION_LABEL,
  type PublishedDealCardModel,
} from '@/lib/published-deal-card-model';
import { resolveDealTrustMarket, type ParsedJVDeal } from '@/lib/parse-deal';
import { fetchDealsJsonEndpoint } from '@/lib/api-response-guard';
import { DIRECT_API_BASE_URL, getPublishedDealsReadUrls } from '@/lib/public-api';

const PUBLISHED_STATUSES = ['active', 'published', 'live'] as const;

function isPublishedRow(row: Record<string, unknown>): boolean {
  return row.published === true || row.is_published === true;
}

function readString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function isActiveStatus(status: unknown): boolean {
  return PUBLISHED_STATUSES.includes(readString(status).trim().toLowerCase() as (typeof PUBLISHED_STATUSES)[number]);
}

function isLandingVisibleRow(row: Record<string, unknown>): boolean {
  return isPublishedRow(row) || isActiveStatus(row.status);
}

function sortDeals(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.slice().sort((a, b) => {
    const orderA = Number(a.display_order ?? a.displayOrder ?? 999);
    const orderB = Number(b.display_order ?? b.displayOrder ?? 999);
    if (orderA !== orderB) return orderA - orderB;
    const dateA = readString(a.published_at ?? a.publishedAt ?? a.updated_at ?? a.updatedAt ?? a.created_at ?? a.createdAt);
    const dateB = readString(b.published_at ?? b.publishedAt ?? b.updated_at ?? b.updatedAt ?? b.created_at ?? b.createdAt);
    return dateB.localeCompare(dateA);
  });
}

export interface CanonicalDealResult {
  deals: PublishedDealCardModel[];
  source: 'supabase' | 'backend' | 'public_api' | 'cache' | 'empty';
  fetchedAt: string;
  count: number;
}

export type CanonicalDealSourcePreference = 'auto' | 'public_api' | 'supabase';

const BACKEND_URL = DIRECT_API_BASE_URL;

let _cachedResult: CanonicalDealResult | null = null;
let _cacheTimestamp = 0;
let _lastETag: string | null = null;
let _fetchLatencyMs: number | null = null;
let _fetchCount = 0;
let _cacheHitCount = 0;
const CACHE_TTL = 60_000;

export async function fetchCanonicalDeals(
  forceRefresh = false,
  sourcePreference: CanonicalDealSourcePreference = 'auto',
): Promise<CanonicalDealResult> {
  const now = Date.now();
  if (!forceRefresh && _cachedResult && (now - _cacheTimestamp) < CACHE_TTL) {
    _cacheHitCount++;
    console.log('[CanonicalDeals] Cache hit (age:', Math.round((now - _cacheTimestamp) / 1000), 's, hits:', _cacheHitCount, '| preference:', sourcePreference, ')');
    return _cachedResult;
  }

  _fetchCount++;
  const fetchStart = Date.now();

  let result: CanonicalDealResult;
  if (sourcePreference === 'public_api') {
    result = await fetchFromBackend();
    if (result.source === 'empty') {
      result = await fetchFromSupabase();
    }
  } else {
    result = await fetchFromSupabase();
    if (result.source === 'empty') {
      result = await fetchFromBackend();
    }
  }

  _fetchLatencyMs = Date.now() - fetchStart;
  console.log('[CanonicalDeals] Fetch #' + _fetchCount, '| latency:', _fetchLatencyMs + 'ms', '| deals:', result.count, '| source:', result.source, '| preference:', sourcePreference);

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
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false, nullsFirst: false })
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
      console.log('[CanonicalDeals] No landing-visible deals found in Supabase');
      return { deals: [], source: 'supabase', fetchedAt: new Date().toISOString(), count: 0 };
    }

    const safeData = Array.isArray(data) ? data : [];
    const visibleRows = sortDeals((safeData as Record<string, unknown>[]).filter((row) => {
      try {
        return isLandingVisibleRow(row);
      } catch {
        return false;
      }
    }));
    const cards = visibleRows.map((row) => {
      try {
        return mapDealToCardModel(row);
      } catch (e) {
        console.log('[CanonicalDeals] mapDealToCardModel error for row:', (row as any)?.id, (e as Error)?.message);
        return null;
      }
    }).filter((c): c is PublishedDealCardModel => c !== null);
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
  const readUrls = getPublishedDealsReadUrls();
  if (readUrls.length === 0) {
    return { deals: [], source: 'empty', fetchedAt: new Date().toISOString(), count: 0 };
  }

  try {
    console.log('[CanonicalDeals] Fetching from published deals API candidates...', readUrls);

    for (const url of readUrls) {
      const endpointName = url.includes('published-jv-deals') ? 'published-jv-deals' : 'landing-deals';
      const result = await fetchDealsJsonEndpoint(url, {
        endpointName,
        timeoutMs: 8000,
      });

      if (!result.ok) {
        console.log('[CanonicalDeals] API candidate failed hard:', url, '|', result.error);
        continue;
      }

      const cards = result.deals.map((row: Record<string, unknown>) => mapDealToCardModel(row));
      const source = url.startsWith(BACKEND_URL) ? 'backend' : 'public_api';
      console.log('[CanonicalDeals] Fetched', cards.length, 'canonical deals from', source, 'via', url);
      return {
        deals: cards,
        source,
        fetchedAt: new Date().toISOString(),
        count: cards.length,
      };
    }

    return { deals: [], source: 'empty', fetchedAt: new Date().toISOString(), count: 0 };
  } catch (err) {
    console.log('[CanonicalDeals] Backend/public API fetch error:', (err as Error)?.message);
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
  const parsedDeal: ParsedJVDeal = {
    id: card.id,
    title: card.title,
    projectName: card.projectName || card.title,
    type: card.dealType,
    expectedROI: card.expectedROI,
    totalInvestment: card.totalInvestment,
    propertyValue: card.propertyValue || 0,
    salePrice: card.explicitSalePrice,
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

  return {
    ...parsedDeal,
    trustMarket: resolveDealTrustMarket(parsedDeal as unknown as Record<string, unknown>, card.rawTrustInfo),
  };
}
