import { resolveCanonicalDealIdentity } from '@/lib/deal-identity';

export interface DealTrustInfo {
  llcName: string;
  builderName: string;
  builderWebsite?: string;
  minInvestment: number;
  timelineMin: number;
  timelineMax: number;
  timelineUnit: 'months' | 'years';
  legalStructure: string;
  insuranceCoverage: boolean;
  titleVerified: boolean;
  permitStatus: 'approved' | 'pending' | 'not_required';
  escrowProtected: boolean;
  thirdPartyAudit: boolean;
  licenseNumber?: string;
  yearEstablished?: number;
  completedProjects?: number;
  totalDeliveredValue?: number;
  salePrice?: number;
  hasExplicitSalePrice?: boolean;
  fractionalSharePrice?: number;
  priceChange1h?: number;
  priceChange2h?: number;
  ownershipLabel?: string;
  investorProtections: string[];
  riskFactors: string[];
  keyMilestones: DealMilestone[];
  documents: DealDocument[];
}

export interface DealMilestone {
  id: string;
  title: string;
  date: string;
  status: 'completed' | 'in_progress' | 'upcoming';
  description?: string;
}

export interface DealDocument {
  id: string;
  name: string;
  type: 'llc_filing' | 'permit' | 'insurance' | 'title' | 'appraisal' | 'prospectus' | 'agreement' | 'other';
  verified: boolean;
  url?: string;
}

export interface DealTrustMarket {
  salePrice: number;
  explicitSalePrice?: number;
  minInvestment: number;
  fractionalSharePrice: number;
  timelineMin?: number;
  timelineMax?: number;
  timelineUnit?: 'months' | 'years';
  priceChange1h: number;
  priceChange2h: number;
  ownershipLabel?: string;
}

export interface ParsedJVDeal {
  id: string;
  title: string;
  projectName: string;
  type: string;
  expectedROI: number;
  totalInvestment: number;
  propertyValue: number;
  salePrice?: number;
  partners: ParsedJVDealPartner[] | number;
  description: string;
  propertyAddress: string;
  distributionFrequency: string;
  exitStrategy: string;
  photos: string[];
  poolTiers?: ParsedJVDealPoolTier[];
  published: boolean;
  publishedAt?: string;
  created_at: string;
  status?: string;
  trustInfo?: DealTrustInfo;
  trustMarket?: DealTrustMarket;
  city?: string;
  state?: string;
  country?: string;
  [key: string]: unknown;
}

export interface ParsedJVDealPartner {
  id: string;
  name: string;
  role: string;
  contribution: number;
  equityShare: number;
  location: string;
  verified: boolean;
}

export interface ParsedJVDealPoolTier {
  id: string;
  label: string;
  type: string;
  targetAmount: number;
  minInvestment: number;
  maxInvestors?: number;
  currentRaised: number;
  investorCount: number;
  status: string;
}

const SHARED_JV_DEALS_STALE_MS = 60_000;
const SHARED_JV_DEALS_REFRESH_MS = 90_000;
const SHARED_JV_DEALS_GC_MS = 1000 * 60 * 10;

function safeJsonParse(val: unknown, fallback: unknown = []): unknown {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return val;
}

function toPositiveNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function toTimelineNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function differsFromFallback(candidate: number, fallback: number): boolean {
  if (candidate <= 0) {
    return false;
  }
  if (fallback <= 0) {
    return true;
  }
  return Math.abs(candidate - fallback) > 0.009;
}

export function extractExplicitDealSalePrice(rawDeal: Record<string, unknown>, trustInfo?: DealTrustInfo): number | undefined {
  const topLevelSalePrice = toPositiveNumber(rawDeal.salePrice ?? rawDeal.sale_price, 0);
  const trustSalePrice = toPositiveNumber(trustInfo?.salePrice, 0);
  const fallbackSalePrice = toPositiveNumber(
    rawDeal.propertyValue ?? rawDeal.property_value ?? rawDeal.estimated_value,
    toPositiveNumber(rawDeal.totalInvestment ?? rawDeal.total_investment, 0)
  );

  if (trustInfo?.hasExplicitSalePrice === true) {
    if (topLevelSalePrice > 0) {
      return topLevelSalePrice;
    }
    if (trustSalePrice > 0) {
      return trustSalePrice;
    }
    return undefined;
  }

  if (trustInfo?.hasExplicitSalePrice === false) {
    return undefined;
  }

  if (differsFromFallback(topLevelSalePrice, fallbackSalePrice)) {
    return topLevelSalePrice;
  }

  if (differsFromFallback(trustSalePrice, fallbackSalePrice)) {
    return trustSalePrice;
  }

  return undefined;
}

