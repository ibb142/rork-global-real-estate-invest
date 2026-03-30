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

export interface ParsedJVDeal {
  id: string;
  title: string;
  projectName: string;
  type: string;
  expectedROI: number;
  totalInvestment: number;
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

function safeJsonParse(val: unknown, fallback: unknown = []): unknown {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return val;
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
  let photos = safeJsonParse(d.photos, []);
  if (!Array.isArray(photos)) photos = [];
  photos = (photos as string[]).filter(
    (p: string) => typeof p === 'string' && p.length > 5 && (p.startsWith('http') || p.startsWith('data:image/')) && !isPlaceholderPhoto(p)
  );

  if ((photos as string[]).length === 0) {
    try {
      const { getFallbackPhotosForDeal } = require('@/constants/deal-photos');
      const fallback = getFallbackPhotosForDeal({
        title: (d.title || '') as string,
        projectName: (d.projectName || d.project_name || '') as string,
      });
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

  const projectName = (d.projectName || d.project_name || '') as string;

  let trustInfo = safeJsonParse(d.trustInfo ?? d.trust_info, undefined);
  if (trustInfo !== undefined && typeof trustInfo !== 'object') {
    trustInfo = undefined;
  }

  return {
    ...d,
    photos: photos as string[],
    partners: partners as ParsedJVDealPartner[] | number,
    poolTiers: poolTiers as ParsedJVDealPoolTier[] | undefined,
    trustInfo: trustInfo as DealTrustInfo | undefined,
    projectName,
    propertyAddress: (d.propertyAddress || d.property_address || '') as string,
    city: (d.city || '') as string,
    state: (d.state || '') as string,
    country: (d.country || '') as string,
    totalInvestment: Number(d.totalInvestment || d.total_investment || 0),
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
  if (p.startsWith('data:image/')) return true;
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

export const QUERY_KEY_PUBLISHED_JV_DEALS = ['published-jv-deals'] as const;

import { useQuery } from '@tanstack/react-query';
import { resetSupabaseCheck } from '@/lib/jv-storage';
import { fetchCanonicalDeals, invalidateCanonicalCache, canonicalCardToParsedDeal } from '@/lib/canonical-deals';

export interface UsePublishedJVDealsResult {
  deals: ParsedJVDeal[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
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

export function usePublishedJVDeals(): UsePublishedJVDealsResult {
  const query = useQuery({
    queryKey: [...QUERY_KEY_PUBLISHED_JV_DEALS],
    queryFn: fetchPublishedJVDealsShared,
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 8000),
    staleTime: 1000 * 60 * 2,
    gcTime: 1000 * 60 * 10,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: false,
    placeholderData: { deals: [] as ParsedJVDeal[] },
  });

  const deals = query.data?.deals ?? [];
  const isLoading = query.isPending && !query.isPlaceholderData;

  return {
    deals,
    isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
