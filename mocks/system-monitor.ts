export interface ModuleHealth {
  id: string;
  name: string;
  category: 'core' | 'finance' | 'marketing' | 'analytics' | 'ai' | 'communication' | 'partners' | 'settings';
  status: 'operational' | 'degraded' | 'down' | 'maintenance';
  uptime: number;
  lastChecked: string;
  responseTime: number;
  errorRate: number;
  dailyUsers: number;
  recommendation?: string;
  platform: ('ios' | 'android' | 'web')[];
  criticalIssues: number;
  warnings: number;
}

export interface GrowthChannel {
  id: string;
  name: string;
  icon: string;
  currentUsers: number;
  projectedUsers: number;
  conversionRate: number;
  costPerAcquisition: number;
  roi: number;
  status: 'active' | 'planned' | 'optimizing' | 'paused';
  trend: 'up' | 'down' | 'stable';
  monthlyGrowthRate: number;
}

export interface GrowthMilestone {
  target: number;
  label: string;
  estimatedDate: string;
  strategy: string;
  confidence: number;
  channels: string[];
}

export interface DiagnosticReport {
  id: string;
  timestamp: string;
  type: 'hourly' | 'daily' | 'weekly' | 'critical';
  overallScore: number;
  modulesChecked: number;
  issuesFound: number;
  autoFixed: number;
  recommendations: DiagnosticRecommendation[];
}

export interface DiagnosticRecommendation {
  id: string;
  module: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: 'update' | 'replace' | 'optimize' | 'monitor' | 'fix';
  estimatedImpact: string;
  autoFixable: boolean;
}

export interface SystemPulse {
  timestamp: string;
  cpuUsage: number;
  memoryUsage: number;
  activeConnections: number;
  requestsPerSecond: number;
  errorRate: number;
  avgResponseTime: number;
}

