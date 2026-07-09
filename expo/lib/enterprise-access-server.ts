/**
 * IVX Enterprise Access Control — Server-side shared helpers.
 * Used by all /api/ivx/access/ routes for auth, permission checks, and audit logging.
 */

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import {
  type EnterpriseRole,
  type EnterpriseDepartment,
  type EnterpriseModule,
  type EnterpriseAction,
  hasPermission,
  requiresOwnerApproval,
  canManageRole,
  canInviteRole,
  normalizeEnterpriseRole,
  isPrivilegedEnterpriseRole,
  DANGEROUS_ACTIONS,
} from '@/constants/enterprise-roles';

export const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
} as const;

export function jsonResponse(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: JSON_HEADERS });
}

export function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/** Generate a one-time invite token. */
export function createInviteToken(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) return cryptoRef.randomUUID().replace(/-/g, '');
  return `${Date.now().toString(16)}${Math.random().toString(16).slice(2).padEnd(20, '0')}`.slice(0, 32);
}

export function extractBearerToken(request: Request): string | null {
  const auth = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (!auth) return null;
  const [scheme, token] = auth.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return null;
  const trimmed = readTrimmed(token);
  return trimmed.length > 0 ? trimmed : null;
}

function getSupabaseServerConfig(): { url: string; key: string; isServiceRole: boolean } {
  const url = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL);
  const anonKey = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const serviceKey = readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url) throw new Error('EXPO_PUBLIC_SUPABASE_URL is missing.');

  const hasServiceRole = serviceKey && serviceKey !== anonKey && serviceKey.length > 50;
  return {
    url,
    key: hasServiceRole ? serviceKey : anonKey,
    isServiceRole: !!hasServiceRole,
  };
}

export function createServerClient(accessToken?: string): SupabaseClient {
  const config = getSupabaseServerConfig();
  const headers: Record<string, string> = {};

  if (accessToken && !config.isServiceRole) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  return createClient(config.url, config.key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: { headers },
  });
}

export interface EnterpriseAuthContext {
  client: SupabaseClient;
  user: User;
  userId: string;
  email: string | null;
  role: EnterpriseRole;
  department: EnterpriseDepartment;
  status: string;
  isOwner: boolean;
  isPrivileged: boolean;
}

/** Resolve the authenticated user and their enterprise role. */
export async function resolveEnterpriseAuth(request: Request): Promise<EnterpriseAuthContext> {
  const accessToken = extractBearerToken(request);
  if (!accessToken) {
    throw new EnterpriseAuthError('Missing bearer token.', 401);
  }

  const client = createServerClient(accessToken);
  const userResult = await client.auth.getUser(accessToken);

  if (userResult.error || !userResult.data.user) {
    throw new EnterpriseAuthError('Invalid or expired session.', 401);
  }

  const user = userResult.data.user;

  // Look up enterprise role
  const roleResult = await client
    .from('ivx_user_roles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  let role: EnterpriseRole = 'member';
  let department: EnterpriseDepartment = 'general';
  let status = 'active';

  if (roleResult.data) {
    const rowData = roleResult.data as Record<string, unknown>;
    role = normalizeEnterpriseRole(rowData.role as string);
    department = (rowData.department as EnterpriseDepartment) ?? 'general';
    status = (rowData.status as string) ?? 'active';
  } else {
    // Fallback to profiles table
    const profileResult = await client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (profileResult.data) {
      const profile = profileResult.data as Record<string, unknown>;
      role = normalizeEnterpriseRole(profile.role as string);
      department = (profile.department as EnterpriseDepartment) ?? 'general';
      status = (profile.status as string) ?? 'active';
    }

    // Owner email allowlist check
    if (!isPrivilegedEnterpriseRole(role)) {
      const ownerEmails = (process.env.IVX_OWNER_REGISTRATION_EMAILS ?? process.env.EXPO_PUBLIC_OWNER_EMAIL ?? '')
        .split(',')
        .map((e: string) => e.trim().toLowerCase())
        .filter(Boolean);
      const userEmail = (user.email ?? '').toLowerCase();
      if (ownerEmails.includes(userEmail)) {
        role = 'owner';
        status = 'active';
      }
    }
  }

  if (status === 'suspended') {
    throw new EnterpriseAuthError('Account suspended. Contact the owner.', 403);
  }

  return {
    client,
    user,
    userId: user.id,
    email: user.email ?? null,
    role,
    department,
    status,
    isOwner: role === 'owner',
    isPrivileged: isPrivilegedEnterpriseRole(role),
  };
}

export class EnterpriseAuthError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message);
    this.name = 'EnterpriseAuthError';
  }
}

