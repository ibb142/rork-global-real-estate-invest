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

function buildAudienceSegmentsFromStore(): AudienceSegment[] {
  const landingEvents = store.analyticsEvents.filter(e => e.userId === 'landing_visitor');
  const sessions = new Map<string, typeof store.analyticsEvents>();
  landingEvents.forEach(e => {
    if (!sessions.has(e.sessionId)) sessions.set(e.sessionId, []);
    sessions.get(e.sessionId)!.push(e);
  });

  const totalSessions = sessions.size;
  if (totalSessions === 0) return [];

  let highIntent = 0;
  let abandoned = 0;
  let scrolled = 0;
  let _returnVisitors = 0;
  let mobileSessions = 0;
  const countrySet = new Set<string>();
  const referrerSet = new Set<string>();

  sessions.forEach((events) => {
    const score = computeVisitorScore(events);
    const hasForm = events.some(e => e.event === 'form_submit');
    const hasCta = events.some(e => e.event.startsWith('cta_'));
    const hasScroll = events.some(e => e.event === 'scroll_75' || e.event === 'scroll_100');
    const ua = (events[0]?.properties?.userAgent as string) || '';
    const isMobile = /iPhone|Android|Mobile/i.test(ua);
    const ref = (events[0]?.properties?.referrer as string) || 'direct';
    const country = events[0]?.geo?.country || 'Unknown';

    if (score >= 50) highIntent++;
    if (hasCta && !hasForm) abandoned++;
    if (hasScroll) scrolled++;
    if (isMobile) mobileSessions++;
    if (country !== 'Unknown') countrySet.add(country);
    if (ref !== 'direct') referrerSet.add(ref);
  });

  const segments: AudienceSegment[] = [];
  if (highIntent > 0) {
    segments.push({
      id: 'seg_high_intent', name: 'High Intent Visitors',
      description: 'Visitors who scored 50+ on engagement (deep scroll, CTA clicks, form submits)',
      criteria: { minScore: 50 }, size: highIntent, platforms: ['meta', 'google'],
      status: 'active', lastSynced: new Date().toISOString(),
      conversionRate: 0, costPerAcquisition: 0,
    });
  }
  if (abandoned > 0) {
    segments.push({
      id: 'seg_abandoned_funnel', name: 'Abandoned Funnel',
      description: 'Clicked CTA but did not submit form',
      criteria: { hasCta: true, hasForm: false }, size: abandoned, platforms: ['meta', 'google'],
      status: 'active', lastSynced: new Date().toISOString(),
      conversionRate: 0, costPerAcquisition: 0,
    });
  }
  if (scrolled > 0) {
    segments.push({
      id: 'seg_deep_scrollers', name: 'Deep Scrollers',
      description: 'Scrolled 75%+ of the page',
      criteria: { scrollDepth: '>=75' }, size: scrolled, platforms: ['meta', 'google'],
      status: 'active', lastSynced: new Date().toISOString(),
      conversionRate: 0, costPerAcquisition: 0,
    });
  }
  if (mobileSessions > 0) {
    segments.push({
      id: 'seg_mobile_users', name: 'Mobile Visitors',
      description: 'Visitors on mobile devices',
      criteria: { device: 'Mobile' }, size: mobileSessions, platforms: ['meta', 'google'],
      status: 'active', lastSynced: new Date().toISOString(),
      conversionRate: 0, costPerAcquisition: 0,
    });
  }
  return segments;
}

const retargetingCampaigns: RetargetingCampaign[] = [];

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

      const audienceSegments = buildAudienceSegmentsFromStore();
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
      const audienceSegments = buildAudienceSegmentsFromStore();

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

      return {
        searchKeywords: [],
        seoPages: [],
        organicTrafficTrend: [],
        totalOrganicClicks: 0,
        totalImpressions: 0,
        avgPosition: 0,
        indexedPages: 0,
      };
    }),

  getAdPixelStatus: adminProcedure
    .query(async () => {
      console.log("[EngagementIntel] Fetching ad pixel status");

      return {
        pixels: [],
        serverSideTracking: {
          enabled: false,
          provider: 'Not configured',
          endpoints: [],
          eventsProcessed24h: 0,
          deduplicationRate: 0,
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
        triggers: [],
        automationStats: {
          totalTriggersFired24h: 0,
          totalConversions24h: 0,
          overallConversionRate: 0,
          topPerforming: '',
          revenue24h: 0,
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

      const landingEvents = store.analyticsEvents.filter(
        e => e.userId === 'landing_visitor' && new Date(e.timestamp) >= new Date(Date.now() - (input.period === '7d' ? 7 : input.period === '90d' ? 90 : 30) * 86400000)
      );

      const utmMap: Record<string, { sessions: Set<string>; conversions: number }> = {};
      landingEvents.forEach(e => {
        const src = (e.properties?.utmSource as string) || (e.properties?.referrer as string) || 'direct';
        const medium = (e.properties?.utmMedium as string) || '(none)';
        const key = `${src}|${medium}`;
        if (!utmMap[key]) utmMap[key] = { sessions: new Set(), conversions: 0 };
        utmMap[key].sessions.add(e.sessionId);
        if (e.event === 'form_submit') utmMap[key].conversions++;
      });

      const utmSources = Object.entries(utmMap)
        .map(([key, data]) => {
          const [source, medium] = key.split('|');
          return {
            source, medium, campaign: '(not set)',
            sessions: data.sessions.size, conversions: data.conversions,
            revenue: 0, cpa: 0, roas: 0,
          };
        })
        .sort((a, b) => b.sessions - a.sessions)
        .slice(0, 15);

      return {
        period: input.period,
        sources: utmSources,
        totals: {
          sessions: utmSources.reduce((s, u) => s + u.sessions, 0),
          conversions: utmSources.reduce((s, u) => s + u.conversions, 0),
          revenue: 0,
          paidSpend: 0,
          organicValue: 0,
        },
        attribution: {
          firstTouch: { topSource: utmSources[0]?.source || 'none', conversions: utmSources[0]?.conversions || 0 },
          lastTouch: { topSource: utmSources[0]?.source || 'none', conversions: utmSources[0]?.conversions || 0 },
          multiTouch: { avgTouchpoints: 0, topPath: '' },
        },
      };
    }),
});
