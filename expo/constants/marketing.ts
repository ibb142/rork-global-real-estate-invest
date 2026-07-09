import type {
  SocialMediaContent, MarketingCampaign, Referral, ReferralStats,
  TrendingTopic, AIMarketingInsight, GrowthStats,
  Influencer, InfluencerReferral, InfluencerStats, InfluencerPerformance,
  InfluencerApplication, TrackableLink, LinkEvent, LinkAnalytics,
} from '@/types';

export {
  getPlatformIcon, getPlatformColor, generateReferralCode,
  getTierColor, getStatusColor, getApplicationStatusColor,
  getSourceLabel, generateTrackableLink,
} from '@/constants/platform-config';

export const mockSocialContent: SocialMediaContent[] = [];
export const mockCampaigns: MarketingCampaign[] = [];
export const mockReferrals: Referral[] = [];
export const mockReferralStats: ReferralStats = {
  totalReferrals: 0, pendingReferrals: 0, signedUpReferrals: 0, investedReferrals: 0,
  totalRewardsPaid: 0, totalInvestmentFromReferrals: 0, topReferrers: [],
};
export const mockTrendingTopics: TrendingTopic[] = [];
export const mockAIInsights: AIMarketingInsight[] = [];
export const mockGrowthStats: GrowthStats = {
  totalUsers: 0, newUsersThisMonth: 0, userGrowthPercent: 0,
  totalReferrals: 0, referralConversionRate: 0, socialReach: 0,
  engagementRate: 0, topPerformingPlatform: 'instagram',
  topPerformingContent: undefined as unknown as SocialMediaContent,
};
export const mockInfluencers: Influencer[] = [];
export const mockInfluencerReferrals: InfluencerReferral[] = [];
export const mockInfluencerStats: InfluencerStats = {
  totalInfluencers: 0, activeInfluencers: 0, totalReferrals: 0, totalSignups: 0,
  totalInvestments: 0, totalInvestmentAmount: 0, totalCommissionsPaid: 0,
  pendingCommissions: 0, averageConversionRate: 0, topPerformers: [],
};
export const getInfluencerStats = (): InfluencerStats => mockInfluencerStats;
export const getInfluencerReferrals = (influencerId?: string): InfluencerReferral[] => {
  if (influencerId) return mockInfluencerReferrals.filter(r => r.influencerId === influencerId);
  return mockInfluencerReferrals;
};
export const getInfluencerPerformance = (influencerId: string): InfluencerPerformance[] => [{
  influencerId, period: 'This Month', clicks: 0, signups: 0,
  investments: 0, investmentAmount: 0, commission: 0, conversionRate: 0,
}];
export const mockInfluencerApplications: InfluencerApplication[] = [];
export const mockTrackableLinks: TrackableLink[] = [];
export const mockLinkEvents: LinkEvent[] = [];
export const getLinkAnalytics = (): LinkAnalytics => ({
  totalLinks: 0, activeLinks: 0, totalClicks: 0, totalDownloads: 0,
  totalRegistrations: 0, totalInvestments: 0, totalInvestmentAmount: 0,
  avgConversionRate: 0, topPerformingLinks: [], recentEvents: [],
  clicksByPlatform: {}, clicksByDevice: { ios: 0, android: 0, web: 0 }, clicksByCountry: {},
});
