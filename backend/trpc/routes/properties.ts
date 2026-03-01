import * as z from "zod";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

const propertyTypeSchema = z.enum(["residential", "commercial", "mixed", "industrial"]);
const propertyStatusSchema = z.enum(["live", "coming_soon", "funded", "closed"]);
const riskLevelSchema = z.enum(["low", "medium", "high"]);

const propertyInputSchema = z.object({
  name: z.string().min(1).max(200),
  location: z.string(),
  city: z.string(),
  country: z.string(),
  images: z.array(z.string().url()),
  pricePerShare: z.number().positive(),
  totalShares: z.number().positive().int(),
  availableShares: z.number().int(),
  minInvestment: z.number().positive(),
  targetRaise: z.number().positive(),
  yield: z.number(),
  capRate: z.number(),
  irr: z.number(),
  occupancy: z.number().min(0).max(100),
  propertyType: propertyTypeSchema,
  status: propertyStatusSchema,
  riskLevel: riskLevelSchema,
  description: z.string(),
  highlights: z.array(z.string()),
  closingDate: z.string(),
});

export const propertiesRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: propertyStatusSchema.optional(),
      propertyType: propertyTypeSchema.optional(),
      minYield: z.number().optional(),
      maxPrice: z.number().optional(),
      country: z.string().optional(),
      sortBy: z.enum(["createdAt", "yield", "pricePerShare", "targetRaise"]).optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    }))
    .query(async ({ input }) => {
      console.log("[Properties] Fetching properties list");
      let props = [...store.properties];
      if (input.status) props = props.filter(p => p.status === input.status);
      if (input.propertyType) props = props.filter(p => p.propertyType === input.propertyType);
      if (input.minYield) props = props.filter(p => p.yield >= input.minYield!);
      if (input.maxPrice) props = props.filter(p => p.pricePerShare <= input.maxPrice!);
      if (input.country) props = props.filter(p => p.country === input.country);

      if (input.sortBy) {
        const dir = input.sortOrder === "asc" ? 1 : -1;
        props.sort((a, b) => {
          const aVal = a[input.sortBy as keyof typeof a] as number;
          const bVal = b[input.sortBy as keyof typeof b] as number;
          return (aVal - bVal) * dir;
        });
      }

      const result = store.paginate(props, input.page, input.limit);
      return { properties: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      console.log("[Properties] Fetching property:", input.id);
      return store.getProperty(input.id) || null;
    }),

  create: adminProcedure
    .input(propertyInputSchema)
    .mutation(async ({ input, ctx }) => {
      console.log("[Properties] Creating property:", input.name);
      const id = store.genId("prop");
      store.properties.push({
        id, ...input, currentRaise: 0, documents: [], distributions: [],
        priceHistory: [], createdAt: new Date().toISOString(),
      });
      store.persist();
      store.log("property_create", ctx.userId || "admin", `Created: ${input.name}`);
      return { success: true, propertyId: id };
    }),

  update: adminProcedure
    .input(z.object({ id: z.string(), data: propertyInputSchema.partial() }))
    .mutation(async ({ input, ctx }) => {
      const prop = store.getProperty(input.id);
      if (!prop) return { success: false };
      Object.assign(prop, input.data);
      store.persist();
      store.log("property_update", ctx.userId || "admin", `Updated: ${prop.name}`);
      return { success: true };
    }),

  updateStatus: adminProcedure
    .input(z.object({ id: z.string(), status: propertyStatusSchema }))
    .mutation(async ({ input, ctx }) => {
      const prop = store.getProperty(input.id);
      if (!prop) return { success: false };
      prop.status = input.status;
      store.persist();
      store.log("property_status", ctx.userId || "admin", `${prop.name} -> ${input.status}`);
      return { success: true };
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const idx = store.properties.findIndex(p => p.id === input.id);
      if (idx < 0) return { success: false };
      const name = store.properties[idx].name;
      store.properties.splice(idx, 1);
      store.marketData.delete(input.id);
      store.persist();
      store.log("property_delete", ctx.userId || "admin", `Deleted: ${name}`);
      return { success: true };
    }),

  getInvestors: adminProcedure
    .input(z.object({
      propertyId: z.string(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const investors: Array<{ userId: string; userName: string; shares: number; invested: number }> = [];
      for (const [userId, holdings] of store.holdings.entries()) {
        const h = holdings.find(h => h.propertyId === input.propertyId);
        if (h) {
          const user = store.getUser(userId);
          investors.push({
            userId, userName: user ? `${user.firstName} ${user.lastName}` : "Unknown",
            shares: h.shares, invested: h.shares * h.avgCostBasis,
          });
        }
      }
      const result = store.paginate(investors, input.page, input.limit);
      return {
        investors: result.items, total: result.total, page: result.page, limit: result.limit,
        totalShares: investors.reduce((s, i) => s + i.shares, 0),
        totalInvested: investors.reduce((s, i) => s + i.invested, 0),
      };
    }),

  getPerformance: adminProcedure
    .input(z.object({
      propertyId: z.string(),
      period: z.enum(["1M", "3M", "6M", "1Y", "ALL"]).default("1Y"),
    }))
    .query(async ({ input }) => {
      const prop = store.getProperty(input.propertyId);
      if (!prop) return null;

      let daysBack = 365;
      switch (input.period) {
        case "1M": daysBack = 30; break;
        case "3M": daysBack = 90; break;
        case "6M": daysBack = 180; break;
        case "ALL": daysBack = 9999; break;
      }

      const cutoff = new Date(Date.now() - daysBack * 86400000);
      const history = prop.priceHistory.filter(p => new Date(p.date) >= cutoff);

      return {
        propertyId: input.propertyId, period: input.period,
        priceHistory: history,
        volumeHistory: history.map(h => ({ date: h.date, volume: h.volume })),
        returns: {
          total: history.length > 1 ? Math.round(((history[history.length - 1].price - history[0].price) / history[0].price) * 10000) / 100 : 0,
          annualized: prop.irr,
        },
        distributions: prop.distributions,
      };
    }),

  getStats: adminProcedure.query(async () => {
    const props = store.properties;
    return {
      totalProperties: props.length,
      liveProperties: props.filter(p => p.status === "live").length,
      fundedProperties: props.filter(p => p.status === "funded").length,
      comingSoonProperties: props.filter(p => p.status === "coming_soon").length,
      totalTargetRaise: props.reduce((s, p) => s + p.targetRaise, 0),
      totalCurrentRaise: props.reduce((s, p) => s + p.currentRaise, 0),
      averageYield: props.length > 0 ? Math.round(props.reduce((s, p) => s + p.yield, 0) / props.length * 100) / 100 : 0,
      totalInvestors: (() => {
        const investorSet = new Set<string>();
        for (const [userId, holdings] of store.holdings.entries()) {
          if (holdings.length > 0) investorSet.add(userId);
        }
        return investorSet.size;
      })(),
    };
  }),

  uploadDocuments: adminProcedure
    .input(z.object({
      propertyId: z.string(),
      documents: z.array(z.object({ name: z.string(), type: z.enum(["title", "appraisal", "insurance", "inspection", "legal"]), url: z.string().url() })),
    }))
    .mutation(async ({ input }) => {
      const prop = store.getProperty(input.propertyId);
      if (!prop) return { success: false };
      input.documents.forEach(d => prop.documents.push({ id: store.genId("doc"), ...d }));
      store.persist();
      return { success: true };
    }),

  recordDistribution: adminProcedure
    .input(z.object({
      propertyId: z.string(),
      amount: z.number().positive(),
      type: z.enum(["dividend", "rental"]),
      date: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const prop = store.getProperty(input.propertyId);
      if (!prop) return { success: false, distributionId: null };

      const distId = store.genId("dist");
      prop.distributions.push({ id: distId, date: input.date, amount: input.amount, type: input.type });

      for (const [userId, holdings] of store.holdings.entries()) {
        const h = holdings.find(h => h.propertyId === input.propertyId);
        if (h) {
          const dividendAmount = Math.round(h.shares * input.amount * 100) / 100;
          const balance = store.getWalletBalance(userId);
          balance.available += dividendAmount;
          store.addTransaction(userId, {
            id: store.genId("txn"), type: "dividend", amount: dividendAmount, status: "completed",
            description: `${input.type === "dividend" ? "Dividend" : "Rental"} from ${prop.name}`,
            propertyId: prop.id, propertyName: prop.name, createdAt: new Date().toISOString(),
          });
          store.addNotification(userId, {
            id: store.genId("notif"), type: "dividend", title: "Distribution Received",
            message: `You received $${dividendAmount.toFixed(2)} from ${prop.name}`,
            read: false, createdAt: new Date().toISOString(),
          });
        }
      }

      store.persist();
      store.log("distribution", ctx.userId || "admin", `Recorded ${input.amount}/share for ${prop.name}`);
      return { success: true, distributionId: distId };
    }),
});
