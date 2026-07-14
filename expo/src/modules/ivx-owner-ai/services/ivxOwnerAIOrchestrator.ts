/**
 * IVX Owner AI Request Orchestrator.
 *
 * Single entry point for every AI execution path in the Owner chat. Replaces
 * scattered direct calls to assistantReplyMutation with an explicit state machine,
 * synchronous checkpoint recording, and guaranteed cleanup.
 */

import { ivxAIWatchdog, type WatchdogTraceHandle } from './ivxAIWatchdog';

export type AIOrchestratorState =
  | 'IDLE'
  | 'USER_MESSAGE_ACCEPTED'
  | 'AI_TRIGGER_DECISION'
  | 'AI_MUTATION_STARTED'
  | 'HTTP_REQUEST_STARTED'
  | 'HTTP_RESPONSE_RECEIVED'
  | 'RESPONSE_PERSISTED'
  | 'UI_RENDERED'
  | 'SUCCESS'
  | 'VALIDATION_FAILED'
  | 'AUTH_FAILED'
  | 'NETWORK_FAILED'
  | 'PROVIDER_FAILED'
  | 'TIMEOUT'
  | 'CANCELLED';

export interface AIOrchestratorContext {
  traceId: string;
  messageId: string;
  conversationId: string | null;
  ownerId: string | null;
  mode: 'ai_only' | 'send_and_ai' | 'send_only' | 'knowledge' | 'attachment';
  source: string;
  startTimeMs: number;
  httpRequestStarted: boolean;
  httpResponseReceived: boolean;
  retryCount: number;
  terminal: boolean;
}

export interface AIOrchestratorPayload {
  text: string;
  traceId: string;
  nonBlocking: boolean;
  conversationId: string | null;
  ownerId: string | null;
  mode: AIOrchestratorContext['mode'];
  source: string;
}

export interface AIOrchestratorCallbacks {
  onTransition: (state: AIOrchestratorState, prev: AIOrchestratorState, ctx: AIOrchestratorContext) => void;
  onExecute: (payload: AIOrchestratorPayload) => Promise<void>;
  isMounted: () => boolean;
  hasConversationId: () => string | null;
  hasOwnerSession: () => boolean;
}

interface AIOrchestratorResult {
  state: AIOrchestratorState;
  context: AIOrchestratorContext;
}

