import * as z from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

export const debtAcquisitionRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: z.enum(["all", "available", "tokenizing", "funded", "first_lien_secured"]).optional(),
      sortBy: z.enum(["projectedYield", "tokenizationProgress", "listingDate"]).optional(),
    }))
    .query(async ({ input }) => {
      console.log("[DebtAcquisition] Listing properties");
      let items = [...store.debtAcquisitions];
      if (input.status && input.status !== "all") {
        items = items.filter(d => d.status === input.status);
      }
      if (input.sortBy === "projectedYield") items.sort((a, b) => b.projectedYield - a.projectedYield);
      if (input.sortBy === "tokenizationProgress") items.sort((a, b) => b.tokenizationProgress - a.tokenizationProgress);
      const result = store.paginate(items, input.page, input.limit);
      return { properties: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return store.debtAcquisitions.find(d => d.id === input.id) || null;
    }),

  purchaseTokens: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      tokens: z.number().positive().int(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const prop = store.debtAcquisitions.find(d => d.id === input.propertyId);
      if (!prop) return { success: false, message: "Property not found" };
      if (prop.availableTokens < input.tokens) return { success: false, message: "Not enough tokens available" };
      if (input.tokens < prop.minTokenPurchase) return { success: false, message: `Minimum purchase is ${prop.minTokenPurchase} tokens` };

      const totalAmount = input.tokens * prop.pricePerToken;
      const ipxFee = Math.round(totalAmount * prop.ipxFeePercent / 100 * 100) / 100;
      const balance = store.getWalletBalance(userId);

      if (balance.available < totalAmount + ipxFee) {
        return { success: false, message: "Insufficient funds" };
      }

      balance.available -= totalAmount + ipxFee;
      balance.invested += totalAmount;
      prop.availableTokens -= input.tokens;
      prop.tokenizationProgress = Math.round(((prop.totalTokens - prop.availableTokens) / prop.totalTokens) * 100);

      if (prop.availableTokens === 0) {
        prop.status = "funded";
      }

      store.addTransaction(userId, {
        id: store.genId("txn"),
        type: "buy",
        amount: -(totalAmount + ipxFee),
        status: "completed",
        description: `Purchased ${input.tokens} debt tokens of ${prop.name}`,
        propertyId: prop.id,
        propertyName: prop.name,
        createdAt: new Date().toISOString(),
      });

      store.log("debt_token_purchase", userId, `Purchased ${input.tokens} tokens of ${prop.name}`);

      return {
        success: true,
        purchaseId: store.genId("dtp"),
        tokens: input.tokens,
        totalAmount,
        ipxFee,
        netInvestment: totalAmount,
        expectedYield: prop.projectedYield,
      };
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string(),
      address: z.string(),
      city: z.string(),
      state: z.string(),
      country: z.string(),
      images: z.array(z.string()).optional(),
      propertyType: z.enum(["residential", "commercial", "mixed", "industrial"]),
      marketValue: z.number().positive(),
      appraisedValue: z.number().positive(),
      ltvPercent: z.number().min(0).max(100).default(85),
      ipxFeePercent: z.number().min(0).max(100).default(2),
      mortgageInterestRate: z.number().positive(),
      mortgageTermMonths: z.number().positive().int(),
      pricePerToken: z.number().positive(),
      minTokenPurchase: z.number().positive().int().default(1),
      projectedYield: z.number(),
      projectedIRR: z.number(),
      tokenizationDeadline: z.string(),
      riskFactors: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log("[DebtAcquisition] Creating new listing:", input.name);

      const financingAmount = Math.round(input.appraisedValue * input.ltvPercent / 100);
      const closingCostPercent = 3;
      const closingCostAmount = Math.round(financingAmount * closingCostPercent / 100);
      const ipxFeeAmount = Math.round(financingAmount * input.ipxFeePercent / 100);
      const ownerNetProceeds = financingAmount - closingCostAmount - ipxFeeAmount;
      const totalTokens = Math.floor(financingAmount / input.pricePerToken);
      const monthlyRate = input.mortgageInterestRate / 100 / 12;
      const monthlyPayment = Math.round(financingAmount * monthlyRate * Math.pow(1 + monthlyRate, input.mortgageTermMonths) / (Math.pow(1 + monthlyRate, input.mortgageTermMonths) - 1));

      const property = {
        id: store.genId("debt"),
        name: input.name,
        address: input.address,
        city: input.city,
        state: input.state,
        country: input.country,
        images: input.images || [],
        propertyType: input.propertyType,
        marketValue: input.marketValue,
        appraisedValue: input.appraisedValue,
        ltvPercent: input.ltvPercent,
        financingAmount,
        closingCostPercent,
        closingCostAmount,
        ipxFeePercent: input.ipxFeePercent,
        ipxFeeAmount,
        ownerNetProceeds,
        mortgageInterestRate: input.mortgageInterestRate,
        mortgageTermMonths: input.mortgageTermMonths,
        monthlyMortgagePayment: monthlyPayment,
        tokenizationAmount: financingAmount,
        pricePerToken: input.pricePerToken,
        totalTokens,
        availableTokens: totalTokens,
        minTokenPurchase: input.minTokenPurchase,
        projectedYield: input.projectedYield,
        projectedIRR: input.projectedIRR,
        status: "available",
        tokenizationProgress: 0,
        listingDate: new Date().toISOString(),
        tokenizationDeadline: input.tokenizationDeadline,
        riskFactors: input.riskFactors || [],
      };
      store.debtAcquisitions.push(property);
      store.log("debt_acquisition_create", ctx.userId || "admin", `Created ${input.name}`);

      return { success: true, propertyId: property.id };
    }),

  getStats: adminProcedure
    .query(async () => {
      const items = store.debtAcquisitions;
      return {
        totalPropertiesListed: items.length,
        totalDebtAcquired: items.reduce((s, d) => s + d.financingAmount, 0),
        totalTokenized: items.filter(d => d.status === "funded").reduce((s, d) => s + d.tokenizationAmount, 0),
        firstLiensSecured: items.filter(d => d.status === "first_lien_secured" || d.status === "funded").length,
        averageYield: items.length > 0 ? Math.round(items.reduce((s, d) => s + d.projectedYield, 0) / items.length * 100) / 100 : 0,
        averageLTV: items.length > 0 ? Math.round(items.reduce((s, d) => s + d.ltvPercent, 0) / items.length * 100) / 100 : 0,
      };
    }),
});
