import type {
  AIResponseState,
  CapabilityState,
  ChatRoomRuntimeSignals,
  ChatRoomStatus,
  ServiceRuntimeHealth,
} from '../types/chat';

export type RoomCapabilityId =
  | 'ai_chat'
  | 'inbox_sync'
  | 'shared_room'
  | 'file_upload'
  | 'knowledge_answers'
  | 'owner_commands'
  | 'code_aware_support';

export type RoomCapabilityDescriptor = {
  id: RoomCapabilityId;
  label: string;
  state: CapabilityState;
  detail: string;
  testID: string;
};

export type RoomComposerNote = {
  id: string;
  tone: 'info' | 'warning';
  text: string;
  testID: string;
};

export type RoomAIAvailabilityIndicator = {
  state: CapabilityState;
  label: string;
  detail: string;
  isLoading: boolean;
  testID: string;
};

export type RoomCapabilityResolution = {
  badgeText: string;
  subtitle: string;
  summary: string;
  capabilities: RoomCapabilityDescriptor[];
  composerNotes: RoomComposerNote[];
  aiIndicator: RoomAIAvailabilityIndicator;
  emptyStateText: string;
};

const CAPABILITY_LABELS: Record<RoomCapabilityId, string> = {
  ai_chat: 'AI',
  inbox_sync: 'Inbox',
  shared_room: 'Room sync',
  file_upload: 'Files',
  knowledge_answers: 'Knowledge',
  owner_commands: 'Actions',
  code_aware_support: 'Support',
};

const SUBTITLE_FEATURE_LABELS: Record<RoomCapabilityId, string> = {
  ai_chat: 'assistant replies',
  inbox_sync: 'inbox updates',
  shared_room: 'room sync',
  file_upload: 'files',
  knowledge_answers: 'knowledge answers',
  owner_commands: 'owner actions',
  code_aware_support: 'guided support',
};

