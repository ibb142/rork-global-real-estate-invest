/**
 * IVX Live Work API (owner-only).
 *
 * Real-time execution visibility for the tablet (IVX → Live Work) — never a
 * "please wait" placeholder, only live execution evidence:
 *   GET  /api/ivx/live-work/feed            → current task + module + percent,
 *                                             background-agent queue, live logs,
 *                                             proof output, recent completed tasks
 *   POST /api/ivx/live-work/check-supabase  → staged Supabase diagnostic
 *                                             (connection → authentication →
 *                                              query → response → verification →
 *                                              completion), each stage streamed
 *   GET  /api/ivx/live-work/agents          → recent background-agent runs
 *
 * Owner-gated via the same guard as the rest of the IVX developer surface.
 */
import { buildLiveWorkSnapshot } from '../services/ivx-live-work';
import { runTrackedSupabaseCheck } from '../services/ivx-supabase-check';
import { listAgentRuns } from '../services/ivx-agent-activity-store';
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';

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

/** GET /api/ivx/live-work/feed */
export async function handleLiveWorkFeedRequest(request: Request): Promise<Response> {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const logLimit = Number.parseInt(url.searchParams.get('logs') ?? '60', 10) || 60;
  try {
    const snapshot = await buildLiveWorkSnapshot(logLimit);
    return ownerOnlyJson({ ok: true, snapshot });
  } catch (error) {
    return ownerOnlyJson({ ok: false, error: error instanceof Error ? error.message : 'Failed to build live-work snapshot.' }, 500);
  }
}

/** GET /api/ivx/live-work/agents */
export async function handleLiveWorkAgentsRequest(request: Request): Promise<Response> {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const limit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10) || 50;
  try {
    const agents = await listAgentRuns(limit);
    return ownerOnlyJson({ ok: true, agents });
  } catch (error) {
    return ownerOnlyJson({ ok: false, error: error instanceof Error ? error.message : 'Failed to read agent runs.' }, 500);
  }
}

/** POST /api/ivx/live-work/check-supabase */
export async function handleLiveWorkCheckSupabaseRequest(request: Request): Promise<Response> {
  const auth = await requireOwner(request);
  if (!auth.ok) return auth.response;

  try {
    const result = await runTrackedSupabaseCheck();
    return ownerOnlyJson({ ok: result.ok, check: result });
  } catch (error) {
    return ownerOnlyJson({ ok: false, error: error instanceof Error ? error.message : 'Supabase check failed.' }, 500);
  }
}
