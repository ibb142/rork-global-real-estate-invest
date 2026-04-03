import {
  SocialMediaContent,
  MarketingCampaign,
  Referral,
  ReferralStats,
  TrendingTopic,
  AIMarketingInsight,
  GrowthStats,
  SocialPlatform,
  Influencer,
  InfluencerReferral,
  InfluencerStats,
  InfluencerPerformance,
  InfluencerApplication,
  TrackableLink,
  LinkEvent,
  LinkAnalytics,
} from '@/types';

export const mockSocialContent: SocialMediaContent[] = [];

export const mockCampaigns: MarketingCampaign[] = [];

export const mockReferrals: Referral[] = [];

export const mockReferralStats: ReferralStats = {
  totalReferrals: 0,
  pendingReferrals: 0,
  signedUpReferrals: 0,
  investedReferrals: 0,
  totalRewardsPaid: 0,
  totalInvestmentFromReferrals: 0,
  topReferrers: [],
};

export const mockTrendingTopics: TrendingTopic[] = [];

export const mockAIInsights: AIMarketingInsight[] = [];

export const mockGrowthStats: GrowthStats = {
  totalUsers: 0, newUsersThisMonth: 0, userGrowthPercent: 0,
  totalReferrals: 0, referralConversionRate: 0, socialReach: 0,
  engagementRate: 0, topPerformingPlatform: 'instagram', topPerformingContent: undefined as unknown as SocialMediaContent,
};

export const getPlatformIcon = (platform: SocialPlatform): string => {
  const icons: Record<SocialPlatform, string> = { instagram: '📸', facebook: '📘', twitter: '🐦', linkedin: '💼', google: '🔍', tiktok: '🎵' };
  return icons[platform];
};

export const getPlatformColor = (platform: SocialPlatform): string => {
  const colors: Record<SocialPlatform, string> = { instagram: '#E4405F', facebook: '#1877F2', twitter: '#1DA1F2', linkedin: '#0A66C2', google: '#4285F4', tiktok: '#000000' };
  return colors[platform];
};

export const mockInfluencers: Influencer[] = [];

export const mockInfluencerReferrals: InfluencerReferral[] = [];

export const mockInfluencerStats: InfluencerStats = {
  totalInfluencers: 0, activeInfluencers: 0, totalReferrals: 0, totalSignups: 0,
  totalInvestments: 0, totalInvestmentAmount: 0, totalCommissionsPaid: 0,
  pendingCommissions: 0, averageConversionRate: 0, topPerformers: [],
};

export const getInfluencerStats = (): InfluencerStats => {
  return mockInfluencerStats;
};

export const getInfluencerReferrals = (influencerId?: string): InfluencerReferral[] => {
  if (influencerId) return mockInfluencerReferrals.filter(r => r.influencerId === influencerId);
  return mockInfluencerReferrals;
};

export const getInfluencerPerformance = (influencerId: string): InfluencerPerformance[] => {
  return [{
    influencerId, period: 'This Month', clicks: 0,
    signups: 0, investments: 0, investmentAmount: 0, commission: 0, conversionRate: 0,
  }];
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

export const mockInfluencerApplications: InfluencerApplication[] = [];

export const getApplicationStatusColor = (status: InfluencerApplication['status']): string => {
  const colors = { pending: '#F59E0B', approved: '#22C55E', rejected: '#EF4444' };
  return colors[status];
};

export const getSourceLabel = (source: InfluencerApplication['source']): string => {
  const labels = { app_search: 'App Search', referral: 'Referral', social_media: 'Social Media', website: 'Website' };
  return labels[source];
};

export const mockTrackableLinks: TrackableLink[] = [];

export const mockLinkEvents: LinkEvent[] = [];

export const getLinkAnalytics = (): LinkAnalytics => {
  return {
    totalLinks: 0, activeLinks: 0,
    totalClicks: 0, totalDownloads: 0, totalRegistrations: 0, totalInvestments: 0, totalInvestmentAmount: 0,
    avgConversionRate: 0,
    topPerformingLinks: [],
    recentEvents: [], clicksByPlatform: {}, clicksByDevice: { ios: 0, android: 0, web: 0 }, clicksByCountry: {},
  };
};

export const generateTrackableLink = (name: string, source: TrackableLink['source'], platform?: SocialPlatform): TrackableLink => {
  const shortCode = `ipx-${Date.now().toString(36)}`;
  const params = new URLSearchParams({ ref: shortCode, utm_source: platform || source, utm_medium: source });
  const fullUrl = `https://ipxholding.com/join?${params.toString()}`;
  return {
    id: `link-${Date.now()}`, name, shortCode, fullUrl,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(fullUrl)}`,
    source, platform, status: 'active', createdAt: new Date().toISOString(),
    stats: { totalClicks: 0, uniqueClicks: 0, downloads: 0, registrations: 0, investments: 0, investmentAmount: 0, conversionRate: 0, clickThroughRate: 0 },
  };
};
