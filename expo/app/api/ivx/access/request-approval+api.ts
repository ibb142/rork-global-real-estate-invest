/**
 * POST /api/ivx/access/request-approval — Request owner approval for a dangerous action
 * Body: { action, targetType, targetId?, description }
 * Staff/admin can request approval for dangerous actions they cannot perform directly.
 */
import {
  resolveEnterpriseAuth,
  jsonResponse,
  handleApiError,
  writeAuditLog,
  JSON_HEADERS,
} from '@/lib/enterprise-access-server';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await resolveEnterpriseAuth(request);

    if (auth.isOwner) {
      return jsonResponse({ error: 'Owner does not need approval.' }, 400);
    }

    const body = await request.json() as Record<string, unknown>;
    const action = typeof body.action === 'string' ? body.action.trim() : '';
    const targetType = typeof body.targetType === 'string' ? body.targetType.trim() : '';
    const targetId = typeof body.targetId === 'string' ? body.targetId.trim() || null : null;
    const description = typeof body.description === 'string' ? body.description.trim() : '';

    if (!action || !description) {
      return jsonResponse({ error: 'action and description are required.' }, 400);
    }

    const { data, error } = await auth.client.from('ivx_owner_approvals').insert({
      requester_id: auth.userId,
      requester_email: auth.email,
      requester_role: auth.role,
      action,
      target_type: targetType || null,
      target_id: targetId,
      description,
      status: 'pending',
    }).select('id, created_at').single();

    if (error) {
      return jsonResponse({ error: `Failed to create approval request: ${error.message}` }, 500);
    }

    const record = data as Record<string, unknown>;

    await writeAuditLog(auth.client, {
      actorId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: 'APPROVAL_REQUESTED',
      targetType: 'approval_request',
      targetId: record.id as string,
      details: `Requested approval for '${action}': ${description}`,
    });

    return jsonResponse({
      ok: true,
      request: {
        id: record.id as string,
        action,
        description,
        status: 'pending',
        createdAt: record.created_at as string,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
