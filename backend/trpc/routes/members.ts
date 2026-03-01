import * as z from "zod";
import { createTRPCRouter, adminProcedure } from "../create-context";
import { store } from "../../store/index";

const paginationSchema = z.object({
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.enum(["all", "active", "suspended", "inactive"]).optional(),
  kycStatus: z.enum(["all", "pending", "in_review", "approved", "rejected"]).optional(),
  sortBy: z.enum(["createdAt", "lastActivity", "totalInvested", "name"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export const membersRouter = createTRPCRouter({
  list: adminProcedure
    .input(paginationSchema)
    .query(async ({ input }) => {
      console.log("[Members] Fetching members list");
      let users = store.getAllUsers();

      if (input.search) {
        const q = input.search.toLowerCase();
        users = users.filter(u => u.firstName.toLowerCase().includes(q) || u.lastName.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
      }
      if (input.status && input.status !== "all") users = users.filter(u => u.status === input.status);
      if (input.kycStatus && input.kycStatus !== "all") users = users.filter(u => u.kycStatus === input.kycStatus);

      if (input.sortBy) {
        const dir = input.sortOrder === "asc" ? 1 : -1;
        users.sort((a, b) => {
          if (input.sortBy === "name") return a.firstName.localeCompare(b.firstName) * dir;
          if (input.sortBy === "totalInvested") return (a.totalInvested - b.totalInvested) * dir;
          if (input.sortBy === "lastActivity") return (new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime()) * dir;
          return (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) * dir;
        });
      }

      const result = store.paginate(users.map(u => ({
        id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName,
        phone: u.phone, country: u.country, kycStatus: u.kycStatus, status: u.status,
        walletBalance: u.walletBalance, totalInvested: u.totalInvested,
        holdings: (store.holdings.get(u.id) || []).length,
        totalTransactions: (store.transactions.get(u.id) || []).length,
        lastActivity: u.lastActivity, createdAt: u.createdAt,
      })), input.page, input.limit);

      return { members: result.items, total: result.total, page: result.page, limit: result.limit, totalPages: result.totalPages };
    }),

  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const user = store.getUser(input.id);
      if (!user) return null;
      const balance = store.getWalletBalance(input.id);
      const holdings = store.getUserHoldings(input.id);
      return {
        id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName,
        phone: user.phone, country: user.country, avatar: user.avatar,
        kycStatus: user.kycStatus, status: user.status,
        walletBalance: balance.available, pendingBalance: balance.pending, investedBalance: balance.invested,
        totalInvested: user.totalInvested, totalReturns: user.totalReturns,
        holdingsCount: holdings.length,
        transactionsCount: store.getUserTransactions(input.id).length,
        lastActivity: user.lastActivity, createdAt: user.createdAt,
      };
    }),

  create: adminProcedure
    .input(z.object({ email: z.string().email(), firstName: z.string(), lastName: z.string(), phone: z.string().optional(), country: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const existing = store.getUserByEmail(input.email);
      if (existing) return { success: false, memberId: null };

      const memberId = store.genId("user");
      store.users.set(memberId, {
        id: memberId, email: input.email, firstName: input.firstName, lastName: input.lastName,
        phone: input.phone, country: input.country, role: "investor", kycStatus: "pending", eligibilityStatus: "pending",
        walletBalance: 0, totalInvested: 0, totalReturns: 0, createdAt: new Date().toISOString(),
        passwordHash: "admin_created", status: "active", lastActivity: new Date().toISOString(),
      });
      store.walletBalances.set(memberId, { available: 0, pending: 0, invested: 0 });
      store.persist();
      store.log("member_create", ctx.userId || "admin", `Created member: ${input.email}`);
      return { success: true, memberId };
    }),

  update: adminProcedure
    .input(z.object({
      id: z.string(),
      data: z.object({
        firstName: z.string().optional(), lastName: z.string().optional(),
        phone: z.string().optional(), country: z.string().optional(),
        status: z.enum(["active", "suspended", "inactive"]).optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = store.getUser(input.id);
      if (!user) return { success: false };
      if (input.data.firstName) user.firstName = input.data.firstName;
      if (input.data.lastName) user.lastName = input.data.lastName;
      if (input.data.phone) user.phone = input.data.phone;
      if (input.data.country) user.country = input.data.country;
      if (input.data.status) user.status = input.data.status;
      store.persist();
      store.log("member_update", ctx.userId || "admin", `Updated member: ${user.email}`);
      return { success: true };
    }),

  updateKycStatus: adminProcedure
    .input(z.object({ id: z.string(), status: z.enum(["pending", "in_review", "approved", "rejected"]), reason: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const user = store.getUser(input.id);
      if (!user) return { success: false };
      user.kycStatus = input.status;
      if (input.status === "approved") user.eligibilityStatus = "eligible";
      store.addNotification(input.id, {
        id: store.genId("notif"), type: "kyc",
        title: `KYC ${input.status === "approved" ? "Approved" : input.status === "rejected" ? "Rejected" : "Updated"}`,
        message: input.status === "approved" ? "Your KYC has been approved. You can now invest!" :
                 input.status === "rejected" ? `KYC rejected: ${input.reason || "Please resubmit"}` :
                 "Your KYC status has been updated.",
        read: false, createdAt: new Date().toISOString(),
      });
      store.persist();
      store.log("kyc_update", ctx.userId || "admin", `KYC ${input.id} -> ${input.status}`);
      return { success: true };
    }),

  suspend: adminProcedure
    .input(z.object({ id: z.string(), reason: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const user = store.getUser(input.id);
      if (!user) return { success: false };
      user.status = "suspended";
      store.persist();
      store.log("member_suspend", ctx.userId || "admin", `Suspended ${user.email}: ${input.reason}`);
      return { success: true };
    }),

  bulkSuspend: adminProcedure
    .input(z.object({ ids: z.array(z.string()), reason: z.string() }))
    .mutation(async ({ input, ctx }) => {
      let count = 0;
      input.ids.forEach(id => {
        const user = store.getUser(id);
        if (user) { user.status = "suspended"; count++; }
      });
      store.persist();
      store.log("bulk_suspend", ctx.userId || "admin", `Suspended ${count} members`);
      return { success: true, processed: count };
    }),

  bulkActivate: adminProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ input, ctx }) => {
      let count = 0;
      input.ids.forEach(id => {
        const user = store.getUser(id);
        if (user) { user.status = "active"; count++; }
      });
      store.persist();
      store.log("bulk_activate", ctx.userId || "admin", `Activated ${count} members`);
      return { success: true, processed: count };
    }),

  getActivity: adminProcedure
    .input(z.object({ memberId: z.string(), page: z.number().min(1).default(1), limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      const txs = store.getUserTransactions(input.memberId);
      const activities = txs.map(t => ({
        id: t.id, memberId: input.memberId, memberName: "",
        type: t.type === "buy" ? "investment" : t.type === "deposit" ? "login" : t.type,
        description: t.description, createdAt: t.createdAt,
      }));
      const result = store.paginate(activities, input.page, input.limit);
      return { activities: result.items, total: result.total, page: result.page, limit: result.limit };
    }),

  getStats: adminProcedure.query(async () => {
    const users = store.getAllUsers();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 86400000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
      totalMembers: users.length,
      activeMembers: users.filter(u => u.status === "active").length,
      inactiveMembers: users.filter(u => u.status === "inactive").length,
      suspendedMembers: users.filter(u => u.status === "suspended").length,
      pendingKyc: users.filter(u => u.kycStatus === "pending").length,
      newMembersToday: users.filter(u => new Date(u.createdAt) >= todayStart).length,
      newMembersThisWeek: users.filter(u => new Date(u.createdAt) >= weekStart).length,
      newMembersThisMonth: users.filter(u => new Date(u.createdAt) >= monthStart).length,
    };
  }),

  exportList: adminProcedure
    .input(z.object({ format: z.enum(["csv", "xlsx", "json"]), filters: paginationSchema.optional() }))
    .mutation(async ({ input }) => {
      return { success: true, downloadUrl: `https://api.ipxholding.com/exports/members_${Date.now()}.${input.format}` };
    }),
});
