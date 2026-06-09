/**
 * IVX Innovation API (owner-only) — Research Lab + Innovation Dashboard backend.
 *
 *   GET  /api/ivx/innovation/dashboard          → ideas + hypotheses + experiments + business value
 *   POST /api/ivx/innovation/scan               → run the engine: generate scored ideas from live signals
 *   GET  /api/ivx/innovation/ideas              → list scored ideas (priority-ranked)
 *   POST /api/ivx/innovation/ideas/:id/status   → approve / reject / ship an idea
 *   GET  /api/ivx/innovation/hypotheses         → list Research Lab hypotheses
 *   POST /api/ivx/innovation/hypotheses         → create a hypothesis
 *   POST /api/ivx/innovation/hypotheses/:id/status → set hypothesis status
 *   GET  /api/ivx/innovation/experiments        → list experiments
 *   POST /api/ivx/innovation/experiments        → create an experiment
 *   POST /api/ivx/innovation/experiments/:id    → update experiment status/result
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import { runInnovationScan } from '../services/ivx-innovation-engine';
import { buildInnovationDashboard } from '../services/ivx-innovation-dashboard';
import {
  createExperiment,
  createHypothesis,
  listExperiments,
  listHypotheses,
  listIdeas,
  setHypothesisStatus,
  setIdeaStatus,
  updateExperiment,
  type ExperimentStatus,
  type HypothesisStatus,
  type InnovationReviewStatus,
} from '../services/ivx-innovation-store';

export const OPTIONS = (): Response => ownerOnlyOptions();

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function requireOwner(request: Request): Promise<Response | null> {
  try {
    const owner = await assertIVXOwnerOnly(request);
    if (!owner.userId) {
      return ownerOnlyJson({ ok: false, error: 'IVX owner authentication required.' }, 401);
    }
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IVX owner authentication failed.';
    const status = /missing bearer/i.test(message) || /invalid or expired/i.test(message) ? 401 : 403;
    return ownerOnlyJson({ ok: false, error: message }, status);
  }
}

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text) return {};
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function handleInnovationDashboardRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const dashboard = await buildInnovationDashboard();
  return ownerOnlyJson({ ok: true, dashboard: dashboard as unknown as Record<string, unknown> });
}

export async function handleInnovationScanRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const conversationCount = typeof body.conversationCount === 'number' ? body.conversationCount : undefined;
  const result = await runInnovationScan({ conversationCount });
  return ownerOnlyJson({ ok: true, scan: result as unknown as Record<string, unknown> });
}

export async function handleInnovationIdeasListRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const ideas = await listIdeas();
  return ownerOnlyJson({ ok: true, ideas });
}

export async function handleInnovationIdeaStatusRequest(request: Request, ideaId: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const status = asString(body.status) as InnovationReviewStatus;
  const updated = await setIdeaStatus(ideaId, status);
  if (!updated) {
    return ownerOnlyJson({ ok: false, error: 'Idea not found or invalid status.' }, 404);
  }
  return ownerOnlyJson({ ok: true, idea: updated });
}

export async function handleInnovationHypothesesListRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const hypotheses = await listHypotheses();
  return ownerOnlyJson({ ok: true, hypotheses });
}

export async function handleInnovationHypothesisCreateRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const statement = asString(body.statement);
  if (!statement) {
    return ownerOnlyJson({ ok: false, error: 'A hypothesis statement is required.' }, 400);
  }
  const hypothesis = await createHypothesis({
    statement,
    rationale: asString(body.rationale),
    ideaId: asString(body.ideaId) || null,
  });
  return ownerOnlyJson({ ok: true, hypothesis });
}

export async function handleInnovationHypothesisStatusRequest(request: Request, hypothesisId: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const status = asString(body.status) as HypothesisStatus;
  const updated = await setHypothesisStatus(hypothesisId, status);
  if (!updated) {
    return ownerOnlyJson({ ok: false, error: 'Hypothesis not found or invalid status.' }, 404);
  }
  return ownerOnlyJson({ ok: true, hypothesis: updated });
}

export async function handleInnovationExperimentsListRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const experiments = await listExperiments();
  return ownerOnlyJson({ ok: true, experiments });
}

export async function handleInnovationExperimentCreateRequest(request: Request): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const title = asString(body.title);
  if (!title) {
    return ownerOnlyJson({ ok: false, error: 'An experiment title is required.' }, 400);
  }
  const experiment = await createExperiment({
    title,
    method: asString(body.method),
    metric: asString(body.metric),
    hypothesisId: asString(body.hypothesisId) || null,
  });
  return ownerOnlyJson({ ok: true, experiment });
}

export async function handleInnovationExperimentUpdateRequest(request: Request, experimentId: string): Promise<Response> {
  const denied = await requireOwner(request);
  if (denied) return denied;
  const body = await readJsonBody(request);
  const status = asString(body.status) as ExperimentStatus;
  const result = body.result === null ? null : asString(body.result) || undefined;
  const updated = await updateExperiment(experimentId, {
    status: status || undefined,
    result,
  });
  if (!updated) {
    return ownerOnlyJson({ ok: false, error: 'Experiment not found.' }, 404);
  }
  return ownerOnlyJson({ ok: true, experiment: updated });
}
