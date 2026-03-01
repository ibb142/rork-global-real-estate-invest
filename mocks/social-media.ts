export interface SocialPlatform {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  followers: number;
  engagement: number;
  posts: number;
  color: string;
}

export interface AIAgent {
  id: string;
  name: string;
  role: string;
  description: string;
  status: 'active' | 'idle' | 'working' | 'paused';
  platform: string[];
  tasksCompleted: number;
  accuracy: number;
  avatar: string;
  specialty: string;
  lastActive: string;
}

export interface ContentPost {
  id: string;
  content: string;
  mediaUrl?: string;
  platform: string[];
  status: 'draft' | 'scheduled' | 'reviewing' | 'approved' | 'published' | 'rejected';
  scheduledAt?: string;
  publishedAt?: string;
  aiScore: number;
  viralPotential: number;
  engagementPrediction: number;
  hashtags: string[];
  aiSuggestions: string[];
  createdAt: string;
}

export interface AnalyticsData {
  date: string;
  impressions: number;
  reach: number;
  engagement: number;
  followers: number;
  clicks: number;
}

export interface CommentThread {
  id: string;
  platform: string;
  postId: string;
  username: string;
  avatar: string;
  comment: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  aiResponse?: string;
  responded: boolean;
  createdAt: string;
}

export interface CampaignMetric {
  name: string;
  value: number;
  change: number;
  trend: 'up' | 'down' | 'stable';
}

export const socialPlatforms: SocialPlatform[] = [
  {
    id: 'instagram',
    name: 'Instagram',
    icon: 'instagram',
    connected: true,
    followers: 125400,
    engagement: 4.8,
    posts: 342,
    color: '#E4405F',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    connected: true,
    followers: 89200,
    engagement: 3.2,
    posts: 567,
    color: '#1877F2',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: 'music',
    connected: true,
    followers: 234500,
    engagement: 8.5,
    posts: 189,
    color: '#000000',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    icon: 'message-circle',
    connected: true,
    followers: 15600,
    engagement: 92.0,
    posts: 0,
    color: '#25D366',
  },
  {
    id: 'twitter',
    name: 'X (Twitter)',
    icon: 'twitter',
    connected: false,
    followers: 0,
    engagement: 0,
    posts: 0,
    color: '#000000',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    icon: 'linkedin',
    connected: true,
    followers: 45800,
    engagement: 2.1,
    posts: 234,
    color: '#0A66C2',
  },
  {
    id: 'google-ads',
    name: 'Google Ads',
    icon: 'target',
    connected: true,
    followers: 0,
    engagement: 5.2,
    posts: 48,
    color: '#4285F4',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: 'youtube',
    connected: true,
    followers: 78500,
    engagement: 6.3,
    posts: 156,
    color: '#FF0000',
  },
];

