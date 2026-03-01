import { lenders, lenderOutreachHistory, outreachCampaigns } from './lenders';

export type EngagementLevel = 'hot' | 'warm' | 'cold' | 'unresponsive';
export type FollowUpPriority = 'urgent' | 'high' | 'medium' | 'low';
export type OutreachChannel = 'email' | 'linkedin' | 'phone' | 'meeting';

export interface LenderEngagement {
  lenderId: string;
  lenderName: string;
  lenderEmail: string;
  contactName: string;
  category: string;
  aum: number;
  totalEmailsSent: number;
  totalOpened: number;
  totalClicked: number;
  totalReplied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  avgTimeSpentSeconds: number;
  lastOpenedAt: string | null;
  lastRepliedAt: string | null;
  lastEmailSentAt: string | null;
  engagementLevel: EngagementLevel;
  aiInterestScore: number;
  followUpPriority: FollowUpPriority;
  suggestedAction: string;
  suggestedChannel: OutreachChannel;
  nextFollowUpDate: string;
  totalTouchpoints: number;
  daysSinceLastContact: number;
  estimatedDealValue: number;
  conversionProbability: number;
}

export interface CampaignAnalytics {
  id: string;
  name: string;
  propertyName: string;
  sentAt: string;
  totalSent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  unsubscribed: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  bounceRate: number;
  avgTimeSpentSeconds: number;
  bestPerformingSubject: string;
  peakOpenHour: number;
  deviceBreakdown: { desktop: number; mobile: number; tablet: number };
  regionBreakdown: Record<string, number>;
  costPerEmail: number;
  totalCost: number;
  estimatedROI: number;
}

export interface OutreachFunnel {
  stage: string;
  count: number;
  percentage: number;
  color: string;
  dropOffRate: number;
}

export interface SmartRecommendation {
  id: string;
  type: 'follow_up' | 'new_outreach' | 'channel_switch' | 'timing' | 'content' | 'segment';
  priority: FollowUpPriority;
  title: string;
  description: string;
  lenderIds: string[];
  lenderCount: number;
  estimatedImpact: string;
  estimatedRevenue: number;
  actionLabel: string;
  aiConfidence: number;
}

export interface TimeSpentData {
  lenderId: string;
  lenderName: string;
  emailId: string;
  subject: string;
  timeSpentSeconds: number;
  scrollDepthPercent: number;
  linksClicked: string[];
  deviceType: 'desktop' | 'mobile' | 'tablet';
  openedAt: string;
}

export interface DailyOutreachMetric {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
}

export interface OutreachCostBreakdown {
  emailPlatform: number;
  aiGeneration: number;
  dataEnrichment: number;
  trackingPixels: number;
  total: number;
  costPerLead: number;
  costPerReply: number;
  monthlyBudget: number;
  budgetUsedPercent: number;
}

