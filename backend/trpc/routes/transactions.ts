import * as z from "zod";
import { createTRPCRouter, adminProcedure, protectedProcedure } from "../create-context";
import { store } from "../../store/index";

const transactionTypeSchema = z.enum(["deposit", "withdrawal", "buy", "sell", "dividend", "fee"]);
const transactionStatusSchema = z.enum(["pending", "completed", "failed"]);

export const transactionsRouter = createTRPCRouter({
  list: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      type: transactionTypeSchema.optional(),
      status: transactionStatusSchema.optional(),
      userId: z.string().optional(),
      propertyId: z.string().optional(),
      minAmount: z.number().optional(),
      maxAmount: z.number().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      sortBy: z.enum(["createdAt", "amount"]).optional(),
      sortOrder: z.enum(["asc", "desc"]).optional(),
    }))
    .query(async ({ input }) => {
      console.log("[Transactions] Fetching transactions list");
      let allTx = store.getAllTransactions();

      if (input.type) allTx = allTx.filter(t => t.type === input.type);
      if (input.status) allTx = allTx.filter(t => t.status === input.status);
      if (input.userId) allTx = allTx.filter(t => t.userId === input.userId);
      if (input.propertyId) allTx = allTx.filter(t => t.propertyId === input.propertyId);
      if (input.minAmount) allTx = allTx.filter(t => Math.abs(t.amount) >= input.minAmount!);
      if (input.maxAmount) allTx = allTx.filter(t => Math.abs(t.amount) <= input.maxAmount!);
      if (input.startDate) allTx = allTx.filter(t => t.createdAt >= input.startDate!);
      if (input.endDate) allTx = allTx.filter(t => t.createdAt <= input.endDate!);

      if (input.sortBy === "amount") {
        const dir = input.sortOrder === "asc" ? 1 : -1;
        allTx.sort((a, b) => (Math.abs(a.amount) - Math.abs(b.amount)) * dir);
      }

      const result = store.paginate(allTx, input.page, input.limit);
      const completedTx = allTx.filter(t => t.status === "completed");
      return {
        transactions: result.items, total: result.total, page: result.page, limit: result.limit,
        summary: {
          totalVolume: completedTx.reduce((s, t) => s + Math.abs(t.amount), 0),
          totalDeposits: completedTx.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0),
          totalWithdrawals: completedTx.filter(t => t.type === "withdrawal").reduce((s, t) => s + Math.abs(t.amount), 0),
          totalFees: completedTx.filter(t => t.type === "fee").reduce((s, t) => s + t.amount, 0),
        },
      };
    }),

  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const allTx = store.getAllTransactions();
      return allTx.find(t => t.id === input.id) || null;
    }),

  getUserTransactions: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      type: transactionTypeSchema.optional(),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      let txs = store.getUserTransactions(userId);
      if (input.type) txs = txs.filter(t => t.type === input.type);
      const result = store.paginate(txs, input.page, input.limit);
      return { transactions: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  processDeposit: adminProcedure
    .input(z.object({ userId: z.string(), amount: z.number().positive(), reference: z.string().optional(), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      console.log("[Transactions] Processing deposit for:", input.userId, "Amount:", input.amount);
      const balance = store.getWalletBalance(input.userId);
      balance.available += input.amount;
      if (balance.pending >= input.amount) balance.pending -= input.amount;

      const txnId = store.genId("txn");
      store.addTransaction(input.userId, {
        id: txnId, type: "deposit", amount: input.amount, status: "completed",
        description: `Deposit confirmed${input.reference ? ` (Ref: ${input.reference})` : ""}`,
        createdAt: new Date().toISOString(),
      });
      store.addNotification(input.userId, {
        id: store.genId("notif"), type: "transaction", title: "Deposit Confirmed",
        message: `$${input.amount.toFixed(2)} has been added to your wallet`,
        read: false, createdAt: new Date().toISOString(),
      });
      store.persist();
      store.log("admin_deposit", ctx.userId || "admin", `Processed ${input.amount} deposit for ${input.userId}`);
      return { success: true, transactionId: txnId };
    }),

  processWithdrawal: adminProcedure
    .input(z.object({
      userId: z.string(), amount: z.number().positive(),
      bankDetails: z.object({ bankName: z.string(), accountNumber: z.string(), routingNumber: z.string().optional(), swiftCode: z.string().optional() }).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const balance = store.getWalletBalance(input.userId);
      if (balance.available < input.amount) {
        console.warn(`[Transactions] Withdrawal rejected: user ${input.userId} has ${balance.available} but requested ${input.amount}`);
        return { success: false, transactionId: null, message: `Insufficient funds. Available: ${balance.available.toFixed(2)}` };
      }

      balance.available -= input.amount;
      const txnId = store.genId("txn");
      store.addTransaction(input.userId, {
        id: txnId, type: "withdrawal", amount: -input.amount, status: "completed",
        description: "Withdrawal processed by admin", createdAt: new Date().toISOString(),
      });
      store.addNotification(input.userId, {
        id: store.genId("notif"), type: "transaction", title: "Withdrawal Processed",
        message: `${input.amount.toFixed(2)} withdrawal has been processed`,
        read: false, createdAt: new Date().toISOString(),
      });
      store.persist();
      store.log("admin_withdrawal", ctx.userId || "admin", `Processed ${input.amount} withdrawal for ${input.userId}`);
      return { success: true, transactionId: txnId };
    }),

  approveTransaction: adminProcedure
    .input(z.object({ transactionId: z.string(), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const allTx = store.getAllTransactions();
      const tx = allTx.find(t => t.id === input.transactionId);
      if (tx) {
        tx.status = "completed";
        if (tx.userId && tx.type === "deposit") {
          const balance = store.getWalletBalance(tx.userId);
          balance.available += tx.amount;
          if (balance.pending >= tx.amount) balance.pending -= tx.amount;
        }
      }
      store.persist();
      store.log("tx_approve", ctx.userId || "admin", `Approved ${input.transactionId}`);
      return { success: true };
    }),

  rejectTransaction: adminProcedure
    .input(z.object({ transactionId: z.string(), reason: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const allTx = store.getAllTransactions();
      const tx = allTx.find(t => t.id === input.transactionId);
      if (tx) {
        tx.status = "failed";
        if (tx.userId && tx.type === "withdrawal") {
          const balance = store.getWalletBalance(tx.userId);
          balance.available += Math.abs(tx.amount);
        }
      }
      store.persist();
      store.log("tx_reject", ctx.userId || "admin", `Rejected ${input.transactionId}: ${input.reason}`);
      return { success: true };
    }),

  getStats: adminProcedure
    .input(z.object({ period: z.enum(["today", "7d", "30d", "90d", "1y", "all"]).default("30d") }))
    .query(async ({ input }) => {
      const allTx = store.getAllTransactions();
      const now = new Date();
      let daysBack = 30;
      switch (input.period) {
        case "today": daysBack = 1; break;
        case "7d": daysBack = 7; break;
        case "90d": daysBack = 90; break;
        case "1y": daysBack = 365; break;
        case "all": daysBack = 99999; break;
      }
      const cutoff = new Date(now.getTime() - daysBack * 86400000);
      const filtered = allTx.filter(t => new Date(t.createdAt) >= cutoff);

      return {
        period: input.period,
        totalVolume: filtered.reduce((s, t) => s + Math.abs(t.amount), 0),
        totalTransactions: filtered.length,
        averageTransactionSize: filtered.length > 0 ? Math.round(filtered.reduce((s, t) => s + Math.abs(t.amount), 0) / filtered.length) : 0,
        breakdown: {
          deposits: { count: filtered.filter(t => t.type === "deposit").length, volume: filtered.filter(t => t.type === "deposit").reduce((s, t) => s + t.amount, 0) },
          withdrawals: { count: filtered.filter(t => t.type === "withdrawal").length, volume: filtered.filter(t => t.type === "withdrawal").reduce((s, t) => s + Math.abs(t.amount), 0) },
          buys: { count: filtered.filter(t => t.type === "buy").length, volume: filtered.filter(t => t.type === "buy").reduce((s, t) => s + Math.abs(t.amount), 0) },
          sells: { count: filtered.filter(t => t.type === "sell").length, volume: filtered.filter(t => t.type === "sell").reduce((s, t) => s + t.amount, 0) },
          dividends: { count: filtered.filter(t => t.type === "dividend").length, volume: filtered.filter(t => t.type === "dividend").reduce((s, t) => s + t.amount, 0) },
          fees: { count: filtered.filter(t => t.type === "fee").length, volume: filtered.filter(t => t.type === "fee").reduce((s, t) => s + t.amount, 0) },
        },
        trend: [],
      };
    }),

  getPendingApprovals: adminProcedure
    .input(z.object({ page: z.number().min(1).default(1), limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      const pending = store.getAllTransactions().filter(t => t.status === "pending");
      const result = store.paginate(pending, input.page, input.limit);
      return { transactions: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  exportTransactions: adminProcedure
    .input(z.object({
      format: z.enum(["csv", "xlsx", "pdf"]),
      filters: z.object({ type: transactionTypeSchema.optional(), status: transactionStatusSchema.optional(), startDate: z.string().optional(), endDate: z.string().optional() }).optional(),
    }))
    .mutation(async ({ input }) => {
      return { success: true, downloadUrl: `https://api.ipxholding.com/exports/transactions_${Date.now()}.${input.format}` };
    }),
});
