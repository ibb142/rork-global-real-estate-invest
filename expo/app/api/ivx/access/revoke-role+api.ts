/**
 * POST /api/ivx/access/revoke-role — Revoke a user's role (reset to member)
 * Body: { userId }
 * Only owner can revoke roles. Owner role cannot be revoked.
 */
import {
  resolveEnterpriseAuth,
  jsonResponse,
  handleApiError,
  requireOwner,
  writeAuditLog,
  JSON_HEADERS,
} from '@/lib/enterprise-access-server';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await resolveEnterpriseAuth(request);
    requireOwner(auth);

    const body = await request.json() as Record<string, unknown>;
    const userId = typeof body.userId === 'string' ? body.userId.trim() : '';

    if (!userId) {
      return jsonResponse({ error: 'userId is required.' }, 400);
    }

    // Check target is not owner
    const existing = await auth.client
      .from('ivx_user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing.data && (existing.data as Record<string, unknown>).role === 'owner') {
      return jsonResponse({ error: 'Cannot revoke owner role.' }, 403);
    }

    // Reset to member
    const { error } = await auth.client
      .from('ivx_user_roles')
      .update({
        role: 'member',
        department: 'general',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      return jsonResponse({ error: `Failed to revoke role: ${error.message}` }, 500);
    }

    // Update profiles table too
    await auth.client.from('profiles').update({ role: 'member' }).eq('id', userId);

    await writeAuditLog(auth.client, {
      actorId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: 'ROLE_REVOKED',
      targetType: 'user',
      targetId: userId,
      details: 'Role revoked, reset to member',
    });

    return jsonResponse({ ok: true, message: 'Role revoked. User reset to member.' });
  } catch (error) {
    return handleApiError(error);
  }
}
