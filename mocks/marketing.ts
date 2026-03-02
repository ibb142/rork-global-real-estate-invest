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

export const mockSocialContent: SocialMediaContent[] = [
  {
    id: 'content-1',
    platform: 'instagram',
    contentType: 'post',
    title: 'Real Estate Investment Made Simple',
    content: '🏠 Start your real estate investment journey with as little as $100! IVX HOLDINGS makes fractional property ownership accessible to everyone. 💰\n\nDownload the app and start investing today!',
    hashtags: ['#RealEstateInvesting', '#FractionalOwnership', '#PassiveIncome', '#IPXHolding'],
    targetAudience: 'Young professionals interested in investment',
    aiGenerated: true,
    status: 'posted',
    postedAt: '2025-01-20T10:00:00Z',
    engagement: { likes: 2450, shares: 342, comments: 156, clicks: 892, impressions: 45000 },
    createdAt: '2025-01-19T14:00:00Z',
  },
  {
    id: 'content-2',
    platform: 'facebook',
    contentType: 'ad',
    title: 'Invest in Premium Properties',
    content: 'Why rent when you can own a piece of premium real estate? 🏢\n\nIVX HOLDINGS allows you to invest in carefully selected properties with projected yields of 8-12% annually.',
    hashtags: ['#Investment', '#RealEstate', '#FinancialFreedom'],
    targetAudience: 'Adults 25-55 interested in investment',
    aiGenerated: true,
    status: 'approved',
    scheduledAt: '2025-01-28T09:00:00Z',
    createdAt: '2025-01-24T11:00:00Z',
  },
  {
    id: 'content-3',
    platform: 'twitter',
    contentType: 'post',
    title: 'New Property Alert',
    content: '🚨 NEW LISTING ALERT 🚨\n\nLuxury Miami waterfront property now available!\n\n📍 Miami Beach, FL\n💰 $150/share\n📈 Projected 10.5% yield\n\nLimited shares available. Invest now! 🔗',
    hashtags: ['#MiamiRealEstate', '#Investment', '#IPXHolding'],
    targetAudience: 'Active investors on Twitter',
    aiGenerated: true,
    status: 'posted',
    postedAt: '2025-01-22T15:00:00Z',
    engagement: { likes: 890, shares: 234, comments: 67, clicks: 456, impressions: 18500 },
    createdAt: '2025-01-22T14:30:00Z',
  },
];

export const mockCampaigns: MarketingCampaign[] = [
  {
    id: 'campaign-1',
    name: 'Q1 2025 Growth Campaign',
    description: 'Multi-platform campaign to drive new user acquisition and investment during Q1',
    platforms: ['instagram', 'facebook', 'google'],
    status: 'active',
    budget: 50000,
    spent: 23450,
    startDate: '2025-01-01',
    endDate: '2025-03-31',
    targetAudience: {
      locations: ['United States', 'Canada', 'United Kingdom', 'Australia'],
      interests: ['Real Estate', 'Investment', 'Finance', 'Passive Income'],
      ageRange: { min: 25, max: 55 },
      investmentLevel: 'all',
    },
    contents: mockSocialContent.slice(0, 3),
    metrics: {
      impressions: 1250000, clicks: 45600, conversions: 1234,
      costPerClick: 0.51, costPerConversion: 19.01, roi: 245,
    },
    aiInsights: [
      'Instagram posts perform 34% better on weekends',
      'Video content has 2.5x higher engagement than static images',
    ],
    createdAt: '2024-12-20T10:00:00Z',
  },
];

export const mockReferrals: Referral[] = [
  {
    id: 'ref-1',
    referrerId: 'user-001',
    referrerName: 'John Smith',
    referrerEmail: 'john.smith@email.com',
    referredEmail: 'mike.johnson@email.com',
    referredName: 'Mike Johnson',
    referredId: 'user-045',
    status: 'invested',
    referralCode: 'JOHN2025',
    reward: 50,
    rewardPaid: true,
    signedUpAt: '2025-01-10T14:00:00Z',
    investedAt: '2025-01-15T10:00:00Z',
    investmentAmount: 2500,
    createdAt: '2025-01-08T09:00:00Z',
  },
  {
    id: 'ref-2',
    referrerId: 'user-023',
    referrerName: 'Robert Chen',
    referrerEmail: 'robert.chen@email.com',
    referredEmail: 'lisa.wong@email.com',
    referredName: 'Lisa Wong',
    referredId: 'user-061',
    status: 'invested',
    referralCode: 'ROBERT50',
    reward: 75,
    rewardPaid: true,
    signedUpAt: '2025-01-05T10:00:00Z',
    investedAt: '2025-01-12T14:00:00Z',
    investmentAmount: 5000,
    createdAt: '2025-01-03T15:00:00Z',
  },
];

