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
  ai_chat: 'AI chat',
  inbox_sync: 'Inbox sync',
  shared_room: 'Shared room',
  file_upload: 'File upload',
  knowledge_answers: 'Knowledge answers',
  owner_commands: 'Owner commands',
  code_aware_support: 'Code-aware support',
};

const SUBTITLE_FEATURE_LABELS: Record<RoomCapabilityId, string> = {
  ai_chat: 'AI chat',
  inbox_sync: 'inbox sync',
  shared_room: 'shared messaging',
  file_upload: 'uploads',
  knowledge_answers: 'knowledge-assisted support',
  owner_commands: 'owner commands',
  code_aware_support: 'code-aware support',
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
    return 'Room probe pending';
  }

  if (status.storageMode === 'local_device_only') {
    return 'Local fallback';
  }

  if (status.storageMode === 'snapshot_storage') {
    return 'Shared snapshot';
  }

  if (status.storageMode === 'alternate_room_schema') {
    return 'Shared fallback';
  }

  if (status.deliveryMethod === 'primary_polling') {
    return 'Shared sync';
  }

  return 'Shared room live';
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
    return buildCapability('inbox_sync', 'unavailable', 'Inbox sync is not proven yet because the room transport probe has not completed.');
  }

  if (status.storageMode === 'local_device_only') {
    return buildCapability('inbox_sync', 'unavailable', 'Currently unavailable in local-only mode. Inbox changes are not shared.');
  }

  if (status.storageMode === 'snapshot_storage') {
    return buildCapability('inbox_sync', 'degraded', 'Snapshot fallback is active. Inbox updates sync in a reduced shared mode.');
  }

  if (status.storageMode === 'alternate_room_schema') {
    return buildCapability('inbox_sync', 'available', 'Inbox sync is running through the alternate shared room schema.');
  }

  if (status.deliveryMethod === 'primary_polling') {
    return buildCapability('inbox_sync', 'degraded', 'Inbox sync is active, but realtime delivery is reduced and polling is in use.');
  }

  return buildCapability('inbox_sync', 'available', 'Inbox sync is active through the primary shared room tables.');
}

function resolveSharedRoomCapability(status: ChatRoomStatus | null): RoomCapabilityDescriptor {
  if (!status) {
    return buildCapability('shared_room', 'unavailable', 'Shared room transport is not proven yet because the room probe has not completed.');
  }

  if (status.storageMode === 'local_device_only') {
    return buildCapability('shared_room', 'unavailable', 'Currently unavailable in local-only mode. Messages are not shared with other users.');
  }

  if (status.storageMode === 'snapshot_storage') {
    return buildCapability('shared_room', 'degraded', 'Shared room fallback is active through snapshot storage. Live shared features are reduced.');
  }

  if (status.storageMode === 'alternate_room_schema') {
    return buildCapability('shared_room', 'available', 'Shared room access is active through the alternate shared schema.');
  }

  return buildCapability('shared_room', 'available', 'Shared room access is active through the primary tables.');
}

function resolveFileUploadCapability(status: ChatRoomStatus | null): RoomCapabilityDescriptor {
  if (!status) {
    return buildCapability('file_upload', 'unavailable', 'Upload availability is not proven yet because the room probe has not completed.');
  }

  if (status.storageMode === 'local_device_only') {
    return buildCapability('file_upload', 'degraded', 'Uploads work, but they are only saved on this device in local-only mode.');
  }

  if (status.storageMode === 'snapshot_storage') {
    return buildCapability('file_upload', 'degraded', 'Uploads are available, but snapshot fallback can limit shared attachment delivery.');
  }

  if (status.storageMode === 'alternate_room_schema') {
    return buildCapability('file_upload', 'available', 'Uploads are active through the alternate shared room path.');
  }

  return buildCapability('file_upload', 'available', 'Uploads are active through the primary shared room backend.');
}

