/**
 * IVX Enterprise Access Control — Client-side context hook.
 * Provides role resolution, permission checks, invite management, and audit logging
 * via the /api/ivx/access/ API routes.
 */

import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from './supabase';
import {
  type EnterpriseRole,
  type EnterpriseDepartment,
  type EnterpriseModule,
  type EnterpriseAction,
  type InviteRecord,
  type UserAccessRecord,
  type EnterpriseAuditEntry,
  type OwnerApprovalRequest,
  hasPermission as hasPermissionUtil,
  requiresOwnerApproval as requiresApprovalUtil,
  canManageRole as canManageRoleUtil,
  canInviteRole as canInviteRoleUtil,
  normalizeEnterpriseRole,
  isPrivilegedEnterpriseRole,
} from '@/constants/enterprise-roles';

const API_BASE = '/api/ivx/access';

export interface EnterpriseUserContext {
  userId: string;
  email: string | null;
  role: EnterpriseRole;
  department: EnterpriseDepartment;
  isAuthenticated: boolean;
  isOwner: boolean;
  isStaff: boolean;
  isAdmin: boolean;
  isPrivileged: boolean;
}

function getAuthToken(): Promise<string | null> {
  return supabase.auth.getSession().then((result) => result.data.session?.access_token ?? null);
}

async function apiCall<T>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: Record<string, unknown>,
): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json() as T;
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? `Request failed: ${response.status}`);
  }
  return data;
}

