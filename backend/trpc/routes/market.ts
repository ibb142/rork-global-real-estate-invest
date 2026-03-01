import * as z from "zod";
import { createTRPCRouter, publicProcedure, protectedProcedure } from "../create-context";
import { store } from "../../store/index";

export const marketRouter = createTRPCRouter({
  getMarketData: publicProcedure
    .input(z.object({ propertyId: z.string() }))
    .query(async ({ input }) => {
      console.log("[Market] Fetching market data for:", input.propertyId);
      const data = store.marketData.get(input.propertyId);
      if (!data) return null;
      return data;
    }),

  getAllMarketData: publicProcedure
    .query(async () => {
      console.log("[Market] Fetching all market data");
      const allData: Array<Record<string, unknown>> = [];
      for (const [, data] of store.marketData.entries()) {
        const prop = store.getProperty(data.propertyId);
        allData.push({ ...data, propertyName: prop?.name || "", propertyCity: prop?.city || "" });
      }
      return { markets: allData };
    }),

  getOrderBook: publicProcedure
    .input(z.object({ propertyId: z.string() }))
    .query(async ({ input }) => {
      console.log("[Market] Fetching order book for:", input.propertyId);
      const data = store.marketData.get(input.propertyId);
      if (!data) return { bids: [], asks: [] };
      return { bids: data.bids, asks: data.asks };
    }),

  getPriceHistory: publicProcedure
    .input(z.object({
      propertyId: z.string(),
      timeRange: z.enum(["1D", "1W", "1M", "3M", "1Y", "ALL"]).default("1M"),
    }))
    .query(async ({ input }) => {
      console.log("[Market] Fetching price history for:", input.propertyId);
      const prop = store.getProperty(input.propertyId);
      if (!prop) return { history: [] };

      const now = new Date();
      let daysBack = 30;
      switch (input.timeRange) {
        case "1D": daysBack = 1; break;
        case "1W": daysBack = 7; break;
        case "1M": daysBack = 30; break;
        case "3M": daysBack = 90; break;
        case "1Y": daysBack = 365; break;
        case "ALL": daysBack = 9999; break;
      }

      const cutoff = new Date(now.getTime() - daysBack * 86400000);
      const filtered = prop.priceHistory.filter(p => new Date(p.date) >= cutoff);
      return { history: filtered };
    }),

  getGlobalIndex: publicProcedure
    .query(async () => {
      console.log("[Market] Fetching global index");
      let totalMarketCap = 0;
      let totalVolume = 0;
      let weightedChange = 0;

      for (const [, data] of store.marketData.entries()) {
        const prop = store.getProperty(data.propertyId);
        if (!prop) continue;
        const marketCap = data.lastPrice * prop.totalShares;
        totalMarketCap += marketCap;
        totalVolume += data.volume24h;
        weightedChange += data.changePercent24h * marketCap;
      }

      const indexChange = totalMarketCap > 0 ? weightedChange / totalMarketCap : 0;

      return {
        indexValue: Math.round(totalMarketCap / 10000),
        change24h: Math.round(indexChange * 100) / 100,
        totalMarketCap,
        totalVolume24h: totalVolume,
        totalProperties: store.marketData.size,
        lastUpdated: new Date().toISOString(),
      };
    }),

  placeOrder: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      type: z.enum(["buy", "sell"]),
      orderType: z.enum(["market", "limit"]),
      shares: z.number().positive().int(),
      price: z.number().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[Market] Placing order for:", userId, input.type, input.shares, "shares of", input.propertyId);

      const prop = store.getProperty(input.propertyId);
      if (!prop) return { success: false, message: "Property not found" };

      const total = input.shares * input.price;
      const fees = Math.round(total * 0.002 * 100) / 100;

      if (input.type === "buy") {
        const balance = store.getWalletBalance(userId);
        if (balance.available < total + fees) {
          return { success: false, message: "Insufficient funds" };
        }

        if (prop.availableShares < input.shares) {
          return { success: false, message: "Not enough shares available" };
        }

        balance.available -= total + fees;
        balance.invested += total;
        prop.availableShares -= input.shares;
        prop.currentRaise += total;

        const holdings = store.getUserHoldings(userId);
        const existing = holdings.find(h => h.propertyId === input.propertyId);
        if (existing) {
          const totalCost = existing.shares * existing.avgCostBasis + input.shares * input.price;
          existing.shares += input.shares;
          existing.avgCostBasis = Math.round((totalCost / existing.shares) * 100) / 100;
          existing.currentValue = existing.shares * input.price;
          existing.unrealizedPnL = existing.currentValue - existing.shares * existing.avgCostBasis;
          existing.unrealizedPnLPercent = Math.round((existing.unrealizedPnL / (existing.shares * existing.avgCostBasis)) * 10000) / 100;
        } else {
          holdings.push({
            id: store.genId("holding"),
            propertyId: input.propertyId,
            shares: input.shares,
            avgCostBasis: input.price,
            currentValue: total,
            totalReturn: 0,
            totalReturnPercent: 0,
            unrealizedPnL: 0,
            unrealizedPnLPercent: 0,
            purchaseDate: new Date().toISOString(),
          });
          store.holdings.set(userId, holdings);
        }
      } else {
        const holdings = store.getUserHoldings(userId);
        const existing = holdings.find(h => h.propertyId === input.propertyId);
        if (!existing || existing.shares < input.shares) {
          return { success: false, message: "Insufficient shares" };
        }

        const balance = store.getWalletBalance(userId);
        const netAmount = total - fees;
        balance.available += netAmount;
        balance.invested -= input.shares * existing.avgCostBasis;
        prop.availableShares += input.shares;

        existing.shares -= input.shares;
        existing.currentValue = existing.shares * input.price;
        if (existing.shares === 0) {
          const idx = holdings.indexOf(existing);
          holdings.splice(idx, 1);
        }
      }

      const orderId = store.genId("order");
      const order = {
        id: orderId,
        propertyId: input.propertyId,
        userId,
        type: input.type,
        orderType: input.orderType,
        status: "filled" as const,
        shares: input.shares,
        filledShares: input.shares,
        price: input.price,
        total,
        fees,
        createdAt: new Date().toISOString(),
        filledAt: new Date().toISOString(),
      };
      store.addOrder(userId, order);

      store.addTransaction(userId, {
        id: store.genId("txn"),
        type: input.type === "buy" ? "buy" : "sell",
        amount: input.type === "buy" ? -(total + fees) : total - fees,
        status: "completed",
        description: `${input.type === "buy" ? "Bought" : "Sold"} ${input.shares} shares of ${prop.name}`,
        propertyId: input.propertyId,
        propertyName: prop.name,
        createdAt: new Date().toISOString(),
      });

      const md = store.marketData.get(input.propertyId);
      if (md) {
        md.volume24h += total;
        md.lastPrice = input.price;
      }

      store.persist();
      store.log("trade", userId, `${input.type} ${input.shares} shares of ${prop.name} @ ${input.price}`);

      return {
        success: true,
        orderId,
        status: "filled",
        shares: input.shares,
        price: input.price,
        total,
        fees,
        message: `Successfully ${input.type === "buy" ? "bought" : "sold"} ${input.shares} shares`,
      };
    }),

  cancelOrder: protectedProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const orders = store.getUserOrders(userId);
      const order = orders.find(o => o.id === input.orderId);
      if (!order) return { success: false, message: "Order not found" };
      if (order.status !== "open" && order.status !== "pending") {
        return { success: false, message: "Order cannot be cancelled" };
      }
      order.status = "cancelled";
      store.persist();
      return { success: true };
    }),

  getUserOrders: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: z.enum(["all", "open", "filled", "cancelled"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      let orders = store.getUserOrders(userId);
      if (input.status && input.status !== "all") {
        orders = orders.filter(o => o.status === input.status);
      }
      const result = store.paginate(orders, input.page, input.limit);
      return { orders: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getTopMovers: publicProcedure
    .query(async () => {
      const allMarket = Array.from(store.marketData.values());
      const gainers = [...allMarket].sort((a, b) => b.changePercent24h - a.changePercent24h).slice(0, 5);
      const losers = [...allMarket].sort((a, b) => a.changePercent24h - b.changePercent24h).slice(0, 5);
      const byVolume = [...allMarket].sort((a, b) => b.volume24h - a.volume24h).slice(0, 5);

      const enrich = (items: typeof allMarket) => items.map(m => {
        const p = store.getProperty(m.propertyId);
        return { ...m, propertyName: p?.name || "", city: p?.city || "" };
      });

      return { gainers: enrich(gainers), losers: enrich(losers), mostTraded: enrich(byVolume) };
    }),
});