const generateEngagementData = (): LenderEngagement[] => {
  return lenders.map((lender, index) => {
    const totalSent = Math.floor(Math.random() * 8) + 1;
    const totalOpened = Math.floor(totalSent * (0.3 + Math.random() * 0.5));
    const totalClicked = Math.floor(totalOpened * (0.2 + Math.random() * 0.5));
    const totalReplied = Math.floor(totalClicked * (0.1 + Math.random() * 0.6));

    const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
    const clickRate = totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0;
    const replyRate = totalSent > 0 ? (totalReplied / totalSent) * 100 : 0;

    const avgTime = Math.floor(Math.random() * 180) + 5;

    let engagementLevel: EngagementLevel = 'unresponsive';
    if (totalReplied > 0) engagementLevel = 'hot';
    else if (totalClicked > 0) engagementLevel = 'warm';
    else if (totalOpened > 0) engagementLevel = 'cold';

    const aiScore = Math.min(100, Math.round(
      (openRate * 0.2) + (clickRate * 0.3) + (replyRate * 0.4) + (avgTime > 60 ? 10 : avgTime / 6)
    ));

    let followUpPriority: FollowUpPriority = 'low';
    if (aiScore > 70) followUpPriority = 'urgent';
    else if (aiScore > 45) followUpPriority = 'high';
    else if (aiScore > 20) followUpPriority = 'medium';

    const daysSince = Math.floor(Math.random() * 30) + 1;

    const actions = [
      'Send personalized follow-up with portfolio highlights',
      'Schedule a call — high engagement detected',
      'Share new property listing matching their criteria',
      'Re-engage with exclusive deal access',
      'Connect on LinkedIn before next email',
      'Send case study showing investor returns',
      'Offer 1-on-1 virtual property tour',
      'Share quarterly performance report',
    ];

    const channels: OutreachChannel[] = ['email', 'linkedin', 'phone', 'meeting'];

    const dealMultiplier = lender.aum > 100000000000 ? 0.001 : lender.aum > 10000000000 ? 0.005 : 0.01;
    const estimatedDeal = Math.round(lender.aum * dealMultiplier * (aiScore / 100));

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + Math.floor(Math.random() * 7) + 1);

    return {
      lenderId: lender.id,
      lenderName: lender.name,
      lenderEmail: lender.email,
      contactName: lender.contactName,
      category: lender.category,
      aum: lender.aum,
      totalEmailsSent: totalSent,
      totalOpened,
      totalClicked,
      totalReplied,
      openRate: Math.round(openRate * 10) / 10,
      clickRate: Math.round(clickRate * 10) / 10,
      replyRate: Math.round(replyRate * 10) / 10,
      avgTimeSpentSeconds: avgTime,
      lastOpenedAt: totalOpened > 0 ? new Date(Date.now() - daysSince * 86400000).toISOString() : null,
      lastRepliedAt: totalReplied > 0 ? new Date(Date.now() - (daysSince - 1) * 86400000).toISOString() : null,
      lastEmailSentAt: lender.lastContactedAt || new Date(Date.now() - daysSince * 86400000).toISOString(),
      engagementLevel,
      aiInterestScore: aiScore,
      followUpPriority,
      suggestedAction: actions[index % actions.length],
      suggestedChannel: channels[Math.floor(aiScore / 26)],
      nextFollowUpDate: nextDate.toISOString(),
      totalTouchpoints: totalSent + Math.floor(Math.random() * 3),
      daysSinceLastContact: daysSince,
      estimatedDealValue: estimatedDeal,
      conversionProbability: Math.min(95, Math.round(aiScore * 0.8 + Math.random() * 15)),
    };
  });
};

export const lenderEngagements: LenderEngagement[] = generateEngagementData();

export const campaignAnalytics: CampaignAnalytics[] = [
  {
    id: 'camp-1',
    name: 'Marina Bay Launch - Institutional',
    propertyName: 'Marina Bay Residences',
    sentAt: '2026-01-15T09:00:00Z',
    totalSent: 28,
    delivered: 27,
    opened: 19,
    clicked: 11,
    replied: 6,
    bounced: 1,
    unsubscribed: 0,
    deliveryRate: 96.4,
    openRate: 70.4,
    clickRate: 57.9,
    replyRate: 22.2,
    bounceRate: 3.6,
    avgTimeSpentSeconds: 94,
    bestPerformingSubject: 'Exclusive: Marina Bay - 8.5% Yield, First Lien Secured',
    peakOpenHour: 10,
    deviceBreakdown: { desktop: 62, mobile: 31, tablet: 7 },
    regionBreakdown: { 'North America': 18, 'Europe': 5, 'Middle East': 3, 'Asia Pacific': 2 },
    costPerEmail: 0.12,
    totalCost: 3.36,
    estimatedROI: 4200,
  },
  {
    id: 'camp-2',
    name: 'Manhattan Tower - HNWI',
    propertyName: 'Manhattan Office Tower',
    sentAt: '2026-01-22T10:00:00Z',
    totalSent: 35,
    delivered: 34,
    opened: 22,
    clicked: 14,
    replied: 8,
    bounced: 1,
    unsubscribed: 1,
    deliveryRate: 97.1,
    openRate: 64.7,
    clickRate: 63.6,
    replyRate: 23.5,
    bounceRate: 2.9,
    avgTimeSpentSeconds: 112,
    bestPerformingSubject: 'First Lien Security: Manhattan Class A - 6.8% Yield',
    peakOpenHour: 14,
    deviceBreakdown: { desktop: 58, mobile: 35, tablet: 7 },
    regionBreakdown: { 'North America': 22, 'Europe': 7, 'Middle East': 4, 'Asia Pacific': 2 },
    costPerEmail: 0.12,
    totalCost: 4.20,
    estimatedROI: 5800,
  },
  {
    id: 'camp-3',
    name: 'Dubai Marina - Gulf Investors',
    propertyName: 'Dubai Marina Complex',
    sentAt: '2026-02-01T08:00:00Z',
    totalSent: 18,
    delivered: 18,
    opened: 15,
    clicked: 10,
    replied: 5,
    bounced: 0,
    unsubscribed: 0,
    deliveryRate: 100,
    openRate: 83.3,
    clickRate: 66.7,
    replyRate: 27.8,
    bounceRate: 0,
    avgTimeSpentSeconds: 145,
    bestPerformingSubject: 'Premium Dubai Marina - Tokenized Opportunity for Gulf Investors',
    peakOpenHour: 9,
    deviceBreakdown: { desktop: 45, mobile: 48, tablet: 7 },
    regionBreakdown: { 'Middle East': 12, 'North America': 3, 'Europe': 2, 'Asia Pacific': 1 },
    costPerEmail: 0.12,
    totalCost: 2.16,
    estimatedROI: 7200,
  },
  {
    id: 'camp-4',
    name: 'Q1 Newsletter - All Lenders',
    propertyName: 'Portfolio Update',
    sentAt: '2026-02-10T07:00:00Z',
    totalSent: 65,
    delivered: 62,
    opened: 38,
    clicked: 18,
    replied: 4,
    bounced: 3,
    unsubscribed: 2,
    deliveryRate: 95.4,
    openRate: 61.3,
    clickRate: 47.4,
    replyRate: 6.5,
    bounceRate: 4.6,
    avgTimeSpentSeconds: 67,
    bestPerformingSubject: 'IPX Q1 2026: $48M Raised, 3 New Properties, 8.2% Avg Yield',
    peakOpenHour: 8,
    deviceBreakdown: { desktop: 55, mobile: 38, tablet: 7 },
    regionBreakdown: { 'North America': 38, 'Europe': 14, 'Middle East': 8, 'Asia Pacific': 5 },
    costPerEmail: 0.12,
    totalCost: 7.80,
    estimatedROI: 3100,
  },
];