export const [EnterpriseAccessProvider, useEnterpriseAccess] = createContextHook(() => {
  const [currentUser, setCurrentUser] = useState<EnterpriseUserContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sessionCheckedRef = useRef(false);

  const resolveCurrentUser = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const sessionResult = await supabase.auth.getSession();
      const session = sessionResult.data.session;
      if (!session?.user) {
        setCurrentUser(null);
        setLoading(false);
        return;
      }

      const profileResult = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

      const profile = profileResult.data as Record<string, unknown> | null;
      const role = normalizeEnterpriseRole(profile?.role as string | null);
      const department = (profile?.department as EnterpriseDepartment) ?? 'general';
      const status = (profile?.status as string) ?? 'active';

      const ctx: EnterpriseUserContext = {
        userId: session.user.id,
        email: session.user.email ?? (profile?.email as string) ?? null,
        role,
        department,
        isAuthenticated: true,
        isOwner: role === 'owner',
        isStaff: role === 'staff',
        isAdmin: role === 'admin',
        isPrivileged: isPrivilegedEnterpriseRole(role) && status !== 'suspended',
      };
      setCurrentUser(ctx);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resolve user context';
      setError(message);
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionCheckedRef.current) return;
    sessionCheckedRef.current = true;
    void resolveCurrentUser();

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void resolveCurrentUser();
    });

    return () => {
      listener?.subscription?.unsubscribe();
    };
  }, [resolveCurrentUser]);

  /** Check if the current user has a specific permission. */
  const checkPermission = useCallback(
    (module: EnterpriseModule, action: EnterpriseAction): boolean => {
      if (!currentUser) return false;
      return hasPermissionUtil(currentUser.role, module, action);
    },
    [currentUser],
  );

  /** Check if an action requires owner approval for the current user. */
  const checkRequiresApproval = useCallback(
    (action: EnterpriseAction): boolean => {
      if (!currentUser) return true;
      return requiresApprovalUtil(currentUser.role, action);
    },
    [currentUser],
  );

  /** Check if current user can manage a target role. */
  const checkCanManage = useCallback(
    (targetRole: EnterpriseRole): boolean => {
      if (!currentUser) return false;
      return canManageRoleUtil(currentUser.role, targetRole);
    },
    [currentUser],
  );

  /** Check if current user can invite a target role. */
  const checkCanInvite = useCallback(
    (targetRole: EnterpriseRole): boolean => {
      if (!currentUser) return false;
      return canInviteRoleUtil(currentUser.role, targetRole);
    },
    [currentUser],
  );

  // ── API-backed operations ──

  /** Send an invite to a user by email, SMS, or copy link. */
  const sendInvite = useCallback(
    async (params: {
      email?: string;
      phone?: string;
      role: EnterpriseRole;
      department: EnterpriseDepartment;
      expiresInHours?: number;
      auditNote?: string;
    }): Promise<InviteRecord> => {
      return apiCall<InviteRecord>('/invite', 'POST', params);
    },
    [],
  );

  /** Fetch all invites. */
  const fetchInvites = useCallback(async (): Promise<InviteRecord[]> => {
    const result = await apiCall<{ invites: InviteRecord[] }>('/invites');
    return result.invites;
  }, []);

  /** Revoke an invite. */
  const revokeInvite = useCallback(async (inviteId: string): Promise<void> => {
    await apiCall('/invite', 'POST', { inviteId, action: 'revoke' });
  }, []);

  /** Accept an invite token (registration flow). */
  const acceptInvite = useCallback(
    async (token: string): Promise<{ role: EnterpriseRole; department: EnterpriseDepartment }> => {
      return apiCall('/accept-invite', 'POST', { token });
    },
    [],
  );

  /** Assign a role to a user. */
  const assignRole = useCallback(
    async (params: {
      userId: string;
      role: EnterpriseRole;
      department: EnterpriseDepartment;
    }): Promise<void> => {
      await apiCall('/assign-role', 'POST', params);
    },
    [],
  );

  /** Revoke a role from a user. */
  const revokeRole = useCallback(async (userId: string): Promise<void> => {
    await apiCall('/revoke-role', 'POST', { userId });
  }, []);

  /** Suspend a user. */
  const suspendUser = useCallback(
    async (params: { userId: string; reason: string }): Promise<void> => {
      await apiCall('/suspend-user', 'POST', params);
    },
    [],
  );

  /** Force logout a user. */
  const forceLogout = useCallback(async (userId: string): Promise<void> => {
    await apiCall('/force-logout', 'POST', { userId });
  }, []);

  /** Fetch audit log. */
  const fetchAuditLog = useCallback(
    async (limit?: number): Promise<EnterpriseAuditEntry[]> => {
      const query = limit ? `?limit=${limit}` : '';
      const result = await apiCall<{ entries: EnterpriseAuditEntry[] }>(`/audit${query}`);
      return result.entries;
    },
    [],
  );

  /** Fetch permissions matrix. */
  const fetchPermissions = useCallback(async (): Promise<Record<string, unknown>> => {
    return apiCall<Record<string, unknown>>('/permissions');
  }, []);

  /** Request owner approval for a dangerous action. */
  const requestApproval = useCallback(
    async (params: {
      action: string;
      targetType: string;
      targetId?: string;
      description: string;
    }): Promise<OwnerApprovalRequest> => {
      return apiCall<OwnerApprovalRequest>('/request-approval', 'POST', params);
    },
    [],
  );

  /** Owner approves or denies a request. */
  const approveAction = useCallback(
    async (params: { requestId: string; decision: 'approved' | 'denied' }): Promise<void> => {
      await apiCall('/approve-action', 'POST', params);
    },
    [],
  );

  /** Fetch all users with access records. */
  const fetchUsers = useCallback(async (): Promise<UserAccessRecord[]> => {
    const result = await apiCall<{ users: UserAccessRecord[] }>('/me');
    return result.users;
  }, []);

  return {
    currentUser,
    loading,
    error,
    resolveCurrentUser,
    checkPermission,
    checkRequiresApproval,
    checkCanManage,
    checkCanInvite,
    sendInvite,
    fetchInvites,
    revokeInvite,
    acceptInvite,
    assignRole,
    revokeRole,
    suspendUser,
    forceLogout,
    fetchAuditLog,
    fetchPermissions,
    requestApproval,
    approveAction,
    fetchUsers,
  };
});