/** Check permission for the authenticated user. */
export function checkUserPermission(
  auth: EnterpriseAuthContext,
  module: EnterpriseModule,
  action: EnterpriseAction,
): boolean {
  return hasPermission(auth.role, module, action);
}

/** Require a specific permission or throw 403. */
export function requirePermission(
  auth: EnterpriseAuthContext,
  module: EnterpriseModule,
  action: EnterpriseAction,
): void {
  if (!checkUserPermission(auth, module, action)) {
    throw new EnterpriseAuthError(
      `Access denied: role '${auth.role}' cannot perform '${action}' on '${module}'.`,
      403,
    );
  }
}

/** Require owner role or throw 403. */
export function requireOwner(auth: EnterpriseAuthContext): void {
  if (!auth.isOwner) {
    throw new EnterpriseAuthError('Owner access required.', 403);
  }
}

/** Require privileged role (owner, staff, admin) or throw 403. */
export function requirePrivileged(auth: EnterpriseAuthContext): void {
  if (!auth.isPrivileged) {
    throw new EnterpriseAuthError('Privileged access required.', 403);
  }
}

/** Check if an action requires owner approval for the user. */
export function actionRequiresApproval(
  auth: EnterpriseAuthContext,
  action: EnterpriseAction,
): boolean {
  if (auth.isOwner) return false;
  return DANGEROUS_ACTIONS.includes(action);
}

/** Write an audit log entry. */
export async function writeAuditLog(
  client: SupabaseClient,
  entry: {
    actorId: string;
    actorEmail: string | null;
    actorRole: EnterpriseRole;
    action: string;
    targetType?: string;
    targetId?: string | null;
    targetEmail?: string | null;
    details?: string | null;
  },
): Promise<void> {
  try {
    await client.from('ivx_audit_logs').insert({
      actor_id: entry.actorId,
      actor_email: entry.actorEmail,
      actor_role: entry.actorRole,
      action: entry.action,
      target_type: entry.targetType ?? null,
      target_id: entry.targetId ?? null,
      target_email: entry.targetEmail ?? null,
      details: entry.details ?? null,
    });
  } catch (error) {
    console.log('[EnterpriseAccess] Audit log write failed:', error instanceof Error ? error.message : String(error));
  }
}

/** Assign a role to a user with security checks. */
export async function assignUserRole(
  client: SupabaseClient,
  auth: EnterpriseAuthContext,
  params: {
    userId: string;
    role: EnterpriseRole;
    department: EnterpriseDepartment;
  },
): Promise<void> {
  // Nobody can assign owner role (except owner, but only to existing owners)
  if (params.role === 'owner' && !auth.isOwner) {
    throw new EnterpriseAuthError('Only the owner can assign the owner role.', 403);
  }
  if (params.role === 'owner') {
    throw new EnterpriseAuthError('Cannot create new owners. Owner role is unique.', 403);
  }

  // Check hierarchy
  if (!canManageRole(auth.role, params.role)) {
    throw new EnterpriseAuthError(`Role '${auth.role}' cannot manage role '${params.role}'.`, 403);
  }

  // Check if target is owner (cannot be changed)
  const existing = await client
    .from('ivx_user_roles')
    .select('role')
    .eq('user_id', params.userId)
    .maybeSingle();

  if (existing.data && (existing.data as Record<string, unknown>).role === 'owner') {
    throw new EnterpriseAuthError('Cannot modify owner role.', 403);
  }

  // Upsert role
  const { error } = await client.from('ivx_user_roles').upsert({
    user_id: params.userId,
    role: params.role,
    department: params.department,
    status: 'active',
    assigned_by: auth.userId,
    assigned_at: nowIso(),
    updated_at: nowIso(),
  }, { onConflict: 'user_id' });

  if (error) throw new EnterpriseAuthError(`Failed to assign role: ${error.message}`, 500);

  // Also update profiles table for backward compat
  await client.from('profiles').update({ role: params.role }).eq('id', params.userId);

  await writeAuditLog(client, {
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: 'ROLE_ASSIGNED',
    targetType: 'user',
    targetId: params.userId,
    details: `Assigned role '${params.role}' in department '${params.department}'`,
  });
}