export const outreachFunnel: OutreachFunnel[] = [
  { stage: 'Total Lenders', count: 65, percentage: 100, color: '#4A90D9', dropOffRate: 0 },
  { stage: 'Emails Sent', count: 146, percentage: 100, color: '#6366F1', dropOffRate: 0 },
  { stage: 'Delivered', count: 141, percentage: 96.6, color: '#8B5CF6', dropOffRate: 3.4 },
  { stage: 'Opened', count: 94, percentage: 66.7, color: '#FFD700', dropOffRate: 33.3 },
  { stage: 'Clicked', count: 53, percentage: 56.4, color: '#F59E0B', dropOffRate: 43.6 },
  { stage: 'Replied', count: 23, percentage: 24.5, color: '#00C48C', dropOffRate: 56.6 },
  { stage: 'Meeting Set', count: 11, percentage: 47.8, color: '#10B981', dropOffRate: 52.2 },
  { stage: 'Deal Interest', count: 6, percentage: 54.5, color: '#059669', dropOffRate: 45.5 },
];

export const smartRecommendations: SmartRecommendation[] = [
  {
    id: 'rec-1',
    type: 'follow_up',
    priority: 'urgent',
    title: 'Hot Leads Need Immediate Follow-Up',
    description: '8 lenders opened your email 3+ times and clicked property links. They are showing strong buying signals — follow up within 24 hours.',
    lenderIds: ['lender-2', 'lender-5', 'lender-8', 'lender-14', 'lender-15', 'lender-18', 'lender-24', 'lender-29'],
    lenderCount: 8,
    estimatedImpact: '+45% reply rate with 24hr follow-up',
    estimatedRevenue: 12500000,
    actionLabel: 'Send Follow-Up Now',
    aiConfidence: 92,
  },
  {
    id: 'rec-2',
    type: 'timing',
    priority: 'high',
    title: 'Optimize Send Time for Gulf Investors',
    description: 'Gulf region lenders open emails at 9-10 AM GST (UTC+4). Schedule next campaign for this window to boost open rates by ~18%.',
    lenderIds: ['lender-12', 'lender-15', 'lender-39', 'lender-40', 'lender-64'],
    lenderCount: 5,
    estimatedImpact: '+18% open rate improvement',
    estimatedRevenue: 3200000,
    actionLabel: 'Schedule Optimized Send',
    aiConfidence: 87,
  },
  {
    id: 'rec-3',
    type: 'channel_switch',
    priority: 'high',
    title: 'Switch to LinkedIn for Non-Openers',
    description: '12 lenders have not opened any emails after 3+ attempts. LinkedIn InMail has 3x higher engagement for this segment.',
    lenderIds: ['lender-6', 'lender-11', 'lender-17', 'lender-19', 'lender-22', 'lender-25', 'lender-27', 'lender-30', 'lender-33', 'lender-36', 'lender-37', 'lender-41'],
    lenderCount: 12,
    estimatedImpact: '3x higher engagement vs email',
    estimatedRevenue: 5000000,
    actionLabel: 'Create LinkedIn Campaign',
    aiConfidence: 84,
  },
  {
    id: 'rec-4',
    type: 'content',
    priority: 'medium',
    title: 'A/B Test: Case Study vs Direct Pitch',
    description: 'Lenders with "interested" status respond 28% better to case studies showing existing investor returns vs. new property pitches.',
    lenderIds: ['lender-2', 'lender-8', 'lender-14', 'lender-18', 'lender-24', 'lender-29', 'lender-32', 'lender-39', 'lender-45', 'lender-49', 'lender-55', 'lender-62', 'lender-63'],
    lenderCount: 13,
    estimatedImpact: '+28% response rate',
    estimatedRevenue: 8500000,
    actionLabel: 'Generate A/B Campaign',
    aiConfidence: 79,
  },
  {
    id: 'rec-5',
    type: 'segment',
    priority: 'medium',
    title: 'Target Family Offices with Personal Touch',
    description: '9 family offices in your pipeline prefer personalized outreach. Send handcrafted emails mentioning their specific portfolio interests.',
    lenderIds: ['lender-7', 'lender-39', 'lender-40', 'lender-41', 'lender-42', 'lender-43', 'lender-47', 'lender-57', 'lender-58', 'lender-64', 'lender-65'],
    lenderCount: 11,
    estimatedImpact: '+35% reply rate for family offices',
    estimatedRevenue: 15000000,
    actionLabel: 'Craft Personal Outreach',
    aiConfidence: 88,
  },
  {
    id: 'rec-6',
    type: 'new_outreach',
    priority: 'low',
    title: 'Untouched Prospects with High AUM',
    description: '14 prospects with $10B+ AUM have never been contacted. AI has ranked them by fit score — start with top 5.',
    lenderIds: ['lender-17', 'lender-19', 'lender-22', 'lender-25', 'lender-27', 'lender-30', 'lender-33', 'lender-36', 'lender-37', 'lender-41', 'lender-42', 'lender-50', 'lender-51', 'lender-54'],
    lenderCount: 14,
    estimatedImpact: 'Expand pipeline by $2.8T AUM',
    estimatedRevenue: 22000000,
    actionLabel: 'Start New Campaign',
    aiConfidence: 75,
  },
];

