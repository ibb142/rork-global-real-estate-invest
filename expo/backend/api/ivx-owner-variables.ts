/**
 * Backend Hono wrappers for the IVX owner-variables library.
 *
 * These functions are imported by `expo/backend/hono.ts` and adapt the shared
 * `expo/lib/ivx-owner-variables-server.ts` module to the Hono request/response
 * shape. They never return raw secret values.
 */

import {
  buildStatus,
  deleteVariable,
  extractBearer,
  handleApiError,
  jsonResponse,
  JSON_HEADERS,
  requireOwnerOrAdmin,
  resolveOwnerAuth,
  saveVariable,
  selfSyncFromEnv,
  testVariableOrProvider,
  type IVXOwnerVarProvider,
  type IVXOwnerVarSaveResponse,
  type IVXOwnerVariablesStatus,
} from '@/lib/ivx-owner-variables-server';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

export function hasIVXOwnerVariableRuntimeValue(name: string): boolean {
  return typeof process.env[name] === 'string' && process.env[name]!.trim().length > 0;
}

export async function getIVXOwnerVariableRuntimeValue(name: string): Promise<string> {
  return process.env[name] ?? '';
}

export async function handleIVXOwnerVariablesStatusRequest(req: Request): Promise<Response> {
  try {
    const auth = await resolveOwnerAuth(req);
    requireOwnerOrAdmin(auth);
    const status = await buildStatus(auth.client, auth);
    return jsonResponse(status as unknown as Record<string, unknown>);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function handleIVXOwnerVariablesSaveRequest(req: Request): Promise<Response> {
  try {
    const auth = await resolveOwnerAuth(req);
    requireOwnerOrAdmin(auth);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const value = typeof body.value === 'string' ? body.value : '';
    const result = await saveVariable(auth.client, auth, { name, value });
    return jsonResponse(result as unknown as Record<string, unknown>, result.ok ? 200 : 400);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function handleIVXOwnerVariablesTestRequest(req: Request): Promise<Response> {
  try {
    const auth = await resolveOwnerAuth(req);
    requireOwnerOrAdmin(auth);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() || undefined : undefined;
    const provider = typeof body.provider === 'string' ? (body.provider.trim() as IVXOwnerVarProvider) : undefined;
    const result = await testVariableOrProvider(auth.client, auth, { name, provider });
    return jsonResponse(result as unknown as Record<string, unknown>, result.ok ? 200 : 400);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function handleIVXOwnerVariablesDeleteRequest(req: Request): Promise<Response> {
  try {
    const auth = await resolveOwnerAuth(req);
    requireOwnerOrAdmin(auth);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const result = await deleteVariable(auth.client, auth, name);
    return jsonResponse(result as unknown as Record<string, unknown>, result.ok ? 200 : 400);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function handleIVXOwnerVariablesSelfSyncRequest(req: Request): Promise<Response> {
  try {
    const auth = await resolveOwnerAuth(req);
    requireOwnerOrAdmin(auth);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const overwriteExisting = body.overwriteExisting !== false;
    const names = Array.isArray(body.names)
      ? body.names.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim())
      : undefined;
    const result = await selfSyncFromEnv(auth.client, auth, { overwriteExisting, names });
    return jsonResponse({
      ok: result.ok,
      ownerOnly: true,
      tool: 'ivx_owner_variables_self_sync',
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
    }, result.ok ? 200 : 400);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function handleIVXOwnerVariablesSyncFromProjectStoreRequest(req: Request): Promise<Response> {
  // Alias to self-sync — the project store is the backend runtime env.
  return handleIVXOwnerVariablesSelfSyncRequest(req);
}

export async function handleIVXOwnerVariablesDeploymentStatusRequest(req: Request): Promise<Response> {
  try {
    const auth = await resolveOwnerAuth(req);
    requireOwnerOrAdmin(auth);
    const status = await buildStatus(auth.client, auth);
    return jsonResponse({
      ok: status.ok,
      ownerOnly: true,
      routeRegistered: true,
      deploymentMarker: status.deploymentMarker,
      tool: 'ivx_owner_variables_credentials_module',
      authenticatedUserId: auth.userId,
      authenticatedRole: auth.role,
      missingCredentials: status.missingCredentials,
      providers: status.providers,
      timestamp: new Date().toISOString(),
      secretValuesReturned: false as const,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
