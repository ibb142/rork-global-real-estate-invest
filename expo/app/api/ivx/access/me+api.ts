/**
 * GET /api/ivx/access/me — Get current user's enterprise access context
 * Returns the authenticated user's role, department, permissions, and access records.
 */
import {
  resolveEnterpriseAuth,
  jsonResponse,
  handleApiError,
  JSON_HEADERS,
  checkUserPermission,
} from '@/lib/enterprise-access-server';
import { ROLE_PERMISSIONS, ALL_ENTERPRISE_ROLES } from '@/constants/enterprise-roles';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export function HEAD(): Response {
  return new Response(null, { status: 200, headers: { ...JSON_HEADERS, 'Content-Length': '0' } });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await resolveEnterpriseAuth(request);

    // Fetch all users with roles (privileged only)
    let users: unknown[] = [];
    if (auth.isPrivileged) {
      const usersResult = await auth.client
        .from('ivx_user_roles')
        .select(`
          user_id,
          role,
          department,
          status,
          assigned_by,
          assigned_at,
          suspended_at,
          suspended_reason
        `)
        .order('assigned_at', { ascending: false });

      users = usersResult.data ?? [];
    }

    // Build permission summary for current user
    const userPermissions = ROLE_PERMISSIONS[auth.role] ?? [];

    return jsonResponse({
      ok: true,
      user: {
        userId: auth.userId,
        email: auth.email,
        role: auth.role,
        department: auth.department,
        status: auth.status,
        isOwner: auth.isOwner,
        isPrivileged: auth.isPrivileged,
      },
      permissions: userPermissions,
      canManageUsers: checkUserPermission(auth, 'members', 'manage_users'),
      canInvite: checkUserPermission(auth, 'members', 'invite'),
      canApprove: auth.isOwner,
      users: auth.isPrivileged ? users : undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
