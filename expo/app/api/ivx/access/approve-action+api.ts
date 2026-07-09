/**
 * POST /api/ivx/access/approve-action — Owner approves or denies an approval request
 * Body: { requestId, decision: 'approved' | 'denied' }
 * Only owner can approve/deny.
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
    const requestId = typeof body.requestId === 'string' ? body.requestId.trim() : '';
    const decision = body.decision === 'approved' ? 'approved' : body.decision === 'denied' ? 'denied' : '';

    if (!requestId || !decision) {
      return jsonResponse({ error: 'requestId and decision (approved/denied) are required.' }, 400);
    }

    // Fetch the request
    const requestResult = await auth.client
      .from('ivx_owner_approvals')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    const approvalRequest = requestResult.data as Record<string, unknown> | null;
    if (!approvalRequest) {
      return jsonResponse({ error: 'Approval request not found.' }, 404);
    }

    if (approvalRequest.status !== 'pending') {
      return jsonResponse({ error: `Request already ${approvalRequest.status}.` }, 409);
    }

    const { error } = await auth.client
      .from('ivx_owner_approvals')
      .update({
        status: decision,
        owner_id: auth.userId,
        owner_decision_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (error) {
      return jsonResponse({ error: `Failed to update approval: ${error.message}` }, 500);
    }

    await writeAuditLog(auth.client, {
      actorId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: decision === 'approved' ? 'APPROVAL_GRANTED' : 'APPROVAL_DENIED',
      targetType: 'approval_request',
      targetId: requestId,
      details: `Owner ${decision} request for '${approvalRequest.action}': ${approvalRequest.description}`,
    });

    return jsonResponse({
      ok: true,
      message: `Request ${decision}.`,
      requestId,
      decision,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
