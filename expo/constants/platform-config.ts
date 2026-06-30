import type {
  SocialPlatform,
  TitleDocumentType,
  IPXFeeConfig,
  Influencer,
  InfluencerApplication,
} from '@/types';

export type VIPTierLevel = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface VIPTier {
  id: string;
  level: VIPTierLevel;
  name: string;
  minInvestment: number;
  maxInvestment: number | null;
  tradingFeeDiscount: number;
  earnApyBoost: number;
  earlyAccessDays: number;
  prioritySupport: boolean;
  exclusiveDeals: boolean;
  referralBonus: number;
  color: string;
  accentColor: string;
  icon: string;
  perks: string[];
}

export interface VIPProgress {
  currentTier: VIPTierLevel;
  totalInvested: number;
  nextTierThreshold: number;
  progressPercent: number;
  memberSince: string;
  pointsEarned: number;
}

export const VIP_TIERS: VIPTier[] = [
  {
    id: 'tier-bronze',
    level: 'bronze',
    name: 'Bronze',
    minInvestment: 0,
    maxInvestment: 10000,
    tradingFeeDiscount: 0,
    earnApyBoost: 0,
    earlyAccessDays: 0,
    prioritySupport: false,
    exclusiveDeals: false,
    referralBonus: 25,
    color: '#CD7F32',
    accentColor: '#E8A960',
    icon: 'shield',
    perks: [
      'Standard trading fees',
      'Base APY on IVXHOLDINGS Earn',
      '$25 referral bonus',
      'Community access',
    ],
  },
  {
    id: 'tier-silver',
    level: 'silver',
    name: 'Silver',
    minInvestment: 10000,
    maxInvestment: 50000,
    tradingFeeDiscount: 10,
    earnApyBoost: 0.5,
    earlyAccessDays: 1,
    prioritySupport: false,
    exclusiveDeals: false,
    referralBonus: 50,
    color: '#C0C0C0',
    accentColor: '#D8D8D8',
    icon: 'award',
    perks: [
      '10% lower trading fees',
      '+0.5% APY boost on Earn',
      '1-day early access to drops',
      '$50 referral bonus',
      'Monthly market insights',
    ],
  },
  {
    id: 'tier-gold',
    level: 'gold',
    name: 'Gold',
    minInvestment: 50000,
    maxInvestment: 250000,
    tradingFeeDiscount: 25,
    earnApyBoost: 1.0,
    earlyAccessDays: 3,
    prioritySupport: true,
    exclusiveDeals: true,
    referralBonus: 100,
    color: '#FFD700',
    accentColor: '#FFE44D',
    icon: 'crown',
    perks: [
      '25% lower trading fees',
      '+1.0% APY boost on Earn',
      '3-day early access to drops',
      '$100 referral bonus',
      'Priority customer support',
      'Exclusive property deals',
      'Quarterly portfolio review',
    ],
  },
  {
    id: 'tier-platinum',
    level: 'platinum',
    name: 'Platinum',
    minInvestment: 250000,
    maxInvestment: null,
    tradingFeeDiscount: 50,
    earnApyBoost: 2.0,
    earlyAccessDays: 7,
    prioritySupport: true,
    exclusiveDeals: true,
    referralBonus: 250,
    color: '#E5E4E2',
    accentColor: '#F5F5F3',
    icon: 'gem',
    perks: [
      '50% lower trading fees',
      '+2.0% APY boost on Earn',
      '7-day early access to drops',
      '$250 referral bonus',
      'Dedicated account manager',
      'First pick on exclusive deals',
      'Monthly 1-on-1 strategy call',
      'VIP events & networking',
    ],
  },
];

export const getUserVIPProgress = (totalInvested: number): VIPProgress => {
  let currentTier: VIPTierLevel = 'bronze';
  let nextTierThreshold = 10000;
  let progressPercent = 0;

  if (totalInvested >= 250000) {
    currentTier = 'platinum';
    nextTierThreshold = 250000;
    progressPercent = 100;
  } else if (totalInvested >= 50000) {
    currentTier = 'gold';
    nextTierThreshold = 250000;
    progressPercent = ((totalInvested - 50000) / (250000 - 50000)) * 100;
  } else if (totalInvested >= 10000) {
    currentTier = 'silver';
    nextTierThreshold = 50000;
    progressPercent = ((totalInvested - 10000) / (50000 - 10000)) * 100;
  } else {
    currentTier = 'bronze';
    nextTierThreshold = 10000;
    progressPercent = (totalInvested / 10000) * 100;
  }

  return {
    currentTier,
    totalInvested,
    nextTierThreshold,
    progressPercent: Math.min(progressPercent, 100),
    memberSince: '2024-01-15',
    pointsEarned: Math.floor(totalInvested * 0.1),
  };
};

