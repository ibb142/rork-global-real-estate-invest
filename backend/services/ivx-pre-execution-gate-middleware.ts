/**
 * IVX Pre-Execution Gate Middleware — thin adapter that runs the feasibility
 * gate at any live HTTP entry point and short-circuits the response with a
 * BLOCKED payload when a required capability cannot actually be exercised.
 *
 * Owner spec (FINAL PRE-EXECUTION GATE DEPLOYMENT): the gate must run BEFORE
 * model response, patch generation, file write, tests, git commit, git push,
 * Render deploy, Supabase migration, or proof claim — at every live entry
 * point listed in the spec.
 *
 * Usage:
 *   const gate = await checkPreExecutionGate(request, {
 *     prompt: message,
 *     ownerSessionPresent: !!ctx?.userId,
 *   });
 *   if (gate.blocked) return gate.response;
 *
 * Never prints secret values — only the gate's masked/presence output.
 */
import {
  runPreExecutionFeasibilityGate,
  formatFeasibilityGateBlock,
  describeFeasibilityGateRun,
  type FeasibilityGateInput,
  type FeasibilityGateResult,
} from './ivx-pre-execution-feasibility-gate';

export type PreExecutionGateOutcome = {
  blocked: boolean;
  result: FeasibilityGateResult;
  /** Present when blocked — a ready-to-send JSON Response. */
  response: Response | null;
  /** Stable task id used for this run. */
  taskId: string;
};

function makeTaskId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function safePromptFromRequest(request: Request): string {
  try {
    // Best-effort: do NOT consume the body here (the caller needs it). We only
    // peek at the URL for command-style prompts routed via query/path. The
    // primary prompt source is the explicit `prompt` argument passed by the
    // caller, which has already parsed the body.
    void request;
    return '';
  } catch {
    return '';
  }
}

export type CheckGateOptions = {
  /** The user prompt / command driving this request. Required for intent classification. */
  prompt: string;
  /** Whether a verified owner session is present right now. */
  ownerSessionPresent: boolean;
  /** Optional task id (one is generated if absent). */
  taskId?: string;
  /** Optional entry-point label for logs/audit (e.g. 'owner-ai', 'public-chat'). */
  entryPoint?: string;
  /** Injectable probes/env for tests. */
  probes?: FeasibilityGateInput['probes'];
  env?: FeasibilityGateInput['env'];
  skipLiveProbes?: boolean;
};

/**
 * Run the pre-execution feasibility gate for a live request. Returns a
 * BLOCKED JSON Response when any required capability fails, or null when
 * execution may proceed.
 */
export async function checkPreExecutionGate(
  _request: Request,
  options: CheckGateOptions,
): Promise<PreExecutionGateOutcome> {
  const taskId = options.taskId ?? makeTaskId(options.entryPoint ?? 'gate');
  const prompt = (options.prompt ?? '').trim() || safePromptFromRequest(_request);
  const entryPoint = options.entryPoint ?? 'unknown';

  const result = await runPreExecutionFeasibilityGate({
    prompt,
    taskId,
    ownerSessionPresent: options.ownerSessionPresent,
    probes: options.probes,
    env: options.env,
    skipLiveProbes: options.skipLiveProbes,
  });

  // Always emit a secret-safe audit line so the gate run is observable in logs
  // without ever leaking credential values.
  try {
    console.log('[IVXPreExecutionGate] gate run', {
      entryPoint,
      taskId,
      state: result.state,
      ...(result.state === 'BLOCKED' && {
        blockerCode: result.blockerCode,
        failedCapability: result.failedCapability,
        httpStatus: result.httpStatus,
        repeatedBlocker: result.repeatedBlocker,
      }),
      ...describeFeasibilityGateRun(result),
    });
  } catch {
    // Logging must never break the request path.
  }

  if (result.state === 'READY') {
    return { blocked: false, result, response: null, taskId };
  }

  // BLOCKED — short-circuit with a structured payload the frontend can render.
  const body = {
    ok: false,
    state: 'BLOCKED',
    taskId: result.taskId,
    blockerCode: result.blockerCode,
    exactBlocker: result.exactBlocker,
    failedCapability: result.failedCapability,
    requiredVariable: result.requiredVariable,
    runtimeSource: result.runtimeSource,
    httpStatus: result.httpStatus,
    nextOwnerAction: result.nextOwnerAction,
    repeatedBlocker: result.repeatedBlocker,
    marker: result.marker,
    /** Human-readable block text for chat surfaces. */
    blockText: formatFeasibilityGateBlock(result),
    /** Secret-safe capability breakdown. */
    capabilities: describeFeasibilityGateRun(result).capabilities,
    secretValuesReturned: false as const,
  };

  const response = new Response(JSON.stringify(body), {
    status: 409,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'x-ivx-pre-execution-gate': 'blocked',
      'x-ivx-blocker-code': result.blockerCode,
      'cache-control': 'no-store',
    },
  });

  return { blocked: true, result, response, taskId };
}

export { formatFeasibilityGateBlock, describeFeasibilityGateRun };
export default { checkPreExecutionGate };
