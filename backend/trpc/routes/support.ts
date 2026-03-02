import * as z from "zod";
import { createTRPCRouter, protectedProcedure, adminProcedure } from "../create-context";
import { store } from "../../store/index";

export const supportRouter = createTRPCRouter({
  createTicket: protectedProcedure
    .input(z.object({
      subject: z.string().min(1),
      category: z.enum(["kyc", "wallet", "trading", "general", "technical"]),
      priority: z.enum(["low", "medium", "high"]).default("medium"),
      message: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      console.log("[Support] Creating ticket for:", userId);

      const ticket = {
        id: store.genId("ticket"),
        userId,
        subject: input.subject,
        category: input.category,
        status: "open",
        priority: input.priority,
        messages: [{
          id: store.genId("msg"),
          senderId: userId,
          senderName: user ? `${user.firstName} ${user.lastName}` : "User",
          message: input.message,
          timestamp: new Date().toISOString(),
          isSupport: false,
          status: "sent",
        }],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.supportTickets.push(ticket);
      store.persist();
      store.log("support_ticket_create", userId, `Created ticket: ${input.subject}`);

      return { success: true, ticketId: ticket.id };
    }),

  getUserTickets: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: z.enum(["all", "open", "in_progress", "resolved", "closed"]).optional(),
    }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      let tickets = store.supportTickets.filter(t => t.userId === userId);
      if (input.status && input.status !== "all") {
        tickets = tickets.filter(t => t.status === input.status);
      }
      tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      const result = store.paginate(tickets, input.page, input.limit);
      return { tickets: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getTicketById: protectedProcedure
    .input(z.object({ ticketId: z.string() }))
    .query(async ({ input, ctx }) => {
      const ticket = store.supportTickets.find(t => t.id === input.ticketId);
      if (!ticket) return null;
      if (ticket.userId !== ctx.userId) {
        const user = store.getUser(ctx.userId!);
        const role = user?.role || ctx.userRole;
        if (role !== 'owner' && role !== 'ceo' && role !== 'staff' && role !== 'manager') {
          return null;
        }
      }
      return ticket;
    }),

  sendMessage: protectedProcedure
    .input(z.object({
      ticketId: z.string(),
      message: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.userId!;
      const user = store.getUser(userId);
      const ticket = store.supportTickets.find(t => t.id === input.ticketId);
      if (!ticket) return { success: false, message: "Ticket not found" };

      ticket.messages.push({
        id: store.genId("msg"),
        senderId: userId,
        senderName: user ? `${user.firstName} ${user.lastName}` : "User",
        message: input.message,
        timestamp: new Date().toISOString(),
        isSupport: false,
        status: "sent",
      });
      ticket.updatedAt = new Date().toISOString();
      store.persist();

      return { success: true };
    }),

  closeTicket: protectedProcedure
    .input(z.object({ ticketId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const ticket = store.supportTickets.find(t => t.id === input.ticketId);
      if (!ticket) return { success: false, message: "Ticket not found" };
      ticket.status = "closed";
      ticket.updatedAt = new Date().toISOString();
      store.persist();
      store.log("ticket_close", ctx.userId || "user", `Closed ticket ${input.ticketId}`);
      return { success: true };
    }),

  listAll: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: z.enum(["all", "open", "in_progress", "resolved", "closed"]).optional(),
      category: z.enum(["all", "kyc", "wallet", "trading", "general", "technical"]).optional(),
      priority: z.enum(["all", "low", "medium", "high"]).optional(),
    }))
    .query(async ({ input }) => {
      let tickets = [...store.supportTickets];
      if (input.status && input.status !== "all") tickets = tickets.filter(t => t.status === input.status);
      if (input.category && input.category !== "all") tickets = tickets.filter(t => t.category === input.category);
      if (input.priority && input.priority !== "all") tickets = tickets.filter(t => t.priority === input.priority);
      tickets.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      const result = store.paginate(tickets, input.page, input.limit);
      return { tickets: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  adminReply: adminProcedure
    .input(z.object({
      ticketId: z.string(),
      message: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      const ticket = store.supportTickets.find(t => t.id === input.ticketId);
      if (!ticket) return { success: false, message: "Ticket not found" };

      ticket.messages.push({
        id: store.genId("msg"),
        senderId: ctx.userId || "admin",
        senderName: "IVXHOLDINGS Support",
        message: input.message,
        timestamp: new Date().toISOString(),
        isSupport: true,
        status: "sent",
      });
      ticket.status = "in_progress";
      ticket.updatedAt = new Date().toISOString();

      store.addNotification(ticket.userId, {
        id: store.genId("notif"),
        type: "system",
        title: "Support Reply",
        message: `New reply on ticket: ${ticket.subject}`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      store.persist();

      return { success: true };
    }),

  updateTicketStatus: adminProcedure
    .input(z.object({
      ticketId: z.string(),
      status: z.enum(["open", "in_progress", "resolved", "closed"]),
    }))
    .mutation(async ({ input, ctx }) => {
      const ticket = store.supportTickets.find(t => t.id === input.ticketId);
      if (!ticket) return { success: false, message: "Ticket not found" };
      ticket.status = input.status;
      ticket.updatedAt = new Date().toISOString();
      store.persist();
      store.log("ticket_status_update", ctx.userId || "admin", `Updated ticket ${input.ticketId} to ${input.status}`);
      return { success: true };
    }),

  getStats: adminProcedure
    .query(async () => {
      const tickets = store.supportTickets;
      return {
        total: tickets.length,
        open: tickets.filter(t => t.status === "open").length,
        inProgress: tickets.filter(t => t.status === "in_progress").length,
        resolved: tickets.filter(t => t.status === "resolved").length,
        closed: tickets.filter(t => t.status === "closed").length,
        highPriority: tickets.filter(t => t.priority === "high").length,
        byCategory: {
          kyc: tickets.filter(t => t.category === "kyc").length,
          wallet: tickets.filter(t => t.category === "wallet").length,
          trading: tickets.filter(t => t.category === "trading").length,
          general: tickets.filter(t => t.category === "general").length,
          technical: tickets.filter(t => t.category === "technical").length,
        },
      };
    }),
});
