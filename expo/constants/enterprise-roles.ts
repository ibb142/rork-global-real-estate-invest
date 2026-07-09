/**
 * IVX Enterprise Access Control — Role hierarchy, permission matrix, and department definitions.
 * Owner is always top-level and cannot be deleted or downgraded.
 */

export type EnterpriseRole =
  | 'owner'
  | 'staff'
  | 'admin'
  | 'investor'
  | 'buyer'
  | 'member'
  | 'realtor'
  | 'influencer'
  | 'partner'
  | 'lender';

export type EnterpriseDepartment =
  | 'executive'
  | 'engineering'
  | 'operations'
  | 'finance'
  | 'investments'
  | 'properties'
  | 'crm'
  | 'marketing'
  | 'compliance'
  | 'support'
  | 'deployments'
  | 'investor_relations'
  | 'buyer_relations'
  | 'general';

export type EnterpriseAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'approve'
  | 'deny'
  | 'invite'
  | 'suspend'
  | 'deploy'
  | 'manage_money'
  | 'manage_users'
  | 'manage_roles'
  | 'manage_secrets'
  | 'manage_landing'
  | 'manage_developer'
  | 'force_logout'
  | 'reset_access';

export type EnterpriseModule =
  | 'dashboard'
  | 'properties'
  | 'investments'
  | 'wallet'
  | 'kyc'
  | 'deals'
  | 'crm'
  | 'members'
  | 'investors'
  | 'buyers'
  | 'staff'
  | 'landing'
  | 'developer'
  | 'deployments'
  | 'settings'
  | 'audit'
  | 'money'
  | 'emails'
  | 'marketing'
  | 'lenders'
  | 'realtors'
  | 'influencers'
  | 'partners'
  | 'documents';

/** Permission entry in the RBAC matrix. */
export interface PermissionEntry {
  module: EnterpriseModule;
  actions: EnterpriseAction[];
}

/** Full role definition with hierarchical level and permissions. */
export interface RoleDefinition {
  role: EnterpriseRole;
  label: string;
  description: string;
  hierarchyLevel: number; // 100 = owner (top), 0 = lowest
  canInvite: boolean;
  canDeploy: boolean;
  canManageMoney: boolean;
  canAccessSecrets: boolean;
  requiresOwnerApproval: boolean;
  permissions: PermissionEntry[];
  assignableDepartments: EnterpriseDepartment[];
}

export const ROLE_HIERARCHY_LEVELS: Record<EnterpriseRole, number> = {
  owner: 100,
  staff: 60,
  admin: 50,
  investor: 20,
  buyer: 20,
  member: 10,
  realtor: 15,
  influencer: 15,
  partner: 15,
  lender: 15,
};

export const ROLE_LABELS: Record<EnterpriseRole, string> = {
  owner: 'Owner',
  staff: 'IVX Staff',
  admin: 'Admin',
  investor: 'Investor',
  buyer: 'Buyer',
  member: 'Member',
  realtor: 'Realtor',
  influencer: 'Influencer',
  partner: 'Partner',
  lender: 'Lender',
};

export const ROLE_DESCRIPTIONS: Record<EnterpriseRole, string> = {
  owner: 'Full control of 100% of the app. Can access every department, approve/deny staff, and override any decision.',
  staff: 'Invited only by Owner. Works inside assigned departments. Cannot delete money/user data or change owner settings.',
  admin: 'Under Owner privileges. Manages users, deals, landing content, and CRM. Cannot override Owner or access secrets without grant.',
  investor: 'Can view investments, documents, wallet, KYC, and deals. No admin access.',
  buyer: 'Can view buyer opportunities, properties, and CRM profile. No admin access.',
  member: 'Basic app access. Can register, view public/member content, and upgrade to investor/buyer.',
  realtor: 'Limited app access. Only sees modules assigned to the realtor role.',
  influencer: 'Limited app access. Only sees modules assigned to the influencer role.',
  partner: 'Limited app access. Only sees modules assigned to the partner role.',
  lender: 'Limited app access. Only sees modules assigned to the lender role.',
};

export const DEPARTMENT_LABELS: Record<EnterpriseDepartment, string> = {
  executive: 'Executive',
  engineering: 'Engineering',
  operations: 'Operations',
  finance: 'Finance',
  investments: 'Investments',
  properties: 'Properties',
  crm: 'CRM',
  marketing: 'Marketing',
  compliance: 'Compliance',
  support: 'Support',
  deployments: 'Deployments',
  investor_relations: 'Investor Relations',
  buyer_relations: 'Buyer Relations',
  general: 'General',
};

