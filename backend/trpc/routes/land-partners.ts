import * as z from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

export const landPartnersRouter = createTRPCRouter({
  submitDeal: protectedProcedure
    .input(z.object({
      partnerType: z.enum(["jv", "lp", "hybrid"]),
      firstName: z.string(),
      lastName: z.string(),
      email: z.string().email(),
      phone: z.string(),
      propertyAddress: z.string(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
      country: z.string(),
      lotSize: z.number().positive(),
      lotSizeUnit: z.enum(["sqft", "acres"]),
      zoning: z.string(),
      propertyType: z.enum(["residential", "commercial", "mixed", "industrial", "land"]),
      estimatedValue: z.number().positive(),
      description: z.string().optional(),
      controlDisclosureAccepted: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[LandPartners] New deal submission from:", userId);

      if (!input.controlDisclosureAccepted) {
        return { success: false, message: "Control disclosure must be accepted" };
      }

      const cashPercent = 0.6;
      const collateralPercent = 0.4;
      const cashAmount = Math.round(input.estimatedValue * cashPercent);
      const collateralAmount = Math.round(input.estimatedValue * collateralPercent);

      const deal = {
        id: store.genId("lp"),
        partnerId: userId,
        partnerName: `${input.firstName} ${input.lastName}`,
        partnerEmail: input.email,
        partnerPhone: input.phone,
        partnerType: input.partnerType,
        propertyAddress: input.propertyAddress,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        country: input.country,
        lotSize: input.lotSize,
        lotSizeUnit: input.lotSizeUnit,
        zoning: input.zoning,
        propertyType: input.propertyType,
        estimatedValue: input.estimatedValue,
        cashPaymentPercent: 60,
        collateralPercent: 40,
        partnerProfitShare: 30,
        developerProfitShare: 70,
        termMonths: 30,
        cashPaymentAmount: cashAmount,
        collateralAmount: collateralAmount,
        status: "submitted",
        submittedAt: new Date().toISOString(),
      };
      store.landPartnerDeals.push(deal);
      store.log("land_partner_submit", userId, `Submitted deal for ${input.propertyAddress}`);

      return { success: true, dealId: deal.id, cashPayment: cashAmount, collateral: collateralAmount };
    }),

  getUserDeals: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const deals = store.landPartnerDeals.filter(d => d.partnerId === userId);
      const result = store.paginate(deals, input.page, input.limit);
      return { deals: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return store.landPartnerDeals.find(d => d.id === input.id) || null;
    }),

  listAll: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      let deals = [...store.landPartnerDeals];
      if (input.status) deals = deals.filter(d => d.status === input.status);
      const result = store.paginate(deals, input.page, input.limit);
      return { deals: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  updateStatus: adminProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["draft", "submitted", "valuation", "review", "approved", "active", "completed", "rejected"]),
      appraisedValue: z.number().optional(),
      notes: z.string().optional(),
      rejectionReason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const deal = store.landPartnerDeals.find(d => d.id === input.id);
      if (!deal) return { success: false, message: "Deal not found" };

      deal.status = input.status;
      if (input.appraisedValue) deal.appraisedValue = input.appraisedValue;
      if (input.status === "approved") deal.approvedAt = new Date().toISOString();

      store.log("land_partner_review", ctx.userId || "admin", `Updated deal ${input.id} to ${input.status}`);
      return { success: true };
    }),

  calculateScenarios: protectedProcedure
    .input(z.object({
      estimatedValue: z.number().positive(),
      salePriceVariance: z.number().default(0),
      costOverrunPercent: z.number().default(0),
    }))
    .query(async ({ input }) => {
      const cashPayment = input.estimatedValue * 0.6;
      const collateral = input.estimatedValue * 0.4;
      const projectCost = input.estimatedValue * 0.3;

      const scenarios = ["optimistic", "base", "pessimistic"].map(scenario => {
        let multiplier = 1;
        if (scenario === "optimistic") multiplier = 1.2;
        if (scenario === "pessimistic") multiplier = 0.8;

        const salePrice = input.estimatedValue * multiplier * (1 + input.salePriceVariance / 100);
        const costWithOverrun = projectCost * (1 + input.costOverrunPercent / 100);
        const netProfit = salePrice - cashPayment - costWithOverrun;
        const partnerProfit = netProfit * 0.3;
        const totalReturn = cashPayment + partnerProfit;

        return {
          scenario,
          salePrice: Math.round(salePrice),
          projectCost: Math.round(costWithOverrun),
          netProfit: Math.round(netProfit),
          partnerProfit: Math.round(partnerProfit),
          totalReturn: Math.round(totalReturn),
          roi: Math.round((partnerProfit / collateral) * 10000) / 100,
        };
      });

      return { scenarios, cashPayment: Math.round(cashPayment), collateral: Math.round(collateral) };
    }),

  getStats: adminProcedure
    .query(async () => {
      const deals = store.landPartnerDeals;
      return {
        total: deals.length,
        submitted: deals.filter(d => d.status === "submitted").length,
        inReview: deals.filter(d => ["valuation", "review"].includes(d.status)).length,
        approved: deals.filter(d => d.status === "approved").length,
        active: deals.filter(d => d.status === "active").length,
        completed: deals.filter(d => d.status === "completed").length,
        rejected: deals.filter(d => d.status === "rejected").length,
        totalEstimatedValue: deals.reduce((sum, d) => sum + d.estimatedValue, 0),
      };
    }),
});
