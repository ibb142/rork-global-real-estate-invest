import type { IVXOwnerAIConfigAudit } from '@/lib/ivx-supabase-client';
import type { ChatRoomStatus } from '@/src/modules/chat/types/chat';
import type { IVXRoomRuntimeSnapshot } from './ivxRoomRuntimeService';

export type IVXChatAuditSeverity = 'critical' | 'warning' | 'info';

export type IVXChatAuditCheck = {
  id: string;
  label: string;
  passed: boolean;
  severity: IVXChatAuditSeverity;
  proof: string;
  remediation: string;
};

export type IVXChatAuditReport = {
  liveReady: boolean;
  commandReady: boolean;
  remoteReplyVerified: boolean;
  sharedPersistenceReady: boolean;
  totalCount: number;
  passedCount: number;
  failedCount: number;
  criticalFailureCount: number;
  blockers: string[];
  summary: string;
  checks: IVXChatAuditCheck[];
};

export type IVXFunctionalityProofStatus = 'live' | 'pass' | 'fail';

export type IVXFunctionalityProofItem = {
  index: number;
  key: string;
  title: string;
  status: IVXFunctionalityProofStatus;
  detail: string;
  evidence: string;
};

type BuildIVXChatAuditInput = {
  openAccessEnabled: boolean;
  ownerAuthenticated: boolean;
  conversationReady: boolean;
  messageListReady: boolean;
  roomStatus: ChatRoomStatus | null;
  runtimeSnapshot: IVXRoomRuntimeSnapshot;
  aiIndicatorState: 'available' | 'degraded' | 'unavailable';
  aiIndicatorLabel: string;
  aiIndicatorDetail: string;
  ownerAIConfigAudit: IVXOwnerAIConfigAudit;
  activeEndpoint: string;
  lastFailureReason: string | null;
  sendFailures: number;
  replyFailures: number;
  fallbackSuccessCount: number;
  realtimeEventsObserved: number;
  realtimeSubscriptionState: string | null;
  messageCount: number;
  assistantMessageCount: number;
};

function createCheck(
  id: string,
  label: string,
  passed: boolean,
  severity: IVXChatAuditSeverity,
  proof: string,
  remediation: string,
): IVXChatAuditCheck {
  return {
    id,
    label,
    passed,
    severity,
    proof,
    remediation,
  };
}

function isSharedDelivery(roomStatus: ChatRoomStatus | null): boolean {
  return roomStatus?.deliveryMethod === 'primary_realtime'
    || roomStatus?.deliveryMethod === 'alternate_shared'
    || roomStatus?.deliveryMethod === 'primary_polling';
}

function isRemoteReplyVerified(runtimeSnapshot: IVXRoomRuntimeSnapshot): boolean {
  return runtimeSnapshot.provider.source === 'remote_api'
    && runtimeSnapshot.proofs.some((proof) => proof.sourceType === 'ai_probe' && proof.status === 'verified');
}

function mapCheckToFunctionalityStatus(
  report: IVXChatAuditReport,
  check: IVXChatAuditCheck,
): IVXFunctionalityProofStatus {
  if (!check.passed) {
    return 'fail';
  }

  if (check.id === 'remote-reply' && report.remoteReplyVerified) {
    return 'live';
  }

  if (check.severity === 'critical' && report.liveReady) {
    return 'live';
  }

  return 'pass';
}