export const ALL_ENTERPRISE_ROLES: EnterpriseRole[] = [
  'owner',
  'staff',
  'admin',
  'investor',
  'buyer',
  'member',
  'realtor',
  'influencer',
  'partner',
  'lender',
];

export const ALL_ENTERPRISE_DEPARTMENTS: EnterpriseDepartment[] = [
  'executive',
  'engineering',
  'operations',
  'finance',
  'investments',
  'properties',
  'crm',
  'marketing',
  'compliance',
  'support',
  'deployments',
  'investor_relations',
  'buyer_relations',
  'general',
];

/** Actions that are considered dangerous and require owner approval. */
export const DANGEROUS_ACTIONS: EnterpriseAction[] = [
  'delete',
  'deploy',
  'manage_money',
  'manage_secrets',
  'suspend',
  'force_logout',
  'reset_access',
  'manage_roles',
];

/** Full RBAC permission matrix. */
export const ROLE_PERMISSIONS: Record<EnterpriseRole, PermissionEntry[]> = {
  owner: [
    { module: 'dashboard', actions: ['view', 'create', 'edit', 'delete', 'approve', 'deny'] },
    { module: 'properties', actions: ['view', 'create', 'edit', 'delete', 'approve', 'deny'] },
    { module: 'investments', actions: ['view', 'create', 'edit', 'delete', 'approve', 'deny'] },
    { module: 'wallet', actions: ['view', 'create', 'edit', 'delete', 'manage_money'] },
    { module: 'kyc', actions: ['view', 'create', 'edit', 'approve', 'deny'] },
    { module: 'deals', actions: ['view', 'create', 'edit', 'delete', 'approve', 'deny'] },
    { module: 'crm', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'members', actions: ['view', 'create', 'edit', 'delete', 'invite', 'suspend', 'manage_users', 'force_logout', 'reset_access'] },
    { module: 'investors', actions: ['view', 'create', 'edit', 'delete', 'invite', 'suspend'] },
    { module: 'buyers', actions: ['view', 'create', 'edit', 'delete', 'invite', 'suspend'] },
    { module: 'staff', actions: ['view', 'create', 'edit', 'delete', 'invite', 'suspend', 'manage_users', 'manage_roles', 'force_logout', 'reset_access'] },
    { module: 'landing', actions: ['view', 'create', 'edit', 'delete', 'manage_landing'] },
    { module: 'developer', actions: ['view', 'create', 'edit', 'manage_developer'] },
    { module: 'deployments', actions: ['view', 'create', 'deploy', 'approve', 'deny'] },
    { module: 'settings', actions: ['view', 'create', 'edit', 'delete', 'manage_secrets'] },
    { module: 'audit', actions: ['view'] },
    { module: 'money', actions: ['view', 'create', 'edit', 'manage_money', 'approve', 'deny'] },
    { module: 'emails', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'marketing', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'lenders', actions: ['view', 'create', 'edit', 'invite'] },
    { module: 'realtors', actions: ['view', 'create', 'edit', 'invite'] },
    { module: 'influencers', actions: ['view', 'create', 'edit', 'invite'] },
    { module: 'partners', actions: ['view', 'create', 'edit', 'invite'] },
    { module: 'documents', actions: ['view', 'create', 'edit', 'delete'] },
  ],
  staff: [
    { module: 'dashboard', actions: ['view'] },
    { module: 'properties', actions: ['view', 'create', 'edit'] },
    { module: 'investments', actions: ['view', 'create', 'edit'] },
    { module: 'crm', actions: ['view', 'create', 'edit'] },
    { module: 'members', actions: ['view'] },
    { module: 'support', actions: ['view'] },
  ].map((p) => ({ module: p.module as EnterpriseModule, actions: p.actions as EnterpriseAction[] })),
  admin: [
    { module: 'dashboard', actions: ['view', 'create', 'edit'] },
    { module: 'properties', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'investments', actions: ['view', 'create', 'edit'] },
    { module: 'deals', actions: ['view', 'create', 'edit', 'delete', 'approve', 'deny'] },
    { module: 'crm', actions: ['view', 'create', 'edit', 'delete'] },
    { module: 'members', actions: ['view', 'create', 'edit', 'invite'] },
    { module: 'investors', actions: ['view', 'create', 'edit', 'invite'] },
    { module: 'buyers', actions: ['view', 'create', 'edit', 'invite'] },
    { module: 'landing', actions: ['view', 'create', 'edit', 'manage_landing'] },
    { module: 'audit', actions: ['view'] },
    { module: 'documents', actions: ['view', 'create', 'edit', 'delete'] },
  ],
  investor: [
    { module: 'dashboard', actions: ['view'] },
    { module: 'investments', actions: ['view'] },
    { module: 'wallet', actions: ['view'] },
    { module: 'kyc', actions: ['view', 'create'] },
    { module: 'deals', actions: ['view'] },
    { module: 'documents', actions: ['view'] },
  ],
  buyer: [
    { module: 'dashboard', actions: ['view'] },
    { module: 'properties', actions: ['view'] },
    { module: 'crm', actions: ['view'] },
    { module: 'documents', actions: ['view'] },
  ],
  member: [
    { module: 'dashboard', actions: ['view'] },
  ],
  realtor: [
    { module: 'properties', actions: ['view'] },
    { module: 'crm', actions: ['view'] },
  ],
  influencer: [
    { module: 'dashboard', actions: ['view'] },
    { module: 'marketing', actions: ['view'] },
  ],
  partner: [
    { module: 'dashboard', actions: ['view'] },
    { module: 'properties', actions: ['view'] },
  ],
  lender: [
    { module: 'dashboard', actions: ['view'] },
    { module: 'deals', actions: ['view'] },
    { module: 'investments', actions: ['view'] },
  ],
};