export const mockReferralStats: ReferralStats = {
  totalReferrals: 156,
  pendingReferrals: 23,
  signedUpReferrals: 45,
  investedReferrals: 88,
  totalRewardsPaid: 6600,
  totalInvestmentFromReferrals: 425000,
  topReferrers: [
    { id: 'user-023', name: 'Robert Chen', email: 'robert.chen@email.com', referralCount: 24, investmentGenerated: 85000 },
    { id: 'user-001', name: 'John Smith', email: 'john.smith@email.com', referralCount: 18, investmentGenerated: 52000 },
    { id: 'user-045', name: 'Maria Garcia', email: 'maria.garcia@email.com', referralCount: 15, investmentGenerated: 41000 },
  ],
};

export const mockTrendingTopics: TrendingTopic[] = [
  { id: 'trend-1', topic: 'Real Estate Investment 2025', platform: 'google', relevanceScore: 95, volume: 125000, sentiment: 'positive', suggestedContent: 'Create content about real estate investment strategies for 2025.', discoveredAt: '2025-01-25T08:00:00Z' },
  { id: 'trend-2', topic: 'Passive Income Ideas', platform: 'tiktok', relevanceScore: 92, volume: 890000, sentiment: 'positive', suggestedContent: 'Short-form video showing real dividend payouts from property investments.', discoveredAt: '2025-01-25T08:00:00Z' },
  { id: 'trend-3', topic: 'Alternative Investments', platform: 'linkedin', relevanceScore: 88, volume: 45000, sentiment: 'neutral', suggestedContent: 'Article comparing traditional stocks vs. fractional real estate.', discoveredAt: '2025-01-25T08:00:00Z' },
];

export const mockAIInsights: AIMarketingInsight[] = [
  {
    id: 'insight-1', type: 'opportunity', title: 'High Engagement Window Detected',
    description: 'Your target audience is most active between 6-9 PM EST on weekdays. Schedule posts during this window for 40% higher engagement.',
    platform: 'instagram',
    actionItems: ['Reschedule pending posts to 7 PM EST', 'Create Stories content for evening consumption'],
    priority: 'high', createdAt: '2025-01-25T10:00:00Z',
  },
  {
    id: 'insight-2', type: 'trend', title: 'Rising Interest in REITs Alternatives',
    description: 'Search volume for "REIT alternatives" has increased 65% this month.',
    actionItems: ['Create comparison content: IVXHOLDINGS vs Traditional REITs', 'Target ads to users searching for REIT information'],
    priority: 'high', createdAt: '2025-01-24T14:00:00Z',
  },
  {
    id: 'insight-3', type: 'recommendation', title: 'Video Content Underutilized',
    description: 'Your video content receives 3.2x more engagement than static posts, but only accounts for 15% of your content mix.',
    platform: 'tiktok',
    actionItems: ['Increase video content to 40% of total posts', 'Create property tour reels'],
    priority: 'medium', createdAt: '2025-01-23T09:00:00Z',
  },
];

export const mockGrowthStats: GrowthStats = {
  totalUsers: 15420, newUsersThisMonth: 1245, userGrowthPercent: 8.8,
  totalReferrals: 156, referralConversionRate: 56.4, socialReach: 2850000,
  engagementRate: 4.2, topPerformingPlatform: 'instagram', topPerformingContent: mockSocialContent[0],
};

export const getPlatformIcon = (platform: SocialPlatform): string => {
  const icons: Record<SocialPlatform, string> = { instagram: '📸', facebook: '📘', twitter: '🐦', linkedin: '💼', google: '🔍', tiktok: '🎵' };
  return icons[platform];
};

export const getPlatformColor = (platform: SocialPlatform): string => {
  const colors: Record<SocialPlatform, string> = { instagram: '#E4405F', facebook: '#1877F2', twitter: '#1DA1F2', linkedin: '#0A66C2', google: '#4285F4', tiktok: '#000000' };
  return colors[platform];
};

