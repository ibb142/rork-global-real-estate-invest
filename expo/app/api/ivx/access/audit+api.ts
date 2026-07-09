/**
 * GET /api/ivx/access/audit — Fetch audit log entries (privileged only)
 * Query: ?limit=100
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

    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 100, 500) : 100;

    const result = await auth.client
      .from('ivx_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    const entries = (result.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as string,
        actor_id: r.actor_id as string,
        actor_email: r.actor_email as string | null,
        actor_role: r.actor_role as string,
        action: r.action as string,
        target_type: r.target_type as string | null,
        target_id: r.target_id as string | null,
        target_email: r.target_email as string | null,
        details: r.details as string | null,
        created_at: r.created_at as string,
      };
    });

    return jsonResponse({ ok: true, entries });
  } catch (error) {
    return handleApiError(error);
  }
}