export const ROLE_DEFINITIONS: Record<EnterpriseRole, RoleDefinition> = {
  owner: {
    role: 'owner',
    label: ROLE_LABELS.owner,
    description: ROLE_DESCRIPTIONS.owner,
    hierarchyLevel: 100,
    canInvite: true,
    canDeploy: true,
    canManageMoney: true,
    canAccessSecrets: true,
    requiresOwnerApproval: false,
    permissions: ROLE_PERMISSIONS.owner,
    assignableDepartments: ALL_ENTERPRISE_DEPARTMENTS,
  },
  staff: {
    role: 'staff',
    label: ROLE_LABELS.staff,
    description: ROLE_DESCRIPTIONS.staff,
    hierarchyLevel: 60,
    canInvite: false,
    canDeploy: false,
    canManageMoney: false,
    canAccessSecrets: false,
    requiresOwnerApproval: true,
    permissions: ROLE_PERMISSIONS.staff,
    assignableDepartments: ['operations', 'support', 'crm', 'properties', 'investments', 'general'],
  },
  admin: {
    role: 'admin',
    label: ROLE_LABELS.admin,
    description: ROLE_DESCRIPTIONS.admin,
    hierarchyLevel: 50,
    canInvite: true,
    canDeploy: false,
    canManageMoney: false,
    canAccessSecrets: false,
    requiresOwnerApproval: true,
    permissions: ROLE_PERMISSIONS.admin,
    assignableDepartments: ['operations', 'crm', 'marketing', 'investor_relations', 'buyer_relations', 'general'],
  },
  investor: {
    role: 'investor',
    label: ROLE_LABELS.investor,
    description: ROLE_DESCRIPTIONS.investor,
    hierarchyLevel: 20,
    canInvite: false,
    canDeploy: false,
    canManageMoney: false,
    canAccessSecrets: false,
    requiresOwnerApproval: false,
    permissions: ROLE_PERMISSIONS.investor,
    assignableDepartments: ['investor_relations'],
  },
  buyer: {
    role: 'buyer',
    label: ROLE_LABELS.buyer,
    description: ROLE_DESCRIPTIONS.buyer,
    hierarchyLevel: 20,
    canInvite: false,
    canDeploy: false,
    canManageMoney: false,
    canAccessSecrets: false,
    requiresOwnerApproval: false,
    permissions: ROLE_PERMISSIONS.buyer,
    assignableDepartments: ['buyer_relations'],
  },
  member: {
    role: 'member',
    label: ROLE_LABELS.member,
    description: ROLE_DESCRIPTIONS.member,
    hierarchyLevel: 10,
    canInvite: false,
    canDeploy: false,
    canManageMoney: false,
    canAccessSecrets: false,
    requiresOwnerApproval: false,
    permissions: ROLE_PERMISSIONS.member,
    assignableDepartments: ['general'],
  },
  realtor: {
    role: 'realtor',
    label: ROLE_LABELS.realtor,
    description: ROLE_DESCRIPTIONS.realtor,
    hierarchyLevel: 15,
    canInvite: false,
    canDeploy: false,
    canManageMoney: false,
    canAccessSecrets: false,
    requiresOwnerApproval: false,
    permissions: ROLE_PERMISSIONS.realtor,
    assignableDepartments: ['properties'],
  },
  influencer: {
    role: 'influencer',
    label: ROLE_LABELS.influencer,
    description: ROLE_DESCRIPTIONS.influencer,
    hierarchyLevel: 15,
    canInvite: false,
    canDeploy: false,
    canManageMoney: false,
    canAccessSecrets: false,
    requiresOwnerApproval: false,
    permissions: ROLE_PERMISSIONS.influencer,
    assignableDepartments: ['marketing'],
  },
  partner: {
    role: 'partner',
    label: ROLE_LABELS.partner,
    description: ROLE_DESCRIPTIONS.partner,
    hierarchyLevel: 15,
    canInvite: false,
    canDeploy: false,
    canManageMoney: false,
    canAccessSecrets: false,
    requiresOwnerApproval: false,
    permissions: ROLE_PERMISSIONS.partner,
    assignableDepartments: ['properties'],
  },
  lender: {
    role: 'lender',
    label: ROLE_LABELS.lender,
    description: ROLE_DESCRIPTIONS.lender,
    hierarchyLevel: 15,
    canInvite: false,
    canDeploy: false,
    canManageMoney: false,
    canAccessSecrets: false,
    requiresOwnerApproval: false,
    permissions: ROLE_PERMISSIONS.lender,
    assignableDepartments: ['finance', 'investments'],
  },
};

