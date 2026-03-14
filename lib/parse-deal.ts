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

export function parseDeal(d: Record<string, unknown>): ParsedJVDeal {
  let photos = safeJsonParse(d.photos, []);
  if (!Array.isArray(photos)) photos = [];
  photos = (photos as string[]).filter(
    (p: string) => typeof p === 'string' && p.length > 5 && (p.startsWith('http') || p.startsWith('data:image/'))
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

export const QUERY_KEY_PUBLISHED_JV_DEALS = ['published-jv-deals'] as const;
