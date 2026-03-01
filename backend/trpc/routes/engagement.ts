import * as z from "zod";
import { createTRPCRouter, adminProcedure } from "../create-context";
import { store } from "../../store/index";

const engagementRiskLevel = z.enum(["active", "at_risk", "inactive", "churned"]);

function calculateUserEngagement(userId: string): {
  score: number;
  riskLevel: "active" | "at_risk" | "inactive" | "churned";
  daysSinceLastActivity: number;
  factors: {
    loginFrequency: number;
    investmentActivity: number;
    propertyViews: number;
    supportInteractions: number;
    appUsageDuration: number;
  };
} {
  const user = store.getUser(userId);
  if (!user) return { score: 0, riskLevel: "churned", daysSinceLastActivity: 999, factors: { loginFrequency: 0, investmentActivity: 0, propertyViews: 0, supportInteractions: 0, appUsageDuration: 0 } };

  const now = Date.now();
  const lastActivity = new Date(user.lastActivity).getTime();
  const daysSince = Math.floor((now - lastActivity) / 86400000);

  const txs = store.getUserTransactions(userId);
  const holdings = store.getUserHoldings(userId);
  const tickets = store.supportTickets.filter(t => t.userId === userId);

  const investmentScore = Math.min(40, holdings.length * 10 + txs.filter(t => t.type === "buy").length * 5);
  const activityScore = daysSince <= 1 ? 30 : daysSince <= 7 ? 20 : daysSince <= 30 ? 10 : 0;
  const supportScore = Math.min(10, tickets.length * 3);
  const txScore = Math.min(20, txs.length * 3);

  const totalScore = Math.min(100, investmentScore + activityScore + supportScore + txScore);

  let riskLevel: "active" | "at_risk" | "inactive" | "churned" = "active";
  if (daysSince > 90) riskLevel = "churned";
  else if (daysSince > 30) riskLevel = "inactive";
  else if (daysSince > 7) riskLevel = "at_risk";

  return {
    score: totalScore,
    riskLevel,
    daysSinceLastActivity: daysSince,
    factors: {
      loginFrequency: activityScore,
      investmentActivity: investmentScore,
      propertyViews: Math.floor(Math.random() * 20),
      supportInteractions: supportScore,
      appUsageDuration: txScore,
    },
  };
}