/**
 * Check if a role has permission for an action on a module.
 * Owner always has all permissions.
 */
export function hasPermission(
  role: EnterpriseRole,
  module: EnterpriseModule,
  action: EnterpriseAction,
): boolean {
  if (role === 'owner') return true;

  const permissions = ROLE_PERMISSIONS[role] ?? [];
  const modulePermissions = permissions.find((p) => p.module === module);
  if (!modulePermissions) return false;

  return modulePermissions.actions.includes(action);
}

/** Check if a role can perform a dangerous action that requires owner approval. */
export function requiresOwnerApproval(
  role: EnterpriseRole,
  action: EnterpriseAction,
): boolean {
  if (role === 'owner') return false;
  return DANGEROUS_ACTIONS.includes(action);
}

/** Check if actor role can manage target role (hierarchy check). */
export function canManageRole(actor: EnterpriseRole, target: EnterpriseRole): boolean {
  if (actor === 'owner') return true;
  if (target === 'owner') return false; // Nobody can manage owner except owner
  return ROLE_HIERARCHY_LEVELS[actor] > ROLE_HIERARCHY_LEVELS[target];
}

/** Check if a role can invite another role. */
export function canInviteRole(inviter: EnterpriseRole, target: EnterpriseRole): boolean {
  if (target === 'owner') return false; // Nobody can create another owner
  if (inviter === 'owner') return true;
  if (!ROLE_DEFINITIONS[inviter]?.canInvite) return false;
  return ROLE_HIERARCHY_LEVELS[inviter] > ROLE_HIERARCHY_LEVELS[target];
}

/** Normalize any string to a valid enterprise role. */
export function normalizeEnterpriseRole(value: string | null | undefined): EnterpriseRole {
  const normalized = (value ?? '').toLowerCase().trim().replace(/[^a-z]/g, '');
  if (ALL_ENTERPRISE_ROLES.includes(normalized as EnterpriseRole)) {
    return normalized as EnterpriseRole;
  }
  if (normalized === 'superadmin' || normalized === 'administrator') return 'admin';
  if (normalized === 'dev' || normalized === 'developer') return 'staff';
  if (normalized === 'user') return 'member';
  return 'member';
}

/** Check if role is privileged (owner, staff, admin). */
export function isPrivilegedEnterpriseRole(role: EnterpriseRole): boolean {
  return role === 'owner' || role === 'staff' || role === 'admin';
}

/** Invite record shape. */
export interface InviteRecord {
  id: string;
  token: string;
  email: string | null;
  phone: string | null;
  role: EnterpriseRole;
  department: EnterpriseDepartment;
  invited_by: string;
  invited_by_email: string | null;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  one_time: boolean;
  used_at: string | null;
  created_at: string;
  audit_note: string | null;
}

/** User access record shape. */
export interface UserAccessRecord {
  user_id: string;
  email: string | null;
  role: EnterpriseRole;
  department: EnterpriseDepartment;
  status: 'active' | 'suspended' | 'pending_approval';
  assigned_by: string;
  assigned_at: string;
  suspended_at: string | null;
  suspended_reason: string | null;
}

/** Audit log entry shape. */
export interface EnterpriseAuditEntry {
  id: string;
  actor_id: string;
  actor_email: string | null;
  actor_role: EnterpriseRole;
  action: string;
  target_type: string;
  target_id: string | null;
  target_email: string | null;
  details: string | null;
  created_at: string;
}

/** Owner approval request shape. */
export interface OwnerApprovalRequest {
  id: string;
  requester_id: string;
  requester_email: string | null;
  requester_role: EnterpriseRole;
  action: string;
  target_type: string;
  target_id: string | null;
  description: string;
  status: 'pending' | 'approved' | 'denied';
  owner_id: string | null;
  owner_decision_at: string | null;
  created_at: string;
}
