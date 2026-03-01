import * as z from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

export const earnRouter = createTRPCRouter({
  getProducts: protectedProcedure
    .input(z.object({
      category: z.enum(["all", "savings", "fixed", "structured"]).optional(),
    }))
    .query(async ({ input }) => {
      console.log("[Earn] Fetching products");
      let products = [...store.earnProducts].filter(p => p.status === "active");
      if (input.category && input.category !== "all") {
        products = products.filter(p => p.category === input.category);
      }
      return {
        products: products.map(p => ({
          ...p,
          utilizationPercent: Math.round((p.totalDeposited / p.capacity) * 100),
          availableCapacity: p.capacity - p.totalDeposited,
        })),
      };
    }),

  getProductById: protectedProcedure
    .input(z.object({ productId: z.string() }))
    .query(async ({ input }) => {
      const product = store.earnProducts.find(p => p.id === input.productId);
      if (!product) return null;
      return {
        ...product,
        utilizationPercent: Math.round((product.totalDeposited / product.capacity) * 100),
        availableCapacity: product.capacity - product.totalDeposited,
      };
    }),

  deposit: protectedProcedure
    .input(z.object({
      productId: z.string(),
      amount: z.number().positive(),
      autoRenew: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[Earn] Deposit:", input.amount, "into:", input.productId, "by:", userId);

      const product = store.earnProducts.find(p => p.id === input.productId);
      if (!product) return { success: false, message: "Product not found" };
      if (product.status !== "active") return { success: false, message: "Product is not active" };
      if (input.amount < product.minAmount) return { success: false, message: `Minimum deposit is $${product.minAmount}` };
      if (input.amount > product.maxAmount) return { success: false, message: `Maximum deposit is $${product.maxAmount}` };

      const availableCapacity = product.capacity - product.totalDeposited;
      if (input.amount > availableCapacity) return { success: false, message: "Insufficient capacity" };

      const balance = store.getWalletBalance(userId);
      if (balance.available < input.amount) return { success: false, message: "Insufficient funds" };

      balance.available -= input.amount;
      product.totalDeposited += input.amount;

      const maturityDate = new Date(Date.now() + product.lockPeriodDays * 24 * 60 * 60 * 1000).toISOString();
      const position = {
        id: store.genId("earn"),
        userId,
        productId: input.productId,
        productName: product.name,
        amount: input.amount,
        apy: product.apy,
        earnedToDate: 0,
        lockPeriodDays: product.lockPeriodDays,
        startDate: new Date().toISOString(),
        maturityDate,
        status: "active" as const,
        autoRenew: input.autoRenew,
        createdAt: new Date().toISOString(),
      };
      store.earnPositions.push(position);

      store.addTransaction(userId, {
        id: store.genId("txn"),
        type: "buy",
        amount: -input.amount,
        status: "completed",
        description: `Deposited into ${product.name} (${product.apy}% APY)`,
        createdAt: new Date().toISOString(),
      });

      store.addNotification(userId, {
        id: store.genId("notif"),
        type: "investment",
        title: "Earn Deposit Confirmed",
        message: `$${input.amount.toFixed(2)} deposited into ${product.name} at ${product.apy}% APY`,
        read: false,
        createdAt: new Date().toISOString(),
      });

      store.log("earn_deposit", userId, `$${input.amount} into ${product.name}`);

      return {
        success: true,
        positionId: position.id,
        apy: product.apy,
        maturityDate,
        estimatedEarnings: Math.round(input.amount * product.apy / 100 * (product.lockPeriodDays / 365) * 100) / 100,
      };
    }),

  withdraw: protectedProcedure
    .input(z.object({ positionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[Earn] Withdraw position:", input.positionId, "by:", userId);

      const position = store.earnPositions.find(p => p.id === input.positionId && p.userId === userId);
      if (!position) return { success: false, message: "Position not found" };
      if (position.status !== "active" && position.status !== "matured") {
        return { success: false, message: "Position cannot be withdrawn" };
      }

      const now = new Date();
      const maturity = new Date(position.maturityDate);
      const isEarly = now < maturity && position.lockPeriodDays > 0;
      const earlyWithdrawalPenalty = isEarly ? Math.round(position.earnedToDate * 0.5 * 100) / 100 : 0;

      const daysHeld = Math.floor((now.getTime() - new Date(position.startDate).getTime()) / 86400000);
      const earnedInterest = Math.round(position.amount * position.apy / 100 * (daysHeld / 365) * 100) / 100;
      const netEarnings = earnedInterest - earlyWithdrawalPenalty;
      const totalWithdrawal = position.amount + netEarnings;

      const balance = store.getWalletBalance(userId);
      balance.available += totalWithdrawal;

      const product = store.earnProducts.find(p => p.id === position.productId);
      if (product) product.totalDeposited -= position.amount;

      position.status = "withdrawn";
      position.earnedToDate = netEarnings;

      store.addTransaction(userId, {
        id: store.genId("txn"),
        type: "sell",
        amount: totalWithdrawal,
        status: "completed",
        description: `Withdrawn from ${position.productName}${isEarly ? " (early withdrawal)" : ""}`,
        createdAt: new Date().toISOString(),
      });

      store.log("earn_withdraw", userId, `Withdrew $${totalWithdrawal.toFixed(2)} from ${position.productName}`);

      return {
        success: true,
        totalWithdrawal,
        principal: position.amount,
        earnedInterest,
        earlyWithdrawalPenalty,
        netEarnings,
        isEarly,
      };
    }),

  getMyPositions: protectedProcedure
    .input(z.object({
      status: z.enum(["all", "active", "matured", "withdrawn"]).optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      let positions = store.earnPositions.filter(p => p.userId === userId);

      positions.forEach(p => {
        if (p.status === "active") {
          const daysHeld = Math.floor((Date.now() - new Date(p.startDate).getTime()) / 86400000);
          p.earnedToDate = Math.round(p.amount * p.apy / 100 * (daysHeld / 365) * 100) / 100;

          if (new Date(p.maturityDate) <= new Date()) {
            p.status = "matured";
          }
        }
      });

      if (input.status && input.status !== "all") {
        positions = positions.filter(p => p.status === input.status);
      }

      const result = store.paginate(positions, input.page, input.limit);
      const activePositions = store.earnPositions.filter(p => p.userId === userId && (p.status === "active" || p.status === "matured"));

      return {
        positions: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
        summary: {
          totalDeposited: activePositions.reduce((s, p) => s + p.amount, 0),
          totalEarned: activePositions.reduce((s, p) => s + p.earnedToDate, 0),
          activePositions: activePositions.filter(p => p.status === "active").length,
          maturedPositions: activePositions.filter(p => p.status === "matured").length,
          weightedApy: activePositions.length > 0
            ? Math.round(activePositions.reduce((s, p) => s + p.apy * p.amount, 0) / activePositions.reduce((s, p) => s + p.amount, 0) * 100) / 100
            : 0,
        },
      };
    }),

  toggleAutoRenew: protectedProcedure
    .input(z.object({
      positionId: z.string(),
      autoRenew: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const position = store.earnPositions.find(p => p.id === input.positionId && p.userId === userId);
      if (!position) return { success: false, message: "Position not found" };
      position.autoRenew = input.autoRenew;
      return { success: true };
    }),

  getStats: adminProcedure
    .query(async () => {
      const active = store.earnPositions.filter(p => p.status === "active" || p.status === "matured");
      return {
        totalDeposited: active.reduce((s, p) => s + p.amount, 0),
        totalEarned: active.reduce((s, p) => s + p.earnedToDate, 0),
        activePositions: active.length,
        uniqueUsers: new Set(active.map(p => p.userId)).size,
        productBreakdown: store.earnProducts.map(prod => ({
          id: prod.id,
          name: prod.name,
          apy: prod.apy,
          totalDeposited: prod.totalDeposited,
          capacity: prod.capacity,
          utilization: Math.round((prod.totalDeposited / prod.capacity) * 100),
          positions: active.filter(p => p.productId === prod.id).length,
        })),
      };
    }),
});
