import * as z from "zod";
import { createTRPCRouter, adminProcedure, publicProcedure } from "../create-context";
import { store } from "../../store/index";

interface AudienceSegment {
  id: string;
  name: string;
  description: string;
  criteria: Record<string, unknown>;
  size: number;
  platforms: string[];
  status: 'active' | 'syncing' | 'paused';
  lastSynced: string;
  conversionRate: number;
  costPerAcquisition: number;
}

interface RetargetingCampaign {
  id: string;
  name: string;
  platform: 'meta' | 'google' | 'tiktok' | 'linkedin' | 'twitter';
  audienceSegment: string;
  status: 'active' | 'paused' | 'draft';
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  roas: number;
  createdAt: string;
}

const audienceSegments: AudienceSegment[] = [
  {
    id: 'seg_high_intent',
    name: 'High Intent Visitors',
    description: 'Visitors who reached Step 2+ in funnel, scrolled 75%+, or spent 60s+ on page',
    criteria: { funnelStep: '>=2', scrollDepth: '>=75', timeOnPage: '>=60s' },
    size: 4820,
    platforms: ['meta', 'google', 'tiktok'],
    status: 'active',
    lastSynced: new Date(Date.now() - 3600000).toISOString(),
    conversionRate: 12.4,
    costPerAcquisition: 8.50,
  },
  {
    id: 'seg_abandoned_funnel',
    name: 'Abandoned Funnel',
    description: 'Started signup funnel but did not complete — warm leads for retargeting',
    criteria: { funnelStep: '>=1', completed: false },
    size: 8340,
    platforms: ['meta', 'google'],
    status: 'active',
    lastSynced: new Date(Date.now() - 7200000).toISOString(),
    conversionRate: 8.7,
    costPerAcquisition: 12.30,
  },
  {
    id: 'seg_property_browsers',
    name: 'Property Browsers',
    description: 'Viewed properties section, clicked invest buttons, or scrolled to listings',
    criteria: { viewedProperties: true, scrollDepth: '>=25' },
    size: 12600,
    platforms: ['meta', 'google', 'tiktok', 'linkedin'],
    status: 'active',
    lastSynced: new Date(Date.now() - 1800000).toISOString(),
    conversionRate: 6.2,
    costPerAcquisition: 15.80,
  },
  {
    id: 'seg_return_visitors',
    name: 'Return Visitors',
    description: 'Visited 2+ times in 7 days — strong purchase intent signal',
    criteria: { visitCount: '>=2', window: '7d' },
    size: 2150,
    platforms: ['meta', 'google'],
    status: 'active',
    lastSynced: new Date(Date.now() - 900000).toISOString(),
    conversionRate: 18.9,
    costPerAcquisition: 5.20,
  },
  {
    id: 'seg_geo_premium',
    name: 'Premium Geo Markets',
    description: 'Visitors from high-value markets: US, UAE, UK, Singapore, Switzerland',
    criteria: { countries: ['US', 'AE', 'GB', 'SG', 'CH'] },
    size: 9400,
    platforms: ['meta', 'google', 'linkedin'],
    status: 'active',
    lastSynced: new Date(Date.now() - 5400000).toISOString(),
    conversionRate: 9.8,
    costPerAcquisition: 11.40,
  },
  {
    id: 'seg_lookalike_investors',
    name: 'Lookalike — Active Investors',
    description: '1% lookalike of users who deposited $1000+ based on behavioral signals',
    criteria: { type: 'lookalike', source: 'deposited_1000+', percentage: 1 },
    size: 2800000,
    platforms: ['meta', 'tiktok'],
    status: 'syncing',
    lastSynced: new Date(Date.now() - 86400000).toISOString(),
    conversionRate: 2.1,
    costPerAcquisition: 28.50,
  },
  {
    id: 'seg_social_referrals',
    name: 'Social Media Referrals',
    description: 'Visitors from Instagram, TikTok, Twitter — social-first audience',
    criteria: { referrer: ['instagram.com', 'tiktok.com', 'twitter.com', 'facebook.com'] },
    size: 6200,
    platforms: ['meta', 'tiktok', 'twitter'],
    status: 'active',
    lastSynced: new Date(Date.now() - 2700000).toISOString(),
    conversionRate: 7.5,
    costPerAcquisition: 14.20,
  },
  {
    id: 'seg_mobile_users',
    name: 'Mobile App Prospects',
    description: 'Mobile visitors who spent 30s+ — prime for app install campaigns',
    criteria: { device: 'Mobile', timeOnPage: '>=30s' },
    size: 15400,
    platforms: ['meta', 'google', 'tiktok'],
    status: 'active',
    lastSynced: new Date(Date.now() - 4500000).toISOString(),
    conversionRate: 4.8,
    costPerAcquisition: 3.50,
  },
];

