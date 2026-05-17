/**
 * IVX Block 26 — Agent Self-Execution Test routes (owner-only).
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import {
  SELF_EXECUTION_MARKER,
  getLastSelfExecutionResult,
  getSelfExecutionAgentRegistrySummary,
  runSelfExecutionTest,
} from '../services/agents/self-execution';

function getStatus(error: unknown): number {
  const m = error instanceof Error ? error.message.toLowerCase() : '';
  if (m.includes('missing bearer token') || m.includes('invalid or expired')) return 401;
  if (m.includes('privileged ivx access is required')) return 403;
  return 500;
}

function errorResponse(error: unknown): Response {
  const msg = error instanceof Error ? error.message : 'IVX self-execution route failed.';
  return ownerOnlyJson({
    ok: false,
    error: msg.slice(0, 320),
    marker: SELF_EXECUTION_MARKER,
    timestamp: new Date().toISOString(),
  }, getStatus(error));
}

export function OPTIONS(): Response { return ownerOnlyOptions(); }

export async function handleRunSelfExecution(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const result = await runSelfExecutionTest();
    return ownerOnlyJson({
      ok: result.ok,
      result,
      marker: SELF_EXECUTION_MARKER,
      timestamp: new Date().toISOString(),
    }, result.ok ? 200 : 207);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleGetSelfExecutionResult(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const result = getLastSelfExecutionResult();
    return ownerOnlyJson({
      ok: true,
      hasResult: result !== null,
      result,
      agents: getSelfExecutionAgentRegistrySummary(),
      marker: SELF_EXECUTION_MARKER,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
