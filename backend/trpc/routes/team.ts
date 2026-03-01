import * as z from "zod";
import { createTRPCRouter, adminProcedure, ceoProcedure } from "../create-context";
import { store } from "../../store/index";

const roleTypeSchema = z.enum(["ceo", "manager", "analyst", "support", "viewer"]);
const permissionSchema = z.enum([
  "manage_members",
  "manage_transactions",
  "manage_properties",
  "manage_kyc",
  "manage_support",
  "view_analytics",
]);
const teamMemberStatusSchema = z.enum(["active", "invited", "suspended"]);

const SYSTEM_ROLES = [
  {
    id: "role_ceo",
    name: "CEO",
    type: "ceo" as const,
    description: "Full access to all features and team management",
    permissions: [
      "manage_members",
      "manage_transactions",
      "manage_properties",
      "manage_kyc",
      "manage_support",
      "view_analytics",
    ] as const,
    isSystemRole: true,
  },
  {
    id: "role_manager",
    name: "Manager",
    type: "manager" as const,
    description: "Can manage members, transactions, and properties",
    permissions: [
      "manage_members",
      "manage_transactions",
      "manage_properties",
      "manage_kyc",
      "view_analytics",
    ] as const,
    isSystemRole: true,
  },
  {
    id: "role_analyst",
    name: "Analyst",
    type: "analyst" as const,
    description: "View-only access to analytics and reports",
    permissions: ["view_analytics"] as const,
    isSystemRole: true,
  },
  {
    id: "role_support",
    name: "Support Agent",
    type: "support" as const,
    description: "Can manage support tickets and KYC",
    permissions: ["manage_support", "manage_kyc"] as const,
    isSystemRole: true,
  },
  {
    id: "role_viewer",
    name: "Viewer",
    type: "viewer" as const,
    description: "Read-only access",
    permissions: [] as const,
    isSystemRole: true,
  },
];