export const mockInfluencers: Influencer[] = [
  {
    id: 'inf-001', name: 'Alex Rivera', email: 'alex.rivera@influencer.com', phone: '+1 305-555-0101',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    platform: 'instagram', handle: '@alexrivera_invest', followers: 125000, tier: 'mid', status: 'active',
    referralCode: 'ALEX2025', qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://ipxholding.com/join?ref=ALEX2025',
    commissionRate: 8, totalEarnings: 4250, pendingEarnings: 750, paidEarnings: 3500,
    contractStartDate: '2024-10-01', contractEndDate: '2025-10-01', notes: 'Top performer in Miami market', createdAt: '2024-10-01T10:00:00Z',
  },
  {
    id: 'inf-002', name: 'Sarah Chen', email: 'sarah.chen@influencer.com', phone: '+1 415-555-0202',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    platform: 'tiktok', handle: '@sarahfinance', followers: 520000, tier: 'macro', status: 'active',
    referralCode: 'SARAH25', qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://ipxholding.com/join?ref=SARAH25',
    commissionRate: 10, totalEarnings: 12500, pendingEarnings: 2100, paidEarnings: 10400,
    contractStartDate: '2024-08-15', contractEndDate: '2025-08-15', notes: 'Finance focused content', createdAt: '2024-08-15T14:00:00Z',
  },
  {
    id: 'inf-003', name: 'Emily Watson', email: 'emily.watson@influencer.com', phone: '+1 310-555-0404',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
    platform: 'instagram', handle: '@emilywealthbuilder', followers: 1200000, tier: 'mega', status: 'active',
    referralCode: 'EMILY10K', qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://ipxholding.com/join?ref=EMILY10K',
    commissionRate: 12, totalEarnings: 28500, pendingEarnings: 5200, paidEarnings: 23300,
    contractStartDate: '2024-06-01', contractEndDate: '2025-06-01', notes: 'Premium influencer', createdAt: '2024-06-01T08:00:00Z',
  },
  {
    id: 'inf-004', name: 'David Park', email: 'david.park@influencer.com',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    platform: 'linkedin', handle: 'davidpark-investor', followers: 45000, tier: 'micro', status: 'active',
    referralCode: 'DAVID25', qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://ipxholding.com/join?ref=DAVID25',
    commissionRate: 6, totalEarnings: 1850, pendingEarnings: 320, paidEarnings: 1530,
    contractStartDate: '2024-12-01', notes: 'B2B focused', createdAt: '2024-12-01T11:00:00Z',
  },
];

export const mockInfluencerReferrals: InfluencerReferral[] = [
  {
    id: 'iref-001', influencerId: 'inf-003', influencerName: 'Emily Watson', referralCode: 'EMILY10K',
    referredEmail: 'john.doe@email.com', referredName: 'John Doe', referredId: 'user-101',
    status: 'invested', signedUpAt: '2025-01-10T14:00:00Z', investedAt: '2025-01-15T10:00:00Z',
    investmentAmount: 5000, commission: 600, commissionPaid: true, createdAt: '2025-01-10T14:00:00Z',
  },
  {
    id: 'iref-002', influencerId: 'inf-002', influencerName: 'Sarah Chen', referralCode: 'SARAH25',
    referredEmail: 'jane.smith@email.com', referredName: 'Jane Smith', referredId: 'user-102',
    status: 'invested', signedUpAt: '2025-01-12T09:00:00Z', investedAt: '2025-01-18T16:00:00Z',
    investmentAmount: 2500, commission: 250, commissionPaid: true, createdAt: '2025-01-12T09:00:00Z',
  },
  {
    id: 'iref-003', influencerId: 'inf-001', influencerName: 'Alex Rivera', referralCode: 'ALEX2025',
    referredEmail: 'bob.wilson@email.com', referredName: 'Bob Wilson', referredId: 'user-103',
    status: 'signed_up', signedUpAt: '2025-01-22T11:00:00Z',
    commission: 0, commissionPaid: false, createdAt: '2025-01-22T11:00:00Z',
  },
];

export const mockInfluencerStats: InfluencerStats = {
  totalInfluencers: 4, activeInfluencers: 4, totalReferrals: 156, totalSignups: 124,
  totalInvestments: 89, totalInvestmentAmount: 425000, totalCommissionsPaid: 38500,
  pendingCommissions: 9502, averageConversionRate: 71.8, topPerformers: [],
};

