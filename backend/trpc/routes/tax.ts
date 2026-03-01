import * as z from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

export const taxRouter = createTRPCRouter({
  getTaxInfo: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      console.log("[Tax] Fetching tax info for:", userId);
      return store.taxInfo.get(userId) || null;
    }),

  updateTaxInfo: protectedProcedure
    .input(z.object({
      taxId: z.string().min(1),
      taxIdType: z.enum(["ssn", "ein", "itin"]),
      taxResidency: z.string().min(1),
      filingStatus: z.enum(["single", "married_jointly", "married_separately", "head_of_household"]),
      foreignTaxCredit: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[Tax] Updating tax info for:", userId);

      const existing = store.taxInfo.get(userId);
      const taxInfo = {
        userId,
        taxId: input.taxId,
        taxIdType: input.taxIdType,
        taxResidency: input.taxResidency,
        filingStatus: input.filingStatus,
        foreignTaxCredit: input.foreignTaxCredit,
        w9Submitted: existing?.w9Submitted || false,
        w8Submitted: existing?.w8Submitted || false,
        updatedAt: new Date().toISOString(),
      };
      store.taxInfo.set(userId, taxInfo);
      store.log("tax_info_update", userId, "Updated tax information");

      return { success: true };
    }),

  submitW9: protectedProcedure
    .input(z.object({
      name: z.string(),
      businessName: z.string().optional(),
      taxClassification: z.enum(["individual", "c_corporation", "s_corporation", "partnership", "trust", "llc", "other"]),
      address: z.string(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
      taxId: z.string(),
      signature: z.string(),
      signatureDate: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[Tax] W-9 submission for:", userId);

      let taxInfo = store.taxInfo.get(userId);
      if (!taxInfo) {
        taxInfo = {
          userId,
          taxId: input.taxId,
          taxIdType: "ssn",
          taxResidency: "United States",
          filingStatus: "single",
          foreignTaxCredit: false,
          w9Submitted: false,
          w8Submitted: false,
          updatedAt: new Date().toISOString(),
        };
      }
      taxInfo.w9Submitted = true;
      taxInfo.taxId = input.taxId;
      taxInfo.updatedAt = new Date().toISOString();
      store.taxInfo.set(userId, taxInfo);

      store.addNotification(userId, {
        id: store.genId("notif"),
        type: "system",
        title: "W-9 Form Submitted",
        message: "Your W-9 form has been received and is being processed.",
        read: false,
        createdAt: new Date().toISOString(),
      });

      store.log("w9_submit", userId, "Submitted W-9 form");
      return { success: true, submissionId: store.genId("w9") };
    }),

  submitW8: protectedProcedure
    .input(z.object({
      name: z.string(),
      countryOfResidence: z.string(),
      permanentAddress: z.string(),
      mailingAddress: z.string().optional(),
      taxId: z.string().optional(),
      foreignTaxId: z.string().optional(),
      treatyCountry: z.string().optional(),
      treatyArticle: z.string().optional(),
      treatyRate: z.number().optional(),
      signature: z.string(),
      signatureDate: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[Tax] W-8 submission for:", userId);

      let taxInfo = store.taxInfo.get(userId);
      if (!taxInfo) {
        taxInfo = {
          userId,
          taxId: input.taxId || "",
          taxIdType: "itin",
          taxResidency: input.countryOfResidence,
          filingStatus: "single",
          foreignTaxCredit: true,
          w9Submitted: false,
          w8Submitted: false,
          updatedAt: new Date().toISOString(),
        };
      }
      taxInfo.w8Submitted = true;
      taxInfo.taxResidency = input.countryOfResidence;
      taxInfo.updatedAt = new Date().toISOString();
      store.taxInfo.set(userId, taxInfo);

      store.log("w8_submit", userId, "Submitted W-8 form");
      return { success: true, submissionId: store.genId("w8") };
    }),

  getDocuments: protectedProcedure
    .input(z.object({
      year: z.number().min(2020).max(2030).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[Tax] Fetching tax documents for:", userId);

      let docs = store.taxDocuments.filter(d => d.userId === userId);
      if (input.year) docs = docs.filter(d => d.year === input.year);

      if (docs.length === 0) {
        const currentYear = new Date().getFullYear();
        const years = [currentYear - 1, currentYear - 2];
        const txs = store.getUserTransactions(userId);
        const hasDividends = txs.some(t => t.type === "dividend");
        const hasTrades = txs.some(t => t.type === "buy" || t.type === "sell");

        years.forEach(year => {
          if (hasDividends) {
            store.taxDocuments.push({
              id: store.genId("taxdoc"),
              userId,
              year,
              type: "1099-DIV",
              status: year === currentYear - 1 ? "processing" : "available",
              generatedAt: year === currentYear - 1 ? undefined : new Date().toISOString(),
              downloadUrl: year === currentYear - 1 ? undefined : `https://api.ipxholding.com/tax/${userId}/1099-DIV-${year}.pdf`,
            });
          }
          if (hasTrades) {
            store.taxDocuments.push({
              id: store.genId("taxdoc"),
              userId,
              year,
              type: "1099-B",
              status: year === currentYear - 1 ? "processing" : "available",
              generatedAt: year === currentYear - 1 ? undefined : new Date().toISOString(),
              downloadUrl: year === currentYear - 1 ? undefined : `https://api.ipxholding.com/tax/${userId}/1099-B-${year}.pdf`,
            });
          }
          store.taxDocuments.push({
            id: store.genId("taxdoc"),
            userId,
            year,
            type: "annual_summary",
            status: year === currentYear - 1 ? "processing" : "available",
            generatedAt: year === currentYear - 1 ? undefined : new Date().toISOString(),
            downloadUrl: year === currentYear - 1 ? undefined : `https://api.ipxholding.com/tax/${userId}/summary-${year}.pdf`,
          });
        });

        docs = store.taxDocuments.filter(d => d.userId === userId);
        if (input.year) docs = docs.filter(d => d.year === input.year);
      }

      return { documents: docs };
    }),

  downloadDocument: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const doc = store.taxDocuments.find(d => d.id === input.documentId && d.userId === userId);
      if (!doc) return { success: false, downloadUrl: null };
      if (doc.status !== "available") return { success: false, downloadUrl: null };

      return {
        success: true,
        downloadUrl: doc.downloadUrl || `https://api.ipxholding.com/tax/${userId}/${doc.type}-${doc.year}.pdf`,
      };
    }),

  getTaxSummary: protectedProcedure
    .input(z.object({ year: z.number().min(2020).max(2030) }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const txs = store.getUserTransactions(userId);

      const yearTxs = txs.filter(t => {
        const txYear = new Date(t.createdAt).getFullYear();
        return txYear === input.year;
      });

      const dividends = yearTxs.filter(t => t.type === "dividend").reduce((s, t) => s + t.amount, 0);
      const salesProceeds = yearTxs.filter(t => t.type === "sell").reduce((s, t) => s + t.amount, 0);
      const purchases = yearTxs.filter(t => t.type === "buy").reduce((s, t) => s + Math.abs(t.amount), 0);
      const fees = yearTxs.filter(t => t.type === "fee").reduce((s, t) => s + t.amount, 0);

      const holdings = store.getUserHoldings(userId);
      const unrealizedGains = holdings.reduce((s, h) => s + h.unrealizedPnL, 0);

      return {
        year: input.year,
        totalDividends: Math.round(dividends * 100) / 100,
        totalSalesProceeds: Math.round(salesProceeds * 100) / 100,
        totalPurchases: Math.round(purchases * 100) / 100,
        realizedGains: Math.round((salesProceeds - purchases * 0.3) * 100) / 100,
        unrealizedGains: Math.round(unrealizedGains * 100) / 100,
        totalFees: Math.round(fees * 100) / 100,
        estimatedTaxLiability: Math.round((dividends + Math.max(0, salesProceeds - purchases * 0.3)) * 0.25 * 100) / 100,
        transactionCount: yearTxs.length,
      };
    }),

  getAvailableYears: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const txs = store.getUserTransactions(userId);
      const years = new Set<number>();
      txs.forEach(t => years.add(new Date(t.createdAt).getFullYear()));
      if (years.size === 0) years.add(new Date().getFullYear());
      return { years: Array.from(years).sort((a, b) => b - a) };
    }),

  generateDocument: adminProcedure
    .input(z.object({
      userId: z.string(),
      year: z.number(),
      type: z.enum(["1099-DIV", "1099-B", "1099-INT", "K-1", "annual_summary"]),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log("[Tax] Generating document:", input.type, "for:", input.userId, "year:", input.year);

      const existing = store.taxDocuments.find(d =>
        d.userId === input.userId && d.year === input.year && d.type === input.type
      );

      if (existing) {
        existing.status = "available";
        existing.generatedAt = new Date().toISOString();
        existing.downloadUrl = `https://api.ipxholding.com/tax/${input.userId}/${input.type}-${input.year}.pdf`;
        return { success: true, documentId: existing.id };
      }

      const doc = {
        id: store.genId("taxdoc"),
        userId: input.userId,
        year: input.year,
        type: input.type,
        status: "available" as const,
        generatedAt: new Date().toISOString(),
        downloadUrl: `https://api.ipxholding.com/tax/${input.userId}/${input.type}-${input.year}.pdf`,
      };
      store.taxDocuments.push(doc);
      store.log("tax_doc_generate", ctx.userId || "admin", `Generated ${input.type} for ${input.userId} (${input.year})`);

      return { success: true, documentId: doc.id };
    }),
});
