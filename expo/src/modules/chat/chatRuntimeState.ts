export type ChatRuntimeSource = 'remote_api' | 'local_app_brain' | 'provider_fallback' | 'pending' | 'unknown';

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
  if (source === 'remote_api' || source === 'local_app_brain' || source === 'provider_fallback' || source === 'pending' || source === 'unknown') {
    return source;
  }

  return 'unknown';
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
