/**
 * GET /api/ivx/owner-variables/status
 * Returns masked status of all tracked owner variables — never raw secrets.
 */
import {
  resolveOwnerAuth,
  requireOwnerOrAdmin,
  buildStatus,
  jsonResponse,
  handleApiError,
  JSON_HEADERS,
} from '@/lib/ivx-owner-variables-server';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export function HEAD(): Response {
  return new Response(null, { status: 200, headers: { ...JSON_HEADERS, 'Content-Length': '0' } });
}

export async function GET(request: Request): Promise<Response> {
  try {
    const auth = await resolveOwnerAuth(request);
    requireOwnerOrAdmin(auth);
    const status = await buildStatus(auth.client, auth);
    return jsonResponse(status as unknown as Record<string, unknown>);
  } catch (error) {
    return handleApiError(error);
  }
}
