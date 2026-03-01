import * as z from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

const titleDocTypeSchema = z.enum([
  "title_insurance", "alta_settlement", "warranty_deed",
  "closing_protection_letter", "property_tax_info", "affidavits",
  "wire_instructions", "survey",
]);

export const documentsRouter = createTRPCRouter({
  createSubmission: protectedProcedure
    .input(z.object({
      propertyName: z.string(),
      propertyAddress: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      console.log("[Documents] Creating submission for:", input.propertyName);

      const requiredDocs = [
        { type: "title_insurance", name: "Title Insurance", description: "Owner's title insurance policy", required: true },
        { type: "alta_settlement", name: "ALTA Settlement Statement", description: "ALTA/HUD-1 settlement statement", required: true },
        { type: "warranty_deed", name: "Warranty Deed", description: "General or special warranty deed", required: true },
        { type: "closing_protection_letter", name: "Closing Protection Letter", description: "CPL from title company", required: true },
        { type: "property_tax_info", name: "Property Tax Information", description: "Current tax assessment and payment history", required: true },
        { type: "affidavits", name: "Affidavits", description: "Required affidavits and declarations", required: false },
        { type: "wire_instructions", name: "Wire Instructions", description: "Verified wire transfer instructions", required: true },
        { type: "survey", name: "Survey", description: "Property survey or plat map", required: false },
      ];

      const submission = {
        id: store.genId("docsub"),
        propertyId: store.genId("prop"),
        propertyName: input.propertyName,
        propertyAddress: input.propertyAddress,
        ownerId: userId,
        ownerName: user ? `${user.firstName} ${user.lastName}` : "User",
        ownerEmail: user?.email || "",
        documents: requiredDocs.map(d => ({
          id: store.genId("doc"),
          type: d.type,
          name: d.name,
          description: d.description,
          status: "not_uploaded",
          required: d.required,
        })),
        status: "draft",
        tokenizationApproved: false,
        createdAt: new Date().toISOString(),
      };
      store.documentSubmissions.push(submission);
      return { success: true, submissionId: submission.id };
    }),

  uploadDocument: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      documentId: z.string(),
      fileUri: z.string(),
    }))
    .mutation(async ({ input }) => {
      const sub = store.documentSubmissions.find(s => s.id === input.submissionId);
      if (!sub) return { success: false, message: "Submission not found" };

      const doc = sub.documents.find(d => d.id === input.documentId);
      if (!doc) return { success: false, message: "Document not found" };

      doc.fileUri = input.fileUri;
      doc.status = "uploaded";
      doc.uploadedAt = new Date().toISOString();
      sub.status = "draft";

      return { success: true };
    }),

  submitForReview: protectedProcedure
    .input(z.object({ submissionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const sub = store.documentSubmissions.find(s => s.id === input.submissionId);
      if (!sub) return { success: false, message: "Submission not found" };

      const requiredMissing = sub.documents.filter(d => d.required && d.status === "not_uploaded");
      if (requiredMissing.length > 0) {
        return { success: false, message: `Missing required documents: ${requiredMissing.map(d => d.name).join(", ")}` };
      }

      sub.status = "submitted";
      sub.submittedAt = new Date().toISOString();
      store.log("doc_submit", ctx.userId || "user", `Submitted documents for ${sub.propertyName}`);

      return { success: true };
    }),

  getUserSubmissions: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const subs = store.documentSubmissions.filter(s => s.ownerId === userId);
      const result = store.paginate(subs, input.page, input.limit);
      return { submissions: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return store.documentSubmissions.find(s => s.id === input.id) || null;
    }),

  listAll: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: z.string().optional(),
    }))
    .query(async ({ input }) => {
      let subs = [...store.documentSubmissions];
      if (input.status) subs = subs.filter(s => s.status === input.status);
      const result = store.paginate(subs, input.page, input.limit);
      return { submissions: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  reviewDocument: adminProcedure
    .input(z.object({
      submissionId: z.string(),
      documentId: z.string(),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().optional(),
      rejectionReason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const sub = store.documentSubmissions.find(s => s.id === input.submissionId);
      if (!sub) return { success: false, message: "Submission not found" };

      const doc = sub.documents.find(d => d.id === input.documentId);
      if (!doc) return { success: false, message: "Document not found" };

      doc.status = input.decision;
      doc.reviewedAt = new Date().toISOString();
      if (input.notes) doc.reviewNotes = input.notes;

      const allReviewed = sub.documents.filter(d => d.required).every(d => d.status === "approved" || d.status === "rejected");
      if (allReviewed) {
        const allApproved = sub.documents.filter(d => d.required).every(d => d.status === "approved");
        sub.status = allApproved ? "approved" : "needs_revision";
        if (allApproved) {
          sub.completedAt = new Date().toISOString();
          sub.tokenizationApproved = true;
        }
      } else {
        sub.status = "in_review";
      }

      store.log("doc_review", ctx.userId || "admin", `Reviewed document in ${sub.propertyName}: ${input.decision}`);
      return { success: true };
    }),

  assignTitleCompany: adminProcedure
    .input(z.object({
      submissionId: z.string(),
      titleCompanyId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const sub = store.documentSubmissions.find(s => s.id === input.submissionId);
      if (!sub) return { success: false, message: "Submission not found" };

      const tc = store.titleCompanies.find(t => t.id === input.titleCompanyId);
      if (!tc) return { success: false, message: "Title company not found" };

      sub.assignedTitleCompanyId = tc.id;
      sub.assignedTitleCompanyName = tc.name;
      sub.status = "in_review";

      store.log("title_company_assign", ctx.userId || "admin", `Assigned ${tc.name} to ${sub.propertyName}`);
      return { success: true };
    }),

  listTitleCompanies: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const result = store.paginate(store.titleCompanies, input.page, input.limit);
      return { companies: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  addTitleCompany: adminProcedure
    .input(z.object({
      name: z.string(),
      contactName: z.string(),
      email: z.string().email(),
      phone: z.string(),
      address: z.string(),
      city: z.string(),
      state: z.string(),
      licenseNumber: z.string(),
    }))
    .mutation(async ({ input }) => {
      const tc = {
        id: store.genId("tc"),
        ...input,
        status: "active",
        completedReviews: 0,
        averageReviewDays: 0,
        createdAt: new Date().toISOString(),
      };
      store.titleCompanies.push(tc);
      return { success: true, titleCompanyId: tc.id };
    }),

  getStats: adminProcedure
    .query(async () => {
      const subs = store.documentSubmissions;
      return {
        total: subs.length,
        draft: subs.filter(s => s.status === "draft").length,
        submitted: subs.filter(s => s.status === "submitted").length,
        inReview: subs.filter(s => s.status === "in_review").length,
        approved: subs.filter(s => s.status === "approved").length,
        rejected: subs.filter(s => s.status === "rejected").length,
        needsRevision: subs.filter(s => s.status === "needs_revision").length,
        titleCompanies: store.titleCompanies.length,
        tokenizationApproved: subs.filter(s => s.tokenizationApproved).length,
      };
    }),
});