function resolveAICapability(status: ChatRoomStatus | null, signals: ChatRoomRuntimeSignals): RoomCapabilityDescriptor {
  const aiState = getServiceState(signals.aiBackendHealth);

  if (aiState === 'available') {
    if (signals.aiResponseState === 'responding') {
      return buildCapability('ai_chat', 'available', 'AI backend is active and the assistant is generating a reply.');
    }

    if (signals.aiBackendSource === 'toolkit_fallback') {
      return buildCapability('ai_chat', 'available', 'AI replies are working through the active development fallback path. Remote endpoint proof has not been attached yet.');
    }

    return buildCapability('ai_chat', 'available', 'AI backend is active for this room. Assistant replies are available.');
  }

  if (aiState === 'degraded') {
    return buildCapability('ai_chat', 'degraded', 'AI backend is degraded. Assistant replies may be delayed or fail.');
  }

  if (status?.storageMode === 'local_device_only') {
    return buildCapability('ai_chat', 'unavailable', 'AI backend not active. This room currently supports local or human messaging only.');
  }

  return buildCapability('ai_chat', 'unavailable', 'AI backend not active. Assistant replies are currently unavailable.');
}

function resolveKnowledgeCapability(signals: ChatRoomRuntimeSignals): RoomCapabilityDescriptor {
  const state = getServiceState(signals.knowledgeBackendHealth);

  if (state === 'available') {
    return buildCapability('knowledge_answers', 'available', 'Knowledge retrieval is configured and active for this room.');
  }

  if (state === 'degraded') {
    return buildCapability('knowledge_answers', 'degraded', 'Knowledge retrieval is configured, but the backend is degraded right now.');
  }

  return buildCapability('knowledge_answers', 'unavailable', 'Knowledge retrieval not configured.');
}

function resolveOwnerCommandsCapability(signals: ChatRoomRuntimeSignals): RoomCapabilityDescriptor {
  const state = getServiceState(signals.ownerCommandAvailability);

  if (state === 'available') {
    return buildCapability('owner_commands', 'available', 'Owner command execution is wired and permission checks are passing.');
  }

  if (state === 'degraded') {
    return buildCapability('owner_commands', 'degraded', 'Owner commands are partially available, but backend execution is degraded.');
  }

  return buildCapability('owner_commands', 'unavailable', 'Owner command execution is not active in this room.');
}

function resolveCodeAwareCapability(signals: ChatRoomRuntimeSignals): RoomCapabilityDescriptor {
  const state = getServiceState(signals.codeAwareServiceAvailability);

  if (state === 'available') {
    return buildCapability('code_aware_support', 'available', 'Code-aware support is active through the implemented backend service.');
  }

  if (state === 'degraded') {
    return buildCapability('code_aware_support', 'degraded', 'Code-aware support is partially available, but the backend service is degraded.');
  }

  return buildCapability('code_aware_support', 'unavailable', 'Code-aware support is not active in this room.');
}

function buildSubtitle(status: ChatRoomStatus | null, capabilities: RoomCapabilityDescriptor[]): string {
  if (!status) {
    return 'Awaiting the first live room proof. Shared sync and operator features stay unclaimed until the probe completes.';
  }

  if (status.storageMode === 'local_device_only') {
    return 'Owner workspace with local message fallback. Shared sync and advanced AI features are currently limited.';
  }

  if (status.storageMode === 'snapshot_storage') {
    return 'Owner workspace in shared snapshot fallback. Messages sync in a reduced mode while live room features recover.';
  }

  const availableFeatures = capabilities
    .filter((capability) => capability.state === 'available')
    .map((capability) => SUBTITLE_FEATURE_LABELS[capability.id])
    .filter((item): item is string => item.trim().length > 0);
  const limitedFeatures = capabilities
    .filter((capability) => capability.state !== 'available')
    .filter((capability) => capability.id === 'ai_chat' || capability.id === 'knowledge_answers' || capability.id === 'owner_commands' || capability.id === 'code_aware_support')
    .map((capability) => SUBTITLE_FEATURE_LABELS[capability.id])
    .filter((item): item is string => item.trim().length > 0);
  const sharedLead = status.storageMode === 'alternate_room_schema'
    ? 'Owner-first shared room on the alternate backend path'
    : 'Owner-first shared room';

  if (availableFeatures.length === 0) {
    return `${sharedLead}. Shared messaging is active, but advanced AI features are currently limited.`;
  }

  const limitedSuffix = limitedFeatures.length > 0
    ? ` ${formatList(limitedFeatures)} ${limitedFeatures.length === 1 ? 'is' : 'are'} currently limited.`
    : '';

  return `${sharedLead} for ${formatList(availableFeatures)}.${limitedSuffix}`;
}

