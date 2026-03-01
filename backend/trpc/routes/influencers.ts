import * as z from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

const platformSchema = z.enum(["instagram", "facebook", "twitter", "linkedin", "google", "tiktok"]);

export const influencersRouter = createTRPCRouter({
  submitApplication: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      platform: platformSchema,
      handle: z.string().min(1),
      followers: z.number().positive(),
      profileUrl: z.string().url(),
      bio: z.string().min(10),
      whyJoin: z.string().min(10),
      source: z.enum(["app_search", "referral", "social_media", "website"]).default("app_search"),
      referredBy: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[Influencers] New application from:", input.name);

      const existing = store.influencerApplications.find(a => a.email === input.email);
      if (existing) return { success: false, message: "Application already submitted" };

      const app = {
        id: store.genId("iapp"),
        name: input.name,
        email: input.email,
        phone: input.phone,
        platform: input.platform,
        handle: input.handle,
        followers: input.followers,
        profileUrl: input.profileUrl,
        bio: input.bio,
        whyJoin: input.whyJoin,
        source: input.source,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      store.influencerApplications.push(app);
      store.log("influencer_apply", userId, `${input.name} applied as influencer`);

      return { success: true, applicationId: app.id };
    }),

  getApplicationStatus: protectedProcedure
    .input(z.object({ email: z.string().email() }))
    .query(async ({ input }) => {
      const app = store.influencerApplications.find(a => a.email === input.email);
      if (!app) return null;
      return { id: app.id, status: app.status, createdAt: app.createdAt, reviewedAt: app.reviewedAt };
    }),

  listApplications: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: z.enum(["all", "pending", "approved", "rejected"]).optional(),
    }))
    .query(async ({ input }) => {
      let apps = [...store.influencerApplications];
      if (input.status && input.status !== "all") apps = apps.filter(a => a.status === input.status);
      apps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const result = store.paginate(apps, input.page, input.limit);
      return { applications: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  reviewApplication: adminProcedure
    .input(z.object({
      applicationId: z.string(),
      decision: z.enum(["approved", "rejected"]),
      commissionRate: z.number().min(0).max(50).optional(),
      rejectionReason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const app = store.influencerApplications.find(a => a.id === input.applicationId);
      if (!app) return { success: false, message: "Application not found" };

      app.status = input.decision;
      app.reviewedBy = ctx.userId || "admin";
      app.reviewedAt = new Date().toISOString();
      if (input.rejectionReason) app.rejectionReason = input.rejectionReason;

      if (input.decision === "approved") {
        let tier = "micro";
        if (app.followers >= 1000000) tier = "mega";
        else if (app.followers >= 100000) tier = "macro";
        else if (app.followers >= 10000) tier = "mid";

        const influencer = {
          id: store.genId("inf"),
          name: app.name,
          email: app.email,
          phone: app.phone,
          platform: app.platform,
          handle: app.handle,
          followers: app.followers,
          tier,
          status: "active",
          referralCode: `INF${app.handle.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)}${Math.floor(Math.random() * 100)}`,
          commissionRate: input.commissionRate || 5,
          totalEarnings: 0,
          pendingEarnings: 0,
          paidEarnings: 0,
          contractStartDate: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        };
        store.influencers.push(influencer);
        store.log("influencer_approved", ctx.userId || "admin", `Approved influencer: ${app.name}`);
      }

      return { success: true };
    }),

  list: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: z.enum(["all", "active", "paused", "terminated"]).optional(),
      tier: z.enum(["all", "micro", "mid", "macro", "mega"]).optional(),
    }))
    .query(async ({ input }) => {
      let influencers = [...store.influencers];
      if (input.status && input.status !== "all") influencers = influencers.filter(i => i.status === input.status);
      if (input.tier && input.tier !== "all") influencers = influencers.filter(i => i.tier === input.tier);
      const result = store.paginate(influencers, input.page, input.limit);
      return { influencers: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return store.influencers.find(i => i.id === input.id) || null;
    }),

  updateStatus: adminProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["active", "paused", "terminated"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const inf = store.influencers.find(i => i.id === input.id);
      if (!inf) return { success: false, message: "Influencer not found" };
      inf.status = input.status;
      store.log("influencer_status", ctx.userId || "admin", `Updated ${inf.name} to ${input.status}`);
      return { success: true };
    }),

  updateCommission: adminProcedure
    .input(z.object({
      id: z.string(),
      commissionRate: z.number().min(0).max(50),
    }))
    .mutation(async ({ input }) => {
      const inf = store.influencers.find(i => i.id === input.id);
      if (!inf) return { success: false, message: "Influencer not found" };
      inf.commissionRate = input.commissionRate;
      return { success: true };
    }),

  getStats: adminProcedure
    .query(async () => {
      const influencers = store.influencers;
      return {
        totalInfluencers: influencers.length,
        activeInfluencers: influencers.filter(i => i.status === "active").length,
        totalEarnings: influencers.reduce((s, i) => s + i.totalEarnings, 0),
        pendingPayments: influencers.reduce((s, i) => s + i.pendingEarnings, 0),
        pendingApplications: store.influencerApplications.filter(a => a.status === "pending").length,
        byTier: {
          micro: influencers.filter(i => i.tier === "micro").length,
          mid: influencers.filter(i => i.tier === "mid").length,
          macro: influencers.filter(i => i.tier === "macro").length,
          mega: influencers.filter(i => i.tier === "mega").length,
        },
      };
    }),
});
