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

  return {
    ...d,
    photos: photos as string[],
    partners: partners as ParsedJVDealPartner[] | number,
    poolTiers: poolTiers as ParsedJVDealPoolTier[] | undefined,
    projectName,
    propertyAddress: (d.propertyAddress || d.property_address || '') as string,
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
