/**
 * IVX Night Operations API — owner-only.
 *
 *   GET  /api/ivx/night-ops/status           current state + canRun decision
 *   POST /api/ivx/night-ops/config           update config { startHourUtc, windowHours, ... }
 *   POST /api/ivx/night-ops/run              force run now (still respects safety pauses unless force=true)
 *   POST /api/ivx/night-ops/touch-owner      mark owner active (pauses overnight)
 *   GET  /api/ivx/night-ops/runs             list past runs
 *   GET  /api/ivx/night-ops/runs/:runId      read full report (json or markdown)
 *   GET  /api/ivx/night-ops/roadmap          provider migration roadmap snapshot
 *   POST /api/ivx/night-ops/roadmap/advance  { phaseId, deltaPercent?, note?, markStatus? }
 */

import {
  IVX_NIGHT_OPS_MARKER,
  evaluateNightOpsCanRun,
  getNightOpsState,
  listNightOpsRuns,
  readNightOpsRun,
  runNightOpsCycle,
  touchOwnerActivity,
  updateNightOpsConfig,
} from '../services/ivx-night-ops';
import {
  advanceProviderRoadmap,
  getProviderRoadmapSnapshot,
  type RoadmapPhaseId,
} from '../services/ivx-provider-roadmap';
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';

export function OPTIONS(): Response {
  return ownerOnlyOptions();
}

function errorJson(error: unknown, status: number = 500): Response {
  return ownerOnlyJson({
    ok: false,
    error: error instanceof Error ? error.message : 'night-ops request failed',
    marker: IVX_NIGHT_OPS_MARKER,
    timestamp: new Date().toISOString(),
  }, status);
}

export async function handleIVXNightOpsStatusRequest(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const [state, decision] = await Promise.all([
      getNightOpsState(),
      evaluateNightOpsCanRun(false),
    ]);
    return ownerOnlyJson({
      ok: true,
      marker: IVX_NIGHT_OPS_MARKER,
      state,
      decision,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return errorJson(err, 403);
  }
}

export async function handleIVXNightOpsConfigRequest(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const patch: Parameters<typeof updateNightOpsConfig>[0] = {};
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled;
    if (typeof body.startHourUtc === 'number') patch.startHourUtc = body.startHourUtc;
    if (typeof body.windowHours === 'number') patch.windowHours = body.windowHours;
    if (typeof body.cooldownMs === 'number') patch.cooldownMs = body.cooldownMs;
    if (typeof body.diagnosePerRun === 'number') patch.diagnosePerRun = body.diagnosePerRun;
    if (typeof body.ownerActiveWithinMinutes === 'number') patch.ownerActiveWithinMinutes = body.ownerActiveWithinMinutes;
    const state = await updateNightOpsConfig(patch);
    return ownerOnlyJson({ ok: true, marker: IVX_NIGHT_OPS_MARKER, state });
  } catch (err) {
    return errorJson(err, 400);
  }
}

export async function handleIVXNightOpsRunRequest(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const force = body.force === true;
    const report = await runNightOpsCycle({ force });
    return ownerOnlyJson({
      ok: true,
      marker: IVX_NIGHT_OPS_MARKER,
      runId: report.runId,
      status: report.status,
      pauseReason: report.pauseReason,
      summary: {
        durationMs: report.durationMs,
        tasksCompleted: report.tasksCompleted,
        incidentsReviewed: report.incidentsReviewed,
        clustersFound: report.clustersFound,
        diagnosesProduced: report.diagnosesProduced,
        patchesProposed: report.patchesProposed,
        validations: report.validations,
        blockersRequiringApproval: report.blockersRequiringApproval,
        roadmapOverallPercent: report.roadmapOverallPercent,
        estimatedHoursSaved: report.estimatedHoursSaved,
        productionRisks: report.productionRisks,
      },
      morningReportMarkdown: report.morningReportMarkdown,
    });
  } catch (err) {
    return errorJson(err);
  }
}

export async function handleIVXNightOpsTouchOwnerRequest(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    await touchOwnerActivity();
    const state = await getNightOpsState();
    return ownerOnlyJson({ ok: true, marker: IVX_NIGHT_OPS_MARKER, lastOwnerActivityAt: state.lastOwnerActivityAt });
  } catch (err) {
    return errorJson(err, 403);
  }
}

export async function handleIVXNightOpsRunsListRequest(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') ?? '20')));
    const runs = await listNightOpsRuns(limit);
    return ownerOnlyJson({ ok: true, marker: IVX_NIGHT_OPS_MARKER, runs });
  } catch (err) {
    return errorJson(err, 403);
  }
}

export async function handleIVXNightOpsRunGetRequest(request: Request, runId: string): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const report = await readNightOpsRun(runId);
    if (!report) return ownerOnlyJson({ ok: false, error: 'run not found', runId }, 404);
    const url = new URL(request.url);
    if (url.searchParams.get('format') === 'markdown') {
      return new Response(report.morningReportMarkdown, {
        status: 200,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    return ownerOnlyJson({ ok: true, marker: IVX_NIGHT_OPS_MARKER, report });
  } catch (err) {
    return errorJson(err, 403);
  }
}

export async function handleIVXNightOpsRoadmapGetRequest(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const snapshot = await getProviderRoadmapSnapshot();
    return ownerOnlyJson({ ok: true, marker: IVX_NIGHT_OPS_MARKER, roadmap: snapshot });
  } catch (err) {
    return errorJson(err, 403);
  }
}

export async function handleIVXNightOpsRoadmapAdvanceRequest(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const phaseId = Number(body.phaseId);
    if (!Number.isInteger(phaseId) || phaseId < 1 || phaseId > 7) {
      return ownerOnlyJson({ ok: false, error: 'phaseId must be 1..7' }, 400);
    }
    const result = await advanceProviderRoadmap({
      phaseId: phaseId as RoadmapPhaseId,
      deltaPercent: typeof body.deltaPercent === 'number' ? body.deltaPercent : 0,
      note: typeof body.note === 'string' ? body.note : '',
      markStatus: body.markStatus === 'complete' || body.markStatus === 'in_progress' || body.markStatus === 'not_started' ? body.markStatus : undefined,
    });
    return ownerOnlyJson({ ok: true, marker: IVX_NIGHT_OPS_MARKER, result, roadmap: await getProviderRoadmapSnapshot() });
  } catch (err) {
    return errorJson(err, 400);
  }
}
