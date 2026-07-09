/**
 * POST /api/ivx/access/force-logout — Force logout a user (revoke all sessions)
 * Body: { userId }
 * Only owner and admin can force logout. Owner cannot be force-logged-out.
 */
import {
  resolveEnterpriseAuth,
  jsonResponse,
  handleApiError,
  forceLogoutUser,
  JSON_HEADERS,
} from '@/lib/enterprise-access-server';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await resolveEnterpriseAuth(request);

    if (!auth.isOwner && auth.role !== 'admin') {
      return jsonResponse({ error: 'Only owner or admin can force logout users.' }, 403);
    }

    const body = await request.json() as Record<string, unknown>;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';

    if (!userId) {
      return jsonResponse({ error: 'userId is required.' }, 400);
    }

    await forceLogoutUser(auth.client, auth, userId);

    return jsonResponse({ ok: true, message: 'All sessions revoked for user.' });
  } catch (error) {
    return handleApiError(error);
  }
}
