import { executeIVXAIBrainTool, listIVXAIBrainTools, type IVXAIBrainToolRequest } from '../services/ivx-ai-brain-tool-executor';
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';

function nowIso(): string {
  return new Date().toISOString();
}

export function OPTIONS(): Response {
  return ownerOnlyOptions();
}

export async function handleIVXAIBrainToolsListRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return ownerOnlyJson({ error: 'Method not allowed.' }, 405);
    }
    const ownerContext = await assertIVXOwnerOnly(request);
    return ownerOnlyJson({
      ok: true,
      ownerOnly: true,
      readOnly: true,
      tools: listIVXAIBrainTools(),
      authenticatedUserId: ownerContext.userId,
      timestamp: nowIso(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IVX AI Brain tools list failed.';
    console.log('[IVXAIBrainTools] List failed:', { message });
    return ownerOnlyJson({ error: message, ownerOnly: true, readOnly: true, timestamp: nowIso() }, message.toLowerCase().includes('auth') || message.toLowerCase().includes('owner') ? 401 : 500);
  }
}

export async function handleIVXAIBrainToolExecuteRequest(request: Request): Promise<Response> {
  try {
    if (request.method !== 'POST') {
      return ownerOnlyJson({ error: 'Method not allowed.' }, 405);
    }
    const ownerContext = await assertIVXOwnerOnly(request);
    const body = await request.json().catch((): IVXAIBrainToolRequest => ({}));
    const result = await executeIVXAIBrainTool(body);
    console.log('[IVXAIBrainTools] Tool executed:', {
      userId: ownerContext.userId,
      tool: result.tool,
      ok: result.ok,
      missingEnvNames: result.missingEnvNames,
    });
    return ownerOnlyJson({
      ...result,
      authenticatedUserId: ownerContext.userId,
    } as unknown as Record<string, unknown>, result.ok ? 200 : 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'IVX AI Brain tool execution failed.';
    console.log('[IVXAIBrainTools] Execute failed:', { message });
    return ownerOnlyJson({ error: message, ownerOnly: true, readOnly: true, timestamp: nowIso() }, message.toLowerCase().includes('auth') || message.toLowerCase().includes('owner') ? 401 : 400);
  }
}