export const timeSpentData: TimeSpentData[] = [
  { lenderId: 'lender-2', lenderName: 'Blackstone Real Estate', emailId: 'out-1', subject: 'Marina Bay Residences - 8.5% Yield', timeSpentSeconds: 187, scrollDepthPercent: 92, linksClicked: ['property-details', 'prospectus'], deviceType: 'desktop', openedAt: '2026-01-20T14:30:00Z' },
  { lenderId: 'lender-8', lenderName: 'AIG Real Estate', emailId: 'out-2', subject: 'Manhattan Office Tower - First Lien', timeSpentSeconds: 234, scrollDepthPercent: 100, linksClicked: ['property-details', 'financials', 'schedule-call'], deviceType: 'desktop', openedAt: '2026-01-18T16:00:00Z' },
  { lenderId: 'lender-14', lenderName: 'Starwood Capital Group', emailId: 'out-3', subject: 'Paris Retail - 5.8% Yield', timeSpentSeconds: 156, scrollDepthPercent: 85, linksClicked: ['property-details'], deviceType: 'mobile', openedAt: '2026-01-15T13:00:00Z' },
  { lenderId: 'lender-5', lenderName: 'Ares Management', emailId: 'out-5', subject: 'Marina Bay - Tokenized RE Investment', timeSpentSeconds: 201, scrollDepthPercent: 95, linksClicked: ['property-details', 'prospectus', 'team-info'], deviceType: 'desktop', openedAt: '2026-01-21T11:15:00Z' },
  { lenderId: 'lender-15', lenderName: 'Dr. Hassan Al-Farsi', emailId: 'out-6', subject: 'Exclusive Dubai Opportunity', timeSpentSeconds: 312, scrollDepthPercent: 100, linksClicked: ['property-details', 'financials', 'prospectus', 'schedule-call'], deviceType: 'mobile', openedAt: '2026-01-24T09:20:00Z' },
  { lenderId: 'lender-7', lenderName: 'Wellington Family Office', emailId: 'out-7', subject: 'Premium Portfolio Addition', timeSpentSeconds: 178, scrollDepthPercent: 88, linksClicked: ['property-details', 'financials'], deviceType: 'desktop', openedAt: '2026-01-22T15:45:00Z' },
  { lenderId: 'lender-39', lenderName: 'Al Futtaim Group RE', emailId: 'out-8', subject: 'Dubai Marina - Gulf Investor Access', timeSpentSeconds: 267, scrollDepthPercent: 98, linksClicked: ['property-details', 'prospectus', 'schedule-call'], deviceType: 'tablet', openedAt: '2026-02-02T10:30:00Z' },
  { lenderId: 'lender-24', lenderName: 'Pretium Partners', emailId: 'out-9', subject: 'Residential Focus - High Yield Opportunity', timeSpentSeconds: 145, scrollDepthPercent: 78, linksClicked: ['property-details'], deviceType: 'desktop', openedAt: '2026-02-05T14:00:00Z' },
  { lenderId: 'lender-56', lenderName: 'ACORE Capital', emailId: 'out-10', subject: 'Bridge Lending Co-Investment', timeSpentSeconds: 198, scrollDepthPercent: 91, linksClicked: ['property-details', 'financials'], deviceType: 'desktop', openedAt: '2026-02-08T11:20:00Z' },
  { lenderId: 'lender-63', lenderName: 'Saudi Mohammed Al-Rajhi', emailId: 'out-11', subject: 'Premium RE Tokenized Access', timeSpentSeconds: 289, scrollDepthPercent: 100, linksClicked: ['property-details', 'prospectus', 'financials', 'team-info'], deviceType: 'mobile', openedAt: '2026-02-10T08:45:00Z' },
];