export const getTierByLevel = (level: VIPTierLevel): VIPTier => {
  return VIP_TIERS.find(t => t.level === level) || VIP_TIERS[0];
};

export const IPX_HOLDING_NAME = 'IVX HOLDINGS LLC';

export const IPX_FEE_CONFIGS: IPXFeeConfig[] = [
  { id: 'fee-1', name: 'Transaction Fee', description: 'Applied to all buy/sell transactions', feeType: 'transaction', percentage: 2.5, minFee: 10, maxFee: 50000, isActive: true, appliesTo: ['buy', 'sell'], updatedAt: '2025-01-15T00:00:00Z' },
  { id: 'fee-2', name: 'Property Listing Fee', description: 'One-time fee when property is listed for fractional ownership', feeType: 'listing', percentage: 3.0, minFee: 5000, maxFee: 100000, isActive: true, appliesTo: ['listing'], updatedAt: '2025-01-15T00:00:00Z' },
  { id: 'fee-3', name: 'Management Fee', description: 'Annual management fee on total property value', feeType: 'management', percentage: 1.5, minFee: 1000, maxFee: 250000, isActive: true, appliesTo: ['dividend'], updatedAt: '2025-01-15T00:00:00Z' },
  { id: 'fee-4', name: 'Performance Fee', description: 'Fee on profits above 8% annual return', feeType: 'performance', percentage: 20.0, minFee: 0, maxFee: 500000, isActive: true, appliesTo: ['dividend'], updatedAt: '2025-01-15T00:00:00Z' },
  { id: 'fee-5', name: 'Verification Fee', description: 'Fee for deed verification, lien search, and debt review', feeType: 'verification', percentage: 0.5, minFee: 2500, maxFee: 25000, isActive: true, appliesTo: ['verification'], updatedAt: '2025-01-15T00:00:00Z' },
];

export const calculateIPXFee = (amount: number, feeType: IPXFeeConfig['feeType']): number => {
  const config = IPX_FEE_CONFIGS.find(f => f.feeType === feeType && f.isActive);
  if (!config) return 0;
  const fee = amount * (config.percentage / 100);
  return Math.max(config.minFee, Math.min(config.maxFee, fee));
};

export const calculateDemandPrice = (basePrice: number, totalShares: number, soldShares: number): number => {
  const soldPercentage = soldShares / totalShares;
  const demandMultiplier = 1 + (soldPercentage * 0.5);
  return basePrice * demandMultiplier;
};

export const PLATFORM_FEE_STRUCTURE = {
  entryFee: 2.0,
  annualManagementFee: 2.0,
  exitFee: 1.0,
  dailyTradingFee: 1.0,
  dailyTradingExitFee: 1.0,
  agentPropertyCommission: 2.0,
  agentCommissionPaidOnListing: true,
  brokerInvestorCommission: 2.0,
  brokerCommissionRecurring: true,
  brokerCommissionPaidMonthly: true,
  influencerCommission: 1.5,
  investorAnnualReturn: 10.0,
  managementFeePaidMonthly: true,
  influencerCommissionOneTime: true,
  userResponsibleForTaxes: true,
};

export interface EmailAccountConfig {
  id: string;
  email: string;
  displayName: string;
  role: string;
  avatar: string;
  color: string;
  unreadCount: number;
}

