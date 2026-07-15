export type ChatRuntimeSource =
  | 'remote_api'
  | 'local_app_brain'
  | 'provider_fallback'
  | 'pending'
  | 'unknown';

/**
 * Known assistant-source labels that the backend may stamp on a response.
 * The frontend MUST NOT discard assistant replies even when the source is unrecognised —
 * use isAcceptableAssistantSource / isExpectedAssistantSource for routing decisions.
 */
const KNOWN_BACKEND_SOURCE_TO_REMOTE: ReadonlySet<string> = new Set<string>([
  'chatgpt',
  'openai',
  'gpt',
  'gpt-4o',
  'gpt-4',
  'gpt_conversation',
  'gateway',
  'ai_gateway',
  'anthropic',
  'claude',
  'gemini',
  'remote',
  'live',
]);

export type ChatRuntimeStateLike = {
  source: ChatRuntimeSource;
  requestStage: string;
  failureClass: string;
  isFallback?: boolean;
  isStreaming?: boolean;
  hasVisibleResponseText?: boolean;
};

const STREAMING_REQUEST_STAGES = new Set<string>(['streaming', 'responding']);

function hasCompletedVisibleFallbackTurn(_input: ChatRuntimeStateLike): boolean {
  return false;
}

function isTimeoutFailure(input: Pick<ChatRuntimeStateLike, 'failureClass' | 'requestStage'>): boolean {
  return input.failureClass === 'network_unreachable'
    && (input.requestStage === 'network' || input.requestStage === 'response');
}

function shouldShowInlineTimeoutFallbackStatus(input: ChatRuntimeStateLike): boolean {
  return isTimeoutFailure(input)
    && (input.isFallback === true || input.source === 'provider_fallback' || input.requestStage === 'fallback_reply');
}

export function getInlineTimeoutFallbackStatusCopy(input: ChatRuntimeStateLike): ChatRuntimeStatusCopy | null {
  if (!shouldShowInlineTimeoutFallbackStatus(input)) {
    return null;
  }

  return {
    title: 'Message sent',
    detail: input.hasVisibleResponseText
      ? 'Reply delivered.'
      : 'Reply will appear when ready.',
    tone: 'neutral',
  };
}

export function shouldPreserveRequestScopedRuntime(
  input: Pick<ChatRuntimeStateLike, 'requestStage' | 'failureClass' | 'hasVisibleResponseText'>,
): boolean {
  if (input.hasVisibleResponseText === true) {
    return true;
  }

  if (input.failureClass !== 'none') {
    return true;
  }

  return input.requestStage !== 'idle';
}

export function getActiveRuntimeSource(input: ChatRuntimeStateLike): ChatRuntimeSource {
  if (isPendingRequestState(input) || hasRuntimeFailure(input) || hasCompletedVisibleFallbackTurn(input) || hasVisibleAssistantResponse(input)) {
    return input.source;
  }

  return 'unknown';
}

export function supportsTrueChunkStreaming(input: Pick<ChatRuntimeStateLike, 'requestStage' | 'isStreaming'>): boolean {
  return input.isStreaming === true || input.requestStage === 'streaming' || input.requestStage === 'responding';
}

export function normalizeRuntimeSource(source: string | null | undefined): ChatRuntimeSource {
  if (typeof source !== 'string') {
    return 'unknown';
  }
  const trimmed = source.trim().toLowerCase();
  if (trimmed.length === 0) {
    return 'unknown';
  }
  if (
    trimmed === 'remote_api'
    || trimmed === 'local_app_brain'
    || trimmed === 'provider_fallback'
    || trimmed === 'pending'
    || trimmed === 'unknown'
  ) {
    return trimmed;
  }
  if (KNOWN_BACKEND_SOURCE_TO_REMOTE.has(trimmed)) {
    return 'remote_api';
  }
  if (trimmed.includes('fallback')) {
    return 'provider_fallback';
  }
  if (trimmed.includes('local') || trimmed.includes('brain')) {
    return 'local_app_brain';
  }
  if (trimmed.includes('gpt') || trimmed.includes('openai') || trimmed.includes('claude') || trimmed.includes('gemini') || trimmed.includes('gateway') || trimmed.includes('remote')) {
    return 'remote_api';
  }
  return 'unknown';
}

/**
 * Returns true when the assistant source is recognised as a canonical/trusted backend source.
 * Used to decide whether to render the assistant bubble with a clean badge or with a warning.
 */
export function isExpectedAssistantSource(source: ChatRuntimeSource): boolean {
  return source === 'remote_api' || source === 'local_app_brain';
}

/**
 * Returns true when the assistant payload should still be rendered to the owner,
 * regardless of source. We NEVER silently discard a backend-stamped assistant reply.
 * Only 'pending' is treated as not-yet-renderable.
 */
export function isAcceptableAssistantSource(source: ChatRuntimeSource): boolean {
  return source !== 'pending';
}

export function hasActiveStreamingState(input: Pick<ChatRuntimeStateLike, 'requestStage' | 'failureClass' | 'isStreaming'>): boolean {
  if (input.isStreaming === true) {
    return true;
  }

  return STREAMING_REQUEST_STAGES.has(input.requestStage) && input.failureClass === 'pending';
}