export const aiAgents: AIAgent[] = [
  {
    id: 'agent-1',
    name: 'ContentMax',
    role: 'Content Creator',
    description: 'Creates engaging posts, captions, and stories optimized for each platform',
    status: 'working',
    platform: ['instagram', 'facebook', 'tiktok'],
    tasksCompleted: 1247,
    accuracy: 94.5,
    avatar: 'https://images.unsplash.com/photo-1535378917042-10a22c95931a?w=200',
    specialty: 'Visual Content',
    lastActive: '2026-02-14T10:30:00Z',
  },
  {
    id: 'agent-2',
    name: 'EngageBot',
    role: 'Engagement Manager',
    description: 'Responds to comments, DMs, and manages community interactions 24/7',
    status: 'active',
    platform: ['instagram', 'facebook', 'whatsapp'],
    tasksCompleted: 8934,
    accuracy: 96.2,
    avatar: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=200',
    specialty: 'Community Management',
    lastActive: '2026-02-14T10:45:00Z',
  },
  {
    id: 'agent-3',
    name: 'TrendHunter',
    role: 'Trend Analyst',
    description: 'Monitors viral trends and identifies opportunities for content creation',
    status: 'working',
    platform: ['tiktok', 'instagram'],
    tasksCompleted: 567,
    accuracy: 89.8,
    avatar: 'https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=200',
    specialty: 'Trend Analysis',
    lastActive: '2026-02-14T10:40:00Z',
  },
  {
    id: 'agent-4',
    name: 'HashtagPro',
    role: 'Hashtag Optimizer',
    description: 'Researches and optimizes hashtags for maximum reach and discovery',
    status: 'active',
    platform: ['instagram', 'tiktok', 'twitter'],
    tasksCompleted: 2341,
    accuracy: 91.3,
    avatar: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=200',
    specialty: 'SEO & Discovery',
    lastActive: '2026-02-14T10:35:00Z',
  },
  {
    id: 'agent-5',
    name: 'ViralPredictor',
    role: 'Content Analyst',
    description: 'Analyzes content before posting to predict viral potential',
    status: 'working',
    platform: ['instagram', 'facebook', 'tiktok'],
    tasksCompleted: 1823,
    accuracy: 87.6,
    avatar: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=200',
    specialty: 'Predictive Analytics',
    lastActive: '2026-02-14T10:42:00Z',
  },
  {
    id: 'agent-6',
    name: 'ScheduleMaster',
    role: 'Posting Scheduler',
    description: 'Determines optimal posting times based on audience activity patterns',
    status: 'active',
    platform: ['instagram', 'facebook', 'tiktok', 'linkedin'],
    tasksCompleted: 3456,
    accuracy: 93.4,
    avatar: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=200',
    specialty: 'Time Optimization',
    lastActive: '2026-02-14T10:38:00Z',
  },
  {
    id: 'agent-7',
    name: 'CaptionGenius',
    role: 'Copywriter',
    description: 'Writes compelling captions and copy that drives engagement',
    status: 'idle',
    platform: ['instagram', 'facebook', 'linkedin'],
    tasksCompleted: 4521,
    accuracy: 95.1,
    avatar: 'https://images.unsplash.com/photo-1516110833967-0b5716ca1387?w=200',
    specialty: 'Copywriting',
    lastActive: '2026-02-14T09:15:00Z',
  },
  {
    id: 'agent-8',
    name: 'CompetitorSpy',
    role: 'Competitor Analyst',
    description: 'Monitors competitor activities and identifies strategic opportunities',
    status: 'working',
    platform: ['instagram', 'facebook', 'tiktok'],
    tasksCompleted: 892,
    accuracy: 88.9,
    avatar: 'https://images.unsplash.com/photo-1563207153-f403bf289096?w=200',
    specialty: 'Competitive Intelligence',
    lastActive: '2026-02-14T10:44:00Z',
  },
  {
    id: 'agent-9',
    name: 'ReportWizard',
    role: 'Analytics Reporter',
    description: 'Generates comprehensive performance reports and insights',
    status: 'active',
    platform: ['instagram', 'facebook', 'tiktok', 'linkedin'],
    tasksCompleted: 1234,
    accuracy: 99.2,
    avatar: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=200',
    specialty: 'Data Visualization',
    lastActive: '2026-02-14T10:30:00Z',
  },
  {
    id: 'agent-10',
    name: 'AdOptimizer',
    role: 'Ad Campaign Manager',
    description: 'Optimizes ad spend and targeting for maximum ROI',
    status: 'working',
    platform: ['instagram', 'facebook'],
    tasksCompleted: 678,
    accuracy: 91.7,
    avatar: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=200',
    specialty: 'Paid Advertising',
    lastActive: '2026-02-14T10:41:00Z',
  },
  {
    id: 'agent-11',
    name: 'VideoEditor',
    role: 'Video Content Creator',
    description: 'Creates and edits short-form video content for maximum impact',
    status: 'active',
    platform: ['tiktok', 'instagram'],
    tasksCompleted: 543,
    accuracy: 90.5,
    avatar: 'https://images.unsplash.com/photo-1536240478700-b869070f9279?w=200',
    specialty: 'Video Production',
    lastActive: '2026-02-14T10:28:00Z',
  },
  {
    id: 'agent-12',
    name: 'StoryTeller',
    role: 'Stories Manager',
    description: 'Creates and schedules engaging Instagram and Facebook stories',
    status: 'idle',
    platform: ['instagram', 'facebook'],
    tasksCompleted: 2187,
    accuracy: 92.8,
    avatar: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=200',
    specialty: 'Ephemeral Content',
    lastActive: '2026-02-14T08:45:00Z',
  },
  {
    id: 'agent-13',
    name: 'InfluencerScout',
    role: 'Influencer Manager',
    description: 'Identifies and manages influencer partnerships and collaborations',
    status: 'active',
    platform: ['instagram', 'tiktok'],
    tasksCompleted: 234,
    accuracy: 86.4,
    avatar: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=200',
    specialty: 'Influencer Marketing',
    lastActive: '2026-02-14T10:20:00Z',
  },
  {
    id: 'agent-14',
    name: 'SentimentGuard',
    role: 'Brand Monitor',
    description: 'Monitors brand mentions and sentiment across all platforms',
    status: 'working',
    platform: ['instagram', 'facebook', 'tiktok', 'twitter'],
    tasksCompleted: 4567,
    accuracy: 94.8,
    avatar: 'https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=200',
    specialty: 'Brand Protection',
    lastActive: '2026-02-14T10:46:00Z',
  },
  {
    id: 'agent-15',
    name: 'WhatsAppAssist',
    role: 'Chat Support',
    description: 'Handles WhatsApp business inquiries and customer support 24/7',
    status: 'active',
    platform: ['whatsapp'],
    tasksCompleted: 12456,
    accuracy: 97.3,
    avatar: 'https://images.unsplash.com/photo-1587560699334-cc4ff634909a?w=200',
    specialty: 'Customer Support',
    lastActive: '2026-02-14T10:47:00Z',
  },
  {
    id: 'agent-16',
    name: 'ABTester',
    role: 'A/B Testing Specialist',
    description: 'Runs and analyzes A/B tests to optimize content performance',
    status: 'idle',
    platform: ['instagram', 'facebook'],
    tasksCompleted: 345,
    accuracy: 93.1,
    avatar: 'https://images.unsplash.com/photo-1551434678-e076c223a692?w=200',
    specialty: 'Experimentation',
    lastActive: '2026-02-14T07:30:00Z',
  },
  {
    id: 'agent-17',
    name: 'LocalizePro',
    role: 'Localization Expert',
    description: 'Adapts content for different regions and languages',
    status: 'active',
    platform: ['instagram', 'facebook', 'tiktok'],
    tasksCompleted: 678,
    accuracy: 91.9,
    avatar: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=200',
    specialty: 'Localization',
    lastActive: '2026-02-14T10:25:00Z',
  },
  {
    id: 'agent-18',
    name: 'CrisisHandler',
    role: 'Crisis Manager',
    description: 'Detects and manages potential PR crises before they escalate',
    status: 'idle',
    platform: ['instagram', 'facebook', 'tiktok', 'twitter'],
    tasksCompleted: 23,
    accuracy: 98.5,
    avatar: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=200',
    specialty: 'Crisis Management',
    lastActive: '2026-02-14T06:00:00Z',
  },
  {
    id: 'agent-19',
    name: 'GrowthHacker',
    role: 'Growth Strategist',
    description: 'Implements growth hacking strategies to rapidly increase followers',
    status: 'working',
    platform: ['instagram', 'tiktok'],
    tasksCompleted: 456,
    accuracy: 85.7,
    avatar: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=200',
    specialty: 'Growth Hacking',
    lastActive: '2026-02-14T10:43:00Z',
  },
  {
    id: 'agent-20',
    name: 'ReelsExpert',
    role: 'Reels Specialist',
    description: 'Creates viral Instagram Reels and TikTok videos optimized for algorithm',
    status: 'active',
    platform: ['instagram', 'tiktok'],
    tasksCompleted: 892,
    accuracy: 88.3,
    avatar: 'https://images.unsplash.com/photo-1543269664-56d93c1b41a6?w=200',
    specialty: 'Short-form Video',
    lastActive: '2026-02-14T10:39:00Z',
  },
  {
    id: 'agent-21',
    name: 'GoogleAdsMaster',
    role: 'Google Ads Specialist',
    description: 'Manages Google Ads campaigns, optimizes keywords, bidding strategies, and maximizes ROAS',
    status: 'working',
    platform: ['google-ads', 'youtube'],
    tasksCompleted: 1567,
    accuracy: 94.8,
    avatar: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=200',
    specialty: 'PPC & Search Ads',
    lastActive: '2026-02-14T10:48:00Z',
  },
  {
    id: 'agent-22',
    name: 'KeywordGenius',
    role: 'Keyword Research Expert',
    description: 'Discovers high-converting keywords and negative keywords for Google Ads campaigns',
    status: 'active',
    platform: ['google-ads'],
    tasksCompleted: 2341,
    accuracy: 92.1,
    avatar: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?w=200',
    specialty: 'Keyword Research',
    lastActive: '2026-02-14T10:45:00Z',
  },
  {
    id: 'agent-23',
    name: 'BidOptimizer',
    role: 'Bidding Strategist',
    description: 'Optimizes CPC bids, manages budget allocation, and maximizes conversion value',
    status: 'working',
    platform: ['google-ads'],
    tasksCompleted: 1823,
    accuracy: 93.6,
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
    specialty: 'Bid Management',
    lastActive: '2026-02-14T10:47:00Z',
  },
  {
    id: 'agent-24',
    name: 'DisplayAdCreator',
    role: 'Display Ads Designer',
    description: 'Creates responsive display ads, banner designs, and remarketing creatives',
    status: 'active',
    platform: ['google-ads', 'youtube'],
    tasksCompleted: 987,
    accuracy: 89.4,
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200',
    specialty: 'Display Advertising',
    lastActive: '2026-02-14T10:40:00Z',
  },
  {
    id: 'agent-25',
    name: 'YouTubeAdPro',
    role: 'YouTube Ads Manager',
    description: 'Manages YouTube video ads, TrueView campaigns, and video remarketing',
    status: 'working',
    platform: ['youtube', 'google-ads'],
    tasksCompleted: 756,
    accuracy: 91.2,
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200',
    specialty: 'Video Advertising',
    lastActive: '2026-02-14T10:49:00Z',
  },
];