export function createAIOrchestrator(callbacks: AIOrchestratorCallbacks) {
  const activeRequests = new Map<string, AIOrchestratorContext>();

  function transition(
    ctx: AIOrchestratorContext,
    next: AIOrchestratorState,
    data?: Record<string, unknown>,
  ): void {
    const prev = ctx.terminal ? ctx.terminalState ?? 'IDLE' : (activeRequests.get(ctx.traceId)?.state as AIOrchestratorState | undefined) ?? 'IDLE';
    ctx.state = next;
    callbacks.onTransition(next, prev, ctx);
  }

  function startWatchdog(ctx: AIOrchestratorContext): void {
    const trace = ivxAIWatchdog.getTrace(ctx.traceId);
    if (!trace) return;
    trace.pass('AI_MUTATION_STARTED', `orchestrator start mode=${ctx.mode} source=${ctx.source}`, {
      messageId: ctx.messageId,
      conversationId: ctx.conversationId,
    });
  }

  function markHttpStarted(ctx: AIOrchestratorContext): void {
    if (ctx.httpRequestStarted) return;
    ctx.httpRequestStarted = true;
    const trace = ivxAIWatchdog.getTrace(ctx.traceId);
    trace?.pass('BACKEND_POST_STARTED', 'HTTP request began', { messageId: ctx.messageId });
  }

  function markHttpFinished(ctx: AIOrchestratorContext, status?: number): void {
    ctx.httpResponseReceived = true;
    const trace = ivxAIWatchdog.getTrace(ctx.traceId);
    trace?.pass('BACKEND_POST_FINISHED', 'HTTP response received', { messageId: ctx.messageId, status });
  }

  async function execute(payload: AIOrchestratorPayload): Promise<AIOrchestratorResult> {
    const ctx: AIOrchestratorContext = {
      traceId: payload.traceId,
      messageId: payload.messageId,
      conversationId: payload.conversationId,
      ownerId: payload.ownerId,
      mode: payload.mode,
      source: payload.source,
      startTimeMs: Date.now(),
      httpRequestStarted: false,
      httpResponseReceived: false,
      retryCount: 0,
      terminal: false,
    };

    activeRequests.set(ctx.traceId, ctx);
    transition(ctx, 'USER_MESSAGE_ACCEPTED');

    try {
      // Pre-flight checks (synchronous)
      if (!callbacks.isMounted()) {
        transition(ctx, 'VALIDATION_FAILED', { reason: 'component unmounted' });
        return finalize(ctx, 'VALIDATION_FAILED');
      }
      if (!payload.text || payload.text.trim().length === 0) {
        transition(ctx, 'VALIDATION_FAILED', { reason: 'empty text' });
        return finalize(ctx, 'VALIDATION_FAILED');
      }
      if (payload.mode !== 'send_only' && !callbacks.hasOwnerSession()) {
        transition(ctx, 'AUTH_FAILED', { reason: 'owner session missing' });
        return finalize(ctx, 'AUTH_FAILED');
      }
      const conversationId = callbacks.hasConversationId();
      if (payload.mode !== 'send_only' && !conversationId) {
        transition(ctx, 'VALIDATION_FAILED', { reason: 'conversation id missing' });
        return finalize(ctx, 'VALIDATION_FAILED');
      }
      if (conversationId) {
        ctx.conversationId = conversationId;
      }

      transition(ctx, 'AI_TRIGGER_DECISION', { mode: payload.mode, source: payload.source });

      if (payload.mode === 'send_only') {
        transition(ctx, 'SUCCESS');
        return finalize(ctx, 'SUCCESS');
      }

      // Synchronously mark AI_MUTATION_STARTED before any async work
      transition(ctx, 'AI_MUTATION_STARTED');
      startWatchdog(ctx);

      // Execute the AI request (awaited, no fire-and-forget)
      try {
        markHttpStarted(ctx);
        await callbacks.onExecute(payload);
        markHttpFinished(ctx);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (error.name === 'AbortError' || error.message.toLowerCase().includes('abort')) {
          transition(ctx, 'CANCELLED', { reason: error.message });
          return finalize(ctx, 'CANCELLED');
        }
        if (!ctx.httpRequestStarted) {
          transition(ctx, 'NETWORK_FAILED', { reason: error.message });
          return finalize(ctx, 'NETWORK_FAILED');
        }
        if (!ctx.httpResponseReceived) {
          transition(ctx, 'TIMEOUT', { reason: error.message });
          return finalize(ctx, 'TIMEOUT');
        }
        transition(ctx, 'PROVIDER_FAILED', { reason: error.message });
        return finalize(ctx, 'PROVIDER_FAILED');
      }

      transition(ctx, 'RESPONSE_PERSISTED');
      transition(ctx, 'UI_RENDERED');
      transition(ctx, 'SUCCESS');
      return finalize(ctx, 'SUCCESS');
    } catch (unexpected) {
      const error = unexpected instanceof Error ? unexpected : new Error(String(unexpected));
      transition(ctx, 'PROVIDER_FAILED', { reason: error.message });
      return finalize(ctx, 'PROVIDER_FAILED');
    }
  }

  function finalize(ctx: AIOrchestratorContext, terminal: AIOrchestratorState): AIOrchestratorResult {
    ctx.terminal = true;
    ctx.state = terminal;
    const trace = ivxAIWatchdog.getTrace(ctx.traceId);
    if (terminal === 'SUCCESS') {
      trace?.complete('SUCCESS');
    } else {
      trace?.fail(ctx.httpRequestStarted ? 'BACKEND_POST_FINISHED' : 'AI_MUTATION_STARTED', `terminal=${terminal}`);
    }
    activeRequests.delete(ctx.traceId);
    return { state: terminal, context: ctx };
  }

  function cancel(traceId: string): void {
    const ctx = activeRequests.get(traceId);
    if (!ctx || ctx.terminal) return;
    transition(ctx, 'CANCELLED');
    finalize(ctx, 'CANCELLED');
  }

  return {
    execute,
    cancel,
    markHttpStarted,
    markHttpFinished,
    getContext: (traceId: string) => activeRequests.get(traceId),
  };
}

export type AIOrchestrator = ReturnType<typeof createAIOrchestrator>;
