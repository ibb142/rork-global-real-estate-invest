/**
 * POST /api/ivx/access/assign-role — Assign a role to a user
 * Body: { userId, role, department }
 * Owner and admin can assign. Nobody can assign owner.
 */
import {
  resolveEnterpriseAuth,
  jsonResponse,
  handleApiError,
  assignUserRole,
  requirePermission,
  JSON_HEADERS,
} from '@/lib/enterprise-access-server';
import { type EnterpriseDepartment, normalizeEnterpriseRole } from '@/constants/enterprise-roles';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await resolveEnterpriseAuth(request);
    requirePermission(auth, 'members', 'manage_roles');

    const body = await request.json() as Record<string, unknown>;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const role = normalizeEnterpriseRole(body.role as string);
    const department = (body.department as EnterpriseDepartment) ?? 'general';

    if (!userId) {
      return jsonResponse({ error: 'userId is required.' }, 400);
    }

    await assignUserRole(auth.client, auth, { userId, role, department });

    return jsonResponse({ ok: true, message: `Role '${role}' assigned to user.` });
  } catch (error) {
    return handleApiError(error);
  }
}
