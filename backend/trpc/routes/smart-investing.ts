import * as z from "zod";
import { createTRPCRouter, protectedProcedure } from "../create-context";
import { store } from "../../store/index";

const riskToleranceSchema = z.enum(["conservative", "moderate", "aggressive"]);
const investmentGoalSchema = z.enum(["income", "growth", "balanced"]);
const timeHorizonSchema = z.enum(["short", "medium", "long"]);

export const smartInvestingRouter = createTRPCRouter({
  getProfile: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      console.log("[SmartInvesting] Fetching profile for:", userId);
      return store.smartInvestingProfiles.get(userId) || null;
    }),

  createProfile: protectedProcedure
    .input(z.object({
      riskTolerance: riskToleranceSchema,
      investmentGoal: investmentGoalSchema,
      timeHorizon: timeHorizonSchema,
      monthlyBudget: z.number().positive(),
      diversificationLevel: z.enum(["low", "medium", "high"]),
      preferredPropertyTypes: z.array(z.string()),
      preferredRegions: z.array(z.string()),
      autoInvest: z.boolean().default(false),
      rebalanceFrequency: z.enum(["monthly", "quarterly", "annually", "never"]).default("quarterly"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[SmartInvesting] Creating profile for:", userId);

      const profile = {
        userId,
        ...input,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.smartInvestingProfiles.set(userId, profile);
      store.log("smart_invest_create", userId, `Created smart investing profile: ${input.riskTolerance}/${input.investmentGoal}`);

      return { success: true };
    }),

  updateProfile: protectedProcedure
    .input(z.object({
      riskTolerance: riskToleranceSchema.optional(),
      investmentGoal: investmentGoalSchema.optional(),
      timeHorizon: timeHorizonSchema.optional(),
      monthlyBudget: z.number().positive().optional(),
      diversificationLevel: z.enum(["low", "medium", "high"]).optional(),
      preferredPropertyTypes: z.array(z.string()).optional(),
      preferredRegions: z.array(z.string()).optional(),
      autoInvest: z.boolean().optional(),
      rebalanceFrequency: z.enum(["monthly", "quarterly", "annually", "never"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const profile = store.smartInvestingProfiles.get(userId);
      if (!profile) return { success: false, message: "Profile not found. Create one first." };

      if (input.riskTolerance) profile.riskTolerance = input.riskTolerance;
      if (input.investmentGoal) profile.investmentGoal = input.investmentGoal;
      if (input.timeHorizon) profile.timeHorizon = input.timeHorizon;
      if (input.monthlyBudget) profile.monthlyBudget = input.monthlyBudget;
      if (input.diversificationLevel) profile.diversificationLevel = input.diversificationLevel;
      if (input.preferredPropertyTypes) profile.preferredPropertyTypes = input.preferredPropertyTypes;
      if (input.preferredRegions) profile.preferredRegions = input.preferredRegions;
      if (input.autoInvest !== undefined) profile.autoInvest = input.autoInvest;
      if (input.rebalanceFrequency) profile.rebalanceFrequency = input.rebalanceFrequency;
      profile.updatedAt = new Date().toISOString();

      return { success: true };
    }),

  getRecommendations: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const profile = store.smartInvestingProfiles.get(userId);
      const holdings = store.getUserHoldings(userId);
      const balance = store.getWalletBalance(userId);

      let props = store.properties.filter(p => p.status === "live" && p.availableShares > 0);
      const heldPropertyIds = holdings.map(h => h.propertyId);

      if (profile) {
        if (profile.riskTolerance === "conservative") {
          props = props.filter(p => p.riskLevel === "low");
        } else if (profile.riskTolerance === "moderate") {
          props = props.filter(p => p.riskLevel === "low" || p.riskLevel === "medium");
        }

        if (profile.investmentGoal === "income") {
          props.sort((a, b) => b.yield - a.yield);
        } else if (profile.investmentGoal === "growth") {
          props.sort((a, b) => b.irr - a.irr);
        } else {
          props.sort((a, b) => (b.yield + b.irr) / 2 - (a.yield + a.irr) / 2);
        }

        if (profile.preferredPropertyTypes.length > 0) {
          const preferred = props.filter(p => profile.preferredPropertyTypes.includes(p.propertyType));
          const others = props.filter(p => !profile.preferredPropertyTypes.includes(p.propertyType));
          props = [...preferred, ...others];
        }
      }

      return {
        recommendations: props.slice(0, 5).map((p, i) => ({
          propertyId: p.id,
          name: p.name,
          city: p.city,
          country: p.country,
          pricePerShare: p.pricePerShare,
          yield: p.yield,
          irr: p.irr,
          riskLevel: p.riskLevel,
          propertyType: p.propertyType,
          matchScore: Math.max(50, 95 - i * 8),
          reason: i === 0 ? "Best match for your profile" :
                  heldPropertyIds.includes(p.id) ? "Already in your portfolio" :
                  `Strong ${profile?.investmentGoal || "balanced"} potential`,
          alreadyHeld: heldPropertyIds.includes(p.id),
          suggestedShares: Math.max(1, Math.floor(balance.available * 0.1 / p.pricePerShare)),
        })),
        profileSummary: profile ? {
          riskTolerance: profile.riskTolerance,
          investmentGoal: profile.investmentGoal,
          monthlyBudget: profile.monthlyBudget,
          availableBalance: balance.available,
        } : null,
      };
    }),

  getPortfolioAnalysis: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const holdings = store.getUserHoldings(userId);
      const profile = store.smartInvestingProfiles.get(userId);

      const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
      const byType: Record<string, number> = {};
      const byCountry: Record<string, number> = {};
      const byRisk: Record<string, number> = {};

      holdings.forEach(h => {
        const prop = store.getProperty(h.propertyId);
        if (prop) {
          byType[prop.propertyType] = (byType[prop.propertyType] || 0) + h.currentValue;
          byCountry[prop.country] = (byCountry[prop.country] || 0) + h.currentValue;
          byRisk[prop.riskLevel] = (byRisk[prop.riskLevel] || 0) + h.currentValue;
        }
      });

      const diversificationScore = Object.keys(byType).length * 20 + Object.keys(byCountry).length * 15;
      const riskScore = ((byRisk["low"] || 0) * 1 + (byRisk["medium"] || 0) * 2 + (byRisk["high"] || 0) * 3) / (totalValue || 1);

      const issues: string[] = [];
      if (Object.keys(byType).length < 2) issues.push("Low property type diversification");
      if (Object.keys(byCountry).length < 2) issues.push("Geographic concentration risk");
      if ((byRisk["high"] || 0) / (totalValue || 1) > 0.5) issues.push("High-risk allocation above 50%");

      return {
        totalValue,
        holdingsCount: holdings.length,
        diversificationScore: Math.min(100, diversificationScore),
        riskScore: Math.round(riskScore * 100) / 100,
        allocation: {
          byType: Object.entries(byType).map(([type, value]) => ({ type, value, percent: Math.round((value / (totalValue || 1)) * 10000) / 100 })),
          byCountry: Object.entries(byCountry).map(([country, value]) => ({ country, value, percent: Math.round((value / (totalValue || 1)) * 10000) / 100 })),
          byRisk: Object.entries(byRisk).map(([risk, value]) => ({ risk, value, percent: Math.round((value / (totalValue || 1)) * 10000) / 100 })),
        },
        issues,
        alignedWithProfile: profile ? riskScore <= (profile.riskTolerance === "conservative" ? 1.5 : profile.riskTolerance === "moderate" ? 2.5 : 3) : null,
      };
    }),
});
