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

export const assetClassComparison: AssetClassPerformance[] = [
  {
    name: 'IVXHOLDINGS Real Estate',
    annualReturn: 14.5,
    volatility: 8.2,
    minInvestment: 1,
    liquidity: 'Instant (24/7)',
    dividendYield: 7.2,
    inflationHedge: true,
    tangible: true,
    tradingHours: '24/7/365',
    color: '#FFD700',
  },
  {
    name: 'S&P 500',
    annualReturn: 10.3,
    volatility: 15.6,
    minInvestment: 500,
    liquidity: 'T+2 Settlement',
    dividendYield: 1.5,
    inflationHedge: false,
    tangible: false,
    tradingHours: 'Mon-Fri 9:30-4:00',
    color: '#4A90D9',
  },
  {
    name: 'US Bonds',
    annualReturn: 4.2,
    volatility: 5.1,
    minInvestment: 1000,
    liquidity: 'Varies',
    dividendYield: 4.2,
    inflationHedge: false,
    tangible: false,
    tradingHours: 'Mon-Fri',
    color: '#9A9A9A',
  },
  {
    name: 'Savings Account',
    annualReturn: 4.5,
    volatility: 0,
    minInvestment: 0,
    liquidity: 'Instant',
    dividendYield: 4.5,
    inflationHedge: false,
    tangible: false,
    tradingHours: 'Anytime',
    color: '#6A6A6A',
  },
  {
    name: 'Bitcoin',
    annualReturn: 28.5,
    volatility: 62.4,
    minInvestment: 1,
    liquidity: 'Instant (24/7)',
    dividendYield: 0,
    inflationHedge: false,
    tangible: false,
    tradingHours: '24/7/365',
    color: '#F7931A',
  },
  {
    name: 'Traditional RE',
    annualReturn: 8.6,
    volatility: 12.3,
    minInvestment: 50000,
    liquidity: '3-6 months',
    dividendYield: 4.8,
    inflationHedge: true,
    tangible: true,
    tradingHours: 'N/A',
    color: '#22C55E',
  },
];

export const platformStats: PlatformStat[] = [
  { label: 'Total Investors', value: 'Growing', subtext: 'Global community' },
  { label: 'Properties Listed', value: '6', subtext: 'Premium global assets' },
  { label: 'Target Return', value: '8-14%', subtext: 'Annual yield range' },
  { label: 'Distributions', value: 'Quarterly', subtext: 'Automatic payouts' },
  { label: 'Platform', value: '24/7', subtext: 'Always available' },
  { label: 'Uptime', value: '99.99%', subtext: 'Zero trading downtime' },
];

export const trustFeatures: TrustFeature[] = [
  {
    id: 'tf-1',
    title: 'First Lien Position',
    description: 'Every tokenized property is backed by a first lien mortgage, giving investors the highest priority claim on the asset.',
    icon: 'Shield',
    category: 'legal',
  },
  {
    id: 'tf-2',
    title: 'SEC-Compliant Structure',
    description: 'All offerings are structured under Regulation D/A+ exemptions, fully compliant with U.S. Securities and Exchange Commission.',
    icon: 'Scale',
    category: 'legal',
  },
  {
    id: 'tf-3',
    title: 'Bank-Grade Encryption',
    description: 'AES-256 encryption for all data, TLS 1.3 for transfers, and hardware security modules for key management.',
    icon: 'Lock',
    category: 'security',
  },
  {
    id: 'tf-4',
    title: 'Title Insurance Protection',
    description: 'Every property carries comprehensive title insurance from A-rated carriers, protecting against ownership disputes.',
    icon: 'FileCheck',
    category: 'insurance',
  },
  {
    id: 'tf-5',
    title: 'Independent Appraisals',
    description: 'All properties undergo MAI-certified independent appraisals before tokenization. Values verified by 3rd party.',
    icon: 'Search',
    category: 'financial',
  },
  {
    id: 'tf-6',
    title: 'Escrow Protection',
    description: 'All investor funds held in escrow-protected accounts at major banking institutions until property closes.',
    icon: 'Vault',
    category: 'financial',
  },
  {
    id: 'tf-7',
    title: 'Annual Audits',
    description: 'Big Four accounting firm performs annual audits of all property financials and investor distributions.',
    icon: 'ClipboardCheck',
    category: 'financial',
  },
  {
    id: 'tf-8',
    title: 'Property Insurance',
    description: 'Full replacement cost insurance on every property, including natural disaster and liability coverage.',
    icon: 'ShieldCheck',
    category: 'insurance',
  },
  {
    id: 'tf-9',
    title: 'Multi-Factor Authentication',
    description: 'Biometric login, SMS verification, and hardware key support protect your account from unauthorized access.',
    icon: 'Fingerprint',
    category: 'security',
  },
  {
    id: 'tf-10',
    title: 'Cold Storage Reserves',
    description: '95% of digital assets stored in air-gapped cold storage with multi-signature authorization requirements.',
    icon: 'Database',
    category: 'security',
  },
];