/** Suspend a user with security checks. */
export async function suspendUserAccount(
  client: SupabaseClient,
  auth: EnterpriseAuthContext,
  params: { userId: string; reason: string },
): Promise<void> {
  // Check if target is owner (cannot be suspended)
  const existing = await client
    .from('ivx_user_roles')
    .select('role')
    .eq('user_id', params.userId)
    .maybeSingle();

  if (existing.data && (existing.data as Record<string, unknown>).role === 'owner') {
    throw new EnterpriseAuthError('Owner cannot be suspended.', 403);
  }

  // Only owner and admin can suspend
  if (!auth.isOwner && auth.role !== 'admin') {
    throw new EnterpriseAuthError('Only owner or admin can suspend users.', 403);
  }

  const { error } = await client
    .from('ivx_user_roles')
    .update({
      status: 'suspended',
      suspended_at: nowIso(),
      suspended_reason: params.reason,
      updated_at: nowIso(),
    })
    .eq('user_id', params.userId);

  if (error) throw new EnterpriseAuthError(`Failed to suspend user: ${error.message}`, 500);

  await writeAuditLog(client, {
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: 'USER_SUSPENDED',
    targetType: 'user',
    targetId: params.userId,
    details: `Suspended: ${params.reason}`,
  });
}

/** Force logout a user by revoking all sessions. */
export async function forceLogoutUser(
  client: SupabaseClient,
  auth: EnterpriseAuthContext,
  userId: string,
): Promise<void> {
  // Check if target is owner
  const existing = await client
    .from('ivx_user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing.data && (existing.data as Record<string, unknown>).role === 'owner') {
    throw new EnterpriseAuthError('Cannot force logout the owner.', 403);
  }

  if (!auth.isOwner && auth.role !== 'admin') {
    throw new EnterpriseAuthError('Only owner or admin can force logout users.', 403);
  }

  // Mark all sessions as revoked
  const { error } = await client
    .from('ivx_sessions')
    .update({
      revoked: true,
      revoked_at: nowIso(),
      revoked_by: auth.userId,
    })
    .eq('user_id', userId)
    .eq('revoked', false);

  if (error) throw new EnterpriseAuthError(`Failed to force logout: ${error.message}`, 500);

  await writeAuditLog(client, {
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: 'FORCE_LOGOUT',
    targetType: 'user',
    targetId: userId,
    details: 'All sessions revoked',
  });
}