export const contentQueue: ContentPost[] = [
  {
    id: 'post-1',
    content: '🏠 Discover the future of real estate investing! With IVX HOLDINGS, you can own a piece of premium properties worldwide. Start your journey today! 💰',
    mediaUrl: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800',
    platform: ['instagram', 'facebook'],
    status: 'approved',
    scheduledAt: '2026-02-14T14:00:00Z',
    aiScore: 92,
    viralPotential: 78,
    engagementPrediction: 4.2,
    hashtags: ['#RealEstate', '#Investment', '#PassiveIncome', '#WealthBuilding', '#PropertyInvestment'],
    aiSuggestions: ['Add a call-to-action button', 'Consider posting at 6 PM for better reach'],
    createdAt: '2026-02-13T10:00:00Z',
  },
  {
    id: 'post-2',
    content: 'Why rent when you can OWN? 🤔 Fractional ownership makes real estate accessible to everyone. Watch how it works! 👇',
    mediaUrl: 'https://images.unsplash.com/photo-1560520653-9e0e4c89eb11?w=800',
    platform: ['tiktok', 'instagram'],
    status: 'reviewing',
    aiScore: 88,
    viralPotential: 85,
    engagementPrediction: 6.8,
    hashtags: ['#FractionalOwnership', '#RealEstateTok', '#InvestmentTips', '#PassiveIncomeTips'],
    aiSuggestions: ['Add trending audio', 'Include before/after comparison', 'Hook needs to be stronger'],
    createdAt: '2026-02-13T15:30:00Z',
  },
  {
    id: 'post-3',
    content: 'Monthly dividends just hit! 💸 Our investors earned an average of 10% returns this quarter. Ready to join them?',
    platform: ['instagram', 'facebook', 'linkedin'],
    status: 'draft',
    aiScore: 75,
    viralPotential: 62,
    engagementPrediction: 3.5,
    hashtags: ['#Dividends', '#ROI', '#SmartInvesting'],
    aiSuggestions: ['Add visual proof of returns', 'Include testimonial', 'Compliance review needed'],
    createdAt: '2026-02-14T08:00:00Z',
  },
  {
    id: 'post-4',
    content: '🎉 Welcome to the IPX family! New investors joined from 15 countries this week. The global real estate revolution is HERE!',
    mediaUrl: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800',
    platform: ['instagram'],
    status: 'published',
    publishedAt: '2026-02-13T18:00:00Z',
    aiScore: 89,
    viralPotential: 71,
    engagementPrediction: 4.8,
    hashtags: ['#GlobalInvestment', '#RealEstateFamily', '#Welcomeaboard'],
    aiSuggestions: [],
    createdAt: '2026-02-12T14:00:00Z',
  },
];

