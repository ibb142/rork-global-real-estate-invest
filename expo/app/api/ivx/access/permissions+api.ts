/**
 * GET /api/ivx/access/permissions — Get the full RBAC permission matrix
 * Returns all roles, their hierarchy levels, and permissions.
 */
import {
  resolveEnterpriseAuth,
  jsonResponse,
  handleApiError,
  JSON_HEADERS,
} from '@/lib/enterprise-access-server';
import {
  ROLE_DEFINITIONS,
  ALL_ENTERPRISE_ROLES,
  ROLE_HIERARCHY_LEVELS,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  DEPARTMENT_LABELS,
  ALL_ENTERPRISE_DEPARTMENTS,
  DANGEROUS_ACTIONS,
} from '@/constants/enterprise-roles';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export function HEAD(): Response {
  return new Response(null, { status: 200, headers: { ...JSON_HEADERS, 'Content-Length': '0' } });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await resolveEnterpriseAuth(request);

    const roles = ALL_ENTERPRISE_ROLES.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      description: ROLE_DESCRIPTIONS[role],
      hierarchyLevel: ROLE_HIERARCHY_LEVELS[role],
      canInvite: ROLE_DEFINITIONS[role].canInvite,
      canDeploy: ROLE_DEFINITIONS[role].canDeploy,
      canManageMoney: ROLE_DEFINITIONS[role].canManageMoney,
      canAccessSecrets: ROLE_DEFINITIONS[role].canAccessSecrets,
      requiresOwnerApproval: ROLE_DEFINITIONS[role].requiresOwnerApproval,
      permissions: ROLE_DEFINITIONS[role].permissions,
      assignableDepartments: ROLE_DEFINITIONS[role].assignableDepartments,
    }));

    return jsonResponse({
      ok: true,
      roles,
      departments: ALL_ENTERPRISE_DEPARTMENTS.map((dept) => ({
        id: dept,
        label: DEPARTMENT_LABELS[dept],
      })),
      dangerousActions: DANGEROUS_ACTIONS,
      currentUser: {
        role: auth.role,
        department: auth.department,
        isOwner: auth.isOwner,
        isPrivileged: auth.isPrivileged,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
