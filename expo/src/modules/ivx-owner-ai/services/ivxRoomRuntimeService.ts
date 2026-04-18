import type { IVXMessage } from '@/shared/ivx';
import type { ChatRoomStatus, ServiceRuntimeHealth } from '@/src/modules/chat/types/chat';

export type IVXProofStatus = 'verified' | 'warning' | 'blocked' | 'pending';
export type IVXProofSourceType = 'room_probe' | 'ai_probe' | 'message_send' | 'assistant_reply' | 'realtime_event' | 'message_receive' | 'transcript_audit';

export type IVXProofRecord = {
  id: string;
  title: string;
  status: IVXProofStatus;
  sourceType: IVXProofSourceType;
  sourceSignal: string;
  confidence: number;
  observedAt: string;
  expiresAt: string;
  dependencyBasis: string[];
  linkedEventIds: string[];
  userImpact: 'none' | 'low' | 'medium' | 'high';
  summary: string;
};

export type IVXRuntimeProviderState = {
  source: 'remote_api' | 'toolkit_fallback' | 'unknown';
  endpoint: string | null;
  deploymentMarker: string | null;
  model: string | null;
};

export type IVXRoomRuntimeSnapshot = {
  roomId: string;
  roomHealth: IVXProofStatus;
  runtimeStatus: 'live' | 'degraded' | 'blocked' | 'probing';
  streamStatus: 'idle' | 'responding' | 'unavailable';
  queueDepth: number;
  failedTurnCount: number;
  stuckTurnDetected: boolean;
  duplicateWriteDetected: boolean;
  transcriptIntegrity: IVXProofStatus;
  provider: IVXRuntimeProviderState;
  avgLatencyMs: number | null;
  lastVerifiedAt: string | null;
  proofs: IVXProofRecord[];
  notes: string[];
};

type DeliveryProofInput = {
  sendBranch: string;
  sendTitle: string;
  sendDetail: string;
  sendEvidence: string;
  sendObservedAt: string | null;
  receiveBranch: string;
  receiveTitle: string;
  receiveDetail: string;
  receiveEvidence: string;
  receiveObservedAt: string | null;
};

type BuildSnapshotInput = {
  roomId: string;
  roomStatus: ChatRoomStatus | null;
  roomProbeObservedAt: string | null;
  aiHealth: ServiceRuntimeHealth;
  aiProbeObservedAt: string | null;
  aiSource: 'remote_api' | 'toolkit_fallback' | 'unknown';
  aiEndpoint: string | null;
  deploymentMarker: string | null;
  model: string | null;
  messages: IVXMessage[];
  messageSendPending: boolean;
  aiReplyPending: boolean;
  attachmentPending: boolean;
  lastSendAt: string | null;
  lastReplyAt: string | null;
  sendFailures: number;
  replyFailures: number;
  fallbackSuccessCount: number;
  realtimeEventsObserved: number;
  realtimeSubscriptionState: string | null;
  latencySamplesMs: number[];
  deliveryProof: DeliveryProofInput;
};

const PROOF_TTL_MS = 2 * 60_000;
const STUCK_TURN_MS = 25_000;