export const analyticsHistory: AnalyticsData[] = [
  { date: '2026-02-07', impressions: 125000, reach: 89000, engagement: 4500, followers: 124800, clicks: 2340 },
  { date: '2026-02-08', impressions: 142000, reach: 95000, engagement: 5200, followers: 124950, clicks: 2780 },
  { date: '2026-02-09', impressions: 138000, reach: 92000, engagement: 4800, followers: 125050, clicks: 2560 },
  { date: '2026-02-10', impressions: 165000, reach: 112000, engagement: 6100, followers: 125180, clicks: 3120 },
  { date: '2026-02-11', impressions: 178000, reach: 125000, engagement: 7200, followers: 125280, clicks: 3450 },
  { date: '2026-02-12', impressions: 156000, reach: 108000, engagement: 5800, followers: 125350, clicks: 2980 },
  { date: '2026-02-13', impressions: 189000, reach: 134000, engagement: 8100, followers: 125400, clicks: 3890 },
];

export const commentThreads: CommentThread[] = [
  {
    id: 'comment-1',
    platform: 'instagram',
    postId: 'post-4',
    username: '@investor_jane',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100',
    comment: 'This is amazing! How do I get started?',
    sentiment: 'positive',
    aiResponse: 'Thank you for your interest! 🎉 You can start by downloading our app and completing a quick KYC verification. Our minimum investment is just $100! Link in bio 👆',
    responded: true,
    createdAt: '2026-02-13T19:15:00Z',
  },
  {
    id: 'comment-2',
    platform: 'instagram',
    postId: 'post-4',
    username: '@skeptical_sam',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100',
    comment: 'Is this legit? Sounds too good to be true...',
    sentiment: 'negative',
    aiResponse: 'Great question! We\'re fully regulated and transparent. You can view our licenses on our website, and all properties are independently verified. Happy to answer any specific questions! 💪',
    responded: true,
    createdAt: '2026-02-13T20:30:00Z',
  },
  {
    id: 'comment-3',
    platform: 'tiktok',
    postId: 'post-2',
    username: '@realestate_guru',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
    comment: 'The future of real estate is here! 🔥',
    sentiment: 'positive',
    responded: false,
    createdAt: '2026-02-14T08:45:00Z',
  },
  {
    id: 'comment-4',
    platform: 'facebook',
    postId: 'post-1',
    username: 'Maria Rodriguez',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
    comment: 'What countries can invest?',
    sentiment: 'neutral',
    responded: false,
    createdAt: '2026-02-14T09:20:00Z',
  },
];

