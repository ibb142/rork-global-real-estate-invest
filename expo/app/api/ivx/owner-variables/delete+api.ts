/**
 * POST /api/ivx/owner-variables/delete
 * Deletes a single credential. Does NOT touch other variables.
 * Body: { name: string }
 */
import {
  resolveOwnerAuth,
  requireOwnerOrAdmin,
  deleteVariable,
  jsonResponse,
  handleApiError,
  JSON_HEADERS,
} from '@/lib/ivx-owner-variables-server';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await resolveOwnerAuth(request);
    requireOwnerOrAdmin(auth);

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return jsonResponse({
        ok: false,
        ownerOnly: true,
        secretValuesReturned: false,
        timestamp: new Date().toISOString(),
        error: 'Request body must be JSON with name.',
      }, 400);
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return jsonResponse({
        ok: false,
        ownerOnly: true,
        secretValuesReturned: false,
        timestamp: new Date().toISOString(),
        error: 'name is required.',
      }, 400);
    }

    const result = await deleteVariable(auth.client, auth, name);
    return jsonResponse(result as unknown as Record<string, unknown>, result.ok ? 200 : 400);
  } catch (error) {
    return handleApiError(error);
  }
}
