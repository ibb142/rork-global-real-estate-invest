import * as z from "zod";
import { createTRPCRouter, protectedProcedure } from "../create-context";
import { store } from "../../store/index";

const riskLevelSchema = z.enum(["low", "medium", "high", "any"]);

export const autoReinvestRouter = createTRPCRouter({
  getConfig: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      console.log("[AutoReinvest] Fetching config for:", userId);
      const config = store.autoReinvestConfigs.get(userId);
      if (config) return config;
      return {
        userId,
        enabled: false,
        percentage: 100,
        propertyPreferences: [] as string[],
        minAmount: 100,
        maxAmount: 50000,
        riskLevel: "any" as const,
        reinvestDividends: true,
        reinvestReturns: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }),

  updateConfig: protectedProcedure
    .input(z.object({
      enabled: z.boolean().optional(),
      percentage: z.number().min(1).max(100).optional(),
      propertyPreferences: z.array(z.string()).optional(),
      minAmount: z.number().positive().optional(),
      maxAmount: z.number().positive().optional(),
      riskLevel: riskLevelSchema.optional(),
      reinvestDividends: z.boolean().optional(),
      reinvestReturns: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[AutoReinvest] Updating config for:", userId);

      let config = store.autoReinvestConfigs.get(userId);
      if (!config) {
        config = {
          userId,
          enabled: false,
          percentage: 100,
          propertyPreferences: [],
          minAmount: 100,
          maxAmount: 50000,
          riskLevel: "any",
          reinvestDividends: true,
          reinvestReturns: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      if (input.enabled !== undefined) config.enabled = input.enabled;
      if (input.percentage !== undefined) config.percentage = input.percentage;
      if (input.propertyPreferences !== undefined) config.propertyPreferences = input.propertyPreferences;
      if (input.minAmount !== undefined) config.minAmount = input.minAmount;
      if (input.maxAmount !== undefined) config.maxAmount = input.maxAmount;
      if (input.riskLevel !== undefined) config.riskLevel = input.riskLevel;
      if (input.reinvestDividends !== undefined) config.reinvestDividends = input.reinvestDividends;
      if (input.reinvestReturns !== undefined) config.reinvestReturns = input.reinvestReturns;
      config.updatedAt = new Date().toISOString();

      store.autoReinvestConfigs.set(userId, config);
      store.log("auto_reinvest_update", userId, `Auto-reinvest ${config.enabled ? "enabled" : "disabled"} at ${config.percentage}%`);

      return { success: true };
    }),

  getHistory: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const txs = store.getUserTransactions(userId).filter(t =>
        t.type === "buy" && t.description?.includes("Auto-reinvest")
      );
      const result = store.paginate(txs, input.page, input.limit);
      return {
        reinvestments: result.items,
        total: result.total,
        totalReinvested: txs.reduce((s, t) => s + Math.abs(t.amount), 0),
        page: result.page,
        limit: result.limit,
      };
    }),

  getEligibleProperties: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const config = store.autoReinvestConfigs.get(userId);
      let props = store.properties.filter(p => p.status === "live" && p.availableShares > 0);

      if (config?.riskLevel && config.riskLevel !== "any") {
        props = props.filter(p => p.riskLevel === config.riskLevel);
      }
      if (config?.propertyPreferences && config.propertyPreferences.length > 0) {
        props = props.filter(p => config.propertyPreferences.includes(p.propertyType));
      }

      return {
        properties: props.map(p => ({
          id: p.id,
          name: p.name,
          city: p.city,
          country: p.country,
          pricePerShare: p.pricePerShare,
          yield: p.yield,
          riskLevel: p.riskLevel,
          propertyType: p.propertyType,
          availableShares: p.availableShares,
        })),
      };
    }),

  simulate: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      months: z.number().min(1).max(120).default(12),
      averageYield: z.number().min(0).max(30).default(7.5),
    }))
    .query(async ({ input }) => {
      const monthlyYield = input.averageYield / 100 / 12;
      let balance = input.amount;
      const projections: Array<{ month: number; balance: number; earned: number }> = [];
      let totalEarned = 0;

      for (let m = 1; m <= input.months; m++) {
        const earned = Math.round(balance * monthlyYield * 100) / 100;
        totalEarned += earned;
        balance += earned;
        projections.push({ month: m, balance: Math.round(balance * 100) / 100, earned });
      }

      return {
        initialAmount: input.amount,
        finalBalance: Math.round(balance * 100) / 100,
        totalEarned: Math.round(totalEarned * 100) / 100,
        effectiveYield: Math.round(((balance - input.amount) / input.amount) * 10000) / 100,
        projections,
      };
    }),
});
