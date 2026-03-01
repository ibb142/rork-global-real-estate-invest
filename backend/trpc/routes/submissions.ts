import * as z from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

export const submissionsRouter = createTRPCRouter({
  submit: protectedProcedure
    .input(z.object({
      propertyAddress: z.string(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
      country: z.string(),
      propertyType: z.enum(["residential", "commercial", "mixed", "industrial", "land"]),
      estimatedValue: z.number().positive(),
      deedNumber: z.string(),
      images: z.array(z.string()).optional(),
      description: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      console.log("[Submissions] New property submission from:", userId);

      const submission = {
        id: store.genId("sub"),
        ownerId: userId,
        ownerName: user ? `${user.firstName} ${user.lastName}` : "User",
        ownerEmail: user?.email || "",
        propertyAddress: input.propertyAddress,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        country: input.country,
        propertyType: input.propertyType,
        estimatedValue: input.estimatedValue,
        deedNumber: input.deedNumber,
        status: "pending",
        lienStatus: "clear",
        debtStatus: "none",
        totalDebt: 0,
        totalLiens: 0,
        images: input.images || [],
        description: input.description,
        submittedAt: new Date().toISOString(),
      };
      store.propertySubmissions.push(submission);
      store.log("property_submission", userId, `Submitted property at ${input.propertyAddress}`);

      return { success: true, submissionId: submission.id, status: "pending" };
    }),

  getUserSubmissions: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const subs = store.propertySubmissions.filter(s => s.ownerId === userId);
      const result = store.paginate(subs, input.page, input.limit);
      return { submissions: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return store.propertySubmissions.find(s => s.id === input.id) || null;
    }),

  listAll: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      let subs = [...store.propertySubmissions];
      if (input.status) subs = subs.filter(s => s.status === input.status);
      const result = store.paginate(subs, input.page, input.limit);
      return { submissions: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  updateStatus: adminProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["pending", "verification", "lien_check", "debt_review", "approved", "rejected", "listed"]),
      notes: z.string().optional(),
      verifiedValue: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const sub = store.propertySubmissions.find(s => s.id === input.id);
      if (!sub) return { success: false, message: "Submission not found" };

      sub.status = input.status;
      if (input.verifiedValue) sub.verifiedValue = input.verifiedValue;
      if (input.status === "approved") sub.verifiedAt = new Date().toISOString();

      store.log("submission_review", ctx.userId || "admin", `Updated submission ${input.id} to ${input.status}`);
      return { success: true };
    }),

  createFractionalShares: adminProcedure
    .input(z.object({
      submissionId: z.string(),
      totalShares: z.number().positive().int(),
      pricePerShare: z.number().positive(),
      minShares: z.number().positive().int().default(1),
      ownerPercentage: z.number().min(0).max(100),
      investorPercentage: z.number().min(0).max(100),
      ipxFeePercentage: z.number().min(0).max(100),
    }))
    .mutation(async ({ input }) => {
      const sub = store.propertySubmissions.find(s => s.id === input.submissionId);
      if (!sub) return { success: false, message: "Submission not found" };

      const fractional = {
        id: store.genId("frac"),
        submissionId: input.submissionId,
        propertyName: `Property at ${sub.propertyAddress}`,
        propertyAddress: sub.propertyAddress,
        totalShares: input.totalShares,
        availableShares: input.totalShares,
        pricePerShare: input.pricePerShare,
        minShares: input.minShares,
        ownerPercentage: input.ownerPercentage,
        investorPercentage: input.investorPercentage,
        ipxFeePercentage: input.ipxFeePercentage,
        status: "open",
        createdAt: new Date().toISOString(),
      };
      store.fractionalShares.push(fractional);
      sub.status = "listed";

      return { success: true, fractionalShareId: fractional.id };
    }),

  getStats: adminProcedure
    .query(async () => {
      const subs = store.propertySubmissions;
      return {
        total: subs.length,
        pending: subs.filter(s => s.status === "pending").length,
        inReview: subs.filter(s => ["verification", "lien_check", "debt_review"].includes(s.status)).length,
        approved: subs.filter(s => s.status === "approved").length,
        rejected: subs.filter(s => s.status === "rejected").length,
        listed: subs.filter(s => s.status === "listed").length,
        totalEstimatedValue: subs.reduce((sum, s) => sum + s.estimatedValue, 0),
      };
    }),
});