/** Create an invite with security checks. */
export async function createInvite(
  client: SupabaseClient,
  auth: EnterpriseAuthContext,
  params: {
    email?: string;
    phone?: string;
    role: EnterpriseRole;
    department: EnterpriseDepartment;
    expiresInHours?: number;
    auditNote?: string;
  },
): Promise<{ id: string; token: string; expiresAt: string }> {
  // Cannot invite owner
  if (params.role === 'owner') {
    throw new EnterpriseAuthError('Cannot invite a new owner.', 403);
  }

  // Check if user can invite this role
  if (!canInviteRole(auth.role, params.role)) {
    throw new EnterpriseAuthError(`Role '${auth.role}' cannot invite role '${params.role}'.`, 403);
  }

  const token = createInviteToken();
  const expiresInHours = params.expiresInHours ?? 72;
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  const { data, error } = await client.from('ivx_invites').insert({
    token,
    email: params.email ?? null,
    phone: params.phone ?? null,
    role: params.role,
    department: params.department,
    invited_by: auth.userId,
    invited_by_email: auth.email,
    status: 'pending',
    expires_at: expiresAt,
    one_time: true,
    audit_note: params.auditNote ?? null,
  }).select('id').single();

  if (error) throw new EnterpriseAuthError(`Failed to create invite: ${error.message}`, 500);

  await writeAuditLog(client, {
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: 'INVITE_CREATED',
    targetType: 'invite',
    targetId: (data as Record<string, unknown>).id as string,
    targetEmail: params.email ?? params.phone ?? null,
    details: `Invited '${params.role}' to '${params.department}'${params.auditNote ? `: ${params.auditNote}` : ''}`,
  });

  return { id: (data as Record<string, unknown>).id as string, token, expiresAt };
}

/** Accept an invite token. */
export async function acceptInviteToken(
  client: SupabaseClient,
  auth: EnterpriseAuthContext,
  token: string,
): Promise<{ role: EnterpriseRole; department: EnterpriseDepartment }> {
  const inviteResult = await client
    .from('ivx_invites')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  const invite = inviteResult.data as Record<string, unknown> | null;
  if (!invite) {
    throw new EnterpriseAuthError('Invalid invite token.', 404);
  }

  if (invite.status === 'accepted') {
    throw new EnterpriseAuthError('This invite has already been used.', 410);
  }
  if (invite.status === 'revoked') {
    throw new EnterpriseAuthError('This invite has been revoked.', 403);
  }
  if (invite.status === 'expired' || new Date(invite.expires_at as string) < new Date()) {
    throw new EnterpriseAuthError('This invite has expired.', 410);
  }

  const inviteRole = normalizeEnterpriseRole(invite.role as string);
  const inviteDepartment = (invite.department as EnterpriseDepartment) ?? 'general';

  // Assign role to the accepting user
  await assignUserRole(client, auth, {
    userId: auth.userId,
    role: inviteRole,
    department: inviteDepartment,
  });

  // Mark invite as accepted
  await client.from('ivx_invites').update({
    status: 'accepted',
    used_at: nowIso(),
  }).eq('id', invite.id as string);

  await writeAuditLog(client, {
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: 'INVITE_ACCEPTED',
    targetType: 'invite',
    targetId: invite.id as string,
    details: `Accepted invite for role '${inviteRole}' in '${inviteDepartment}'`,
  });

  return { role: inviteRole, department: inviteDepartment };
}

/** Revoke an invite. */
export async function revokeInviteRecord(
  client: SupabaseClient,
  auth: EnterpriseAuthContext,
  inviteId: string,
): Promise<void> {
  const inviteResult = await client
    .from('ivx_invites')
    .select('invited_by, status')
    .eq('id', inviteId)
    .maybeSingle();

  const invite = inviteResult.data as Record<string, unknown> | null;
  if (!invite) {
    throw new EnterpriseAuthError('Invite not found.', 404);
  }

  // Only owner or the person who created the invite can revoke
  if (!auth.isOwner && invite.invited_by !== auth.userId) {
    throw new EnterpriseAuthError('You can only revoke invites you created.', 403);
  }

  const { error } = await client.from('ivx_invites').update({
    status: 'revoked',
  }).eq('id', inviteId);

  if (error) throw new EnterpriseAuthError(`Failed to revoke invite: ${error.message}`, 500);

  await writeAuditLog(client, {
    actorId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: 'INVITE_REVOKED',
    targetType: 'invite',
    targetId: inviteId,
    details: 'Invite revoked',
  });
}

/** Handle API errors and return a proper Response. */
export function handleApiError(error: unknown): Response {
  if (error instanceof EnterpriseAuthError) {
    return jsonResponse({ error: error.message }, error.statusCode);
  }
  const message = error instanceof Error ? error.message : 'Internal server error';
  console.log('[EnterpriseAccess] API error:', message);
  return jsonResponse({ error: message }, 500);
}
