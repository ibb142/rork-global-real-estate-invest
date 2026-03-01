import * as z from "zod";
import { createTRPCRouter, protectedProcedure } from "../create-context";
import { store } from "../../store/index";

const paymentMethodSchema = z.enum(["bank_transfer", "card", "crypto", "wire"]);

export const walletRouter = createTRPCRouter({
  getBalance: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      console.log("[Wallet] Fetching balance for:", userId);
      const balance = store.getWalletBalance(userId);
      return {
        available: balance.available,
        pending: balance.pending,
        invested: balance.invested,
        total: balance.available + balance.pending + balance.invested,
        currency: "USD",
        lastUpdated: new Date().toISOString(),
      };
    }),

  deposit: protectedProcedure
    .input(z.object({
      amount: z.number().positive().min(100),
      paymentMethod: paymentMethodSchema,
      currency: z.string().default("USD"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[Wallet] Deposit:", input.amount, "for:", userId);

      const balance = store.getWalletBalance(userId);
      const txnId = store.genId("txn");

      if (input.paymentMethod === "card") {
        balance.available += input.amount;
        store.addTransaction(userId, {
          id: txnId, type: "deposit", amount: input.amount, status: "completed",
          description: `Card Deposit`, createdAt: new Date().toISOString(),
        });
      } else {
        balance.pending += input.amount;
        store.addTransaction(userId, {
          id: txnId, type: "deposit", amount: input.amount, status: "pending",
          description: `${input.paymentMethod} Deposit (pending)`, createdAt: new Date().toISOString(),
        });
      }

      store.addNotification(userId, {
        id: store.genId("notif"), type: "transaction", title: "Deposit Initiated",
        message: `$${input.amount.toFixed(2)} deposit via ${input.paymentMethod}`,
        read: false, createdAt: new Date().toISOString(),
      });
      store.persist();
      store.log("deposit", userId, `${input.amount} via ${input.paymentMethod}`);

      return {
        success: true, transactionId: txnId,
        status: input.paymentMethod === "card" ? "completed" : "pending",
        paymentInstructions: input.paymentMethod !== "card" ? {
          bankName: "IVX HOLDINGS Bank", accountNumber: "****1234",
          routingNumber: "****5678", reference: `DEP-${userId}-${Date.now()}`,
        } : undefined,
      };
    }),

  withdraw: protectedProcedure
    .input(z.object({
      amount: z.number().positive(),
      bankAccountId: z.string(),
      currency: z.string().default("USD"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const balance = store.getWalletBalance(userId);

      if (balance.available < input.amount) {
        return { success: false, transactionId: null, status: "failed", estimatedArrival: null };
      }

      balance.available -= input.amount;
      const txnId = store.genId("txn");
      store.addTransaction(userId, {
        id: txnId, type: "withdrawal", amount: -input.amount, status: "pending",
        description: "Bank Transfer Withdrawal", createdAt: new Date().toISOString(),
      });
      store.addNotification(userId, {
        id: store.genId("notif"), type: "transaction", title: "Withdrawal Initiated",
        message: `$${input.amount.toFixed(2)} withdrawal to bank account`,
        read: false, createdAt: new Date().toISOString(),
      });
      store.persist();
      store.log("withdrawal", userId, `${input.amount}`);

      return { success: true, transactionId: txnId, status: "pending", estimatedArrival: "3-5 business days" };
    }),

  getTransactionHistory: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      type: z.enum(["all", "deposit", "withdrawal", "investment", "dividend", "sale"]).optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      let txs = store.getUserTransactions(userId);
      if (input.type && input.type !== "all") {
        const typeMap: Record<string, string> = { investment: "buy", sale: "sell" };
        const filterType = typeMap[input.type] || input.type;
        txs = txs.filter(t => t.type === filterType);
      }
      if (input.startDate) txs = txs.filter(t => t.createdAt >= input.startDate!);
      if (input.endDate) txs = txs.filter(t => t.createdAt <= input.endDate!);

      const result = store.paginate(txs, input.page, input.limit);
      return { transactions: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  addBankAccount: protectedProcedure
    .input(z.object({
      bankName: z.string(), accountHolderName: z.string(), accountNumber: z.string(),
      routingNumber: z.string().optional(), swiftCode: z.string().optional(), iban: z.string().optional(),
      accountType: z.enum(["checking", "savings"]), country: z.string(), isDefault: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const bankId = store.genId("bank");
      const accounts = store.bankAccounts.get(userId) || [];

      if (input.isDefault) accounts.forEach(a => a.isDefault = false);

      accounts.push({
        id: bankId, userId, bankName: input.bankName, accountHolderName: input.accountHolderName,
        accountNumber: input.accountNumber, routingNumber: input.routingNumber, swiftCode: input.swiftCode,
        iban: input.iban, accountType: input.accountType, country: input.country,
        isDefault: input.isDefault || accounts.length === 0,
        status: "pending_verification", last4: input.accountNumber.slice(-4),
        createdAt: new Date().toISOString(),
      });
      store.bankAccounts.set(userId, accounts);
      store.persist();
      store.log("bank_account_add", userId, `Added bank: ${input.bankName}`);

      return { success: true, bankAccountId: bankId, status: "pending_verification" };
    }),

  getBankAccounts: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const accounts = (store.bankAccounts.get(userId) || []).map(a => ({
        id: a.id, bankName: a.bankName, accountHolderName: a.accountHolderName,
        last4: a.last4, accountType: a.accountType, country: a.country,
        isDefault: a.isDefault, status: a.status,
      }));
      return { accounts };
    }),

  removeBankAccount: protectedProcedure
    .input(z.object({ bankAccountId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const accounts = store.bankAccounts.get(userId) || [];
      const idx = accounts.findIndex(a => a.id === input.bankAccountId);
      if (idx >= 0) {
        accounts.splice(idx, 1);
        store.persist();
      }
      return { success: true };
    }),

  setDefaultBankAccount: protectedProcedure
    .input(z.object({ bankAccountId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const accounts = store.bankAccounts.get(userId) || [];
      accounts.forEach(a => a.isDefault = a.id === input.bankAccountId);
      store.persist();
      return { success: true };
    }),

  invest: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      shares: z.number().positive().int(),
      pricePerShare: z.number().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const totalAmount = input.shares * input.pricePerShare;
      const balance = store.getWalletBalance(userId);
      const prop = store.getProperty(input.propertyId);

      if (!prop) return { success: false, investmentId: null, transactionId: null, shares: 0, totalAmount: 0, status: "failed" };
      if (balance.available < totalAmount) return { success: false, investmentId: null, transactionId: null, shares: 0, totalAmount: 0, status: "insufficient_funds" };
      if (prop.availableShares < input.shares) return { success: false, investmentId: null, transactionId: null, shares: 0, totalAmount: 0, status: "insufficient_shares" };

      balance.available -= totalAmount;
      balance.invested += totalAmount;
      prop.availableShares -= input.shares;
      prop.currentRaise += totalAmount;

      const holdings = store.getUserHoldings(userId);
      const existing = holdings.find(h => h.propertyId === input.propertyId);
      if (existing) {
        const totalCost = existing.shares * existing.avgCostBasis + totalAmount;
        existing.shares += input.shares;
        existing.avgCostBasis = Math.round((totalCost / existing.shares) * 100) / 100;
        existing.currentValue = existing.shares * input.pricePerShare;
      } else {
        const newHoldings = [...holdings, {
          id: store.genId("holding"), propertyId: input.propertyId, shares: input.shares,
          avgCostBasis: input.pricePerShare, currentValue: totalAmount, totalReturn: 0,
          totalReturnPercent: 0, unrealizedPnL: 0, unrealizedPnLPercent: 0, purchaseDate: new Date().toISOString(),
        }];
        store.holdings.set(userId, newHoldings);
      }

      const txnId = store.genId("txn");
      store.addTransaction(userId, {
        id: txnId, type: "buy", amount: -totalAmount, status: "completed",
        description: `Bought ${input.shares} shares of ${prop.name}`,
        propertyId: input.propertyId, propertyName: prop.name, createdAt: new Date().toISOString(),
      });
      store.persist();
      store.log("invest", userId, `Invested ${totalAmount} in ${prop.name}`);

      return { success: true, investmentId: store.genId("inv"), transactionId: txnId, shares: input.shares, totalAmount, status: "completed" };
    }),

  sellShares: protectedProcedure
    .input(z.object({
      propertyId: z.string(),
      shares: z.number().positive().int(),
      pricePerShare: z.number().positive(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const holdings = store.getUserHoldings(userId);
      const holding = holdings.find(h => h.propertyId === input.propertyId);
      const prop = store.getProperty(input.propertyId);

      if (!holding || holding.shares < input.shares || !prop) {
        return { success: false, saleId: null, transactionId: null, shares: 0, totalAmount: 0, status: "failed" };
      }

      const totalAmount = input.shares * input.pricePerShare;
      const balance = store.getWalletBalance(userId);
      balance.available += totalAmount;
      balance.invested -= input.shares * holding.avgCostBasis;

      holding.shares -= input.shares;
      holding.currentValue = holding.shares * input.pricePerShare;
      if (holding.shares === 0) {
        const idx = holdings.indexOf(holding);
        holdings.splice(idx, 1);
      }
      prop.availableShares += input.shares;

      const txnId = store.genId("txn");
      store.addTransaction(userId, {
        id: txnId, type: "sell", amount: totalAmount, status: "completed",
        description: `Sold ${input.shares} shares of ${prop.name}`,
        propertyId: input.propertyId, propertyName: prop.name, createdAt: new Date().toISOString(),
      });
      store.persist();
      store.log("sell", userId, `Sold ${input.shares} shares of ${prop.name}`);

      return { success: true, saleId: store.genId("sale"), transactionId: txnId, shares: input.shares, totalAmount, status: "pending" };
    }),

  getPortfolio: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const holdings = store.getUserHoldings(userId);
      const enriched = holdings.map(h => {
        const prop = store.getProperty(h.propertyId);
        return { ...h, propertyName: prop?.name || "", propertyCity: prop?.city || "", propertyCountry: prop?.country || "" };
      });

      const totalValue = holdings.reduce((s, h) => s + h.currentValue, 0);
      const totalInvested = holdings.reduce((s, h) => s + h.shares * h.avgCostBasis, 0);
      const totalReturns = totalValue - totalInvested;
      const dividends = store.getUserTransactions(userId).filter(t => t.type === "dividend").reduce((s, t) => s + t.amount, 0);

      return {
        holdings: enriched, totalValue, totalInvested, totalReturns,
        returnsPercentage: totalInvested > 0 ? Math.round((totalReturns / totalInvested) * 10000) / 100 : 0,
        dividendsReceived: dividends,
      };
    }),

  getDividendHistory: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      propertyId: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      let divs = store.getUserTransactions(userId).filter(t => t.type === "dividend");
      if (input.propertyId) divs = divs.filter(d => d.propertyId === input.propertyId);
      const result = store.paginate(divs, input.page, input.limit);
      return { dividends: result.items, total: result.total, totalAmount: divs.reduce((s, d) => s + d.amount, 0), page: result.page, limit: result.limit };
    }),

  getStatements: protectedProcedure
    .input(z.object({ year: z.number(), type: z.enum(["monthly", "annual", "tax"]) }))
    .query(async ({ input }) => {
      const statements = [];
      if (input.type === "monthly") {
        for (let m = 1; m <= 12; m++) {
          statements.push({ id: `stmt_${input.year}_${m}`, year: input.year, month: m, type: input.type, generatedAt: new Date().toISOString() });
        }
      } else {
        statements.push({ id: `stmt_${input.year}_${input.type}`, year: input.year, type: input.type, generatedAt: new Date().toISOString() });
      }
      return { statements };
    }),

  downloadStatement: protectedProcedure
    .input(z.object({ statementId: z.string() }))
    .mutation(async ({ input }) => {
      return { success: true, downloadUrl: `https://api.ipxholding.com/statements/${input.statementId}.pdf` };
    }),
});
