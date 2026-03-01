import * as z from "zod";
import { createTRPCRouter, adminProcedure } from "../create-context";
import { store } from "../../store/index";

const channelSchema = z.enum(["email", "sms", "push"]);
const statusSchema = z.enum(["draft", "scheduled", "sending", "completed", "failed", "paused"]);
const recipientFilterSchema = z.enum(["all", "active", "inactive", "kyc_pending", "high_value", "custom"]);

const broadcastMessageSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  channels: z.array(channelSchema).min(1),
  recipientFilter: recipientFilterSchema,
  customRecipientIds: z.array(z.string()).optional(),
  batchSize: z.number().min(1).max(10000).default(100),
  scheduledAt: z.string().optional(),
});

function estimateRecipientCount(filter: string): number {
  const users = store.getAllUsers();
  switch (filter) {
    case "all": return users.length;
    case "active": return users.filter(u => u.status === "active").length;
    case "inactive": return users.filter(u => u.status === "inactive").length;
    case "kyc_pending": return users.filter(u => u.kycStatus === "pending").length;
    case "high_value": return users.filter(u => u.totalInvested > 10000).length;
    default: return users.length;
  }
}

export const broadcastRouter = createTRPCRouter({
  create: adminProcedure
    .input(broadcastMessageSchema)
    .mutation(async ({ input, ctx }) => {
      console.log("[Broadcast] Creating broadcast message:", input.subject);
      const recipientCount = input.customRecipientIds?.length || estimateRecipientCount(input.recipientFilter);
      const broadcast = {
        id: store.genId("broadcast"),
        subject: input.subject,
        body: input.body,
        channels: input.channels,
        recipientFilter: input.recipientFilter,
        recipientCount,
        batchSize: input.batchSize,
        status: input.scheduledAt ? "scheduled" : "draft",
        progress: 0,
        sentCount: 0,
        failedCount: 0,
        scheduledAt: input.scheduledAt,
        createdAt: new Date().toISOString(),
      };
      store.broadcasts.push(broadcast);
      store.log("broadcast_create", ctx.userId || "admin", `Created broadcast: ${input.subject}`);
      return {
        success: true,
        broadcastId: broadcast.id,
        estimatedRecipients: recipientCount,
      };
    }),

  send: adminProcedure
    .input(z.object({ broadcastId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      console.log("[Broadcast] Starting broadcast:", input.broadcastId);
      const broadcast = store.broadcasts.find(b => b.id === input.broadcastId);
      if (!broadcast) return { success: false, status: "failed" as const, message: "Broadcast not found" };
      broadcast.status = "sending";
      broadcast.sentCount = broadcast.recipientCount;
      broadcast.progress = 100;
      broadcast.status = "completed";
      store.log("broadcast_send", ctx.userId || "admin", `Sent broadcast: ${broadcast.subject} to ${broadcast.recipientCount} recipients`);
      return { success: true, status: "completed" as const };
    }),

  sendImmediate: adminProcedure
    .input(broadcastMessageSchema)
    .mutation(async ({ input, ctx }) => {
      console.log("[Broadcast] Sending immediate broadcast:", input.subject);
      const recipientCount = input.customRecipientIds?.length || estimateRecipientCount(input.recipientFilter);
      const broadcast = {
        id: store.genId("broadcast"),
        subject: input.subject,
        body: input.body,
        channels: input.channels,
        recipientFilter: input.recipientFilter,
        recipientCount,
        batchSize: input.batchSize,
        status: "completed",
        progress: 100,
        sentCount: recipientCount,
        failedCount: 0,
        createdAt: new Date().toISOString(),
      };
      store.broadcasts.push(broadcast);

      const users = store.getAllUsers();
      users.forEach(u => {
        store.addNotification(u.id, {
          id: store.genId("notif"),
          type: "system",
          title: input.subject,
          message: input.body.substring(0, 200),
          read: false,
          createdAt: new Date().toISOString(),
        });
      });

      store.log("broadcast_immediate", ctx.userId || "admin", `Sent immediate broadcast: ${input.subject} to ${recipientCount} recipients`);
      return {
        success: true,
        broadcastId: broadcast.id,
        status: "completed" as const,
        estimatedDeliveryTime: "Delivered",
      };
    }),

  sendBulk: adminProcedure
    .input(z.object({
      subject: z.string(),
      body: z.string(),
      channels: z.array(channelSchema),
      recipientIds: z.array(z.string()),
      batchSize: z.number().min(1).max(10000).default(100),
      delayBetweenBatches: z.number().min(0).max(60000).default(1000),
    }))
    .mutation(async ({ input, ctx }) => {
      const totalBatches = Math.ceil(input.recipientIds.length / input.batchSize);
      console.log("[Broadcast] Bulk send:", input.recipientIds.length, "recipients in", totalBatches, "batches");

      const broadcast = {
        id: store.genId("bulk"),
        subject: input.subject,
        body: input.body,
        channels: input.channels,
        recipientFilter: "custom",
        recipientCount: input.recipientIds.length,
        batchSize: input.batchSize,
        status: "completed",
        progress: 100,
        sentCount: input.recipientIds.length,
        failedCount: 0,
        createdAt: new Date().toISOString(),
      };
      store.broadcasts.push(broadcast);

      input.recipientIds.forEach(userId => {
        store.addNotification(userId, {
          id: store.genId("notif"),
          type: "system",
          title: input.subject,
          message: input.body.substring(0, 200),
          read: false,
          createdAt: new Date().toISOString(),
        });
      });

      store.log("broadcast_bulk", ctx.userId || "admin", `Bulk sent to ${input.recipientIds.length} recipients`);
      return {
        success: true,
        broadcastId: broadcast.id,
        totalRecipients: input.recipientIds.length,
        totalBatches,
        status: "completed" as const,
      };
    }),

  sendToSegment: adminProcedure
    .input(z.object({
      subject: z.string(),
      body: z.string(),
      channels: z.array(channelSchema),
      segment: z.object({
        minInvestment: z.number().optional(),
        maxInvestment: z.number().optional(),
        inactiveDays: z.number().optional(),
        kycStatus: z.enum(["pending", "in_review", "approved", "rejected"]).optional(),
        country: z.string().optional(),
        registeredAfter: z.string().optional(),
        registeredBefore: z.string().optional(),
      }),
      batchSize: z.number().default(100),
    }))
    .mutation(async ({ input, ctx }) => {
      let users = store.getAllUsers();
      if (input.segment.minInvestment) users = users.filter(u => u.totalInvested >= input.segment.minInvestment!);
      if (input.segment.maxInvestment) users = users.filter(u => u.totalInvested <= input.segment.maxInvestment!);
      if (input.segment.kycStatus) users = users.filter(u => u.kycStatus === input.segment.kycStatus);
      if (input.segment.country) users = users.filter(u => u.country === input.segment.country);
      if (input.segment.registeredAfter) users = users.filter(u => u.createdAt >= input.segment.registeredAfter!);
      if (input.segment.registeredBefore) users = users.filter(u => u.createdAt <= input.segment.registeredBefore!);
      if (input.segment.inactiveDays) {
        const cutoff = new Date(Date.now() - input.segment.inactiveDays * 86400000).toISOString();
        users = users.filter(u => u.lastActivity < cutoff);
      }

      const broadcast = {
        id: store.genId("segment"),
        subject: input.subject,
        body: input.body,
        channels: input.channels,
        recipientFilter: "custom",
        recipientCount: users.length,
        batchSize: input.batchSize,
        status: "completed",
        progress: 100,
        sentCount: users.length,
        failedCount: 0,
        createdAt: new Date().toISOString(),
      };
      store.broadcasts.push(broadcast);

      users.forEach(u => {
        store.addNotification(u.id, {
          id: store.genId("notif"),
          type: "system",
          title: input.subject,
          message: input.body.substring(0, 200),
          read: false,
          createdAt: new Date().toISOString(),
        });
      });

      store.log("broadcast_segment", ctx.userId || "admin", `Segment broadcast to ${users.length} users`);
      return {
        success: true,
        broadcastId: broadcast.id,
        matchedRecipients: users.length,
        status: "completed" as const,
      };
    }),

  pause: adminProcedure
    .input(z.object({ broadcastId: z.string() }))
    .mutation(async ({ input }) => {
      const broadcast = store.broadcasts.find(b => b.id === input.broadcastId);
      if (broadcast && broadcast.status === "sending") broadcast.status = "paused";
      return { success: true, status: "paused" as const };
    }),

  resume: adminProcedure
    .input(z.object({ broadcastId: z.string() }))
    .mutation(async ({ input }) => {
      const broadcast = store.broadcasts.find(b => b.id === input.broadcastId);
      if (broadcast && broadcast.status === "paused") broadcast.status = "sending";
      return { success: true, status: "sending" as const };
    }),

  cancel: adminProcedure
    .input(z.object({ broadcastId: z.string() }))
    .mutation(async ({ input }) => {
      const broadcast = store.broadcasts.find(b => b.id === input.broadcastId);
      if (broadcast) broadcast.status = "failed";
      return { success: true };
    }),

  getById: adminProcedure
    .input(z.object({ broadcastId: z.string() }))
    .query(async ({ input }) => {
      return store.broadcasts.find(b => b.id === input.broadcastId) || null;
    }),

  list: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: statusSchema.optional(),
      channel: channelSchema.optional(),
    }))
    .query(async ({ input }) => {
      let broadcasts = [...store.broadcasts];
      if (input.status) broadcasts = broadcasts.filter(b => b.status === input.status);
      if (input.channel) broadcasts = broadcasts.filter(b => b.channels.includes(input.channel!));
      broadcasts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const result = store.paginate(broadcasts, input.page, input.limit);
      return {
        broadcasts: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    }),

  getProgress: adminProcedure
    .input(z.object({ broadcastId: z.string() }))
    .query(async ({ input }) => {
      const broadcast = store.broadcasts.find(b => b.id === input.broadcastId);
      if (!broadcast) {
        return {
          broadcastId: input.broadcastId,
          status: "failed" as const,
          progress: 0,
          sentCount: 0,
          failedCount: 0,
          totalRecipients: 0,
          currentBatch: 0,
          totalBatches: 0,
        };
      }
      const totalBatches = Math.ceil(broadcast.recipientCount / broadcast.batchSize);
      return {
        broadcastId: broadcast.id,
        status: broadcast.status as "draft" | "scheduled" | "sending" | "completed" | "failed" | "paused",
        progress: broadcast.progress,
        sentCount: broadcast.sentCount,
        failedCount: broadcast.failedCount,
        totalRecipients: broadcast.recipientCount,
        currentBatch: totalBatches,
        totalBatches,
      };
    }),

  getStats: adminProcedure.query(async () => {
    const broadcasts = store.broadcasts;
    const completed = broadcasts.filter(b => b.status === "completed");
    const totalSent = completed.reduce((s, b) => s + b.sentCount, 0);
    const totalFailed = completed.reduce((s, b) => s + b.failedCount, 0);
    const totalDelivered = totalSent - totalFailed;

    const now = Date.now();
    const last24h = broadcasts.filter(b => new Date(b.createdAt).getTime() > now - 86400000);
    const last7d = broadcasts.filter(b => new Date(b.createdAt).getTime() > now - 7 * 86400000);

    return {
      totalSent,
      totalDelivered,
      totalFailed,
      totalOpened: Math.floor(totalDelivered * 0.45),
      deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 10000) / 100 : 0,
      openRate: totalDelivered > 0 ? 45 : 0,
      last24Hours: {
        sent: last24h.reduce((s, b) => s + b.sentCount, 0),
        delivered: last24h.reduce((s, b) => s + b.sentCount - b.failedCount, 0),
        failed: last24h.reduce((s, b) => s + b.failedCount, 0),
      },
      last7Days: {
        sent: last7d.reduce((s, b) => s + b.sentCount, 0),
        delivered: last7d.reduce((s, b) => s + b.sentCount - b.failedCount, 0),
        failed: last7d.reduce((s, b) => s + b.failedCount, 0),
      },
    };
  }),

  getTemplates: adminProcedure.query(async () => {
    return {
      templates: [
        {
          id: "welcome",
          name: "Welcome Message",
          subject: "Welcome to IVX HOLDINGS!",
          body: "Dear {{name}},\n\nWelcome to IVX HOLDINGS. We're excited to have you on board!\n\nStart investing in premium real estate properties today.\n\nBest regards,\nIVX HOLDINGS Team",
          category: "welcome" as const,
        },
        {
          id: "reengagement",
          name: "Re-engagement",
          subject: "We miss you!",
          body: "Dear {{name}},\n\nWe noticed you haven't visited in a while. Check out our latest properties with yields up to 9.2%!\n\nBest regards,\nIVX HOLDINGS Team",
          category: "reengagement" as const,
        },
        {
          id: "new_property",
          name: "New Property Alert",
          subject: "New Investment Opportunity Available!",
          body: "Dear {{name}},\n\nWe've just listed a new property on our platform. Don't miss this opportunity to diversify your portfolio.\n\nBest regards,\nIVX HOLDINGS Team",
          category: "promotion" as const,
        },
        {
          id: "dividend",
          name: "Dividend Payment",
          subject: "Your Dividend Payment Has Been Processed",
          body: "Dear {{name}},\n\nYour quarterly dividend payment has been credited to your wallet.\n\nLog in to view your updated balance.\n\nBest regards,\nIVX HOLDINGS Team",
          category: "update" as const,
        },
      ],
    };
  }),

  saveTemplate: adminProcedure
    .input(z.object({
      id: z.string().optional(),
      name: z.string(),
      subject: z.string(),
      body: z.string(),
      category: z.enum(["welcome", "reengagement", "promotion", "update", "reminder", "custom"]),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log("[Broadcast] Saving template:", input.name);
      store.log("template_save", ctx.userId || "admin", `Saved template: ${input.name}`);
      return {
        success: true,
        templateId: input.id || `template_${Date.now()}`,
      };
    }),

  estimateRecipients: adminProcedure
    .input(z.object({
      filter: recipientFilterSchema,
      customFilters: z.object({
        minInvestment: z.number().optional(),
        maxInvestment: z.number().optional(),
        inactiveDays: z.number().optional(),
        country: z.string().optional(),
      }).optional(),
    }))
    .query(async ({ input }) => {
      let users = store.getAllUsers();

      switch (input.filter) {
        case "active": users = users.filter(u => u.status === "active"); break;
        case "inactive": users = users.filter(u => u.status === "inactive"); break;
        case "kyc_pending": users = users.filter(u => u.kycStatus === "pending"); break;
        case "high_value": users = users.filter(u => u.totalInvested > 10000); break;
      }

      if (input.customFilters) {
        if (input.customFilters.minInvestment) users = users.filter(u => u.totalInvested >= input.customFilters!.minInvestment!);
        if (input.customFilters.maxInvestment) users = users.filter(u => u.totalInvested <= input.customFilters!.maxInvestment!);
        if (input.customFilters.country) users = users.filter(u => u.country === input.customFilters!.country);
        if (input.customFilters.inactiveDays) {
          const cutoff = new Date(Date.now() - input.customFilters.inactiveDays * 86400000).toISOString();
          users = users.filter(u => u.lastActivity < cutoff);
        }
      }

      const withEmail = users.filter(u => u.email).length;
      const withPhone = users.filter(u => u.phone).length;

      return {
        estimatedCount: users.length,
        breakdown: {
          email: withEmail,
          sms: withPhone,
          push: users.length,
        },
      };
    }),
});
