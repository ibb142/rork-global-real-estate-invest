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
    connected: false,
    followers: 0,
    engagement: 0,
    posts: 0,
    color: '#E4405F',
  },
  {
    id: 'facebook',
    name: 'Facebook',
    icon: 'facebook',
    connected: false,
    followers: 0,
    engagement: 0,
    posts: 0,
    color: '#1877F2',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    icon: 'music',
    connected: false,
    followers: 0,
    engagement: 0,
    posts: 0,
    color: '#000000',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    icon: 'message-circle',
    connected: false,
    followers: 0,
    engagement: 0,
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
    connected: false,
    followers: 0,
    engagement: 0,
    posts: 0,
    color: '#0A66C2',
  },
  {
    id: 'google-ads',
    name: 'Google Ads',
    icon: 'target',
    connected: false,
    followers: 0,
    engagement: 0,
    posts: 0,
    color: '#4285F4',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    icon: 'youtube',
    connected: false,
    followers: 0,
    engagement: 0,
    posts: 0,
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
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
    avatar: '',
    specialty: 'Video Advertising',
    lastActive: '2026-02-14T10:49:00Z',
  },
];

export const contentQueue: ContentPost[] = [];

export const analyticsHistory: AnalyticsData[] = [];

export const commentThreads: CommentThread[] = [];

export const campaignMetrics: CampaignMetric[] = [
  { name: 'Total Reach', value: 0, change: 0, trend: 'stable' },
  { name: 'Engagement Rate', value: 0, change: 0, trend: 'stable' },
  { name: 'Follower Growth', value: 0, change: 0, trend: 'stable' },
  { name: 'Website Clicks', value: 0, change: 0, trend: 'stable' },
  { name: 'Conversions', value: 0, change: 0, trend: 'stable' },
  { name: 'Cost per Lead', value: 0, change: 0, trend: 'stable' },
];

export const weeklyPerformance = {
  impressions: { current: 0, previous: 0, change: 0 },
  reach: { current: 0, previous: 0, change: 0 },
  engagement: { current: 0, previous: 0, change: 0 },
  followers: { current: 0, previous: 0, change: 0 },
  clicks: { current: 0, previous: 0, change: 0 },
};

export const topPerformingContent: { platform: string; content: string; views: number; engagement: number }[] = [];

export const audienceInsights = {
  ageGroups: [] as { range: string; percentage: number }[],
  topCountries: [] as { country: string; percentage: number }[],
  peakHours: [] as { hour: string; activity: number }[],
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
