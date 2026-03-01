import * as z from "zod";
import { createTRPCRouter, protectedProcedure } from "../create-context";
import { store } from "../../store/index";

export const copyInvestingRouter = createTRPCRouter({
  getProfiles: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      riskLevel: z.enum(["all", "low", "medium", "high"]).optional(),
      sortBy: z.enum(["totalReturn", "totalFollowers", "winRate"]).optional(),
    }))
    .query(async ({ input }) => {
      console.log("[CopyInvesting] Fetching profiles");
      let profiles = [...store.copyInvestingProfiles].filter(p => p.isPublic);
      if (input.riskLevel && input.riskLevel !== "all") {
        profiles = profiles.filter(p => p.riskLevel === input.riskLevel);
      }
      if (input.sortBy === "totalReturn") profiles.sort((a, b) => b.totalReturnPercent - a.totalReturnPercent);
      else if (input.sortBy === "totalFollowers") profiles.sort((a, b) => b.totalFollowers - a.totalFollowers);
      else if (input.sortBy === "winRate") profiles.sort((a, b) => b.winRate - a.winRate);

      const result = store.paginate(profiles, input.page, input.limit);
      return { profiles: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getProfileById: protectedProcedure
    .input(z.object({ profileId: z.string() }))
    .query(async ({ input }) => {
      const profile = store.copyInvestingProfiles.find(p => p.id === input.profileId);
      if (!profile) return null;

      const holdings = store.getUserHoldings(profile.userId);
      const enrichedHoldings = holdings.map(h => {
        const prop = store.getProperty(h.propertyId);
        return {
          propertyId: h.propertyId,
          propertyName: prop?.name || "",
          shares: h.shares,
          currentValue: h.currentValue,
          returnPercent: h.unrealizedPnLPercent,
        };
      });

      return { ...profile, holdings: enrichedHoldings };
    }),

  getMyProfile: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      return store.copyInvestingProfiles.find(p => p.userId === userId) || null;
    }),

  createProfile: protectedProcedure
    .input(z.object({
      description: z.string().min(10).max(500),
      strategy: z.string().min(5).max(200),
      riskLevel: z.enum(["low", "medium", "high"]),
      isPublic: z.boolean().default(true),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      console.log("[CopyInvesting] Creating profile for:", userId);

      const existing = store.copyInvestingProfiles.find(p => p.userId === userId);
      if (existing) return { success: false, message: "Profile already exists" };

      const holdings = store.getUserHoldings(userId);
      const totalInvested = holdings.reduce((s, h) => s + h.shares * h.avgCostBasis, 0);
      const totalReturn = holdings.reduce((s, h) => s + h.unrealizedPnL, 0);

      const profile = {
        id: store.genId("cprf"),
        userId,
        userName: user ? `${user.firstName} ${user.lastName}` : "Investor",
        avatar: user?.avatar,
        description: input.description,
        strategy: input.strategy,
        riskLevel: input.riskLevel,
        totalReturn,
        totalReturnPercent: totalInvested > 0 ? Math.round((totalReturn / totalInvested) * 10000) / 100 : 0,
        totalFollowers: 0,
        totalInvested,
        winRate: holdings.length > 0 ? Math.round((holdings.filter(h => h.unrealizedPnL > 0).length / holdings.length) * 100) : 0,
        isPublic: input.isPublic,
        createdAt: new Date().toISOString(),
      };
      store.copyInvestingProfiles.push(profile);
      store.log("copy_profile_create", userId, "Created copy investing profile");

      return { success: true, profileId: profile.id };
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      description: z.string().optional(),
      strategy: z.string().optional(),
      riskLevel: z.enum(["low", "medium", "high"]).optional(),
      isPublic: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const profile = store.copyInvestingProfiles.find(p => p.userId === userId);
      if (!profile) return { success: false, message: "Profile not found" };

      if (input.description) profile.description = input.description;
      if (input.strategy) profile.strategy = input.strategy;
      if (input.riskLevel) profile.riskLevel = input.riskLevel;
      if (input.isPublic !== undefined) profile.isPublic = input.isPublic;

      return { success: true };
    }),

  followProfile: protectedProcedure
    .input(z.object({
      profileId: z.string(),
      allocationAmount: z.number().positive(),
      allocationPercent: z.number().min(1).max(100),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[CopyInvesting] Following profile:", input.profileId, "by:", userId);

      const profile = store.copyInvestingProfiles.find(p => p.id === input.profileId);
      if (!profile) return { success: false, message: "Profile not found" };
      if (profile.userId === userId) return { success: false, message: "Cannot follow your own profile" };

      const existing = store.copyFollows.find(f => f.followerId === userId && f.profileId === input.profileId && f.status === "active");
      if (existing) return { success: false, message: "Already following this profile" };

      const follow = {
        id: store.genId("cflw"),
        followerId: userId,
        profileId: input.profileId,
        profileUserId: profile.userId,
        allocationAmount: input.allocationAmount,
        allocationPercent: input.allocationPercent,
        status: "active" as const,
        totalCopied: 0,
        totalReturn: 0,
        createdAt: new Date().toISOString(),
      };
      store.copyFollows.push(follow);
      profile.totalFollowers++;
      store.log("copy_follow", userId, `Started following ${profile.userName}`);

      return { success: true, followId: follow.id };
    }),

  unfollowProfile: protectedProcedure
    .input(z.object({ followId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const follow = store.copyFollows.find(f => f.id === input.followId && f.followerId === userId);
      if (!follow) return { success: false, message: "Follow not found" };

      follow.status = "stopped";
      const profile = store.copyInvestingProfiles.find(p => p.id === follow.profileId);
      if (profile && profile.totalFollowers > 0) profile.totalFollowers--;

      store.log("copy_unfollow", userId, `Stopped following profile ${follow.profileId}`);
      return { success: true };
    }),

  getMyFollowing: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const follows = store.copyFollows.filter(f => f.followerId === userId && f.status === "active");
      const enriched = follows.map(f => {
        const profile = store.copyInvestingProfiles.find(p => p.id === f.profileId);
        return { ...f, profileName: profile?.userName || "", profileStrategy: profile?.strategy || "", profileReturn: profile?.totalReturnPercent || 0 };
      });
      const result = store.paginate(enriched, input.page, input.limit);
      return { following: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getLeaderboard: protectedProcedure
    .input(z.object({
      period: z.enum(["1M", "3M", "1Y", "ALL"]).default("1Y"),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input }) => {
      const profiles = store.copyInvestingProfiles.filter(p => p.isPublic);
      const sorted = [...profiles].sort((a, b) => b.totalReturnPercent - a.totalReturnPercent).slice(0, input.limit);
      return {
        period: input.period,
        leaders: sorted.map((p, i) => ({
          rank: i + 1,
          profileId: p.id,
          userName: p.userName,
          avatar: p.avatar,
          strategy: p.strategy,
          totalReturnPercent: p.totalReturnPercent,
          winRate: p.winRate,
          followers: p.totalFollowers,
          riskLevel: p.riskLevel,
        })),
      };
    }),
});
