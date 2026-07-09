export type { ReferralTier } from '@/constants/platform-config';
export { REFERRAL_TIERS as referralTiers } from '@/constants/platform-config';

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

export const growthMilestones: GrowthMilestone[] = [
  { users: 1, label: 'Genesis', unlocks: 'Platform Live', reached: true, reachedDate: '2024-01-15' },
  { users: 1000, label: '1K Club', unlocks: 'Social Proof Engine', reached: true, reachedDate: '2024-03-20' },
  { users: 10000, label: '10K Wave', unlocks: 'AI Personalization', reached: true, reachedDate: '2024-08-12' },
  { users: 50000, label: '50K Surge', unlocks: 'Global Expansion', reached: true, reachedDate: '2025-02-05' },
  { users: 100000, label: '100K Army', unlocks: 'Copy Investing', reached: true, reachedDate: '2025-06-18' },
  { users: 500000, label: '500K Force', unlocks: 'Institutional Gateway', reached: false },
  { users: 1000000, label: '1M Nation', unlocks: 'IPO Readiness', reached: false },
  { users: 10000000, label: '10M Empire', unlocks: 'Global Domination', reached: false },
  { users: 100000000, label: '100M Revolution', unlocks: 'Traditional Finance Disrupted', reached: false },
];

export const viralChannels: ViralChannel[] = [
  { id: 'vc-1', name: 'Direct Referrals', icon: 'Users', usersAcquired: 18420, conversionRate: 42.8, costPerAcquisition: 0.50, trend: 'up', trendPercent: 18, color: '#FFD700' },
  { id: 'vc-2', name: 'Instagram', icon: 'Instagram', usersAcquired: 12300, conversionRate: 28.5, costPerAcquisition: 2.10, trend: 'up', trendPercent: 34, color: '#E1306C' },
  { id: 'vc-3', name: 'Google Search', icon: 'Search', usersAcquired: 9800, conversionRate: 35.2, costPerAcquisition: 3.40, trend: 'up', trendPercent: 12, color: '#4285F4' },
  { id: 'vc-4', name: 'TikTok', icon: 'Video', usersAcquired: 8200, conversionRate: 22.1, costPerAcquisition: 1.80, trend: 'up', trendPercent: 56, color: '#00F2EA' },
  { id: 'vc-5', name: 'YouTube', icon: 'Play', usersAcquired: 5400, conversionRate: 18.4, costPerAcquisition: 4.20, trend: 'stable', trendPercent: 5, color: '#FF0000' },
  { id: 'vc-6', name: 'Twitter/X', icon: 'Twitter', usersAcquired: 4100, conversionRate: 15.8, costPerAcquisition: 1.20, trend: 'up', trendPercent: 22, color: '#1DA1F2' },
  { id: 'vc-7', name: 'LinkedIn', icon: 'Briefcase', usersAcquired: 2800, conversionRate: 12.3, costPerAcquisition: 5.60, trend: 'stable', trendPercent: 3, color: '#0A66C2' },
  { id: 'vc-8', name: 'Email Campaigns', icon: 'Mail', usersAcquired: 3200, conversionRate: 38.5, costPerAcquisition: 0.80, trend: 'up', trendPercent: 15, color: '#22C55E' },
];

export const growthMetrics: GrowthMetric[] = [
  { label: 'Total Users', value: '64,220', change: 18, period: 'vs last month' },
  { label: 'Daily Active', value: '12,480', change: 24, period: 'vs last week' },
  { label: 'Viral Coefficient', value: '1.47', change: 8, period: 'K-factor' },
  { label: 'Avg Revenue/User', value: '$84', change: 12, period: 'lifetime' },
  { label: 'Retention (30d)', value: '68%', change: 6, period: 'vs benchmark' },
  { label: 'NPS Score', value: '72', change: 15, period: 'industry avg: 31' },
];

export const projectionData = {
  months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  organic: [3200, 4100, 5800, 7200, 8900, 11000, 13500, 16800, 21000, 26000, 31000, 38000],
  referral: [1800, 2400, 3600, 5200, 7100, 9800, 12500, 16000, 20000, 25000, 30000, 37000],
  paid: [1200, 1600, 2200, 3100, 4000, 5200, 6800, 8500, 11000, 13500, 16000, 19000],
  total: [6200, 8100, 11600, 15500, 20000, 26000, 32800, 41300, 52000, 64500, 77000, 94000],
};

export const globalReachStats = {
  countries: 94, languages: 30, currencies: 12, timeZones: 'All 24',
  mobileUsers: '87%', avgSessionTime: '8.4 min', dailyTransactions: '14,200', peakConcurrentUsers: '3,840',
};

export const competitorComparison = [
  { name: 'IVXHOLDINGS', users: '64K', growth: '340%', yearFounded: 2024, fundingRaised: '$0 (Self-funded)', color: '#FFD700' },
  { name: 'Fundrise', users: '2M', growth: '12%', yearFounded: 2012, fundingRaised: '$325M', color: '#00A86B' },
  { name: 'RealtyMogul', users: '250K', growth: '8%', yearFounded: 2012, fundingRaised: '$70M', color: '#4A90D9' },
  { name: 'CrowdStreet', users: '180K', growth: '15%', yearFounded: 2014, fundingRaised: '$58M', color: '#9B59B6' },
];