export const EMAIL_ACCOUNTS: EmailAccountConfig[] = [
  { id: 'admin', email: 'admin@ivxholding.com', displayName: 'Admin', role: 'Administrator', avatar: 'A', color: '#FFD700', unreadCount: 0 },
  { id: 'ceo', email: 'ceo@ivxholding.com', displayName: 'CEO Office', role: 'Chief Executive Officer', avatar: 'C', color: '#FF6B35', unreadCount: 0 },
  { id: 'noreply', email: 'noreply@ivxholding.com', displayName: 'No Reply', role: 'System Notifications', avatar: 'N', color: '#6A6A6A', unreadCount: 0 },
  { id: 'support', email: 'support@ivxholding.com', displayName: 'Support', role: 'Customer Support', avatar: 'S', color: '#4A90D9', unreadCount: 0 },
  { id: 'kyc', email: 'kyc@ivxholding.com', displayName: 'KYC Team', role: 'KYC Verification', avatar: 'K', color: '#22C55E', unreadCount: 0 },
  { id: 'investors', email: 'investors@ivxholding.com', displayName: 'Investor Relations', role: 'Investor Communications', avatar: 'I', color: '#9B59B6', unreadCount: 0 },
  { id: 'legal', email: 'legal@ivxholding.com', displayName: 'Legal', role: 'Legal Department', avatar: 'L', color: '#E74C3C', unreadCount: 0 },
  { id: 'finance', email: 'finance@ivxholding.com', displayName: 'Finance', role: 'Finance Department', avatar: 'F', color: '#2ECC71', unreadCount: 0 },
  { id: 'security', email: 'security@ivxholding.com', displayName: 'Security', role: 'Security Operations', avatar: 'S', color: '#E67E22', unreadCount: 0 },
];

export const EMAIL_LABELS = [
  { id: 'urgent', name: 'Urgent', color: '#FF4D4D' },
  { id: 'important', name: 'Important', color: '#FFB800' },
  { id: 'follow-up', name: 'Follow Up', color: '#4A90D9' },
  { id: 'internal', name: 'Internal', color: '#22C55E' },
  { id: 'external', name: 'External', color: '#9B59B6' },
];

export const REQUIRED_TITLE_DOCUMENTS: { type: TitleDocumentType; name: string; description: string }[] = [
  { type: 'title_insurance', name: 'Title Insurance Commitment & Policy', description: 'Document confirming the property is free of liens or issues, and the policy protecting the lender\'s interest.' },
  { type: 'alta_settlement', name: 'ALTA Settlement Statement', description: 'Detailed, itemized list of all closing costs, fees, and payments for both buyer and seller.' },
  { type: 'warranty_deed', name: 'Warranty Deed / Conveyance Documents', description: 'The legal document transferring ownership of the property.' },
  { type: 'closing_protection_letter', name: 'Closing Protection Letter (CPL)', description: 'Protects the lender against errors or dishonesty by the closing agent.' },
  { type: 'property_tax_info', name: 'Property Tax Information & Tax Certificates', description: 'Verifies status of property taxes for escrow purposes.' },
  { type: 'affidavits', name: 'Affidavits', description: 'Sworn statements, including seller no-lien affidavit and affidavits regarding property occupancy.' },
  { type: 'wire_instructions', name: 'Wire Instructions', description: 'Verified, secure instructions for transferring closing funds.' },
  { type: 'survey', name: 'Survey', description: 'Required by the lender to identify property boundaries.' },
];

export interface AssetClassPerformance {
  name: string;
  annualReturn: number;
  volatility: number;
  minInvestment: number;
  liquidity: string;
  dividendYield: number;
  inflationHedge: boolean;
  tangible: boolean;
  tradingHours: string;
  color: string;
}

export interface PlatformStat {
  label: string;
  value: string;
  subtext: string;
}

export interface TrustFeature {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: 'security' | 'legal' | 'financial' | 'insurance';
}

export interface OwnerProtection {
  id: string;
  title: string;
  description: string;
  details: string[];
  icon: string;
}

export interface SmartFeature {
  id: string;
  title: string;
  description: string;
  icon: string;
  status: 'active' | 'coming_soon';
  benefit: string;
}

export interface ReferralTier {
  name: string;
  minReferrals: number;
  shareReward: number;
  cashBonus: number;
  color: string;
  perks: string[];
}

export const REFERRAL_TIERS: ReferralTier[] = [
  { name: 'Starter', minReferrals: 0, shareReward: 25, cashBonus: 0, color: '#9A9A9A', perks: ['$25 in shares per referral', 'Basic referral link', 'Email invitations'] },
  { name: 'Ambassador', minReferrals: 5, shareReward: 50, cashBonus: 25, color: '#4A90D9', perks: ['$50 in shares per referral', '$25 cash bonus', 'Custom referral page', 'Priority support'] },
  { name: 'Champion', minReferrals: 25, shareReward: 100, cashBonus: 50, color: '#FFD700', perks: ['$100 in shares per referral', '$50 cash bonus', 'VIP event access', 'Dedicated account manager'] },
  { name: 'Elite', minReferrals: 100, shareReward: 250, cashBonus: 100, color: '#FF6B6B', perks: ['$250 in shares per referral', '$100 cash bonus', 'Revenue share 0.5%', 'Board advisory seat', 'Private jet events'] },
];