export const dailyMetrics: DailyOutreachMetric[] = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  const sent = Math.floor(Math.random() * 12) + 2;
  return {
    date: date.toISOString().split('T')[0],
    sent,
    opened: Math.floor(sent * (0.4 + Math.random() * 0.35)),
    clicked: Math.floor(sent * (0.15 + Math.random() * 0.25)),
    replied: Math.floor(sent * (0.05 + Math.random() * 0.15)),
  };
});

export const costBreakdown: OutreachCostBreakdown = {
  emailPlatform: 49,
  aiGeneration: 29,
  dataEnrichment: 79,
  trackingPixels: 0,
  total: 157,
  costPerLead: 2.42,
  costPerReply: 6.83,
  monthlyBudget: 500,
  budgetUsedPercent: 31.4,
};

export const getTopEngagedLenders = (limit: number = 10): LenderEngagement[] => {
  return [...lenderEngagements]
    .sort((a, b) => b.aiInterestScore - a.aiInterestScore)
    .slice(0, limit);
};

export const getHotLeads = (): LenderEngagement[] => {
  return lenderEngagements.filter(e => e.engagementLevel === 'hot');
};

export const getFollowUpQueue = (): LenderEngagement[] => {
  return [...lenderEngagements]
    .filter(e => e.followUpPriority === 'urgent' || e.followUpPriority === 'high')
    .sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.followUpPriority] - priorityOrder[b.followUpPriority];
    });
};

export const getOverallStats = () => {
  const totalSent = dailyMetrics.reduce((s, d) => s + d.sent, 0);
  const totalOpened = dailyMetrics.reduce((s, d) => s + d.opened, 0);
  const totalClicked = dailyMetrics.reduce((s, d) => s + d.clicked, 0);
  const totalReplied = dailyMetrics.reduce((s, d) => s + d.replied, 0);

  const hot = lenderEngagements.filter(e => e.engagementLevel === 'hot').length;
  const warm = lenderEngagements.filter(e => e.engagementLevel === 'warm').length;
  const cold = lenderEngagements.filter(e => e.engagementLevel === 'cold').length;
  const unresponsive = lenderEngagements.filter(e => e.engagementLevel === 'unresponsive').length;

  const totalPipelineValue = lenderEngagements.reduce((s, e) => s + e.estimatedDealValue, 0);
  const avgConversion = lenderEngagements.reduce((s, e) => s + e.conversionProbability, 0) / lenderEngagements.length;

  return {
    totalSent,
    totalOpened,
    totalClicked,
    totalReplied,
    openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 1000) / 10 : 0,
    clickRate: totalOpened > 0 ? Math.round((totalClicked / totalOpened) * 1000) / 10 : 0,
    replyRate: totalSent > 0 ? Math.round((totalReplied / totalSent) * 1000) / 10 : 0,
    hotLeads: hot,
    warmLeads: warm,
    coldLeads: cold,
    unresponsive,
    totalPipelineValue,
    avgConversionProbability: Math.round(avgConversion * 10) / 10,
    totalCampaigns: campaignAnalytics.length,
    activeLenders: lenders.length,
  };
};