function buildSummary(status: ChatRoomStatus | null, capabilities: RoomCapabilityDescriptor[]): string {
  if (!status) {
    return 'Proof pending for room runtime.';
  }

  if (status.storageMode === 'local_device_only') {
    return 'Local-only room with no shared sync.';
  }

  const availableCount = capabilities.filter((capability) => capability.state === 'available').length;
  const degradedCount = capabilities.filter((capability) => capability.state === 'degraded').length;

  if (degradedCount > 0) {
    return `${availableCount} active capabilities, ${degradedCount} degraded.`;
  }

  return `${availableCount} active capabilities.`;
}

function buildAIIndicator(
  aiCapability: RoomCapabilityDescriptor,
  responseState: AIResponseState | undefined,
  signals: ChatRoomRuntimeSignals,
): RoomAIAvailabilityIndicator {
  if (responseState === 'responding' && aiCapability.state === 'available') {
    return {
      state: 'available',
      label: 'Assistant replying',
      detail: 'IVX Owner AI is generating a response now.',
      isLoading: true,
      testID: 'chat-room-ai-indicator',
    };
  }

  if (aiCapability.state === 'available') {
    return {
      state: 'available',
      label: 'AI replies ready',
      detail: signals.aiBackendSource === 'toolkit_fallback'
        ? 'Assistant replies are currently available through the active development fallback path.'
        : 'The AI response pipeline is active for this room.',
      isLoading: false,
      testID: 'chat-room-ai-indicator',
    };
  }

  if (aiCapability.state === 'degraded') {
    return {
      state: 'degraded',
      label: 'AI proof degraded',
      detail: 'Assistant replies are available with degraded proof and need a fresh remote verification cycle.',
      isLoading: false,
      testID: 'chat-room-ai-indicator',
    };
  }

  return {
    state: 'unavailable',
    label: 'AI replies off',
    detail: 'Normal messages send without an assistant reply until the AI backend is active.',
    isLoading: false,
    testID: 'chat-room-ai-indicator',
  };
}

function buildComposerNotes(
  status: ChatRoomStatus | null,
  aiCapability: RoomCapabilityDescriptor,
  aiIndicator: RoomAIAvailabilityIndicator,
): RoomComposerNote[] {
  const notes: RoomComposerNote[] = [];

  if (status?.storageMode === 'local_device_only') {
    notes.push({
      id: 'local-only',
      tone: 'warning',
      text: 'Messages send normally, but they are only saved on this device while local-only mode is active.',
      testID: 'chat-room-composer-note-local-only',
    });
  }

  if (aiIndicator.isLoading) {
    notes.push({
      id: 'ai-loading',
      tone: 'info',
      text: 'IVX Owner AI is generating a reply.',
      testID: 'chat-room-composer-note-ai-loading',
    });
    return notes;
  }

  if (aiCapability.state === 'unavailable') {
    notes.push({
      id: 'ai-off',
      tone: 'info',
      text: 'Messages send without an assistant reply while the AI backend is not active.',
      testID: 'chat-room-composer-note-ai-off',
    });
  }

  if (aiCapability.state === 'degraded') {
    notes.push({
      id: 'ai-degraded',
      tone: 'info',
      text: 'Messages still send, but assistant reply proof is degraded and needs a fresh verification cycle.',
      testID: 'chat-room-composer-note-ai-degraded',
    });
  }

  return notes;
}

export function getDefaultRoomRuntimeSignals(): ChatRoomRuntimeSignals {
  return {
    aiBackendHealth: 'inactive',
    aiBackendSource: 'unknown',
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
    resolveFileUploadCapability(status),
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
    composerNotes: buildComposerNotes(status, aiCapability, aiIndicator),
    aiIndicator,
    emptyStateText: 'Start with a message, image, video, or document. Capability states update from the live room backend.',
  };
}