export const getPlatformIcon = (platform: SocialPlatform): string => {
  const icons: Record<SocialPlatform, string> = { instagram: '📸', facebook: '📘', twitter: '🐦', linkedin: '💼', google: '🔍', tiktok: '🎵' };
  return icons[platform];
};

export const getPlatformColor = (platform: SocialPlatform): string => {
  const colors: Record<SocialPlatform, string> = { instagram: '#E4405F', facebook: '#1877F2', twitter: '#1DA1F2', linkedin: '#0A66C2', google: '#4285F4', tiktok: '#000000' };
  return colors[platform];
};

export const generateReferralCode = (name: string): string => {
  const cleanName = name.split(' ')[0].toUpperCase();
  return `${cleanName}${Math.floor(Math.random() * 1000)}`;
};

export const getTierColor = (tier: Influencer['tier']): string => {
  const colors = { micro: '#6B7280', mid: '#3B82F6', macro: '#8B5CF6', mega: '#F59E0B' };
  return colors[tier];
};

export const getStatusColor = (status: Influencer['status']): string => {
  const colors = { active: '#22C55E', paused: '#F59E0B', pending: '#6B7280', terminated: '#EF4444' };
  return colors[status];
};

export const getApplicationStatusColor = (status: InfluencerApplication['status']): string => {
  const colors = { pending: '#F59E0B', approved: '#22C55E', rejected: '#EF4444' };
  return colors[status];
};

export const getSourceLabel = (source: InfluencerApplication['source']): string => {
  const labels = { app_search: 'App Search', referral: 'Referral', social_media: 'Social Media', website: 'Website' };
  return labels[source];
};

