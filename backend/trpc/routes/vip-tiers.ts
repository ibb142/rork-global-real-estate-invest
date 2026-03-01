import * as z from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

const TIER_THRESHOLDS = {
  bronze: { min: 0, max: 4999, benefits: ["Basic support", "Standard fees"] },
  silver: { min: 5000, max: 9999, benefits: ["Priority email support", "5% fee reduction", "Monthly insights"] },
  gold: { min: 10000, max: 19999, benefits: ["Reduced fees", "Priority support", "Early access", "Quarterly reports"] },
  platinum: { min: 20000, max: 49999, benefits: ["VIP support line", "15% fee reduction", "Early access", "Personal advisor", "Exclusive properties"] },
  diamond: { min: 50000, max: Infinity, benefits: ["Dedicated account manager", "25% fee reduction", "First access", "Custom reports", "Private events", "Tax advisory"] },
};

const TIER_ORDER = ["bronze", "silver", "gold", "platinum", "diamond"] as const;

function calculateTier(points: number): typeof TIER_ORDER[number] {
  if (points >= 50000) return "diamond";
  if (points >= 20000) return "platinum";
  if (points >= 10000) return "gold";
  if (points >= 5000) return "silver";
  return "bronze";
}

export const vipTiersRouter = createTRPCRouter({
  getMyTier: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      console.log("[VipTiers] Fetching tier for:", userId);

      let vip = store.vipTiers.get(userId);
      if (!vip) {
        const user = store.getUser(userId);
        const holdings = store.getUserHoldings(userId);
        const totalInvested = holdings.reduce((s, h) => s + h.shares * h.avgCostBasis, 0);
        const points = Math.floor(totalInvested / 10);
        const tier = calculateTier(points);
        const tierIdx = TIER_ORDER.indexOf(tier);
        const nextTier = tierIdx < TIER_ORDER.length - 1 ? TIER_ORDER[tierIdx + 1] : null;
        const nextThreshold = nextTier ? TIER_THRESHOLDS[nextTier].min : 0;

        vip = {
          userId,
          tier,
          points,
          totalPointsEarned: points,
          currentBenefits: TIER_THRESHOLDS[tier].benefits,
          nextTier,
          pointsToNextTier: nextTier ? Math.max(0, nextThreshold - points) : 0,
          memberSince: user?.createdAt || new Date().toISOString(),
          lastTierUpdate: new Date().toISOString(),
        };
        store.vipTiers.set(userId, vip);
      }

      const tierIdx = TIER_ORDER.indexOf(vip.tier);
      const currentThreshold = TIER_THRESHOLDS[vip.tier];
      const nextTierName = tierIdx < TIER_ORDER.length - 1 ? TIER_ORDER[tierIdx + 1] : null;
      const nextThreshold = nextTierName ? TIER_THRESHOLDS[nextTierName].min : vip.points;
      const progressToNext = nextTierName
        ? Math.round(((vip.points - currentThreshold.min) / (nextThreshold - currentThreshold.min)) * 100)
        : 100;

      return {
        ...vip,
        progressToNext: Math.min(100, Math.max(0, progressToNext)),
        allTiers: TIER_ORDER.map(t => ({
          name: t,
          minPoints: TIER_THRESHOLDS[t].min,
          benefits: TIER_THRESHOLDS[t].benefits,
          isCurrent: t === vip!.tier,
          isUnlocked: vip!.points >= TIER_THRESHOLDS[t].min,
        })),
      };
    }),

  getPointsHistory: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const txs = store.getUserTransactions(userId);
      const pointEvents = txs
        .filter(t => t.type === "buy" || t.type === "dividend")
        .map(t => ({
          id: t.id,
          type: t.type === "buy" ? "investment" : "dividend",
          description: t.description,
          points: t.type === "buy" ? Math.floor(Math.abs(t.amount) / 10) : Math.floor(t.amount / 5),
          createdAt: t.createdAt,
        }));

      const result = store.paginate(pointEvents, input.page, input.limit);
      return {
        events: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    }),

  getBenefits: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const vip = store.vipTiers.get(userId);
      const tier = vip?.tier || "bronze";

      return {
        tier,
        benefits: TIER_THRESHOLDS[tier].benefits,
        feeReduction: tier === "diamond" ? 25 : tier === "platinum" ? 15 : tier === "gold" ? 10 : tier === "silver" ? 5 : 0,
        prioritySupport: ["gold", "platinum", "diamond"].includes(tier),
        earlyAccess: ["gold", "platinum", "diamond"].includes(tier),
        personalAdvisor: ["platinum", "diamond"].includes(tier),
        exclusiveProperties: ["platinum", "diamond"].includes(tier),
        privateEvents: tier === "diamond",
        taxAdvisory: tier === "diamond",
      };
    }),

  getTierComparison: protectedProcedure
    .query(async () => {
      return {
        tiers: TIER_ORDER.map(t => ({
          name: t,
          minPoints: TIER_THRESHOLDS[t].min,
          benefits: TIER_THRESHOLDS[t].benefits,
          feeReduction: t === "diamond" ? 25 : t === "platinum" ? 15 : t === "gold" ? 10 : t === "silver" ? 5 : 0,
        })),
      };
    }),

  addPoints: adminProcedure
    .input(z.object({
      userId: z.string(),
      points: z.number().int().positive(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      let vip = store.vipTiers.get(input.userId);
      if (!vip) {
        vip = {
          userId: input.userId,
          tier: "bronze",
          points: 0,
          totalPointsEarned: 0,
          currentBenefits: TIER_THRESHOLDS.bronze.benefits,
          nextTier: "silver",
          pointsToNextTier: 5000,
          memberSince: new Date().toISOString(),
          lastTierUpdate: new Date().toISOString(),
        };
      }

      vip.points += input.points;
      vip.totalPointsEarned += input.points;

      const newTier = calculateTier(vip.points);
      if (newTier !== vip.tier) {
        vip.tier = newTier;
        vip.currentBenefits = TIER_THRESHOLDS[newTier].benefits;
        vip.lastTierUpdate = new Date().toISOString();

        store.addNotification(input.userId, {
          id: store.genId("notif"),
          type: "system",
          title: "VIP Tier Upgraded!",
          message: `Congratulations! You've been upgraded to ${newTier.charAt(0).toUpperCase() + newTier.slice(1)} tier.`,
          read: false,
          createdAt: new Date().toISOString(),
        });
      }

      const tierIdx = TIER_ORDER.indexOf(vip.tier);
      const nextTier = tierIdx < TIER_ORDER.length - 1 ? TIER_ORDER[tierIdx + 1] : null;
      vip.nextTier = nextTier;
      vip.pointsToNextTier = nextTier ? Math.max(0, TIER_THRESHOLDS[nextTier].min - vip.points) : 0;

      store.vipTiers.set(input.userId, vip);
      store.log("vip_points_add", ctx.userId || "admin", `Added ${input.points} points to ${input.userId}: ${input.reason}`);

      return { success: true, newTier: vip.tier, totalPoints: vip.points };
    }),

  getStats: adminProcedure
    .query(async () => {
      const tiers: Record<string, number> = { bronze: 0, silver: 0, gold: 0, platinum: 0, diamond: 0 };
      for (const vip of store.vipTiers.values()) {
        tiers[vip.tier] = (tiers[vip.tier] || 0) + 1;
      }
      const totalMembers = Array.from(store.vipTiers.values()).length;
      return {
        totalMembers,
        distribution: tiers,
        totalPointsIssued: Array.from(store.vipTiers.values()).reduce((s, v) => s + v.totalPointsEarned, 0),
      };
    }),
});
