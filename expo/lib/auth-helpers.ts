const ADMIN_ROLES = ['owner', 'ceo', 'staff', 'manager', 'analyst'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];
export type UserRole = AdminRole | 'investor';

export function isAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return ADMIN_ROLES.includes(role as AdminRole);
}

export function normalizeRole(role: string | null | undefined): UserRole {
  if (!role) return 'investor';
  if (ADMIN_ROLES.includes(role as AdminRole)) return role as AdminRole;
  return 'investor';
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