function createId(prefix: string): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return `${prefix}-${cryptoRef.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function addTtl(timestamp: string): string {
  const base = new Date(timestamp).getTime();
  const resolved = Number.isFinite(base) ? base : Date.now();
  return new Date(resolved + PROOF_TTL_MS).toISOString();
}

function resolveDuplicateWrite(messages: IVXMessage[]): boolean {
  const seen = new Set<string>();
  for (const message of messages) {
    const normalizedBody = (typeof message.body === 'string' ? message.body : '').trim().toLowerCase();
    const signature = [
      message.senderRole,
      normalizedBody,
      message.attachmentUrl ?? '',
      new Date(message.createdAt).getTime(),
    ].join('::');
    if (seen.has(signature)) {
      return true;
    }
    seen.add(signature);
  }
  return false;
}

function resolveTranscriptIntegrity(messages: IVXMessage[], duplicateWriteDetected: boolean): IVXProofStatus {
  if (duplicateWriteDetected) {
    return 'blocked';
  }

  for (let index = 1; index < messages.length; index += 1) {
    const previousTime = new Date(messages[index - 1]?.createdAt ?? '').getTime();
    const currentTime = new Date(messages[index]?.createdAt ?? '').getTime();
    if (Number.isFinite(previousTime) && Number.isFinite(currentTime) && currentTime < previousTime) {
      return 'warning';
    }
  }

  return 'verified';
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

function toProofStatusFromRoom(status: ChatRoomStatus | null): IVXProofStatus {
  if (!status) {
    return 'pending';
  }

  if (status.storageMode === 'local_device_only') {
    return 'blocked';
  }

  if (status.storageMode === 'snapshot_storage' || status.deliveryMethod === 'primary_polling') {
    return 'warning';
  }

  return 'verified';
}

function toProofStatusFromAI(health: ServiceRuntimeHealth): IVXProofStatus {
  if (health === 'inactive') {
    return 'blocked';
  }

  if (health === 'degraded') {
    return 'warning';
  }

  return 'verified';
}

function buildProof(params: {
  title: string;
  status: IVXProofStatus;
  sourceType: IVXProofSourceType;
  sourceSignal: string;
  observedAt: string | null;
  confidence: number;
  dependencyBasis: string[];
  linkedEventIds?: string[];
  userImpact: 'none' | 'low' | 'medium' | 'high';
  summary: string;
}): IVXProofRecord {
  const observedAt = params.observedAt ?? new Date().toISOString();
  return {
    id: createId(params.sourceType),
    title: params.title,
    status: params.status,
    sourceType: params.sourceType,
    sourceSignal: params.sourceSignal,
    confidence: params.confidence,
    observedAt,
    expiresAt: addTtl(observedAt),
    dependencyBasis: params.dependencyBasis,
    linkedEventIds: params.linkedEventIds ?? [],
    userImpact: params.userImpact,
    summary: params.summary,
  };
}

export function buildIVXRoomRuntimeSnapshot(input: BuildSnapshotInput): IVXRoomRuntimeSnapshot {
  const duplicateWriteDetected = resolveDuplicateWrite(input.messages);
  const transcriptIntegrity = resolveTranscriptIntegrity(input.messages, duplicateWriteDetected);
  const avgLatencyMs = average(input.latencySamplesMs);
  const lastActivityAt = input.lastReplyAt ?? input.lastSendAt ?? input.aiProbeObservedAt ?? input.roomProbeObservedAt;
  const lastActivityTime = lastActivityAt ? new Date(lastActivityAt).getTime() : 0;
  const stuckTurnDetected = input.aiReplyPending && lastActivityTime > 0 && Date.now() - lastActivityTime > STUCK_TURN_MS;
  const queueDepth = Number(input.messageSendPending) + Number(input.attachmentPending);

  const roomProof = buildProof({
    title: 'Room transport proof',
    status: toProofStatusFromRoom(input.roomStatus),
    sourceType: 'room_probe',
    sourceSignal: input.roomStatus
      ? `${input.roomStatus.storageMode}:${input.roomStatus.deliveryMethod}`
      : 'room-probe-pending',
    observedAt: input.roomProbeObservedAt,
    confidence: input.roomStatus ? 0.94 : 0.25,
    dependencyBasis: ['chat_tables', 'conversation_bootstrap', 'delivery_path'],
    userImpact: input.roomStatus?.storageMode === 'local_device_only' ? 'high' : 'low',
    summary: input.roomStatus
      ? `Room storage ${input.roomStatus.storageMode} with delivery ${input.roomStatus.deliveryMethod}.`
      : 'Waiting for first successful room probe.',
  });

  const aiProof = buildProof({
    title: 'AI runtime proof',
    status: toProofStatusFromAI(input.aiHealth),
    sourceType: 'ai_probe',
    sourceSignal: `${input.aiSource}:${input.aiHealth}`,
    observedAt: input.aiProbeObservedAt,
    confidence: input.aiHealth === 'active' ? 0.96 : input.aiHealth === 'degraded' ? 0.68 : 0.2,
    dependencyBasis: ['owner_ai_endpoint', 'provider_runtime', 'auth_token'],
    userImpact: input.aiHealth === 'inactive' ? 'high' : input.aiHealth === 'degraded' ? 'medium' : 'low',
    summary: input.aiHealth === 'active'
      ? `AI replies are live through ${input.aiSource === 'remote_api' ? 'the deployed endpoint' : 'the active development fallback path'}.`
      : input.aiHealth === 'degraded'
        ? 'AI replies are available with degraded proof.'
        : 'AI runtime is not verified yet.',
  });

  const transcriptProof = buildProof({
    title: 'Transcript integrity proof',
    status: transcriptIntegrity,
    sourceType: 'transcript_audit',
    sourceSignal: duplicateWriteDetected ? 'duplicate-write-detected' : 'ordered-transcript-audit',
    observedAt: lastActivityAt,
    confidence: input.messages.length > 0 ? 0.93 : 0.52,
    dependencyBasis: ['message_order', 'message_ids', 'assistant_turns'],
    userImpact: duplicateWriteDetected ? 'high' : 'low',
    summary: duplicateWriteDetected
      ? 'Duplicate transcript writes were detected in the current thread snapshot.'
      : `Transcript audit passed across ${input.messages.length} message(s).`,
  });

  const deliveryProof = buildProof({
    title: 'Latest send branch proof',
    status: input.deliveryProof.sendBranch === 'not_observed'
      ? 'pending'
      : input.deliveryProof.sendBranch === 'remote_db_insert'
        ? 'verified'
        : input.deliveryProof.sendBranch === 'auth_session_failure'
          ? 'blocked'
          : 'warning',
    sourceType: 'message_send',
    sourceSignal: input.deliveryProof.sendBranch,
    observedAt: input.deliveryProof.sendObservedAt,
    confidence: input.deliveryProof.sendBranch === 'remote_db_insert' ? 0.97 : input.deliveryProof.sendBranch === 'not_observed' ? 0.3 : 0.86,
    dependencyBasis: ['message_insert', 'shared_room_sync', 'owner_auth'],
    userImpact: input.deliveryProof.sendBranch === 'remote_db_insert' ? 'low' : input.deliveryProof.sendBranch === 'auth_session_failure' ? 'high' : 'medium',
    summary: `${input.deliveryProof.sendTitle} · ${input.deliveryProof.sendDetail} · ${input.deliveryProof.sendEvidence}`,
  });

  const lastReplyMessage = [...input.messages].reverse().find((message) => message.senderRole === 'assistant') ?? null;
  const replyProof = buildProof({
    title: 'Latest assistant reply proof',
    status: lastReplyMessage ? 'verified' : input.aiReplyPending ? 'pending' : 'warning',
    sourceType: 'assistant_reply',
    sourceSignal: lastReplyMessage?.id ?? (input.aiReplyPending ? 'assistant-reply-pending' : 'assistant-reply-missing'),
    observedAt: lastReplyMessage?.createdAt ?? input.lastReplyAt,
    confidence: lastReplyMessage ? 0.95 : input.aiReplyPending ? 0.45 : 0.4,
    dependencyBasis: ['assistant_pipeline', 'transcript_write'],
    userImpact: lastReplyMessage ? 'low' : 'medium',
    summary: lastReplyMessage
      ? 'Assistant reply is present in the room transcript.'
      : input.aiReplyPending
        ? 'Assistant reply is still in progress.'
        : 'No verified assistant reply is present in the loaded transcript yet.',
  });

  const realtimeProofStatus: IVXProofStatus = input.realtimeEventsObserved > 0
    ? 'verified'
    : input.realtimeSubscriptionState === 'subscribed'
      ? 'verified'
      : input.realtimeSubscriptionState === 'channel_error' || input.realtimeSubscriptionState === 'timed_out' || input.realtimeSubscriptionState === 'closed'
        ? 'warning'
        : input.realtimeSubscriptionState === 'unavailable'
          ? 'blocked'
          : 'pending';
  const receiveProof = buildProof({
    title: 'Latest receive branch proof',
    status: input.deliveryProof.receiveBranch === 'not_observed'
      ? 'pending'
      : input.deliveryProof.receiveBranch === 'realtime_event'
        ? 'verified'
        : input.deliveryProof.receiveBranch === 'local_listener'
          ? 'warning'
          : 'pending',
    sourceType: 'message_receive',
    sourceSignal: input.deliveryProof.receiveBranch,
    observedAt: input.deliveryProof.receiveObservedAt,
    confidence: input.deliveryProof.receiveBranch === 'realtime_event' ? 0.98 : input.deliveryProof.receiveBranch === 'local_listener' ? 0.84 : 0.3,
    dependencyBasis: ['message_receive', 'supabase_realtime', 'local_fallback_listener'],
    userImpact: input.deliveryProof.receiveBranch === 'realtime_event' ? 'low' : input.deliveryProof.receiveBranch === 'local_listener' ? 'medium' : 'medium',
    summary: `${input.deliveryProof.receiveTitle} · ${input.deliveryProof.receiveDetail} · ${input.deliveryProof.receiveEvidence}`,
  });

  const realtimeProof = buildProof({
    title: 'Realtime link proof',
    status: realtimeProofStatus,
    sourceType: 'realtime_event',
    sourceSignal: input.realtimeSubscriptionState ?? 'realtime-pending',
    observedAt: input.lastReplyAt ?? input.lastSendAt ?? input.roomProbeObservedAt,
    confidence: input.realtimeEventsObserved > 0 ? 0.97 : input.realtimeSubscriptionState === 'subscribed' ? 0.86 : 0.38,
    dependencyBasis: ['supabase_realtime', 'shared_room_sync'],
    userImpact: realtimeProofStatus === 'verified' ? 'low' : realtimeProofStatus === 'pending' ? 'medium' : 'high',
    summary: input.realtimeEventsObserved > 0
      ? `${input.realtimeEventsObserved} realtime insert event(s) were observed in this session.`
      : input.realtimeSubscriptionState === 'subscribed'
        ? 'Realtime channel subscribed successfully. Waiting for a fresh insert to extend proof.'
        : input.realtimeSubscriptionState === 'unavailable'
          ? 'Realtime subscription is unavailable because shared chat tables are not ready.'
          : `Realtime subscription state: ${input.realtimeSubscriptionState ?? 'pending'}.`,
  });

  const proofs = [roomProof, aiProof, deliveryProof, transcriptProof, replyProof, receiveProof, realtimeProof];
  const blockedProof = proofs.find((proof) => proof.status === 'blocked') ?? null;
  const warningProof = proofs.find((proof) => proof.status === 'warning') ?? null;
  const pendingProof = proofs.find((proof) => proof.status === 'pending') ?? null;

  const runtimeStatus = blockedProof
    ? 'blocked'
    : warningProof
      ? 'degraded'
      : pendingProof
        ? 'probing'
        : 'live';

  const notes: string[] = [];
  if (input.aiSource === 'toolkit_fallback') {
    notes.push('Assistant replies are currently using the active development fallback path. Remote endpoint proof is not attached to this snapshot yet.');
  }
  if (duplicateWriteDetected) {
    notes.push('Duplicate transcript signatures were detected and need reconciliation.');
  }
  if (stuckTurnDetected) {
    notes.push('A reply has been pending longer than the stuck-turn threshold.');
  }
  if (input.replyFailures > 0) {
    notes.push(`${input.replyFailures} assistant reply failure(s) were observed in this session.`);
  }
  if (input.fallbackSuccessCount > 0) {
    notes.push(`${input.fallbackSuccessCount} fallback reply(s) delivered successfully in this session.`);
  }
  if (input.sendFailures > 0) {
    notes.push(`${input.sendFailures} send failure(s) were observed in this session.`);
  }
  if (realtimeProofStatus !== 'verified') {
    notes.push(`Realtime proof is ${realtimeProofStatus} with state ${input.realtimeSubscriptionState ?? 'pending'}.`);
  }

  return {
    roomId: input.roomId,
    roomHealth: roomProof.status,
    runtimeStatus,
    streamStatus: input.aiReplyPending ? 'responding' : input.aiHealth === 'active' ? 'idle' : 'unavailable',
    queueDepth,
    failedTurnCount: input.replyFailures,
    stuckTurnDetected,
    duplicateWriteDetected,
    transcriptIntegrity,
    provider: {
      source: input.aiSource,
      endpoint: input.aiEndpoint,
      deploymentMarker: input.deploymentMarker,
      model: input.model,
    },
    avgLatencyMs,
    lastVerifiedAt: proofs.reduce<string | null>((latest, proof) => {
      if (!latest) {
        return proof.observedAt;
      }
      return new Date(proof.observedAt).getTime() > new Date(latest).getTime() ? proof.observedAt : latest;
    }, null),
    proofs,
    notes,
  };
}
