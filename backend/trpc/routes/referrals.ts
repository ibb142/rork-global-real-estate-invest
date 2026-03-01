import * as z from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

export const referralsRouter = createTRPCRouter({
  getUserReferrals: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: z.enum(["all", "pending", "signed_up", "invested", "rewarded"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[Referrals] Fetching referrals for:", userId);
      let refs = store.referrals.filter(r => r.referrerId === userId);
      if (input.status && input.status !== "all") {
        refs = refs.filter(r => r.status === input.status);
      }
      const result = store.paginate(refs, input.page, input.limit);
      return { referrals: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getReferralCode: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      const code = `IPX${(user?.firstName || "USER").toUpperCase().slice(0, 4)}${Math.floor(Math.random() * 100)}`;
      return { referralCode: code, shareUrl: `https://ivxholding.com/r/${code}` };
    }),

  sendInvite: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      message: z.string().optional(),
      channel: z.enum(["email", "sms", "whatsapp"]).default("email"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      console.log("[Referrals] Sending invite from:", userId, "to:", input.email);

      const existing = store.referrals.find(r => r.referrerId === userId && r.referredEmail === input.email);
      if (existing) return { success: false, message: "Already invited this person" };

      const referral = {
        id: store.genId("ref"),
        referrerId: userId,
        referrerName: user ? `${user.firstName} ${user.lastName}` : "User",
        referrerEmail: user?.email || "",
        referredEmail: input.email,
        status: "pending" as const,
        referralCode: `IPX${Date.now().toString(36).toUpperCase()}`,
        reward: 0,
        rewardPaid: false,
        createdAt: new Date().toISOString(),
      };
      store.referrals.push(referral);
      store.persist();
      store.log("referral_invite", userId, `Invited ${input.email}`);

      return { success: true, referralId: referral.id };
    }),

  getUserStats: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const refs = store.referrals.filter(r => r.referrerId === userId);
      return {
        totalReferrals: refs.length,
        pending: refs.filter(r => r.status === "pending").length,
        signedUp: refs.filter(r => r.status === "signed_up").length,
        invested: refs.filter(r => r.status === "invested" || r.status === "rewarded").length,
        totalRewardsEarned: refs.reduce((sum, r) => sum + r.reward, 0),
        totalRewardsPaid: refs.filter(r => r.rewardPaid).reduce((sum, r) => sum + r.reward, 0),
        totalInvestmentGenerated: refs.reduce((sum, r) => sum + (r.investmentAmount || 0), 0),
      };
    }),

  getAdminStats: adminProcedure
    .query(async () => {
      console.log("[Referrals] Fetching admin stats");
      const refs = store.referrals;
      const referrerMap = new Map<string, { count: number; investment: number; name: string; email: string }>();
      refs.forEach(r => {
        const existing = referrerMap.get(r.referrerId) || { count: 0, investment: 0, name: r.referrerName, email: r.referrerEmail };
        existing.count++;
        existing.investment += r.investmentAmount || 0;
        referrerMap.set(r.referrerId, existing);
      });

      const topReferrers = Array.from(referrerMap.entries())
        .map(([id, data]) => ({ id, name: data.name, email: data.email, referralCount: data.count, investmentGenerated: data.investment }))
        .sort((a, b) => b.referralCount - a.referralCount)
        .slice(0, 10);

      return {
        totalReferrals: refs.length,
        pendingReferrals: refs.filter(r => r.status === "pending").length,
        signedUpReferrals: refs.filter(r => r.status === "signed_up").length,
        investedReferrals: refs.filter(r => r.status === "invested" || r.status === "rewarded").length,
        totalRewardsPaid: refs.filter(r => r.rewardPaid).reduce((sum, r) => sum + r.reward, 0),
        totalInvestmentFromReferrals: refs.reduce((sum, r) => sum + (r.investmentAmount || 0), 0),
        topReferrers,
      };
    }),

  listAll: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: z.enum(["all", "pending", "signed_up", "invested", "rewarded"]).optional(),
    }))
    .query(async ({ input }) => {
      let refs = [...store.referrals];
      if (input.status && input.status !== "all") {
        refs = refs.filter(r => r.status === input.status);
      }
      const result = store.paginate(refs, input.page, input.limit);
      return { referrals: result.items, total: result.total, page: result.page, limit: result.limit };
    }),
});