export function buildIVXFunctionalityProofList(report: IVXChatAuditReport, runtimeSnapshot: IVXRoomRuntimeSnapshot): IVXFunctionalityProofItem[] {
  const mappedChecks: IVXFunctionalityProofItem[] = report.checks.map((check, index) => ({
    index: index + 1,
    key: check.id,
    title: check.label,
    status: mapCheckToFunctionalityStatus(report, check),
    detail: check.proof,
    evidence: check.remediation,
  }));

  const runtimeRows: IVXFunctionalityProofItem[] = [
    {
      index: mappedChecks.length + 1,
      key: 'runtime-room-status',
      title: 'Room runtime status',
      status: runtimeSnapshot.runtimeStatus === 'live' ? 'live' : runtimeSnapshot.runtimeStatus === 'degraded' ? 'pass' : 'fail',
      detail: `Runtime ${runtimeSnapshot.runtimeStatus} with stream ${runtimeSnapshot.streamStatus}.`,
      evidence: `Provider ${runtimeSnapshot.provider.source} via ${runtimeSnapshot.provider.endpoint ?? 'missing endpoint'}.`,
    },
    {
      index: mappedChecks.length + 2,
      key: 'runtime-fallback-state',
      title: 'Fallback cleared',
      status: runtimeSnapshot.provider.source === 'remote_api' ? 'live' : 'fail',
      detail: runtimeSnapshot.provider.source === 'remote_api'
        ? 'Replies are proving the deployed remote API path.'
        : 'Replies are still landing on fallback or the source is still unknown.',
      evidence: `Current source: ${runtimeSnapshot.provider.source}.`,
    },
    {
      index: mappedChecks.length + 3,
      key: 'runtime-degraded-state',
      title: 'Degraded state cleared',
      status: runtimeSnapshot.runtimeStatus === 'live' ? 'live' : runtimeSnapshot.runtimeStatus === 'degraded' ? 'fail' : 'fail',
      detail: runtimeSnapshot.runtimeStatus === 'live'
        ? 'The room is currently reporting a live runtime status.'
        : `The room is still ${runtimeSnapshot.runtimeStatus}.`,
      evidence: `Last verified at ${runtimeSnapshot.lastVerifiedAt ?? 'pending'}.`,
    },
    {
      index: mappedChecks.length + 4,
      key: 'runtime-latency',
      title: 'Latency proof',
      status: runtimeSnapshot.avgLatencyMs !== null ? 'pass' : 'fail',
      detail: runtimeSnapshot.avgLatencyMs !== null
        ? `Average latency ${runtimeSnapshot.avgLatencyMs} ms.`
        : 'No latency sample has been captured yet.',
      evidence: `Queue depth ${runtimeSnapshot.queueDepth}.`,
    },
    {
      index: mappedChecks.length + 5,
      key: 'runtime-proof-rail',
      title: 'Proof rail freshness',
      status: runtimeSnapshot.proofs.length > 0 ? 'pass' : 'fail',
      detail: runtimeSnapshot.proofs.length > 0
        ? `${runtimeSnapshot.proofs.length} proof row(s) are attached to this snapshot.`
        : 'No proof rows are attached yet.',
      evidence: runtimeSnapshot.proofs[0]?.summary ?? 'Attach a fresh probe/send cycle to populate proof rows.',
    },
  ];

  const proofItems = [...mappedChecks, ...runtimeRows];

  for (let index = proofItems.length + 1; index <= 200; index += 1) {
    proofItems.push({
      index,
      key: `unmapped-${index}`,
      title: `Unmapped proof slot ${index}`,
      status: 'fail',
      detail: 'No live instrumentation is wired for this functionality slot yet, so it cannot be honestly marked pass.',
      evidence: 'Add a runtime probe, persistence proof, or action verification for this slot before calling it live.',
    });
  }

  return proofItems;
}