export const MODULE_HEALTH_DATA: ModuleHealth[] = [
  { id: 'landing', name: 'Landing Page', category: 'core', status: 'operational', uptime: 99.97, lastChecked: new Date().toISOString(), responseTime: 142, errorRate: 0.02, dailyUsers: 3420, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 1, recommendation: 'Add A/B testing for hero section CTA' },
  { id: 'signup', name: 'Sign Up Flow', category: 'core', status: 'operational', uptime: 99.95, lastChecked: new Date().toISOString(), responseTime: 234, errorRate: 0.1, dailyUsers: 892, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 0 },
  { id: 'login', name: 'Login System', category: 'core', status: 'operational', uptime: 99.99, lastChecked: new Date().toISOString(), responseTime: 89, errorRate: 0.01, dailyUsers: 4210, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 0 },
  { id: 'kyc', name: 'KYC Verification', category: 'core', status: 'degraded', uptime: 98.2, lastChecked: new Date().toISOString(), responseTime: 1820, errorRate: 2.1, dailyUsers: 156, platform: ['ios', 'android'], criticalIssues: 1, warnings: 3, recommendation: 'Replace document OCR with faster provider — current 1.8s avg response too slow' },
  { id: 'wallet', name: 'Digital Wallet', category: 'finance', status: 'operational', uptime: 99.98, lastChecked: new Date().toISOString(), responseTime: 167, errorRate: 0.05, dailyUsers: 2890, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 1 },
  { id: 'invest-tab', name: 'Investment Tab', category: 'finance', status: 'operational', uptime: 99.94, lastChecked: new Date().toISOString(), responseTime: 312, errorRate: 0.15, dailyUsers: 3100, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 2, recommendation: 'Optimize property image loading — compress to WebP' },
  { id: 'transactions', name: 'Transactions Engine', category: 'finance', status: 'operational', uptime: 99.99, lastChecked: new Date().toISOString(), responseTime: 95, errorRate: 0.01, dailyUsers: 1540, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 0 },
  { id: 'auto-reinvest', name: 'Auto-Reinvest', category: 'finance', status: 'operational', uptime: 99.8, lastChecked: new Date().toISOString(), responseTime: 210, errorRate: 0.3, dailyUsers: 430, platform: ['ios', 'android'], criticalIssues: 0, warnings: 1 },
  { id: 'copy-investing', name: 'Copy Investing', category: 'finance', status: 'degraded', uptime: 97.5, lastChecked: new Date().toISOString(), responseTime: 2100, errorRate: 3.2, dailyUsers: 89, platform: ['ios', 'android'], criticalIssues: 1, warnings: 2, recommendation: 'Replace real-time sync mechanism — WebSocket drops causing data lag' },
  { id: 'gift-shares', name: 'Gift Shares', category: 'finance', status: 'operational', uptime: 99.6, lastChecked: new Date().toISOString(), responseTime: 280, errorRate: 0.4, dailyUsers: 67, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 0 },
  { id: 'marketing-hub', name: 'Marketing Hub', category: 'marketing', status: 'operational', uptime: 99.7, lastChecked: new Date().toISOString(), responseTime: 340, errorRate: 0.2, dailyUsers: 45, platform: ['web'], criticalIssues: 0, warnings: 1 },
  { id: 'social-command', name: 'Social Command Center', category: 'marketing', status: 'operational', uptime: 99.5, lastChecked: new Date().toISOString(), responseTime: 450, errorRate: 0.5, dailyUsers: 32, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 2, recommendation: 'Add TikTok API integration for viral content distribution' },
  { id: 'viral-growth', name: 'Viral Growth Hub', category: 'marketing', status: 'operational', uptime: 99.3, lastChecked: new Date().toISOString(), responseTime: 520, errorRate: 0.8, dailyUsers: 28, platform: ['web'], criticalIssues: 0, warnings: 1 },
  { id: 'traffic-control', name: 'Traffic Control', category: 'marketing', status: 'operational', uptime: 99.6, lastChecked: new Date().toISOString(), responseTime: 380, errorRate: 0.3, dailyUsers: 18, platform: ['web'], criticalIssues: 0, warnings: 0 },
  { id: 'lead-intelligence', name: 'Lead Intelligence', category: 'marketing', status: 'degraded', uptime: 96.8, lastChecked: new Date().toISOString(), responseTime: 2400, errorRate: 4.1, dailyUsers: 15, platform: ['web'], criticalIssues: 2, warnings: 4, recommendation: 'Update lead scoring algorithm — current model has 41% false positive rate' },
  { id: 'referrals', name: 'Referral System', category: 'marketing', status: 'operational', uptime: 99.8, lastChecked: new Date().toISOString(), responseTime: 190, errorRate: 0.1, dailyUsers: 670, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 0 },
  { id: 'email-engine', name: 'Email Engine', category: 'communication', status: 'operational', uptime: 99.9, lastChecked: new Date().toISOString(), responseTime: 120, errorRate: 0.05, dailyUsers: 210, platform: ['web'], criticalIssues: 0, warnings: 0 },
  { id: 'push-notifications', name: 'Push Notifications', category: 'communication', status: 'operational', uptime: 99.7, lastChecked: new Date().toISOString(), responseTime: 78, errorRate: 0.2, dailyUsers: 5600, platform: ['ios', 'android'], criticalIssues: 0, warnings: 1 },
  { id: 'ai-outreach', name: 'AI Outreach', category: 'ai', status: 'operational', uptime: 99.4, lastChecked: new Date().toISOString(), responseTime: 890, errorRate: 0.7, dailyUsers: 12, platform: ['web'], criticalIssues: 0, warnings: 1 },
  { id: 'ai-gallery', name: 'AI Gallery', category: 'ai', status: 'operational', uptime: 99.1, lastChecked: new Date().toISOString(), responseTime: 1200, errorRate: 1.2, dailyUsers: 340, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 2, recommendation: 'Upgrade image generation model for faster rendering' },
  { id: 'ai-video', name: 'AI Video Studio', category: 'ai', status: 'maintenance', uptime: 94.5, lastChecked: new Date().toISOString(), responseTime: 3500, errorRate: 5.8, dailyUsers: 8, platform: ['web'], criticalIssues: 3, warnings: 5, recommendation: 'Replace video rendering pipeline — current solution too slow and unreliable' },
  { id: 'contract-gen', name: 'Contract Generator', category: 'ai', status: 'operational', uptime: 99.6, lastChecked: new Date().toISOString(), responseTime: 670, errorRate: 0.4, dailyUsers: 45, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 0 },
  { id: 'global-intelligence', name: 'Global Intelligence', category: 'analytics', status: 'operational', uptime: 99.5, lastChecked: new Date().toISOString(), responseTime: 560, errorRate: 0.6, dailyUsers: 22, platform: ['web'], criticalIssues: 0, warnings: 1 },
  { id: 'landing-analytics', name: 'Landing Analytics', category: 'analytics', status: 'operational', uptime: 99.8, lastChecked: new Date().toISOString(), responseTime: 230, errorRate: 0.1, dailyUsers: 35, platform: ['web'], criticalIssues: 0, warnings: 0 },
  { id: 'lender-directory', name: 'Lender Directory', category: 'partners', status: 'operational', uptime: 99.7, lastChecked: new Date().toISOString(), responseTime: 340, errorRate: 0.2, dailyUsers: 120, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 0 },
  { id: 'land-partners', name: 'Land Partners', category: 'partners', status: 'operational', uptime: 99.5, lastChecked: new Date().toISOString(), responseTime: 290, errorRate: 0.3, dailyUsers: 45, platform: ['web'], criticalIssues: 0, warnings: 1 },
  { id: 'vip-tiers', name: 'VIP Tiers', category: 'settings', status: 'operational', uptime: 99.9, lastChecked: new Date().toISOString(), responseTime: 110, errorRate: 0.02, dailyUsers: 890, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 0 },
  { id: 'security-settings', name: 'Security Settings', category: 'settings', status: 'operational', uptime: 99.99, lastChecked: new Date().toISOString(), responseTime: 65, errorRate: 0.01, dailyUsers: 1200, platform: ['ios', 'android', 'web'], criticalIssues: 0, warnings: 0 },
  { id: 'authenticator', name: '2FA Authenticator', category: 'settings', status: 'operational', uptime: 99.95, lastChecked: new Date().toISOString(), responseTime: 45, errorRate: 0.01, dailyUsers: 780, platform: ['ios', 'android'], criticalIssues: 0, warnings: 0 },
];

