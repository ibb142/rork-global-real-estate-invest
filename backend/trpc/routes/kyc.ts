import * as z from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { TRPCError } from "@trpc/server";
import { store } from "../../store/index";
import {
  verifyDocument,
  performLivenessCheck,
  performFaceMatch,
  performSanctionsScreening,
  verifyAccreditation,
  runFullVerification,
  calculateRiskLevel,
  determineKYCTier,
  KYC_PROVIDER,
} from "../../lib/kyc-engine";
import type {
  KYCSubmission,
  KYCDocument,
  KYCPersonalInfo,
  KYCAddress,
  AccreditationSubmission,
} from "../../db/types";

const documentTypeSchema = z.enum([
  "passport", "national_id", "drivers_license", "utility_bill",
  "bank_statement", "tax_return", "proof_of_address",
]);

const sourceOfFundsSchema = z.enum([
  "employment", "business", "investments", "inheritance", "savings", "other",
]);

const annualIncomeSchema = z.enum([
  "under_50k", "50k_100k", "100k_250k", "250k_500k", "500k_1m", "over_1m",
]);

const netWorthSchema = z.enum([
  "under_100k", "100k_500k", "500k_1m", "1m_5m", "over_5m",
]);

function getOrCreateKYC(userId: string): KYCSubmission {
  let kyc = store.kycSubmissions.get(userId);
  if (!kyc) {
    const now = new Date().toISOString();
    kyc = {
      userId,
      status: "pending",
      level: 0,
      tier: "basic",
      documents: [],
      riskScore: 0,
      riskLevel: "low",
      flags: [],
      reviewHistory: [],
      createdAt: now,
      updatedAt: now,
    };
    store.kycSubmissions.set(userId, kyc);
    console.log(`[KYC] Created new submission for user=${userId}`);
  }
  return kyc;
}

