const ADMIN_ROLES = ['owner', 'admin', 'ceo', 'staff', 'manager', 'analyst', 'support'] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];
export type UserRole = AdminRole | 'investor';

const ROLE_ALIASES: Record<string, UserRole> = {
  super_admin: 'admin',
  superadmin: 'admin',
  administrator: 'admin',
  admin_user: 'admin',
  adminuser: 'admin',
  owner_admin: 'owner',
  owneradmin: 'owner',
  chief_executive_officer: 'ceo',
  chiefexecutiveofficer: 'ceo',
  staff_member: 'staff',
  staffmember: 'staff',
  team_manager: 'manager',
  teammanager: 'manager',
  support_staff: 'support',
  supportstaff: 'support',
  support_agent: 'support',
  supportagent: 'support',
  customer_support: 'support',
  customersupport: 'support',
};

export function canonicalizeRole(role: string | null | undefined): string {
  return role?.trim().toLowerCase().replace(/[\s-]+/g, '_') ?? '';
}

export function normalizeRole(role: string | null | undefined): UserRole {
  const normalized = canonicalizeRole(role);
  if (!normalized) return 'investor';

  const aliasedRole = ROLE_ALIASES[normalized] ?? normalized;
  if (ADMIN_ROLES.includes(aliasedRole as AdminRole)) {
    return aliasedRole as AdminRole;
  }

  return 'investor';
}

export function isAdminRole(role: string | null | undefined): boolean {
  return normalizeRole(role) !== 'investor';
}

export function validateEmail(email: string): boolean {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

export function validatePassword(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least 1 uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, reason: 'Password must contain at least 1 number.' };
  }
  return { valid: true };
}

export function validatePhone(phone: string): boolean {
  const re = /^\+?[\d\s\-()]{10,}$/;
  return re.test(phone);
}

export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Use for password sign-in only; trims accidental leading/trailing whitespace from the field. */
export function sanitizePasswordForSignIn(password: string): string {
  return password.trim();
}
