/**
 * POST /api/ivx/access/suspend-user — Suspend a user account
 * Body: { userId, reason }
 * Only owner and admin can suspend. Owner cannot be suspended.
 */
import {
  resolveEnterpriseAuth,
  jsonResponse,
  handleApiError,
  suspendUserAccount,
  JSON_HEADERS,
} from '@/lib/enterprise-access-server';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await resolveEnterpriseAuth(request);

    if (!auth.isOwner && auth.role !== 'admin') {
      return jsonResponse({ error: 'Only owner or admin can suspend users.' }, 403);
    }

    const body = await request.json() as Record<string, unknown>;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!userId) {
      return jsonResponse({ error: 'userId is required.' }, 400);
    }
    if (!reason) {
      return jsonResponse({ error: 'A reason is required to suspend a user.' }, 400);
    }

    await suspendUserAccount(auth.client, auth, { userId, reason });

    return jsonResponse({ ok: true, message: 'User suspended.' });
  } catch (error) {
    return handleApiError(error);
  }
}
