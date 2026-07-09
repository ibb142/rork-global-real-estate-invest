/**
 * POST /api/ivx/owner-variables/save
 * Saves (upserts) a single credential. Does NOT touch other variables.
 * Body: { name: string, value: string }
 * Returns masked preview only — never the raw value.
 */
import {
  resolveOwnerAuth,
  requireOwnerOrAdmin,
  saveVariable,
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
        error: 'Request body must be JSON with name and value.',
      }, 400);
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const value = typeof body.value === 'string' ? body.value : '';

    if (!name || !value) {
      return jsonResponse({
        ok: false,
        ownerOnly: true,
        secretValuesReturned: false,
        timestamp: new Date().toISOString(),
        error: 'Both name and value are required.',
      }, 400);
    }

    const result = await saveVariable(auth.client, auth, { name, value });
    return jsonResponse(result as unknown as Record<string, unknown>, result.ok ? 200 : 400);
  } catch (error) {
    return handleApiError(error);
  }
}