export const campaignMetrics: CampaignMetric[] = [
  { name: 'Total Reach', value: 755000, change: 12.5, trend: 'up' },
  { name: 'Engagement Rate', value: 4.8, change: 0.3, trend: 'up' },
  { name: 'Follower Growth', value: 600, change: 15.2, trend: 'up' },
  { name: 'Website Clicks', value: 21120, change: -2.1, trend: 'down' },
  { name: 'Conversions', value: 234, change: 8.7, trend: 'up' },
  { name: 'Cost per Lead', value: 2.45, change: -12.3, trend: 'up' },
];

export const weeklyPerformance = {
  impressions: { current: 1093000, previous: 945000, change: 15.7 },
  reach: { current: 755000, previous: 678000, change: 11.4 },
  engagement: { current: 41700, previous: 38200, change: 9.2 },
  followers: { current: 510500, previous: 508900, change: 0.3 },
  clicks: { current: 21120, previous: 19450, change: 8.6 },
};

export const topPerformingContent = [
  { platform: 'TikTok', content: 'Property tour video', views: 245000, engagement: 12.4 },
  { platform: 'Instagram', content: 'Investor success story', views: 89000, engagement: 8.7 },
  { platform: 'Facebook', content: 'New property announcement', views: 67000, engagement: 5.2 },
];

export const audienceInsights = {
  ageGroups: [
    { range: '18-24', percentage: 15 },
    { range: '25-34', percentage: 38 },
    { range: '35-44', percentage: 28 },
    { range: '45-54', percentage: 12 },
    { range: '55+', percentage: 7 },
  ],
  topCountries: [
    { country: 'United States', percentage: 35 },
    { country: 'United Kingdom', percentage: 18 },
    { country: 'Singapore', percentage: 12 },
    { country: 'UAE', percentage: 10 },
    { country: 'Australia', percentage: 8 },
  ],
  peakHours: [
    { hour: '9 AM', activity: 65 },
    { hour: '12 PM', activity: 78 },
    { hour: '3 PM', activity: 72 },
    { hour: '6 PM', activity: 95 },
    { hour: '9 PM', activity: 88 },
  ],
};

export const getAgentsByStatus = (status: AIAgent['status']) => 
  aiAgents.filter(a => a.status === status);

export const getActiveAgentsCount = () => 
  aiAgents.filter(a => a.status === 'active' || a.status === 'working').length;

export const getPendingComments = () => 
  commentThreads.filter(c => !c.responded);

export const getContentByStatus = (status: ContentPost['status']) => 
  contentQueue.filter(c => c.status === status);

export const getTotalFollowers = () => 
  socialPlatforms.filter(p => p.connected).reduce((sum, p) => sum + p.followers, 0);

export const getAverageEngagement = () => {
  const connected = socialPlatforms.filter(p => p.connected && p.engagement > 0);
  return connected.reduce((sum, p) => sum + p.engagement, 0) / connected.length;
};
