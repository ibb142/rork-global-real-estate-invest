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
  { users: 1000, label: '1K Club', unlocks: 'Social Proof Engine', reached: true, reachedDate: '2024-06-20' },
  { users: 10000, label: '10K Wave', unlocks: 'AI Personalization', reached: true, reachedDate: '2024-11-08' },
  { users: 50000, label: '50K Surge', unlocks: 'Global Expansion', reached: false },
  { users: 100000, label: '100K Army', unlocks: 'Copy Investing', reached: false },
  { users: 500000, label: '500K Force', unlocks: 'Institutional Gateway', reached: false },
  { users: 1000000, label: '1M Nation', unlocks: 'IPO Readiness', reached: false },
  { users: 10000000, label: '10M Empire', unlocks: 'Global Domination', reached: false },
  { users: 100000000, label: '100M Revolution', unlocks: 'Traditional Finance Disrupted', reached: false },
];

export const viralChannels: ViralChannel[] = [
  { id: 'vc-1', name: 'Direct Referrals', icon: 'Users', usersAcquired: 12480, conversionRate: 34.2, costPerAcquisition: 0, trend: 'up', trendPercent: 18.5, color: '#FFD700' },
  { id: 'vc-2', name: 'Instagram', icon: 'Instagram', usersAcquired: 8920, conversionRate: 12.8, costPerAcquisition: 2.40, trend: 'up', trendPercent: 24.1, color: '#E1306C' },
  { id: 'vc-3', name: 'Google Search', icon: 'Search', usersAcquired: 7650, conversionRate: 8.4, costPerAcquisition: 4.80, trend: 'up', trendPercent: 11.3, color: '#4285F4' },
  { id: 'vc-4', name: 'TikTok', icon: 'Video', usersAcquired: 6340, conversionRate: 6.2, costPerAcquisition: 1.90, trend: 'up', trendPercent: 42.7, color: '#00F2EA' },
  { id: 'vc-5', name: 'YouTube', icon: 'Play', usersAcquired: 4280, conversionRate: 9.1, costPerAcquisition: 3.20, trend: 'stable', trendPercent: 2.1, color: '#FF0000' },
  { id: 'vc-6', name: 'Twitter/X', icon: 'Twitter', usersAcquired: 3910, conversionRate: 5.6, costPerAcquisition: 3.80, trend: 'up', trendPercent: 8.9, color: '#1DA1F2' },
  { id: 'vc-7', name: 'LinkedIn', icon: 'Briefcase', usersAcquired: 2840, conversionRate: 15.4, costPerAcquisition: 6.50, trend: 'up', trendPercent: 14.2, color: '#0A66C2' },
  { id: 'vc-8', name: 'Email Campaigns', icon: 'Mail', usersAcquired: 2160, conversionRate: 22.1, costPerAcquisition: 0.80, trend: 'stable', trendPercent: 3.4, color: '#00C48C' },
];

export const growthMetrics: GrowthMetric[] = [
  { label: 'Total Users', value: '47,832', change: 12.4, period: 'vs last month' },
  { label: 'Daily Active', value: '18,420', change: 8.7, period: 'vs last week' },
  { label: 'Viral Coefficient', value: '1.47', change: 5.2, period: 'K-factor' },
  { label: 'Avg Revenue/User', value: '$284', change: 15.8, period: 'lifetime' },
  { label: 'Retention (30d)', value: '78.4%', change: 3.1, period: 'vs benchmark' },
  { label: 'NPS Score', value: '72', change: 4.8, period: 'industry avg: 31' },
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
  organic: [1000, 1470, 2160, 3175, 4667, 6860, 10084, 14824, 21791, 32032, 47087, 69218],
  referral: [500, 850, 1445, 2457, 4176, 7100, 12070, 20519, 34882, 59299, 100808, 171374],
  paid: [200, 340, 510, 765, 1148, 1721, 2582, 3873, 5810, 8714, 13072, 19607],
  total: [1700, 2660, 4115, 6397, 9991, 15681, 24736, 39216, 62483, 100045, 160967, 260199],
};

export const globalReachStats = {
  countries: 94,
  languages: 12,
  currencies: 28,
  timeZones: 'All 24',
  mobileUsers: '89%',
  avgSessionTime: '8.4 min',
  dailyTransactions: '24,680',
  peakConcurrentUsers: '4,280',
};

export const competitorComparison = [
  { name: 'IVXHOLDINGS', users: '47.8K', growth: '+340%', yearFounded: 2024, fundingRaised: '$0 (Self-funded)', color: '#FFD700' },
  { name: 'Fundrise', users: '2M', growth: '+12%', yearFounded: 2010, fundingRaised: '$300M+', color: '#4A90D9' },
  { name: 'RealtyMogul', users: '250K', growth: '+8%', yearFounded: 2012, fundingRaised: '$45M', color: '#9A9A9A' },
  { name: 'Arrived Homes', users: '500K', growth: '+25%', yearFounded: 2019, fundingRaised: '$100M+', color: '#6A6A6A' },
];
