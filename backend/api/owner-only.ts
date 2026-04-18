import {
  resolveIVXAuthenticatedRequest,
  type IVXAuthenticatedRequestContext,
} from '../../expo/shared/ivx';

export type IVXOwnerRequestContext = IVXAuthenticatedRequestContext;

const OWNER_ONLY_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
} as const;

export function ownerOnlyJson(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: OWNER_ONLY_HEADERS,
  });
}

export function ownerOnlyOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: OWNER_ONLY_HEADERS,
  });
}

export async function assertIVXOwnerOnly(request: Request): Promise<IVXOwnerRequestContext> {
  return await resolveIVXAuthenticatedRequest(request, '[IVXOwnerOnly]');
}
