/**
 * IVX Universal App Generator API (owner-only, BLOCKER 1).
 *
 *   GET  /api/ivx/app-generator            → status: marker, supported kinds, registry record
 *   POST /api/ivx/app-generator/generate   { spec } → full app blueprint
 *   POST /api/ivx/app-generator/register   → register + self-verify the tool, return record + sample
 *
 * The generator PROPOSES blueprints; it never writes files or deploys (that stays
 * owner-gated through the GitHub/Render lifecycle).
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import {
  APP_GENERATOR_SUPPORTED_KINDS,
  IVX_APP_GENERATOR_MARKER,
  generateApp,
  getAppGeneratorTool,
  registerAndVerifyAppGeneratorTool,
  validateAppSpec,
  type AppGeneratorSpec,
} from '../services/ivx-app-generator';

export const OPTIONS = (): Response => ownerOnlyOptions();

async function requireOwner(request: Request): Promise<{ ok: true } | { ok: false; response: Response }> {
  try {
    const owner = await assertIVXOwnerOnly(request);
    if (!owner.userId) {
      return { ok: false, response: ownerOnlyJson({ ok: false, error: 'IVX owner authentication required.' }, 401) };
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IVX owner authentication required.';
    const status = message.toLowerCase().includes('missing bearer') ? 401 : 403;
    return { ok: false, response: ownerOnlyJson({ ok: false, error: message }, status) };
  }
}

/** GET /api/ivx/app-generator — generator status + current registry record. */
export async function handleAppGeneratorStatusRequest(request: Request): Promise<Response> {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;
  try {
    const tool = await getAppGeneratorTool();
    return ownerOnlyJson({
      ok: true,
      marker: IVX_APP_GENERATOR_MARKER,
      supportedKinds: APP_GENERATOR_SUPPORTED_KINDS,
      registered: Boolean(tool),
      tool: tool as unknown as Record<string, unknown> | null,
    });
  } catch (error) {
    return ownerOnlyJson({ ok: false, error: error instanceof Error ? error.message : 'Failed to read app-generator status.' }, 500);
  }
}

/** POST /api/ivx/app-generator/generate — generate a full blueprint from a spec. */
export async function handleAppGeneratorGenerateRequest(request: Request): Promise<Response> {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  let body: { spec?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return ownerOnlyJson({ ok: false, error: 'Invalid JSON body.' }, 400);
  }

  const validation = validateAppSpec(body.spec);
  if (!validation.ok) {
    return ownerOnlyJson({ ok: false, error: validation.error }, 400);
  }

  try {
    const blueprint = generateApp(body.spec as AppGeneratorSpec);
    return ownerOnlyJson({ ok: true, blueprint: blueprint as unknown as Record<string, unknown> });
  } catch (error) {
    return ownerOnlyJson({ ok: false, error: error instanceof Error ? error.message : 'App generation failed.' }, 500);
  }
}

/** POST /api/ivx/app-generator/register — register + self-verify the tool. */
export async function handleAppGeneratorRegisterRequest(request: Request): Promise<Response> {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;
  try {
    const registration = await registerAndVerifyAppGeneratorTool();
    return ownerOnlyJson({
      ok: true,
      selfTestPassed: registration.selfTestPassed,
      tool: registration.tool as unknown as Record<string, unknown>,
      sample: registration.sample as unknown as Record<string, unknown>,
    });
  } catch (error) {
    return ownerOnlyJson({ ok: false, error: error instanceof Error ? error.message : 'App-generator registration failed.' }, 500);
  }
}
