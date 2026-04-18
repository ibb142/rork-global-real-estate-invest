export type ChatRuntimeSource = 'remote_api' | 'toolkit_fallback' | 'pending' | 'unknown';

export type ChatRuntimeStateLike = {
  source: ChatRuntimeSource;
  requestStage: string;
  failureClass: string;
  isFallback?: boolean;
  isStreaming?: boolean;
  hasVisibleResponseText?: boolean;
};

const STREAMING_REQUEST_STAGES = new Set<string>(['streaming', 'responding']);

function hasCompletedVisibleFallbackTurn(input: ChatRuntimeStateLike): boolean {
  return input.hasVisibleResponseText === true
    && input.failureClass === 'none'
    && (input.source === 'toolkit_fallback' || input.requestStage === 'fallback_reply');
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
  if (source === 'remote_api' || source === 'toolkit_fallback' || source === 'pending' || source === 'unknown') {
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
  return input.source === 'remote_api' && input.failureClass === 'none' && input.requestStage === 'response_ok';
}

export function shouldShowFallbackUI(input: ChatRuntimeStateLike): boolean {
  if (isPendingRequestState(input)) {
    return false;
  }

  if (hasCompletedVisibleFallbackTurn(input)) {
    return true;
  }

  if (hasRuntimeFailure(input)) {
    return input.source === 'toolkit_fallback' || input.requestStage === 'fallback_reply';
  }

  return false;
}

export function getRuntimeSourceLabel(input: ChatRuntimeStateLike): string {
  if (isPendingRequestState(input)) {
    return 'pending';
  }

  if (shouldShowFallbackUI(input)) {
    return hasActiveStreamingState(input) ? 'backup / replying' : 'backup';
  }

  if (hasActiveStreamingState(input)) {
    return 'assistant / replying';
  }

  if (input.source === 'remote_api') {
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
      label: 'Fallback UI',
      detail: 'Fallback proof is active, so the room surfaces degraded assistant behavior and fallback diagnostics.',
      testID: 'chat-room-runtime-mode-fallback',
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

  if (hasCompletedVisibleFallbackTurn(input)) {
    return 'success';
  }

  if (shouldShowFallbackUI(input)) {
    return 'warning';
  }

  return 'neutral';
}

export function getRuntimeStatusCopy(input: ChatRuntimeStateLike): ChatRuntimeStatusCopy {
  if (isPendingRequestState(input)) {
    return {
      title: 'Connecting…',
      detail: 'Preparing the assistant response.',
      tone: 'neutral',
    };
  }

  if (hasCompletedVisibleFallbackTurn(input)) {
    return {
      title: 'Fallback reply delivered',
      detail: 'Reply delivered via backup path. Backend is degraded but the room is functional.',
      tone: 'success',
    };
  }

  if (shouldShowFallbackUI(input)) {
    if (hasActiveStreamingState(input)) {
      return {
        title: 'Backup AI active',
        detail: 'Replying through the backup path.',
        tone: 'warning',
      };
    }

    return {
      title: 'Backup AI active',
      detail: 'Waiting for backup response.',
      tone: 'warning',
    };
  }

  if (hasRuntimeFailure(input) && !input.hasVisibleResponseText) {
    return {
      title: 'Reply failed',
      detail: 'The last assistant turn did not complete cleanly.',
      tone: 'error',
    };
  }

  if (hasActiveStreamingState(input)) {
    return {
      title: 'Assistant replying',
      detail: 'Response is in progress.',
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
  return hasRuntimeFailure(input) || shouldShowFallbackUI(input) || hasVisibleAssistantResponse(input);
}
