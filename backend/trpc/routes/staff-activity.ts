import * as z from "zod";
import { createTRPCRouter, adminProcedure, ceoProcedure } from "../create-context";
import { store } from "../../store/index";

export const staffActivityRouter = createTRPCRouter({
  logAccess: adminProcedure
    .input(z.object({
      action: z.string(),
      section: z.string(),
      details: z.string().optional(),
      targetUserId: z.string().optional(),
      targetResourceId: z.string().optional(),
      resourceType: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = store.getUser(ctx.userId);
      const staffName = user ? `${user.firstName} ${user.lastName}` : ctx.userId;
      const detail = [
        `Staff: ${staffName} (${ctx.userRole})`,
        `Section: ${input.section}`,
        `Action: ${input.action}`,
        input.targetUserId ? `Target User: ${input.targetUserId}` : null,
        input.targetResourceId ? `Resource: ${input.resourceType || 'unknown'}#${input.targetResourceId}` : null,
        input.details || null,
      ].filter(Boolean).join(' | ');

      store.log(`staff_${input.action}`, ctx.userId, detail);
      console.log(`[StaffActivity] ${ctx.userId} (${ctx.userRole}) — ${input.action} in ${input.section}`);

      return { success: true };
    }),

  getActivityLog: ceoProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(200).default(50),
      staffId: z.string().optional(),
      action: z.string().optional(),
      section: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ input }) => {
      console.log("[StaffActivity] CEO fetching activity log, page:", input.page);

      let logs = [...store.auditLog]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (input.staffId) {
        logs = logs.filter(l => l.userId === input.staffId);
      }
      if (input.action) {
        logs = logs.filter(l => l.action.toLowerCase().includes(input.action!.toLowerCase()));
      }
      if (input.section) {
        logs = logs.filter(l => l.details.toLowerCase().includes(input.section!.toLowerCase()));
      }
      if (input.dateFrom) {
        const from = new Date(input.dateFrom).getTime();
        logs = logs.filter(l => new Date(l.timestamp).getTime() >= from);
      }
      if (input.dateTo) {
        const to = new Date(input.dateTo).getTime() + 86400000;
        logs = logs.filter(l => new Date(l.timestamp).getTime() < to);
      }

      const enriched = logs.map(log => {
        const user = store.getUser(log.userId);
        return {
          ...log,
          staffName: user ? `${user.firstName} ${user.lastName}` : log.userId,
          staffEmail: user?.email || 'unknown',
          staffRole: user?.role || 'unknown',
          staffAvatar: user?.avatar,
        };
      });

      const result = store.paginate(enriched, input.page, input.limit);

      return {
        logs: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      };
    }),

  getStaffSummary: ceoProcedure
    .query(async () => {
      console.log("[StaffActivity] CEO fetching staff summary");

      const now = Date.now();
      const day24h = now - 24 * 60 * 60 * 1000;
      const day7d = now - 7 * 24 * 60 * 60 * 1000;

      const allLogs = store.auditLog;
      const staffUsers = store.getAllUsers().filter(u =>
        u.role === 'ceo' || u.role === 'owner'
      );

      const staffActivity = staffUsers.map(user => {
        const userLogs = allLogs.filter(l => l.userId === user.id);
        const last24h = userLogs.filter(l => new Date(l.timestamp).getTime() >= day24h);
        const last7d = userLogs.filter(l => new Date(l.timestamp).getTime() >= day7d);

        const actionBreakdown: Record<string, number> = {};
        for (const log of last7d) {
          const action = log.action.replace('staff_', '');
          actionBreakdown[action] = (actionBreakdown[action] || 0) + 1;
        }

        return {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          totalActions: userLogs.length,
          actionsLast24h: last24h.length,
          actionsLast7d: last7d.length,
          lastActivity: userLogs[0]?.timestamp || null,
          lastAction: userLogs[0]?.action || null,
          actionBreakdown,
        };
      });

      const totalActionsToday = allLogs.filter(l => new Date(l.timestamp).getTime() >= day24h).length;
      const totalActionsWeek = allLogs.filter(l => new Date(l.timestamp).getTime() >= day7d).length;

      const sectionBreakdown: Record<string, number> = {};
      for (const log of allLogs.filter(l => new Date(l.timestamp).getTime() >= day7d)) {
        const sectionMatch = log.details.match(/Section:\s*([^|]+)/);
        if (sectionMatch) {
          const section = sectionMatch[1].trim();
          sectionBreakdown[section] = (sectionBreakdown[section] || 0) + 1;
        }
      }

      return {
        staff: staffActivity.sort((a, b) => b.actionsLast7d - a.actionsLast7d),
        totalActionsToday,
        totalActionsWeek,
        totalStaff: staffUsers.length,
        sectionBreakdown,
      };
    }),
});
