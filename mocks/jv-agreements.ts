export interface JVPartner {
  id: string;
  name: string;
  role: 'lp' | 'silent' | 'co_investor';
  contribution: number;
  equityShare: number;
  avatar?: string;
  location: string;
  verified: boolean;
}

export interface PoolTier {
  id: string;
  label: string;
  type: 'jv_direct' | 'token_shares' | 'private_lending' | 'open';
  targetAmount: number;
  minInvestment: number;
  maxInvestors?: number;
  currentRaised: number;
  investorCount: number;
  status: 'open' | 'closed' | 'filled';
}

export interface JVAgreement {
  id: string;
  title: string;
  projectName: string;
  status: 'draft' | 'pending_review' | 'active' | 'completed' | 'expired';
  type: 'equity_split' | 'profit_sharing' | 'hybrid' | 'development';
  totalInvestment: number;
  currency: string;
  partners: JVPartner[];
  profitSplit: { partnerId: string; percentage: number }[];
  poolTiers?: PoolTier[];
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt?: string;
  propertyAddress?: string;
  expectedROI: number;
  distributionFrequency: 'monthly' | 'quarterly' | 'annually' | 'at_exit';
  exitStrategy: string;
  governingLaw: string;
  disputeResolution: string;
  confidentialityPeriod: number;
  nonCompetePeriod: number;
  managementFee: number;
  performanceFee: number;
  minimumHoldPeriod: number;
  description: string;
  photos?: string[];
  published?: boolean;
  publishedAt?: string | null;
  createdBy?: string;
}

export const JV_AGREEMENT_TYPES = [
  { id: 'equity_split', label: 'Equity Split', icon: '📊', desc: 'Partners share ownership proportional to contribution', color: '#4A90D9' },
  { id: 'profit_sharing', label: 'Profit Sharing', icon: '💰', desc: 'Fixed returns based on profit distribution schedule', color: '#00C48C' },
  { id: 'hybrid', label: 'Hybrid Structure', icon: '🔄', desc: 'Combined equity + profit sharing arrangement', color: '#E879F9' },
  { id: 'development', label: 'Development JV', icon: '📋', desc: 'Joint development with milestone-based payouts', color: '#FFD700' },
] as const;

export const EXIT_STRATEGIES = [
  'Sale of Property',
  'Refinance & Cash Out',
  'Buyout by Lead Partner',
  'IPO / Tokenization',
  'Hold & Distribute',
  'Third Party Sale',
] as const;

export const DISTRIBUTION_FREQUENCIES = [
  { id: 'monthly', label: 'Monthly' },
  { id: 'quarterly', label: 'Quarterly' },
  { id: 'annually', label: 'Annually' },
  { id: 'at_exit', label: 'At Exit' },
] as const;

export const SAMPLE_JV_AGREEMENTS: JVAgreement[] = [];

export const JV_CLAUSES = {
  capital_call: {
    title: 'Capital Call Rights',
    description: 'Managing partner may issue capital calls with 30-day notice for approved expenditures.',
  },
  drag_along: {
    title: 'Drag-Along Rights',
    description: 'Partners holding 75%+ equity may compel remaining partners to join a sale.',
  },
  tag_along: {
    title: 'Tag-Along Rights',
    description: 'Minority partners can join any sale on the same terms as the selling partner.',
  },
  preemptive: {
    title: 'Pre-emptive Rights',
    description: 'Existing partners have first right to purchase shares before external sales.',
  },
  deadlock: {
    title: 'Deadlock Resolution',
    description: 'In case of deadlock, parties shall engage mediator before arbitration.',
  },
  force_majeure: {
    title: 'Force Majeure',
    description: 'Neither party liable for delays caused by events beyond reasonable control.',
  },
  anti_dilution: {
    title: 'Anti-Dilution Protection',
    description: 'Partners protected against equity dilution from future capital raises.',
  },
  waterfall: {
    title: 'Waterfall Distribution',
    description: 'Returns distributed in priority: 1) Return of capital, 2) Preferred return, 3) Promote split.',
  },
};