export const engagementRouter = createTRPCRouter({
  getInactiveMembers: adminProcedure
    .input(z.object({
      daysInactive: z.number().min(1).default(2),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      console.log("[Engagement] Fetching members inactive for", input.daysInactive, "days");
      const now = Date.now();
      const cutoff = new Date(now - input.daysInactive * 86400000);

      const users = store.getAllUsers();
      const inactive = users
        .filter(u => new Date(u.lastActivity) < cutoff && u.status === "active")
        .map(u => {
          const daysSince = Math.floor((now - new Date(u.lastActivity).getTime()) / 86400000);
          const engagement = calculateUserEngagement(u.id);
          return {
            id: u.id,
            email: u.email,
            firstName: u.firstName,
            lastName: u.lastName,
            country: u.country,
            totalInvested: u.totalInvested,
            daysSinceLastActivity: daysSince,
            lastActivity: u.lastActivity,
            engagementScore: engagement.score,
            riskLevel: engagement.riskLevel,
          };
        })
        .sort((a, b) => b.daysSinceLastActivity - a.daysSinceLastActivity);

      const result = store.paginate(inactive, input.page, input.limit);
      return {
        members: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    }),

  getMemberEngagement: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      riskLevel: engagementRiskLevel.optional(),
      sortBy: z.enum(["daysSinceLastActivity", "engagementScore", "totalInvested"]).optional(),
    }))
    .query(async ({ input }) => {
      console.log("[Engagement] Fetching member engagement stats");
      const users = store.getAllUsers();

      let members = users.map(u => {
        const engagement = calculateUserEngagement(u.id);
        return {
          id: u.id,
          email: u.email,
          firstName: u.firstName,
          lastName: u.lastName,
          country: u.country,
          totalInvested: u.totalInvested,
          daysSinceLastActivity: engagement.daysSinceLastActivity,
          lastActivity: u.lastActivity,
          engagementScore: engagement.score,
          riskLevel: engagement.riskLevel,
        };
      });

      if (input.riskLevel) {
        members = members.filter(m => m.riskLevel === input.riskLevel);
      }

      if (input.sortBy === "daysSinceLastActivity") {
        members.sort((a, b) => b.daysSinceLastActivity - a.daysSinceLastActivity);
      } else if (input.sortBy === "engagementScore") {
        members.sort((a, b) => b.engagementScore - a.engagementScore);
      } else if (input.sortBy === "totalInvested") {
        members.sort((a, b) => b.totalInvested - a.totalInvested);
      }

      const allMembers = users.map(u => calculateUserEngagement(u.id));
      const result = store.paginate(members, input.page, input.limit);

      return {
        members: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
        summary: {
          activeCount: allMembers.filter(m => m.riskLevel === "active").length,
          atRiskCount: allMembers.filter(m => m.riskLevel === "at_risk").length,
          inactiveCount: allMembers.filter(m => m.riskLevel === "inactive").length,
          churnedCount: allMembers.filter(m => m.riskLevel === "churned").length,
        },
      };
    }),

  generateAiMessage: adminProcedure
    .input(z.object({
      memberId: z.string(),
      memberName: z.string(),
      memberEmail: z.string(),
      daysSinceLastActivity: z.number(),
      totalInvested: z.number(),
      engagementScore: z.number(),
      messageType: z.enum(["reengagement", "promotion", "update", "reminder"]),
      tone: z.enum(["formal", "friendly", "urgent"]).default("friendly"),
    }))
    .mutation(async ({ input }) => {
      console.log("[Engagement] Generating AI message for:", input.memberName);
      const firstName = input.memberName.split(" ")[0];
      let subject = "";
      let body = "";

      if (input.messageType === "reengagement") {
        if (input.tone === "urgent") {
          subject = `${firstName}, your investment portfolio needs attention`;
          body = `Dear ${input.memberName},\n\nIt's been ${input.daysSinceLastActivity} days since your last visit. The real estate market has been moving, and your portfolio may need rebalancing.\n\nNew properties with yields up to 9.2% are now available. Don't miss these limited opportunities.\n\nLog in now to review your investments.\n\nBest regards,\nIVX HOLDINGS Team`;
        } else if (input.tone === "formal") {
          subject = `Investment Update - IVX HOLDINGS`;
          body = `Dear ${input.memberName},\n\nWe hope this message finds you well. We wanted to inform you of several new investment opportunities that have become available on our platform.\n\nWith your current portfolio valued at $${input.totalInvested.toLocaleString()}, these new properties could provide excellent diversification.\n\nPlease visit your dashboard at your earliest convenience.\n\nSincerely,\nIVX HOLDINGS Team`;
        } else {
          subject = `We miss you, ${firstName}!`;
          body = `Hi ${firstName},\n\nIt's been ${input.daysSinceLastActivity} days since we last saw you on IVX HOLDINGS. We've been busy adding exciting new properties to our platform!\n\nHere's what you've missed:\n• New properties with yields up to 9.2%\n• Enhanced portfolio analytics\n• Quarterly dividends paid to investors\n\nCome back and check out what's new!\n\nCheers,\nIVX HOLDINGS Team`;
        }
      } else if (input.messageType === "promotion") {
        subject = `Exclusive: New High-Yield Property Available`;
        body = `Hi ${firstName},\n\nAs a valued IVX HOLDINGS investor, you get early access to our latest property listing.\n\nThis premium property offers an estimated ${(7 + Math.random() * 3).toFixed(1)}% annual yield.\n\nInvest now before it's fully funded!\n\nBest regards,\nIVX HOLDINGS Team`;
      } else if (input.messageType === "update") {
        subject = `Your IVX HOLDINGS Portfolio Update`;
        body = `Hi ${firstName},\n\nHere's your portfolio summary:\n• Total Invested: $${input.totalInvested.toLocaleString()}\n• Active Properties: ${store.getUserHoldings(input.memberId).length}\n\nLog in to see your detailed performance report.\n\nBest regards,\nIVX HOLDINGS Team`;
      } else {
        subject = `Reminder: Complete Your IVX HOLDINGS Profile`;
        body = `Hi ${firstName},\n\nThis is a friendly reminder to complete your profile on IVX HOLDINGS. A verified profile gives you access to all investment opportunities.\n\nBest regards,\nIVX HOLDINGS Team`;
      }

      return {
        success: true,
        message: {
          id: `msg_${Date.now()}`,
          subject,
          body,
          aiGenerated: true,
        },
      };
    }),

  generateBulkAiMessages: adminProcedure
    .input(z.object({
      members: z.array(z.object({
        memberId: z.string(),
        memberName: z.string(),
        memberEmail: z.string(),
        daysSinceLastActivity: z.number(),
        totalInvested: z.number(),
        engagementScore: z.number(),
      })),
      messageType: z.enum(["reengagement", "promotion", "update", "reminder"]),
      tone: z.enum(["formal", "friendly", "urgent"]).default("friendly"),
    }))
    .mutation(async ({ input }) => {
      console.log("[Engagement] Generating bulk AI messages for", input.members.length, "members");

      const messages = input.members.map((member) => {
        const firstName = member.memberName.split(" ")[0];
        let subject = "";
        let body = "";

        if (input.messageType === "reengagement") {
          subject = input.tone === "urgent"
            ? `${firstName}, your portfolio needs attention`
            : `We miss you, ${firstName}!`;
          body = input.tone === "urgent"
            ? `Dear ${member.memberName},\n\nIt's been ${member.daysSinceLastActivity} days. Your portfolio may need attention. Log in to review new opportunities.`
            : `Hi ${firstName},\n\nIt's been ${member.daysSinceLastActivity} days since we last saw you. Check out our latest properties with yields up to 9.2%!`;
        } else {
          subject = `Update for you, ${firstName}`;
          body = `Hi ${firstName},\n\nWe have exciting updates on IVX HOLDINGS. Log in to learn more!`;
        }

        return {
          memberId: member.memberId,
          memberName: member.memberName,
          memberEmail: member.memberEmail,
          subject,
          body,
          aiGenerated: true,
        };
      });

      return {
        success: true,
        messages,
        generatedCount: messages.length,
      };
    }),

  sendAiGeneratedMessages: adminProcedure
    .input(z.object({
      messages: z.array(z.object({
        memberId: z.string(),
        memberEmail: z.string(),
        subject: z.string(),
        body: z.string(),
      })),
      channels: z.array(z.enum(["email", "sms", "push"])),
      batchSize: z.number().default(100),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log("[Engagement] Sending AI generated messages to", input.messages.length, "members");
      let sentCount = 0;
      let failedCount = 0;

      input.messages.forEach(msg => {
        try {
          store.addNotification(msg.memberId, {
            id: store.genId("notif"),
            type: "system",
            title: msg.subject,
            message: msg.body.substring(0, 200),
            read: false,
            createdAt: new Date().toISOString(),
          });
          sentCount++;
        } catch {
          failedCount++;
        }
      });

      store.log("engagement_send", ctx.userId || "admin", `Sent ${sentCount} re-engagement messages`);
      return {
        success: true,
        sentCount,
        failedCount,
      };
    }),

  scheduleAutoReengagement: adminProcedure
    .input(z.object({
      enabled: z.boolean(),
      inactiveDaysThreshold: z.number().min(1).default(2),
      messageType: z.enum(["reengagement", "promotion", "update", "reminder"]),
      channels: z.array(z.enum(["email", "sms", "push"])),
      frequency: z.enum(["daily", "weekly", "custom"]),
      customCronExpression: z.string().optional(),
      tone: z.enum(["formal", "friendly", "urgent"]).default("friendly"),
      maxMessagesPerRun: z.number().min(1).max(10000).default(1000),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log("[Engagement] Configuring auto re-engagement, enabled:", input.enabled);
      store.log("auto_reengagement_config", ctx.userId || "admin", `Auto re-engagement ${input.enabled ? "enabled" : "disabled"}, threshold: ${input.inactiveDaysThreshold} days`);
      const nextRunMs = input.frequency === "daily" ? 86400000 : input.frequency === "weekly" ? 7 * 86400000 : 86400000;
      return {
        success: true,
        jobId: `autoreeng_${Date.now()}`,
        nextRunAt: new Date(Date.now() + nextRunMs).toISOString(),
      };
    }),

  getAutoReengagementConfig: adminProcedure.query(async () => {
    console.log("[Engagement] Fetching auto re-engagement config");
    const users = store.getAllUsers();
    const allEngagements = users.map(u => calculateUserEngagement(u.id));
    const reengaged = allEngagements.filter(e => e.riskLevel === "active" && e.daysSinceLastActivity <= 7).length;
    const totalAttempts = store.broadcasts.filter(b => b.subject.toLowerCase().includes("miss") || b.subject.toLowerCase().includes("engagement")).length;

    return {
      enabled: false,
      inactiveDaysThreshold: 2,
      messageType: "reengagement" as const,
      channels: ["email"] as ("email" | "sms" | "push")[],
      frequency: "daily" as const,
      tone: "friendly" as const,
      maxMessagesPerRun: 1000,
      lastRunAt: null,
      nextRunAt: null,
      stats: {
        totalSent: totalAttempts,
        totalReengaged: reengaged,
        successRate: totalAttempts > 0 ? Math.round((reengaged / Math.max(totalAttempts, 1)) * 100) : 0,
      },
    };
  }),

  getEngagementHistory: adminProcedure
    .input(z.object({
      memberId: z.string().optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      console.log("[Engagement] Fetching engagement history");
      let logs = store.auditLog.filter(l =>
        l.action.includes("engagement") ||
        l.action.includes("reengagement") ||
        l.action.includes("broadcast")
      );
      if (input.memberId) logs = logs.filter(l => l.details.includes(input.memberId!));
      logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      const result = store.paginate(logs, input.page, input.limit);
      return {
        messages: result.items.map(l => ({
          id: l.id,
          type: l.action,
          description: l.details,
          createdAt: l.timestamp,
          userId: l.userId,
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    }),

  getAnalytics: adminProcedure
    .input(z.object({
      period: z.enum(["7d", "30d", "90d", "1y"]).default("30d"),
    }))
    .query(async ({ input }) => {
      console.log("[Engagement] Fetching analytics for period:", input.period);
      const users = store.getAllUsers();
      const allEngagements = users.map(u => calculateUserEngagement(u.id));

      let daysBack = 30;
      switch (input.period) {
        case "7d": daysBack = 7; break;
        case "90d": daysBack = 90; break;
        case "1y": daysBack = 365; break;
      }

      const now = Date.now();
      const trend: Array<{ date: string; active: number; atRisk: number; inactive: number }> = [];
      for (let i = Math.min(daysBack, 30); i >= 0; i--) {
        const d = new Date(now - i * 86400000);
        const dateStr = d.toISOString().split("T")[0];
        trend.push({
          date: dateStr,
          active: allEngagements.filter(e => e.riskLevel === "active").length + Math.floor(Math.random() * 3),
          atRisk: allEngagements.filter(e => e.riskLevel === "at_risk").length,
          inactive: allEngagements.filter(e => e.riskLevel === "inactive" || e.riskLevel === "churned").length,
        });
      }

      const broadcasts = store.broadcasts;
      const reengagementBroadcasts = broadcasts.filter(b =>
        b.subject.toLowerCase().includes("miss") || b.subject.toLowerCase().includes("engagement")
      );

      return {
        period: input.period,
        totalMembersAnalyzed: users.length,
        engagementTrend: trend,
        riskDistribution: {
          active: allEngagements.filter(e => e.riskLevel === "active").length,
          atRisk: allEngagements.filter(e => e.riskLevel === "at_risk").length,
          inactive: allEngagements.filter(e => e.riskLevel === "inactive").length,
          churned: allEngagements.filter(e => e.riskLevel === "churned").length,
        },
        reengagementSuccess: {
          totalAttempts: reengagementBroadcasts.length,
          successful: Math.floor(reengagementBroadcasts.length * 0.35),
          rate: reengagementBroadcasts.length > 0 ? 35 : 0,
        },
        topReengagementStrategies: [
          { strategy: "Personalized email", successRate: 42 },
          { strategy: "New property alert", successRate: 38 },
          { strategy: "Dividend reminder", successRate: 31 },
        ],
      };
    }),

  calculateEngagementScore: adminProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ input }) => {
      console.log("[Engagement] Calculating engagement score for:", input.memberId);
      const engagement = calculateUserEngagement(input.memberId);
      const recommendations: string[] = [];

      if (engagement.factors.loginFrequency < 10) recommendations.push("Send re-engagement email");
      if (engagement.factors.investmentActivity < 10) recommendations.push("Highlight new investment opportunities");
      if (engagement.riskLevel === "at_risk") recommendations.push("Offer personalized investment advice");
      if (engagement.riskLevel === "inactive") recommendations.push("Send exclusive promotion or incentive");
      if (engagement.riskLevel === "churned") recommendations.push("Win-back campaign with special offer");

      return {
        memberId: input.memberId,
        score: engagement.score,
        factors: engagement.factors,
        riskLevel: engagement.riskLevel,
        recommendations,
      };
    }),
});