export function extractDealTrustInfo(rawDeal: Record<string, unknown>): DealTrustInfo | undefined {
  const rawTrust = rawDeal.trustInfo ?? rawDeal.trust_info;
  if (!rawTrust) {
    return undefined;
  }
  if (typeof rawTrust === 'object') {
    return rawTrust as DealTrustInfo;
  }
  if (typeof rawTrust === 'string') {
    try {
      return JSON.parse(rawTrust) as DealTrustInfo;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function resolveDealTrustMarket(rawDeal: Record<string, unknown>, trustInfo?: DealTrustInfo): DealTrustMarket {
  const resolvedTrustInfo = trustInfo ?? extractDealTrustInfo(rawDeal);
  const propertyValue = toPositiveNumber(rawDeal.propertyValue ?? rawDeal.property_value ?? rawDeal.estimated_value, 0);
  const totalInvestment = toPositiveNumber(rawDeal.totalInvestment ?? rawDeal.total_investment, 0);
  const fallbackSalePrice = propertyValue || totalInvestment;
  const explicitSalePrice = extractExplicitDealSalePrice(rawDeal, resolvedTrustInfo);
  const minInvestment = toPositiveNumber(resolvedTrustInfo?.minInvestment, 50);
  const fractionalSharePrice = toPositiveNumber(resolvedTrustInfo?.fractionalSharePrice, Math.max(minInvestment, 1));
  const priceChange1h = Number.isFinite(Number(resolvedTrustInfo?.priceChange1h)) ? Number(resolvedTrustInfo?.priceChange1h) : 10;
  const priceChange2h = Number.isFinite(Number(resolvedTrustInfo?.priceChange2h)) ? Number(resolvedTrustInfo?.priceChange2h) : 18;

  return {
    salePrice: explicitSalePrice ?? fallbackSalePrice,
    explicitSalePrice,
    minInvestment,
    fractionalSharePrice,
    timelineMin: toTimelineNumber(resolvedTrustInfo?.timelineMin),
    timelineMax: toTimelineNumber(resolvedTrustInfo?.timelineMax),
    timelineUnit: resolvedTrustInfo?.timelineUnit === 'years' ? 'years' : 'months',
    priceChange1h,
    priceChange2h,
    ownershipLabel: resolvedTrustInfo?.ownershipLabel,
  };
}

const PLACEHOLDER_DOMAINS = [
  'picsum.photos',
  'via.placeholder.com',
  'placehold.co',
  'placekitten.com',
  'loremflickr.com',
  'dummyimage.com',
  'fakeimg.pl',
  'lorempixel.com',
  'placeholder.com',
];

function isPlaceholderPhoto(url: string): boolean {
  try {
    const lower = url.toLowerCase();
    return PLACEHOLDER_DOMAINS.some(domain => lower.includes(domain));
  } catch {
    return false;
  }
}

export function parseDeal(d: Record<string, unknown>): ParsedJVDeal {
  const identity = resolveCanonicalDealIdentity(d);
  let photos = safeJsonParse(d.photos, []);
  if (!Array.isArray(photos)) photos = [];
  photos = (photos as string[]).filter(
    (p: string) => typeof p === 'string' && p.length > 5 && (p.startsWith('http://') || p.startsWith('https://')) && !isPlaceholderPhoto(p)
  );

  const dealIdentity = {
    title: identity.title,
    projectName: identity.projectName,
  };

  try {
    const { sanitizeDealPhotosForDeal } = require('@/constants/deal-photos') as {
      sanitizeDealPhotosForDeal: (deal: { title?: string; projectName?: string; project_name?: string }, photos: string[]) => string[];
    };
    photos = sanitizeDealPhotosForDeal(dealIdentity, photos as string[]);
  } catch {}

  if ((photos as string[]).length === 0) {
    try {
      const { getFallbackPhotosForDeal } = require('@/constants/deal-photos') as {
        getFallbackPhotosForDeal: (deal: { title?: string; projectName?: string; project_name?: string }) => string[];
      };
      const fallback = getFallbackPhotosForDeal(dealIdentity);
      if (fallback.length > 0) {
        photos = fallback;
        console.log('[parseDeal] Applied fallback photos for:', (d.projectName || d.project_name || d.title || 'unknown'), '->', fallback.length, 'photos');
      }
    } catch {}
  }

  let partners = safeJsonParse(d.partners, []);
  if (typeof partners === 'number') {
    // keep as number
  } else if (!Array.isArray(partners)) {
    partners = [];
  }

  let poolTiers = safeJsonParse(d.poolTiers ?? d.pool_tiers, undefined);
  if (poolTiers !== undefined && !Array.isArray(poolTiers)) {
    poolTiers = undefined;
  }

  const trustInfo = identity.trustInfo ?? extractDealTrustInfo(d);
  const trustMarket = resolveDealTrustMarket(d, trustInfo);

  return {
    ...d,
    photos: photos as string[],
    partners: partners as ParsedJVDealPartner[] | number,
    poolTiers: poolTiers as ParsedJVDealPoolTier[] | undefined,
    trustInfo,
    trustMarket,
    title: identity.title,
    projectName: identity.projectName,
    propertyAddress: (d.propertyAddress || d.property_address || '') as string,
    city: (d.city || '') as string,
    state: (d.state || '') as string,
    country: (d.country || '') as string,
    totalInvestment: Number(d.totalInvestment || d.total_investment || 0),
    propertyValue: Number(d.propertyValue || d.property_value || d.estimated_value || 0),
    salePrice: Number(d.salePrice || d.sale_price || 0),
    expectedROI: Number(d.expectedROI || d.expected_roi || 0),
    distributionFrequency: (d.distributionFrequency || d.distribution_frequency || '') as string,
    exitStrategy: (d.exitStrategy || d.exit_strategy || '') as string,
    publishedAt: (d.publishedAt || d.published_at || '') as string,
    created_at: (d.created_at || d.createdAt || '') as string,
  } as ParsedJVDeal;
}

export function getPartnerCount(partners: ParsedJVDealPartner[] | number): number {
  if (typeof partners === 'number') return partners;
  if (Array.isArray(partners)) return partners.length;
  if (typeof partners === 'string') {
    try {
      const p = JSON.parse(partners);
      return Array.isArray(p) ? p.length : 0;
    } catch { return 0; }
  }
  return 0;
}

export function getPartnersArray(partners: ParsedJVDealPartner[] | number): ParsedJVDealPartner[] {
  if (Array.isArray(partners)) return partners;
  if (typeof partners === 'string') {
    try {
      const p = JSON.parse(partners);
      return Array.isArray(p) ? p : [];
    } catch { return []; }
  }
  return [];
}

export function getPoolTiersArray(deal: ParsedJVDeal): ParsedJVDealPoolTier[] {
  if (Array.isArray(deal.poolTiers)) return deal.poolTiers;
  return [];
}

export function isValidPhoto(p: unknown): boolean {
  if (typeof p !== 'string' || p.length < 6) return false;
  if (isPlaceholderPhoto(p)) return false;
  if (p.startsWith('http://') || p.startsWith('https://')) return true;
  return false;
}

export function filterValidPhotos(raw: unknown): string[] {
  if (!raw) return [];
  let arr: unknown[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (typeof raw === 'string') {
    try { const parsed = JSON.parse(raw); arr = Array.isArray(parsed) ? parsed : []; } catch { arr = []; }
  }
  return arr.filter(isValidPhoto) as string[];
}

export interface DealPhotoIdentityLike {
  id?: string;
  title?: string;
  projectName?: string;
  project_name?: string;
  photos?: unknown;
  publishedAt?: string | null;
  published_at?: string | null;
  updatedAt?: string | null;
  updated_at?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
}

function resolveDealPhotoVersion(deal: DealPhotoIdentityLike): string {
  const version = deal.updatedAt
    ?? deal.updated_at
    ?? deal.publishedAt
    ?? deal.published_at
    ?? deal.createdAt
    ?? deal.created_at
    ?? '';
  return typeof version === 'string' ? version.trim() : '';
}

function appendPhotoVersion(url: string, version: string): string {
  if (!version || !url.startsWith('http')) {
    return url;
  }

  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set('ivxv', version);
    return parsedUrl.toString();
  } catch {
    const joiner = url.includes('?') ? '&' : '?';
    return `${url}${joiner}ivxv=${encodeURIComponent(version)}`;
  }
}

export function resolveDealPhotos(deal: DealPhotoIdentityLike): string[] {
  const photoVersion = resolveDealPhotoVersion(deal);
  const validPhotos = sanitizeDealPhotosForDeal(deal, filterValidPhotos(deal.photos)).map((photo) => appendPhotoVersion(photo, photoVersion));
  if (validPhotos.length > 0) {
    return validPhotos;
  }

  const fallbackPhotos = getFallbackPhotosForDeal(deal).map((photo) => appendPhotoVersion(photo, photoVersion));
  if (fallbackPhotos.length > 0) {
    console.log('[SharedJVFetch] Applied fallback photos for deal:', deal.id ?? deal.projectName ?? deal.title ?? 'unknown', '| count:', fallbackPhotos.length, '| version:', photoVersion || 'none');
  }
  return fallbackPhotos;
}

export function resolvePrimaryDealPhoto(deal: DealPhotoIdentityLike): string | undefined {
  const photos = resolveDealPhotos(deal);
  return photos[0];
}

export const QUERY_KEY_PUBLISHED_JV_DEALS = ['published-jv-deals'] as const;

import { useQuery } from '@tanstack/react-query';
import { resetSupabaseCheck } from '@/lib/jv-storage';
import { fetchCanonicalDeals, invalidateCanonicalCache, canonicalCardToParsedDeal } from '@/lib/canonical-deals';
import { getFallbackPhotosForDeal, sanitizeDealPhotosForDeal } from '@/constants/deal-photos';

export interface UsePublishedJVDealsResult {
  deals: ParsedJVDeal[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
}

export interface UsePublishedJVDealsOptions {
  enabled?: boolean;
  refetchIntervalMs?: number | false;
}

const SHARED_FETCH_TIMEOUT_MS = 10000;

let _lastManualReset = 0;

export function triggerManualJVRefresh(): void {
  _lastManualReset = Date.now();
  resetSupabaseCheck();
  invalidateCanonicalCache();
  console.log('[SharedJVFetch] Manual refresh triggered — canonical + Supabase cache reset');
}

async function fetchPublishedJVDealsShared(): Promise<{ deals: ParsedJVDeal[] }> {
  const now = Date.now();
  const isManualRefresh = (now - _lastManualReset) < 2000;
  console.log('[SharedJVFetch] Fetching via CANONICAL DEALS API (single source of truth) | manual:', isManualRefresh);

  const timeout = new Promise<{ deals: ParsedJVDeal[] }>((resolve) =>
    setTimeout(() => {
      console.log('[SharedJVFetch] Fetch timed out after', SHARED_FETCH_TIMEOUT_MS, 'ms');
      resolve({ deals: [] });
    }, SHARED_FETCH_TIMEOUT_MS)
  );

  const fetchPromise = (async (): Promise<{ deals: ParsedJVDeal[] }> => {
    const canonicalResult = await fetchCanonicalDeals(isManualRefresh);
    const parsed = canonicalResult.deals.map(card => canonicalCardToParsedDeal(card));
    console.log('[SharedJVFetch] Canonical source:', canonicalResult.source, '| deals:', parsed.length);
    return { deals: parsed };
  })();

  const result = await Promise.race([fetchPromise, timeout]);

  console.log('[SharedJVFetch] Final deal count:', result.deals.length, '| order:', result.deals.map(d => `${d.projectName}`).join(', '));
  return result;
}

export function usePublishedJVDeals(options: UsePublishedJVDealsOptions = {}): UsePublishedJVDealsResult {
  const isEnabled = options.enabled ?? true;
  const refetchInterval = isEnabled
    ? (options.refetchIntervalMs ?? SHARED_JV_DEALS_REFRESH_MS)
    : false;

  const query = useQuery({
    queryKey: [...QUERY_KEY_PUBLISHED_JV_DEALS],
    queryFn: fetchPublishedJVDealsShared,
    enabled: isEnabled,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 8000),
    staleTime: SHARED_JV_DEALS_STALE_MS,
    gcTime: SHARED_JV_DEALS_GC_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchInterval,
    refetchIntervalInBackground: false,
    placeholderData: { deals: [] as ParsedJVDeal[] },
  });

  const deals = query.data?.deals ?? [];
  const isLoading = query.isPending && !query.isPlaceholderData;

  const refetch = async (): Promise<unknown> => {
    triggerManualJVRefresh();
    return query.refetch();
  };

  return {
    deals,
    isLoading,
    isError: query.isError,
    refetch,
  };
}
