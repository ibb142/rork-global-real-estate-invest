import * as z from "zod";
import { createTRPCRouter, adminProcedure } from "../create-context";
import { store } from "../../store/index";

function periodToDays(period: string): number {
  switch (period) {
    case "7d": return 7;
    case "30d": return 30;
    case "90d": return 90;
    case "1y": return 365;
    default: return 30;
  }
}

export const clientIntelligenceRouter = createTRPCRouter({
  getBehaviorReport: adminProcedure
    .input(z.object({
      period: z.enum(["7d", "30d", "90d", "1y"]).default("30d"),
    }))
    .query(async ({ input }) => {
      console.log("[ClientIntel] Behavior report:", input.period);
      const users = store.getAllUsers();
      const allTx = store.getAllTransactions();
      const now = new Date();
      const daysBack = periodToDays(input.period);
      const cutoff = new Date(now.getTime() - daysBack * 86400000);
      const events = store.analyticsEvents.filter(e => new Date(e.timestamp) >= cutoff);

      const screenViews = events.filter(e => e.event === "screen_view" || e.category === "page_view" || e.category === "navigation");
      const screenCounts: Record<string, number> = {};
      const screenUniques: Record<string, Set<string>> = {};
      screenViews.forEach(e => {
        const screen = (e.properties?.screen as string) || e.event;
        screenCounts[screen] = (screenCounts[screen] || 0) + 1;
        if (!screenUniques[screen]) screenUniques[screen] = new Set();
        screenUniques[screen].add(e.userId);
      });

      const topScreens = Object.entries(screenCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([screen, views]) => ({
          screen,
          views,
          uniqueUsers: screenUniques[screen]?.size || 0,
          avgViewsPerUser: screenUniques[screen]?.size ? Math.round((views / screenUniques[screen].size) * 100) / 100 : 0,
        }));

      const propertyViews: Record<string, { views: number; users: Set<string>; buys: number; buyVolume: number }> = {};
      events.filter(e => e.event.includes("property") || e.properties?.propertyId).forEach(e => {
        const propId = (e.properties?.propertyId as string) || "general";
        if (!propertyViews[propId]) propertyViews[propId] = { views: 0, users: new Set(), buys: 0, buyVolume: 0 };
        propertyViews[propId].views++;
        propertyViews[propId].users.add(e.userId);
      });

      allTx.filter(t => t.type === "buy" && t.status === "completed" && new Date(t.createdAt) >= cutoff).forEach(t => {
        if (t.propertyId) {
          if (!propertyViews[t.propertyId]) propertyViews[t.propertyId] = { views: 0, users: new Set(), buys: 0, buyVolume: 0 };
          propertyViews[t.propertyId].buys++;
          propertyViews[t.propertyId].buyVolume += Math.abs(t.amount);
        }
      });

      const topProperties = Object.entries(propertyViews)
        .filter(([id]) => id !== "general")
        .sort((a, b) => b[1].views - a[1].views)
        .slice(0, 10)
        .map(([propertyId, data]) => {
          const prop = store.getProperty(propertyId);
          return {
            propertyId,
            name: prop?.name || propertyId,
            views: data.views,
            uniqueViewers: data.users.size,
            purchases: data.buys,
            purchaseVolume: Math.round(data.buyVolume * 100) / 100,
            conversionRate: data.users.size > 0 ? Math.round((data.buys / data.users.size) * 10000) / 100 : 0,
          };
        });

      const actionCounts: Record<string, number> = {};
      events.filter(e => e.category === "user_action").forEach(e => {
        actionCounts[e.event] = (actionCounts[e.event] || 0) + 1;
      });
      const topActions = Object.entries(actionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([action, count]) => ({ action, count }));

      const ctaEvents = events.filter(e => e.event.startsWith("cta_") || e.event.includes("click") || e.event.includes("tap"));
      const ctaCounts: Record<string, number> = {};
      ctaEvents.forEach(e => {
        ctaCounts[e.event] = (ctaCounts[e.event] || 0) + 1;
      });
      const topCTAs = Object.entries(ctaCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([cta, count]) => ({ cta, count }));

      const userActivityMap = new Map<string, { events: number; lastSeen: string; screens: Set<string>; actions: Set<string>; invested: number }>();
      events.forEach(e => {
        let ua = userActivityMap.get(e.userId);
        if (!ua) {
          ua = { events: 0, lastSeen: e.timestamp, screens: new Set(), actions: new Set(), invested: 0 };
          userActivityMap.set(e.userId, ua);
        }
        ua.events++;
        if (e.timestamp > ua.lastSeen) ua.lastSeen = e.timestamp;
        if (e.properties?.screen) ua.screens.add(e.properties.screen as string);
        if (e.category === "user_action") ua.actions.add(e.event);
      });

      users.forEach(u => {
        const ua = userActivityMap.get(u.id);
        if (ua) ua.invested = u.totalInvested;
      });

      const activeUsers = users.filter(u => {
        const txs = store.getUserTransactions(u.id);
        return txs.some(t => new Date(t.createdAt) >= cutoff);
      });

      const dormantUsers = users.filter(u => {
        const txs = store.getUserTransactions(u.id);
        const lastTx = txs[0];
        return !lastTx || new Date(lastTx.createdAt) < new Date(now.getTime() - 30 * 86400000);
      });

      const atRiskUsers = users.filter(u => {
        const txs = store.getUserTransactions(u.id);
        const lastTx = txs[0];
        if (!lastTx) return false;
        const lastDate = new Date(lastTx.createdAt);
        return lastDate < new Date(now.getTime() - 14 * 86400000) && lastDate >= new Date(now.getTime() - 60 * 86400000);
      });

      const highValueDormant = dormantUsers.filter(u => u.totalInvested >= 5000);

      const reEngagementStrategies: Array<{
        segment: string;
        userCount: number;
        strategy: string;
        priority: "critical" | "high" | "medium" | "low";
        expectedImpact: string;
        suggestedAction: string;
      }> = [];

      if (highValueDormant.length > 0) {
        reEngagementStrategies.push({
          segment: "High-Value Dormant Investors",
          userCount: highValueDormant.length,
          strategy: "Personal outreach with exclusive opportunities",
          priority: "critical",
          expectedImpact: `$${Math.round(highValueDormant.reduce((s, u) => s + u.totalInvested, 0)).toLocaleString()} at risk`,
          suggestedAction: "Send personalized email with new property matching their portfolio + VIP bonus offer",
        });
      }

      if (atRiskUsers.length > 0) {
        reEngagementStrategies.push({
          segment: "At-Risk Users (14-60 days inactive)",
          userCount: atRiskUsers.length,
          strategy: "Win-back campaign with incentive",
          priority: "high",
          expectedImpact: `${Math.round(atRiskUsers.length * 0.3)} potential reactivations`,
          suggestedAction: "Push notification: 'New properties available + $25 referral bonus for comeback investors'",
        });
      }

      const depositNoInvest = users.filter(u => {
        const bal = store.getWalletBalance(u.id);
        return bal.available > 0 && u.totalInvested === 0;
      });

      if (depositNoInvest.length > 0) {
        reEngagementStrategies.push({
          segment: "Deposited but Never Invested",
          userCount: depositNoInvest.length,
          strategy: "Guided investment onboarding",
          priority: "high",
          expectedImpact: `$${Math.round(depositNoInvest.reduce((s, u) => s + store.getWalletBalance(u.id).available, 0)).toLocaleString()} ready to invest`,
          suggestedAction: "Send tutorial series + highlight top-performing properties with low minimums",
        });
      }

      const kycPending = users.filter(u => u.kycStatus === "pending");
      if (kycPending.length > 0) {
        reEngagementStrategies.push({
          segment: "KYC Not Started",
          userCount: kycPending.length,
          strategy: "Simplified KYC reminder flow",
          priority: "medium",
          expectedImpact: `${kycPending.length} users unblocked for investing`,
          suggestedAction: "Email: 'Complete your verification in 2 minutes — unlock exclusive investment opportunities'",
        });
      }

      const newNeverReturned = users.filter(u => {
        const created = new Date(u.createdAt);
        if (created >= new Date(now.getTime() - 3 * 86400000)) return false;
        const txs = store.getUserTransactions(u.id);
        return txs.length === 0 && u.totalInvested === 0;
      });

      if (newNeverReturned.length > 0) {
        reEngagementStrategies.push({
          segment: "Signed Up but Never Engaged",
          userCount: newNeverReturned.length,
          strategy: "Welcome series with social proof",
          priority: "medium",
          expectedImpact: `${Math.round(newNeverReturned.length * 0.15)} potential activations`,
          suggestedAction: "Drip campaign: testimonials, ROI calculator, beginner's guide to real estate investing",
        });
      }

      const hourlyEngagement = new Array(24).fill(0) as number[];
      events.forEach(e => {
        const hour = new Date(e.timestamp).getHours();
        hourlyEngagement[hour]++;
      });
      const peakHour = hourlyEngagement.indexOf(Math.max(...hourlyEngagement));

      const dailyEngagement: Array<{ date: string; events: number; uniqueUsers: number }> = [];
      const dailyMap: Record<string, { events: number; users: Set<string> }> = {};
      events.forEach(e => {
        const d = e.timestamp.slice(0, 10);
        if (!dailyMap[d]) dailyMap[d] = { events: 0, users: new Set() };
        dailyMap[d].events++;
        dailyMap[d].users.add(e.userId);
      });
      const sortedDays = Object.keys(dailyMap).sort();
      sortedDays.forEach(d => {
        dailyEngagement.push({ date: d, events: dailyMap[d].events, uniqueUsers: dailyMap[d].users.size });
      });

      const categoryBreakdown = events.reduce<Record<string, number>>((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + 1;
        return acc;
      }, {});

      const investmentJourney = {
        browsersOnly: users.filter(u => u.totalInvested === 0 && u.kycStatus === "pending").length,
        kycInProgress: users.filter(u => u.kycStatus === "in_review").length,
        kycApproved: users.filter(u => u.kycStatus === "approved" && u.totalInvested === 0).length,
        firstInvestment: users.filter(u => {
          const holds = store.getUserHoldings(u.id);
          return holds.length === 1;
        }).length,
        multiInvestor: users.filter(u => {
          const holds = store.getUserHoldings(u.id);
          return holds.length > 1;
        }).length,
        whale: users.filter(u => u.totalInvested >= 50000).length,
      };

      return {
        period: input.period,
        summary: {
          totalUsers: users.length,
          activeUsers: activeUsers.length,
          dormantUsers: dormantUsers.length,
          atRiskUsers: atRiskUsers.length,
          totalEvents: events.length,
          uniqueSessions: new Set(events.map(e => e.sessionId)).size,
          peakHour,
          engagementRate: users.length > 0 ? Math.round((activeUsers.length / users.length) * 10000) / 100 : 0,
        },
        whatTheyView: {
          topScreens,
          topProperties,
          categoryBreakdown: Object.entries(categoryBreakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([category, count]) => ({ category, count, pct: events.length > 0 ? Math.round((count / events.length) * 10000) / 100 : 0 })),
        },
        whatTheyLike: {
          topActions,
          topCTAs,
          investmentJourney,
          mostEngagedProperties: topProperties.slice(0, 5),
        },
        howToBringBack: {
          reEngagementStrategies: reEngagementStrategies.sort((a, b) => {
            const order = { critical: 0, high: 1, medium: 2, low: 3 };
            return order[a.priority] - order[b.priority];
          }),
          dormantBreakdown: {
            total: dormantUsers.length,
            highValue: highValueDormant.length,
            withBalance: dormantUsers.filter(u => store.getWalletBalance(u.id).available > 0).length,
            neverInvested: dormantUsers.filter(u => u.totalInvested === 0).length,
          },
          atRiskBreakdown: {
            total: atRiskUsers.length,
            avgInvested: atRiskUsers.length > 0 ? Math.round(atRiskUsers.reduce((s, u) => s + u.totalInvested, 0) / atRiskUsers.length) : 0,
            totalAtRiskValue: Math.round(atRiskUsers.reduce((s, u) => s + u.totalInvested, 0)),
          },
        },
        engagement: {
          hourlyEngagement: hourlyEngagement.map((count, hour) => ({ hour, count })),
          dailyEngagement: dailyEngagement.slice(-30),
        },
      };
    }),

  getClientProfiles: adminProcedure
    .input(z.object({
      segment: z.enum(["all", "active", "dormant", "at_risk", "high_value", "new"]).default("all"),
      limit: z.number().min(1).max(50).default(20),
      page: z.number().min(1).default(1),
    }))
    .query(async ({ input }) => {
      console.log("[ClientIntel] Client profiles:", input.segment);
      const users = store.getAllUsers();
      const now = new Date();

      let filtered = users;
      switch (input.segment) {
        case "active":
          filtered = users.filter(u => {
            const txs = store.getUserTransactions(u.id);
            return txs.some(t => new Date(t.createdAt) >= new Date(now.getTime() - 30 * 86400000));
          });
          break;
        case "dormant":
          filtered = users.filter(u => {
            const txs = store.getUserTransactions(u.id);
            const lastTx = txs[0];
            return !lastTx || new Date(lastTx.createdAt) < new Date(now.getTime() - 60 * 86400000);
          });
          break;
        case "at_risk":
          filtered = users.filter(u => {
            const txs = store.getUserTransactions(u.id);
            const lastTx = txs[0];
            if (!lastTx) return false;
            const d = new Date(lastTx.createdAt);
            return d < new Date(now.getTime() - 14 * 86400000) && d >= new Date(now.getTime() - 60 * 86400000);
          });
          break;
        case "high_value":
          filtered = users.filter(u => u.totalInvested >= 10000);
          break;
        case "new":
          filtered = users.filter(u => new Date(u.createdAt) >= new Date(now.getTime() - 7 * 86400000));
          break;
      }

      const start = (input.page - 1) * input.limit;
      const paged = filtered.slice(start, start + input.limit);

      const profiles = paged.map(u => {
        const txs = store.getUserTransactions(u.id);
        const holdings = store.getUserHoldings(u.id);
        const bal = store.getWalletBalance(u.id);
        const lastTx = txs[0];
        const daysSinceLastActivity = lastTx ? Math.floor((now.getTime() - new Date(lastTx.createdAt).getTime()) / 86400000) : -1;

        let riskLevel: "healthy" | "watch" | "at_risk" | "churned" = "healthy";
        if (daysSinceLastActivity < 0 || daysSinceLastActivity > 60) riskLevel = "churned";
        else if (daysSinceLastActivity > 30) riskLevel = "at_risk";
        else if (daysSinceLastActivity > 14) riskLevel = "watch";

        return {
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          email: u.email,
          country: u.country,
          joinedAt: u.createdAt,
          totalInvested: u.totalInvested,
          totalReturns: u.totalReturns,
          balance: bal.available,
          holdingsCount: holdings.length,
          transactionCount: txs.length,
          kycStatus: u.kycStatus,
          daysSinceLastActivity,
          riskLevel,
          lastActivityDate: lastTx?.createdAt || null,
        };
      });

      return {
        profiles,
        total: filtered.length,
        page: input.page,
        limit: input.limit,
        totalPages: Math.ceil(filtered.length / input.limit),
      };
    }),
});
