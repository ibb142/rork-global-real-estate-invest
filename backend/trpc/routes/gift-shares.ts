import * as z from "zod";
import { createTRPCRouter, protectedProcedure } from "../create-context";
import { store } from "../../store/index";

export const giftSharesRouter = createTRPCRouter({
  sendGift: protectedProcedure
    .input(z.object({
      recipientEmail: z.string().email(),
      recipientName: z.string().min(1),
      propertyId: z.string(),
      shares: z.number().positive().int(),
      message: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      const prop = store.getProperty(input.propertyId);
      console.log("[GiftShares] Sending gift from:", userId, "to:", input.recipientEmail);

      if (!prop) return { success: false, message: "Property not found" };

      const holdings = store.getUserHoldings(userId);
      const holding = holdings.find(h => h.propertyId === input.propertyId);
      if (!holding || holding.shares < input.shares) {
        return { success: false, message: "Insufficient shares" };
      }

      const totalValue = input.shares * prop.pricePerShare;
      const claimCode = `GIFT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      holding.shares -= input.shares;
      holding.currentValue = holding.shares * prop.pricePerShare;
      if (holding.shares === 0) {
        const idx = holdings.indexOf(holding);
        holdings.splice(idx, 1);
      }

      const gift = {
        id: store.genId("gift"),
        senderId: userId,
        senderName: user ? `${user.firstName} ${user.lastName}` : "User",
        recipientEmail: input.recipientEmail,
        recipientName: input.recipientName,
        propertyId: input.propertyId,
        propertyName: prop.name,
        shares: input.shares,
        pricePerShare: prop.pricePerShare,
        totalValue,
        message: input.message,
        status: "pending" as const,
        claimCode,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      };
      store.giftShares.push(gift);

      store.addTransaction(userId, {
        id: store.genId("txn"),
        type: "sell",
        amount: 0,
        status: "completed",
        description: `Gifted ${input.shares} shares of ${prop.name} to ${input.recipientName}`,
        propertyId: input.propertyId,
        propertyName: prop.name,
        createdAt: new Date().toISOString(),
      });

      store.log("gift_send", userId, `Gifted ${input.shares} shares of ${prop.name} to ${input.recipientEmail}`);

      return {
        success: true,
        giftId: gift.id,
        claimCode,
        totalValue,
        expiresAt: gift.expiresAt,
      };
    }),

  claimGift: protectedProcedure
    .input(z.object({ claimCode: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[GiftShares] Claiming gift with code:", input.claimCode);

      const gift = store.giftShares.find(g => g.claimCode === input.claimCode && g.status === "pending");
      if (!gift) return { success: false, message: "Gift not found or already claimed" };

      if (new Date(gift.expiresAt) < new Date()) {
        gift.status = "expired";
        return { success: false, message: "Gift has expired" };
      }

      gift.status = "accepted";
      gift.recipientId = userId;
      gift.acceptedAt = new Date().toISOString();

      const holdings = store.getUserHoldings(userId);
      const existing = holdings.find(h => h.propertyId === gift.propertyId);
      if (existing) {
        const totalCost = existing.shares * existing.avgCostBasis + gift.shares * gift.pricePerShare;
        existing.shares += gift.shares;
        existing.avgCostBasis = Math.round((totalCost / existing.shares) * 100) / 100;
        existing.currentValue = existing.shares * gift.pricePerShare;
      } else {
        holdings.push({
          id: store.genId("holding"),
          propertyId: gift.propertyId,
          shares: gift.shares,
          avgCostBasis: gift.pricePerShare,
          currentValue: gift.totalValue,
          totalReturn: 0,
          totalReturnPercent: 0,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
          purchaseDate: new Date().toISOString(),
        });
        store.holdings.set(userId, holdings);
      }

      store.addNotification(userId, {
        id: store.genId("notif"),
        type: "system",
        title: "Gift Received!",
        message: `${gift.senderName} gifted you ${gift.shares} shares of ${gift.propertyName}`,
        read: false,
        createdAt: new Date().toISOString(),
      });

      store.log("gift_claim", userId, `Claimed ${gift.shares} shares of ${gift.propertyName}`);

      return {
        success: true,
        giftId: gift.id,
        propertyName: gift.propertyName,
        shares: gift.shares,
        totalValue: gift.totalValue,
        senderName: gift.senderName,
      };
    }),

  getSentGifts: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const gifts = store.giftShares.filter(g => g.senderId === userId);
      gifts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const result = store.paginate(gifts, input.page, input.limit);
      return {
        gifts: result.items,
        total: result.total,
        totalGifted: gifts.reduce((s, g) => s + g.totalValue, 0),
        page: result.page,
        limit: result.limit,
      };
    }),

  getReceivedGifts: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      const gifts = store.giftShares.filter(g =>
        g.recipientId === userId || (user && g.recipientEmail === user.email)
      );
      gifts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const result = store.paginate(gifts, input.page, input.limit);
      return {
        gifts: result.items,
        total: result.total,
        totalReceived: gifts.filter(g => g.status === "accepted").reduce((s, g) => s + g.totalValue, 0),
        page: result.page,
        limit: result.limit,
      };
    }),

  cancelGift: protectedProcedure
    .input(z.object({ giftId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const gift = store.giftShares.find(g => g.id === input.giftId && g.senderId === userId && g.status === "pending");
      if (!gift) return { success: false, message: "Gift not found or cannot be cancelled" };

      gift.status = "cancelled";

      const holdings = store.getUserHoldings(userId);
      const existing = holdings.find(h => h.propertyId === gift.propertyId);
      if (existing) {
        existing.shares += gift.shares;
        existing.currentValue = existing.shares * gift.pricePerShare;
      } else {
        holdings.push({
          id: store.genId("holding"),
          propertyId: gift.propertyId,
          shares: gift.shares,
          avgCostBasis: gift.pricePerShare,
          currentValue: gift.totalValue,
          totalReturn: 0,
          totalReturnPercent: 0,
          unrealizedPnL: 0,
          unrealizedPnLPercent: 0,
          purchaseDate: new Date().toISOString(),
        });
        store.holdings.set(userId, holdings);
      }

      store.log("gift_cancel", userId, `Cancelled gift of ${gift.shares} shares of ${gift.propertyName}`);
      return { success: true };
    }),

  getGiftableProperties: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const holdings = store.getUserHoldings(userId);
      return {
        properties: holdings.map(h => {
          const prop = store.getProperty(h.propertyId);
          return {
            propertyId: h.propertyId,
            propertyName: prop?.name || "",
            availableShares: h.shares,
            pricePerShare: prop?.pricePerShare || h.avgCostBasis,
            currentValue: h.currentValue,
          };
        }).filter(p => p.availableShares > 0),
      };
    }),
});