export function buildIVXChatAuditReport(input: BuildIVXChatAuditInput): IVXChatAuditReport {
  const checks: IVXChatAuditCheck[] = [
    createCheck(
      'owner-access',
      'Owner access context',
      input.openAccessEnabled || input.ownerAuthenticated,
      'critical',
      input.openAccessEnabled
        ? 'Open-access mode provides a development owner context.'
        : input.ownerAuthenticated
          ? 'Authenticated owner context is present.'
          : 'No owner-authenticated context is available.',
      'Sign in with an owner account, or keep open-access enabled only for local development.',
    ),
    createCheck(
      'room-bootstrap',
      'Room bootstrap',
      input.conversationReady,
      'critical',
      input.conversationReady
        ? 'The IVX owner room conversation resolved successfully.'
        : 'The IVX owner room did not finish bootstrapping.',
      'Fix conversation bootstrap errors before testing send/reply.',
    ),
    createCheck(
      'message-query',
      'Message query path',
      input.messageListReady,
      'critical',
      input.messageListReady
        ? `${input.messageCount} message(s) are queryable from the current thread state.`
        : 'The thread query is failing or has not resolved.',
      'Fix listOwnerMessages/query invalidation and confirm the room can read persisted messages.',
    ),
    createCheck(
      'shared-storage',
      'Shared storage path',
      input.roomStatus?.storageMode !== 'local_device_only',
      'critical',
      input.roomStatus
        ? `Room storage mode: ${input.roomStatus.storageMode}.`
        : 'No room status proof is loaded yet.',
      'Provision shared chat tables in Supabase so the room does not fall back to local-device-only mode.',
    ),
    createCheck(
      'shared-visibility',
      'Shared room visibility',
      input.roomStatus?.visibility === 'shared',
      'critical',
      input.roomStatus
        ? `Room visibility: ${input.roomStatus.visibility}.`
        : 'Room visibility is not proven yet.',
      'Fix room schema/detection so the owner room resolves as shared instead of local-only.',
    ),
    createCheck(
      'delivery-path',
      'Delivery path',
      isSharedDelivery(input.roomStatus),
      'critical',
      input.roomStatus
        ? `Delivery method: ${input.roomStatus.deliveryMethod}.`
        : 'Delivery path has not been proven yet.',
      'Restore realtime or shared delivery so messages are not trapped in local-only mode.',
    ),
    createCheck(
      'routing-policy',
      'AI routing policy',
      !input.ownerAIConfigAudit.blocksRemoteRequests,
      'critical',
      !input.ownerAIConfigAudit.blocksRemoteRequests
        ? `Routing policy ${input.ownerAIConfigAudit.routingPolicy} allows remote owner AI requests.`
        : input.ownerAIConfigAudit.configurationError ?? 'Owner AI routing is blocked by configuration.',
      'Set EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL to the correct public owner AI base URL and avoid production builds pointing to dev-like hosts or implicit fallback URLs.',
    ),
    createCheck(
      'active-endpoint',
      'Active AI endpoint',
      input.activeEndpoint.trim().length > 0 && input.activeEndpoint !== 'unconfigured' && input.activeEndpoint !== 'blocked',
      'critical',
      input.activeEndpoint.trim().length > 0
        ? `Active endpoint: ${input.activeEndpoint}.`
        : 'No active owner AI endpoint is configured.',
      'Provide a public owner AI endpoint through EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL and verify DNS/public reachability from the client runtime.',
    ),
    createCheck(
      'assistant-runtime',
      'Assistant runtime health',
      input.aiIndicatorState !== 'unavailable',
      'critical',
      `${input.aiIndicatorLabel}. ${input.aiIndicatorDetail}`,
      'Restore the owner AI backend or toolkit fallback so assistant replies can be generated again.',
    ),
    createCheck(
      'remote-reply',
      'Remote AI reply proof',
      isRemoteReplyVerified(input.runtimeSnapshot),
      'warning',
      input.runtimeSnapshot.provider.source === 'remote_api'
        ? 'A verified remote AI probe exists for this room runtime.'
        : `Current provider source is ${input.runtimeSnapshot.provider.source}.`,
      'Get a successful probe/send cycle through the deployed owner AI endpoint to prove remote replies end to end.',
    ),
    createCheck(
      'command-layer',
      'Command layer',
      true,
      'info',
      'Slash commands are parsed client-side before optional operator/action execution.',
      'No action required. Keep structured command responses attached to live proof.',
    ),
    createCheck(
      'transcript-integrity',
      'Transcript integrity',
      input.runtimeSnapshot.transcriptIntegrity === 'verified',
      'critical',
      `Transcript integrity status: ${input.runtimeSnapshot.transcriptIntegrity}.`,
      'Resolve duplicate writes or out-of-order turns before treating chat state as healthy.',
    ),
    createCheck(
      'duplicate-writes',
      'Duplicate write protection',
      !input.runtimeSnapshot.duplicateWriteDetected,
      'critical',
      input.runtimeSnapshot.duplicateWriteDetected
        ? 'Duplicate transcript signatures were detected.'
        : 'No duplicate transcript signatures were detected in the loaded thread.',
      'Reconcile transcript persistence and realtime echo handling to prevent duplicate writes.',
    ),
    createCheck(
      'assistant-message',
      'Assistant message presence',
      input.assistantMessageCount > 0,
      'warning',
      input.assistantMessageCount > 0
        ? `${input.assistantMessageCount} assistant message(s) are present in the loaded thread.`
        : 'No persisted assistant reply is present in the loaded thread.',
      'Run a successful send -> AI reply -> persist cycle and verify the assistant row lands in chat storage.',
    ),
    createCheck(
      'realtime-observation',
      'Realtime observation',
      input.realtimeEventsObserved > 0 || input.realtimeSubscriptionState === 'subscribed',
      'warning',
      input.realtimeEventsObserved > 0
        ? `${input.realtimeEventsObserved} realtime insert event(s) were observed in this session.`
        : input.realtimeSubscriptionState === 'subscribed'
          ? 'Realtime channel subscribed successfully. Waiting for the next insert event.'
          : `Realtime subscription state: ${input.realtimeSubscriptionState ?? 'pending'}.`,
      'Open two clients or trigger a fresh insert to prove realtime delivery across the owner room.',
    ),
    createCheck(
      'send-failures',
      'Send failure budget',
      input.sendFailures === 0,
      'warning',
      input.sendFailures === 0
        ? 'No send failures were recorded in this session.'
        : `${input.sendFailures} send failure(s) were recorded in this session.`,
      'Fix insert/auth/storage failures before calling the room stable.',
    ),
    createCheck(
      'reply-failures',
      'Reply failure budget',
      input.replyFailures === 0,
      'warning',
      input.replyFailures === 0
        ? input.fallbackSuccessCount > 0
          ? `No true reply failures. ${input.fallbackSuccessCount} fallback reply(s) delivered successfully.`
          : 'No assistant reply failures recorded in this session.'
        : `${input.replyFailures} assistant reply failure(s) were recorded in this session. Last failure: ${input.lastFailureReason ?? 'unknown'}.`,
      'Fix owner AI routing/auth/network failures so reply failures stay at zero.',
    ),
    createCheck(
      'runtime-state',
      'Runtime status',
      input.runtimeSnapshot.runtimeStatus !== 'blocked',
      'critical',
      `Runtime status: ${input.runtimeSnapshot.runtimeStatus}. Stream: ${input.runtimeSnapshot.streamStatus}.`,
      'Clear blocked runtime causes before treating IVX chat as fully live.',
    ),
  ];

  const passedCount = checks.filter((check) => check.passed).length;
  const failedChecks = checks.filter((check) => !check.passed);
  const criticalFailureCount = failedChecks.filter((check) => check.severity === 'critical').length;
  const liveReady = [
    'room-bootstrap',
    'message-query',
    'shared-storage',
    'shared-visibility',
    'delivery-path',
    'routing-policy',
    'active-endpoint',
    'assistant-runtime',
    'transcript-integrity',
    'duplicate-writes',
    'runtime-state',
  ].every((id) => checks.find((check) => check.id === id)?.passed === true);
  const commandReady = checks.find((check) => check.id === 'command-layer')?.passed === true;
  const remoteReplyVerified = checks.find((check) => check.id === 'remote-reply')?.passed === true;
  const sharedPersistenceReady = checks.find((check) => check.id === 'shared-storage')?.passed === true
    && checks.find((check) => check.id === 'shared-visibility')?.passed === true;
  const blockers = failedChecks.map((check) => `${check.label}: ${check.proof}`);
  const summary = liveReady
    ? 'IVX chat is structurally live in the current runtime snapshot.'
    : criticalFailureCount > 0
      ? `${criticalFailureCount} critical blocker(s) still prevent IVX chat from being called 100% live.`
      : `${failedChecks.length} non-critical warning(s) remain before IVX chat is fully proven.`;

  return {
    liveReady,
    commandReady,
    remoteReplyVerified,
    sharedPersistenceReady,
    totalCount: checks.length,
    passedCount,
    failedCount: failedChecks.length,
    criticalFailureCount,
    blockers,
    summary,
    checks,
  };
}
