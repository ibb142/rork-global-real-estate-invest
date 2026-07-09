/**
 * POST /api/ivx/owner-variables/self-sync
 * Reads backend runtime env values and writes encrypted copies into
 * ivx_owner_variables. Phone never sends raw secrets — backend reads its
 * own process.env and stores masked previews only.
 * Body: { names?: string[], overwriteExisting?: boolean }
 */
import {
  resolveOwnerAuth,
  requireOwnerOrAdmin,
  selfSyncFromEnv,
  jsonResponse,
  handleApiError,
  JSON_HEADERS,
  DEPLOYMENT_MARKER,
} from '@/lib/ivx-owner-variables-server';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await resolveOwnerAuth(request);
    requireOwnerOrAdmin(auth);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const overwriteExisting = body.overwriteExisting !== false;
    const names = Array.isArray(body.names)
      ? body.names.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim())
      : undefined;

    const result = await selfSyncFromEnv(auth.client, auth, { overwriteExisting, names });

    return jsonResponse({
      ok: result.ok,
      ownerOnly: true,
      tool: 'ivx_owner_variables_self_sync',
      deploymentMarker: DEPLOYMENT_MARKER,
      authenticatedUserId: auth.userId,
      mode: 'backend_runtime_env_to_encrypted_store',
      overwriteExisting,
      summary: result.summary,
      results: result.results,
      missingInEnv: result.results.filter((r) => r.action === 'missing_in_env').map((r) => r.name),
      errored: result.results.filter((r) => r.action === 'error').map((r) => r.name),
      statusAfterSync: result.statusAfterSync,
      secretValuesReturned: false as const,
      timestamp: new Date().toISOString(),
      error: result.error,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