export const GROWTH_CHANNELS: GrowthChannel[] = [
  { id: 'organic-search', name: 'Google / SEO', icon: 'Search', currentUsers: 12400, projectedUsers: 890000, conversionRate: 3.2, costPerAcquisition: 0, roi: Infinity, status: 'active', trend: 'up', monthlyGrowthRate: 34 },
  { id: 'instagram', name: 'Instagram', icon: 'Camera', currentUsers: 8900, projectedUsers: 15000000, conversionRate: 1.8, costPerAcquisition: 2.40, roi: 420, status: 'active', trend: 'up', monthlyGrowthRate: 48 },
  { id: 'tiktok', name: 'TikTok', icon: 'Video', currentUsers: 4200, projectedUsers: 25000000, conversionRate: 2.1, costPerAcquisition: 1.10, roi: 680, status: 'active', trend: 'up', monthlyGrowthRate: 72 },
  { id: 'youtube', name: 'YouTube', icon: 'Play', currentUsers: 3100, projectedUsers: 8000000, conversionRate: 4.5, costPerAcquisition: 3.80, roi: 310, status: 'active', trend: 'up', monthlyGrowthRate: 28 },
  { id: 'facebook', name: 'Facebook / Meta Ads', icon: 'Users', currentUsers: 6700, projectedUsers: 12000000, conversionRate: 2.4, costPerAcquisition: 4.20, roi: 280, status: 'active', trend: 'stable', monthlyGrowthRate: 18 },
  { id: 'twitter-x', name: 'X (Twitter)', icon: 'MessageCircle', currentUsers: 2100, projectedUsers: 5000000, conversionRate: 1.2, costPerAcquisition: 1.80, roi: 190, status: 'active', trend: 'up', monthlyGrowthRate: 22 },
  { id: 'linkedin', name: 'LinkedIn', icon: 'Briefcase', currentUsers: 1800, projectedUsers: 3000000, conversionRate: 5.8, costPerAcquisition: 8.50, roi: 520, status: 'active', trend: 'up', monthlyGrowthRate: 15 },
  { id: 'referral', name: 'Referral Program', icon: 'Gift', currentUsers: 5400, projectedUsers: 20000000, conversionRate: 12.5, costPerAcquisition: 0.50, roi: 1840, status: 'active', trend: 'up', monthlyGrowthRate: 56 },
  { id: 'influencer', name: 'Influencer Network', icon: 'Star', currentUsers: 3800, projectedUsers: 18000000, conversionRate: 6.2, costPerAcquisition: 1.90, roi: 750, status: 'active', trend: 'up', monthlyGrowthRate: 42 },
  { id: 'email-marketing', name: 'Email Campaigns', icon: 'Mail', currentUsers: 9200, projectedUsers: 4000000, conversionRate: 8.4, costPerAcquisition: 0.30, roi: 2200, status: 'active', trend: 'stable', monthlyGrowthRate: 12 },
  { id: 'app-store', name: 'App Store / Play Store', icon: 'Smartphone', currentUsers: 2400, projectedUsers: 10000000, conversionRate: 7.1, costPerAcquisition: 2.10, roi: 540, status: 'optimizing', trend: 'up', monthlyGrowthRate: 38 },
  { id: 'partnerships', name: 'JV / Strategic Partners', icon: 'Handshake', currentUsers: 890, projectedUsers: 6000000, conversionRate: 18.4, costPerAcquisition: 0, roi: Infinity, status: 'active', trend: 'up', monthlyGrowthRate: 65 },
  { id: 'podcast', name: 'Podcast / Audio', icon: 'Headphones', currentUsers: 450, projectedUsers: 2000000, conversionRate: 9.2, costPerAcquisition: 5.00, roi: 380, status: 'planned', trend: 'stable', monthlyGrowthRate: 0 },
  { id: 'whatsapp', name: 'WhatsApp Groups', icon: 'MessageSquare', currentUsers: 1200, projectedUsers: 8000000, conversionRate: 14.8, costPerAcquisition: 0.10, roi: 3400, status: 'active', trend: 'up', monthlyGrowthRate: 88 },
  { id: 'telegram', name: 'Telegram Communities', icon: 'Send', currentUsers: 980, projectedUsers: 5000000, conversionRate: 11.2, costPerAcquisition: 0.15, roi: 2800, status: 'active', trend: 'up', monthlyGrowthRate: 75 },
];

