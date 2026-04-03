export interface GrowthMilestone {
  users: number;
  label: string;
  unlocks: string;
  reached: boolean;
  reachedDate?: string;
}

export interface ViralChannel {
  id: string;
  name: string;
  icon: string;
  usersAcquired: number;
  conversionRate: number;
  costPerAcquisition: number;
  trend: 'up' | 'down' | 'stable';
  trendPercent: number;
  color: string;
}

export interface GrowthMetric {
  label: string;
  value: string;
  change: number;
  period: string;
}

export interface ReferralTier {
  name: string;
  minReferrals: number;
  shareReward: number;
  cashBonus: number;
  color: string;
  perks: string[];
}

export const growthMilestones: GrowthMilestone[] = [
  { users: 1, label: 'Genesis', unlocks: 'Platform Live', reached: true, reachedDate: '2024-01-15' },
  { users: 1000, label: '1K Club', unlocks: 'Social Proof Engine', reached: false },
  { users: 10000, label: '10K Wave', unlocks: 'AI Personalization', reached: false },
  { users: 50000, label: '50K Surge', unlocks: 'Global Expansion', reached: false },
  { users: 100000, label: '100K Army', unlocks: 'Copy Investing', reached: false },
  { users: 500000, label: '500K Force', unlocks: 'Institutional Gateway', reached: false },
  { users: 1000000, label: '1M Nation', unlocks: 'IPO Readiness', reached: false },
  { users: 10000000, label: '10M Empire', unlocks: 'Global Domination', reached: false },
  { users: 100000000, label: '100M Revolution', unlocks: 'Traditional Finance Disrupted', reached: false },
];

export const viralChannels: ViralChannel[] = [
  { id: 'vc-1', name: 'Direct Referrals', icon: 'Users', usersAcquired: 0, conversionRate: 0, costPerAcquisition: 0, trend: 'stable', trendPercent: 0, color: '#FFD700' },
  { id: 'vc-2', name: 'Instagram', icon: 'Instagram', usersAcquired: 0, conversionRate: 0, costPerAcquisition: 0, trend: 'stable', trendPercent: 0, color: '#E1306C' },
  { id: 'vc-3', name: 'Google Search', icon: 'Search', usersAcquired: 0, conversionRate: 0, costPerAcquisition: 0, trend: 'stable', trendPercent: 0, color: '#4285F4' },
  { id: 'vc-4', name: 'TikTok', icon: 'Video', usersAcquired: 0, conversionRate: 0, costPerAcquisition: 0, trend: 'stable', trendPercent: 0, color: '#00F2EA' },
  { id: 'vc-5', name: 'YouTube', icon: 'Play', usersAcquired: 0, conversionRate: 0, costPerAcquisition: 0, trend: 'stable', trendPercent: 0, color: '#FF0000' },
  { id: 'vc-6', name: 'Twitter/X', icon: 'Twitter', usersAcquired: 0, conversionRate: 0, costPerAcquisition: 0, trend: 'stable', trendPercent: 0, color: '#1DA1F2' },
  { id: 'vc-7', name: 'LinkedIn', icon: 'Briefcase', usersAcquired: 0, conversionRate: 0, costPerAcquisition: 0, trend: 'stable', trendPercent: 0, color: '#0A66C2' },
  { id: 'vc-8', name: 'Email Campaigns', icon: 'Mail', usersAcquired: 0, conversionRate: 0, costPerAcquisition: 0, trend: 'stable', trendPercent: 0, color: '#22C55E' },
];

export const growthMetrics: GrowthMetric[] = [
  { label: 'Total Users', value: '0', change: 0, period: 'vs last month' },
  { label: 'Daily Active', value: '0', change: 0, period: 'vs last week' },
  { label: 'Viral Coefficient', value: '0', change: 0, period: 'K-factor' },
  { label: 'Avg Revenue/User', value: '$0', change: 0, period: 'lifetime' },
  { label: 'Retention (30d)', value: '0%', change: 0, period: 'vs benchmark' },
  { label: 'NPS Score', value: '0', change: 0, period: 'industry avg: 31' },
];

export const referralTiers: ReferralTier[] = [
  {
    name: 'Starter',
    minReferrals: 0,
    shareReward: 25,
    cashBonus: 0,
    color: '#9A9A9A',
    perks: ['$25 in shares per referral', 'Basic referral link', 'Email invitations'],
  },
  {
    name: 'Ambassador',
    minReferrals: 5,
    shareReward: 50,
    cashBonus: 25,
    color: '#4A90D9',
    perks: ['$50 in shares per referral', '$25 cash bonus', 'Custom referral page', 'Priority support'],
  },
  {
    name: 'Champion',
    minReferrals: 25,
    shareReward: 100,
    cashBonus: 50,
    color: '#FFD700',
    perks: ['$100 in shares per referral', '$50 cash bonus', 'VIP event access', 'Dedicated account manager'],
  },
  {
    name: 'Elite',
    minReferrals: 100,
    shareReward: 250,
    cashBonus: 100,
    color: '#FF6B6B',
    perks: ['$250 in shares per referral', '$100 cash bonus', 'Revenue share 0.5%', 'Board advisory seat', 'Private jet events'],
  },
];

export const projectionData = {
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  organic: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  referral: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  paid: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  total: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

export const globalReachStats = {
  countries: 0,
  languages: 0,
  currencies: 0,
  timeZones: 'All 24',
  mobileUsers: '0%',
  avgSessionTime: '0 min',
  dailyTransactions: '0',
  peakConcurrentUsers: '0',
};

export const competitorComparison = [
  { name: 'IVXHOLDINGS', users: '0', growth: '0%', yearFounded: 2024, fundingRaised: '$0 (Self-funded)', color: '#FFD700' },
];
