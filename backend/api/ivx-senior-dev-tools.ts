/**
 * IVX Senior Developer Tools API — owner-only inspection layer.
 *
 *   GET  /api/ivx/senior-dev/tools                 list tool catalog
 *   POST /api/ivx/senior-dev/tools                 execute a tool ({ tool, input })
 *   POST /api/ivx/senior-dev/audit-report          end-to-end senior-dev report
 */

import {
  SENIOR_DEV_TOOL_CATALOG,
  executeSeniorDevTool,
  runSeniorDeveloperAudit,
  IVX_SENIOR_DEV_TOOLS_MARKER,
  type ToolName,
} from '../services/ivx-senior-dev-tools';
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';

const VALID_TOOLS: ToolName[] = SENIOR_DEV_TOOL_CATALOG.map((t) => t.name);

function isToolName(value: unknown): value is ToolName {
  return typeof value === 'string' && (VALID_TOOLS as string[]).includes(value);
}

export function OPTIONS(): Response {
  return ownerOnlyOptions();
}

export async function handleIVXSeniorDevToolsListRequest(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    return ownerOnlyJson({
      ok: true,
      marker: IVX_SENIOR_DEV_TOOLS_MARKER,
      tools: SENIOR_DEV_TOOL_CATALOG,
      routes: {
        list: 'GET /api/ivx/senior-dev/tools',
        execute: 'POST /api/ivx/senior-dev/tools',
        audit: 'POST /api/ivx/senior-dev/audit-report',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return ownerOnlyJson({
      ok: false,
      marker: IVX_SENIOR_DEV_TOOLS_MARKER,
      error: error instanceof Error ? error.message : 'tools list failed',
    }, 403);
  }
}

export async function handleIVXSeniorDevToolsExecuteRequest(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const body = (await request.json().catch(() => ({}))) as { tool?: unknown; input?: unknown };
    if (!isToolName(body.tool)) {
      return ownerOnlyJson({
        ok: false,
        marker: IVX_SENIOR_DEV_TOOLS_MARKER,
        error: `tool must be one of: ${VALID_TOOLS.join(', ')}`,
      }, 400);
    }
    const input = body.input && typeof body.input === 'object' && !Array.isArray(body.input)
      ? body.input as Record<string, unknown>
      : {};
    const output = await executeSeniorDevTool(body.tool, input);
    return ownerOnlyJson({
      ok: true,
      marker: IVX_SENIOR_DEV_TOOLS_MARKER,
      tool: body.tool,
      input,
      output,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return ownerOnlyJson({
      ok: false,
      marker: IVX_SENIOR_DEV_TOOLS_MARKER,
      error: error instanceof Error ? error.message : 'tool execution failed',
    }, 500);
  }
}

export async function handleIVXSeniorDevAuditReportRequest(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const report = await runSeniorDeveloperAudit();
    return ownerOnlyJson({
      ok: true,
      marker: IVX_SENIOR_DEV_TOOLS_MARKER,
      report,
    });
  } catch (error) {
    return ownerOnlyJson({
      ok: false,
      marker: IVX_SENIOR_DEV_TOOLS_MARKER,
      error: error instanceof Error ? error.message : 'audit report failed',
    }, 500);
  }
}