export const ownerProtections: OwnerProtection[] = [
  {
    id: 'op-1',
    title: 'Equity Preservation',
    description: 'Property owners retain majority equity stake while unlocking liquidity through tokenization.',
    details: [
      'Owner retains 85% equity in the property',
      'Only 12.5% offered to fractional investors',
      'IVXHOLDINGS takes 2.5% as service fee',
      'Owner can buy back shares at any time at market price',
    ],
    icon: 'PiggyBank',
  },
  {
    id: 'op-2',
    title: 'Legal Title Protection',
    description: 'Your property title remains in your name. IVXHOLDINGS holds a mortgage lien, not ownership.',
    details: [
      'Warranty deed stays in owner\'s name',
      'First lien mortgage recorded (not ownership transfer)',
      'Title insurance protects against disputes',
      'Closing Protection Letter (CPL) from title company',
      'Owner retains all property rights and usage',
    ],
    icon: 'FileText',
  },
  {
    id: 'op-3',
    title: 'Transparent Valuation',
    description: 'Every property goes through a 4-step independent valuation before any shares are created.',
    details: [
      'MAI-certified appraiser provides initial value',
      'Second opinion from comparable market analysis',
      'AI-powered valuation model cross-references',
      'Final value approved by investment committee',
      'Owner can dispute and request re-appraisal',
    ],
    icon: 'Calculator',
  },
  {
    id: 'op-4',
    title: 'Exit Flexibility',
    description: 'Multiple exit strategies available. You are never locked in permanently.',
    details: [
      'Buy back fractional shares from the market',
      'Refinance to pay off the IVXHOLDINGS mortgage',
      'Sell the entire property (investors paid from proceeds)',
      'Transfer ownership with IVXHOLDINGS mortgage assumption',
      'No prepayment penalties after 12 months',
    ],
    icon: 'ArrowRightLeft',
  },
  {
    id: 'op-5',
    title: 'Revenue Sharing',
    description: 'Owners earn ongoing income from their tokenized property.',
    details: [
      'Rental income distributed proportionally',
      'Owner\'s 85% share paid monthly',
      'Automatic direct deposit to linked bank',
      'Transparent fee breakdown every month',
      'Tax documents provided annually (1099)',
    ],
    icon: 'Banknote',
  },
  {
    id: 'op-6',
    title: 'Privacy & Data Protection',
    description: 'Owner personal information is never shared with investors or public markets.',
    details: [
      'Investor sees property details, not owner identity',
      'Personal data encrypted and stored separately',
      'GDPR and CCPA compliant data handling',
      'Owner controls what information is public',
      'Right to erasure if property is delisted',
    ],
    icon: 'Eye',
  },
];

export const smartFeatures: SmartFeature[] = [
  {
    id: 'sf-1',
    title: 'AI Portfolio Optimizer',
    description: 'Machine learning analyzes your portfolio and suggests rebalancing across properties, regions, and risk levels.',
    icon: 'Brain',
    status: 'active',
    benefit: 'Avg +3.2% better returns',
  },
  {
    id: 'sf-2',
    title: 'Smart Auto-Invest',
    description: 'Set your criteria once — budget, risk level, yield target — and we automatically invest when matching properties appear.',
    icon: 'Zap',
    status: 'active',
    benefit: 'Never miss an opportunity',
  },
  {
    id: 'sf-3',
    title: 'Predictive Market Alerts',
    description: 'AI monitors 200+ signals including interest rates, rental demand, and migration patterns to predict price movements.',
    icon: 'Bell',
    status: 'active',
    benefit: 'Avg 48hr early warning',
  },
  {
    id: 'sf-4',
    title: 'Risk Intelligence Score',
    description: 'Proprietary scoring system evaluates every property across 87 risk factors including climate, economic, and market risks.',
    icon: 'Activity',
    status: 'active',
    benefit: 'Quantified risk assessment',
  },
  {
    id: 'sf-5',
    title: 'Dividend Reinvestment (DRIP)',
    description: 'Automatically reinvest your dividend income into more property shares for compound growth.',
    icon: 'RefreshCw',
    status: 'active',
    benefit: '+2.8% compound growth',
  },
  {
    id: 'sf-6',
    title: 'Tax-Loss Harvesting',
    description: 'AI identifies opportunities to sell underperforming shares to offset capital gains from profitable ones.',
    icon: 'Receipt',
    status: 'coming_soon',
    benefit: 'Save up to 30% on taxes',
  },
  {
    id: 'sf-7',
    title: 'Social Trading',
    description: 'Follow top-performing investors and mirror their portfolio allocation with one tap.',
    icon: 'Users',
    status: 'coming_soon',
    benefit: 'Learn from the best',
  },
  {
    id: 'sf-8',
    title: 'Goal-Based Investing',
    description: 'Set financial goals — retirement, passive income, college fund — and AI builds a custom property portfolio.',
    icon: 'Target',
    status: 'coming_soon',
    benefit: 'Personalized strategy',
  },
];

export const returnProjections = {
  conservative: { annual: 8.5, fiveYear: 50.4, tenYear: 127.8 },
  moderate: { annual: 12.2, fiveYear: 78.5, tenYear: 216.4 },
  aggressive: { annual: 16.8, fiveYear: 118.2, tenYear: 372.6 },
};

export const globalPresence = [
  { country: 'United States', properties: 1, totalValue: '$25M' },
  { country: 'UAE', properties: 1, totalValue: '$5.2M' },
  { country: 'United Kingdom', properties: 1, totalValue: '$11.8M' },
  { country: 'Japan', properties: 1, totalValue: '$12.2M' },
  { country: 'Singapore', properties: 1, totalValue: '$11.4M' },
  { country: 'France', properties: 1, totalValue: '$14.8M' },
];
