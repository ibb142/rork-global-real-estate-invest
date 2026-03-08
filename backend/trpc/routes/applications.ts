import * as z from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";
import { sendNewApplicationSMS } from "../../lib/sms-notifications";

export const applicationsRouter = createTRPCRouter({
  submitBroker: protectedProcedure
    .input(z.object({
      fullName: z.string().min(1),
      email: z.string().email(),
      phone: z.string(),
      city: z.string(),
      state: z.string(),
      country: z.string(),
      experienceLevel: z.string(),
      specialization: z.string(),
      firmName: z.string().optional(),
      licenseType: z.string().optional(),
      licenseNumber: z.string().optional(),
      motivation: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[Applications] New broker application from:", input.fullName);

      const app = {
        id: store.genId("bapp"),
        type: "broker" as const,
        userId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        city: input.city,
        state: input.state,
        country: input.country,
        experienceLevel: input.experienceLevel,
        specialization: input.specialization,
        firmName: input.firmName || "",
        licenseType: input.licenseType || "",
        licenseNumber: input.licenseNumber || "",
        motivation: input.motivation || "",
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      };

      store.brokerApplications.push(app);
      store.log("broker_apply", userId, `${input.fullName} applied as broker`);
      store.persist().catch(err => console.error('[Applications] Persist error:', err));

      sendNewApplicationSMS("broker", input.fullName, input.email, input.phone).catch(err =>
        console.error('[Applications] SMS notification error:', err)
      );

      return { success: true, applicationId: app.id };
    }),

  submitAgent: protectedProcedure
    .input(z.object({
      fullName: z.string().min(1),
      email: z.string().email(),
      phone: z.string(),
      city: z.string(),
      state: z.string(),
      country: z.string(),
      experienceLevel: z.string(),
      specialization: z.string(),
      brokerage: z.string().optional(),
      licenseNumber: z.string().optional(),
      motivation: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      console.log("[Applications] New agent application from:", input.fullName);

      const app = {
        id: store.genId("aapp"),
        type: "agent" as const,
        userId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone,
        city: input.city,
        state: input.state,
        country: input.country,
        experienceLevel: input.experienceLevel,
        specialization: input.specialization,
        brokerage: input.brokerage || "",
        licenseNumber: input.licenseNumber || "",
        motivation: input.motivation || "",
        status: "pending" as const,
        createdAt: new Date().toISOString(),
      };

      store.agentApplications.push(app);
      store.log("agent_apply", userId, `${input.fullName} applied as agent`);
      store.persist().catch(err => console.error('[Applications] Persist error:', err));

      sendNewApplicationSMS("agent", input.fullName, input.email, input.phone).catch(err =>
        console.error('[Applications] SMS notification error:', err)
      );

      return { success: true, applicationId: app.id };
    }),

  listAll: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      type: z.enum(["all", "broker", "agent", "influencer"]).default("all"),
      status: z.enum(["all", "pending", "approved", "rejected"]).default("all"),
    }))
    .query(async ({ input }) => {
      console.log("[Applications] Fetching all applications, type:", input.type, "status:", input.status);

      const brokerApps = store.brokerApplications.map(a => ({
        id: a.id,
        type: "broker" as const,
        fullName: a.fullName,
        email: a.email,
        phone: a.phone,
        city: a.city,
        state: a.state,
        country: a.country,
        details: `Experience: ${a.experienceLevel} | Specialization: ${a.specialization} | Firm: ${a.firmName}`,
        status: a.status,
        createdAt: a.createdAt,
        reviewedAt: a.reviewedAt,
      }));

      const agentApps = store.agentApplications.map(a => ({
        id: a.id,
        type: "agent" as const,
        fullName: a.fullName,
        email: a.email,
        phone: a.phone,
        city: a.city,
        state: a.state,
        country: a.country,
        details: `Experience: ${a.experienceLevel} | Specialization: ${a.specialization} | Brokerage: ${a.brokerage}`,
        status: a.status,
        createdAt: a.createdAt,
        reviewedAt: a.reviewedAt,
      }));

      const influencerApps = store.influencerApplications.map(a => ({
        id: a.id,
        type: "influencer" as const,
        fullName: a.name,
        email: a.email,
        phone: a.phone || "",
        city: "",
        state: "",
        country: "",
        details: `Platform: ${a.platform} | Handle: ${a.handle} | Followers: ${a.followers.toLocaleString()}`,
        status: a.status,
        createdAt: a.createdAt,
        reviewedAt: a.reviewedAt,
      }));

      const legacyBrokerApps = store.propertySubmissions
        .filter(s => s.propertyAddress.startsWith("Broker Application"))
        .map(s => {
          const parts = s.description.split(" | ");
          const name = parts[0]?.replace("Broker Application: ", "") || "Unknown";
          const email = parts[1] || "";
          const phone = parts[2] || "";
          return {
            id: s.id,
            type: "broker" as const,
            fullName: name,
            email,
            phone,
            city: s.city,
            state: s.state,
            country: s.country,
            details: s.description,
            status: s.status === "pending" ? "pending" : s.status === "approved" ? "approved" : s.status === "rejected" ? "rejected" : "pending",
            createdAt: s.submittedAt,
            reviewedAt: s.verifiedAt,
          };
        });

      const legacyAgentApps = store.propertySubmissions
        .filter(s => s.propertyAddress.startsWith("Agent Application"))
        .map(s => {
          const parts = s.description.split(" | ");
          const name = parts[0]?.replace("Agent Application: ", "") || "Unknown";
          const email = parts[1] || "";
          const phone = parts[2] || "";
          return {
            id: s.id,
            type: "agent" as const,
            fullName: name,
            email,
            phone,
            city: s.city,
            state: s.state,
            country: s.country,
            details: s.description,
            status: s.status === "pending" ? "pending" : s.status === "approved" ? "approved" : s.status === "rejected" ? "rejected" : "pending",
            createdAt: s.submittedAt,
            reviewedAt: s.verifiedAt,
          };
        });

      let allApps = [...brokerApps, ...agentApps, ...influencerApps, ...legacyBrokerApps, ...legacyAgentApps];

      if (input.type !== "all") {
        allApps = allApps.filter(a => a.type === input.type);
      }
      if (input.status !== "all") {
        allApps = allApps.filter(a => a.status === input.status);
      }

      allApps.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const seenIds = new Set<string>();
      allApps = allApps.filter(a => {
        if (seenIds.has(a.id)) return false;
        seenIds.add(a.id);
        return true;
      });

      const result = store.paginate(allApps, input.page, input.limit);
      return {
        applications: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      };
    }),

  reviewApplication: adminProcedure
    .input(z.object({
      id: z.string(),
      type: z.enum(["broker", "agent", "influencer"]),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log("[Applications] Reviewing:", input.id, "decision:", input.decision);

      if (input.type === "broker") {
        const app = store.brokerApplications.find(a => a.id === input.id);
        if (app) {
          app.status = input.decision;
          app.reviewedAt = new Date().toISOString();
          app.reviewedBy = ctx.userId;
          if (input.notes) app.reviewNotes = input.notes;
        } else {
          const sub = store.propertySubmissions.find(s => s.id === input.id);
          if (sub) sub.status = input.decision;
        }
      } else if (input.type === "agent") {
        const app = store.agentApplications.find(a => a.id === input.id);
        if (app) {
          app.status = input.decision;
          app.reviewedAt = new Date().toISOString();
          app.reviewedBy = ctx.userId;
          if (input.notes) app.reviewNotes = input.notes;
        } else {
          const sub = store.propertySubmissions.find(s => s.id === input.id);
          if (sub) sub.status = input.decision;
        }
      } else if (input.type === "influencer") {
        const app = store.influencerApplications.find(a => a.id === input.id);
        if (app) {
          app.status = input.decision;
          app.reviewedBy = ctx.userId || "admin";
          app.reviewedAt = new Date().toISOString();
        }
      }

      store.persist().catch(err => console.error('[Applications] Persist error:', err));
      store.log("application_review", ctx.userId || "admin", `${input.type} ${input.id} -> ${input.decision}`);
      return { success: true };
    }),

  getStats: adminProcedure
    .query(async () => {
      const brokerTotal = store.brokerApplications.length +
        store.propertySubmissions.filter(s => s.propertyAddress.startsWith("Broker Application")).length;
      const agentTotal = store.agentApplications.length +
        store.propertySubmissions.filter(s => s.propertyAddress.startsWith("Agent Application")).length;
      const influencerTotal = store.influencerApplications.length;

      const brokerPending = store.brokerApplications.filter(a => a.status === "pending").length +
        store.propertySubmissions.filter(s => s.propertyAddress.startsWith("Broker Application") && s.status === "pending").length;
      const agentPending = store.agentApplications.filter(a => a.status === "pending").length +
        store.propertySubmissions.filter(s => s.propertyAddress.startsWith("Agent Application") && s.status === "pending").length;
      const influencerPending = store.influencerApplications.filter(a => a.status === "pending").length;

      const totalMembers = store.getAllUsers().length;
      const activeMembers = store.getAllUsers().filter(u => u.status === "active").length;

      return {
        totalApplications: brokerTotal + agentTotal + influencerTotal,
        pendingApplications: brokerPending + agentPending + influencerPending,
        brokerApplications: brokerTotal,
        brokerPending,
        agentApplications: agentTotal,
        agentPending,
        influencerApplications: influencerTotal,
        influencerPending,
        totalMembers,
        activeMembers,
      };
    }),
});