function formatList(items: string[]): string {
  if (items.length === 0) {
    return '';
  }

  if (items.length === 1) {
    return items[0] ?? '';
  }

  if (items.length === 2) {
    return `${items[0] ?? ''} and ${items[1] ?? ''}`;
  }

  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1] ?? ''}`;
}

function getServiceState(health: ServiceRuntimeHealth | undefined): CapabilityState {
  if (health === 'active') {
    return 'available';
  }

  if (health === 'degraded') {
    return 'degraded';
  }

  return 'unavailable';
}

function getRoomBadgeText(status: ChatRoomStatus | null): string {
  if (!status) {
    return 'Owner room';
  }

  if (status.storageMode === 'local_device_only') {
    return 'Owner room';
  }

  if (status.storageMode === 'snapshot_storage') {
    return 'Owner room';
  }

  if (status.storageMode === 'alternate_room_schema') {
    return 'Owner room';
  }

  if (status.deliveryMethod === 'primary_polling') {
    return 'Owner room';
  }

  return 'Owner room';
}

function buildCapability(
  id: RoomCapabilityId,
  state: CapabilityState,
  detail: string,
): RoomCapabilityDescriptor {
  return {
    id,
    label: CAPABILITY_LABELS[id],
    state,
    detail,
    testID: `chat-room-capability-${id}`,
  };
}

function resolveInboxSyncCapability(status: ChatRoomStatus | null): RoomCapabilityDescriptor {
  if (!status) {
    return buildCapability('inbox_sync', 'unavailable', 'Inbox updates are still preparing.');
  }

  if (status.storageMode === 'local_device_only') {
    return buildCapability('inbox_sync', 'unavailable', 'Inbox updates are limited on this device.');
  }

  if (status.storageMode === 'snapshot_storage') {
    return buildCapability('inbox_sync', 'degraded', 'Inbox updates are available with reduced freshness.');
  }

  if (status.storageMode === 'alternate_room_schema') {
    return buildCapability('inbox_sync', 'available', 'Inbox updates are active.');
  }

  if (status.deliveryMethod === 'primary_polling') {
    return buildCapability('inbox_sync', 'degraded', 'Inbox updates are active with periodic refresh.');
  }

  return buildCapability('inbox_sync', 'available', 'Inbox updates are active.');
}

function resolveSharedRoomCapability(status: ChatRoomStatus | null): RoomCapabilityDescriptor {
  if (!status) {
    return buildCapability('shared_room', 'unavailable', 'Room sync is still preparing.');
  }

  if (status.storageMode === 'local_device_only') {
    return buildCapability('shared_room', 'unavailable', 'Room sync is limited on this device.');
  }

  if (status.storageMode === 'snapshot_storage') {
    return buildCapability('shared_room', 'degraded', 'Room sync is available with reduced freshness.');
  }

  if (status.storageMode === 'alternate_room_schema') {
    return buildCapability('shared_room', 'available', 'Room sync is active.');
  }

  return buildCapability('shared_room', 'available', 'Room sync is active.');
}

function resolveFileUploadCapability(signals: ChatRoomRuntimeSignals): RoomCapabilityDescriptor {
  const state = getServiceState(signals.fileUploadAvailability);

  if (state === 'available') {
    return buildCapability('file_upload', 'available', 'Files are ready.');
  }

  if (state === 'degraded') {
    return buildCapability('file_upload', 'degraded', 'Files are available with reduced freshness.');
  }

  return buildCapability('file_upload', 'unavailable', 'File sharing is temporarily unavailable.');
}

function resolveAICapability(status: ChatRoomStatus | null, signals: ChatRoomRuntimeSignals): RoomCapabilityDescriptor {
  const aiState = getServiceState(signals.aiBackendHealth);

  if (signals.aiBackendSource === 'local_app_brain') {
    return buildCapability('ai_chat', 'available', 'Local IVX assistant replies are ready.');
  }

  if (aiState === 'available') {
    if (signals.aiResponseState === 'responding') {
      return buildCapability('ai_chat', 'available', 'Assistant reply is being prepared.');
    }

    return buildCapability('ai_chat', 'available', 'Assistant replies are ready.');
  }

  if (aiState === 'degraded') {
    return buildCapability('ai_chat', 'available', 'Assistant replies are ready.');
  }

  if (status?.storageMode === 'local_device_only') {
    return buildCapability('ai_chat', 'unavailable', 'Assistant replies are temporarily unavailable.');
  }

  return buildCapability('ai_chat', 'unavailable', 'Assistant replies are temporarily unavailable.');
}

function resolveKnowledgeCapability(signals: ChatRoomRuntimeSignals): RoomCapabilityDescriptor {
  const state = getServiceState(signals.knowledgeBackendHealth);

  if (state === 'available') {
    return buildCapability('knowledge_answers', 'available', 'Knowledge answers are ready.');
  }

  if (state === 'degraded') {
    return buildCapability('knowledge_answers', 'degraded', 'Knowledge answers are available with reduced freshness.');
  }

  return buildCapability('knowledge_answers', 'unavailable', 'Knowledge answers are temporarily unavailable.');
}

function resolveOwnerCommandsCapability(signals: ChatRoomRuntimeSignals): RoomCapabilityDescriptor {
  const state = getServiceState(signals.ownerCommandAvailability);

  if (state === 'available') {
    return buildCapability('owner_commands', 'available', 'Owner actions are ready.');
  }

  if (state === 'degraded') {
    return buildCapability('owner_commands', 'degraded', 'Owner actions are available with reduced freshness.');
  }

  return buildCapability('owner_commands', 'unavailable', 'Owner actions are temporarily unavailable.');
}

function resolveCodeAwareCapability(signals: ChatRoomRuntimeSignals): RoomCapabilityDescriptor {
  const state = getServiceState(signals.codeAwareServiceAvailability);

  if (state === 'available') {
    return buildCapability('code_aware_support', 'available', 'Guided support is ready.');
  }

  if (state === 'degraded') {
    return buildCapability('code_aware_support', 'degraded', 'Guided support is available with reduced freshness.');
  }

  return buildCapability('code_aware_support', 'unavailable', 'Guided support is temporarily unavailable.');
}

function buildSubtitle(_status: ChatRoomStatus | null, capabilities: RoomCapabilityDescriptor[]): string {
  const availableFeatures = capabilities
    .filter((capability) => capability.state === 'available')
    .map((capability) => SUBTITLE_FEATURE_LABELS[capability.id])
    .filter((item): item is string => item.trim().length > 0)
    .slice(0, 3);

  if (availableFeatures.length === 0) {
    return 'Clean IVX owner workspace for messages, decisions, and next actions.';
  }

  return `Clean IVX owner workspace with ${formatList(availableFeatures)}.`;
}

function buildSummary(_status: ChatRoomStatus | null, capabilities: RoomCapabilityDescriptor[]): string {
  const availableCount = capabilities.filter((capability) => capability.state === 'available').length;
  const degradedCount = capabilities.filter((capability) => capability.state === 'degraded').length;

  if (degradedCount > 0) {
    return `${availableCount} ready, ${degradedCount} refreshing.`;
  }

  return `${availableCount} ready.`;
}

function buildAIIndicator(
  aiCapability: RoomCapabilityDescriptor,
  _responseState: AIResponseState | undefined,
  _signals: ChatRoomRuntimeSignals,
): RoomAIAvailabilityIndicator {
  if (aiCapability.state === 'available') {
    return {
      state: 'available',
      label: 'AI replies ready',
      detail: 'Assistant replies are ready.',
      isLoading: false,
      testID: 'chat-room-ai-indicator',
    };
  }

  if (aiCapability.state === 'degraded') {
    return {
      state: 'available',
      label: 'AI replies ready',
      detail: 'Assistant replies are ready.',
      isLoading: false,
      testID: 'chat-room-ai-indicator',
    };
  }

  return {
    state: 'unavailable',
    label: 'AI replies off',
    detail: 'Normal messages still send while assistant replies recover.',
    isLoading: false,
    testID: 'chat-room-ai-indicator',
  };
}

function buildComposerNotes(
  status: ChatRoomStatus | null,
  aiCapability: RoomCapabilityDescriptor,
  _aiIndicator: RoomAIAvailabilityIndicator,
  _signals: ChatRoomRuntimeSignals,
): RoomComposerNote[] {
  const notes: RoomComposerNote[] = [];

  if (status?.storageMode === 'local_device_only') {
    notes.push({
      id: 'local-only',
      tone: 'warning',
      text: 'Messages send normally on this device.',
      testID: 'chat-room-composer-note-local-only',
    });
  }

  if (aiCapability.state === 'unavailable') {
    notes.push({
      id: 'ai-off',
      tone: 'info',
      text: 'Messages still send while assistant replies recover.',
      testID: 'chat-room-composer-note-ai-off',
    });
  }

  return notes;
}

export function getDefaultRoomRuntimeSignals(): ChatRoomRuntimeSignals {
  return {
    aiBackendHealth: 'inactive',
    aiBackendSource: 'unknown',
    fileUploadAvailability: 'inactive',
    knowledgeBackendHealth: 'inactive',
    ownerCommandAvailability: 'inactive',
    codeAwareServiceAvailability: 'inactive',
    aiResponseState: 'inactive',
  };
}

export function resolveRoomCapabilityState(
  status: ChatRoomStatus | null,
  runtimeSignals?: ChatRoomRuntimeSignals,
): RoomCapabilityResolution {
  const signals = runtimeSignals ?? getDefaultRoomRuntimeSignals();
  const aiCapability = resolveAICapability(status, signals);
  const knowledgeCap = resolveKnowledgeCapability(signals);
  const ownerCommandsCap = resolveOwnerCommandsCapability(signals);
  const codeAwareCap = resolveCodeAwareCapability(signals);

  const allCapabilities: RoomCapabilityDescriptor[] = [
    aiCapability,
    resolveInboxSyncCapability(status),
    resolveSharedRoomCapability(status),
    resolveFileUploadCapability(signals),
    knowledgeCap,
    ownerCommandsCap,
    codeAwareCap,
  ];

  const capabilities = allCapabilities.filter((cap) => {
    if (cap.id === 'knowledge_answers' && cap.state === 'unavailable') return false;
    if (cap.id === 'owner_commands' && cap.state === 'unavailable') return false;
    if (cap.id === 'code_aware_support' && cap.state === 'unavailable') return false;
    return true;
  });
  const aiIndicator = buildAIIndicator(aiCapability, signals.aiResponseState, signals);

  return {
    badgeText: getRoomBadgeText(status),
    subtitle: buildSubtitle(status, capabilities),
    summary: buildSummary(status, capabilities),
    capabilities,
    composerNotes: buildComposerNotes(status, aiCapability, aiIndicator, signals),
    aiIndicator,
    emptyStateText: 'Start with a message, image, video, or document. IVX Owner AI will keep replies clean and focused.',
  };
}
