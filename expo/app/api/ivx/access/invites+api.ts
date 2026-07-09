/**
 * GET /api/ivx/access/invites — List all invites (privileged only)
 */
import {
  resolveEnterpriseAuth,
  jsonResponse,
  handleApiError,
  requirePrivileged,
  JSON_HEADERS,
} from '@/lib/enterprise-access-server';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export function HEAD(): Response {
  return new Response(null, { status: 200, headers: { ...JSON_HEADERS, 'Content-Length': '0' } });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await resolveEnterpriseAuth(request);
    requirePrivileged(auth);

    const result = await auth.client
      .from('ivx_invites')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    const invites = (result.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      const status = r.status as string;
      const expiresAt = r.expires_at as string;
      let effectiveStatus = status;
      if (status === 'pending' && new Date(expiresAt) < new Date()) {
        effectiveStatus = 'expired';
      }
      return {
        id: r.id as string,
        token: r.token as string,
        email: r.email as string | null,
        phone: r.phone as string | null,
        role: r.role as string,
        department: r.department as string,
        invited_by: r.invited_by as string,
        invited_by_email: r.invited_by_email as string | null,
        status: effectiveStatus,
        expires_at: expiresAt,
        one_time: r.one_time as boolean,
        used_at: r.used_at as string | null,
        created_at: r.created_at as string,
        audit_note: r.audit_note as string | null,
      };
    });

    return jsonResponse({ ok: true, invites });
  } catch (error) {
    return handleApiError(error);
  }
}
