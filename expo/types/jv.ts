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

export interface DiscoveredLender {
  id: string;
  name: string;
  type: 'public' | 'private';
  category: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  city: string;
  state: string;
  country: string;
  description: string;
  aum: number;
  minInvestment: number;
  maxInvestment: number;
  preferredPropertyTypes: ('residential' | 'commercial' | 'mixed' | 'industrial')[];
  preferredRegions: string[];
  interestRate?: number;
  source: 'google' | 'sec_filing';
  sourceUrl: string;
  confidence: number;
  lastUpdated: string;
  tags: string[];
  imported: boolean;
}