export const kycRouter = createTRPCRouter({
  getStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const kyc = store.kycSubmissions.get(userId);
      const user = store.getUser(userId);

      if (kyc) {
        return {
          status: kyc.status,
          level: kyc.level,
          tier: kyc.tier,
          riskScore: kyc.riskScore,
          riskLevel: kyc.riskLevel,
          flags: kyc.flags,
          requiredDocuments: ["passport", "proof_of_address"],
          submittedDocuments: kyc.documents.map(d => d.type),
          hasPersonalInfo: !!kyc.personalInfo,
          hasAddress: !!kyc.address,
          hasSelfie: !!kyc.selfieUrl,
          hasLivenessCheck: !!kyc.livenessCheck,
          hasSanctionsCheck: !!kyc.sanctionsCheck,
          hasAccreditation: !!kyc.accreditation,
          verificationResult: kyc.verificationResult ? {
            overallStatus: kyc.verificationResult.overallStatus,
            overallScore: kyc.verificationResult.overallScore,
            riskLevel: kyc.verificationResult.riskLevel,
            checksCount: kyc.verificationResult.checks.length,
            passedCount: kyc.verificationResult.checks.filter(c => c.status === "passed").length,
            failedCount: kyc.verificationResult.checks.filter(c => c.status === "failed").length,
          } : null,
          expiresAt: kyc.expiresAt || null,
          rejectionReason: kyc.rejectionReason || null,
          lastUpdated: kyc.updatedAt,
          provider: KYC_PROVIDER,
        };
      }

      return {
        status: (user?.kycStatus || "pending") as KYCSubmission["status"],
        level: user?.kycStatus === "approved" ? 2 : 0,
        tier: "basic" as const,
        riskScore: 0,
        riskLevel: "low" as const,
        flags: [] as string[],
        requiredDocuments: ["passport", "proof_of_address"],
        submittedDocuments: [] as string[],
        hasPersonalInfo: false,
        hasAddress: false,
        hasSelfie: false,
        hasLivenessCheck: false,
        hasSanctionsCheck: false,
        hasAccreditation: false,
        verificationResult: null,
        expiresAt: null,
        rejectionReason: null,
        lastUpdated: new Date().toISOString(),
        provider: KYC_PROVIDER,
      };
    }),

  getFullSubmission: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const kyc = store.kycSubmissions.get(userId);
      if (!kyc) {
        return null;
      }
      return {
        ...kyc,
        documents: kyc.documents.map(d => ({
          ...d,
          verificationResult: d.verificationResult ? {
            isAuthentic: d.verificationResult.isAuthentic,
            confidence: d.verificationResult.confidence,
            provider: d.verificationResult.provider,
          } : null,
        })),
        sanctionsCheck: kyc.sanctionsCheck ? {
          isClean: kyc.sanctionsCheck.isClean,
          riskScore: kyc.sanctionsCheck.riskScore,
          pepMatch: kyc.sanctionsCheck.pepMatch,
          databasesChecked: kyc.sanctionsCheck.databases.length,
          hitCount: kyc.sanctionsCheck.watchlistHits.length,
          provider: kyc.sanctionsCheck.provider,
          checkedAt: kyc.sanctionsCheck.checkedAt,
          expiresAt: kyc.sanctionsCheck.expiresAt,
        } : null,
      };
    }),

  submitPersonalInfo: protectedProcedure
    .input(z.object({
      firstName: z.string().min(1, "First name is required"),
      lastName: z.string().min(1, "Last name is required"),
      dateOfBirth: z.string().min(1, "Date of birth is required"),
      nationality: z.string().min(1),
      nationalityCode: z.string().min(2).max(3),
      taxResidency: z.string().default("US"),
      taxId: z.string().optional().default(""),
      occupation: z.string().default(""),
      sourceOfFunds: sourceOfFundsSchema.default("employment"),
      annualIncome: annualIncomeSchema.default("under_50k"),
      netWorth: netWorthSchema.default("under_100k"),
      investmentExperience: z.enum(["none", "limited", "moderate", "extensive"]).default("none"),
      isPoliticallyExposed: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[KYC] submitPersonalInfo user=${userId}`);

      const kyc = getOrCreateKYC(userId);
      kyc.personalInfo = input as KYCPersonalInfo;
      kyc.updatedAt = new Date().toISOString();

      let riskDelta = 0;
      if (input.isPoliticallyExposed) riskDelta += 20;
      if (input.sourceOfFunds === "other") riskDelta += 10;
      kyc.riskScore = Math.min(100, kyc.riskScore + riskDelta);
      kyc.riskLevel = calculateRiskLevel(kyc.riskScore);

      if (input.isPoliticallyExposed && !kyc.flags.includes("PEP_SELF_DECLARED")) {
        kyc.flags.push("PEP_SELF_DECLARED");
      }

      store.log("kyc_personal_info", userId, `Submitted personal info: ${input.firstName} ${input.lastName}`);
      store.persist();

      return {
        success: true,
        nextStep: "address",
        riskScore: kyc.riskScore,
        riskLevel: kyc.riskLevel,
      };
    }),

  submitAddress: protectedProcedure
    .input(z.object({
      street: z.string().min(1, "Street address is required"),
      city: z.string().min(1, "City is required"),
      state: z.string().min(1, "State is required"),
      postalCode: z.string().min(1, "Postal code is required"),
      country: z.string().min(1, "Country is required"),
      countryCode: z.string().min(2).max(3).default("US"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[KYC] submitAddress user=${userId}`);

      const kyc = getOrCreateKYC(userId);
      kyc.address = input as KYCAddress;
      kyc.updatedAt = new Date().toISOString();

      store.log("kyc_address", userId, `Submitted address: ${input.city}, ${input.country}`);
      store.persist();

      return { success: true, nextStep: "document_upload" };
    }),

  uploadDocument: protectedProcedure
    .input(z.object({
      documentType: documentTypeSchema,
      documentUrl: z.string().min(1, "Document URL is required"),
      documentNumber: z.string().optional(),
      expiryDate: z.string().optional(),
      issuingCountry: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[KYC] uploadDocument user=${userId} type=${input.documentType}`);

      const kyc = getOrCreateKYC(userId);
      const docId = store.genId("doc");

      const existingIdx = kyc.documents.findIndex(d => d.type === input.documentType);
      if (existingIdx >= 0) {
        kyc.documents.splice(existingIdx, 1);
        console.log(`[KYC] Replacing existing ${input.documentType} document`);
      }

      const newDoc: KYCDocument = {
        id: docId,
        type: input.documentType as KYCDocument["type"],
        url: input.documentUrl,
        documentNumber: input.documentNumber,
        expiryDate: input.expiryDate,
        issuingCountry: input.issuingCountry,
        status: "pending_review",
        uploadedAt: new Date().toISOString(),
      };

      if (kyc.personalInfo) {
        console.log(`[KYC] Auto-verifying document ${docId}...`);
        try {
          const verificationResult = await verifyDocument(newDoc, kyc.personalInfo);
          newDoc.verificationResult = verificationResult;
          newDoc.status = verificationResult.isAuthentic ? "verified" : "pending_review";

          if (verificationResult.tamperingDetected) {
            kyc.flags.push(`TAMPERING:${docId}`);
            kyc.riskScore = Math.min(100, kyc.riskScore + 30);
          }

          console.log(`[KYC] Document ${docId} verification: authentic=${verificationResult.isAuthentic} confidence=${verificationResult.confidence.toFixed(3)}`);
        } catch (error) {
          console.error(`[KYC] Document verification failed for ${docId}:`, error);
          newDoc.status = "pending_review";
        }
      }

      kyc.documents.push(newDoc);
      kyc.updatedAt = new Date().toISOString();
      kyc.riskLevel = calculateRiskLevel(kyc.riskScore);

      store.log("kyc_document", userId, `Uploaded ${input.documentType} (${docId})`);
      store.persist();

      return {
        success: true,
        documentId: docId,
        status: newDoc.status,
        verificationResult: newDoc.verificationResult ? {
          isAuthentic: newDoc.verificationResult.isAuthentic,
          confidence: newDoc.verificationResult.confidence,
          provider: newDoc.verificationResult.provider,
        } : null,
      };
    }),

  submitSelfie: protectedProcedure
    .input(z.object({
      selfieUrl: z.string().min(1, "Selfie URL is required"),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[KYC] submitSelfie user=${userId}`);

      const kyc = getOrCreateKYC(userId);
      kyc.selfieUrl = input.selfieUrl;
      kyc.updatedAt = new Date().toISOString();

      store.log("kyc_selfie", userId, "Submitted selfie");
      store.persist();

      return { success: true, nextStep: "liveness_check" };
    }),

  performLiveness: protectedProcedure
    .input(z.object({
      selfieUrl: z.string().min(1),
      sessionId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[KYC] performLiveness user=${userId}`);

      const kyc = getOrCreateKYC(userId);

      if (!kyc.selfieUrl && !input.selfieUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selfie must be submitted before liveness check",
        });
      }

      const selfieUrl = input.selfieUrl || kyc.selfieUrl || "";
      const result = await performLivenessCheck(selfieUrl, input.sessionId);

      kyc.livenessCheck = result;
      kyc.updatedAt = new Date().toISOString();

      if (result.spoofAttemptDetected) {
        kyc.flags.push("SPOOF_ATTEMPT");
        kyc.riskScore = Math.min(100, kyc.riskScore + 40);
        kyc.riskLevel = calculateRiskLevel(kyc.riskScore);
      }

      store.log("kyc_liveness", userId, `Liveness: live=${result.isLive} confidence=${result.confidence.toFixed(3)}`);
      store.persist();

      return {
        success: true,
        isLive: result.isLive,
        confidence: result.confidence,
        challenges: result.challenges,
        spoofAttemptDetected: result.spoofAttemptDetected,
        provider: result.provider,
      };
    }),

  performFaceMatch: protectedProcedure
    .input(z.object({
      selfieUrl: z.string().min(1),
      documentUrl: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[KYC] performFaceMatch user=${userId}`);

      const kyc = getOrCreateKYC(userId);
      const result = await performFaceMatch(input.selfieUrl, input.documentUrl);

      kyc.faceMatch = result;
      kyc.updatedAt = new Date().toISOString();

      if (!result.isMatch) {
        kyc.flags.push("FACE_MISMATCH");
        kyc.riskScore = Math.min(100, kyc.riskScore + 25);
        kyc.riskLevel = calculateRiskLevel(kyc.riskScore);
      }

      store.log("kyc_face_match", userId, `Face match: match=${result.isMatch} similarity=${result.similarity.toFixed(3)}`);
      store.persist();

      return {
        success: true,
        isMatch: result.isMatch,
        similarity: result.similarity,
        confidence: result.confidence,
        provider: result.provider,
      };
    }),

  performSanctionsCheck: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId!;
      console.log(`[KYC] performSanctionsCheck user=${userId}`);

      const kyc = store.kycSubmissions.get(userId);
      if (!kyc?.personalInfo || !kyc?.address) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Personal info and address must be submitted before sanctions screening",
        });
      }

      const result = await performSanctionsScreening(kyc.personalInfo, kyc.address);

      kyc.sanctionsCheck = result;
      kyc.riskScore = Math.min(100, kyc.riskScore + result.riskScore);
      kyc.riskLevel = calculateRiskLevel(kyc.riskScore);
      kyc.updatedAt = new Date().toISOString();

      if (result.pepMatch && !kyc.flags.includes("PEP_MATCH")) {
        kyc.flags.push("PEP_MATCH");
      }
      if (result.adverseMediaFound && !kyc.flags.includes("ADVERSE_MEDIA")) {
        kyc.flags.push("ADVERSE_MEDIA");
      }
      result.watchlistHits.forEach(hit => {
        const flag = `WATCHLIST:${hit.source}`;
        if (!kyc.flags.includes(flag)) kyc.flags.push(flag);
      });

      store.log("kyc_sanctions", userId, `Sanctions: clean=${result.isClean} risk=${result.riskScore} hits=${result.watchlistHits.length}`);
      store.persist();

      return {
        success: true,
        isClean: result.isClean,
        riskScore: result.riskScore,
        databasesChecked: result.databases.length,
        databases: result.databases.map(d => ({
          name: d.name,
          checked: d.checked,
          matchFound: d.matchFound,
          lastUpdated: d.lastUpdated,
        })),
        pepMatch: result.pepMatch,
        adverseMediaFound: result.adverseMediaFound,
        hitCount: result.watchlistHits.length,
        hits: result.watchlistHits.map(h => ({
          source: h.source,
          type: h.type,
          matchScore: h.matchScore,
          details: h.details,
        })),
        provider: result.provider,
        expiresAt: result.expiresAt,
      };
    }),

  runFullVerification: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId!;
      console.log(`[KYC] runFullVerification user=${userId}`);

      const kyc = store.kycSubmissions.get(userId);
      if (!kyc) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "No KYC submission found. Please start the verification process.",
        });
      }

      if (!kyc.personalInfo) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Personal info required" });
      }
      if (!kyc.address) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Address required" });
      }
      if (kyc.documents.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "At least one document required" });
      }
      if (!kyc.selfieUrl) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Selfie required" });
      }

      if (!kyc.livenessCheck) {
        console.log(`[KYC] Auto-running liveness check for ${userId}`);
        kyc.livenessCheck = await performLivenessCheck(kyc.selfieUrl);
      }

      if (!kyc.faceMatch) {
        const govDoc = kyc.documents.find(d =>
          d.type === "passport" || d.type === "drivers_license" || d.type === "national_id"
        );
        if (govDoc) {
          console.log(`[KYC] Auto-running face match for ${userId}`);
          kyc.faceMatch = await performFaceMatch(kyc.selfieUrl, govDoc.url);
        }
      }

      if (!kyc.sanctionsCheck) {
        console.log(`[KYC] Auto-running sanctions check for ${userId}`);
        kyc.sanctionsCheck = await performSanctionsScreening(kyc.personalInfo, kyc.address);
        kyc.riskScore = Math.min(100, kyc.riskScore + kyc.sanctionsCheck.riskScore);
      }

      for (const doc of kyc.documents) {
        if (!doc.verificationResult && kyc.personalInfo) {
          console.log(`[KYC] Auto-verifying document ${doc.id}`);
          doc.verificationResult = await verifyDocument(doc, kyc.personalInfo);
          doc.status = doc.verificationResult.isAuthentic ? "verified" : "pending_review";
        }
      }

      const verificationResult = await runFullVerification(kyc);

      kyc.verificationResult = verificationResult;
      kyc.riskLevel = verificationResult.riskLevel;
      kyc.updatedAt = new Date().toISOString();

      if (verificationResult.overallStatus === "passed") {
        kyc.status = "approved";
        kyc.level = 2;
        kyc.tier = "enhanced";
        kyc.approvedAt = new Date().toISOString();
        const expiry = new Date();
        expiry.setFullYear(expiry.getFullYear() + 1);
        kyc.expiresAt = expiry.toISOString();

        const user = store.getUser(userId);
        if (user) {
          user.kycStatus = "approved";
          user.eligibilityStatus = "eligible";
        }
      } else if (verificationResult.overallStatus === "failed") {
        kyc.status = "rejected";
        kyc.rejectionReason = "Automated verification failed - " +
          verificationResult.checks.filter(c => c.status === "failed").map(c => c.name).join(", ");

        const user = store.getUser(userId);
        if (user) user.kycStatus = "rejected";
      } else {
        kyc.status = "in_review";
        const user = store.getUser(userId);
        if (user) user.kycStatus = "in_review";
      }

      kyc.reviewHistory.push({
        action: `auto_verification:${verificationResult.overallStatus}`,
        by: "system",
        reason: `Score: ${(verificationResult.overallScore * 100).toFixed(1)}%, Risk: ${verificationResult.riskLevel}`,
        timestamp: new Date().toISOString(),
      });

      store.addNotification(userId, {
        id: store.genId("notif"),
        type: "kyc",
        title: kyc.status === "approved" ? "KYC Approved" : kyc.status === "rejected" ? "KYC Rejected" : "KYC Under Review",
        message: kyc.status === "approved"
          ? "Your identity has been verified. Full access granted."
          : kyc.status === "rejected"
            ? "Verification failed. Please review and resubmit."
            : "Your submission requires manual review (1-3 business days).",
        read: false,
        createdAt: new Date().toISOString(),
      });

      store.log("kyc_full_verification", userId,
        `Full verification: status=${verificationResult.overallStatus} score=${verificationResult.overallScore.toFixed(3)} risk=${verificationResult.riskLevel}`
      );
      store.persist();

      return {
        success: true,
        status: kyc.status,
        overallStatus: verificationResult.overallStatus,
        overallScore: verificationResult.overallScore,
        riskLevel: verificationResult.riskLevel,
        checks: verificationResult.checks.map(c => ({
          name: c.name,
          category: c.category,
          status: c.status,
          score: c.score,
          details: c.details,
        })),
        flags: kyc.flags,
        provider: verificationResult.provider,
        message: kyc.status === "approved"
          ? "All verification checks passed successfully"
          : kyc.status === "rejected"
            ? kyc.rejectionReason
            : "Some checks require manual review",
      };
    }),

  submitForReview: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId!;
      console.log(`[KYC] submitForReview user=${userId}`);

      const kyc = store.kycSubmissions.get(userId);
      if (!kyc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No KYC submission found" });
      }

      kyc.status = "in_review";
      kyc.submittedAt = new Date().toISOString();
      kyc.updatedAt = new Date().toISOString();

      kyc.reviewHistory.push({
        action: "submitted_for_review",
        by: userId,
        timestamp: new Date().toISOString(),
      });

      const user = store.getUser(userId);
      if (user) user.kycStatus = "in_review";

      store.log("kyc_submit", userId, "Submitted KYC for manual review");
      store.persist();

      return {
        success: true,
        status: "in_review" as const,
        estimatedReviewTime: "1-3 business days",
      };
    }),

  submitAccreditation: protectedProcedure
    .input(z.object({
      type: z.enum(["income", "net_worth", "professional", "entity"]),
      proofDocumentUrl: z.string().min(1, "Proof document is required"),
      proofDocumentType: z.string().default("uploaded_document"),
      verificationMethod: z.enum(["self_certification", "third_party", "cpa_letter", "broker_dealer"]).default("self_certification"),
      additionalInfo: z.string().optional(),
      annualIncome: z.number().optional(),
      netWorth: z.number().optional(),
      professionalLicense: z.string().optional(),
      entityName: z.string().optional(),
      entityType: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log(`[KYC] submitAccreditation user=${userId} type=${input.type}`);

      const kyc = getOrCreateKYC(userId);

      const submission: AccreditationSubmission = {
        id: store.genId("accred"),
        type: input.type,
        status: "pending_review",
        proofUrl: input.proofDocumentUrl,
        proofDocumentType: input.proofDocumentType,
        verificationMethod: input.verificationMethod,
        additionalInfo: input.additionalInfo,
        annualIncome: input.annualIncome,
        netWorth: input.netWorth,
        professionalLicense: input.professionalLicense,
        entityName: input.entityName,
        entityType: input.entityType,
        submittedAt: new Date().toISOString(),
      };

      if (kyc.personalInfo) {
        const result = await verifyAccreditation(submission, kyc.personalInfo);
        submission.status = result.approved ? "approved" : "pending_review";
        submission.expiresAt = result.expiresAt;
        submission.reviewNotes = result.reason;

        if (result.approved) {
          submission.reviewedAt = new Date().toISOString();
          submission.reviewedBy = "system";
          kyc.level = Math.max(kyc.level, 3);
          kyc.tier = "enhanced";
        }
      }

      kyc.accreditation = submission;
      kyc.updatedAt = new Date().toISOString();

      store.log("kyc_accreditation", userId, `Accreditation: type=${input.type} status=${submission.status}`);
      store.persist();

      return {
        success: true,
        accreditationId: submission.id,
        status: submission.status,
        expiresAt: submission.expiresAt || null,
        reviewNotes: submission.reviewNotes || null,
      };
    }),

  getAccreditationStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const kyc = store.kycSubmissions.get(userId);

      if (kyc?.accreditation) {
        const isExpired = kyc.accreditation.expiresAt
          ? new Date(kyc.accreditation.expiresAt) < new Date()
          : false;

        return {
          isAccredited: kyc.accreditation.status === "approved" && !isExpired,
          status: isExpired ? "expired" as const : kyc.accreditation.status,
          type: kyc.accreditation.type,
          verificationMethod: kyc.accreditation.verificationMethod,
          expiresAt: kyc.accreditation.expiresAt || null,
          submittedAt: kyc.accreditation.submittedAt,
          reviewedAt: kyc.accreditation.reviewedAt || null,
          reviewNotes: kyc.accreditation.reviewNotes || null,
        };
      }

      return {
        isAccredited: false,
        status: "none" as const,
        type: null,
        verificationMethod: null,
        expiresAt: null,
        submittedAt: null,
        reviewedAt: null,
        reviewNotes: null,
      };
    }),

  getDocuments: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const kyc = store.kycSubmissions.get(userId);

      return {
        documents: (kyc?.documents || []).map(d => ({
          id: d.id,
          type: d.type,
          status: d.status,
          uploadedAt: d.uploadedAt,
          isVerified: d.status === "verified",
          verificationConfidence: d.verificationResult?.confidence || null,
          provider: d.verificationResult?.provider || null,
        })),
      };
    }),

  deleteDocument: protectedProcedure
    .input(z.object({ documentId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const kyc = store.kycSubmissions.get(userId);
      if (kyc) {
        const idx = kyc.documents.findIndex(d => d.id === input.documentId);
        if (idx >= 0) {
          const removed = kyc.documents.splice(idx, 1)[0];
          kyc.updatedAt = new Date().toISOString();
          store.log("kyc_document_delete", userId, `Deleted document ${removed.type} (${input.documentId})`);
          store.persist();
        }
      }
      return { success: true };
    }),

  getSanctionsDetails: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.userId!;
      const kyc = store.kycSubmissions.get(userId);

      if (!kyc?.sanctionsCheck) {
        return null;
      }

      return {
        isClean: kyc.sanctionsCheck.isClean,
        riskScore: kyc.sanctionsCheck.riskScore,
        databases: kyc.sanctionsCheck.databases,
        pepMatch: kyc.sanctionsCheck.pepMatch,
        adverseMediaFound: kyc.sanctionsCheck.adverseMediaFound,
        hitCount: kyc.sanctionsCheck.watchlistHits.length,
        hits: kyc.sanctionsCheck.watchlistHits,
        provider: kyc.sanctionsCheck.provider,
        checkedAt: kyc.sanctionsCheck.checkedAt,
        expiresAt: kyc.sanctionsCheck.expiresAt,
      };
    }),

  resetSubmission: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId!;
      console.log(`[KYC] resetSubmission user=${userId}`);

      store.kycSubmissions.delete(userId);
      const user = store.getUser(userId);
      if (user) user.kycStatus = "pending";

      store.log("kyc_reset", userId, "KYC submission reset by user");
      store.persist();

      return { success: true };
    }),

  getPendingReviews: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      type: z.enum(["kyc", "accreditation", "all"]).default("all"),
      riskLevel: z.enum(["low", "medium", "high", "critical", "all"]).default("all"),
    }))
    .query(async ({ input }) => {
      const reviews: Array<{
        userId: string;
        userName: string;
        type: string;
        status: string;
        riskLevel: string;
        riskScore: number;
        flags: string[];
        submittedAt: string;
        tier: string;
      }> = [];

      for (const [userId, kyc] of store.kycSubmissions.entries()) {
        const user = store.getUser(userId);
        const userName = user ? `${user.firstName} ${user.lastName}` : "Unknown";

        const shouldInclude =
          kyc.status === "in_review" || kyc.status === "pending" || kyc.status === "documents_submitted";

        if (shouldInclude && (input.riskLevel === "all" || kyc.riskLevel === input.riskLevel)) {
          if (input.type === "all" || input.type === "kyc") {
            reviews.push({
              userId,
              userName,
              type: "kyc",
              status: kyc.status,
              riskLevel: kyc.riskLevel,
              riskScore: kyc.riskScore,
              flags: kyc.flags,
              submittedAt: kyc.submittedAt || kyc.createdAt,
              tier: kyc.tier,
            });
          }
          if ((input.type === "all" || input.type === "accreditation") && kyc.accreditation?.status === "pending_review") {
            reviews.push({
              userId,
              userName,
              type: "accreditation",
              status: "pending_review",
              riskLevel: kyc.riskLevel,
              riskScore: kyc.riskScore,
              flags: kyc.flags,
              submittedAt: kyc.accreditation.submittedAt,
              tier: kyc.tier,
            });
          }
        }
      }

      reviews.sort((a, b) => b.riskScore - a.riskScore);
      const result = store.paginate(reviews, input.page, input.limit);
      return { reviews: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getAdminSubmissionDetail: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const kyc = store.kycSubmissions.get(input.userId);
      if (!kyc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "KYC submission not found" });
      }

      const user = store.getUser(input.userId);

      return {
        user: user ? {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          country: user.country,
          createdAt: user.createdAt,
        } : null,
        submission: kyc,
      };
    }),

  reviewSubmission: adminProcedure
    .input(z.object({
      userId: z.string(),
      type: z.enum(["kyc", "accreditation"]),
      decision: z.enum(["approve", "reject", "request_more_info", "escalate"]),
      reason: z.string().optional(),
      notes: z.string().optional(),
      newLevel: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log(`[KYC Admin] Review: user=${input.userId} type=${input.type} decision=${input.decision}`);

      const kyc = store.kycSubmissions.get(input.userId);
      const user = store.getUser(input.userId);

      if (!kyc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "KYC submission not found" });
      }

      const reviewEntry = {
        action: `admin_${input.decision}`,
        by: ctx.userId || "admin",
        reason: input.reason || input.notes,
        timestamp: new Date().toISOString(),
      };

      if (input.type === "kyc") {
        switch (input.decision) {
          case "approve":
            kyc.status = "approved";
            kyc.level = input.newLevel ?? 2;
            kyc.tier = determineKYCTier(kyc.level);
            kyc.reviewedAt = new Date().toISOString();
            kyc.approvedAt = new Date().toISOString();
            const expiry = new Date();
            expiry.setFullYear(expiry.getFullYear() + 1);
            kyc.expiresAt = expiry.toISOString();
            if (user) {
              user.kycStatus = "approved";
              user.eligibilityStatus = "eligible";
            }
            break;

          case "reject":
            kyc.status = "rejected";
            kyc.rejectionReason = input.reason || "Rejected by admin";
            kyc.reviewedAt = new Date().toISOString();
            if (user) user.kycStatus = "rejected";
            break;

          case "request_more_info":
            kyc.status = "pending";
            if (user) user.kycStatus = "pending";
            break;

          case "escalate":
            kyc.flags.push("ESCALATED");
            kyc.riskScore = Math.min(100, kyc.riskScore + 15);
            kyc.riskLevel = calculateRiskLevel(kyc.riskScore);
            break;
        }
      }

      if (input.type === "accreditation" && kyc.accreditation) {
        switch (input.decision) {
          case "approve":
            kyc.accreditation.status = "approved";
            kyc.accreditation.reviewedAt = new Date().toISOString();
            kyc.accreditation.reviewedBy = ctx.userId || "admin";
            const accExpiry = new Date();
            accExpiry.setFullYear(accExpiry.getFullYear() + 1);
            kyc.accreditation.expiresAt = accExpiry.toISOString();
            kyc.level = Math.max(kyc.level, 3);
            kyc.tier = "enhanced";
            break;

          case "reject":
            kyc.accreditation.status = "rejected";
            kyc.accreditation.reviewedAt = new Date().toISOString();
            kyc.accreditation.reviewedBy = ctx.userId || "admin";
            kyc.accreditation.reviewNotes = input.reason || "Rejected";
            break;

          default:
            kyc.accreditation.status = "pending_review";
            break;
        }
      }

      kyc.reviewHistory.push(reviewEntry);
      kyc.updatedAt = new Date().toISOString();

      const notifTitle = input.type === "kyc"
        ? `KYC ${input.decision === "approve" ? "Approved" : input.decision === "reject" ? "Rejected" : "Updated"}`
        : `Accreditation ${input.decision === "approve" ? "Approved" : input.decision === "reject" ? "Rejected" : "Updated"}`;

      store.addNotification(input.userId, {
        id: store.genId("notif"),
        type: "kyc",
        title: notifTitle,
        message: input.decision === "approve"
          ? "Your verification has been approved!"
          : input.decision === "reject"
            ? input.reason || "Your submission was rejected."
            : input.reason || "Please check your submission for updates.",
        read: false,
        createdAt: new Date().toISOString(),
      });

      store.log("kyc_review", ctx.userId || "admin", `${input.type} ${input.userId}: ${input.decision}`);
      store.persist();

      return { success: true };
    }),

  getKycStats: adminProcedure
    .query(async () => {
      const users = store.getAllUsers();
      const submissions = Array.from(store.kycSubmissions.values());

      const riskDistribution = {
        low: submissions.filter(s => s.riskLevel === "low").length,
        medium: submissions.filter(s => s.riskLevel === "medium").length,
        high: submissions.filter(s => s.riskLevel === "high").length,
        critical: submissions.filter(s => s.riskLevel === "critical").length,
      };

      const flaggedCount = submissions.filter(s => s.flags.length > 0).length;
      const avgRiskScore = submissions.length > 0
        ? submissions.reduce((sum, s) => sum + s.riskScore, 0) / submissions.length
        : 0;

      return {
        totalPending: users.filter(u => u.kycStatus === "pending").length,
        totalInReview: users.filter(u => u.kycStatus === "in_review").length,
        totalApproved: users.filter(u => u.kycStatus === "approved").length,
        totalRejected: users.filter(u => u.kycStatus === "rejected").length,
        totalSubmissions: submissions.length,
        riskDistribution,
        flaggedSubmissions: flaggedCount,
        averageRiskScore: Math.round(avgRiskScore),
        pendingAccreditations: submissions.filter(k => k.accreditation?.status === "pending_review").length,
        approvedAccreditations: submissions.filter(k => k.accreditation?.status === "approved").length,
        provider: KYC_PROVIDER,
        averageReviewTime: "2 days",
      };
    }),
});