export const GROWTH_MILESTONES: GrowthMilestone[] = [
  { target: 1000, label: '1K Users', estimatedDate: '2026-04-01', strategy: 'Organic + Referral seed', confidence: 98, channels: ['organic-search', 'referral'] },
  { target: 10000, label: '10K Users', estimatedDate: '2026-06-15', strategy: 'Social media blitz + influencer launch', confidence: 92, channels: ['instagram', 'tiktok', 'influencer'] },
  { target: 100000, label: '100K Users', estimatedDate: '2026-10-01', strategy: 'Paid acquisition + viral referral loops', confidence: 85, channels: ['facebook', 'referral', 'app-store', 'whatsapp'] },
  { target: 1000000, label: '1M Users', estimatedDate: '2027-03-01', strategy: 'Multi-channel scaling + JV partnerships', confidence: 75, channels: ['partnerships', 'instagram', 'tiktok', 'youtube', 'email-marketing'] },
  { target: 10000000, label: '10M Users', estimatedDate: '2027-12-01', strategy: 'Global expansion + localization + strategic media', confidence: 60, channels: ['partnerships', 'app-store', 'telegram', 'whatsapp', 'podcast'] },
  { target: 100000000, label: '100M Users', estimatedDate: '2029-06-01', strategy: 'Market dominance + ecosystem lock-in + network effects', confidence: 42, channels: ['organic-search', 'referral', 'partnerships', 'app-store', 'influencer'] },
];