export const getInfluencerStats = (): InfluencerStats => {
  const activeInfluencers = mockInfluencers.filter(i => i.status === 'active');
  const topPerformers = [...mockInfluencers].sort((a, b) => b.totalEarnings - a.totalEarnings).slice(0, 5);
  return { ...mockInfluencerStats, totalInfluencers: mockInfluencers.length, activeInfluencers: activeInfluencers.length, topPerformers };
};

export const getInfluencerReferrals = (influencerId?: string): InfluencerReferral[] => {
  if (influencerId) return mockInfluencerReferrals.filter(r => r.influencerId === influencerId);
  return mockInfluencerReferrals;
};

export const getInfluencerPerformance = (influencerId: string): InfluencerPerformance[] => {
  const referrals = getInfluencerReferrals(influencerId);
  const signups = referrals.filter(r => r.status !== 'pending').length;
  const investments = referrals.filter(r => r.status === 'invested').length;
  const investmentAmount = referrals.filter(r => r.investmentAmount).reduce((sum, r) => sum + (r.investmentAmount || 0), 0);
  const commission = referrals.reduce((sum, r) => sum + r.commission, 0);
  return [{
    influencerId, period: 'This Month', clicks: Math.floor(Math.random() * 5000) + 1000,
    signups, investments, investmentAmount, commission, conversionRate: signups > 0 ? (investments / signups) * 100 : 0,
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
  const colors = { active: '#10B981', paused: '#F59E0B', pending: '#6B7280', terminated: '#EF4444' };
  return colors[status];
};

export const mockInfluencerApplications: InfluencerApplication[] = [
  {
    id: 'app-001', name: 'Jessica Martinez', email: 'jessica.m@gmail.com', phone: '+1 305-555-1234',
    platform: 'instagram', handle: '@jessicainvests', followers: 45000, profileUrl: 'https://instagram.com/jessicainvests',
    bio: 'Finance enthusiast sharing tips on smart investing.', whyJoin: 'I love your platform and want to help my followers discover fractional real estate investing.',
    source: 'app_search', status: 'pending', createdAt: '2026-01-28T14:30:00Z',
  },
  {
    id: 'app-002', name: 'David Thompson', email: 'david.thompson@outlook.com', phone: '+1 212-555-5678',
    platform: 'tiktok', handle: '@davidfinancetok', followers: 128000, profileUrl: 'https://tiktok.com/@davidfinancetok',
    bio: 'Making finance fun! Daily tips on investing.', whyJoin: 'My audience loves learning about new investment opportunities.',
    source: 'referral', referredBy: 'Alex Rivera', referralCode: 'ALEX2025', status: 'pending', createdAt: '2026-01-27T10:15:00Z',
  },
  {
    id: 'app-003', name: 'Michael Brown', email: 'mike.brown@gmail.com', phone: '+1 415-555-9012',
    platform: 'linkedin', handle: 'michael-brown-investments', followers: 32000, profileUrl: 'https://linkedin.com/in/michael-brown-investments',
    bio: 'Real estate professional with 15 years experience.', whyJoin: 'I can provide credible endorsements for fractional ownership.',
    source: 'website', status: 'approved', reviewedBy: 'Admin', reviewedAt: '2026-01-25T12:00:00Z', createdAt: '2026-01-24T09:30:00Z',
  },
];

export const getApplicationStatusColor = (status: InfluencerApplication['status']): string => {
  const colors = { pending: '#F59E0B', approved: '#10B981', rejected: '#EF4444' };
  return colors[status];
};

export const getSourceLabel = (source: InfluencerApplication['source']): string => {
  const labels = { app_search: 'App Search', referral: 'Referral', social_media: 'Social Media', website: 'Website' };
  return labels[source];
};

export const mockTrackableLinks: TrackableLink[] = [
  {
    id: 'link-001', name: 'Instagram Bio Link', shortCode: 'ipx-ig',
    fullUrl: 'https://ipxholding.com/join?ref=ipx-ig&utm_source=instagram&utm_medium=bio',
    qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://ipxholding.com/join?ref=ipx-ig',
    source: 'social', platform: 'instagram', status: 'active', createdAt: '2025-01-01T10:00:00Z',
    stats: { totalClicks: 12450, uniqueClicks: 8920, downloads: 2340, registrations: 1856, investments: 892, investmentAmount: 425000, conversionRate: 20.8, clickThroughRate: 18.8 },
  },
  {
    id: 'link-002', name: 'TikTok Campaign', shortCode: 'ipx-tt',
    fullUrl: 'https://ipxholding.com/join?ref=ipx-tt&utm_source=tiktok&utm_medium=video',
    qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://ipxholding.com/join?ref=ipx-tt',
    campaignId: 'campaign-1', campaignName: 'Q1 2025 Growth Campaign',
    source: 'social', platform: 'tiktok', status: 'active', createdAt: '2025-01-05T14:00:00Z',
    stats: { totalClicks: 28900, uniqueClicks: 21500, downloads: 5670, registrations: 4230, investments: 1890, investmentAmount: 756000, conversionRate: 19.6, clickThroughRate: 19.7 },
  },
  {
    id: 'link-003', name: 'Email Newsletter', shortCode: 'ipx-email',
    fullUrl: 'https://ipxholding.com/join?ref=ipx-email&utm_source=email&utm_medium=newsletter',
    qrCodeUrl: 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=https://ipxholding.com/join?ref=ipx-email',
    source: 'email', status: 'active', createdAt: '2025-01-10T09:00:00Z',
    stats: { totalClicks: 5670, uniqueClicks: 4890, downloads: 1230, registrations: 980, investments: 456, investmentAmount: 228000, conversionRate: 20.0, clickThroughRate: 21.7 },
  },
];

export const mockLinkEvents: LinkEvent[] = [
  { id: 'evt-001', linkId: 'link-002', linkName: 'TikTok Campaign', eventType: 'registration', userId: 'user-new-001', userName: 'Marcus Williams', userEmail: 'marcus.w@email.com', country: 'United States', city: 'Los Angeles', device: 'ios', timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString() },
  { id: 'evt-002', linkId: 'link-001', linkName: 'Instagram Bio Link', eventType: 'investment', userId: 'user-new-002', userName: 'Sarah Chen', userEmail: 'sarah.c@email.com', country: 'United States', city: 'New York', device: 'ios', investmentAmount: 2500, timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
  { id: 'evt-003', linkId: 'link-002', linkName: 'TikTok Campaign', eventType: 'download', country: 'United Kingdom', city: 'London', device: 'android', timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
];

export const getLinkAnalytics = (): LinkAnalytics => {
  const totalClicks = mockTrackableLinks.reduce((sum, link) => sum + link.stats.totalClicks, 0);
  const totalDownloads = mockTrackableLinks.reduce((sum, link) => sum + link.stats.downloads, 0);
  const totalRegistrations = mockTrackableLinks.reduce((sum, link) => sum + link.stats.registrations, 0);
  const totalInvestments = mockTrackableLinks.reduce((sum, link) => sum + link.stats.investments, 0);
  const totalInvestmentAmount = mockTrackableLinks.reduce((sum, link) => sum + link.stats.investmentAmount, 0);
  const clicksByPlatform: Record<string, number> = {};
  const clicksByDevice: Record<string, number> = { ios: 0, android: 0, web: 0 };
  const clicksByCountry: Record<string, number> = {};
  mockTrackableLinks.forEach(link => { if (link.platform) clicksByPlatform[link.platform] = (clicksByPlatform[link.platform] || 0) + link.stats.totalClicks; });
  mockLinkEvents.forEach(evt => { if (evt.device) clicksByDevice[evt.device] = (clicksByDevice[evt.device] || 0) + 1; if (evt.country) clicksByCountry[evt.country] = (clicksByCountry[evt.country] || 0) + 1; });
  return {
    totalLinks: mockTrackableLinks.length, activeLinks: mockTrackableLinks.filter(l => l.status === 'active').length,
    totalClicks, totalDownloads, totalRegistrations, totalInvestments, totalInvestmentAmount,
    avgConversionRate: totalRegistrations > 0 ? (totalInvestments / totalRegistrations) * 100 : 0,
    topPerformingLinks: [...mockTrackableLinks].sort((a, b) => b.stats.investments - a.stats.investments).slice(0, 5),
    recentEvents: mockLinkEvents, clicksByPlatform, clicksByDevice, clicksByCountry,
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
