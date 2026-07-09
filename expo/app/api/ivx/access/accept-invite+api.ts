/**
 * POST /api/ivx/access/accept-invite — Accept an invite token
 * Body: { token: string }
 * Assigns the role and department from the invite to the accepting user.
 */
import {
  resolveEnterpriseAuth,
  jsonResponse,
  handleApiError,
  acceptInviteToken,
  JSON_HEADERS,
} from '@/lib/enterprise-access-server';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await resolveEnterpriseAuth(request);
    const body = await request.json() as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token.trim() : '';

    if (!token) {
      return jsonResponse({ error: 'Invite token is required.' }, 400);
    }

    const result = await acceptInviteToken(auth.client, auth, token);

    return jsonResponse({
      ok: true,
      message: 'Invite accepted successfully.',
      role: result.role,
      department: result.department,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