export const teamRouter = createTRPCRouter({
  listMembers: adminProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(20),
      status: teamMemberStatusSchema.optional(),
      roleType: roleTypeSchema.optional(),
    }))
    .query(async ({ input }) => {
      console.log("[Team] Fetching team members");
      let members = [...store.teamMembers];
      if (input.status) members = members.filter(m => m.status === input.status);
      if (input.roleType) members = members.filter(m => m.roleType === input.roleType);
      members.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      const result = store.paginate(members, input.page, input.limit);
      return {
        members: result.items,
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    }),

  getMemberById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      console.log("[Team] Fetching team member:", input.id);
      const member = store.teamMembers.find(m => m.id === input.id);
      if (!member) return null;
      const role = SYSTEM_ROLES.find(r => r.id === member.roleId);
      return { ...member, roleName: role?.name || member.roleType, permissions: role?.permissions || [] };
    }),

  inviteMember: ceoProcedure
    .input(z.object({
      email: z.string().email(),
      firstName: z.string(),
      lastName: z.string(),
      roleId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log("[Team] Inviting team member:", input.email);
      const existing = store.teamMembers.find(m => m.email === input.email);
      if (existing) return { success: false, memberId: null, inviteToken: null, message: "Email already in team" };

      const role = SYSTEM_ROLES.find(r => r.id === input.roleId);
      const memberId = store.genId("team");
      const inviteToken = `invite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      store.teamMembers.push({
        id: memberId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        roleId: input.roleId,
        roleType: role?.type || "viewer",
        status: "invited",
        invitedBy: ctx.userId || "ceo",
        createdAt: new Date().toISOString(),
      });
      store.log("team_invite", ctx.userId || "ceo", `Invited ${input.email} as ${role?.name || input.roleId}`);

      return { success: true, memberId, inviteToken };
    }),

  updateMember: ceoProcedure
    .input(z.object({
      id: z.string(),
      data: z.object({
        firstName: z.string().optional(),
        lastName: z.string().optional(),
        phone: z.string().optional(),
        roleId: z.string().optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      const member = store.teamMembers.find(m => m.id === input.id);
      if (!member) return { success: false, message: "Member not found" };
      if (input.data.firstName) member.firstName = input.data.firstName;
      if (input.data.lastName) member.lastName = input.data.lastName;
      if (input.data.phone) member.phone = input.data.phone;
      if (input.data.roleId) {
        const role = SYSTEM_ROLES.find(r => r.id === input.data.roleId);
        member.roleId = input.data.roleId;
        if (role) member.roleType = role.type;
      }
      store.log("team_update", ctx.userId || "ceo", `Updated ${member.email}`);
      return { success: true };
    }),

  changeRole: ceoProcedure
    .input(z.object({
      memberId: z.string(),
      newRoleId: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const member = store.teamMembers.find(m => m.id === input.memberId);
      if (!member) return { success: false, message: "Member not found" };
      const role = SYSTEM_ROLES.find(r => r.id === input.newRoleId);
      if (!role) return { success: false, message: "Role not found" };
      member.roleId = input.newRoleId;
      member.roleType = role.type;
      store.log("team_role_change", ctx.userId || "ceo", `Changed ${member.email} to ${role.name}`);
      return { success: true };
    }),

  suspendMember: ceoProcedure
    .input(z.object({
      memberId: z.string(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const member = store.teamMembers.find(m => m.id === input.memberId);
      if (!member) return { success: false, message: "Member not found" };
      member.status = "suspended";
      store.log("team_suspend", ctx.userId || "ceo", `Suspended ${member.email}: ${input.reason}`);
      return { success: true };
    }),

  reactivateMember: ceoProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const member = store.teamMembers.find(m => m.id === input.memberId);
      if (!member) return { success: false, message: "Member not found" };
      member.status = "active";
      store.log("team_reactivate", ctx.userId || "ceo", `Reactivated ${member.email}`);
      return { success: true };
    }),

  removeMember: ceoProcedure
    .input(z.object({
      memberId: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const idx = store.teamMembers.findIndex(m => m.id === input.memberId);
      if (idx < 0) return { success: false, message: "Member not found" };
      const member = store.teamMembers[idx];
      store.teamMembers.splice(idx, 1);
      store.log("team_remove", ctx.userId || "ceo", `Removed ${member.email}: ${input.reason || "no reason"}`);
      return { success: true };
    }),

  resendInvite: ceoProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ input }) => {
      const member = store.teamMembers.find(m => m.id === input.memberId);
      if (!member || member.status !== "invited") return { success: false, newInviteToken: null };
      console.log("[Team] Resending invite to:", member.email);
      return {
        success: true,
        newInviteToken: `invite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };
    }),

  listRoles: adminProcedure.query(async () => {
    console.log("[Team] Fetching roles");
    return { roles: SYSTEM_ROLES };
  }),

  createRole: ceoProcedure
    .input(z.object({
      name: z.string().min(1).max(50),
      type: roleTypeSchema,
      description: z.string(),
      permissions: z.array(permissionSchema),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log("[Team] Creating custom role:", input.name);
      store.log("role_create", ctx.userId || "ceo", `Created role: ${input.name}`);
      return {
        success: true,
        roleId: `role_${Date.now()}`,
      };
    }),

  updateRole: ceoProcedure
    .input(z.object({
      roleId: z.string(),
      data: z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        permissions: z.array(permissionSchema).optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      console.log("[Team] Updating role:", input.roleId);
      store.log("role_update", ctx.userId || "ceo", `Updated role: ${input.roleId}`);
      return { success: true };
    }),

  deleteRole: ceoProcedure
    .input(z.object({ roleId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const inUse = store.teamMembers.some(m => m.roleId === input.roleId);
      if (inUse) return { success: false, message: "Role is in use" };
      store.log("role_delete", ctx.userId || "ceo", `Deleted role: ${input.roleId}`);
      return { success: true };
    }),

  getActivityLog: ceoProcedure
    .input(z.object({
      memberId: z.string().optional(),
      page: z.number().min(1).default(1),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      console.log("[Team] Fetching activity log");
      let logs = [...store.auditLog].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (input.memberId) logs = logs.filter(l => l.userId === input.memberId);
      const result = store.paginate(logs, input.page, input.limit);
      return {
        activities: result.items.map(l => ({
          id: l.id,
          memberId: l.userId,
          memberName: "",
          type: l.action,
          description: l.details,
          createdAt: l.timestamp,
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
      };
    }),

  getStats: adminProcedure.query(async () => {
    console.log("[Team] Fetching team stats");
    const members = store.teamMembers;
    return {
      totalMembers: members.length,
      activeMembers: members.filter(m => m.status === "active").length,
      pendingInvites: members.filter(m => m.status === "invited").length,
      suspendedMembers: members.filter(m => m.status === "suspended").length,
      byRole: {
        ceo: members.filter(m => m.roleType === "ceo").length,
        manager: members.filter(m => m.roleType === "manager").length,
        analyst: members.filter(m => m.roleType === "analyst").length,
        support: members.filter(m => m.roleType === "support").length,
        viewer: members.filter(m => m.roleType === "viewer").length,
      },
    };
  }),
});