export const generateTrackableLink = (name: string, source: 'social' | 'email' | 'influencer' | 'ad' | 'direct' | 'referral', platform?: SocialPlatform) => {
  const shortCode = `ipx-${Date.now().toString(36)}`;
  const params = new URLSearchParams({ ref: shortCode, utm_source: platform || source, utm_medium: source });
  const fullUrl = `https://ipxholding.com/join?${params.toString()}`;
  return {
    id: `link-${Date.now()}`, name, shortCode, fullUrl,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(fullUrl)}`,
    source, platform, status: 'active' as const, createdAt: new Date().toISOString(),
    stats: { totalClicks: 0, uniqueClicks: 0, downloads: 0, registrations: 0, investments: 0, investmentAmount: 0, conversionRate: 0, clickThroughRate: 0 },
  };
};

export const ADMIN_ROLES = [
  { id: 'role-ceo', name: 'CEO', type: 'ceo' as const, description: 'Full access to all admin features. Can manage team members and assign roles.', permissions: ['manage_members' as const, 'manage_transactions' as const, 'manage_properties' as const, 'manage_kyc' as const, 'manage_support' as const, 'view_analytics' as const], isSystemRole: true },
  { id: 'role-manager', name: 'Manager', type: 'manager' as const, description: 'Can manage members, properties, and view analytics. Cannot manage team.', permissions: ['manage_members' as const, 'manage_properties' as const, 'manage_kyc' as const, 'view_analytics' as const], isSystemRole: true },
  { id: 'role-analyst', name: 'Analyst', type: 'analyst' as const, description: 'Can view analytics and member data. Read-only access.', permissions: ['view_analytics' as const], isSystemRole: true },
  { id: 'role-support', name: 'Support Agent', type: 'support' as const, description: 'Can manage support tickets and view member information.', permissions: ['manage_support' as const, 'manage_kyc' as const], isSystemRole: true },
  { id: 'role-viewer', name: 'Viewer', type: 'viewer' as const, description: 'Read-only access to dashboard and reports.', permissions: ['view_analytics' as const], isSystemRole: true },
];

export const BROADCAST_TEMPLATES = [
  { id: 'tpl-1', name: 'Welcome New Member', subject: 'Welcome to IVX HOLDINGS - Start Your Investment Journey', body: 'Dear {{name}},\n\nWelcome to IVX HOLDINGS!...', category: 'welcome' as const },
  { id: 'tpl-2', name: 'Re-engagement Campaign', subject: 'We Miss You! Exclusive Properties Await', body: 'Hi {{name}},\n\nIt\'s been a while...', category: 'reengagement' as const },
  { id: 'tpl-3', name: 'New Property Alert', subject: 'New Investment Opportunity: {{property_name}}', body: 'Dear {{name}},\n\nWe\'re excited to announce...', category: 'promotion' as const },
  { id: 'tpl-4', name: 'Dividend Distribution', subject: 'Your Dividend Payment Has Been Processed', body: 'Dear {{name}},\n\nGreat news! Your dividend...', category: 'update' as const },
  { id: 'tpl-5', name: 'KYC Reminder', subject: 'Complete Your KYC to Start Investing', body: 'Hi {{name}},\n\nYour account is almost ready...', category: 'reminder' as const },
];

export const FEE_CONFIGURATIONS = [
  { id: 'fee-buy', type: 'buy' as const, name: 'Daily Trading Fee (Buy)', percentage: 1.0, minFee: 0.50, maxFee: 500.00, isActive: true, updatedAt: '2025-01-15T10:00:00Z' },
  { id: 'fee-sell', type: 'sell' as const, name: 'Daily Trading Fee (Sell/Exit)', percentage: 1.0, minFee: 0.50, maxFee: 500.00, isActive: true, updatedAt: '2025-01-15T10:00:00Z' },
  { id: 'fee-withdrawal', type: 'withdrawal' as const, name: 'Withdrawal Fee', percentage: 0.0, minFee: 0.00, maxFee: 0.00, isActive: false, updatedAt: '2025-01-15T10:00:00Z' },
  { id: 'fee-deposit', type: 'deposit' as const, name: 'Deposit Fee', percentage: 0.0, minFee: 0.00, maxFee: 0.00, isActive: false, updatedAt: '2025-01-15T10:00:00Z' },
];

export const ASSET_CLASS_COMPARISON: AssetClassPerformance[] = [
  { name: 'IVXHOLDINGS Real Estate', annualReturn: 14.5, volatility: 8.2, minInvestment: 1, liquidity: 'Instant (24/7)', dividendYield: 7.2, inflationHedge: true, tangible: true, tradingHours: '24/7/365', color: '#FFD700' },
  { name: 'S&P 500', annualReturn: 10.3, volatility: 15.6, minInvestment: 500, liquidity: 'T+2 Settlement', dividendYield: 1.5, inflationHedge: false, tangible: false, tradingHours: 'Mon-Fri 9:30-4:00', color: '#4A90D9' },
  { name: 'US Bonds', annualReturn: 4.2, volatility: 5.1, minInvestment: 1000, liquidity: 'Varies', dividendYield: 4.2, inflationHedge: false, tangible: false, tradingHours: 'Mon-Fri', color: '#9A9A9A' },
  { name: 'Savings Account', annualReturn: 4.5, volatility: 0, minInvestment: 0, liquidity: 'Instant', dividendYield: 4.5, inflationHedge: false, tangible: false, tradingHours: 'Anytime', color: '#6A6A6A' },
  { name: 'Bitcoin', annualReturn: 28.5, volatility: 62.4, minInvestment: 1, liquidity: 'Instant (24/7)', dividendYield: 0, inflationHedge: false, tangible: false, tradingHours: '24/7/365', color: '#F7931A' },
  { name: 'Traditional RE', annualReturn: 8.6, volatility: 12.3, minInvestment: 50000, liquidity: '3-6 months', dividendYield: 4.8, inflationHedge: true, tangible: true, tradingHours: 'N/A', color: '#22C55E' },
];

export const PLATFORM_STATS: PlatformStat[] = [
  { label: 'Total Investors', value: 'Growing', subtext: 'Global community' },
  { label: 'Properties Listed', value: '6', subtext: 'Premium global assets' },
  { label: 'Target Return', value: '8-14%', subtext: 'Annual yield range' },
  { label: 'Distributions', value: 'Quarterly', subtext: 'Automatic payouts' },
  { label: 'Platform', value: '24/7', subtext: 'Always available' },
  { label: 'Uptime', value: '99.99%', subtext: 'Zero trading downtime' },
];

export const TRUST_FEATURES: TrustFeature[] = [
  { id: 'tf-1', title: 'First Lien Position', description: 'Every tokenized property is backed by a first lien mortgage, giving investors the highest priority claim on the asset.', icon: 'Shield', category: 'legal' },
  { id: 'tf-2', title: 'SEC-Compliant Structure', description: 'All offerings are structured under Regulation D/A+ exemptions, fully compliant with U.S. Securities and Exchange Commission.', icon: 'Scale', category: 'legal' },
  { id: 'tf-3', title: 'Bank-Grade Encryption', description: 'AES-256 encryption for all data, TLS 1.3 for transfers, and hardware security modules for key management.', icon: 'Lock', category: 'security' },
  { id: 'tf-4', title: 'Title Insurance Protection', description: 'Every property carries comprehensive title insurance from A-rated carriers, protecting against ownership disputes.', icon: 'FileCheck', category: 'insurance' },
  { id: 'tf-5', title: 'Independent Appraisals', description: 'All properties undergo MAI-certified independent appraisals before tokenization. Values verified by 3rd party.', icon: 'Search', category: 'financial' },
  { id: 'tf-6', title: 'Escrow Protection', description: 'All investor funds held in escrow-protected accounts at major banking institutions until property closes.', icon: 'Vault', category: 'financial' },
  { id: 'tf-7', title: 'Annual Audits', description: 'Big Four accounting firm performs annual audits of all property financials and investor distributions.', icon: 'ClipboardCheck', category: 'financial' },
  { id: 'tf-8', title: 'Property Insurance', description: 'Full replacement cost insurance on every property, including natural disaster and liability coverage.', icon: 'ShieldCheck', category: 'insurance' },
  { id: 'tf-9', title: 'Multi-Factor Authentication', description: 'Biometric login, SMS verification, and hardware key support protect your account from unauthorized access.', icon: 'Fingerprint', category: 'security' },
  { id: 'tf-10', title: 'Cold Storage Reserves', description: '95% of digital assets stored in air-gapped cold storage with multi-signature authorization requirements.', icon: 'Database', category: 'security' },
];

export const OWNER_PROTECTIONS: OwnerProtection[] = [
  { id: 'op-1', title: 'Equity Preservation', description: 'Property owners retain majority equity stake while unlocking liquidity through tokenization.', details: ['Owner retains 85% equity in the property', 'Only 12.5% offered to fractional investors', 'IVXHOLDINGS takes 2.5% as service fee', 'Owner can buy back shares at any time at market price'], icon: 'PiggyBank' },
  { id: 'op-2', title: 'Legal Title Protection', description: 'Your property title remains in your name. IVXHOLDINGS holds a mortgage lien, not ownership.', details: ['Warranty deed stays in owner\'s name', 'First lien mortgage recorded (not ownership transfer)', 'Title insurance protects against disputes', 'Closing Protection Letter (CPL) from title company', 'Owner retains all property rights and usage'], icon: 'FileText' },
  { id: 'op-3', title: 'Transparent Valuation', description: 'Every property goes through a 4-step independent valuation before any shares are created.', details: ['MAI-certified appraiser provides initial value', 'Second opinion from comparable market analysis', 'AI-powered valuation model cross-references', 'Final value approved by investment committee', 'Owner can dispute and request re-appraisal'], icon: 'Calculator' },
  { id: 'op-4', title: 'Exit Flexibility', description: 'Multiple exit strategies available. You are never locked in permanently.', details: ['Buy back fractional shares from the market', 'Refinance to pay off the IVXHOLDINGS mortgage', 'Sell the entire property (investors paid from proceeds)', 'Transfer ownership with IVXHOLDINGS mortgage assumption', 'No prepayment penalties after 12 months'], icon: 'ArrowRightLeft' },
  { id: 'op-5', title: 'Revenue Sharing', description: 'Owners earn ongoing income from their tokenized property.', details: ['Rental income distributed proportionally', 'Owner\'s 85% share paid monthly', 'Automatic direct deposit to linked bank', 'Transparent fee breakdown every month', 'Tax documents provided annually (1099)'], icon: 'Banknote' },
  { id: 'op-6', title: 'Privacy & Data Protection', description: 'Owner personal information is never shared with investors or public markets.', details: ['Investor sees property details, not owner identity', 'Personal data encrypted and stored separately', 'GDPR and CCPA compliant data handling', 'Owner controls what information is public', 'Right to erasure if property is delisted'], icon: 'Eye' },
];

export const SMART_FEATURES: SmartFeature[] = [
  { id: 'sf-1', title: 'AI Portfolio Optimizer', description: 'Machine learning analyzes your portfolio and suggests rebalancing across properties, regions, and risk levels.', icon: 'Brain', status: 'active', benefit: 'Avg +3.2% better returns' },
  { id: 'sf-2', title: 'Smart Auto-Invest', description: 'Set your criteria once — budget, risk level, yield target — and we automatically invest when matching properties appear.', icon: 'Zap', status: 'active', benefit: 'Never miss an opportunity' },
  { id: 'sf-3', title: 'Predictive Market Alerts', description: 'AI monitors 200+ signals including interest rates, rental demand, and migration patterns to predict price movements.', icon: 'Bell', status: 'active', benefit: 'Avg 48hr early warning' },
  { id: 'sf-4', title: 'Risk Intelligence Score', description: 'Proprietary scoring system evaluates every property across 87 risk factors including climate, economic, and market risks.', icon: 'Activity', status: 'active', benefit: 'Quantified risk assessment' },
  { id: 'sf-5', title: 'Dividend Reinvestment (DRIP)', description: 'Automatically reinvest your dividend income into more property shares for compound growth.', icon: 'RefreshCw', status: 'active', benefit: '+2.8% compound growth' },
  { id: 'sf-6', title: 'Tax-Loss Harvesting', description: 'AI identifies opportunities to sell underperforming shares to offset capital gains from profitable ones.', icon: 'Receipt', status: 'coming_soon', benefit: 'Save up to 30% on taxes' },
  { id: 'sf-7', title: 'Social Trading', description: 'Follow top-performing investors and mirror their portfolio allocation with one tap.', icon: 'Users', status: 'coming_soon', benefit: 'Learn from the best' },
  { id: 'sf-8', title: 'Goal-Based Investing', description: 'Set financial goals — retirement, passive income, college fund — and AI builds a custom property portfolio.', icon: 'Target', status: 'coming_soon', benefit: 'Personalized strategy' },
];

export const RETURN_PROJECTIONS = {
  conservative: { annual: 8.5, fiveYear: 50.4, tenYear: 127.8 },
  moderate: { annual: 12.2, fiveYear: 78.5, tenYear: 216.4 },
  aggressive: { annual: 16.8, fiveYear: 118.2, tenYear: 372.6 },
};

export const GLOBAL_PRESENCE = [
  { country: 'United States', properties: 1, totalValue: '$25M' },
  { country: 'UAE', properties: 1, totalValue: '$5.2M' },
  { country: 'United Kingdom', properties: 1, totalValue: '$11.8M' },
  { country: 'Japan', properties: 1, totalValue: '$12.2M' },
  { country: 'Singapore', properties: 1, totalValue: '$11.4M' },
  { country: 'France', properties: 1, totalValue: '$14.8M' },
];

export const IPX_MORTGAGE_STRATEGY = {
  name: 'IVXHOLDINGS Tokenized Mortgage',
  description: 'Property owners bring clean (debt-free) properties. IVXHOLDINGS-LUXURY-HOLDINGS LLC provides 85% LTV financing, records a first lien mortgage, and tokenizes it for investors to purchase 24/7.',
  ltvPercent: 0.85,
  closingCostPercent: 0.03,
  ipxOriginationFee: 0.025,
  mortgageInterestRate: 7.5,
  mortgageTermMonths: 360,
  transactionFee: 0.025,
  managementFee: 0.01,
};

export const SHARE_TRADING_CONFIG = {
  initialPrice: 1.00,
  ltvPercent: 85,
  ipxFeePercent: 2.5,
  closingCostPercent: 3,
  tradingFeePercent: 1,
  minPurchase: 1,
  tradingHours: '24/7',
  resellDelay: 'Instant',
};

export const WORLD_STATS = {
  totalSmartphones: 6800000000,
  totalInternetUsers: 5350000000,
  socialMediaUsers: 4950000000,
  monthlyAppDownloads: 14200000000,
  dailyGoogleSearches: 8500000000,
  instagramDailyActive: 2000000000,
  tiktokDailyActive: 1500000000,
  facebookDailyActive: 2100000000,
  youtubeDailyActive: 2700000000,
  whatsappDailyActive: 2400000000,
};