export function hasVisibleAssistantResponse(input: Pick<ChatRuntimeStateLike, 'hasVisibleResponseText' | 'failureClass'>): boolean {
  return input.hasVisibleResponseText === true && input.failureClass === 'none';
}

export type ChatRuntimeProofTone = 'success' | 'warning' | 'error' | 'neutral';
export type ChatRuntimeStatusCopy = {
  title: string;
  detail: string;
  tone: 'neutral' | 'warning' | 'error' | 'success';
};

export type ChatRuntimeModeSummary = {
  label: string;
  detail: string;
  testID: string;
};

export function isPendingRequestState(input: Pick<ChatRuntimeStateLike, 'failureClass' | 'requestStage'>): boolean {
  return input.requestStage === 'request_started' && input.failureClass === 'pending';
}

export function hasRuntimeFailure(input: Pick<ChatRuntimeStateLike, 'failureClass'>): boolean {
  return input.failureClass !== 'none' && input.failureClass !== 'pending';
}

export function hasVerifiedAssistantResponse(input: Pick<ChatRuntimeStateLike, 'source' | 'failureClass' | 'requestStage'>): boolean {
  return (input.source === 'remote_api' || input.source === 'local_app_brain') && input.failureClass === 'none' && input.requestStage === 'response_ok';
}

export function shouldShowFallbackUI(input: ChatRuntimeStateLike): boolean {
  if (isPendingRequestState(input)) {
    return false;
  }

  if (hasRuntimeFailure(input)) {
    return input.source === 'provider_fallback' || input.requestStage === 'fallback_reply';
  }

  return false;
}

export function getRuntimeSourceLabel(input: ChatRuntimeStateLike): string {
  if (isPendingRequestState(input)) {
    return 'pending';
  }

  if (shouldShowFallbackUI(input)) {
    return 'assistant';
  }

  if (hasActiveStreamingState(input)) {
    return 'assistant';
  }

  if (input.source === 'remote_api' || input.source === 'local_app_brain') {
    return 'assistant';
  }

  if (input.source === 'unknown') {
    return 'assistant';
  }

  return 'pending';
}

export function getRuntimeModeSummary(input: ChatRuntimeStateLike): ChatRuntimeModeSummary {
  if (shouldShowFallbackUI(input)) {
    return {
      label: 'Assistant UI',
      detail: 'Assistant response handling stays clean while backend recovery diagnostics remain hidden from the transcript.',
      testID: 'chat-room-runtime-mode-assistant',
    };
  }

  return {
    label: 'Assistant UI',
    detail: 'Canonical assistant proof is active, so the room surfaces the standard assistant runtime path.',
    testID: 'chat-room-runtime-mode-assistant',
  };
}

export function getRuntimeProofTone(input: ChatRuntimeStateLike): ChatRuntimeProofTone {
  if (hasRuntimeFailure(input) && !input.hasVisibleResponseText) {
    return 'error';
  }

  if (hasVerifiedAssistantResponse(input) && hasVisibleAssistantResponse(input)) {
    return 'success';
  }

  if (shouldShowFallbackUI(input)) {
    return 'warning';
  }

  return 'neutral';
}

export function getRuntimeStatusCopy(input: ChatRuntimeStateLike): ChatRuntimeStatusCopy {
  const inlineTimeoutFallbackStatus = getInlineTimeoutFallbackStatusCopy(input);
  if (inlineTimeoutFallbackStatus) {
    return inlineTimeoutFallbackStatus;
  }

  if (isPendingRequestState(input)) {
    return {
      title: 'Message sent',
      detail: 'Reply will appear when ready.',
      tone: 'neutral',
    };
  }

  if (hasVisibleAssistantResponse(input)) {
    return {
      title: 'Assistant ready',
      detail: 'Reply delivered.',
      tone: 'success',
    };
  }

  if (shouldShowFallbackUI(input)) {
    if (hasActiveStreamingState(input)) {
      return {
        title: 'Message sent',
        detail: 'Reply will appear when ready.',
        tone: 'warning',
      };
    }

    return {
      title: 'Message sent',
      detail: 'Reply will appear when ready.',
      tone: 'warning',
    };
  }

  if (hasRuntimeFailure(input) && !input.hasVisibleResponseText) {
    return {
      title: 'Message saved',
      detail: 'Assistant backend is unavailable. Try again after the backend is reachable.',
      tone: 'neutral',
    };
  }

  if (hasActiveStreamingState(input)) {
    return {
      title: 'Message sent',
      detail: 'Reply will appear when ready.',
      tone: 'neutral',
    };
  }

  if (hasVerifiedAssistantResponse(input) && hasVisibleAssistantResponse(input)) {
    return {
      title: 'Assistant ready',
      detail: 'Live reply delivered.',
      tone: 'success',
    };
  }

  return {
    title: 'Assistant ready',
    detail: 'Conversation is available.',
    tone: 'neutral',
  };
}

export function shouldShowRuntimeDebugDetails(input: ChatRuntimeStateLike): boolean {
  return hasRuntimeFailure(input) || shouldShowFallbackUI(input);
}
