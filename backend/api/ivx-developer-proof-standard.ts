/**
 * IVX IA Developer Proof Standard — API endpoints.
 *
 * Exposes the permanent proof ledger:
 *   GET  /api/ivx/developer-proof/latest        — most recent proof entry
 *   GET  /api/ivx/developer-proof/history       — full ledger, oldest-first
 *   GET  /api/ivx/developer-proof/:taskId       — single entry by task id
 *   POST /api/ivx/developer-proof/verify/:taskId — recompute final_status
 *
 * The endpoints are read-only against the ledger; recording happens via
 * `recordDeveloperProof` from the service, called by the executor/proof
 * recorder. The POST /verify endpoint re-runs `computeDeveloperProofFinalStatus`
 * and (optionally) applies a live-check patch supplied in the JSON body.
 */
import type { Context } from 'hono';
import {
  getDeveloperProof,
  getDeveloperProofHistory,
  getLatestDeveloperProof,
  IVX_DEVELOPER_PROOF_STANDARD_MARKER,
  IVX_DEVELOPER_PROOF_STANDARD_VERSION,
  recordDeveloperProof,
  updateDeveloperProof,
  type DeveloperProofEntry,
  type DeveloperProofInput,
} from '../services/ivx-developer-proof-standard';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: JSON_HEADERS });
}

function notFound(taskId: string): Response {
  return json(
    {
      ok: false,
      error: 'PROOF_NOT_FOUND',
      task_id: taskId,
      message: `No developer proof entry exists for task_id=${taskId}.`,
    },
    404,
  );
}

function standardMeta() {
  return {
    standard: IVX_DEVELOPER_PROOF_STANDARD_MARKER,
    version: IVX_DEVELOPER_PROOF_STANDARD_VERSION,
    server_time: new Date().toISOString(),
    live_commit: process.env.RENDER_GIT_COMMIT?.trim() || null,
    render_deploy_id: process.env.RENDER_DEPLOY_ID?.trim() || null,
  };
}

export function handleDeveloperProofLatest(): Response {
  const entry = getLatestDeveloperProof();
  if (!entry) {
    return json(
      {
        ok: true,
        ...standardMeta(),
        entry: null,
        message: 'No developer proof entries recorded yet.',
      },
      200,
    );
  }
  return json({ ok: true, ...standardMeta(), entry }, 200);
}

export function handleDeveloperProofHistory(): Response {
  const entries = getDeveloperProofHistory();
  return json(
    {
      ok: true,
      ...standardMeta(),
      count: entries.length,
      entries,
    },
    200,
  );
}

export function handleDeveloperProofByTaskId(context: Context): Response {
  const taskId = context.req.param('taskId')?.trim() || '';
  if (!taskId) return notFound(taskId);
  const entry = getDeveloperProof(taskId);
  if (!entry) return notFound(taskId);
  return json({ ok: true, ...standardMeta(), entry }, 200);
}

export async function handleDeveloperProofVerify(context: Context): Promise<Response> {
  const taskId = context.req.param('taskId')?.trim() || '';
  if (!taskId) return notFound(taskId);
  const existing = getDeveloperProof(taskId);
  if (!existing) return notFound(taskId);

  // Optional live-check patch supplied by the caller. Only fields present in
  // the body are applied; final_status is always recomputed by the service.
  let patch: Partial<DeveloperProofEntry> = {};
  try {
    const body = await context.req.json?.();
    if (body && typeof body === 'object') {
      patch = body as Partial<DeveloperProofEntry>;
    }
  } catch {
    patch = {};
  }

  const updated = updateDeveloperProof(taskId, patch);
  return json(
    {
      ok: true,
      ...standardMeta(),
      entry: updated,
      message:
        updated?.final_status === 'IVX IA DEVELOPER PROOF STANDARD VERIFIED'
          ? 'Commit/deploy/live/match all present and consistent.'
          : 'Missing or inconsistent proof fields — final_status is UNVERIFIED.',
    },
    200,
  );
}

/**
 * POST /api/ivx/developer-proof/record — record a new proof entry.
 *
 * This is the entry point the IVX IA executor uses after a real dev task:
 * file change -> commit -> Render deploy -> live endpoint check. The service
 * computes final_status; UNVERIFIED unless commit+deploy+live+match are all
 * present and consistent.
 */
export async function handleDeveloperProofRecord(context: Context): Promise<Response> {
  let body: Partial<DeveloperProofInput> = {};
  try {
    body = (await context.req.json?.()) as Partial<DeveloperProofInput>;
  } catch {
    body = {};
  }
  if (!body || typeof body !== 'object') {
    return json({ ok: false, error: 'INVALID_BODY' }, 400);
  }
  if (!body.requested_by || typeof body.requested_by !== 'string') {
    return json({ ok: false, error: 'MISSING_REQUESTED_BY' }, 400);
  }
  if (!body.action_type || typeof body.action_type !== 'string') {
    return json({ ok: false, error: 'MISSING_ACTION_TYPE' }, 400);
  }
  const entry = recordDeveloperProof(body as DeveloperProofInput);
  return json(
    {
      ok: true,
      ...standardMeta(),
      entry,
      message:
        entry.final_status === 'IVX IA DEVELOPER PROOF STANDARD VERIFIED'
          ? 'Proof recorded and VERIFIED.'
          : 'Proof recorded as UNVERIFIED — missing or inconsistent commit/deploy/live/match fields.',
    },
    201,
  );
}

export function developerProofOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  });
}