export const DIAGNOSTIC_REPORTS: DiagnosticReport[] = [
  {
    id: 'rpt-001',
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    type: 'hourly',
    overallScore: 94,
    modulesChecked: 28,
    issuesFound: 4,
    autoFixed: 1,
    recommendations: [
      { id: 'rec-001', module: 'KYC Verification', severity: 'high', title: 'Slow OCR Response', description: 'Document OCR averaging 1.8s — replace with parallel processing pipeline', action: 'replace', estimatedImpact: '+45% completion rate', autoFixable: false },
      { id: 'rec-002', module: 'Copy Investing', severity: 'critical', title: 'WebSocket Disconnects', description: 'Real-time sync drops every ~12 min under load. Replace with SSE + polling fallback.', action: 'replace', estimatedImpact: 'Eliminate 3.2% error rate', autoFixable: false },
      { id: 'rec-003', module: 'Lead Intelligence', severity: 'high', title: 'Scoring Model Outdated', description: 'Lead scoring model trained on 2024 data. Retrain with current conversion data.', action: 'update', estimatedImpact: '-41% false positive rate', autoFixable: true },
      { id: 'rec-004', module: 'AI Video Studio', severity: 'critical', title: 'Rendering Pipeline Failure', description: 'Video generation failing at 5.8% rate. Pipeline needs complete replacement.', action: 'replace', estimatedImpact: 'Unlock video content channel', autoFixable: false },
    ],
  },
  {
    id: 'rpt-002',
    timestamp: new Date(Date.now() - 1000 * 60 * 65).toISOString(),
    type: 'hourly',
    overallScore: 93,
    modulesChecked: 28,
    issuesFound: 5,
    autoFixed: 2,
    recommendations: [
      { id: 'rec-005', module: 'Landing Page', severity: 'medium', title: 'CTA Below Fold', description: 'Primary CTA button is below fold on mobile. A/B test with sticky CTA.', action: 'optimize', estimatedImpact: '+18% conversion', autoFixable: false },
      { id: 'rec-006', module: 'Investment Tab', severity: 'low', title: 'Image Load Optimization', description: 'Property images averaging 1.2MB. Convert to WebP and add progressive loading.', action: 'optimize', estimatedImpact: '-60% load time', autoFixable: true },
      { id: 'rec-007', module: 'Push Notifications', severity: 'medium', title: 'Delivery Rate Drop', description: 'Push delivery rate dropped 3% this week. Review token refresh logic.', action: 'fix', estimatedImpact: '+3% engagement', autoFixable: true },
    ],
  },
];

export const SYSTEM_PULSE_DATA: SystemPulse[] = Array.from({ length: 24 }, (_, i) => ({
  timestamp: new Date(Date.now() - (23 - i) * 60 * 60 * 1000).toISOString(),
  cpuUsage: 15 + Math.random() * 35,
  memoryUsage: 40 + Math.random() * 25,
  activeConnections: Math.floor(200 + Math.random() * 800),
  requestsPerSecond: Math.floor(50 + Math.random() * 450),
  errorRate: Math.random() * 2,
  avgResponseTime: 80 + Math.random() * 300,
}));

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
