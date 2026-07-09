/**
 * POST /api/ivx/owner-variables/test
 * Runs a live provider test (GitHub / Render / Supabase / AWS / AI / Storage / Security).
 * Body: { name?: string, provider?: string }
 * Updates status + last_tested_at for all variables in the tested provider.
 */
import {
  resolveOwnerAuth,
  requireOwnerOrAdmin,
  testVariableOrProvider,
  jsonResponse,
  handleApiError,
  JSON_HEADERS,
  type IVXOwnerVarProvider,
} from '@/lib/ivx-owner-variables-server';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const auth = await resolveOwnerAuth(request);
    requireOwnerOrAdmin(auth);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() || undefined : undefined;
    const provider = typeof body.provider === 'string' ? (body.provider.trim() as IVXOwnerVarProvider) : undefined;

    if (!name && !provider) {
      return jsonResponse({
        ok: false,
        ownerOnly: true,
        secretValuesReturned: false,
        timestamp: new Date().toISOString(),
        error: 'Either name or provider must be specified.',
      }, 400);
    }

    const result = await testVariableOrProvider(auth.client, auth, { name, provider });
    return jsonResponse(result as unknown as Record<string, unknown>, result.ok ? 200 : 400);
  } catch (error) {
    return handleApiError(error);
  }
}