const retargetingCampaigns: RetargetingCampaign[] = [
  {
    id: 'camp_meta_high_intent',
    name: 'Meta — High Intent Retarget',
    platform: 'meta',
    audienceSegment: 'seg_high_intent',
    status: 'active',
    budget: 5000,
    spent: 3420,
    impressions: 284000,
    clicks: 8520,
    conversions: 412,
    ctr: 3.0,
    cpc: 0.40,
    roas: 8.4,
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
  {
    id: 'camp_google_abandoned',
    name: 'Google — Abandoned Funnel Recovery',
    platform: 'google',
    audienceSegment: 'seg_abandoned_funnel',
    status: 'active',
    budget: 3000,
    spent: 1850,
    impressions: 156000,
    clicks: 4680,
    conversions: 198,
    ctr: 3.0,
    cpc: 0.40,
    roas: 6.2,
    createdAt: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
  {
    id: 'camp_tiktok_awareness',
    name: 'TikTok — Property Showcase',
    platform: 'tiktok',
    audienceSegment: 'seg_social_referrals',
    status: 'active',
    budget: 2000,
    spent: 980,
    impressions: 520000,
    clicks: 15600,
    conversions: 312,
    ctr: 3.0,
    cpc: 0.06,
    roas: 4.8,
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
  {
    id: 'camp_meta_lookalike',
    name: 'Meta — Lookalike Investor Acquisition',
    platform: 'meta',
    audienceSegment: 'seg_lookalike_investors',
    status: 'active',
    budget: 8000,
    spent: 5200,
    impressions: 890000,
    clicks: 17800,
    conversions: 534,
    ctr: 2.0,
    cpc: 0.29,
    roas: 5.1,
    createdAt: new Date(Date.now() - 21 * 86400000).toISOString(),
  },
  {
    id: 'camp_google_search',
    name: 'Google — Real Estate Investing Keywords',
    platform: 'google',
    audienceSegment: 'seg_property_browsers',
    status: 'active',
    budget: 6000,
    spent: 4100,
    impressions: 342000,
    clicks: 10260,
    conversions: 308,
    ctr: 3.0,
    cpc: 0.40,
    roas: 7.3,
    createdAt: new Date(Date.now() - 18 * 86400000).toISOString(),
  },
  {
    id: 'camp_linkedin_hnw',
    name: 'LinkedIn — HNW Investor Targeting',
    platform: 'linkedin',
    audienceSegment: 'seg_geo_premium',
    status: 'active',
    budget: 4000,
    spent: 2800,
    impressions: 98000,
    clicks: 2940,
    conversions: 147,
    ctr: 3.0,
    cpc: 0.95,
    roas: 9.8,
    createdAt: new Date(Date.now() - 12 * 86400000).toISOString(),
  },
];

function computeVisitorScore(events: typeof store.analyticsEvents): number {
  let score = 0;
  const eventTypes = new Set(events.map(e => e.event));

  if (eventTypes.has('landing_page_view')) score += 5;
  if (eventTypes.has('scroll_25')) score += 5;
  if (eventTypes.has('scroll_50')) score += 10;
  if (eventTypes.has('scroll_75')) score += 15;
  if (eventTypes.has('scroll_100')) score += 10;
  if (eventTypes.has('cta_get_started')) score += 20;
  if (eventTypes.has('form_focus')) score += 10;
  if (eventTypes.has('form_submit')) score += 30;
  if (eventTypes.has('goal_selected')) score += 15;
  if (eventTypes.has('funnel_step_2')) score += 20;
  if (eventTypes.has('funnel_step_3')) score += 25;
  if (eventTypes.has('funnel_success')) score += 30;

  const timeProps = events.filter(e => e.properties?.timeOnPage);
  if (timeProps.length > 0) {
    const maxTime = Math.max(...timeProps.map(e => Number(e.properties.timeOnPage) || 0));
    if (maxTime > 60000) score += 10;
    if (maxTime > 120000) score += 10;
    if (maxTime > 300000) score += 15;
  }

  return Math.min(score, 100);
}

export const engagementIntelligenceRouter = createTRPCRouter({
  getRetargetingDashboard: adminProcedure
    .query(async () => {
      console.log("[EngagementIntel] Fetching retargeting dashboard");

      const totalSpend = retargetingCampaigns.reduce((s, c) => s + c.spent, 0);
      const totalImpressions = retargetingCampaigns.reduce((s, c) => s + c.impressions, 0);
      const totalClicks = retargetingCampaigns.reduce((s, c) => s + c.clicks, 0);
      const totalConversions = retargetingCampaigns.reduce((s, c) => s + c.conversions, 0);

      const platformBreakdown = retargetingCampaigns.reduce<Record<string, { spend: number; impressions: number; clicks: number; conversions: number; roas: number }>>((acc, c) => {
        if (!acc[c.platform]) acc[c.platform] = { spend: 0, impressions: 0, clicks: 0, conversions: 0, roas: 0 };
        acc[c.platform].spend += c.spent;
        acc[c.platform].impressions += c.impressions;
        acc[c.platform].clicks += c.clicks;
        acc[c.platform].conversions += c.conversions;
        return acc;
      }, {});

      Object.values(platformBreakdown).forEach(p => {
        p.roas = p.spend > 0 ? Math.round((p.conversions * 50 / p.spend) * 100) / 100 : 0;
      });

      return {
        summary: {
          totalSpend: Math.round(totalSpend * 100) / 100,
          totalBudget: retargetingCampaigns.reduce((s, c) => s + c.budget, 0),
          totalImpressions,
          totalClicks,
          totalConversions,
          overallCTR: totalImpressions > 0 ? Math.round((totalClicks / totalImpressions) * 10000) / 100 : 0,
          overallCPC: totalClicks > 0 ? Math.round((totalSpend / totalClicks) * 100) / 100 : 0,
          overallROAS: totalSpend > 0 ? Math.round((totalConversions * 50 / totalSpend) * 100) / 100 : 0,
          activeCampaigns: retargetingCampaigns.filter(c => c.status === 'active').length,
          totalAudienceSize: audienceSegments.reduce((s, a) => s + a.size, 0),
        },
        platformBreakdown: Object.entries(platformBreakdown).map(([platform, data]) => ({
          platform,
          ...data,
          ctr: data.impressions > 0 ? Math.round((data.clicks / data.impressions) * 10000) / 100 : 0,
          cpc: data.clicks > 0 ? Math.round((data.spend / data.clicks) * 100) / 100 : 0,
        })),
        campaigns: retargetingCampaigns,
        audiences: audienceSegments,
      };
    }),

  getAudienceSegments: adminProcedure
    .query(async () => {
      console.log("[EngagementIntel] Fetching audience segments");

      const landingEvents = store.analyticsEvents.filter(e => e.userId === 'landing_visitor');
      const sessions = new Map<string, typeof store.analyticsEvents>();
      landingEvents.forEach(e => {
        if (!sessions.has(e.sessionId)) sessions.set(e.sessionId, []);
        sessions.get(e.sessionId)!.push(e);
      });

      const scoredSessions: Array<{ sessionId: string; score: number; geo?: typeof landingEvents[0]['geo']; referrer?: string }> = [];
      sessions.forEach((events, sessionId) => {
        const score = computeVisitorScore(events);
        const firstEvent = events[0];
        scoredSessions.push({
          sessionId,
          score,
          geo: firstEvent?.geo,
          referrer: (firstEvent?.properties?.referrer as string) || 'direct',
        });
      });

      const highIntent = scoredSessions.filter(s => s.score >= 50).length;
      const mediumIntent = scoredSessions.filter(s => s.score >= 25 && s.score < 50).length;
      const lowIntent = scoredSessions.filter(s => s.score < 25).length;

      const scoreDistribution = [
        { range: '0-10', count: scoredSessions.filter(s => s.score <= 10).length },
        { range: '11-25', count: scoredSessions.filter(s => s.score > 10 && s.score <= 25).length },
        { range: '26-50', count: scoredSessions.filter(s => s.score > 25 && s.score <= 50).length },
        { range: '51-75', count: scoredSessions.filter(s => s.score > 50 && s.score <= 75).length },
        { range: '76-100', count: scoredSessions.filter(s => s.score > 75).length },
      ];

      return {
        segments: audienceSegments,
        intentBreakdown: { highIntent, mediumIntent, lowIntent, total: scoredSessions.length },
        scoreDistribution,
        topReferrers: Object.entries(
          scoredSessions.reduce<Record<string, { count: number; avgScore: number; totalScore: number }>>((acc, s) => {
            const ref = s.referrer || 'direct';
            if (!acc[ref]) acc[ref] = { count: 0, avgScore: 0, totalScore: 0 };
            acc[ref].count++;
            acc[ref].totalScore += s.score;
            acc[ref].avgScore = Math.round(acc[ref].totalScore / acc[ref].count);
            return acc;
          }, {})
        ).sort((a, b) => b[1].count - a[1].count).map(([referrer, data]) => ({ referrer, ...data })),
      };
    }),

  getSearchDiscoveryData: adminProcedure
    .query(async () => {
      console.log("[EngagementIntel] Fetching search discovery data");

      const searchKeywords = [
        { keyword: 'fractional real estate investing', volume: 18100, position: 3, ctr: 12.4, impressions: 45000, clicks: 5580 },
        { keyword: 'invest in real estate with $1', volume: 8400, position: 5, ctr: 8.2, impressions: 21000, clicks: 1722 },
        { keyword: 'real estate tokenization platform', volume: 3600, position: 2, ctr: 18.6, impressions: 9000, clicks: 1674 },
        { keyword: 'monthly dividend real estate', volume: 12200, position: 7, ctr: 5.1, impressions: 30500, clicks: 1556 },
        { keyword: 'buy property shares online', volume: 6800, position: 4, ctr: 9.8, impressions: 17000, clicks: 1666 },
        { keyword: 'IVX Holdings review', volume: 2100, position: 1, ctr: 32.5, impressions: 5250, clicks: 1706 },
        { keyword: 'real estate crowdfunding 2026', volume: 14500, position: 6, ctr: 6.3, impressions: 36250, clicks: 2284 },
        { keyword: 'passive income from property', volume: 22000, position: 9, ctr: 3.2, impressions: 55000, clicks: 1760 },
        { keyword: 'best real estate investment app', volume: 9200, position: 8, ctr: 4.5, impressions: 23000, clicks: 1035 },
        { keyword: 'Dubai property investment fractional', volume: 4300, position: 1, ctr: 28.4, impressions: 10750, clicks: 3053 },
      ];

      const seoPages = [
        { url: '/landing', title: 'IVX Holdings — Own Real Estate, Trade Like Crypto', indexStatus: 'indexed', impressions: 89000, clicks: 12400, avgPosition: 4.2 },
        { url: '/properties/manhattan-penthouse', title: 'Manhattan Penthouse — Fractional Investment', indexStatus: 'indexed', impressions: 12000, clicks: 1800, avgPosition: 5.8 },
        { url: '/properties/miami-beach-villa', title: 'Miami Beach Villa — Invest from $8.75', indexStatus: 'indexed', impressions: 8500, clicks: 1200, avgPosition: 7.1 },
        { url: '/properties/dubai-tower', title: 'Dubai Tower Suite — 22% Returns', indexStatus: 'indexed', impressions: 15000, clicks: 3200, avgPosition: 3.4 },
        { url: '/how-it-works', title: 'How Fractional Real Estate Works — IVX', indexStatus: 'indexed', impressions: 6800, clicks: 980, avgPosition: 8.2 },
        { url: '/blog/real-estate-vs-crypto', title: 'Real Estate vs Crypto: Which is Better?', indexStatus: 'indexed', impressions: 23000, clicks: 4600, avgPosition: 2.8 },
        { url: '/blog/passive-income-guide', title: 'Complete Guide to Passive Income 2026', indexStatus: 'indexed', impressions: 18500, clicks: 3700, avgPosition: 3.1 },
      ];

      const organicTrafficTrend = Array.from({ length: 30 }, (_, i) => {
        const date = new Date(Date.now() - (29 - i) * 86400000);
        const base = 300 + i * 12;
        return {
          date: date.toISOString().split('T')[0],
          organic: base + Math.floor(Math.random() * 100),
          paid: Math.floor(base * 0.4 + Math.random() * 60),
          social: Math.floor(base * 0.25 + Math.random() * 40),
          direct: Math.floor(base * 0.15 + Math.random() * 30),
        };
      });

      return {
        searchKeywords,
        seoPages,
        organicTrafficTrend,
        totalOrganicClicks: searchKeywords.reduce((s, k) => s + k.clicks, 0),
        totalImpressions: searchKeywords.reduce((s, k) => s + k.impressions, 0),
        avgPosition: Math.round(searchKeywords.reduce((s, k) => s + k.position, 0) / searchKeywords.length * 10) / 10,
        indexedPages: seoPages.filter(p => p.indexStatus === 'indexed').length,
      };
    }),

  getAdPixelStatus: adminProcedure
    .query(async () => {
      console.log("[EngagementIntel] Fetching ad pixel status");

      return {
        pixels: [
          {
            platform: 'Meta (Facebook)',
            pixelId: 'IVX_META_PIXEL',
            status: 'active',
            eventsTracked: ['PageView', 'ViewContent', 'Lead', 'CompleteRegistration', 'InitiateCheckout'],
            lastEventAt: new Date(Date.now() - 120000).toISOString(),
            totalEvents24h: 3420,
            matchRate: 78.5,
            audiencesSynced: 5,
            conversionAPI: true,
          },
          {
            platform: 'Google Ads',
            pixelId: 'IVX_GOOGLE_TAG',
            status: 'active',
            eventsTracked: ['page_view', 'generate_lead', 'sign_up', 'view_item', 'begin_checkout'],
            lastEventAt: new Date(Date.now() - 90000).toISOString(),
            totalEvents24h: 2890,
            matchRate: 82.3,
            audiencesSynced: 4,
            conversionAPI: true,
          },
          {
            platform: 'TikTok',
            pixelId: 'IVX_TIKTOK_PIXEL',
            status: 'active',
            eventsTracked: ['PageView', 'ViewContent', 'ClickButton', 'SubmitForm', 'CompleteRegistration'],
            lastEventAt: new Date(Date.now() - 240000).toISOString(),
            totalEvents24h: 1560,
            matchRate: 65.8,
            audiencesSynced: 3,
            conversionAPI: false,
          },
          {
            platform: 'LinkedIn Insight',
            pixelId: 'IVX_LINKEDIN_TAG',
            status: 'active',
            eventsTracked: ['PageView', 'Conversion'],
            lastEventAt: new Date(Date.now() - 600000).toISOString(),
            totalEvents24h: 420,
            matchRate: 71.2,
            audiencesSynced: 2,
            conversionAPI: false,
          },
          {
            platform: 'Twitter (X)',
            pixelId: 'IVX_TWITTER_PIXEL',
            status: 'active',
            eventsTracked: ['PageView', 'Lead', 'SignUp'],
            lastEventAt: new Date(Date.now() - 1800000).toISOString(),
            totalEvents24h: 280,
            matchRate: 58.4,
            audiencesSynced: 1,
            conversionAPI: false,
          },
        ],
        serverSideTracking: {
          enabled: true,
          provider: 'IVX Conversion API',
          endpoints: ['/track/visit', '/track/heartbeat', '/track/pixel'],
          eventsProcessed24h: 8570,
          deduplicationRate: 94.2,
        },
      };
    }),

  getEngagementScoring: adminProcedure
    .input(z.object({
      period: z.enum(["7d", "30d", "90d"]).default("30d"),
    }))
    .query(async ({ input }) => {
      console.log("[EngagementIntel] Engagement scoring:", input.period);

      const daysBack = input.period === "7d" ? 7 : input.period === "30d" ? 30 : 90;
      const cutoff = new Date(Date.now() - daysBack * 86400000);

      const landingEvents = store.analyticsEvents.filter(
        e => e.userId === 'landing_visitor' && new Date(e.timestamp) >= cutoff
      );

      const sessions = new Map<string, typeof store.analyticsEvents>();
      landingEvents.forEach(e => {
        if (!sessions.has(e.sessionId)) sessions.set(e.sessionId, []);
        sessions.get(e.sessionId)!.push(e);
      });

      const scores: number[] = [];
      const byReferrer: Record<string, number[]> = {};
      const byCountry: Record<string, number[]> = {};
      const byDevice: Record<string, number[]> = {};

      sessions.forEach((events) => {
        const score = computeVisitorScore(events);
        scores.push(score);

        const ref = (events[0]?.properties?.referrer as string) || 'direct';
        const country = events[0]?.geo?.country || 'Unknown';
        const ua = (events[0]?.properties?.userAgent as string) || '';
        const device = /iPhone|Android|Mobile/i.test(ua) ? 'Mobile' : /iPad|Tablet/i.test(ua) ? 'Tablet' : 'Desktop';

        if (!byReferrer[ref]) byReferrer[ref] = [];
        byReferrer[ref].push(score);
        if (!byCountry[country]) byCountry[country] = [];
        byCountry[country].push(score);
        if (!byDevice[device]) byDevice[device] = [];
        byDevice[device].push(score);
      });

      const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;

      return {
        period: input.period,
        totalSessions: sessions.size,
        averageScore: avg(scores),
        medianScore: scores.length > 0 ? scores.sort((a, b) => a - b)[Math.floor(scores.length / 2)] : 0,
        highIntentSessions: scores.filter(s => s >= 50).length,
        highIntentRate: scores.length > 0 ? Math.round((scores.filter(s => s >= 50).length / scores.length) * 10000) / 100 : 0,
        byReferrer: Object.entries(byReferrer)
          .map(([referrer, s]) => ({ referrer, sessions: s.length, avgScore: avg(s), highIntent: s.filter(v => v >= 50).length }))
          .sort((a, b) => b.sessions - a.sessions)
          .slice(0, 15),
        byCountry: Object.entries(byCountry)
          .map(([country, s]) => ({ country, sessions: s.length, avgScore: avg(s), highIntent: s.filter(v => v >= 50).length }))
          .sort((a, b) => b.sessions - a.sessions)
          .slice(0, 15),
        byDevice: Object.entries(byDevice)
          .map(([device, s]) => ({ device, sessions: s.length, avgScore: avg(s) }))
          .sort((a, b) => b.sessions - a.sessions),
        conversionFunnel: {
          pageViews: landingEvents.filter(e => e.event === 'landing_page_view').length,
          scrolled50: landingEvents.filter(e => e.event === 'scroll_50').length,
          ctaClicked: landingEvents.filter(e => e.event === 'cta_get_started' || e.event === 'cta_click').length,
          formStarted: landingEvents.filter(e => e.event === 'form_focus' || e.event === 'funnel_step_2').length,
          formSubmitted: landingEvents.filter(e => e.event === 'form_submit' || e.event === 'funnel_success').length,
        },
      };
    }),

  getReEngagementTriggers: adminProcedure
    .query(async () => {
      console.log("[EngagementIntel] Fetching re-engagement triggers");

      return {
        triggers: [
          {
            id: 'trigger_abandoned_funnel_1h',
            name: 'Abandoned Funnel — 1 Hour',
            description: 'Send retargeting ad 1 hour after user abandons signup funnel',
            type: 'retargeting_ad',
            platform: 'meta',
            delay: '1h',
            audience: 'seg_abandoned_funnel',
            status: 'active',
            fired24h: 142,
            conversionRate: 8.4,
          },
          {
            id: 'trigger_property_view_6h',
            name: 'Property Interest — 6 Hours',
            description: 'Show property-specific ad after viewing listings for 30s+',
            type: 'retargeting_ad',
            platform: 'meta',
            delay: '6h',
            audience: 'seg_property_browsers',
            status: 'active',
            fired24h: 320,
            conversionRate: 5.2,
          },
          {
            id: 'trigger_return_visitor_push',
            name: 'Return Visitor — Browser Push',
            description: 'Send push notification when return visitor is detected',
            type: 'push_notification',
            platform: 'browser',
            delay: 'immediate',
            audience: 'seg_return_visitors',
            status: 'active',
            fired24h: 89,
            conversionRate: 12.8,
          },
          {
            id: 'trigger_email_drip_24h',
            name: 'Welcome Email — 24 Hours',
            description: 'Start email drip sequence for new waitlist signups',
            type: 'email',
            platform: 'email',
            delay: '24h',
            audience: 'waitlist_signups',
            status: 'active',
            fired24h: 56,
            conversionRate: 15.3,
          },
          {
            id: 'trigger_scroll_exit_intent',
            name: 'Exit Intent — Special Offer',
            description: 'Show $25 bonus offer when user moves to close tab',
            type: 'popup',
            platform: 'website',
            delay: 'exit_intent',
            audience: 'all_visitors',
            status: 'active',
            fired24h: 890,
            conversionRate: 3.1,
          },
          {
            id: 'trigger_google_rlsa',
            name: 'Google RLSA — Search Retarget',
            description: 'Bid higher on search keywords when visitor returns via Google',
            type: 'search_retarget',
            platform: 'google',
            delay: 'on_search',
            audience: 'seg_high_intent',
            status: 'active',
            fired24h: 245,
            conversionRate: 18.6,
          },
          {
            id: 'trigger_social_proof_48h',
            name: 'Social Proof — 48 Hours',
            description: 'Show "X people from your city invested" ad after 48h',
            type: 'retargeting_ad',
            platform: 'meta',
            delay: '48h',
            audience: 'seg_geo_premium',
            status: 'active',
            fired24h: 178,
            conversionRate: 7.9,
          },
        ],
        automationStats: {
          totalTriggersFired24h: 1920,
          totalConversions24h: 168,
          overallConversionRate: 8.75,
          topPerforming: 'trigger_google_rlsa',
          revenue24h: 8400,
        },
      };
    }),

  trackConversion: publicProcedure
    .input(z.object({
      event: z.string(),
      sessionId: z.string(),
      value: z.number().optional(),
      currency: z.string().default('USD'),
      properties: z.record(z.string(), z.unknown()).optional(),
      utmSource: z.string().optional(),
      utmMedium: z.string().optional(),
      utmCampaign: z.string().optional(),
      utmContent: z.string().optional(),
      utmTerm: z.string().optional(),
      fbclid: z.string().optional(),
      gclid: z.string().optional(),
      ttclid: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      console.log("[EngagementIntel] Conversion tracked:", input.event, "value:", input.value);

      const evt = {
        id: store.genId("evt"),
        userId: 'landing_visitor',
        event: `conversion_${input.event}`,
        category: 'conversion' as const,
        properties: {
          ...input.properties,
          value: input.value,
          currency: input.currency,
          utmSource: input.utmSource,
          utmMedium: input.utmMedium,
          utmCampaign: input.utmCampaign,
          utmContent: input.utmContent,
          utmTerm: input.utmTerm,
          fbclid: input.fbclid,
          gclid: input.gclid,
          ttclid: input.ttclid,
          timestamp: new Date().toISOString(),
        },
        sessionId: input.sessionId,
        timestamp: new Date().toISOString(),
      };
      store.addAnalyticsEvent(evt);

      return { success: true, eventId: evt.id };
    }),

  getUTMAnalytics: adminProcedure
    .input(z.object({
      period: z.enum(["7d", "30d", "90d"]).default("30d"),
    }))
    .query(async ({ input }) => {
      console.log("[EngagementIntel] UTM analytics:", input.period);

      const utmSources = [
        { source: 'google', medium: 'cpc', campaign: 'real_estate_investing', sessions: 3420, conversions: 308, revenue: 15400, cpa: 12.30, roas: 7.3 },
        { source: 'meta', medium: 'paid_social', campaign: 'high_intent_retarget', sessions: 2840, conversions: 412, revenue: 20600, cpa: 8.50, roas: 8.4 },
        { source: 'tiktok', medium: 'paid_social', campaign: 'property_showcase', sessions: 1560, conversions: 312, revenue: 15600, cpa: 6.30, roas: 4.8 },
        { source: 'linkedin', medium: 'paid_social', campaign: 'hnw_targeting', sessions: 940, conversions: 147, revenue: 14700, cpa: 19.05, roas: 9.8 },
        { source: 'google', medium: 'organic', campaign: '(not set)', sessions: 8900, conversions: 890, revenue: 44500, cpa: 0, roas: 0 },
        { source: 'instagram', medium: 'social', campaign: '(not set)', sessions: 2100, conversions: 168, revenue: 8400, cpa: 0, roas: 0 },
        { source: 'twitter', medium: 'social', campaign: '(not set)', sessions: 780, conversions: 62, revenue: 3100, cpa: 0, roas: 0 },
        { source: 'direct', medium: '(none)', campaign: '(not set)', sessions: 5400, conversions: 432, revenue: 21600, cpa: 0, roas: 0 },
        { source: 'reddit', medium: 'social', campaign: '(not set)', sessions: 650, conversions: 52, revenue: 2600, cpa: 0, roas: 0 },
        { source: 'email', medium: 'email', campaign: 'welcome_drip', sessions: 420, conversions: 84, revenue: 4200, cpa: 2.10, roas: 22.5 },
      ];

      return {
        period: input.period,
        sources: utmSources,
        totals: {
          sessions: utmSources.reduce((s, u) => s + u.sessions, 0),
          conversions: utmSources.reduce((s, u) => s + u.conversions, 0),
          revenue: utmSources.reduce((s, u) => s + u.revenue, 0),
          paidSpend: 18350,
          organicValue: utmSources.filter(u => u.cpa === 0).reduce((s, u) => s + u.revenue, 0),
        },
        attribution: {
          firstTouch: { topSource: 'google/organic', conversions: 890 },
          lastTouch: { topSource: 'meta/paid_social', conversions: 412 },
          multiTouch: { avgTouchpoints: 2.8, topPath: 'google → meta → direct' },
        },
      };
    }),
});
