import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MessageBubble } from '@/src/modules/chat/components/MessageBubble';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyRound, MessageCircle, Mic, Paperclip, Pin, Search, Send, ShieldCheck, Sparkles, Square, Terminal, X } from 'lucide-react-native';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import { IVX_OWNER_AI_PROFILE } from '@/constants/ivx-owner-ai';
import { useAuth } from '@/lib/auth-context';
import { resolveDevTestModeContext } from '@/lib/dev-test-mode';
import { getIVXOwnerAIConfigAudit, type IVXOwnerAIConfigAudit } from '@/lib/ivx-supabase-client';
import { isOpenAccessModeEnabled } from '@/lib/open-access';
import type { IVXMessage, IVXOwnerAIToolOutput, IVXUploadInput } from '@/shared/ivx';
import { assertCleanOwnerAIResponseText, isIVXServiceUnavailableDiagnostics } from '@/src/modules/ivx-owner-ai/services/ivxAIRequestService';
import {
  getActiveRuntimeSource,
  getRuntimeSourceLabel,
  getRuntimeStatusCopy,
  hasActiveStreamingState,
  hasRuntimeFailure,
  isPendingRequestState,
  normalizeRuntimeSource,
  shouldPreserveRequestScopedRuntime,
  shouldShowFallbackUI,
} from '@/src/modules/chat/chatRuntimeState';
import {
  buildIVXChatAuditReport,
  buildIVXFunctionalityProofList,
  buildIVXRoomRuntimeSnapshot,
  getIVXOwnerAIErrorDiagnostics,
  getLastIVXOwnerAIRuntimeProof,
  ivxAIRequestService,
  ivxChatService,
  ivxOwnerMemoryService,
  createIVXOwnerFileUnderstandingPrompt,
  ivxInboxService,
  detectIVXRoomStatus,
  invalidateIVXRoomProbeCache,
  recordIVXOwnerChatAuditEvent,
  type IVXChatAuditReport,
  type IVXFunctionalityProofItem,
  type IVXOwnerReceiveAudit,
  type IVXOwnerRealtimeSubscriptionAudit,
  type IVXOwnerSendAudit,
  type IVXProofRecord,
  type IVXRoomRuntimeSnapshot,
} from '@/src/modules/ivx-owner-ai/services';
import { isIVXLocalFirstChatEnabled } from '@/src/modules/ivx-owner-ai/services/ivxLocalFirstRuntime';
import { transcribeAudioRecording } from '@/src/modules/ivx-owner-ai/services/ivxMultimodalService';
import { executeReliably, type ReliabilityTrace } from '@/src/modules/chat/services/aiReliability';
import {
  isExplicitSensitiveActionConfirmation,
  resolveOwnerTrustContext,
  stripSensitiveActionConfirmationPrefix,
  type OwnerRequestClass,
} from '@/src/modules/ivx-owner-ai/services/ownerTrust';
import type { ChatMessage, ChatReplyContext, ChatRoomRuntimeSignals, ChatRoomStatus, ServiceRuntimeHealth } from '@/src/modules/chat/types/chat';
import { resolveRoomCapabilityState, type RoomCapabilityResolution } from '@/src/modules/chat/services/roomCapabilityResolver';
import { sanitizeUserFacingChatText } from '@/src/modules/chat/services/visibleTextSanitizer';
import {
  controlTowerAggregator,
  executeOperatorAction,
  getActionLabel,
  type CTDashboardSnapshot,
  type CTEvidenceRecord,
  type CTRiskAssessment,
  type CTOperatorActionRun,
  type CTSystemNode,
} from '@/lib/control-tower';
import { liveIntelligenceService } from '@/lib/control-tower/live-intelligence';
import { useLiveIntelligenceSnapshot } from '@/lib/control-tower/use-live-intelligence';
import { getIVXControlRoomStatus, type IVXControlRoomItem, type IVXControlRoomItemStatus, type IVXControlRoomStatus } from '@/src/modules/ivx-owner-ai/services/ivxControlRoomService';

type PickerAsset = {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
  file?: {
    arrayBuffer: () => Promise<ArrayBuffer>;
    name?: string;
    size?: number;
    type?: string;
  } | null;
};

type OwnerCommandResult = {
  command: string;
  args: string;
  response: string;
};

type QAProofItem = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

type OwnerPromptTemplate = {
  id: 'deal_review' | 'investor_reply' | 'document_summary';
  label: string;
  prompt: string;
  testID: string;
};

type ProbeMetadata = {
  observedAt: string | null;
  source: 'remote_api' | 'local_app_brain' | 'provider_fallback' | 'pending' | 'unknown';
  endpoint: string | null;
  deploymentMarker: string | null;
  lastFailureReason: string | null;
};

type RuntimeDebugSnapshot = {
  authMode: 'owner_session' | 'open_access_dev_bypass' | 'missing_owner_session';
  ownerBypassEnabled: boolean;
  conversationId: string | null;
  requestId: string | null;
  source: 'remote_api' | 'local_app_brain' | 'provider_fallback' | 'pending' | 'unknown';
  endpoint: string | null;
  deploymentMarker: string | null;
  requestStage: string;
  failureClass: string;
  httpStatus: string;
  responsePreview: string;
  failureDetail: string;
  lastAttemptAt: string | null;
  lastVerifiedAt: string | null;
  hasVisibleResponseText: boolean;
};

type PendingOwnerMessage = {
  clientId: string;
  text: string;
  createdAt: string;
  mode: 'send_only' | 'send_and_ai' | 'ai_only' | 'attachment';
  status: 'sending' | 'uploading' | 'uploaded' | 'failed';
  errorMessage?: string | null;
  upload?: IVXUploadInput | null;
  uploadProgress?: number | null;
  replyTo?: ChatReplyContext | null;
};

type OwnerConversationDraft = {
  text: string;
  attachmentDrafts: PendingOwnerMessage[];
  updatedAt: string;
};

function safeTrim(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value == null) {
    return '';
  }
  try {
    return String(value).trim();
  } catch {
    return '';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

const IVX_REPLY_CONTEXT_PREFIX = '[[ivx_reply_context:';
const IVX_REPLY_CONTEXT_SUFFIX = ']]';

const OWNER_PROMPT_TEMPLATES: readonly OwnerPromptTemplate[] = [
  {
    id: 'deal_review',
    label: 'Deal review',
    prompt: 'Review this real estate deal like a senior IVX analyst. Summarize upside, risks, missing diligence, required documents, investor suitability notes, and the exact next action list.',
    testID: 'ivx-owner-template-deal-review',
  },
  {
    id: 'investor_reply',
    label: 'Investor reply',
    prompt: 'Draft a compliant investor-support reply. Keep it clear, warm, non-promissory, and include what the investor should review before requesting allocation access.',
    testID: 'ivx-owner-template-investor-reply',
  },
  {
    id: 'document_summary',
    label: 'Doc summary',
    prompt: 'Summarize the attached document or pasted text. Extract the key financial terms, obligations, deadlines, risk disclosures, missing signatures, and follow-up questions.',
    testID: 'ivx-owner-template-document-summary',
  },
];

type ParsedReplyBody = {
  replyTo: ChatReplyContext | null;
  body: string;
};

function createTransientMessageId(prefix: string): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return `${prefix}-${cryptoRef.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

type BackendAuditSummary = {
  currentEnvironment: 'development' | 'production';
  routingPolicy: string;
  auditState: string;
  configSource: string;
  explicitProductionPin: string;
  configuredOwnerAIBaseUrl: string;
  activeBaseUrl: string;
  activeHost: string;
  activeEndpoint: string;
  directApiBaseUrl: string;
  directApiHost: string;
  ownerAiHealthUrl: string;
  ownerRoute53AuditUrl: string;
  ownerRoute53UpsertUrl: string;
  appApiHealthUrl: string;
  appApiRoute53AuditUrl: string;
  devFallbackBaseUrl: string;
  activeFallbackBaseUrl: string;
  selectionReason: string;
  fallbackUsed: string;
  whyFallbackSelected: string;
  wasFallbackUsed: string;
  productionGuard: string;
  productionGuardBlocked: boolean;
  failureMode: string;
  recommendedResolution: string;
  gracefulDegradationNote: string;
  workflowTrace: string[];
  mismatchWarnings: string[];
};

type OwnerAIProofStatus = {
  id: 'local_app_brain_ready' | 'remote_api_verified' | 'blocked_by_auth' | 'dev_fallback' | 'remote_api_unverified';
  tone: 'pass' | 'blocked' | 'warn' | 'pending';
  title: string;
  detail: string;
  evidence: string;
  testID: string;
};

type DeliveryBranchStatus = {
  branch: 'remote_db_insert' | 'local_fallback' | 'auth_session_failure' | 'not_observed';
  title: string;
  detail: string;
  evidence: string;
};

type ReceiveBranchStatus = {
  branch: 'realtime_event' | 'local_listener' | 'not_observed';
  title: string;
  detail: string;
  evidence: string;
};

type ResolvedSendBranch = 'primary_realtime' | 'alternate_shared' | 'snapshot_fallback' | 'local_only';

type SendBranchProofRow = {
  branch: ResolvedSendBranch | null;
  label: string;
  context: string;
};

function resolveSendBranch(
  deliveryBranch: DeliveryBranchStatus['branch'],
  runtimeSource: RuntimeDebugSnapshot['source'],
  httpStatus: string,
): SendBranchProofRow {
  if (deliveryBranch === 'not_observed') {
    return { branch: null, label: 'pending', context: 'no send observed' };
  }

  const statusFragment = httpStatus !== 'pending' && httpStatus !== 'none' ? ` · ${httpStatus}` : '';

  if (deliveryBranch === 'remote_db_insert') {
    if (runtimeSource === 'remote_api' || runtimeSource === 'local_app_brain') {
      return { branch: 'primary_realtime', label: 'primary_realtime', context: `assistant db insert${statusFragment}` };
    }
    if (runtimeSource === 'provider_fallback') {
      return { branch: 'alternate_shared', label: 'alternate_shared', context: `gateway db insert${statusFragment}` };
    }
    return { branch: 'primary_realtime', label: 'primary_realtime', context: `db insert · source ${runtimeSource}${statusFragment}` };
  }

  if (deliveryBranch === 'local_fallback') {
    return { branch: 'snapshot_fallback', label: 'snapshot_fallback', context: `local fallback path${statusFragment}` };
  }

  if (deliveryBranch === 'auth_session_failure') {
    return { branch: 'local_only', label: 'local_only', context: `auth/session unavailable${statusFragment}` };
  }

  return { branch: 'local_only', label: 'local_only', context: `unresolved branch${statusFragment}` };
}

function getRuntimeFallbackState(source: RuntimeDebugSnapshot['source']): string {
  if (source === 'remote_api' || source === 'local_app_brain') {
    return 'cleared';
  }
  if (source === 'provider_fallback') {
    return 'active';
  }
  return 'pending';
}

function getRuntimeDegradedState(status: IVXRoomRuntimeSnapshot['runtimeStatus']): string {
  if (status === 'live') {
    return 'cleared';
  }
  if (status === 'probing') {
    return 'pending';
  }
  return status;
}

function formatRuntimeTimestamp(value: string | null): string {
  if (!value) {
    return 'pending';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleTimeString();
}

function getRuntimeProofHeadline(runtime: RuntimeDebugSnapshot): { title: string; detail: string } {
  if (hasRuntimeFailure(runtime)) {
    return {
      title: 'Assistant path needs attention',
      detail: 'The last reply did not complete cleanly. Your message remains saved.',
    };
  }

  if (runtime.hasVisibleResponseText) {
    return {
      title: 'Assistant response captured',
      detail: 'Reply delivered cleanly.',
    };
  }

  if (isPendingRequestState(runtime)) {
    return {
      title: 'Message sent',
      detail: 'Reply will appear when ready.',
    };
  }

  return {
    title: 'Assistant ready',
    detail: 'Conversation is available.',
  };
}

type AuditInfoRowProps = {
  label: string;
  value: string;
  testID?: string;
};

const AuditInfoRow = React.memo(function AuditInfoRow({ label, value, testID }: AuditInfoRowProps) {
  const normalizedValue = safeTrim(value).length > 0 ? value : '—';

  return (
    <View style={styles.backendAuditRow} testID={testID}>
      <Text style={styles.backendAuditLabel}>{label}</Text>
      <Text style={styles.backendAuditValue}>{normalizedValue}</Text>
    </View>
  );
});

const IVX_OWNER_MESSAGES_QUERY_KEY = ['ivx-owner-ai', 'messages'] as const;
const IVX_OWNER_CONVERSATION_QUERY_KEY = ['ivx-owner-ai', 'conversation'] as const;
const IVX_ROOM_STATUS_QUERY_KEY = ['ivx-owner-ai', 'room-status'] as const;
const IVX_CONTROL_ROOM_STATUS_QUERY_KEY = ['ivx-owner-ai', 'control-room-status'] as const;
const CONTROL_ROOM_FALLBACK_ITEMS: IVXControlRoomItem[] = [
  { id: 'supabase-status', label: 'Supabase status', status: 'not_verified', detail: 'not verified' },
  { id: 'supabase-tables', label: 'Supabase tables', status: 'not_verified', detail: 'not verified' },
  { id: 'supabase-auth', label: 'Supabase auth', status: 'not_verified', detail: 'not verified' },
  { id: 'supabase-storage', label: 'Supabase storage', status: 'not_verified', detail: 'not verified' },
  { id: 'supabase-rls', label: 'Supabase RLS policies', status: 'not_verified', detail: 'not verified' },
  { id: 'message-persistence', label: 'Message persistence status', status: 'not_verified', detail: 'not verified' },
  { id: 'ai-response-persistence', label: 'AI response persistence status', status: 'not_verified', detail: 'not verified' },
  { id: 'backend-health', label: 'Backend API health', status: 'not_verified', detail: 'not verified' },
  { id: 'dns-tls', label: 'DNS/TLS status', status: 'not_verified', detail: 'not verified' },
  { id: 'github-repo', label: 'GitHub repo status', status: 'not_verified', detail: 'not verified' },
  { id: 'github-branch', label: 'Current branch', status: 'not_verified', detail: 'not verified' },
  { id: 'github-uncommitted', label: 'Uncommitted files', status: 'not_verified', detail: 'not verified' },
  { id: 'deployment-status', label: 'Deployment status', status: 'not_verified', detail: 'not verified' },
  { id: 'aws-iam', label: 'AWS/IAM status', status: 'not_verified', detail: 'not verified' },
  { id: 'env-checklist', label: 'Environment variable checklist', status: 'not_verified', detail: 'not verified' },
  { id: 'missing-secrets', label: 'Missing secrets checklist', status: 'not_verified', detail: 'not verified' },
  { id: 'logs-summary', label: 'Logs viewer/status summary', status: 'not_connected', detail: 'not connected' },
  { id: 'verification-tests', label: 'Run verification tests', status: 'not_verified', detail: 'not verified' },
  { id: 'fix-queue', label: 'Fix queue / pending blockers', status: 'not_verified', detail: 'not verified' },
  { id: 'export-setup', label: 'Export setup instructions', status: 'available', detail: 'README_IVX_DEPLOYMENT.md, ENVIRONMENT_VARIABLES.md, and IVX_AI_BRAIN_TOOLS.md' },
];
const IVX_OWNER_DRAFT_STORAGE_KEY = 'ivx-owner-ai:conversation-draft:v1';
const IVX_OWNER_PINNED_MESSAGES_STORAGE_KEY = 'ivx-owner-ai:pinned-messages:v1';
const AI_PROBE_INTERVAL_MS = 30_000;
const OWNER_COMMAND_PREFIX = '/';
const DEFAULT_OWNER_AI_CONFIG_AUDIT: IVXOwnerAIConfigAudit = getIVXOwnerAIConfigAudit();

function getControlRoomTone(status: IVXControlRoomItemStatus): 'pass' | 'warn' | 'error' | 'pending' {
  if (status === 'verified' || status === 'connected' || status === 'available') {
    return 'pass';
  }
  if (status === 'blocked' || status === 'missing_access' || status === 'not_connected') {
    return 'error';
  }
  return 'pending';
}

function getControlRoomStatusLabel(status: IVXControlRoomItemStatus): string {
  return status.replace(/_/g, ' ');
}

const OWNER_COMMANDS: Record<string, { description: string; handler: (args: string) => string }> = {
  help: {
    description: 'List available owner commands',
    handler: () => {
      const lines = Object.entries(OWNER_COMMANDS).map(([cmd, info]) => `/${cmd} — ${info.description}`);
      return `Available owner commands:\n${lines.join('\n')}`;
    },
  },
  status: {
    description: 'Show current room and AI backend status',
    handler: () => 'Room status: check the header card for live backend status, storage mode, delivery method, and AI health.',
  },
  clear: {
    description: 'Clear local message cache (does not delete server messages)',
    handler: () => 'Local cache cleared. Pull to refresh to reload from server.',
  },
  reconnect: {
    description: 'Force reconnect to the shared room backend',
    handler: () => 'Reconnect triggered. Room status will be re-detected.',
  },
  probe: {
    description: 'Run a health probe on the AI backend',
    handler: () => 'AI health probe triggered. Check the AI indicator for updated status.',
  },
  broadcast: {
    description: 'Send a broadcast notification to all participants',
    handler: (args: string) => {
      if (!safeTrim(args)) return 'Usage: /broadcast <message>';
      return `Broadcast queued: "${safeTrim(args)}". Participants will be notified on next sync.`;
    },
  },
  knowledge: {
    description: 'Ask a knowledge-base question',
    handler: () => 'Knowledge query routed to AI. Response will appear as an assistant reply.',
  },
  proof: {
    description: 'Show the latest live room proof summary',
    handler: () => 'Compiling the latest room proof summary.',
  },
  risk: {
    description: 'Show the highest live chat/runtime risks',
    handler: () => 'Compiling the current risk envelope for chat/runtime.',
  },
  incident: {
    description: 'Show the latest live incident summary',
    handler: () => 'Compiling the latest incident summary for the owner room.',
  },
  deps: {
    description: 'Inspect the active dependency chain for the owner room',
    handler: () => 'Compiling the current dependency chain for the owner room.',
  },
  heal: {
    description: 'Run an allowed intervention, e.g. /heal rerun-proof or /heal clear-stuck',
    handler: (args: string) => safeTrim(args) ? `Preparing allowed intervention: ${safeTrim(args)}` : 'Usage: /heal <rerun-proof|clear-stuck|provider-probe|shared-sync|inbox-sync|transcript>',
  },
  replay: {
    description: 'Replay the latest safe operator intervention',
    handler: () => 'Preparing the latest safe operator intervention for replay.',
  },
};

function parseOwnerCommand(text: string): OwnerCommandResult | null {
  const trimmed = safeTrim(text);
  if (!trimmed.startsWith(OWNER_COMMAND_PREFIX)) return null;
  const parts = trimmed.slice(OWNER_COMMAND_PREFIX.length).split(/\s+/);
  const command = (parts[0] ?? '').toLowerCase();
  const args = parts.slice(1).join(' ');
  if (!command) return null;
  const handler = OWNER_COMMANDS[command];
  if (!handler) return { command, args, response: `Unknown command: /${command}. Type /help for available commands.` };
  console.log('[IVXOwnerChatRoute] Owner command detected:', command, 'args:', args);
  return { command, args, response: handler.handler(args) };
}

function buildSensitiveActionConfirmationMessage(input: {
  normalizedText: string;
  requestClass: OwnerRequestClass;
  conversationAccessState: 'fallback_chat_only' | 'full_backend_execution';
  backendAdminVerified: boolean;
}): string {
  const confirmationTarget = input.normalizedText.startsWith('/')
    ? `/confirm ${input.normalizedText}`
    : `confirm ${input.normalizedText}`;
  const confirmationReason = input.requestClass.replace(/_/g, ' ');
  const backendState = input.backendAdminVerified ? 'backend_admin_verified' : 'backend_admin_unverified';

  return [
    'Result: confirmation required',
    `Explanation: Owner-room trust stays active for normal conversation, but ${confirmationReason} needs explicit confirmation before any admin execution is claimed.`,
    `Evidence: owner_room_authenticated · ${backendState} · ${input.conversationAccessState} · destructive_action_requires_confirmation`,
    'Affected dependencies: owner room trust → backend admin execution gate',
    'Operator action log: pending_confirmation',
    'Rollback: not required',
    `Linked proof cards: confirm with ${confirmationTarget}`,
  ].join('\n');
}

function buildFallbackChatOnlyExecutionMessage(input: {
  normalizedText: string;
  requestClass: OwnerRequestClass;
}): string {
  const requestedAction = input.normalizedText || 'the requested action';
  const actionReason = input.requestClass.replace(/_/g, ' ');

  return [
    'Result: blocked',
    `Explanation: Owner room trust is active, but ${actionReason} requires verified backend admin access. I can discuss or plan ${requestedAction}, but I will not claim backend/admin execution until verification is restored.`,
    'Evidence: owner_room_authenticated · backend_admin_unverified',
    'Affected dependencies: owner room trust → fallback runtime → backend admin execution gate',
    'Operator action log: chat_only_limit',
    'Rollback: not required',
    'Linked proof cards: wait for backend_admin_verified or continue with normal chat',
  ].join('\n');
}

function buildLocalSafeActionConfirmationMessage(input: {
  normalizedText: string;
  requestClass: OwnerRequestClass;
}): string {
  const requestedAction = safeTrim(input.normalizedText) || 'this action';
  const readableClass = input.requestClass.replace(/_/g, ' ');
  return [
    'Confirmation needed before I proceed.',
    `This looks like a ${readableClass} request: “${requestedAction}”.`,
    'Reply with “confirm” followed by the same request if you want me to continue. I can also help plan it safely first.',
  ].join('\n');
}

function getDeliveryBranchStatus(audit: IVXOwnerSendAudit | null): DeliveryBranchStatus {
  if (!audit) {
    return {
      branch: 'not_observed',
      title: 'send path pending proof',
      detail: 'No completed owner-room send has been captured in this session yet.',
      evidence: 'Send one message now to capture DB/local/auth branch evidence.',
    };
  }

  if (audit.transport === 'remote_db_insert') {
    return {
      branch: 'remote_db_insert',
      title: 'remote db insert',
      detail: 'The last owner-room write reached shared Supabase persistence.',
      evidence: `${audit.messageId} · ${audit.reason}`,
    };
  }

  if (audit.transport === 'auth_session_failure') {
    return {
      branch: 'auth_session_failure',
      title: 'auth/session failure',
      detail: 'The last owner-room write could not use shared persistence because owner auth/session was unavailable.',
      evidence: `${audit.messageId} · ${audit.reason}`,
    };
  }

  return {
    branch: 'local_fallback',
    title: 'local fallback',
    detail: 'The last owner-room write fell back to local-only persistence after the shared path failed.',
    evidence: `${audit.messageId} · ${audit.reason}`,
  };
}

function getReceiveBranchStatus(audit: IVXOwnerReceiveAudit | null): ReceiveBranchStatus {
  if (!audit) {
    return {
      branch: 'not_observed',
      title: 'receive path pending proof',
      detail: 'No owner-room receive event has been captured in this session yet.',
      evidence: 'Wait for a fresh inbound message or realtime echo to capture receive-branch proof.',
    };
  }

  if (audit.transport === 'realtime_event') {
    return {
      branch: 'realtime_event',
      title: 'realtime event',
      detail: 'The last inbound owner-room message was delivered through the realtime subscription.',
      evidence: `${audit.messageId} · ${audit.reason}`,
    };
  }

  return {
    branch: 'local_listener',
    title: 'local listener',
    detail: 'The last inbound owner-room message was delivered through the local fallback listener.',
    evidence: `${audit.messageId} · ${audit.reason}`,
  };
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMessageDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  return date.toISOString().slice(0, 10);
}

function formatMessageDateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recent';
  }

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const dateKey = formatMessageDateKey(value);
  if (dateKey === formatMessageDateKey(today.toISOString())) {
    return 'Today';
  }
  if (dateKey === formatMessageDateKey(yesterday.toISOString())) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

const DateSeparator = React.memo(function DateSeparator({ value }: { value: string }) {
  return (
    <View style={styles.dateSeparatorRow} testID={`ivx-owner-date-separator-${formatMessageDateKey(value)}`}>
      <View style={styles.dateSeparatorLine} />
      <Text style={styles.dateSeparatorText}>{formatMessageDateLabel(value)}</Text>
      <View style={styles.dateSeparatorLine} />
    </View>
  );
});

function isOwnMessage(message: IVXMessage, ownerId: string): boolean {
  if (!safeTrim(ownerId)) {
    return message.senderRole === 'owner';
  }

  return message.senderUserId === ownerId || message.senderRole === 'owner';
}

function getAttachmentLabel(message: IVXMessage): string {
  return message.attachmentName ?? message.attachmentUrl ?? 'Attachment';
}

function getAttachmentKindFromUpload(upload: IVXUploadInput): IVXMessage['attachmentKind'] {
  const mime = upload.type?.toLowerCase() ?? '';
  const name = upload.name.toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp|heic)$/.test(name)) return 'image';
  if (mime.startsWith('video/') || /\.(mp4|mov|webm|m4v)$/.test(name)) return 'video';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  return 'file';
}

function parseStructuredSystemMessage(body: string | null | undefined): Array<{ label: string; value: string }> | null {
  const lines = body?.split('\n').map((line) => line.trim()).filter((line) => line.length > 0) ?? [];
  const rows = lines
    .map((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex <= 0) {
        return null;
      }
      const label = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (!label || !value) {
        return null;
      }
      return { label, value };
    })
    .filter((row): row is { label: string; value: string } => row !== null);

  if (rows.length < 3) {
    return null;
  }

  return rows.some((row) => row.label.toLowerCase() === 'result') && rows.some((row) => row.label.toLowerCase() === 'evidence')
    ? rows
    : null;
}

function isInternalTranscriptMessage(message: IVXMessage): boolean {
  const body = safeTrim(message.body);
  if (message.senderRole === 'system') {
    return true;
  }

  if (message.senderRole !== 'assistant' || !body) {
    return false;
  }

  return parseStructuredSystemMessage(body) !== null || !sanitizeUserFacingChatText(body);
}

function encodeReplyBody(text: string, replyTo: ChatReplyContext | null): string {
  if (!replyTo) {
    return text;
  }

  try {
    const encoded = encodeURIComponent(JSON.stringify(replyTo));
    return `${IVX_REPLY_CONTEXT_PREFIX}${encoded}${IVX_REPLY_CONTEXT_SUFFIX}\n${text}`;
  } catch (error) {
    console.log('[IVXOwnerChatRoute] Failed to encode reply context:', error instanceof Error ? error.message : 'unknown');
    return text;
  }
}

function parseReplyBody(value: string | null | undefined): ParsedReplyBody {
  const body = value ?? '';
  if (!body.startsWith(IVX_REPLY_CONTEXT_PREFIX)) {
    return { replyTo: null, body };
  }

  const suffixIndex = body.indexOf(IVX_REPLY_CONTEXT_SUFFIX);
  if (suffixIndex < 0) {
    return { replyTo: null, body };
  }

  try {
    const encoded = body.slice(IVX_REPLY_CONTEXT_PREFIX.length, suffixIndex);
    const parsed = JSON.parse(decodeURIComponent(encoded)) as Partial<ChatReplyContext>;
    const replyTo: ChatReplyContext = {
      messageId: safeTrim(parsed.messageId),
      senderLabel: safeTrim(parsed.senderLabel) || 'Original message',
      previewText: safeTrim(parsed.previewText) || 'Message',
    };
    const visibleBody = body.slice(suffixIndex + IVX_REPLY_CONTEXT_SUFFIX.length).replace(/^\n/, '');
    return replyTo.messageId ? { replyTo, body: visibleBody } : { replyTo: null, body: visibleBody };
  } catch (error) {
    console.log('[IVXOwnerChatRoute] Failed to parse reply context:', error instanceof Error ? error.message : 'unknown');
    return { replyTo: null, body };
  }
}

function normalizeComposerText(value: unknown, fallback: unknown = ''): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof fallback === 'string') {
    return fallback;
  }

  if (typeof fallback === 'number' || typeof fallback === 'boolean') {
    return String(fallback);
  }

  if (value == null && fallback == null) {
    return '';
  }

  try {
    if (value != null) {
      return String(value);
    }

    if (fallback != null) {
      return String(fallback);
    }
  } catch (error) {
    console.log('[IVXOwnerChatRoute] Failed to normalize composer text:', error instanceof Error ? error.message : 'unknown');
  }

  return '';
}

export default function IVXOwnerChatRoute() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const flatListRef = useRef<FlatList<IVXMessage> | null>(null);
  const composerInputRef = useRef<TextInput | null>(null);
  const composerValueRef = useRef<string>('');
  const highlightedMessageTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingJumpMessageIdRef = useRef<string | null>(null);
  const suppressAutoScrollUntilRef = useRef<number>(0);
  const lastNonKeyboardRootHeightRef = useRef<number>(0);
  const insets = useSafeAreaInsets();
  const { user, userId } = useAuth();
  const [composerValue, setComposerValue] = useState<string>('');
  const [messageSearchQuery, setMessageSearchQuery] = useState<string>('');
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [selectedReplyContext, setSelectedReplyContext] = useState<ChatReplyContext | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [missingReplyMessageId, setMissingReplyMessageId] = useState<string | null>(null);
  const pinnedMessagesRestoreCompletedRef = useRef<boolean>(false);
  const [isPickingFile, setIsPickingFile] = useState<boolean>(false);
  const [composerHeight, setComposerHeight] = useState<number>(0);
  const [composerInputHeight, setComposerInputHeight] = useState<number>(44);
  const [keyboardInset, setKeyboardInset] = useState<number>(0);
  const [rootLayoutHeight, setRootLayoutHeight] = useState<number>(0);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(true);
  const isOpenAccessBuild = isOpenAccessModeEnabled();
  const localFirstChatMode = useMemo<boolean>(() => isIVXLocalFirstChatEnabled(), []);
  const ownerId = useMemo<string>(() => user?.id ?? userId ?? (isOpenAccessBuild || localFirstChatMode ? 'ivx-local-owner' : ''), [isOpenAccessBuild, localFirstChatMode, user?.id, userId]);
  const ownerLabel = useMemo<string>(() => safeTrim(user?.email) || (localFirstChatMode ? 'IVX Owner' : isOpenAccessBuild ? 'IVX Owner Dev' : 'IVX Owner'), [isOpenAccessBuild, localFirstChatMode, user?.email]);
  const devTestMode = useMemo(() => resolveDevTestModeContext({ userId: ownerId, email: user?.email }), [ownerId, user?.email]);
  const ownerAIConfigAudit = useMemo<IVXOwnerAIConfigAudit>(() => {
    try {
      return getIVXOwnerAIConfigAudit();
    } catch (error) {
      console.log('[IVXOwnerChatRoute] Owner AI config audit fallback used:', error instanceof Error ? error.message : 'unknown');
      return DEFAULT_OWNER_AI_CONFIG_AUDIT;
    }
  }, []);
  const liveSnapshot = useLiveIntelligenceSnapshot();
  const ownerSessionIdRef = useRef<string>(`ivx-owner-room-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  const roomStatusQuery = useQuery<ChatRoomStatus, Error>({
    queryKey: IVX_ROOM_STATUS_QUERY_KEY,
    queryFn: async () => {
      console.log('[IVXOwnerChatRoute] Detecting IVX room status via ivx_* tables');
      try {
        const status = await detectIVXRoomStatus();
        console.log('[IVXOwnerChatRoute] IVX room status result:', status.storageMode, status.deliveryMethod);
        setRoomProbeAt(new Date().toISOString());
        return status;
      } catch (error) {
        console.log('[IVXOwnerChatRoute] Room status detection failed:', error instanceof Error ? error.message : 'unknown');
        if (!isOpenAccessBuild) {
          throw error instanceof Error ? error : new Error('Unable to detect owner room status.');
        }

        setRoomProbeAt(new Date().toISOString());
        return {
          storageMode: 'local_device_only',
          visibility: 'local_only',
          deliveryMethod: 'local_only',
          warning: 'Open-access development mode is active. The owner room stays usable locally while live room detection recovers.',
        };
      }
    },
    staleTime: 25_000,
    refetchInterval: 60_000,
  });

  const ivxRoomStatus: ChatRoomStatus | null = roomStatusQuery.data ?? null;

  const messagesQuery = useQuery<IVXMessage[], Error>({
    queryKey: IVX_OWNER_MESSAGES_QUERY_KEY,
    queryFn: async () => {
      console.log('[IVXOwnerChatRoute] Loading owner messages');
      try {
        return await ivxChatService.listOwnerMessages();
      } catch (error) {
        console.log('[IVXOwnerChatRoute] Owner message load failed:', error instanceof Error ? error.message : 'unknown');
        if (!isOpenAccessBuild) {
          throw error instanceof Error ? error : new Error('Unable to load owner messages.');
        }

        return [];
      }
    },
  });
  const conversationQuery = useQuery({
    queryKey: IVX_OWNER_CONVERSATION_QUERY_KEY,
    queryFn: async () => {
      console.log('[IVXOwnerChatRoute] Bootstrapping owner conversation');
      try {
        return await ivxChatService.bootstrapOwnerConversation();
      } catch (error) {
        console.log('[IVXOwnerChatRoute] Owner conversation bootstrap failed:', error instanceof Error ? error.message : 'unknown');
        if (!isOpenAccessBuild) {
          throw error instanceof Error ? error : new Error('Unable to open the owner room.');
        }

        return {
          id: 'ivx-owner-room',
          slug: 'ivx-owner-room',
          title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
          subtitle: 'Open-access development room',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          lastMessageText: null,
          lastMessageAt: null,
        };
      }
    },
  });
  const messages = messagesQuery.data ?? [];
  const transcribeVoiceMutation = useMutation<string, Error, string>({
    mutationFn: async (uri) => {
      await recordIVXOwnerChatAuditEvent({
        action: 'voice_transcription',
        conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
        status: 'started',
        summary: 'Owner voice transcription started.',
        metadata: { platform: Platform.OS, sessionId: ownerSessionIdRef.current },
      });
      const result = await transcribeAudioRecording({
        uri,
        fileName: Platform.OS === 'web' ? 'ivx-owner-voice.webm' : 'ivx-owner-voice.m4a',
        mimeType: Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a',
      });
      return result.text;
    },
    onSuccess: (transcript) => {
      const normalizedTranscript = normalizeComposerText(transcript).trim();
      if (!normalizedTranscript) {
        Alert.alert('Voice not transcribed', 'No speech was detected in that recording.');
        void recordIVXOwnerChatAuditEvent({
          action: 'voice_transcription',
          conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
          status: 'failed',
          summary: 'Voice transcription completed without usable speech.',
          metadata: { sessionId: ownerSessionIdRef.current },
        });
        return;
      }

      const currentText = normalizeComposerText(composerValueRef.current).trim();
      const nextText = currentText ? `${currentText}\n${normalizedTranscript}` : normalizedTranscript;
      composerValueRef.current = nextText;
      setComposerValue(nextText);
      setComposerInputHeight(Math.min(Math.max(Math.ceil(nextText.length / 28) * 22 + 22, 44), 112));
      composerInputRef.current?.focus();
      void recordIVXOwnerChatAuditEvent({
        action: 'voice_transcription',
        conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
        status: 'success',
        summary: 'Voice transcription inserted into the IVX Owner AI composer.',
        metadata: { transcriptLength: normalizedTranscript.length, sessionId: ownerSessionIdRef.current },
      });
    },
    onError: (error) => {
      console.log('[IVXOwnerChatRoute] Voice transcription error:', error.message);
      void recordIVXOwnerChatAuditEvent({
        action: 'voice_transcription',
        conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
        status: 'failed',
        summary: 'Voice transcription failed.',
        metadata: { error: error.message, sessionId: ownerSessionIdRef.current },
      });
      Alert.alert('Voice transcription unavailable', error.message || 'We could not transcribe that recording. Please try again.');
    },
  });
  const ownerRoomAuthenticated = useMemo<boolean>(() => {
    if (devTestMode.testModeActive) {
      return true;
    }
    const normalizedConversationId = safeTrim(conversationQuery.data?.id);
    const normalizedConversationSlug = safeTrim(conversationQuery.data?.slug);
    return localFirstChatMode
      || isOpenAccessBuild
      || !!user
      || !!userId
      || normalizedConversationId === IVX_OWNER_AI_PROFILE.sharedRoom.id
      || normalizedConversationSlug === IVX_OWNER_AI_PROFILE.sharedRoom.slug;
  }, [conversationQuery.data?.id, conversationQuery.data?.slug, devTestMode.testModeActive, isOpenAccessBuild, localFirstChatMode, user, userId]);
  const controlRoomQuery = useQuery<IVXControlRoomStatus, Error>({
    queryKey: IVX_CONTROL_ROOM_STATUS_QUERY_KEY,
    queryFn: getIVXControlRoomStatus,
    enabled: ownerRoomAuthenticated,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const [transientAssistantMessages, setTransientAssistantMessages] = useState<IVXMessage[]>([]);
  const [pendingOwnerMessages, setPendingOwnerMessages] = useState<PendingOwnerMessage[]>([]);
  const draftRestoreCompletedRef = useRef<boolean>(false);
  const uploadProgressTimersRef = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const normalizedComposerValue = useMemo<string>(() => normalizeComposerText(composerValue), [composerValue]);
  const composerHasText = safeTrim(normalizedComposerValue).length > 0;
  const allMessages = useMemo<IVXMessage[]>(() => {
    const visiblePersistentMessages = messages.filter((message) => !isInternalTranscriptMessage(message));
    const persistentAssistantBodies = new Set(
      visiblePersistentMessages
        .filter((message) => message.senderRole === 'assistant')
        .map((message) => safeTrim(message.body))
        .filter((body) => body.length > 0),
    );
    const visibleTransientAssistantMessages = transientAssistantMessages.filter((message) => {
      if (isInternalTranscriptMessage(message)) {
        return false;
      }

      if (message.senderRole !== 'assistant') {
        return true;
      }

      return safeTrim(message.body).length > 0;
    });
    const transientIds = new Set(visibleTransientAssistantMessages.map((message) => message.id));
    const deduped = new Map<string, IVXMessage>();

    for (const pendingMessage of pendingOwnerMessages) {
      const normalizedPendingText = safeTrim(pendingMessage.text);
      const pendingUpload = pendingMessage.upload ?? null;
      if (!normalizedPendingText && !pendingUpload) {
        continue;
      }

      const uploadProgress = typeof pendingMessage.uploadProgress === 'number'
        ? Math.max(0, Math.min(100, Math.round(pendingMessage.uploadProgress)))
        : null;
      const uploadStatusText = pendingMessage.mode === 'attachment' && pendingMessage.status !== 'failed'
        ? pendingMessage.status === 'uploaded'
          ? `Uploaded ${pendingUpload?.name ?? 'attachment'} successfully`
          : uploadProgress != null
            ? `Uploading ${pendingUpload?.name ?? 'attachment'} • ${uploadProgress}%`
            : `Preparing ${pendingUpload?.name ?? 'attachment'}...`
        : pendingMessage.errorMessage ?? normalizedPendingText;

      deduped.set(pendingMessage.clientId, {
        id: pendingMessage.clientId,
        conversationId: conversationQuery.data?.id ?? 'ivx-owner-room',
        senderUserId: ownerId || null,
        senderRole: 'owner',
        senderLabel: ownerLabel,
        body: pendingMessage.status === 'failed' ? (pendingMessage.errorMessage ?? pendingMessage.text) : (pendingMessage.mode === 'attachment' ? uploadStatusText : pendingMessage.text),
        attachmentUrl: pendingUpload?.uri ?? null,
        attachmentName: pendingUpload?.name ?? null,
        attachmentMime: pendingUpload?.type ?? null,
        attachmentSize: pendingUpload?.size ?? null,
        attachmentKind: pendingUpload ? getAttachmentKindFromUpload(pendingUpload) : 'text',
        createdAt: pendingMessage.createdAt,
        updatedAt: pendingMessage.createdAt,
        sendStatus: pendingMessage.status,
        replyTo: pendingMessage.replyTo ?? null,
      } as IVXMessage & { sendStatus: PendingOwnerMessage['status']; replyTo?: ChatReplyContext | null });
    }

    for (const message of [...visiblePersistentMessages, ...visibleTransientAssistantMessages]) {
      const normalizedBody = safeTrim(message.body);
      const isDuplicateTransientAssistant = message.senderRole === 'assistant'
        && transientIds.has(message.id)
        && normalizedBody.length > 0
        && persistentAssistantBodies.has(normalizedBody);

      if (isDuplicateTransientAssistant) {
        continue;
      }

      deduped.set(message.id, message);
    }
    return Array.from(deduped.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [conversationQuery.data?.id, messages, ownerId, ownerLabel, pendingOwnerMessages, transientAssistantMessages]);
  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const rawDraft = await AsyncStorage.getItem(IVX_OWNER_DRAFT_STORAGE_KEY);
        if (!mounted) {
          return;
        }

        if (!rawDraft) {
          draftRestoreCompletedRef.current = true;
          return;
        }

        const parsed = JSON.parse(rawDraft) as Partial<OwnerConversationDraft>;
        const restoredText = typeof parsed.text === 'string' ? parsed.text : '';
        const restoredAttachmentDrafts = Array.isArray(parsed.attachmentDrafts)
          ? parsed.attachmentDrafts.filter((message): message is PendingOwnerMessage => {
            const candidate = message as Partial<PendingOwnerMessage>;
            return candidate.mode === 'attachment'
              && candidate.status === 'failed'
              && typeof candidate.clientId === 'string'
              && typeof candidate.createdAt === 'string'
              && typeof candidate.text === 'string'
              && typeof candidate.upload?.uri === 'string'
              && typeof candidate.upload?.name === 'string';
          })
          : [];

        composerValueRef.current = restoredText;
        setComposerValue(restoredText);
        if (restoredText.length > 0) {
          setComposerInputHeight(Math.min(Math.max(Math.ceil(restoredText.length / 28) * 22 + 22, 44), 112));
        }
        if (restoredAttachmentDrafts.length > 0) {
          setPendingOwnerMessages((current) => {
            const existingIds = new Set(current.map((message) => message.clientId));
            return [...restoredAttachmentDrafts.filter((message) => !existingIds.has(message.clientId)), ...current];
          });
        }
        draftRestoreCompletedRef.current = true;
        console.log('[IVXOwnerChatRoute] Restored owner draft:', { textLength: restoredText.length, attachmentDraftCount: restoredAttachmentDrafts.length });
      } catch (error) {
        draftRestoreCompletedRef.current = true;
        console.log('[IVXOwnerChatRoute] Failed to restore owner draft:', error instanceof Error ? error.message : 'unknown');
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!draftRestoreCompletedRef.current) {
      return;
    }

    const draftText = composerValueRef.current;
    const attachmentDrafts = pendingOwnerMessages.filter((message) => message.mode === 'attachment' && message.status === 'failed' && message.upload);
    const hasDraft = safeTrim(draftText).length > 0 || attachmentDrafts.length > 0;
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          if (!hasDraft) {
            await AsyncStorage.removeItem(IVX_OWNER_DRAFT_STORAGE_KEY);
            console.log('[IVXOwnerChatRoute] Cleared owner draft storage');
            return;
          }

          const draft: OwnerConversationDraft = {
            text: draftText,
            attachmentDrafts,
            updatedAt: new Date().toISOString(),
          };
          await AsyncStorage.setItem(IVX_OWNER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
          console.log('[IVXOwnerChatRoute] Saved owner draft:', { textLength: draftText.length, attachmentDraftCount: attachmentDrafts.length });
        } catch (error) {
          console.log('[IVXOwnerChatRoute] Failed to persist owner draft:', error instanceof Error ? error.message : 'unknown');
        }
      })();
    }, 250);

    return () => clearTimeout(timeout);
  }, [composerValue, pendingOwnerMessages]);

  const normalizedMessageSearchQuery = useMemo<string>(() => safeTrim(messageSearchQuery).toLowerCase(), [messageSearchQuery]);
  const displayedMessages = useMemo<IVXMessage[]>(() => {
    if (!normalizedMessageSearchQuery) {
      return allMessages;
    }

    return allMessages.filter((message) => safeTrim(message.body).toLowerCase().includes(normalizedMessageSearchQuery));
  }, [allMessages, normalizedMessageSearchQuery]);
  const searchActive = normalizedMessageSearchQuery.length > 0;
  const pinnedMessageIdSet = useMemo<Set<string>>(() => new Set(pinnedMessageIds), [pinnedMessageIds]);
  const pinnedMessages = useMemo<IVXMessage[]>(() => {
    if (pinnedMessageIds.length === 0) {
      return [];
    }

    return allMessages
      .filter((message) => pinnedMessageIdSet.has(message.id) && !isInternalTranscriptMessage(message))
      .sort((a, b) => pinnedMessageIds.indexOf(a.id) - pinnedMessageIds.indexOf(b.id));
  }, [allMessages, pinnedMessageIdSet, pinnedMessageIds]);

  useEffect(() => {
    let mounted = true;

    void AsyncStorage.getItem(IVX_OWNER_PINNED_MESSAGES_STORAGE_KEY)
      .then((rawPinnedIds) => {
        if (!mounted) {
          return;
        }

        if (!rawPinnedIds) {
          pinnedMessagesRestoreCompletedRef.current = true;
          return;
        }

        const parsed = JSON.parse(rawPinnedIds) as unknown;
        if (Array.isArray(parsed)) {
          const restoredIds = parsed
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
            .filter((value, index, values) => values.indexOf(value) === index);
          setPinnedMessageIds(restoredIds);
          console.log('[IVXOwnerChatRoute] Restored pinned messages:', restoredIds.length);
        }
        pinnedMessagesRestoreCompletedRef.current = true;
      })
      .catch((error) => {
        pinnedMessagesRestoreCompletedRef.current = true;
        console.log('[IVXOwnerChatRoute] Failed to restore pinned messages:', error instanceof Error ? error.message : 'unknown');
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!pinnedMessagesRestoreCompletedRef.current) {
      return;
    }

    void AsyncStorage.setItem(IVX_OWNER_PINNED_MESSAGES_STORAGE_KEY, JSON.stringify(pinnedMessageIds)).catch((error) => {
      console.log('[IVXOwnerChatRoute] Failed to persist pinned messages:', error instanceof Error ? error.message : 'unknown');
    });
  }, [pinnedMessageIds]);

  useEffect(() => {
    if (pinnedMessageIds.length === 0 || allMessages.length === 0) {
      return;
    }

    const availableIds = new Set(allMessages.map((message) => message.id));
    setPinnedMessageIds((current) => current.filter((messageId) => availableIds.has(messageId)));
  }, [allMessages, pinnedMessageIds.length]);

  useEffect(() => {
    let mounted = true;
    let unsubscribe = () => {};

    void (async () => {
      try {
        const nextUnsubscribe = await ivxChatService.subscribeToOwnerMessages((incomingMessage) => {
          if (!mounted) {
            return;
          }

          queryClient.setQueryData<IVXMessage[]>(IVX_OWNER_MESSAGES_QUERY_KEY, (currentMessages) => {
            const nextMessages = currentMessages ?? [];
            if (nextMessages.some((message) => message.id === incomingMessage.id)) {
              return nextMessages;
            }
            setRealtimeEventsObserved((currentCount) => currentCount + 1);
            return [...nextMessages, incomingMessage];
          });
        }, (status) => {
          if (!mounted) {
            return;
          }
          console.log('[IVXOwnerChatRoute] Realtime subscription state:', status);
          setRealtimeSubscriptionState(status);
        });

        if (!mounted) {
          nextUnsubscribe();
          return;
        }

        unsubscribe = nextUnsubscribe;
      } catch (error) {
        console.log('[IVXOwnerChatRoute] Realtime subscription failed:', error instanceof Error ? error.message : 'unknown');
      }
    })();

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [queryClient]);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }

    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });

    if (!localFirstChatMode) {
      void ivxInboxService.markOwnerConversationAsRead(conversationQuery.data?.id).catch((error: unknown) => {
        console.log('[IVXOwnerChatRoute] Mark read failed:', error instanceof Error ? error.message : 'unknown');
      });
    }
  }, [conversationQuery.data?.id, localFirstChatMode, messages.length]);

  const persistSupportMessage = useCallback(async (text: string, role: 'system' | 'assistant' = 'system') => {
    const trimmedText = safeTrim(text);
    if (!trimmedText) {
      return;
    }

    await ivxChatService.sendOwnerSupportMessage({
      body: trimmedText,
      senderRole: role,
      senderLabel: role === 'assistant' ? IVX_OWNER_AI_PROFILE.name : 'System',
      attachmentKind: role === 'assistant' ? 'text' : 'system',
      requireRemote: false,
    });
    console.log('[IVXOwnerChatRoute] Support message persisted:', role, trimmedText.slice(0, 60));
  }, []);

  const [aiBackendReachable, setAiBackendReachable] = useState<boolean>(false);
  const [aiHealthDetail, setAiHealthDetail] = useState<ServiceRuntimeHealth>('inactive');
  const [messageSendPending, setMessageSendPending] = useState<boolean>(false);
  const [aiReplyPending, setAiReplyPending] = useState<boolean>(false);
  const [ownerCommandsActive, setOwnerCommandsActive] = useState<boolean>(false);
  const [knowledgeActive, setKnowledgeActive] = useState<boolean>(false);
  const [codeAwareActive, setCodeAwareActive] = useState<boolean>(false);
  const [fileUploadActive, setFileUploadActive] = useState<boolean>(false);
  const [roomProbeAt, setRoomProbeAt] = useState<string | null>(null);
  const [aiProbeMetadata, setAiProbeMetadata] = useState<ProbeMetadata>({
    observedAt: null,
    source: 'unknown',
    endpoint: null,
    deploymentMarker: null,
    lastFailureReason: null,
  });
  const [lastToolOutputs, setLastToolOutputs] = useState<IVXOwnerAIToolOutput[]>([]);
  const [runtimeDebugSnapshot, setRuntimeDebugSnapshot] = useState<RuntimeDebugSnapshot>({
    authMode: isOpenAccessBuild ? 'open_access_dev_bypass' : (user || userId ? 'owner_session' : 'missing_owner_session'),
    ownerBypassEnabled: isOpenAccessBuild,
    conversationId: null,
    requestId: null,
    source: 'unknown',
    endpoint: ownerAIConfigAudit.activeEndpoint ?? null,
    deploymentMarker: null,
    requestStage: 'idle',
    failureClass: 'none',
    httpStatus: 'pending',
    responsePreview: 'pending',
    failureDetail: 'No live send attempted yet.',
    lastAttemptAt: null,
    lastVerifiedAt: null,
    hasVisibleResponseText: false,
  });
  const [lastSendAt, setLastSendAt] = useState<string | null>(null);
  const [lastReplyAt, setLastReplyAt] = useState<string | null>(null);
  const [sendFailures, setSendFailures] = useState<number>(0);
  const [replyFailures, setReplyFailures] = useState<number>(0);
  const [fallbackSuccessCount, setFallbackSuccessCount] = useState<number>(0);
  const [latencySamplesMs, setLatencySamplesMs] = useState<number[]>([]);
  const [lastReliabilityTrace, setLastReliabilityTrace] = useState<ReliabilityTrace | null>(null);
  const [realtimeEventsObserved, setRealtimeEventsObserved] = useState<number>(0);
  const [realtimeSubscriptionState, setRealtimeSubscriptionState] = useState<string | null>(null);
  const [nerveSnapshot, setNerveSnapshot] = useState<CTDashboardSnapshot | null>(null);
  const probeRetryCount = useRef<number>(0);
  const nerveSnapshotRef = useRef<CTDashboardSnapshot | null>(null);
  const roomRuntimeRef = useRef<IVXRoomRuntimeSnapshot | null>(null);
  const auditReportRef = useRef<IVXChatAuditReport | null>(null);
  const MAX_PROBE_RETRIES = 2;
  const PROBE_RETRY_DELAY_MS = 3000;
  const aiReachableRef = useRef<boolean>(false);
  const aiHealthRef = useRef<ServiceRuntimeHealth>('inactive');
  const ownerAIRoutingBlocked = ownerAIConfigAudit.blocksRemoteRequests || !ownerAIConfigAudit.activeEndpoint;
  const effectiveAiBackendReachable = aiBackendReachable;
  const effectiveAiHealthDetail: ServiceRuntimeHealth = aiHealthDetail;
  const trustRuntimeState = useMemo(() => ({
    source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
    requestStage: runtimeDebugSnapshot.requestStage,
    failureClass: runtimeDebugSnapshot.failureClass,
    isFallback: runtimeDebugSnapshot.source === 'provider_fallback',
    isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
    hasVisibleResponseText: runtimeDebugSnapshot.hasVisibleResponseText,
  }), [runtimeDebugSnapshot]);
  const fallbackChatOnlyActive = useMemo<boolean>(() => {
    if (devTestMode.testModeActive) {
      return false;
    }
    return shouldShowFallbackUI(trustRuntimeState);
  }, [devTestMode.testModeActive, trustRuntimeState]);
  const backendAdminVerified = useMemo<boolean>(() => {
    if (devTestMode.testModeActive) {
      return true;
    }
    if (!ownerRoomAuthenticated) {
      return false;
    }

    if (fallbackChatOnlyActive) {
      return false;
    }

    return trustRuntimeState.source === 'remote_api'
      || trustRuntimeState.source === 'local_app_brain'
      || aiProbeMetadata.source === 'remote_api'
      || aiProbeMetadata.source === 'local_app_brain'
      || (effectiveAiBackendReachable && effectiveAiHealthDetail === 'active');
  }, [aiProbeMetadata.source, devTestMode.testModeActive, effectiveAiBackendReachable, effectiveAiHealthDetail, fallbackChatOnlyActive, ownerRoomAuthenticated, trustRuntimeState.source]);
  const currentOwnerTrust = useMemo(() => resolveOwnerTrustContext({
    messageText: normalizedComposerValue,
    ownerRoomAuthenticated,
    backendAdminVerified,
    fallbackModeActive: fallbackChatOnlyActive,
    devTestModeActive: devTestMode.testModeActive,
  }), [backendAdminVerified, devTestMode.testModeActive, fallbackChatOnlyActive, normalizedComposerValue, ownerRoomAuthenticated]);

  useEffect(() => {
    aiReachableRef.current = effectiveAiBackendReachable;
  }, [effectiveAiBackendReachable]);

  useEffect(() => {
    aiHealthRef.current = effectiveAiHealthDetail;
  }, [effectiveAiHealthDetail]);

  useEffect(() => {
    nerveSnapshotRef.current = nerveSnapshot;
  }, [nerveSnapshot]);

  useEffect(() => {
    setRuntimeDebugSnapshot((current) => {
      const shouldPreserveActiveRequest = shouldPreserveRequestScopedRuntime(current);
      return {
        ...current,
        authMode: isOpenAccessBuild ? 'open_access_dev_bypass' : (user || userId ? 'owner_session' : 'missing_owner_session'),
        ownerBypassEnabled: isOpenAccessBuild,
        conversationId: conversationQuery.data?.id ?? null,
        endpoint: aiProbeMetadata.endpoint ?? ownerAIConfigAudit.activeEndpoint ?? current.endpoint,
        deploymentMarker: aiProbeMetadata.deploymentMarker ?? current.deploymentMarker,
        source: shouldPreserveActiveRequest ? current.source : 'unknown',
      };
    });
  }, [aiProbeMetadata.deploymentMarker, aiProbeMetadata.endpoint, aiProbeMetadata.source, conversationQuery.data?.id, isOpenAccessBuild, ownerAIConfigAudit.activeEndpoint, user, userId]);

  useEffect(() => {
    if (ownerAIRoutingBlocked) {
      console.error('[IVXOwnerChatRoute] Owner AI routing blocked by environment policy:', {
        environment: ownerAIConfigAudit.currentEnvironment,
        routingPolicy: ownerAIConfigAudit.routingPolicy,
        configuredBaseUrl: ownerAIConfigAudit.configuredBaseUrl,
        activeBaseUrl: ownerAIConfigAudit.activeBaseUrl,
        configurationError: ownerAIConfigAudit.configurationError,
        pointsToDevHost: ownerAIConfigAudit.pointsToDevHost,
      });
      return;
    }

    console.log('[IVXOwnerChatRoute] Owner AI routing audit pass:', {
      environment: ownerAIConfigAudit.currentEnvironment,
      routingPolicy: ownerAIConfigAudit.routingPolicy,
      activeBaseUrl: ownerAIConfigAudit.activeBaseUrl,
      fallbackUsed: ownerAIConfigAudit.fallbackUsed,
    });
  }, [
    ownerAIConfigAudit.activeBaseUrl,
    ownerAIConfigAudit.configuredBaseUrl,
    ownerAIConfigAudit.configurationError,
    ownerAIConfigAudit.currentEnvironment,
    ownerAIConfigAudit.fallbackUsed,
    ownerAIConfigAudit.pointsToDevHost,
    ownerAIConfigAudit.routingPolicy,
    ownerAIRoutingBlocked,
  ]);

  useEffect(() => {
    if (localFirstChatMode) {
      setNerveSnapshot(null);
      return undefined;
    }

    controlTowerAggregator.start();
    setNerveSnapshot(controlTowerAggregator.getSnapshot());
    const unsubscribe = controlTowerAggregator.subscribe((snapshot) => {
      setNerveSnapshot(snapshot);
    });

    return () => {
      unsubscribe();
    };
  }, [localFirstChatMode]);

  useEffect(() => {
    if (localFirstChatMode) {
      return undefined;
    }

    const sessionId = ownerSessionIdRef.current;
    const baseMetadata = {
      roomId: conversationQuery.data?.id ?? 'ivx-owner-room',
      route: '/ivx/chat',
      sender: ownerLabel,
    };

    liveIntelligenceService.captureEvent({
      eventName: 'session_start',
      screen: '/ivx/chat',
      module: 'chat',
      sessionId,
      userId: ownerId || null,
      anonId: ownerId || sessionId,
      metadata: baseMetadata,
    });
    liveIntelligenceService.captureEvent({
      eventName: 'page_view',
      screen: '/ivx/chat',
      module: 'chat',
      sessionId,
      userId: ownerId || null,
      anonId: ownerId || sessionId,
      metadata: baseMetadata,
    });
    liveIntelligenceService.captureEvent({
      eventName: 'chat_open',
      screen: '/ivx/chat',
      module: 'chat',
      sessionId,
      userId: ownerId || null,
      anonId: ownerId || sessionId,
      metadata: baseMetadata,
    });
    void recordIVXOwnerChatAuditEvent({
      action: 'room_open',
      conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
      status: 'success',
      summary: 'IVX Owner AI room opened locally with runtime and persistence checks active.',
      metadata: { sessionId, localFirstChatMode, ownerRoomAuthenticated },
    });

    return () => {
      liveIntelligenceService.captureEvent({
        eventName: 'session_end',
        screen: '/ivx/chat',
        module: 'chat',
        sessionId,
        userId: ownerId || null,
        anonId: ownerId || sessionId,
        metadata: {
          ...baseMetadata,
          reason: 'route_unmount',
        },
      });
    };
  }, [conversationQuery.data?.id, localFirstChatMode, ownerId, ownerLabel, ownerRoomAuthenticated]);

  const assistantReplyMutation = useMutation<void, Error, { text: string; nonBlocking: boolean }>({
    mutationFn: async ({ text, nonBlocking }) => {
      console.log('[IVXOwnerChatRoute] assistant_generation_start. nonBlocking:', nonBlocking);
      const startedAt = Date.now();
      const startedAtIso = new Date(startedAt).toISOString();
      const transientReplyId = createTransientMessageId('ivx-owner-ai-reply');

      setRuntimeDebugSnapshot((current) => ({
        ...current,
        conversationId: conversationQuery.data?.id ?? current.conversationId,
        requestStage: 'request_started',
        failureClass: 'pending',
        httpStatus: 'pending',
        source: 'pending',
        responsePreview: sanitizeUserFacingChatText(safeTrim(text)).slice(0, 160) || current.responsePreview,
        failureDetail: 'Awaiting AI response from live runtime.',
        lastAttemptAt: startedAtIso,
        hasVisibleResponseText: false,
      }));
      setAiReplyPending(true);
      try {
        const reliableConversationId = conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id;
        const { value: aiResult, trace } = await executeReliably(
          reliableConversationId,
          async () => ivxAIRequestService.requestOwnerAI({
            conversationId: reliableConversationId,
            message: text,
            senderLabel: ownerLabel,
            mode: 'chat',
            persistUserMessage: false,
            persistAssistantMessage: true,
            devTestModeActive: devTestMode.testModeActive,
          }),
          { totalTimeoutMs: 45_000, maxAttempts: 3, baseDelayMs: 600, maxDelayMs: 4_000 },
        );
        setLastReliabilityTrace(trace);
        void recordIVXOwnerChatAuditEvent({
          action: 'assistant_reply',
          conversationId: reliableConversationId,
          status: 'started',
          summary: 'IVX Owner AI assistant request completed reliability wrapper and entered response validation.',
          metadata: { attempts: trace.attempts.length, finalOutcome: trace.finalOutcome, elapsedMs: trace.totalElapsedMs, sessionId: ownerSessionIdRef.current },
        });
        const runtimeProof = getLastIVXOwnerAIRuntimeProof();
        const normalizedSource = normalizeRuntimeSource(runtimeProof?.source ?? aiResult.source);
        const normalizedAnswer = assertCleanOwnerAIResponseText(aiResult.answer);
        const responseToolOutputs = aiResult.toolOutputs ?? [];
        setLastToolOutputs(responseToolOutputs);
        const toolUsedLabel = responseToolOutputs.length > 0
          ? `Tool used: ${responseToolOutputs.map((output) => output.tool).join(', ')}`
          : null;
        const visibleAnswer = toolUsedLabel ? `${normalizedAnswer}\n\n${toolUsedLabel}` : normalizedAnswer;

        console.log('[IVXOwnerChatRoute] assistant_generation_success:', { source: normalizedSource, answerLength: normalizedAnswer.length, requestId: aiResult.requestId, toolUsed: toolUsedLabel });
        if (!normalizedAnswer) {
          throw new Error('IVX Owner AI completed without returning visible response text.');
        }
        if (normalizedSource !== 'remote_api' && normalizedSource !== 'local_app_brain') {
          console.log('[IVXOwnerChatRoute] Non-primary assistant source rejected before transcript insert:', normalizedSource);
          throw new Error('Unexpected assistant source.');
        }

        console.log('[IVXOwnerChatRoute] assistant_send_attempt (primary path)');
        setTransientAssistantMessages((current) => {
          const nowIso = new Date().toISOString();
          const replyMessage: IVXMessage = {
            id: transientReplyId,
            conversationId: conversationQuery.data?.id ?? 'ivx-owner-room',
            senderUserId: null,
            senderRole: 'assistant',
            senderLabel: IVX_OWNER_AI_PROFILE.name,
            body: visibleAnswer,
            attachmentUrl: null,
            attachmentName: null,
            attachmentMime: null,
            attachmentSize: null,
            attachmentKind: 'text',
            createdAt: nowIso,
            updatedAt: nowIso,
          };
          return [...current.filter((message) => message.id !== transientReplyId), replyMessage];
        });
        setRuntimeDebugSnapshot((current) => ({
          ...current,
          requestStage: 'response_ok',
          failureClass: 'none',
          source: normalizedSource,
          httpStatus: runtimeProof?.statusCode !== null && runtimeProof?.statusCode !== undefined
            ? String(runtimeProof.statusCode)
            : '200',
          responsePreview: visibleAnswer.slice(0, 160) || current.responsePreview,
          failureDetail: 'Reply delivered and saved.',
          lastVerifiedAt: new Date().toISOString(),
          hasVisibleResponseText: true,
        }));

        setAiBackendReachable(true);
        setAiHealthDetail('active');
        setAiProbeMetadata({
          observedAt: new Date().toISOString(),
          source: normalizedSource,
          endpoint: aiResult.endpoint ?? runtimeProof?.endpoint ?? null,
          deploymentMarker: aiResult.deploymentMarker ?? runtimeProof?.deploymentMarker ?? null,
          lastFailureReason: null,
        });
        setRuntimeDebugSnapshot((current) => {
          const nextRequestStage = (runtimeProof?.failureClass === 'none' && (runtimeProof?.source === 'remote_api' || runtimeProof?.source === 'local_app_brain') ? runtimeProof?.requestStage : null)
            ?? 'response_ok';
          return {
            ...current,
            conversationId: conversationQuery.data?.id ?? current.conversationId,
            requestId: runtimeProof?.requestId ?? aiResult.requestId ?? null,
            source: normalizedSource,
            endpoint: aiResult.endpoint ?? runtimeProof?.endpoint ?? current.endpoint,
            deploymentMarker: aiResult.deploymentMarker ?? runtimeProof?.deploymentMarker ?? current.deploymentMarker,
            requestStage: nextRequestStage,
            failureClass: 'none',
            httpStatus: (runtimeProof?.failureClass === 'none' && runtimeProof?.statusCode !== null && runtimeProof?.statusCode !== undefined)
              ? String(runtimeProof.statusCode)
              : '200',
            responsePreview: visibleAnswer.slice(0, 160) || current.responsePreview,
            failureDetail: 'Reply delivered and saved.',
            lastVerifiedAt: new Date().toISOString(),
            hasVisibleResponseText: true,
          };
        });
        setLastReplyAt(new Date().toISOString());
        setLatencySamplesMs((samples) => [...samples.slice(-9), Date.now() - startedAt]);
        console.log('[IVXOwnerChatRoute] assistant_send_success (primary path):', {
          requestId: aiResult.requestId,
          source: normalizedSource,
          endpoint: aiResult.endpoint ?? null,
          deploymentMarker: aiResult.deploymentMarker ?? null,
          model: aiResult.model,
        });

        try {
          if (aiResult.assistantPersisted !== true) {
            await persistSupportMessage(visibleAnswer, 'assistant');
          }
          console.log('[IVXOwnerChatRoute] assistant_commit_success (primary path)');
          void recordIVXOwnerChatAuditEvent({
            action: 'assistant_reply',
            conversationId: aiResult.conversationId,
            messageId: aiResult.assistantMessageId ?? transientReplyId,
            status: 'success',
            summary: 'Assistant reply delivered and persisted or confirmed by backend.',
            metadata: {
              requestId: aiResult.requestId,
              source: normalizedSource,
              endpoint: aiResult.endpoint ?? null,
              deploymentMarker: aiResult.deploymentMarker ?? null,
              model: aiResult.model,
              answerLength: visibleAnswer.length,
              reliabilityAttempts: trace.attempts.length,
              sessionId: ownerSessionIdRef.current,
            },
          });
          await queryClient.invalidateQueries({ queryKey: IVX_OWNER_MESSAGES_QUERY_KEY });
          setTransientAssistantMessages((current) => current.filter((message) => message.id !== transientReplyId));
        } catch (persistErr) {
          console.log('[IVXOwnerChatRoute] assistant_commit_failed_but_visible_reply_kept:', persistErr instanceof Error ? persistErr.message : 'unknown');
          setRuntimeDebugSnapshot((current) => ({
            ...current,
            failureDetail: 'Reply delivered locally. Save will retry on refresh.',
            hasVisibleResponseText: true,
          }));
        }
        if (!localFirstChatMode) {
          try {
            liveIntelligenceService.captureEvent({
              eventName: 'chat_message',
              screen: '/ivx/chat',
              module: 'chat',
              sessionId: ownerSessionIdRef.current,
              userId: ownerId || null,
              anonId: ownerId || ownerSessionIdRef.current,
              metadata: {
                role: 'assistant',
                roomId: conversationQuery.data?.id ?? 'ivx-owner-room',
                source: normalizedSource,
                requestId: aiResult.requestId ?? null,
                message: sanitizeUserFacingChatText(visibleAnswer).slice(0, 240),
              },
            });
          } catch (eventErr) {
            console.log('[IVXOwnerChatRoute] Post-processing event capture failed (response still delivered):', eventErr instanceof Error ? eventErr.message : 'unknown');
          }
        }
      } catch (aiErr) {
        const diagnostics = getIVXOwnerAIErrorDiagnostics(aiErr);
        const failureMessage = aiErr instanceof Error ? aiErr.message : 'Owner AI request error.';
        const serviceUnavailable = isIVXServiceUnavailableDiagnostics(diagnostics);
        console.log('[IVXOwnerChatRoute] assistant_send_failure:', {
          failureMessage,
          diagnostics,
          serviceUnavailable,
          blockedByRoutingGuard: ownerAIRoutingBlocked,
          activeEndpoint: ownerAIConfigAudit.activeEndpoint,
          routingPolicy: ownerAIConfigAudit.routingPolicy,
        });

        setTransientAssistantMessages((current) => current.filter((message) => message.id !== transientReplyId));
        const failedTrace = isRecord(aiErr) && isRecord((aiErr as { reliabilityTrace?: unknown }).reliabilityTrace)
          ? (aiErr as { reliabilityTrace: ReliabilityTrace }).reliabilityTrace
          : null;
        if (failedTrace) {
          setLastReliabilityTrace(failedTrace);
        }
        void recordIVXOwnerChatAuditEvent({
          action: 'assistant_reply',
          conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
          status: 'failed',
          summary: 'Assistant reply failed after reliability handling.',
          metadata: {
            failureMessage,
            diagnostics,
            serviceUnavailable,
            reliabilityAttempts: failedTrace?.attempts.length ?? null,
            finalOutcome: failedTrace?.finalOutcome ?? null,
            sessionId: ownerSessionIdRef.current,
          },
        });
        setRuntimeDebugSnapshot((current) => ({
          ...current,
          conversationId: conversationQuery.data?.id ?? current.conversationId,
          requestId: diagnostics?.requestId ?? current.requestId,
          endpoint: diagnostics?.endpoint ?? current.endpoint ?? ownerAIConfigAudit.activeEndpoint,
          requestStage: diagnostics?.stage ?? 'response',
          failureClass: diagnostics?.classification ?? 'provider_exhausted',
          httpStatus: diagnostics?.statusCode !== null && diagnostics?.statusCode !== undefined ? String(diagnostics.statusCode) : 'unavailable',
          responsePreview: '',
          failureDetail: 'The message was sent. Send another prompt when you are ready.',
          hasVisibleResponseText: false,
        }));
        setAiBackendReachable(false);
        setAiHealthDetail('inactive');
        setAiProbeMetadata((current) => ({
          ...current,
          observedAt: new Date().toISOString(),
          endpoint: diagnostics?.endpoint ?? current.endpoint ?? ownerAIConfigAudit.activeEndpoint,
          lastFailureReason: serviceUnavailable ? 'temporarily_unavailable' : 'provider_exhausted',
        }));
        console.log('[IVXOwnerChatRoute] assistant provider and local guard paths exhausted; no fake assistant text inserted:', {
          originalFailureMessage: failureMessage,
          diagnostics,
          serviceUnavailable,
        });
      } finally {
        setAiReplyPending(false);
      }
    },
    onError: (error) => {
      console.log('[IVXOwnerChatRoute] Assistant reply mutation error suppressed from chat UI:', error.message);
    },
    onSettled: () => {
      setAiReplyPending(false);
    },
  });

  const buildCommandContractResponse = useCallback(async (command: string, args: string): Promise<string | null> => {
    const snapshot = nerveSnapshotRef.current;
    const runtime = roomRuntimeRef.current;

    if (command === 'proof') {
      const report = auditReportRef.current;
      const proofLines = runtime?.proofs.slice(0, 3).map((proof) => `${proof.title}: ${proof.status} (${Math.round(proof.confidence * 100)}%)`) ?? [];
      return [
        `Result: ${report?.liveReady ? 'pass' : runtime?.runtimeStatus ?? 'probing'}`,
        `Explanation: ${report?.summary ?? `Room ${runtime?.roomId ?? 'ivx-owner-room'} is ${runtime?.runtimeStatus ?? 'probing'} with stream ${runtime?.streamStatus ?? 'unavailable'}.`}`,
        `Evidence: ${proofLines.join(' | ') || 'No verified proof rows yet'}${report ? ` | audit ${report.passedCount}/${report.totalCount} passed` : ''}`,
        `Affected dependencies: ${(snapshot?.systemNodes.filter((node) => node.id.includes('chat') || node.id.includes('realtime') || node.id.includes('ai_runtime')).slice(0, 4).map((node) => node.name).join(' → ')) || 'Chat transport → Realtime → AI runtime'}`,
        'Operator action log: proof-inspect',
        'Rollback: not required',
        `Linked proof cards: ${runtime?.proofs.slice(0, 2).map((proof) => proof.id).join(', ') || 'none'}`,
      ].join('\n');
    }

    if (command === 'risk') {
      const risks = snapshot?.riskAssessments.filter((risk) => risk.subjectId.includes('chat') || risk.subjectId.includes('ai_ops') || risk.subjectId.includes('realtime_sync')).slice(0, 3) ?? [];
      return [
        `Result: ${risks.length > 0 ? 'available' : 'empty'}`,
        'Explanation: Returning the highest live room/runtime risks.',
        `Evidence: ${risks.map((risk) => `${risk.subjectId.replace('module:', '')} ${Math.round(risk.currentRiskScore * 100)}% / blast ${risk.blastRadius}`).join(' | ') || 'No elevated risks currently'}`,
        `Affected dependencies: ${risks.flatMap((risk) => risk.causeChain.slice(0, 3)).slice(0, 6).join(' → ') || 'none'}`,
        'Operator action log: risk-inspect',
        'Rollback: not required',
        `Linked proof cards: ${risks.map((risk) => risk.id).join(', ') || 'none'}`,
      ].join('\n');
    }

    if (command === 'incident') {
      const incident = snapshot?.incidents.find((item) => item.module === 'chat' || item.module === 'ai_ops' || item.module === 'realtime_sync') ?? null;
      return [
        `Result: ${incident ? 'available' : 'none'}`,
        `Explanation: ${incident ? incident.description : 'No active owner-room incident is currently open.'}`,
        `Evidence: ${incident?.evidenceIds?.join(', ') || 'No linked evidence IDs'}`,
        `Affected dependencies: ${incident?.rootCauseHypothesis ?? 'No dependency chain attached'}`,
        `Operator action log: ${incident?.executedActions?.join(' | ') || 'No interventions executed yet'}`,
        'Rollback: depends on chosen intervention',
        `Linked proof cards: ${incident?.evidenceIds?.slice(0, 3).join(', ') || 'none'}`,
      ].join('\n');
    }

    if (command === 'deps') {
      const nodes = snapshot?.systemNodes.filter((node) => node.id.includes('chat') || node.id.includes('realtime') || node.id.includes('ai_runtime') || node.id.includes('shared_room')).slice(0, 5) ?? [];
      return [
        `Result: ${nodes.length > 0 ? 'available' : 'empty'}`,
        'Explanation: Returning the current owner-room dependency spine.',
        `Evidence: ${nodes.map((node) => `${node.name}:${node.status}`).join(' | ') || 'No dependency nodes captured yet'}`,
        `Affected dependencies: ${nodes.flatMap((node) => node.dependencies).slice(0, 8).join(' → ') || 'none'}`,
        'Operator action log: dependency-inspect',
        'Rollback: not required',
        `Linked proof cards: ${nodes.flatMap((node) => node.proofIds).slice(0, 4).join(', ') || 'none'}`,
      ].join('\n');
    }

    if (command === 'heal') {
      const normalized = safeTrim(args).toLowerCase();
      const action = normalized === 'rerun-proof'
        ? 'rerun_health_probe'
        : normalized === 'clear-stuck'
          ? 'transition_stuck_sends'
          : normalized === 'provider-probe'
            ? 'force_provider_probe'
            : normalized === 'shared-sync'
              ? 'rerun_shared_room_sync'
              : normalized === 'inbox-sync'
                ? 'rerun_inbox_sync'
                : normalized === 'transcript'
                  ? 'force_transcript_reconciliation'
                  : null;
      if (!action) {
        return 'Result: blocked\nExplanation: Allowed interventions are rerun-proof, clear-stuck, provider-probe, shared-sync, inbox-sync, and transcript.\nEvidence: permission guard\nAffected dependencies: chat transport\nOperator action log: not-started\nRollback: not required\nLinked proof cards: none';
      }
      const result = await executeOperatorAction(action, 'chat');
      void recordIVXOwnerChatAuditEvent({
        action: 'control_action',
        conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
        status: result.success ? 'success' : 'failed',
        summary: `Owner control action ${getActionLabel(action)} completed.`,
        metadata: { action, resultMessage: result.message, sessionId: ownerSessionIdRef.current },
      });
      invalidateIVXRoomProbeCache();
      await queryClient.invalidateQueries({ queryKey: IVX_ROOM_STATUS_QUERY_KEY });
      setAiHealthDetail('inactive');
      return [
        `Result: ${result.success ? 'success' : 'failed'}`,
        `Explanation: ${result.message}`,
        `Evidence: ${(snapshot?.evidence.filter((proof) => proof.subjectId.includes('chat') || proof.subjectId.includes('realtime')).slice(0, 2).map((proof) => proof.claim).join(' | ')) || 'No linked proof rows yet'}`,
        `Affected dependencies: ${(snapshot?.systemNodes.filter((node) => node.id.includes('chat') || node.id.includes('realtime')).slice(0, 3).map((node) => node.name).join(' → ')) || 'Chat transport → Realtime'}`,
        `Operator action log: ${getActionLabel(action)}`,
        `Rollback: ${action === 'transition_stuck_sends' ? 'available' : 'not required'}`,
        `Linked proof cards: ${(snapshot?.evidence.filter((proof) => proof.subjectId.includes('chat') || proof.subjectId.includes('realtime')).slice(0, 3).map((proof) => proof.id).join(', ')) || 'none'}`,
      ].join('\n');
    }

    if (command === 'replay') {
      const latestReplayable = (snapshot?.actionRuns ?? [])
        .find((action) => action.rollbackAvailable && action.result !== 'failed');
      if (!latestReplayable) {
        return 'Result: blocked\nExplanation: No replayable safe action is currently available.\nEvidence: operator action history empty\nAffected dependencies: none\nOperator action log: not-started\nRollback: not required\nLinked proof cards: none';
      }
      const replayResult = await executeOperatorAction(latestReplayable.actionType, 'chat');
      invalidateIVXRoomProbeCache();
      await queryClient.invalidateQueries({ queryKey: IVX_ROOM_STATUS_QUERY_KEY });
      setAiHealthDetail('inactive');
      const replayProofs = snapshot?.evidence
        .filter((proof) => proof.subjectId.includes('chat') || proof.subjectId.includes('ai_') || proof.subjectId.includes('shared_room') || proof.subjectId.includes('realtime') || proof.subjectId.includes('inbox_sync'))
        .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())
        .slice(0, 3) ?? [];
      const replayNodes = snapshot?.systemNodes
        .filter((node) => node.id.includes('chat') || node.id.includes('realtime') || node.id.includes('ai_runtime') || node.id.includes('shared_room'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 6) ?? [];
      return [
        `Result: ${replayResult.success ? 'success' : 'failed'}`,
        `Explanation: Replayed ${getActionLabel(latestReplayable.actionType)}. ${replayResult.message}`,
        `Evidence: ${replayProofs.slice(0, 2).map((proof) => proof.claim).join(' | ') || 'No linked proof rows yet'}`,
        `Affected dependencies: ${replayNodes.slice(0, 4).map((node) => node.name).join(' → ') || 'chat transport'}`,
        `Operator action log: replay:${latestReplayable.id}`,
        `Rollback: ${latestReplayable.rollbackAvailable ? 'available' : 'not available'}`,
        `Linked proof cards: ${replayProofs.slice(0, 3).map((proof) => proof.id).join(', ') || 'none'}`,
      ].join('\n');
    }

    return null;
  }, [queryClient]);

  const sendMessageMutation = useMutation<void, Error, { text: string; mode: 'send_only' | 'send_and_ai' | 'ai_only'; clientId: string; capturedText: string; replyTo: ChatReplyContext | null }>({
    mutationFn: async ({ text, mode, replyTo }) => {
      const persistedOwnerText = encodeReplyBody(text, replyTo);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const hasConfirmationPrefix = isExplicitSensitiveActionConfirmation(text);
      const strippedConfirmedText = stripSensitiveActionConfirmationPrefix(text);
      const strippedTrustContext = resolveOwnerTrustContext({
        messageText: strippedConfirmedText,
        ownerRoomAuthenticated,
        backendAdminVerified,
        fallbackModeActive: fallbackChatOnlyActive,
        devTestModeActive: devTestMode.testModeActive,
      });
      const confirmedSensitiveAction = hasConfirmationPrefix && strippedTrustContext.requiresElevatedConfirmation;
      const effectiveText = confirmedSensitiveAction ? strippedConfirmedText : text;
      const trustContext = confirmedSensitiveAction
        ? strippedTrustContext
        : resolveOwnerTrustContext({
          messageText: effectiveText,
          ownerRoomAuthenticated,
          backendAdminVerified,
          fallbackModeActive: fallbackChatOnlyActive,
          devTestModeActive: devTestMode.testModeActive,
        });

      if (localFirstChatMode) {
        setMessageSendPending(true);
        try {
          await ivxChatService.sendOwnerTextMessage({ body: persistedOwnerText, senderLabel: ownerLabel, requireRemote: false });
          setLastSendAt(new Date().toISOString());
          if (trustContext.requiresElevatedConfirmation && !confirmedSensitiveAction) {
            await persistSupportMessage(buildLocalSafeActionConfirmationMessage({
              normalizedText: effectiveText,
              requestClass: trustContext.requestClass,
            }), 'assistant');
            return;
          }
        } finally {
          setMessageSendPending(false);
        }

        if (mode === 'send_and_ai' || mode === 'ai_only') {
          await assistantReplyMutation.mutateAsync({ text: effectiveText, nonBlocking: mode === 'send_and_ai' });
        }
        return;
      }

      const commandResult = parseOwnerCommand(effectiveText);

      if (commandResult) {
        console.log('[IVXOwnerChatRoute] Processing owner command:', commandResult.command, 'trust:', trustContext.namedStates, 'confirmed:', confirmedSensitiveAction);
        liveIntelligenceService.captureEvent({
          eventName: 'routing_selected',
          screen: '/ivx/chat',
          module: 'chat',
          sessionId: ownerSessionIdRef.current,
          userId: ownerId || null,
          anonId: ownerId || ownerSessionIdRef.current,
          metadata: {
            roomId: conversationQuery.data?.id ?? 'ivx-owner-room',
            command: commandResult.command,
            args: commandResult.args,
            confirmedSensitiveAction,
            requestClass: trustContext.requestClass,
            trustStates: trustContext.namedStates,
          },
        });
        setMessageSendPending(true);
        try {
          await ivxChatService.sendOwnerTextMessage({ body: persistedOwnerText, senderLabel: ownerLabel, requireRemote: false });
          setLastSendAt(new Date().toISOString());
          if (trustContext.conversationAccessState === 'fallback_chat_only' && trustContext.requiresElevatedConfirmation) {
            await persistSupportMessage(buildFallbackChatOnlyExecutionMessage({
              normalizedText: effectiveText,
              requestClass: trustContext.requestClass,
            }), 'system');
            return;
          }
          if (trustContext.requiresElevatedConfirmation && !confirmedSensitiveAction) {
            await persistSupportMessage(buildSensitiveActionConfirmationMessage({
              normalizedText: effectiveText,
              requestClass: trustContext.requestClass,
              conversationAccessState: trustContext.conversationAccessState,
              backendAdminVerified: trustContext.backendAdminState === 'backend_admin_verified',
            }), 'system');
            return;
          }
          const structuredResponse = await buildCommandContractResponse(commandResult.command, commandResult.args);
          await persistSupportMessage(structuredResponse ?? commandResult.response, 'system');
        } finally {
          setMessageSendPending(false);
        }

        if (commandResult.command === 'reconnect') {
          invalidateIVXRoomProbeCache();
          await queryClient.invalidateQueries({ queryKey: IVX_ROOM_STATUS_QUERY_KEY });
        }
        if (commandResult.command === 'probe') {
          setAiHealthDetail('inactive');
        }
        if (commandResult.command === 'knowledge' && safeTrim(commandResult.args)) {
          console.log('[IVXOwnerChatRoute] Routing knowledge query to AI:', commandResult.args.slice(0, 40));
          await assistantReplyMutation.mutateAsync({ text: `[Knowledge Query] ${commandResult.args}`, nonBlocking: false });
        }
        return;
      }

      liveIntelligenceService.captureEvent({
        eventName: 'chat_message',
        screen: '/ivx/chat',
        module: 'chat',
        sessionId: ownerSessionIdRef.current,
        userId: ownerId || null,
        anonId: ownerId || ownerSessionIdRef.current,
        metadata: {
          roomId: conversationQuery.data?.id ?? 'ivx-owner-room',
          role: 'owner',
          message: sanitizeUserFacingChatText(text),
          confirmedSensitiveAction,
          requestClass: trustContext.requestClass,
          trustStates: trustContext.namedStates,
        },
      });
      setMessageSendPending(true);
      try {
        const sentMessage = await ivxChatService.sendOwnerTextMessage({ body: persistedOwnerText, senderLabel: ownerLabel, requireRemote: false });
        setLastSendAt(new Date().toISOString());
        void recordIVXOwnerChatAuditEvent({
          action: 'message_send',
          conversationId: sentMessage.conversationId,
          messageId: sentMessage.id,
          status: 'success',
          summary: 'Owner message saved through the IVX chat send path.',
          metadata: { mode, requestClass: trustContext.requestClass, confirmedSensitiveAction, trustStates: trustContext.namedStates, sessionId: ownerSessionIdRef.current },
        });
        console.log('[IVXOwnerChatRoute] Owner message sent to Supabase. trust:', trustContext.namedStates, 'confirmed:', confirmedSensitiveAction);
      } finally {
        setMessageSendPending(false);
      }

      if (trustContext.requiresElevatedConfirmation && !confirmedSensitiveAction) {
        await persistSupportMessage(buildSensitiveActionConfirmationMessage({
          normalizedText: effectiveText,
          requestClass: trustContext.requestClass,
          conversationAccessState: trustContext.conversationAccessState,
          backendAdminVerified: trustContext.backendAdminState === 'backend_admin_verified',
        }), 'system');
        return;
      }

      if (mode === 'ai_only') {
        await assistantReplyMutation.mutateAsync({ text: effectiveText, nonBlocking: false });
        return;
      }

      if (mode === 'send_and_ai') {
        console.log('[IVXOwnerChatRoute] Auto-triggering AI reply after send, aiReachable:', aiReachableRef.current, 'trust:', trustContext.namedStates);
        void assistantReplyMutation.mutateAsync({ text: effectiveText, nonBlocking: true });
      }
    },
    onSuccess: async (_data, variables) => {
      setPendingOwnerMessages((current) => current.filter((message) => message.clientId !== variables.clientId));
      commitComposerClear(variables.capturedText);
      await queryClient.invalidateQueries({ queryKey: IVX_OWNER_MESSAGES_QUERY_KEY });
      requestAnimationFrame(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      });
    },
    onError: (error, variables) => {
      setSendFailures((count) => count + 1);
      setPendingOwnerMessages((current) => current.map((message) => (
        message.clientId === variables.clientId
          ? { ...message, status: 'failed', errorMessage: error.message }
          : message
      )));
      console.log('[IVXOwnerChatRoute] Send mutation error:', error.message, 'clientId:', variables.clientId);
      void recordIVXOwnerChatAuditEvent({
        action: 'message_send',
        conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
        messageId: variables.clientId,
        status: 'failed',
        summary: 'Owner message send failed.',
        metadata: { error: error.message, mode: variables.mode, sessionId: ownerSessionIdRef.current },
      });
      Alert.alert('Message not sent', error.message);
    },
    onSettled: () => {
      setMessageSendPending(false);
    },
  });

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const applyCapabilityProbeResult = (result: Awaited<ReturnType<typeof ivxAIRequestService.probeOwnerAIHealth>>) => {
      const aiAvailable = result.health === 'active' && result.capabilities?.ai_chat === true;
      setAiBackendReachable(aiAvailable);
      setAiHealthDetail(aiAvailable ? 'active' : 'inactive');
      setKnowledgeActive(result.capabilities?.knowledge_answers === true);
      setOwnerCommandsActive(result.capabilities?.owner_commands === true);
      setCodeAwareActive(result.capabilities?.code_aware_support === true);
      setFileUploadActive(result.capabilities?.file_upload === true);
      if (aiAvailable) {
        probeRetryCount.current = 0;
      }
    };

    const singleProbeAttempt = async (): Promise<Awaited<ReturnType<typeof ivxAIRequestService.probeOwnerAIHealth>>> => {
      const result = await ivxAIRequestService.probeOwnerAIHealth();
      setAiProbeMetadata((current) => ({
        observedAt: new Date().toISOString(),
        source: result.source,
        endpoint: result.endpoint,
        deploymentMarker: result.deploymentMarker,
        lastFailureReason: result.health === 'inactive' ? current.lastFailureReason : null,
      }));
      setRuntimeDebugSnapshot((current) => ({
        ...current,
        conversationId: conversationQuery.data?.id ?? current.conversationId,
        source: shouldPreserveRequestScopedRuntime(current) ? current.source : 'unknown',
        endpoint: result.endpoint ?? current.endpoint,
        deploymentMarker: result.deploymentMarker ?? current.deploymentMarker,
      }));
      if (result.roomStatus) {
        setRoomProbeAt(new Date().toISOString());
        queryClient.setQueryData<ChatRoomStatus>(IVX_ROOM_STATUS_QUERY_KEY, result.roomStatus);
      }
      console.log('[IVXOwnerChatRoute] AI health probe result:', {
        health: result.health,
        source: result.source,
        endpoint: result.endpoint,
        deploymentMarker: result.deploymentMarker,
        storageMode: result.roomStatus?.storageMode ?? ivxRoomStatus?.storageMode ?? 'unknown',
      });
      return result;
    };

    const probe = async () => {
      const result = await singleProbeAttempt();
      void recordIVXOwnerChatAuditEvent({
        action: 'sync_probe',
        conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
        status: result.health === 'active' ? 'success' : 'failed',
        summary: 'IVX Owner AI backend capability probe completed.',
        metadata: { health: result.health, source: result.source, endpoint: result.endpoint, deploymentMarker: result.deploymentMarker, sessionId: ownerSessionIdRef.current },
      });
      if (cancelled) return;

      if (result.health === 'active') {
        applyCapabilityProbeResult(result);
        return;
      }

      if (probeRetryCount.current < MAX_PROBE_RETRIES) {
        probeRetryCount.current += 1;
        console.log('[IVXOwnerChatRoute] AI health probe: retry', probeRetryCount.current, 'of', MAX_PROBE_RETRIES, 'in', PROBE_RETRY_DELAY_MS, 'ms');
        await new Promise((resolve) => setTimeout(resolve, PROBE_RETRY_DELAY_MS));
        if (cancelled) return;
        const retryResult = await singleProbeAttempt();
        if (cancelled) return;
        if (retryResult.health === 'active') {
          applyCapabilityProbeResult(retryResult);
          return;
        }
      }

      console.log('[IVXOwnerChatRoute] AI health probe: inactive after retries');
      setAiBackendReachable(false);
      setAiHealthDetail('inactive');
      setKnowledgeActive(false);
      setOwnerCommandsActive(false);
      setCodeAwareActive(false);
      setFileUploadActive(false);
    };

    const initialDelay = setTimeout(() => {
      if (!cancelled) void probe();
    }, 1500);

    intervalId = setInterval(() => {
      void probe();
    }, AI_PROBE_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimeout(initialDelay);
      if (intervalId) clearInterval(intervalId);
    };
  }, [ivxRoomStatus?.storageMode, queryClient]);

  const runtimeSignals = useMemo<ChatRoomRuntimeSignals>(() => {
    if (localFirstChatMode) {
      return {
        aiBackendHealth: 'active',
        aiBackendSource: 'local_app_brain',
        aiResponseState: aiReplyPending ? 'responding' : 'idle',
        fileUploadAvailability: 'inactive',
        knowledgeBackendHealth: 'inactive',
        ownerCommandAvailability: 'inactive',
        codeAwareServiceAvailability: 'inactive',
      };
    }

    const normalizedRuntimeState = {
      source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
      requestStage: runtimeDebugSnapshot.requestStage,
      failureClass: runtimeDebugSnapshot.failureClass,
      isFallback: runtimeDebugSnapshot.source === 'provider_fallback',
      isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
      hasVisibleResponseText: runtimeDebugSnapshot.hasVisibleResponseText,
    };
    const activeRuntimeSource = getActiveRuntimeSource(normalizedRuntimeState);
    const hasFailure = hasRuntimeFailure(normalizedRuntimeState);
    const effectiveAiHealth: ServiceRuntimeHealth = hasFailure
      ? 'inactive'
      : activeRuntimeSource === 'remote_api' || aiHealthDetail === 'active'
        ? 'active'
        : 'inactive';
    const isAiLive = effectiveAiHealth === 'active';
    return {
      aiBackendHealth: effectiveAiHealth,
      aiBackendSource: activeRuntimeSource === 'pending' ? 'unknown' : activeRuntimeSource,
      aiResponseState: isAiLive ? 'idle' : 'inactive',
      fileUploadAvailability: fileUploadActive ? 'active' : 'inactive',
      knowledgeBackendHealth: knowledgeActive ? 'active' : 'inactive',
      ownerCommandAvailability: ownerCommandsActive ? 'active' : 'inactive',
      codeAwareServiceAvailability: codeAwareActive ? 'active' : 'inactive',
    };
  }, [aiHealthDetail, aiReplyPending, codeAwareActive, devTestMode.testModeActive, fileUploadActive, knowledgeActive, localFirstChatMode, ownerCommandsActive, runtimeDebugSnapshot]);

  const resolution = useMemo<RoomCapabilityResolution>(() => {
    console.log('[IVXOwnerChatRoute] Resolving capabilities:', {
      storageMode: ivxRoomStatus?.storageMode ?? 'unknown',
      deliveryMethod: ivxRoomStatus?.deliveryMethod ?? 'unknown',
      aiHealth: effectiveAiHealthDetail,
      aiReachable: effectiveAiBackendReachable,
      knowledgeActive,
      ownerCommandsActive,
      codeAwareActive,
      fileUploadActive,
    });
    return resolveRoomCapabilityState(ivxRoomStatus, runtimeSignals);
  }, [effectiveAiBackendReachable, effectiveAiHealthDetail, ivxRoomStatus, runtimeSignals, knowledgeActive, ownerCommandsActive, codeAwareActive, fileUploadActive]);

  const clearUploadProgressTimer = useCallback((clientId: string) => {
    const timer = uploadProgressTimersRef.current[clientId];
    if (timer) {
      clearInterval(timer);
      delete uploadProgressTimersRef.current[clientId];
    }
  }, []);

  const startUploadProgressTimer = useCallback((clientId: string) => {
    clearUploadProgressTimer(clientId);
    uploadProgressTimersRef.current[clientId] = setInterval(() => {
      setPendingOwnerMessages((current) => current.map((message) => {
        if (message.clientId !== clientId || message.status !== 'uploading') {
          return message;
        }
        const currentProgress = typeof message.uploadProgress === 'number' ? message.uploadProgress : 8;
        const nextProgress = Math.min(92, currentProgress + Math.max(3, Math.round((96 - currentProgress) / 7)));
        return { ...message, uploadProgress: nextProgress };
      }));
    }, 420);
  }, [clearUploadProgressTimer]);

  useEffect(() => {
    return () => {
      Object.values(uploadProgressTimersRef.current).forEach((timer) => clearInterval(timer));
      uploadProgressTimersRef.current = {};
    };
  }, []);

  const attachmentMutation = useMutation<IVXMessage, Error, { upload: IVXUploadInput; clientId: string; capturedBody: string; replyTo: ChatReplyContext | null }>({
    mutationFn: async ({ upload, capturedBody, replyTo }) => {
      const persistedAttachmentBody = encodeReplyBody(capturedBody, replyTo);
      console.log('[IVXOwnerChatRoute] Attachment send body length:', capturedBody.length, 'replyTo:', replyTo?.messageId ?? null);
      return ivxChatService.sendOwnerAttachmentMessage({
        upload,
        body: persistedAttachmentBody,
        senderLabel: ownerLabel,
      });
    },
    onSuccess: async (_message, variables) => {
      clearUploadProgressTimer(variables.clientId);
      setPendingOwnerMessages((current) => current.map((message) => (
        message.clientId === variables.clientId
          ? { ...message, status: 'uploaded', uploadProgress: 100, errorMessage: null }
          : message
      )));
      commitComposerClear(variables.capturedBody);
      if (variables.replyTo) {
        setSelectedReplyContext(null);
      }
      void recordIVXOwnerChatAuditEvent({
        action: 'attachment_upload',
        conversationId: _message.conversationId,
        messageId: _message.id,
        status: 'success',
        summary: 'Owner attachment uploaded and persisted in the IVX room.',
        metadata: {
          fileName: variables.upload.name,
          fileType: variables.upload.type ?? null,
          size: variables.upload.size ?? null,
          attachmentKind: _message.attachmentKind,
          sessionId: ownerSessionIdRef.current,
        },
      });
      await queryClient.invalidateQueries({ queryKey: IVX_OWNER_MESSAGES_QUERY_KEY });
      setTimeout(() => {
        setPendingOwnerMessages((current) => current.filter((message) => message.clientId !== variables.clientId));
      }, 650);
    },
    onError: (error, variables) => {
      clearUploadProgressTimer(variables.clientId);
      setPendingOwnerMessages((current) => current.map((message) => (
        message.clientId === variables.clientId
          ? { ...message, status: 'failed', uploadProgress: null, errorMessage: `Upload failed: ${error.message}` }
          : message
      )));
      void recordIVXOwnerChatAuditEvent({
        action: 'attachment_upload',
        conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
        messageId: variables.clientId,
        status: 'failed',
        summary: 'Owner attachment upload failed.',
        metadata: { error: error.message, fileName: variables.upload.name, sessionId: ownerSessionIdRef.current },
      });
      Alert.alert('Upload failed', error.message);
    },
  });

  const handleComposerChange = useCallback((value: string) => {
    composerValueRef.current = value;
    setComposerValue(value);
  }, []);

  const commitComposerClear = useCallback((capturedText?: string) => {
    const latestValue = normalizeComposerText(composerValueRef.current);
    const preservedValue = normalizeComposerText(capturedText);
    if (preservedValue.length > 0 && latestValue !== preservedValue) {
      console.log('[IVXOwnerChatRoute] Composer changed after send started, preserving latest draft');
      return;
    }

    setSelectedReplyContext(null);
    composerValueRef.current = '';
    setComposerValue('');
    setComposerInputHeight(44);
    composerInputRef.current?.clear();
    void AsyncStorage.removeItem(IVX_OWNER_DRAFT_STORAGE_KEY).catch((error) => {
      console.log('[IVXOwnerChatRoute] Failed to clear owner draft after send:', error instanceof Error ? error.message : 'unknown');
    });
  }, []);

  const handleApplyPromptTemplate = useCallback((template: OwnerPromptTemplate) => {
    const currentText = normalizeComposerText(composerValueRef.current).trim();
    const nextText = currentText ? `${template.prompt}\n\n${currentText}` : template.prompt;
    composerValueRef.current = nextText;
    setComposerValue(nextText);
    setComposerInputHeight(Math.min(Math.max(Math.ceil(nextText.length / 28) * 22 + 22, 44), 112));
    composerInputRef.current?.focus();
    void Haptics.selectionAsync();
    void recordIVXOwnerChatAuditEvent({
      action: 'template_apply',
      conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
      status: 'success',
      summary: `Owner prompt template applied: ${template.label}.`,
      metadata: { templateId: template.id, sessionId: ownerSessionIdRef.current },
    });
  }, [conversationQuery.data?.id]);

  const stopVoiceRecording = useCallback(async () => {
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await audioRecorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = audioRecorder.uri;
      if (!uri) {
        Alert.alert('Voice not saved', 'No recording file was created. Please try again.');
        return;
      }
      await transcribeVoiceMutation.mutateAsync(uri);
    } catch (error) {
      console.log('[IVXOwnerChatRoute] Stop voice recording error:', error instanceof Error ? error.message : 'unknown');
      Alert.alert('Voice not transcribed', 'We could not stop or transcribe that recording. Please try again.');
    }
  }, [audioRecorder, transcribeVoiceMutation]);

  const startVoiceRecording = useCallback(async () => {
    if (messageSendPending || attachmentMutation.isPending || isPickingFile || transcribeVoiceMutation.isPending || recorderState.isRecording) {
      return;
    }

    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission required', 'Please allow microphone access to use voice input.');
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record({ forDuration: 120 });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void recordIVXOwnerChatAuditEvent({
        action: 'voice_transcription',
        conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
        status: 'started',
        summary: 'Owner voice recording started.',
        metadata: { sessionId: ownerSessionIdRef.current, platform: Platform.OS },
      });
    } catch (error) {
      console.log('[IVXOwnerChatRoute] Start voice recording error:', error instanceof Error ? error.message : 'unknown');
      Alert.alert('Voice recording unavailable', 'We could not start recording. Please try again.');
    }
  }, [attachmentMutation.isPending, audioRecorder, conversationQuery.data?.id, isPickingFile, messageSendPending, recorderState.isRecording, transcribeVoiceMutation.isPending]);

  const handleVoicePress = useCallback(async () => {
    if (recorderState.isRecording) {
      await stopVoiceRecording();
      return;
    }
    await startVoiceRecording();
  }, [recorderState.isRecording, startVoiceRecording, stopVoiceRecording]);

  const handleSearchQueryChange = useCallback((value: string) => {
    setMessageSearchQuery(value);
    const trimmed = safeTrim(value);
    if (trimmed.length >= 3) {
      void recordIVXOwnerChatAuditEvent({
        action: 'search',
        conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
        status: 'success',
        summary: 'Owner searched the IVX Owner AI conversation.',
        metadata: { queryLength: trimmed.length, resultCount: displayedMessages.length, sessionId: ownerSessionIdRef.current },
      });
    }
  }, [conversationQuery.data?.id, displayedMessages.length]);

  const handleSend = useCallback((submittedText?: unknown) => {
    if (messageSendPending || attachmentMutation.isPending || isPickingFile || !composerHasText) return;
    const normalizedText = normalizeComposerText(submittedText, composerValueRef.current);
    const text = safeTrim(normalizedText);
    if (!text) {
      console.log('[IVXOwnerChatRoute] Skipping empty send after normalization');
      return;
    }
    const isCommand = !localFirstChatMode && text.startsWith(OWNER_COMMAND_PREFIX);
    const mode = isCommand ? 'send_only' : 'send_and_ai';
    const clientId = createTransientMessageId('ivx-owner-local-send');
    const createdAt = new Date().toISOString();
    const replyTo = selectedReplyContext;
    setPendingOwnerMessages((current) => [...current, { clientId, text: normalizedText, createdAt, mode, status: 'sending', errorMessage: null, replyTo }]);
    setSelectedReplyContext(null);
    console.log('[IVXOwnerChatRoute] handleSend mode:', mode, 'isCommand:', isCommand, 'aiReachable:', aiReachableRef.current, 'length:', text.length, 'clientId:', clientId, 'replyTo:', replyTo?.messageId ?? null);
    sendMessageMutation.mutate({ text, mode: mode as 'send_only' | 'send_and_ai', clientId, capturedText: normalizedText, replyTo });
  }, [attachmentMutation.isPending, composerHasText, isPickingFile, localFirstChatMode, messageSendPending, selectedReplyContext, sendMessageMutation]);

  const handleAskAI = useCallback((submittedText?: unknown) => {
    if (messageSendPending || aiReplyPending || attachmentMutation.isPending || isPickingFile || !composerHasText) return;
    const normalizedText = normalizeComposerText(submittedText, composerValueRef.current);
    const text = safeTrim(normalizedText);
    if (!text) {
      console.log('[IVXOwnerChatRoute] Skipping empty AI ask after normalization');
      return;
    }
    const clientId = createTransientMessageId('ivx-owner-ai-only-send');
    const createdAt = new Date().toISOString();
    const replyTo = selectedReplyContext;
    setPendingOwnerMessages((current) => [...current, { clientId, text: normalizedText, createdAt, mode: 'ai_only', status: 'sending', errorMessage: null, replyTo }]);
    setSelectedReplyContext(null);
    console.log('[IVXOwnerChatRoute] handleAskAI explicit AI request length:', text.length, 'clientId:', clientId, 'replyTo:', replyTo?.messageId ?? null);
    sendMessageMutation.mutate({ text, mode: 'ai_only', clientId, capturedText: normalizedText, replyTo });
  }, [aiReplyPending, attachmentMutation.isPending, composerHasText, isPickingFile, messageSendPending, selectedReplyContext, sendMessageMutation]);

  const handleRetryMessage = useCallback((message: ChatMessage) => {
    const pendingMessage = pendingOwnerMessages.find((candidate) => candidate.clientId === message.id);
    const normalizedText = normalizeComposerText(pendingMessage?.text ?? message.text ?? '');
    const text = safeTrim(normalizedText);
    const isAttachmentRetry = pendingMessage?.mode === 'attachment' && pendingMessage.upload;
    if (!pendingMessage || (!text && !isAttachmentRetry) || messageSendPending || sendMessageMutation.isPending || attachmentMutation.isPending) {
      console.log('[IVXOwnerChatRoute] Retry skipped:', message.id, 'hasPending:', Boolean(pendingMessage), 'busy:', messageSendPending || sendMessageMutation.isPending || attachmentMutation.isPending);
      return;
    }

    if (isAttachmentRetry && pendingMessage.upload) {
      setPendingOwnerMessages((current) => current.map((candidate) => (
        candidate.clientId === pendingMessage.clientId
          ? { ...candidate, status: 'uploading', errorMessage: null, uploadProgress: 8 }
          : candidate
      )));
      startUploadProgressTimer(pendingMessage.clientId);
      console.log('[IVXOwnerChatRoute] Retrying failed owner attachment:', pendingMessage.clientId, pendingMessage.upload.name);
      attachmentMutation.mutate({ upload: pendingMessage.upload, clientId: pendingMessage.clientId, capturedBody: normalizedText, replyTo: pendingMessage.replyTo ?? null });
      return;
    }

    setPendingOwnerMessages((current) => current.map((candidate) => (
      candidate.clientId === pendingMessage.clientId
        ? { ...candidate, status: 'sending', errorMessage: null }
        : candidate
    )));
    console.log('[IVXOwnerChatRoute] Retrying failed owner message:', pendingMessage.clientId, 'mode:', pendingMessage.mode);
    sendMessageMutation.mutate({
      text,
      mode: pendingMessage.mode as 'send_only' | 'send_and_ai' | 'ai_only',
      clientId: pendingMessage.clientId,
      capturedText: normalizedText,
      replyTo: pendingMessage.replyTo ?? null,
    });
  }, [attachmentMutation, messageSendPending, pendingOwnerMessages, sendMessageMutation, startUploadProgressTimer]);

  const handleDismissFailedMessage = useCallback((messageId: string) => {
    console.log('[IVXOwnerChatRoute] Removing failed local message:', messageId);
    clearUploadProgressTimer(messageId);
    setPendingOwnerMessages((current) => current.filter((message) => message.clientId !== messageId));
  }, [clearUploadProgressTimer]);

  const handleOpenAttachment = useCallback(async (message: IVXMessage) => {
    if (!message.attachmentUrl) {
      return;
    }

    try {
      await Linking.openURL(message.attachmentUrl);
    } catch (error) {
      Alert.alert('Unable to open attachment', error instanceof Error ? error.message : 'Unknown attachment error.');
    }
  }, []);

  const handlePickFile = useCallback(async () => {
    if (attachmentMutation.isPending || isPickingFile) {
      return;
    }

    try {
      await Haptics.selectionAsync();
      Keyboard.dismiss();
      setIsPickingFile(true);
      const pickerResult = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
        console.log('[IVXOwnerChatRoute] Attachment picker canceled');
        return;
      }

      const asset = pickerResult.assets[0] as PickerAsset;
      const upload: IVXUploadInput = {
        uri: asset.uri,
        file: asset.file ?? null,
        name: asset.name?.trim() || asset.file?.name?.trim() || `ivx-file-${Date.now()}`,
        type: asset.mimeType ?? asset.file?.type ?? null,
        size: typeof asset.size === 'number'
          ? asset.size
          : typeof asset.file?.size === 'number'
            ? asset.file.size
            : null,
      };

      const fileInsight = await ivxOwnerMemoryService.summarizePickedFile({
        uri: upload.uri ?? null,
        name: upload.name,
        mimeType: upload.type ?? null,
        size: upload.size ?? null,
        file: upload.file ?? null,
      });
      await ivxOwnerMemoryService.recordFileUpload(fileInsight);

      const clientId = createTransientMessageId('ivx-owner-attachment');
      const capturedBody = normalizeComposerText(composerValueRef.current);
      const replyTo = selectedReplyContext;
      setPendingOwnerMessages((current) => [...current, {
        clientId,
        text: capturedBody,
        createdAt: new Date().toISOString(),
        mode: 'attachment',
        status: 'uploading',
        errorMessage: null,
        upload,
        uploadProgress: 8,
        replyTo,
      }]);
      if (replyTo) {
        setSelectedReplyContext(null);
      }
      startUploadProgressTimer(clientId);
      console.log('[IVXOwnerChatRoute] Sending file upload:', upload.name, 'clientId:', clientId, 'replyTo:', replyTo?.messageId ?? null);
      await attachmentMutation.mutateAsync({ upload, clientId, capturedBody, replyTo });
      console.log('[IVXOwnerChatRoute] Owner attachment upload completed:', upload.name, 'clientId:', clientId);
      await assistantReplyMutation.mutateAsync({
        text: createIVXOwnerFileUnderstandingPrompt(fileInsight),
        nonBlocking: true,
      });
    } catch (error) {
      console.log('[IVXOwnerChatRoute] Attachment picker/send flow failed:', error instanceof Error ? error.message : 'unknown');
      if (!attachmentMutation.isError) {
        Alert.alert('File pick failed', error instanceof Error ? error.message : 'Unknown file picker error.');
      }
    } finally {
      setIsPickingFile(false);
    }
  }, [assistantReplyMutation, attachmentMutation, isPickingFile, selectedReplyContext, startUploadProgressTimer]);

  const handleStartReplyToMessage = useCallback((message: ChatMessage) => {
    const previewText = safeTrim(message.text) || safeTrim(message.fileName) || 'Attachment';
    const replyContext: ChatReplyContext = {
      messageId: message.id,
      senderLabel: safeTrim(message.senderLabel) || 'Message',
      previewText: previewText.length > 140 ? `${previewText.slice(0, 137)}...` : previewText,
    };
    setSelectedReplyContext(replyContext);
    composerInputRef.current?.focus();
    console.log('[IVXOwnerChatRoute] Reply context selected:', replyContext.messageId);
    void recordIVXOwnerChatAuditEvent({
      action: 'reply_context',
      conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
      messageId: replyContext.messageId,
      status: 'success',
      summary: 'Owner selected a reply context in IVX Owner AI.',
      metadata: { senderLabel: replyContext.senderLabel, sessionId: ownerSessionIdRef.current },
    });
  }, [conversationQuery.data?.id]);

  const handleJumpToMessage = useCallback((messageId: string) => {
    const targetIndex = displayedMessages.findIndex((message) => message.id === messageId);
    const targetExistsOutsideSearch = searchActive && allMessages.some((message) => message.id === messageId);
    if (targetIndex < 0 && !targetExistsOutsideSearch) {
      console.log('[IVXOwnerChatRoute] Reply context original message missing:', messageId);
      setMissingReplyMessageId(messageId);
      Alert.alert('Original message unavailable', 'That replied-to message is not in this room anymore. The reply preview remains visible.');
      return;
    }

    if (highlightedMessageTimeoutRef.current) {
      clearTimeout(highlightedMessageTimeoutRef.current);
    }

    setMissingReplyMessageId(null);
    suppressAutoScrollUntilRef.current = Date.now() + 2200;
    setHighlightedMessageId(messageId);
    highlightedMessageTimeoutRef.current = setTimeout(() => {
      setHighlightedMessageId((current) => current === messageId ? null : current);
      highlightedMessageTimeoutRef.current = null;
    }, 1600);

    const scrollToTarget = (messages: IVXMessage[]) => {
      const resolvedIndex = messages.findIndex((message) => message.id === messageId);
      if (resolvedIndex < 0) {
        pendingJumpMessageIdRef.current = messageId;
        console.log('[IVXOwnerChatRoute] Reply context jump pending until full thread renders:', messageId);
        return;
      }
      pendingJumpMessageIdRef.current = null;
      flatListRef.current?.scrollToIndex({ index: resolvedIndex, animated: true, viewPosition: 0.35 });
      console.log('[IVXOwnerChatRoute] Jumped to reply context:', messageId, 'index:', resolvedIndex);
    };

    if (searchActive) {
      pendingJumpMessageIdRef.current = messageId;
      setMessageSearchQuery('');
      setTimeout(() => scrollToTarget(allMessages), 160);
      return;
    }

    scrollToTarget(displayedMessages);
  }, [allMessages, displayedMessages, searchActive]);

  const handleTogglePinnedMessage = useCallback((message: ChatMessage) => {
    setPinnedMessageIds((current) => {
      if (current.includes(message.id)) {
        console.log('[IVXOwnerChatRoute] Unpinned owner-room message:', message.id);
        void recordIVXOwnerChatAuditEvent({
          action: 'pin_message',
          conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
          messageId: message.id,
          status: 'success',
          summary: 'Owner unpinned a message in IVX Owner AI.',
          metadata: { pinned: false, sessionId: ownerSessionIdRef.current },
        });
        return current.filter((messageId) => messageId !== message.id);
      }

      console.log('[IVXOwnerChatRoute] Pinned owner-room message:', message.id);
      void recordIVXOwnerChatAuditEvent({
        action: 'pin_message',
        conversationId: conversationQuery.data?.id ?? IVX_OWNER_AI_PROFILE.sharedRoom.id,
        messageId: message.id,
        status: 'success',
        summary: 'Owner pinned a message in IVX Owner AI.',
        metadata: { pinned: true, sessionId: ownerSessionIdRef.current },
      });
      return [...current, message.id].filter((messageId, index, messageIds) => messageIds.indexOf(messageId) === index);
    });
  }, [conversationQuery.data?.id]);

  const renderMessage = useCallback(({ item, index }: { item: IVXMessage; index: number }) => {
    const previousMessage = index > 0 ? displayedMessages[index - 1] : null;
    const currentDayKey = formatMessageDateKey(item.createdAt);
    const previousDayKey = previousMessage ? formatMessageDateKey(previousMessage.createdAt) : null;
    const shouldShowDateSeparator = currentDayKey !== previousDayKey;
    const ownMessage = isOwnMessage(item, ownerId);
    const isAssistant = item.senderRole === 'assistant';
    const isSystem = item.senderRole === 'system';

    if (isSystem) {
      const structuredRows = parseStructuredSystemMessage(item.body);
      return (
        <>
          {shouldShowDateSeparator ? <DateSeparator value={item.createdAt} /> : null}
          <View style={styles.systemMessageRow} testID={`ivx-owner-message-${item.id}`}>
          <View style={styles.systemBubble}>
            <View style={styles.systemLabelRow}>
              <Terminal size={12} color={Colors.info} />
              <Text style={styles.systemLabel}>{structuredRows ? 'Command Result' : 'System'}</Text>
            </View>
            {structuredRows ? (
              <View style={styles.commandCard} testID={`ivx-owner-command-card-${item.id}`}>
                {structuredRows.map((row, index) => (
                  <View key={`${item.id}-${row.label}-${index}`} style={styles.commandRow}>
                    <Text style={styles.commandLabel}>{row.label}</Text>
                    <Text style={styles.commandValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
            ) : item.body ? <Text style={styles.systemText}>{item.body}</Text> : null}
            <Text style={styles.systemMeta}>{formatMessageTime(item.createdAt)}</Text>
          </View>
        </View>
        </>
      );
    }

    const pendingState = pendingOwnerMessages.find((pendingMessage) => pendingMessage.clientId === item.id);
    const parsedReplyBody = pendingState?.replyTo ? { replyTo: pendingState.replyTo, body: item.body ?? '' } : parseReplyBody(item.body);
    const chatMessage = {
      id: item.id,
      conversationId: item.conversationId,
      senderId: item.senderUserId ?? item.senderRole,
      senderLabel: isAssistant ? (item.senderLabel ?? IVX_OWNER_AI_PROFILE.name) : (item.senderLabel ?? 'IVX Owner'),
      text: parsedReplyBody.body,
      replyTo: parsedReplyBody.replyTo,
      createdAt: item.createdAt,
      sendStatus: pendingState?.status === 'uploading' || pendingState?.status === 'uploaded' ? 'sending' : (pendingState?.status ?? 'sent'),
      optimistic: pendingState?.status === 'sending' || pendingState?.status === 'uploading' || pendingState?.status === 'uploaded',
      localOnly: Boolean(pendingState),
      readBy: ownMessage && !pendingState ? ['owner', 'assistant'] : undefined,
      fileUrl: item.attachmentUrl ?? undefined,
      fileName: item.attachmentName ?? undefined,
      fileMime: item.attachmentMime ?? undefined,
      fileSize: item.attachmentSize ?? undefined,
      fileType: item.attachmentKind === 'image'
        ? 'image'
        : item.attachmentKind === 'video'
          ? 'video'
          : item.attachmentKind === 'pdf'
            ? 'pdf'
            : item.attachmentUrl
              ? 'file'
              : undefined,
    } satisfies ChatMessage;

    return (
      <>
        {shouldShowDateSeparator ? <DateSeparator value={item.createdAt} /> : null}
        <View
          style={[
            styles.messageRow,
            ownMessage ? styles.messageRowOwn : styles.messageRowOther,
            highlightedMessageId === item.id ? styles.messageRowHighlighted : null,
          ]}
          testID={`ivx-owner-message-${item.id}`}
        >
          <MessageBubble
            message={chatMessage}
            isMine={ownMessage}
            searchQuery={messageSearchQuery}
            onRetry={handleRetryMessage}
            onDismiss={handleDismissFailedMessage}
            onTogglePin={handleTogglePinnedMessage}
            onReply={handleStartReplyToMessage}
            onOpenReplyContext={handleJumpToMessage}
            isPinned={pinnedMessageIdSet.has(item.id)}
          />
        </View>
      </>
    );
  }, [displayedMessages, handleDismissFailedMessage, handleJumpToMessage, handleRetryMessage, handleStartReplyToMessage, handleTogglePinnedMessage, highlightedMessageId, messageSearchQuery, ownerId, pendingOwnerMessages, pinnedMessageIdSet]);

  useEffect(() => {
    const pendingMessageId = pendingJumpMessageIdRef.current;
    if (!pendingMessageId) {
      return;
    }

    const targetIndex = displayedMessages.findIndex((message) => message.id === pendingMessageId);
    if (targetIndex < 0) {
      return;
    }

    suppressAutoScrollUntilRef.current = Date.now() + 2200;
    flatListRef.current?.scrollToIndex({ index: targetIndex, animated: true, viewPosition: 0.35 });
    pendingJumpMessageIdRef.current = null;
    console.log('[IVXOwnerChatRoute] Completed pending reply context jump:', pendingMessageId, 'index:', targetIndex);
  }, [displayedMessages]);

  const loading = messagesQuery.isLoading || conversationQuery.isLoading;
  const refreshing = messagesQuery.isRefetching || conversationQuery.isRefetching;
  const isRecordingVoice = recorderState.isRecording;
  const isTranscribingVoice = transcribeVoiceMutation.isPending;
  const isBusy = messageSendPending || attachmentMutation.isPending || isPickingFile || isRecordingVoice || isTranscribingVoice;
  const sendingDisabled = !composerHasText || isBusy;
  const attachmentDisabled = attachmentMutation.isPending || isPickingFile || isRecordingVoice || isTranscribingVoice;
  const composerPlaceholder = attachmentMutation.isPending
    ? 'Uploading attachment...'
    : isPickingFile
      ? 'Choosing attachment...'
      : messageSendPending
        ? 'Sending message...'
        : 'Message IVX Owner AI';
  const activeFallbackForCurrentMessage = shouldShowFallbackUI({
    source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
    requestStage: runtimeDebugSnapshot.requestStage,
    failureClass: runtimeDebugSnapshot.failureClass,
    isFallback: runtimeDebugSnapshot.source === 'provider_fallback',
    isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
    hasVisibleResponseText: runtimeDebugSnapshot.hasVisibleResponseText,
  });
  const primaryState = useMemo<'loading' | 'room_error' | 'ready'>(() => {
    if (loading && allMessages.length === 0) {
      return 'loading';
    }

    if ((messagesQuery.error || conversationQuery.error) && allMessages.length === 0) {
      return 'room_error';
    }

    return 'ready';
  }, [allMessages.length, conversationQuery.error, loading, messagesQuery.error]);
  const messageAudit = useMemo(() => {
    const ownerMessages = allMessages.filter((message) => isOwnMessage(message, ownerId)).length;
    const assistantMessages = allMessages.filter((message) => message.senderRole === 'assistant').length;

    return {
      ownerMessages,
      assistantMessages,
    };
  }, [allMessages, ownerId]);
  const lastSendAudit = useMemo<IVXOwnerSendAudit | null>(() => {
    return ivxChatService.getLastOwnerSendAudit();
  }, [allMessages.length, aiReplyPending, messageSendPending, attachmentMutation.isPending, isPickingFile]);
  const lastReceiveAudit = useMemo<IVXOwnerReceiveAudit | null>(() => {
    return ivxChatService.getLastOwnerReceiveAudit();
  }, [allMessages.length, realtimeEventsObserved, realtimeSubscriptionState]);
  const realtimeSubscriptionAudit = useMemo<IVXOwnerRealtimeSubscriptionAudit>(() => {
    return ivxChatService.getOwnerRealtimeSubscriptionAudit();
  }, [allMessages.length, realtimeEventsObserved, realtimeSubscriptionState]);
  const deliveryBranchStatus = useMemo<DeliveryBranchStatus>(() => {
    return getDeliveryBranchStatus(lastSendAudit);
  }, [lastSendAudit]);
  const receiveBranchStatus = useMemo<ReceiveBranchStatus>(() => {
    return getReceiveBranchStatus(lastReceiveAudit);
  }, [lastReceiveAudit]);
  const runtimeSnapshot = useMemo(() => {
    return buildIVXRoomRuntimeSnapshot({
      roomId: conversationQuery.data?.id ?? 'ivx-owner-room',
      roomStatus: ivxRoomStatus,
      roomProbeObservedAt: roomProbeAt,
      aiHealth: effectiveAiHealthDetail,
      aiProbeObservedAt: aiProbeMetadata.observedAt,
      aiSource: runtimeSignals.aiBackendSource ?? 'unknown',
      aiEndpoint: runtimeDebugSnapshot.endpoint ?? aiProbeMetadata.endpoint,
      deploymentMarker: runtimeDebugSnapshot.deploymentMarker ?? aiProbeMetadata.deploymentMarker,
      model: runtimeSignals.aiBackendSource === 'local_app_brain' ? 'ivx-local-app-brain' : runtimeSignals.aiBackendSource === 'remote_api' ? 'ivx-owner-remote' : 'unverified',
      messages: allMessages,
      messageSendPending,
      aiReplyPending,
      attachmentPending: attachmentMutation.isPending || isPickingFile,
      lastSendAt,
      lastReplyAt,
      sendFailures,
      replyFailures,
      fallbackSuccessCount,
      realtimeEventsObserved,
      latencySamplesMs,
      realtimeSubscriptionState,
      deliveryProof: {
        sendBranch: deliveryBranchStatus.branch,
        sendTitle: deliveryBranchStatus.title,
        sendDetail: deliveryBranchStatus.detail,
        sendEvidence: deliveryBranchStatus.evidence,
        sendObservedAt: lastSendAudit?.observedAt ?? null,
        receiveBranch: receiveBranchStatus.branch,
        receiveTitle: receiveBranchStatus.title,
        receiveDetail: receiveBranchStatus.detail,
        receiveEvidence: receiveBranchStatus.evidence,
        receiveObservedAt: lastReceiveAudit?.observedAt ?? null,
      },
    });
  }, [
    effectiveAiHealthDetail,
    aiProbeMetadata.deploymentMarker,
    aiProbeMetadata.endpoint,
    aiProbeMetadata.observedAt,
    aiReplyPending,
    allMessages,
    attachmentMutation.isPending,
    conversationQuery.data?.id,
    deliveryBranchStatus.branch,
    deliveryBranchStatus.detail,
    deliveryBranchStatus.evidence,
    deliveryBranchStatus.title,
    isPickingFile,
    ivxRoomStatus,
    lastReceiveAudit?.observedAt,
    lastReplyAt,
    lastSendAt,
    lastSendAudit?.observedAt,
    latencySamplesMs,
    messageSendPending,
    realtimeEventsObserved,
    realtimeSubscriptionState,
    receiveBranchStatus.branch,
    receiveBranchStatus.detail,
    receiveBranchStatus.evidence,
    receiveBranchStatus.title,
    replyFailures,
    fallbackSuccessCount,
    roomProbeAt,
    runtimeDebugSnapshot.deploymentMarker,
    runtimeDebugSnapshot.endpoint,
    runtimeSignals.aiBackendSource,
    sendFailures,
  ]);
  const backendAuditSummary = useMemo<BackendAuditSummary>(() => {
    const configuredBaseUrl = ownerAIConfigAudit.configuredBaseUrl;
    const activeBaseUrl = ownerAIConfigAudit.activeBaseUrl;
    const configSource = ownerAIConfigAudit.configuredFrom ?? (ownerAIConfigAudit.fallbackUsed ? 'EXPO_PUBLIC_PROJECT_ID derived dev fallback' : 'unconfigured');
    const activeEndpoint = aiProbeMetadata.endpoint ?? ownerAIConfigAudit.activeEndpoint ?? 'unconfigured';
    const lastFailureReason = aiProbeMetadata.lastFailureReason?.toLowerCase() ?? '';

    let failureMode = ownerAIConfigAudit.configurationError ?? 'No backend probe failure captured yet.';
    let recommendedResolution = ownerAIConfigAudit.currentEnvironment === 'production'
      ? 'Set EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL to the intended public Owner AI base URL for production.'
      : 'Set EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL to pin development to a specific backend, or keep the project-scoped fallback derived from EXPO_PUBLIC_PROJECT_ID.';

    if (ownerAIConfigAudit.mismatchWarnings.length > 0) {
      failureMode = ownerAIConfigAudit.mismatchWarnings[0] ?? failureMode;
      recommendedResolution = 'Align the owner-room host, the app-wide API host, and the DNS audit target before debugging the upstream runtime further.';
    }

    if (!ownerAIRoutingBlocked && ownerAIConfigAudit.fallbackUsed) {
      failureMode = 'Development routing is using the project-scoped fallback derived from EXPO_PUBLIC_PROJECT_ID because no explicit owner AI base URL is configured.';
      recommendedResolution = 'This is allowed in development. Set EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL if you want dev to target a fixed backend instead of the EXPO_PUBLIC_PROJECT_ID fallback.';
    }

    if (lastFailureReason.includes('could not resolve host') || lastFailureReason.includes('failed to fetch') || lastFailureReason.includes('network request failed') || lastFailureReason.includes('load failed')) {
      failureMode = `The active endpoint was unreachable from the client runtime. Last failure: ${aiProbeMetadata.lastFailureReason ?? 'network resolution failure'}.`;
      recommendedResolution = activeBaseUrl
        ? `Verify DNS and public reachability for ${activeBaseUrl}. If this backend is private or internal-only, point this build to the correct public Owner AI base URL via EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL.`
        : recommendedResolution;
    }

    if (ownerAIConfigAudit.currentEnvironment === 'production' && !ownerAIRoutingBlocked && lastFailureReason) {
      recommendedResolution = `${recommendedResolution} Production does not silently downgrade Owner AI routing to a dev host or provider-backed health state when the configured remote endpoint fails.`;
    }

    if (ownerAIRoutingBlocked && ownerAIConfigAudit.currentEnvironment === 'production') {
      recommendedResolution = ownerAIConfigAudit.pointsToDevHost
        ? 'Replace the development-like Owner AI host with the intended production public URL in EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL.'
        : 'Provide EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL in production. No implicit fallback to EXPO_PUBLIC_IVX_API_BASE_URL or project-scoped dev hosts is allowed.';
    }

    return {
      currentEnvironment: ownerAIConfigAudit.currentEnvironment,
      routingPolicy: ownerAIConfigAudit.routingPolicy,
      auditState: ownerAIRoutingBlocked
        ? 'guard_blocked'
        : ownerAIConfigAudit.mismatchWarnings.length > 0
          ? 'split_host_path'
          : effectiveAiHealthDetail === 'active'
            ? 'live'
            : effectiveAiHealthDetail === 'degraded'
              ? 'degraded'
              : 'probing_or_unverified',
      configSource,
      explicitProductionPin: ownerAIConfigAudit.explicitProductionPinApplied
        ? `yes — ${ownerAIConfigAudit.configuredBaseUrl ?? ownerAIConfigAudit.canonicalBaseUrl}`
        : 'no',
      configuredOwnerAIBaseUrl: configuredBaseUrl ?? 'unconfigured',
      activeBaseUrl: activeBaseUrl ?? 'blocked',
      activeHost: ownerAIConfigAudit.activeHost ?? 'unconfigured',
      activeEndpoint,
      directApiBaseUrl: ownerAIConfigAudit.directApiBaseUrl ?? 'unconfigured',
      directApiHost: ownerAIConfigAudit.directApiHost ?? 'unconfigured',
      ownerAiHealthUrl: ownerAIConfigAudit.healthCheckUrl ?? 'unconfigured',
      ownerRoute53AuditUrl: ownerAIConfigAudit.route53AuditUrl ?? 'unconfigured',
      ownerRoute53UpsertUrl: ownerAIConfigAudit.route53UpsertUrl ?? 'unconfigured',
      appApiHealthUrl: ownerAIConfigAudit.appApiHealthCheckUrl ?? 'unconfigured',
      appApiRoute53AuditUrl: ownerAIConfigAudit.appApiRoute53AuditUrl ?? 'unconfigured',
      devFallbackBaseUrl: ownerAIConfigAudit.devFallbackBaseUrl ?? 'unconfigured',
      activeFallbackBaseUrl: ownerAIConfigAudit.fallbackUsed ? (ownerAIConfigAudit.activeBaseUrl ?? 'unconfigured') : 'not-active',
      selectionReason: ownerAIConfigAudit.selectionReason,
      fallbackUsed: ownerAIConfigAudit.fallbackUsed ? `yes — ${ownerAIConfigAudit.fallbackReason ?? 'development fallback applied'}` : 'no',
      whyFallbackSelected: ownerAIConfigAudit.fallbackReason ?? (ownerAIConfigAudit.fallbackUsed ? ownerAIConfigAudit.selectionReason : 'Fallback not selected.'),
      wasFallbackUsed: ownerAIConfigAudit.fallbackUsed ? 'yes' : 'no',
      productionGuard: ownerAIRoutingBlocked
        ? `blocked — ${ownerAIConfigAudit.configurationError ?? 'Owner AI routing guard rejected this configuration.'}`
        : ownerAIConfigAudit.currentEnvironment === 'production'
          ? 'pass — production routing is explicitly set by EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL'
          : 'pass — development routing policy allows explicit or project-scoped fallback',
      productionGuardBlocked: ownerAIRoutingBlocked,
      failureMode,
      recommendedResolution,
      gracefulDegradationNote: ownerAIRoutingBlocked
        ? 'The room stays mounted, message sending still works, and AI health is forced inactive so production cannot appear healthy while misrouted.'
        : ownerAIConfigAudit.currentEnvironment === 'production'
          ? 'When the configured production backend is unreachable, the UI remains interactive, the thread stays mounted, a safe audit fallback message is persisted in-chat, and health stays inactive instead of silently switching to a development-style runtime fallback.'
          : 'When the owner AI backend is unreachable, the UI remains interactive, the thread stays mounted, and a safe audit fallback response can keep development moving while routing is audited.',
      workflowTrace: ownerAIConfigAudit.workflowTrace,
      mismatchWarnings: ownerAIConfigAudit.mismatchWarnings,
    };
  }, [aiProbeMetadata.endpoint, aiProbeMetadata.lastFailureReason, effectiveAiHealthDetail, ownerAIConfigAudit, ownerAIRoutingBlocked]);

  const auditReport = useMemo(() => {
    return buildIVXChatAuditReport({
      openAccessEnabled: isOpenAccessBuild,
      ownerAuthenticated: !!user || !!userId,
      conversationReady: !!conversationQuery.data?.id && !conversationQuery.error,
      messageListReady: !messagesQuery.error,
      roomStatus: ivxRoomStatus,
      runtimeSnapshot,
      aiIndicatorState: resolution.aiIndicator.state,
      aiIndicatorLabel: resolution.aiIndicator.label,
      aiIndicatorDetail: resolution.aiIndicator.detail,
      ownerAIConfigAudit,
      activeEndpoint: backendAuditSummary.activeEndpoint,
      lastFailureReason: aiProbeMetadata.lastFailureReason,
      sendFailures,
      replyFailures,
      fallbackSuccessCount,
      realtimeEventsObserved,
      realtimeSubscriptionState,
      messageCount: allMessages.length,
      assistantMessageCount: messageAudit.assistantMessages,
    });
  }, [
    aiProbeMetadata.lastFailureReason,
    allMessages.length,
    backendAuditSummary.activeEndpoint,
    conversationQuery.data?.id,
    conversationQuery.error,
    isOpenAccessBuild,
    ivxRoomStatus,
    messageAudit.assistantMessages,
    messagesQuery.error,
    ownerAIConfigAudit,
    realtimeEventsObserved,
    realtimeSubscriptionState,
    replyFailures,
    fallbackSuccessCount,
    resolution.aiIndicator.detail,
    resolution.aiIndicator.label,
    resolution.aiIndicator.state,
    runtimeSnapshot,
    sendFailures,
    user,
    userId,
  ]);
  const topStatusNote = useMemo(() => {
    const normalizedRuntimeState = {
      source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
      requestStage: runtimeDebugSnapshot.requestStage,
      failureClass: runtimeDebugSnapshot.failureClass,
      isFallback: runtimeDebugSnapshot.source === 'provider_fallback',
      isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
      hasVisibleResponseText: runtimeDebugSnapshot.hasVisibleResponseText,
    };

    if (hasRuntimeFailure(normalizedRuntimeState) && !normalizedRuntimeState.hasVisibleResponseText) {
      return 'Message saved. Please try again shortly.';
    }

    return null;
  }, [runtimeDebugSnapshot]);
  const ownerAIProofStatus = useMemo<OwnerAIProofStatus>(() => {
    if (localFirstChatMode) {
      return {
        id: 'local_app_brain_ready',
        tone: 'pass',
        title: 'local IVX brain ready',
        detail: 'The IVX chat room is running from the app first. Normal messages, assistant replies, attachments, and reloads stay available on this device.',
        evidence: 'local_device_only · local_app_brain · optional_backend_later',
        testID: 'ivx-owner-proof-local-app-brain-ready',
      };
    }

    if (devTestMode.testModeActive) {
      return {
        id: 'remote_api_verified',
        tone: 'pass',
        title: 'owner test mode active',
        detail: 'Verified owner session is active. Owner actions can use the live response path.',
        evidence: 'owner_room_authenticated · backend_admin_verified · full_backend_execution',
        testID: 'ivx-owner-proof-test-mode-active',
      };
    }

    const normalizedRuntimeState = {
      source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
      requestStage: runtimeDebugSnapshot.requestStage,
      failureClass: runtimeDebugSnapshot.failureClass,
      isFallback: runtimeDebugSnapshot.source === 'provider_fallback',
      isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
      hasVisibleResponseText: runtimeDebugSnapshot.hasVisibleResponseText,
    };
    const requestIsPending = isPendingRequestState(normalizedRuntimeState);
    const activeFallback = shouldShowFallbackUI(normalizedRuntimeState);
    const missingOwnerAuth = !ownerRoomAuthenticated;
    const remoteApiVerified = runtimeSnapshot.provider.source === 'remote_api'
      && auditReport.remoteReplyVerified
      && safeTrim(runtimeSnapshot.provider.endpoint).length;

    if (remoteApiVerified) {
      return {
        id: 'remote_api_verified',
        tone: 'pass',
        title: 'remote_api verified',
        detail: 'The deployed IVX endpoint answered the room probe and remote reply proof is verified in this runtime snapshot.',
        evidence: `${runtimeSnapshot.provider.endpoint ?? backendAuditSummary.activeEndpoint} · deployment ${runtimeSnapshot.provider.deploymentMarker ?? 'missing'} · source ${runtimeSnapshot.provider.source}`,
        testID: 'ivx-owner-proof-remote-api-verified',
      };
    }

    if (missingOwnerAuth) {
      return {
        id: 'blocked_by_auth',
        tone: 'blocked',
        title: 'blocked by auth',
        detail: 'Remote admin proof is blocked because owner-room trust is not established in this runtime yet. Normal owner chat should only require room trust, not repeated backend re-verification.',
        evidence: `${backendAuditSummary.currentEnvironment} runtime · source ${runtimeSnapshot.provider.source} · endpoint ${runtimeSnapshot.provider.endpoint ?? backendAuditSummary.activeEndpoint}`,
        testID: 'ivx-owner-proof-blocked-by-auth',
      };
    }

    if (activeFallback && !requestIsPending) {
      const fallbackHasVisibleReply = normalizedRuntimeState.hasVisibleResponseText === true;
      return {
        id: 'dev_fallback',
        tone: fallbackHasVisibleReply ? 'pass' : 'pending',
        title: fallbackHasVisibleReply ? 'assistant ready' : 'assistant path pending',
        detail: fallbackHasVisibleReply
          ? 'Reply delivered cleanly.'
          : 'Normal conversation stays available while the reply path recovers.',
        evidence: runtimeSnapshot.provider.endpoint ?? backendAuditSummary.activeEndpoint,
        testID: fallbackHasVisibleReply ? 'ivx-owner-proof-assistant-ready' : 'ivx-owner-proof-assistant-pending',
      };
    }

    return {
      id: 'remote_api_unverified',
      tone: 'pending',
      title: 'remote_api pending proof',
      detail: 'Remote routing is configured, but a fresh verified remote reply proof has not landed yet in this room snapshot.',
      evidence: `${runtimeSnapshot.provider.endpoint ?? backendAuditSummary.activeEndpoint} · runtime ${runtimeSnapshot.runtimeStatus} · stream ${runtimeSnapshot.streamStatus}`,
      testID: 'ivx-owner-proof-remote-api-pending',
    };
  }, [auditReport.remoteReplyVerified, backendAuditSummary.activeEndpoint, backendAuditSummary.activeFallbackBaseUrl, backendAuditSummary.currentEnvironment, backendAuditSummary.fallbackUsed, devTestMode.testModeActive, localFirstChatMode, ownerRoomAuthenticated, runtimeDebugSnapshot, runtimeSnapshot.provider.deploymentMarker, runtimeSnapshot.provider.endpoint, runtimeSnapshot.provider.source, runtimeSnapshot.runtimeStatus, runtimeSnapshot.streamStatus]);
  const qaChecklist = useMemo<QAProofItem[]>(() => {
    const canUseComposer = primaryState === 'ready';
    const hasRoom = !!conversationQuery.data?.id && !conversationQuery.error;
    const sendReady = canUseComposer && !isBusy;
    const assistantReady = resolution.aiIndicator.state === 'available' || resolution.aiIndicator.state === 'degraded' || isOpenAccessBuild;
    const transcriptHealthy = runtimeSnapshot.transcriptIntegrity === 'verified';

    return [
      {
        id: 'dev-unblock',
        label: 'Room access',
        passed: ownerRoomAuthenticated,
        detail: ownerRoomAuthenticated
          ? `Room trust active as ${isOpenAccessBuild ? 'open_access_dev_bypass' : 'owner_room_authenticated'}.`
          : 'Owner room trust is not established yet.',
      },
      {
        id: 'room-bootstrap',
        label: 'Room bootstrap',
        passed: hasRoom,
        detail: hasRoom
          ? `Room ready: ${conversationQuery.data?.title ?? IVX_OWNER_AI_PROFILE.sharedRoom.title}.`
          : conversationQuery.error?.message ?? 'Owner room is still bootstrapping.',
      },
      {
        id: 'thread-load',
        label: 'Thread load',
        passed: !messagesQuery.error,
        detail: messagesQuery.error
          ? messagesQuery.error.message
          : allMessages.length > 0
            ? `${allMessages.length} message(s) loaded in the thread.`
            : 'Thread is open and ready for the first message.',
      },
      {
        id: 'composer-dock',
        label: 'Composer dock',
        passed: canUseComposer,
        detail: canUseComposer
          ? 'Input and send controls stay docked above the bottom inset.'
          : 'Composer is intentionally hidden while the room is recovering.',
      },
      {
        id: 'send-path',
        label: 'Send path',
        passed: sendReady,
        detail: sendReady
          ? sendingDisabled
            ? 'Send button is visible. Enter text to enable sending.'
            : 'Send button is visible and ready to deliver the next message.'
          : 'Send path is temporarily busy with an active send or upload.',
      },
      {
        id: 'assistant-path',
        label: 'Assistant path',
        passed: assistantReady,
        detail: ownerAIRoutingBlocked
          ? `Blocked by routing guard. ${ownerAIConfigAudit.configurationError ?? 'Owner AI production configuration is invalid.'}`
          : `${resolution.aiIndicator.label}. ${resolution.aiIndicator.detail} Source: ${runtimeSnapshot.provider.source}. Endpoint: ${backendAuditSummary.activeEndpoint}.`,
      },
      {
        id: 'provider-proof-mode',
        label: 'Provider proof mode',
        passed: ownerAIProofStatus.id === 'remote_api_verified',
        detail: `${ownerAIProofStatus.title}. ${ownerAIProofStatus.detail} Evidence: ${ownerAIProofStatus.evidence}.`,
      },
      {
        id: 'transcript-proof',
        label: 'Transcript proof',
        passed: transcriptHealthy,
        detail: runtimeSnapshot.duplicateWriteDetected
          ? 'Duplicate transcript write risk detected in the loaded thread.'
          : messageAudit.assistantMessages > 0
            ? `${messageAudit.ownerMessages} owner message(s) and ${messageAudit.assistantMessages} assistant reply/replies detected with ordered transcript audit.`
            : messageAudit.ownerMessages > 0
              ? `${messageAudit.ownerMessages} owner message(s) detected. Awaiting an assistant reply proof in this loaded thread.`
              : 'No persisted proof messages yet in this session.',
      },
    ];
  }, [
    allMessages.length,
    conversationQuery.data?.id,
    conversationQuery.data?.title,
    conversationQuery.error,
    backendAuditSummary.activeEndpoint,
    isBusy,
    isOpenAccessBuild,
    ownerAIConfigAudit.configurationError,
    ownerAIRoutingBlocked,
    messageAudit.assistantMessages,
    messageAudit.ownerMessages,
    messagesQuery.error,
    ownerAIProofStatus.detail,
    ownerAIProofStatus.evidence,
    ownerAIProofStatus.id,
    ownerAIProofStatus.title,
    ownerRoomAuthenticated,
    primaryState,
    resolution.aiIndicator.detail,
    resolution.aiIndicator.label,
    resolution.aiIndicator.state,
    runtimeSnapshot.duplicateWriteDetected,
    runtimeSnapshot.provider.source,
    runtimeSnapshot.transcriptIntegrity,
    sendingDisabled,
  ]);
  const qaOverallPassed = useMemo(() => qaChecklist.every((item) => item.passed), [qaChecklist]);
  const functionalityProofList = useMemo<IVXFunctionalityProofItem[]>(() => {
    return buildIVXFunctionalityProofList(auditReport, runtimeSnapshot);
  }, [auditReport, runtimeSnapshot]);
  const functionalityProofCounts = useMemo(() => {
    return functionalityProofList.reduce(
      (counts, item) => {
        if (item.status === 'live') {
          counts.live += 1;
        } else if (item.status === 'pass') {
          counts.pass += 1;
        } else {
          counts.fail += 1;
        }
        return counts;
      },
      { live: 0, pass: 0, fail: 0 },
    );
  }, [functionalityProofList]);
  useEffect(() => {
    auditReportRef.current = auditReport;
  }, [auditReport]);
  const ownerGraphNodes = useMemo<CTSystemNode[]>(() => {
    if (!nerveSnapshot) {
      return [];
    }

    const allowedNodeIds = new Set<string>([
      'module:chat',
      'module:ai_ops',
      'module:realtime_sync',
      'service:chat_transport',
      'service:ai_runtime',
      'service:shared_room',
      'service:inbox_sync',
      'service:realtime',
    ]);

    return nerveSnapshot.systemNodes
      .filter((node) => allowedNodeIds.has(node.id))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [nerveSnapshot]);
  const ownerGraphProofs = useMemo<CTEvidenceRecord[]>(() => {
    if (!nerveSnapshot) {
      return [];
    }

    return nerveSnapshot.evidence
      .filter((proof) => proof.subjectId.includes('chat') || proof.subjectId.includes('ai_') || proof.subjectId.includes('shared_room') || proof.subjectId.includes('realtime') || proof.subjectId.includes('inbox_sync'))
      .sort((a, b) => new Date(b.observedAt).getTime() - new Date(a.observedAt).getTime())
      .slice(0, 3);
  }, [nerveSnapshot]);
  const ownerGraphRisks = useMemo<CTRiskAssessment[]>(() => {
    if (!nerveSnapshot) {
      return [];
    }

    return nerveSnapshot.riskAssessments
      .filter((risk) => risk.subjectId.includes('chat') || risk.subjectId.includes('ai_ops') || risk.subjectId.includes('realtime_sync'))
      .sort((a, b) => b.currentRiskScore - a.currentRiskScore)
      .slice(0, 3);
  }, [nerveSnapshot]);
  const ownerActionFeed = useMemo<CTOperatorActionRun[]>(() => {
    if (!nerveSnapshot) {
      return [];
    }

    return nerveSnapshot.actionRuns
      .filter((action) => action.targetId.includes('chat') || action.targetId.includes('ai_ops') || action.targetId.includes('realtime_sync'))
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 2);
  }, [nerveSnapshot]);
  const roomControlMutation = useMutation<{ success: boolean; message: string }, Error, 'rerun_health_probe' | 'transition_stuck_sends'>({
    mutationFn: async (action) => {
      console.log('[IVXOwnerChatRoute] Executing room control action:', action);
      return executeOperatorAction(action, 'chat');
    },
    onSuccess: async (result, action) => {
      invalidateIVXRoomProbeCache();
      await queryClient.invalidateQueries({ queryKey: IVX_ROOM_STATUS_QUERY_KEY });
      setAiHealthDetail('inactive');
      const affectedDependencies = ownerGraphNodes.slice(0, 3).map((node) => node.name).join(' → ') || 'chat transport';
      const linkedProofs = ownerGraphProofs.slice(0, 2).map((proof) => proof.claim).join(' | ') || 'No fresh linked proofs yet';
      await persistSupportMessage([
        `Result: ${result.success ? 'success' : 'failed'}`,
        `Explanation: ${result.message}`,
        `Evidence: ${linkedProofs}`,
        `Dependencies: ${affectedDependencies}`,
        `Action: ${getActionLabel(action)}`,
        `Rollback: ${action === 'transition_stuck_sends' ? 'available' : 'not required'}`,
      ].join('\n'), 'system');
    },
    onError: async (error, action) => {
      await persistSupportMessage([
        'Result: failed',
        `Explanation: ${error.message}`,
        `Evidence: ${ownerGraphProofs.slice(0, 1).map((proof) => proof.claim).join(' | ') || 'No fresh linked proofs yet'}`,
        `Dependencies: ${ownerGraphNodes.slice(0, 3).map((node) => node.name).join(' → ') || 'chat transport'}`,
        `Action: ${getActionLabel(action)}`,
        'Rollback: not executed',
      ].join('\n'), 'system');
    },
  });
  useEffect(() => {
    roomRuntimeRef.current = runtimeSnapshot;
  }, [runtimeSnapshot]);

  const proofBadgeTone = useMemo<'pass' | 'warn' | 'blocked' | 'pending'>(() => {
    if (runtimeSnapshot.runtimeStatus === 'live') return 'pass';
    if (runtimeSnapshot.runtimeStatus === 'blocked') return 'blocked';
    if (runtimeSnapshot.runtimeStatus === 'probing') return 'pending';
    return 'warn';
  }, [runtimeSnapshot.runtimeStatus]);
  const proofBadgeLabel = useMemo<string>(() => {
    if (runtimeSnapshot.runtimeStatus === 'live') return 'Live';
    if (runtimeSnapshot.runtimeStatus === 'blocked') return 'Blocked';
    if (runtimeSnapshot.runtimeStatus === 'probing') return 'Probing';
    return activeFallbackForCurrentMessage ? 'Recovering' : 'Review';
  }, [activeFallbackForCurrentMessage, runtimeSnapshot.runtimeStatus]);
  const proofRows = useMemo<IVXProofRecord[]>(() => runtimeSnapshot.proofs, [runtimeSnapshot.proofs]);
  const liveChatMetric = useMemo(() => {
    return liveSnapshot.moduleMetrics.find((metric) => metric.moduleId === 'chat') ?? null;
  }, [liveSnapshot.moduleMetrics]);
  const liveTopSource = useMemo(() => {
    return liveSnapshot.sourceMetrics[0] ?? null;
  }, [liveSnapshot.sourceMetrics]);
  const qaScopeNote = useMemo(() => {
    if (isOpenAccessBuild) {
      return 'Shared room/composer fixes are in shared code. Direct room-open bypass remains dev-only.';
    }

    return 'This route is running the shared room/composer fixes in the standard owner flow.';
  }, [isOpenAccessBuild]);
  const handleRoomControlActionPress = useCallback((action: 'rerun_health_probe' | 'transition_stuck_sends') => {
    if (devTestMode.testModeActive) {
      roomControlMutation.mutate(action);
      return;
    }

    const actionLabel = getActionLabel(action);

    if (fallbackChatOnlyActive || !backendAdminVerified) {
      void persistSupportMessage(buildFallbackChatOnlyExecutionMessage({
        normalizedText: `/${action === 'rerun_health_probe' ? 'heal rerun-proof' : 'heal clear-stuck'}`,
        requestClass: 'admin_execution',
      }), 'system');
      return;
    }

    Alert.alert(
      'Confirm owner action',
      `Continue with ${actionLabel}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => {
            roomControlMutation.mutate(action);
          },
        },
      ],
    );
  }, [backendAdminVerified, devTestMode.testModeActive, fallbackChatOnlyActive, persistSupportMessage, roomControlMutation]);
  const androidKeyboardActive = Platform.OS === 'android' && keyboardInset > 0;
  const androidRootResizedByKeyboard = useMemo<boolean>(() => {
    if (!androidKeyboardActive || rootLayoutHeight <= 0 || lastNonKeyboardRootHeightRef.current <= 0) {
      return false;
    }
    const heightShrink = lastNonKeyboardRootHeightRef.current - rootLayoutHeight;
    return heightShrink >= Math.max(80, keyboardInset * 0.35);
  }, [androidKeyboardActive, keyboardInset, rootLayoutHeight]);
  const manualKeyboardLift = useMemo<number>(() => {
    if (!androidKeyboardActive || androidRootResizedByKeyboard) {
      return 0;
    }
    return Math.min(Math.max(keyboardInset - insets.bottom + 10, 180), 360);
  }, [androidKeyboardActive, androidRootResizedByKeyboard, insets.bottom, keyboardInset]);
  const composerDockInset = useMemo(() => {
    if (Platform.OS === 'android') {
      return Math.max(insets.bottom, 16) + 8;
    }
    return Math.max(insets.bottom, 8) + 8;
  }, [insets.bottom]);
  const isKeyboardOpen = keyboardInset > 0;
  const effectiveComposerBottom = useMemo(() => {
    if (Platform.OS === 'android') {
      if (isKeyboardOpen) {
        return Math.max(insets.bottom, 12);
      }
      return composerDockInset;
    }

    if (isKeyboardOpen) {
      return 4;
    }

    return composerDockInset;
  }, [composerDockInset, insets.bottom, isKeyboardOpen]);
  const listContentContainerStyle = useMemo(() => {
    const bottomPadding = Math.max(composerHeight + effectiveComposerBottom + manualKeyboardLift + 96, insets.bottom + 120);
    return displayedMessages.length === 0
      ? [styles.emptyListContent, { paddingBottom: bottomPadding }]
      : [styles.listContent, { paddingTop: 8, paddingBottom: bottomPadding }];
  }, [displayedMessages.length, composerHeight, effectiveComposerBottom, insets.bottom, manualKeyboardLift]);
  const keyboardAvoidingBehavior = Platform.select<'height' | 'padding' | undefined>({
    ios: 'padding',
    android: 'height',
    default: undefined,
  });
  const keyboardVerticalOffset = useMemo<number>(() => {
    if (Platform.OS !== 'ios') {
      return 0;
    }

    return Math.max(insets.top + 56, 88);
  }, [insets.top]);
  const handleRootLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    if (nextHeight <= 0) {
      return;
    }
    setRootLayoutHeight((current) => (Math.abs(current - nextHeight) > 1 ? nextHeight : current));
    if (Platform.OS !== 'android' || keyboardInset <= 0) {
      lastNonKeyboardRootHeightRef.current = nextHeight;
    }
  }, [keyboardInset]);
  const renderPinnedMessagePreview = useCallback((message: IVXMessage) => {
    const parsedPinnedBody = parseReplyBody(message.body);
    const previewText = safeTrim(parsedPinnedBody.body) || safeTrim(message.attachmentName) || 'Attachment';
    const senderLabel = message.senderRole === 'assistant' ? (message.senderLabel ?? IVX_OWNER_AI_PROFILE.name) : (message.senderLabel ?? 'IVX Owner');
    return (
      <View key={message.id} style={styles.pinnedMessageCard} testID={`ivx-owner-pinned-message-${message.id}`}>
        <View style={styles.pinnedMessageTextStack}>
          <Text style={styles.pinnedMessageSender} numberOfLines={1}>{senderLabel}</Text>
          <Text style={styles.pinnedMessageText} numberOfLines={2}>{previewText}</Text>
          {message.attachmentUrl ? <Text style={styles.pinnedMessageMeta} numberOfLines={1}>{`${message.attachmentName ?? 'Attachment'} · ${message.attachmentMime ?? message.attachmentKind}`}</Text> : null}
        </View>
        <Pressable
          style={({ pressed }) => [styles.pinnedUnpinButton, pressed ? { opacity: 0.72 } : null]}
          onPress={() => handleTogglePinnedMessage({ id: message.id } as ChatMessage)}
          accessibilityRole="button"
          accessibilityLabel="Unpin message"
          testID={`ivx-owner-pinned-unpin-${message.id}`}
        >
          <X size={13} color="#F6C85F" />
          <Text style={styles.pinnedUnpinText}>Unpin</Text>
        </Pressable>
      </View>
    );
  }, [handleTogglePinnedMessage]);

  const pinnedMessagesSection = useMemo(() => {
    if (pinnedMessages.length === 0) {
      return null;
    }

    return (
      <View style={styles.pinnedSection} testID="ivx-owner-pinned-section">
        <View style={styles.pinnedSectionHeader}>
          <Pin size={14} color="#F6C85F" />
          <Text style={styles.pinnedSectionTitle}>Pinned messages</Text>
          <Text style={styles.pinnedSectionCount}>{pinnedMessages.length}</Text>
        </View>
        <View style={styles.pinnedMessageList}>
          {pinnedMessages.map(renderPinnedMessagePreview)}
        </View>
      </View>
    );
  }, [pinnedMessages, renderPinnedMessagePreview]);

  const listFooter = useMemo(() => <View style={styles.listFooterSpacer} />, []);
  const androidTopSpacerHeight = Platform.OS === 'android' ? Math.max(insets.top + 2, 24) : Math.max(insets.top, 0);
  const runtimeProofHeadline = useMemo(() => getRuntimeProofHeadline(runtimeDebugSnapshot), [runtimeDebugSnapshot]);
  const runtimeStatusCopy = useMemo(() => getRuntimeStatusCopy({
    source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
    requestStage: runtimeDebugSnapshot.requestStage,
    failureClass: runtimeDebugSnapshot.failureClass,
    isFallback: runtimeDebugSnapshot.source === 'provider_fallback',
    isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
    hasVisibleResponseText: runtimeDebugSnapshot.hasVisibleResponseText,
  }), [runtimeDebugSnapshot]);
  const runtimeProofPrimaryRows = useMemo<Array<{ label: string; value: string }>>(() => {
    return [
      { label: 'Request stage', value: runtimeDebugSnapshot.requestStage },
      { label: 'Failure class', value: runtimeDebugSnapshot.failureClass },
      { label: 'HTTP status', value: runtimeDebugSnapshot.httpStatus },
      { label: 'Base URL', value: backendAuditSummary.activeBaseUrl },
      { label: 'Endpoint', value: runtimeDebugSnapshot.endpoint ?? backendAuditSummary.activeEndpoint },
      { label: 'Request ID', value: runtimeDebugSnapshot.requestId ?? 'pending' },
      { label: 'Reliability attempts', value: lastReliabilityTrace ? `${lastReliabilityTrace.attempts.length} · ${lastReliabilityTrace.finalOutcome} · ${lastReliabilityTrace.totalElapsedMs}ms` : 'pending' },
      { label: 'Response preview', value: runtimeDebugSnapshot.responsePreview },
    ];
  }, [backendAuditSummary.activeBaseUrl, backendAuditSummary.activeEndpoint, lastReliabilityTrace, runtimeDebugSnapshot]);
  const developerToolsAllowed = useMemo<boolean>(() => {
    return ownerRoomAuthenticated;
  }, [ownerRoomAuthenticated]);
  const developerStatusRows = useMemo<Array<{ id: string; label: string; value: string; tone: 'pass' | 'warn' | 'error' | 'pending' }>>(() => {
    const supabasePending = conversationQuery.isLoading || messagesQuery.isLoading || roomStatusQuery.isLoading;
    const supabaseReady = !conversationQuery.error && !messagesQuery.error && !roomStatusQuery.error;
    const roomReady = !!conversationQuery.data?.id && !!ivxRoomStatus && !roomStatusQuery.isLoading;
    const activeSource = getActiveRuntimeSource({
      source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
      requestStage: runtimeDebugSnapshot.requestStage,
      failureClass: runtimeDebugSnapshot.failureClass,
      isFallback: runtimeDebugSnapshot.source === 'provider_fallback',
      isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
      hasVisibleResponseText: runtimeDebugSnapshot.hasVisibleResponseText,
    });
    const aiReady = activeSource === 'remote_api' || activeSource === 'local_app_brain' || effectiveAiHealthDetail === 'active';

    return [
      { id: 'supabase', label: 'Supabase', value: supabaseReady ? 'connected' : supabasePending ? 'checking' : 'needs attention', tone: supabaseReady ? 'pass' : supabasePending ? 'pending' : 'error' },
      { id: 'room', label: 'Room', value: roomReady ? `${ivxRoomStatus.storageMode} · ${ivxRoomStatus.deliveryMethod}` : roomStatusQuery.error ? 'probe failed' : 'opening', tone: roomReady ? 'pass' : roomStatusQuery.error ? 'error' : 'pending' },
      { id: 'ai', label: 'AI', value: aiReady ? (activeSource === 'remote_api' ? 'remote connected' : activeSource === 'local_app_brain' ? 'local brain ready' : 'ready') : 'checking', tone: aiReady ? 'pass' : aiReplyPending ? 'pending' : 'warn' },
      { id: 'audit', label: 'Audit', value: 'local + audit_events mirror', tone: 'pass' },
      { id: 'files', label: 'Files', value: fileUploadActive ? 'upload + analysis active' : 'upload path ready', tone: fileUploadActive ? 'pass' : 'warn' },
      { id: 'voice', label: 'Voice', value: isRecordingVoice ? 'recording' : isTranscribingVoice ? 'transcribing' : 'transcription ready', tone: isRecordingVoice || isTranscribingVoice ? 'pending' : 'pass' },
      { id: 'templates', label: 'Templates', value: `${OWNER_PROMPT_TEMPLATES.length} business prompts`, tone: 'pass' },
    ];
  }, [aiReplyPending, conversationQuery.data?.id, conversationQuery.error, conversationQuery.isLoading, effectiveAiHealthDetail, fileUploadActive, isRecordingVoice, isTranscribingVoice, ivxRoomStatus, messagesQuery.error, messagesQuery.isLoading, roomStatusQuery.error, roomStatusQuery.isLoading, runtimeDebugSnapshot]);
  const sendBranchProof = useMemo<SendBranchProofRow>(() => {
    return resolveSendBranch(
      deliveryBranchStatus.branch,
      runtimeDebugSnapshot.source,
      runtimeDebugSnapshot.httpStatus,
    );
  }, [deliveryBranchStatus.branch, runtimeDebugSnapshot.source, runtimeDebugSnapshot.httpStatus]);

  const composerStatusMessage = useMemo(() => {
    if (devTestMode.testModeActive) {
      return 'Assistant ready.';
    }
    if (isRecordingVoice) {
      return 'Recording voice prompt. Tap stop when finished.';
    }
    if (isTranscribingVoice) {
      return 'Transcribing voice prompt...';
    }
    if (aiReplyPending) {
      return 'Message sent. Reply will appear when ready.';
    }
    if (currentOwnerTrust.requiresElevatedConfirmation) {
      return 'Sensitive action detected. Please confirm before I proceed.';
    }
    if (ownerAIRoutingBlocked || ownerAIProofStatus.id === 'blocked_by_auth') {
      return 'Assistant is temporarily unavailable.';
    }
    return 'Assistant ready.';
  }, [aiReplyPending, currentOwnerTrust.requiresElevatedConfirmation, devTestMode.testModeActive, isRecordingVoice, isTranscribingVoice, ownerAIProofStatus.id, ownerAIRoutingBlocked, runtimeDebugSnapshot.hasVisibleResponseText]);

  const controlRoomItems = useMemo<IVXControlRoomItem[]>(() => {
    if (controlRoomQuery.data?.statusItems && controlRoomQuery.data.statusItems.length > 0) {
      return controlRoomQuery.data.statusItems;
    }
    if (controlRoomQuery.error) {
      return [{ id: 'control-room', label: 'Owner/developer control room', status: 'not_connected', detail: controlRoomQuery.error.message }];
    }
    return CONTROL_ROOM_FALLBACK_ITEMS;
  }, [controlRoomQuery.data?.statusItems, controlRoomQuery.error]);
  const controlRoomSummary = useMemo(() => {
    const verified = controlRoomItems.filter((item) => item.status === 'verified' || item.status === 'connected' || item.status === 'available').length;
    const blocked = controlRoomItems.filter((item) => item.status === 'blocked' || item.status === 'missing_access' || item.status === 'not_connected' || item.status === 'not_verified').length;
    return { verified, blocked, total: controlRoomItems.length };
  }, [controlRoomItems]);
  const shouldShowDiagnosticsToggle = developerToolsAllowed;

  const scrollOwnerThreadToEnd = useCallback((animated: boolean = true) => {
    const scrollIfAllowed = () => {
      if (Date.now() >= suppressAutoScrollUntilRef.current) {
        flatListRef.current?.scrollToEnd({ animated });
      }
    };

    requestAnimationFrame(scrollIfAllowed);
    setTimeout(scrollIfAllowed, Platform.OS === 'android' ? 220 : 80);
    setTimeout(scrollIfAllowed, Platform.OS === 'android' ? 520 : 180);
  }, []);

  useEffect(() => {
    return () => {
      if (highlightedMessageTimeoutRef.current) {
        clearTimeout(highlightedMessageTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    composerValueRef.current = composerValue;
  }, [composerValue]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const handleKeyboardShow = (event: { endCoordinates?: { height?: number } }) => {
      const nextInset = event.endCoordinates?.height ?? 0;
      const normalizedInset = Platform.OS === 'android'
        ? Math.max(nextInset - insets.bottom, 0)
        : nextInset;
      console.log('[IVXOwnerChatRoute] Keyboard shown inset:', normalizedInset, 'rawHeight:', nextInset, 'bottomInset:', insets.bottom);
      setKeyboardInset(normalizedInset);
      scrollOwnerThreadToEnd(true);
      setTimeout(() => scrollOwnerThreadToEnd(true), Platform.OS === 'android' ? 520 : 160);
    };

    const handleKeyboardHide = () => {
      console.log('[IVXOwnerChatRoute] Keyboard hidden');
      setKeyboardInset(0);
    };

    const showSubscription = Keyboard.addListener(showEvent, handleKeyboardShow);
    const hideSubscription = Keyboard.addListener(hideEvent, handleKeyboardHide);

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [insets.bottom, scrollOwnerThreadToEnd]);

  return (
    <ErrorBoundary fallbackTitle="IVX Owner AI unavailable">
      <KeyboardAvoidingView
        style={styles.container}
        behavior={keyboardAvoidingBehavior}
        keyboardVerticalOffset={keyboardVerticalOffset}
        onLayout={handleRootLayout}
      >
        <View style={[styles.androidStatusSpacer, { height: androidTopSpacerHeight }]} testID="ivx-owner-chat-android-status-spacer" />

        <View style={styles.content}>
          {primaryState !== 'loading' && primaryState !== 'room_error' ? (
            <View style={styles.topSearchRail} testID="ivx-owner-chat-top-search-rail">
              <View style={styles.searchBarWrap} testID="ivx-owner-chat-search-wrap">
                <Search size={16} color={Colors.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  value={messageSearchQuery}
                  onChangeText={handleSearchQueryChange}
                  placeholder="Search this conversation"
                  placeholderTextColor="#7C8797"
                  returnKeyType="search"
                  autoCorrect={false}
                  testID="ivx-owner-chat-search-input"
                />
                {searchActive ? (
                  <Pressable
                    style={styles.searchClearButton}
                    onPress={() => setMessageSearchQuery('')}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear message search"
                    testID="ivx-owner-chat-search-clear"
                  >
                    <X size={14} color={Colors.textTertiary} />
                  </Pressable>
                ) : null}
                {shouldShowDiagnosticsToggle ? (
                  <Pressable
                    style={styles.controlRoomToggle}
                    onPress={() => setShowDiagnostics((current) => !current)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Toggle owner developer control room"
                    testID="ivx-owner-control-room-toggle"
                  >
                    <Terminal size={12} color={showDiagnostics ? Colors.black : Colors.primary} />
                    <Text style={[styles.controlRoomToggleText, showDiagnostics ? styles.controlRoomToggleTextActive : null]}>{showDiagnostics ? 'Chat' : 'Control'}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ) : null}
          {topStatusNote ? (
            <View
              style={ownerAIRoutingBlocked ? styles.blockedBanner : activeFallbackForCurrentMessage ? styles.degradedBanner : styles.devBanner}
              testID="ivx-owner-chat-top-status"
            >
              <Text numberOfLines={3} style={ownerAIRoutingBlocked ? styles.blockedBannerText : activeFallbackForCurrentMessage ? styles.degradedBannerText : styles.devBannerText}>{topStatusNote}</Text>
            </View>
          ) : null}

          {showDiagnostics && developerToolsAllowed ? (
            <>
              <View style={styles.developerToolsCard} testID="ivx-owner-developer-tools-panel">
                <View style={styles.developerToolsHeader}>
                  <View style={styles.developerToolsIconWrap}>
                    <Terminal size={15} color={Colors.black} />
                  </View>
                  <View style={styles.developerToolsCopy}>
                    <Text style={styles.developerToolsEyebrow}>Developer tools</Text>
                    <Text style={styles.developerToolsTitle}>Private runtime checks</Text>
                  </View>
                </View>
                <View style={styles.developerStatusGrid}>
                  {developerStatusRows.map((row) => (
                    <View
                      key={row.id}
                      style={[
                        styles.developerStatusTile,
                        row.tone === 'pass'
                          ? styles.developerStatusTilePass
                          : row.tone === 'error'
                            ? styles.developerStatusTileError
                            : row.tone === 'pending'
                              ? styles.developerStatusTilePending
                              : styles.developerStatusTileWarn,
                      ]}
                      testID={`ivx-owner-devtools-${row.id}`}
                    >
                      <View style={[
                        styles.developerStatusDot,
                        row.tone === 'pass'
                          ? styles.developerStatusDotPass
                          : row.tone === 'error'
                            ? styles.developerStatusDotError
                            : row.tone === 'pending'
                              ? styles.developerStatusDotPending
                              : styles.developerStatusDotWarn,
                      ]} />
                      <Text style={styles.developerStatusLabel}>{row.label}</Text>
                      <Text style={styles.developerStatusValue} numberOfLines={2}>{row.value}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.developerToolsFootnote}>Visible only for authenticated owner developer sessions; normal users never see runtime metadata.</Text>
              </View>

              <View style={styles.controlRoomCard} testID="ivx-owner-developer-control-room">
                <View style={styles.controlRoomHeaderRow}>
                  <View style={styles.controlRoomHeaderCopy}>
                    <Text style={styles.backendAuditEyebrow}>Owner/developer control room</Text>
                    <Text style={styles.controlRoomTitle}>IVX system status</Text>
                    <Text style={styles.controlRoomSubtitle}>{`${controlRoomSummary.verified}/${controlRoomSummary.total} verified or available · ${controlRoomSummary.blocked} pending/blocking`}</Text>
                  </View>
                  <View style={styles.controlRoomActions}>
                    <Pressable
                      style={styles.graphActionButton}
                      onPress={() => router.push('/ivx/independence' as never)}
                      testID="ivx-owner-open-independence-tracker"
                    >
                      <ShieldCheck size={13} color={Colors.black} />
                      <Text style={styles.graphActionButtonText}>Independence</Text>
                    </Pressable>
                    <Pressable
                      style={styles.graphActionButton}
                      onPress={() => router.push('/ivx/variables' as never)}
                      testID="ivx-owner-open-variables-tool"
                    >
                      <KeyRound size={13} color={Colors.black} />
                      <Text style={styles.graphActionButtonText}>Variables</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.graphActionButton, controlRoomQuery.isFetching ? styles.actionButtonDisabled : null]}
                      onPress={() => { void controlRoomQuery.refetch(); }}
                      disabled={controlRoomQuery.isFetching}
                      testID="ivx-owner-control-room-refresh"
                    >
                      <Text style={styles.graphActionButtonText}>{controlRoomQuery.isFetching ? 'Checking' : 'Run tests'}</Text>
                    </Pressable>
                  </View>
                </View>
                {controlRoomQuery.error ? <Text style={styles.controlRoomError}>{controlRoomQuery.error.message}</Text> : null}
                <View style={styles.controlRoomList}>
                  {controlRoomItems.map((item, index) => {
                    const tone = getControlRoomTone(item.status);
                    return (
                      <View key={item.id} style={styles.controlRoomRow} testID={`ivx-owner-control-room-${item.id}`}>
                        <Text style={styles.controlRoomIndex}>{String(index + 1).padStart(2, '0')}</Text>
                        <View style={styles.controlRoomRowCopy}>
                          <View style={styles.controlRoomRowTop}>
                            <Text style={styles.controlRoomLabel}>{item.label}</Text>
                            <View style={[
                              styles.controlRoomStatusBadge,
                              tone === 'pass'
                                ? styles.controlRoomStatusBadgePass
                                : tone === 'error'
                                  ? styles.controlRoomStatusBadgeError
                                  : tone === 'pending'
                                    ? styles.controlRoomStatusBadgePending
                                    : styles.controlRoomStatusBadgeWarn,
                            ]}>
                              <Text style={[
                                styles.controlRoomStatusText,
                                tone === 'pass'
                                  ? styles.controlRoomStatusTextPass
                                  : tone === 'error'
                                    ? styles.controlRoomStatusTextError
                                    : tone === 'pending'
                                      ? styles.controlRoomStatusTextPending
                                      : styles.controlRoomStatusTextWarn,
                              ]}>{getControlRoomStatusLabel(item.status)}</Text>
                            </View>
                          </View>
                          <Text style={styles.controlRoomDetail}>{item.detail}</Text>
                          {item.missingCredentialNames && item.missingCredentialNames.length > 0 ? (
                            <Text style={styles.controlRoomMissing}>{`Missing: ${item.missingCredentialNames.join(', ')}`}</Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.developerToolsFootnote}>No status is guessed here. Unconnected tools show not connected; unverified checks show not verified; missing secrets are listed by name only.</Text>
              </View>

              <View style={styles.sendBranchProofRow} testID="ivx-owner-send-branch-proof">
                <Text style={styles.sendBranchProofLabel}>send branch</Text>
                <Text
                  style={[
                    styles.sendBranchProofValue,
                    sendBranchProof.branch === 'primary_realtime'
                      ? styles.sendBranchProofValuePass
                      : sendBranchProof.branch === 'alternate_shared'
                        ? styles.sendBranchProofValueWarn
                        : sendBranchProof.branch === 'snapshot_fallback' || sendBranchProof.branch === 'local_only'
                          ? styles.sendBranchProofValueDegraded
                          : styles.sendBranchProofValuePending,
                  ]}
                  numberOfLines={1}
                >
                  {sendBranchProof.label}
                </Text>
                <Text style={styles.sendBranchProofContext} numberOfLines={1}>{sendBranchProof.context}</Text>
              </View>

              <View style={styles.qaCard} testID="ivx-owner-chat-qa-card">
                <View style={styles.qaHeaderRow}>
                  <View>
                    <Text style={styles.qaEyebrow}>{`${auditReport.passedCount}/${auditReport.totalCount} audit checks passed`}</Text>
                    <Text style={styles.qaTitle}>IVX Owner AI runtime audit</Text>
                  </View>
                  <View style={[
                    styles.qaBadge,
                    proofBadgeTone === 'pass'
                      ? styles.qaBadgePass
                      : proofBadgeTone === 'blocked'
                        ? styles.qaBadgeBlocked
                        : proofBadgeTone === 'pending'
                          ? styles.qaBadgePending
                          : styles.qaBadgeWarn,
                  ]}>
                    <Text style={[
                      styles.qaBadgeText,
                      proofBadgeTone === 'pass'
                        ? styles.qaBadgeTextPass
                        : proofBadgeTone === 'blocked'
                          ? styles.qaBadgeTextBlocked
                          : proofBadgeTone === 'pending'
                            ? styles.qaBadgeTextPending
                            : styles.qaBadgeTextWarn,
                    ]}>
                      {proofBadgeLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.qaChecklist}>
                  {qaChecklist.map((item) => (
                    <View key={item.id} style={styles.qaItemRow} testID={`ivx-owner-chat-qa-${item.id}`}>
                      <View style={[styles.qaDot, item.passed ? styles.qaDotPass : styles.qaDotWarn]} />
                      <View style={styles.qaCopy}>
                        <Text style={styles.qaItemLabel}>{item.label}</Text>
                        <Text style={styles.qaItemDetail}>{item.detail}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={styles.proofRail}>
                  {proofRows.map((proof) => (
                    <View key={proof.id} style={styles.proofRow} testID={`ivx-owner-proof-${proof.sourceType}`}>
                      <View style={[
                        styles.proofDot,
                        proof.status === 'verified'
                          ? styles.proofDotPass
                          : proof.status === 'blocked'
                            ? styles.proofDotBlocked
                            : proof.status === 'pending'
                              ? styles.proofDotPending
                              : styles.proofDotWarn,
                      ]} />
                      <View style={styles.proofCopy}>
                        <Text style={styles.proofTitle}>{proof.title}</Text>
                        <Text style={styles.proofDetail}>{proof.summary}</Text>
                        <Text style={styles.proofMeta}>
                          {`${proof.sourceSignal} • confidence ${Math.round(proof.confidence * 100)}% • ${proof.observedAt}`}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
                <Text style={styles.qaScopeText}>{`${auditReport.summary} ${qaScopeNote}`}</Text>
              </View>

              <View style={styles.backendAuditCard} testID="ivx-owner-chat-live-proof">
                <Text style={styles.backendAuditEyebrow}>Operational proof</Text>
                <Text style={styles.backendAuditTitle}>Live chat telemetry</Text>
                <AuditInfoRow label="Live users observed" value={String(liveSnapshot.totalLiveUsers)} />
                <AuditInfoRow label="Chat active users" value={String(liveChatMetric?.activeUsers ?? 0)} />
                <AuditInfoRow label="Chat sessions in progress" value={String(liveChatMetric?.sessionsInProgress ?? 0)} />
                <AuditInfoRow label="Chat messages tracked" value={String(messageAudit.ownerMessages + messageAudit.assistantMessages)} />
                <AuditInfoRow label="Fallback transport state" value={liveSnapshot.operator.fallbackTransportState} />
                <AuditInfoRow label="Stuck users" value={String(liveSnapshot.operator.stuckUsers)} />
                <Text style={styles.backendAuditBody}>
                  {liveTopSource
                    ? `Top source right now: ${liveTopSource.source} · quality ${liveTopSource.qualityScore} · conversions ${liveTopSource.conversions}.`
                    : 'No remote source proof has been observed yet in the active intelligence window.'}
                </Text>
                <Text style={styles.backendAuditFootnote}>{'Session proof is emitted on room open, page view, chat open, chat message, fallback, routing events, and room close for /ivx/chat.'}</Text>
              </View>

              <View style={styles.backendAuditCard} testID="ivx-owner-chat-runtime-debug">
                <Text style={styles.backendAuditEyebrow}>Runtime proof</Text>
                <Text style={styles.backendAuditTitle}>Live remote proof card</Text>
                <View style={styles.runtimeProofBanner} testID="ivx-owner-chat-proof-banner">
                  <Text style={styles.runtimeProofBannerTitle}>{runtimeProofHeadline.title}</Text>
                  <Text style={styles.runtimeProofBannerDetail}>{runtimeProofHeadline.detail}</Text>
                </View>
                {runtimeProofPrimaryRows.map((row) => (
                  <AuditInfoRow
                    key={row.label}
                    label={row.label}
                    value={row.value}
                    testID={`ivx-owner-runtime-${row.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  />
                ))}
                <AuditInfoRow label="Request source" value={getRuntimeSourceLabel(runtimeDebugSnapshot)} />
                <AuditInfoRow label="Send branch" value={deliveryBranchStatus.branch} testID="ivx-owner-runtime-send-branch" />
                <AuditInfoRow label="Send branch title" value={deliveryBranchStatus.title} testID="ivx-owner-runtime-send-title" />
                <AuditInfoRow label="Latest send message ID" value={lastSendAudit?.messageId ?? 'pending'} testID="ivx-owner-runtime-send-message-id" />
                <AuditInfoRow label="Latest send conversation ID" value={lastSendAudit?.conversationId ?? 'pending'} testID="ivx-owner-runtime-send-conversation-id" />
                <AuditInfoRow label="Latest send observed" value={lastSendAudit?.observedAt ?? 'pending'} testID="ivx-owner-runtime-send-observed" />
                <AuditInfoRow label="Receive branch" value={receiveBranchStatus.branch} testID="ivx-owner-runtime-receive-branch" />
                <AuditInfoRow label="Receive branch title" value={receiveBranchStatus.title} testID="ivx-owner-runtime-receive-title" />
                <AuditInfoRow label="Latest receive message ID" value={lastReceiveAudit?.messageId ?? 'pending'} testID="ivx-owner-runtime-receive-message-id" />
                <AuditInfoRow label="Latest receive conversation ID" value={lastReceiveAudit?.conversationId ?? 'pending'} testID="ivx-owner-runtime-receive-conversation-id" />
                <AuditInfoRow label="Latest receive observed" value={lastReceiveAudit?.observedAt ?? 'pending'} testID="ivx-owner-runtime-receive-observed" />
                <AuditInfoRow label="Subscription owner" value={ownerSessionIdRef.current} testID="ivx-owner-runtime-subscription-owner" />
                <AuditInfoRow label="Active realtime channel count" value={String(realtimeSubscriptionAudit.activeChannelCount)} testID="ivx-owner-runtime-active-channel-count" />
                <AuditInfoRow label="Active realtime channels" value={realtimeSubscriptionAudit.activeChannels.join(', ') || 'none'} testID="ivx-owner-runtime-active-channels" />
                <AuditInfoRow label="Realtime teardown count" value={String(realtimeSubscriptionAudit.teardownCount)} testID="ivx-owner-runtime-teardown-count" />
                <AuditInfoRow label="Local listener count" value={String(realtimeSubscriptionAudit.localListenerCount)} testID="ivx-owner-runtime-local-listener-count" />
                <AuditInfoRow label="Deployment marker" value={runtimeDebugSnapshot.deploymentMarker ?? 'pending'} />
                <AuditInfoRow label="Auth mode" value={runtimeDebugSnapshot.authMode} />
                <AuditInfoRow label="Owner room trust" value={ownerRoomAuthenticated ? 'owner_room_authenticated' : 'owner_room_unverified'} testID="ivx-owner-runtime-owner-room-trust" />
                <AuditInfoRow label="Backend admin trust" value={backendAdminVerified ? 'backend_admin_verified' : 'backend_admin_unverified'} testID="ivx-owner-runtime-backend-admin-trust" />
                <AuditInfoRow label="Conversation access" value={fallbackChatOnlyActive ? 'fallback_chat_only' : 'full_backend_execution'} testID="ivx-owner-runtime-conversation-access" />
                <AuditInfoRow label="Action gate" value={currentOwnerTrust.requiresElevatedConfirmation ? 'destructive_action_requires_confirmation' : 'normal_owner_chat'} testID="ivx-owner-runtime-action-gate" />
                <AuditInfoRow label="Request class" value={currentOwnerTrust.requestClass} testID="ivx-owner-runtime-request-class" />
                <AuditInfoRow label="Owner/dev bypass enabled" value={runtimeDebugSnapshot.ownerBypassEnabled ? 'yes' : 'no'} />
                <AuditInfoRow label="Conversation ID" value={runtimeDebugSnapshot.conversationId ?? 'pending'} />
                <AuditInfoRow label="Tool used" value={lastToolOutputs.length > 0 ? lastToolOutputs.map((output) => output.tool).join(', ') : 'none'} testID="ivx-owner-runtime-tool-used" />
                <AuditInfoRow label="Tool output" value={lastToolOutputs.length > 0 ? JSON.stringify(lastToolOutputs[0]?.output ?? lastToolOutputs[0]?.error ?? null).slice(0, 220) : 'none'} testID="ivx-owner-runtime-tool-output" />
                <AuditInfoRow
                  label="Fallback state"
                  value={getRuntimeFallbackState(getActiveRuntimeSource({
                    source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
                    requestStage: runtimeDebugSnapshot.requestStage,
                    failureClass: runtimeDebugSnapshot.failureClass,
                    isFallback: runtimeDebugSnapshot.source === 'provider_fallback',
                    isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
                    hasVisibleResponseText: runtimeDebugSnapshot.hasVisibleResponseText,
                  }))}
                />
                <AuditInfoRow label="Degraded state" value={getRuntimeDegradedState(runtimeSnapshot.runtimeStatus)} />
                <AuditInfoRow label="Last attempt" value={formatRuntimeTimestamp(runtimeDebugSnapshot.lastAttemptAt)} />
                <AuditInfoRow label="Last verified" value={formatRuntimeTimestamp(runtimeDebugSnapshot.lastVerifiedAt)} />
                <Text style={styles.backendAuditBody}>{currentOwnerTrust.explanation}</Text>
                <Text style={styles.backendAuditBody}>{runtimeDebugSnapshot.failureDetail}</Text>
                <Text style={styles.backendAuditBody}>{`Send proof: ${deliveryBranchStatus.detail}`}</Text>
                <Text style={styles.backendAuditFootnote}>{deliveryBranchStatus.evidence}</Text>
                <Text style={styles.backendAuditBody}>{`Receive proof: ${receiveBranchStatus.detail}`}</Text>
                <Text style={styles.backendAuditFootnote}>{receiveBranchStatus.evidence}</Text>
              </View>

              <View style={styles.qaCard} testID="ivx-owner-chat-functionality-proof-ledger">
                <View style={styles.qaHeaderRow}>
                  <View>
                    <Text style={styles.qaEyebrow}>1–200 numbered proof ledger</Text>
                    <Text style={styles.qaTitle}>IVX functionality truth table</Text>
                  </View>
                  <View style={styles.functionalitySummary}>
                    <Text style={styles.functionalitySummaryText}>{`${functionalityProofCounts.live} live`}</Text>
                    <Text style={styles.functionalitySummaryText}>{`${functionalityProofCounts.pass} pass`}</Text>
                    <Text style={styles.functionalitySummaryText}>{`${functionalityProofCounts.fail} fail`}</Text>
                  </View>
                </View>
                <View style={styles.functionalityLedgerList}>
                  {functionalityProofList.map((item) => (
                    <View key={item.key} style={styles.functionalityLedgerRow} testID={`ivx-owner-chat-proof-slot-${item.index}`}>
                      <Text style={styles.functionalityLedgerIndex}>{item.index}</Text>
                      <View style={styles.functionalityLedgerCopy}>
                        <View style={styles.functionalityLedgerTitleRow}>
                          <Text style={styles.functionalityLedgerTitle}>{item.title}</Text>
                          <View
                            style={[
                              styles.functionalityLedgerBadge,
                              item.status === 'live'
                                ? styles.functionalityLedgerBadgeLive
                                : item.status === 'pass'
                                  ? styles.functionalityLedgerBadgePass
                                  : styles.functionalityLedgerBadgeFail,
                            ]}
                          >
                            <Text
                              style={[
                                styles.functionalityLedgerBadgeText,
                                item.status === 'live'
                                  ? styles.functionalityLedgerBadgeTextLive
                                  : item.status === 'pass'
                                    ? styles.functionalityLedgerBadgeTextPass
                                    : styles.functionalityLedgerBadgeTextFail,
                              ]}
                            >
                              {item.status.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.functionalityLedgerDetail}>{item.detail}</Text>
                        <Text style={styles.functionalityLedgerEvidence}>{item.evidence}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>

              <View style={styles.backendAuditCard} testID="ivx-owner-chat-backend-audit">
                <Text style={styles.backendAuditEyebrow}>Environment audit</Text>
                <Text style={styles.backendAuditTitle}>Owner AI routing audit</Text>
                <View style={[styles.backendAuditBadge, ownerAIRoutingBlocked ? styles.backendAuditBadgeBlocked : styles.backendAuditBadgePass]}>
                  <Text style={[styles.backendAuditBadgeText, ownerAIRoutingBlocked ? styles.backendAuditBadgeTextBlocked : styles.backendAuditBadgeTextPass]}>
                    {ownerAIRoutingBlocked ? 'GUARD BLOCKED' : `${backendAuditSummary.currentEnvironment.toUpperCase()} ROUTING`}
                  </Text>
                </View>
                <AuditInfoRow label="Current environment" value={backendAuditSummary.currentEnvironment} testID="ivx-owner-chat-audit-environment" />
                <AuditInfoRow label="Routing policy" value={backendAuditSummary.routingPolicy} testID="ivx-owner-chat-audit-routing-policy" />
                <AuditInfoRow label="Configured URL" value={backendAuditSummary.configuredOwnerAIBaseUrl} testID="ivx-owner-chat-audit-configured-url" />
                <AuditInfoRow label="Active base URL" value={backendAuditSummary.activeBaseUrl} testID="ivx-owner-chat-audit-active-base-url" />
                <AuditInfoRow label="Active host" value={backendAuditSummary.activeHost} testID="ivx-owner-chat-audit-active-host" />
                <AuditInfoRow label="Active endpoint chosen" value={backendAuditSummary.activeEndpoint} testID="ivx-owner-chat-audit-active-endpoint" />
                <AuditInfoRow label="App API base URL" value={backendAuditSummary.directApiBaseUrl} testID="ivx-owner-chat-audit-direct-api-url" />
                <AuditInfoRow label="App API host" value={backendAuditSummary.directApiHost} testID="ivx-owner-chat-audit-direct-api-host" />
                <AuditInfoRow label="Owner health URL" value={backendAuditSummary.ownerAiHealthUrl} testID="ivx-owner-chat-audit-owner-health" />
                <AuditInfoRow label="Owner Route53 audit URL" value={backendAuditSummary.ownerRoute53AuditUrl} testID="ivx-owner-chat-audit-owner-route53" />
                <AuditInfoRow label="App API health URL" value={backendAuditSummary.appApiHealthUrl} testID="ivx-owner-chat-audit-app-health" />
                <AuditInfoRow label="App API Route53 audit URL" value={backendAuditSummary.appApiRoute53AuditUrl} testID="ivx-owner-chat-audit-app-route53" />
                <AuditInfoRow label="Deployment marker" value={runtimeSnapshot.provider.deploymentMarker ?? 'pending'} testID="ivx-owner-chat-audit-deployment-marker" />
                <AuditInfoRow label="Fallback used" value={backendAuditSummary.fallbackUsed} testID="ivx-owner-chat-audit-fallback-used" />
                <Text style={styles.backendAuditBody}>{backendAuditSummary.failureMode}</Text>
                <Text style={styles.backendAuditFootnote}>{backendAuditSummary.selectionReason}</Text>
                <Text style={styles.backendAuditFootnote}>{backendAuditSummary.recommendedResolution}</Text>
                <Text style={styles.backendAuditFootnote}>{backendAuditSummary.gracefulDegradationNote}</Text>
                {backendAuditSummary.mismatchWarnings.length > 0 ? (
                  <View style={styles.backendAuditList} testID="ivx-owner-chat-audit-mismatch-warnings">
                    {backendAuditSummary.mismatchWarnings.map((warning, index) => (
                      <Text key={`${warning}-${index}`} style={styles.backendAuditListItem}>{`• ${warning}`}</Text>
                    ))}
                  </View>
                ) : null}
                <View style={styles.backendAuditList} testID="ivx-owner-chat-audit-workflow-trace">
                  {backendAuditSummary.workflowTrace.map((step, index) => (
                    <Text key={`${step}-${index}`} style={styles.backendAuditListItem}>{`${index + 1}. ${step}`}</Text>
                  ))}
                </View>
              </View>

              {(ownerGraphNodes.length > 0 || ownerGraphProofs.length > 0 || ownerGraphRisks.length > 0) ? (
                <View style={styles.graphCard} testID="ivx-owner-chat-graph-card">
                  <View style={styles.graphHeaderRow}>
                    <View>
                      <Text style={styles.graphEyebrow}>Live graph</Text>
                      <Text style={styles.graphTitle}>Owner room dependency spine</Text>
                    </View>
                    <View style={styles.graphActionRow}>
                      <Pressable
                        style={[styles.graphActionButton, roomControlMutation.isPending ? styles.actionButtonDisabled : null]}
                        onPress={() => handleRoomControlActionPress('rerun_health_probe')}
                        disabled={roomControlMutation.isPending}
                        testID="ivx-owner-chat-rerun-proof"
                      >
                        <Text style={styles.graphActionButtonText}>Rerun proof</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.graphActionButton, roomControlMutation.isPending ? styles.actionButtonDisabled : null]}
                        onPress={() => handleRoomControlActionPress('transition_stuck_sends')}
                        disabled={roomControlMutation.isPending}
                        testID="ivx-owner-chat-clear-stuck"
                      >
                        <Text style={styles.graphActionButtonText}>Clear stuck</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.graphActionButton, sendMessageMutation.isPending ? styles.actionButtonDisabled : null]}
                        onPress={() => handleSend('/replay')}
                        disabled={sendMessageMutation.isPending}
                        testID="ivx-owner-chat-replay-last"
                      >
                        <Text style={styles.graphActionButtonText}>Replay last</Text>
                      </Pressable>
                    </View>
                  </View>

                  {ownerGraphNodes.length > 0 ? (
                    <View style={styles.graphNodeList}>
                      {ownerGraphNodes.map((node) => (
                        <View key={node.id} style={styles.graphNodeRow}>
                          <View style={[
                            styles.graphNodeDot,
                            node.status === 'healthy'
                              ? styles.graphNodeDotPass
                              : node.status === 'critical'
                                ? styles.graphNodeDotBlocked
                                : node.status === 'degraded'
                                  ? styles.graphNodeDotWarn
                                  : styles.graphNodeDotPending,
                          ]} />
                          <View style={styles.graphNodeCopy}>
                            <Text style={styles.graphNodeTitle}>{node.name}</Text>
                            <Text style={styles.graphNodeMeta}>{`${node.dependencies.length} deps · ${node.status} · proof ${node.proofStatus}`}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {ownerGraphRisks.length > 0 ? (
                    <View style={styles.graphRiskList}>
                      {ownerGraphRisks.map((risk) => (
                        <View key={risk.id} style={styles.graphRiskRow}>
                          <View style={styles.graphRiskCopy}>
                            <Text style={styles.graphRiskTitle}>{risk.subjectId.replace('module:', '').replace(/_/g, ' ')}</Text>
                            <Text style={styles.graphRiskMeta}>{`Blast radius ${risk.blastRadius} · ${risk.trendDirection} · ${risk.recommendedAction.replace(/_/g, ' ')}`}</Text>
                          </View>
                          <Text style={styles.graphRiskValue}>{`${Math.round(risk.currentRiskScore * 100)}%`}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {ownerGraphProofs.length > 0 ? (
                    <View style={styles.graphProofList}>
                      {ownerGraphProofs.map((proof) => (
                        <View key={proof.id} style={styles.graphProofRow}>
                          <Text style={styles.graphProofClaim}>{proof.claim}</Text>
                          <Text style={styles.graphProofMeta}>{`${proof.sourceType} · ${Math.round(proof.confidence * 100)}% · ${proof.userImpactLevel} impact`}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {ownerActionFeed.length > 0 ? (
                    <View style={styles.graphProofList}>
                      {ownerActionFeed.map((action) => (
                        <View key={action.id} style={styles.graphProofRow}>
                          <Text style={styles.graphProofClaim}>{getActionLabel(action.actionType)}</Text>
                          <Text style={styles.graphProofMeta}>{`${action.result} · ${action.approvalMode} · ${action.targetId.replace('module:', '').replace(/_/g, ' ')}`}</Text>
                          {action.policyReason ? <Text style={styles.graphProofMeta}>{action.policyReason}</Text> : null}
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}

          {primaryState === 'loading' ? (
            <View style={styles.loadingState} testID="ivx-owner-chat-loading">
              <Text style={styles.loadingEyebrow}>Owner room opening</Text>
              <Text style={styles.loadingText}>Loading IVX Owner AI room…</Text>
            </View>
          ) : primaryState === 'room_error' ? (
            <View style={styles.errorState} testID="ivx-owner-chat-error">
              <Text style={styles.errorTitle}>Unable to load the owner room.</Text>
              <Text style={styles.errorText}>{messagesQuery.error?.message ?? conversationQuery.error?.message ?? 'Please try again.'}</Text>
              <Pressable
                style={styles.retryButton}
                onPress={() => {
                  void messagesQuery.refetch();
                  void conversationQuery.refetch();
                  void roomStatusQuery.refetch();
                }}
                testID="ivx-owner-chat-retry"
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {searchActive ? (
                <Text style={styles.searchResultText} testID="ivx-owner-chat-search-count">
                  {displayedMessages.length === 1 ? '1 matching message' : `${displayedMessages.length} matching messages`}
                </Text>
              ) : null}
              <View style={styles.threadViewport} testID="ivx-owner-chat-thread-viewport">
                {pinnedMessagesSection}
                {missingReplyMessageId ? (
                <Pressable
                  style={styles.missingReplyBanner}
                  onPress={() => setMissingReplyMessageId(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss missing original message notice"
                  testID="ivx-owner-missing-reply-context"
                >
                  <MessageCircle size={14} color={Colors.warning} />
                  <Text style={styles.missingReplyText}>Original replied-to message is unavailable. The reply preview is still preserved.</Text>
                </Pressable>
              ) : null}
                <FlatList
                  ref={flatListRef}
                  data={displayedMessages}
                  keyExtractor={(item) => item.id}
                  renderItem={renderMessage}
                  style={styles.messageList}
                  contentContainerStyle={listContentContainerStyle}
                  scrollEnabled
                  nestedScrollEnabled
                  bounces
                  alwaysBounceVertical
                  overScrollMode="always"
                  showsVerticalScrollIndicator
                  scrollEventThrottle={16}
                  removeClippedSubviews={false}
                  automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
              refreshControl={<RefreshControl tintColor={Colors.primary} refreshing={refreshing || controlRoomQuery.isFetching} onRefresh={() => {
                void messagesQuery.refetch();
                void conversationQuery.refetch();
                void roomStatusQuery.refetch();
                void controlRoomQuery.refetch();
              }} />}
              ListEmptyComponent={
                <View style={styles.emptyState} testID={searchActive ? 'ivx-owner-chat-search-empty' : 'ivx-owner-chat-empty'}>
                  <Sparkles size={28} color={Colors.primary} />
                  <Text style={styles.emptyTitle}>{searchActive ? 'No matching messages' : IVX_OWNER_AI_PROFILE.sharedRoom.emptyTitle}</Text>
                  <Text style={styles.emptyText}>{searchActive ? 'Try a different word or clear search to return to the full owner-room thread.' : resolution.emptyStateText}</Text>
                </View>
              }
              ListFooterComponent={listFooter}
              ListFooterComponentStyle={styles.listFooterContainer}
              onContentSizeChange={() => {
                if (Date.now() >= suppressAutoScrollUntilRef.current && displayedMessages.length <= 2) {
                  scrollOwnerThreadToEnd(false);
                }
              }}
              onScrollToIndexFailed={(info) => {
                suppressAutoScrollUntilRef.current = Date.now() + 1800;
                flatListRef.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index), animated: true });
                setTimeout(() => flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.35 }), 220);
              }}
              onScrollBeginDrag={() => {
                suppressAutoScrollUntilRef.current = Date.now() + 2800;
              }}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
                  testID="ivx-owner-chat-list"
                />
              </View>
            </>
          )}
        </View>

        {primaryState !== 'loading' && primaryState !== 'room_error' ? (
          <View
            style={[
              styles.composerDock,
              {
                paddingBottom: effectiveComposerBottom,
                transform: [{ translateY: -manualKeyboardLift }],
              },
            ]}
            testID="ivx-owner-chat-composer-dock"
          >

            <View
              style={styles.composerCard}
              testID="ivx-owner-chat-composer"
              onLayout={(event) => {
                const nextHeight = event.nativeEvent.layout.height;
                if (Math.abs(nextHeight - composerHeight) > 1) {
                  setComposerHeight(nextHeight);
                  scrollOwnerThreadToEnd(false);
                }
              }}
            >
              {selectedReplyContext ? (
                <View style={styles.replyComposerPreview} testID="ivx-owner-reply-preview">
                  <View style={styles.replyComposerAccent} />
                  <View style={styles.replyComposerCopy}>
                    <Text style={styles.replyComposerLabel} numberOfLines={1}>{`Replying to ${selectedReplyContext.senderLabel}`}</Text>
                    <Text style={styles.replyComposerText} numberOfLines={2}>{selectedReplyContext.previewText}</Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.replyComposerClose, pressed ? { opacity: 0.72 } : null]}
                    onPress={() => setSelectedReplyContext(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Cancel reply"
                    testID="ivx-owner-reply-cancel"
                  >
                    <X size={14} color={Colors.textTertiary} />
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.templateRow} testID="ivx-owner-chat-template-row">
                {OWNER_PROMPT_TEMPLATES.map((template) => (
                  <Pressable
                    key={template.id}
                    style={({ pressed }) => [styles.templateChip, pressed ? { opacity: 0.72 } : null]}
                    onPress={() => handleApplyPromptTemplate(template)}
                    accessibilityRole="button"
                    accessibilityLabel={`Apply ${template.label} prompt template`}
                    testID={template.testID}
                  >
                    <Text style={styles.templateChipText}>{template.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.composerPrimaryRow}>
                <Pressable
                  style={[styles.iconButton, attachmentDisabled ? styles.actionButtonDisabled : null]}
                  onPress={() => void handlePickFile()}
                  disabled={attachmentDisabled}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Attach a file"
                  testID="ivx-owner-chat-attach"
                >
                  <Paperclip size={18} color={attachmentDisabled ? '#7C8797' : Colors.primary} />
                </Pressable>
                <Pressable
                  style={[
                    styles.iconButton,
                    isRecordingVoice ? styles.voiceButtonActive : null,
                    (isTranscribingVoice || messageSendPending || attachmentMutation.isPending || isPickingFile) ? styles.actionButtonDisabled : null,
                  ]}
                  onPress={() => { void handleVoicePress(); }}
                  disabled={isTranscribingVoice || messageSendPending || attachmentMutation.isPending || isPickingFile}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={isRecordingVoice ? 'Stop voice recording' : 'Start voice recording'}
                  testID="ivx-owner-chat-voice"
                >
                  {isRecordingVoice ? <Square size={17} color={Colors.error} /> : <Mic size={18} color={isTranscribingVoice ? '#7C8797' : Colors.primary} />}
                </Pressable>
                <TextInput
                  ref={composerInputRef}
                  style={[styles.composerInput, { height: composerInputHeight }]}
                  value={composerValue}
                  onChangeText={handleComposerChange}
                  editable={!attachmentMutation.isPending && !isPickingFile && !isRecordingVoice && !isTranscribingVoice}
                  placeholder={composerPlaceholder}
                  placeholderTextColor="#B8C0CC"
                  multiline
                  textAlignVertical="top"
                  returnKeyType="send"
                  blurOnSubmit={false}
                  scrollEnabled={composerInputHeight >= 112}
                  onContentSizeChange={(event) => {
                    const nextHeight = Math.min(Math.max(event.nativeEvent.contentSize.height + 4, 44), 112);
                    if (Math.abs(nextHeight - composerInputHeight) > 1) {
                      setComposerInputHeight(nextHeight);
                    }
                    scrollOwnerThreadToEnd(false);
                  }}
                  onFocus={() => {
                    scrollOwnerThreadToEnd(true);
                    setTimeout(() => scrollOwnerThreadToEnd(true), Platform.OS === 'android' ? 420 : 220);
                  }}
                  onSubmitEditing={(event) => {
                    const submittedText = normalizeComposerText(event?.nativeEvent?.text, composerValueRef.current);
                    handleSend(submittedText);
                  }}
                  testID="ivx-owner-chat-input"
                />
                <Pressable
                  style={[styles.sendIconButton, (sendingDisabled || isBusy) ? styles.actionButtonDisabled : null]}
                  onPress={() => {
                    handleSend();
                  }}
                  disabled={sendingDisabled || isBusy}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Send message"
                  testID="ivx-owner-chat-send"
                >
                  <Send size={18} color={sendingDisabled ? '#7C8797' : Colors.black} />
                </Pressable>
              </View>
              <View style={styles.composerSecondaryRow}>
                <Text numberOfLines={1} style={styles.composerHintText}>{composerStatusMessage}</Text>
                <Pressable
                  style={[styles.aiButton, (sendingDisabled || isBusy) ? styles.actionButtonDisabled : null]}
                  onPress={() => {
                    handleAskAI();
                  }}
                  disabled={sendingDisabled || isBusy}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Ask IVX Owner AI"
                  testID="ivx-owner-chat-ai"
                >
                  <Sparkles size={14} color={Colors.text} />
                  <Text style={styles.aiButtonText}>AI</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    minHeight: 0,
    paddingTop: 0,
  },
  androidStatusSpacer: {
    backgroundColor: Colors.background,
  },
  devBanner: {
    marginHorizontal: 8,
    marginBottom: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.28)',
    backgroundColor: 'rgba(59,130,246,0.10)',
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 84,
    justifyContent: 'center' as const,
  },
  devBannerText: {
    color: Colors.info,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700' as const,
  },
  degradedBanner: {
    marginHorizontal: 8,
    marginBottom: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.32)',
    backgroundColor: 'rgba(245,158,11,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 84,
    justifyContent: 'center' as const,
  },
  degradedBannerText: {
    color: Colors.warning,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800' as const,
  },
  blockedBanner: {
    marginHorizontal: 8,
    marginBottom: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.32)',
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 14,
    minHeight: 84,
    justifyContent: 'center' as const,
  },
  blockedBannerText: {
    color: Colors.error,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800' as const,
  },
  topSearchRail: {
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 8,
    backgroundColor: Colors.background,
  },
  searchBarWrap: {
    minHeight: 46,
    borderRadius: 23,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#0F1521',
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 14,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    color: Colors.text,
    fontSize: 15,
    minHeight: 40,
    paddingVertical: 7,
  },
  searchClearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  searchResultText: {
    marginHorizontal: 20,
    marginBottom: 4,
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
  threadViewport: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  pinnedSection: {
    marginHorizontal: 14,
    marginBottom: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(246,200,95,0.24)',
    backgroundColor: 'rgba(246,200,95,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 9,
  },
  pinnedSectionHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 7,
  },
  pinnedSectionTitle: {
    flex: 1,
    color: '#F6C85F',
    fontSize: 12,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  pinnedSectionCount: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '800' as const,
  },
  pinnedMessageList: {
    gap: 8,
  },
  pinnedMessageCard: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(17,23,34,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  pinnedMessageTextStack: {
    flex: 1,
    gap: 2,
  },
  pinnedMessageSender: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.2,
  },
  pinnedMessageText: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '600' as const,
  },
  pinnedMessageMeta: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '600' as const,
  },
  pinnedUnpinButton: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 5,
    backgroundColor: 'rgba(246,200,95,0.12)',
  },
  pinnedUnpinText: {
    color: '#F6C85F',
    fontSize: 11,
    fontWeight: '800' as const,
  },
  productionGuardCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.24)',
    backgroundColor: 'rgba(239,68,68,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  productionGuardEyebrow: {
    color: Colors.error,
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  productionGuardTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '800' as const,
  },
  productionGuardBody: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
  },
  productionGuardList: {
    gap: 10,
  },
  productionGuardItem: {
    gap: 4,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(9,11,15,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.16)',
  },
  productionGuardLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  productionGuardValue: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700' as const,
  },
  developerToolsCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 24,
    backgroundColor: '#08111f',
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.28)',
    gap: 14,
  },
  developerToolsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  developerToolsIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.info,
  },
  developerToolsCopy: {
    flex: 1,
    gap: 3,
  },
  developerToolsEyebrow: {
    color: Colors.info,
    fontSize: 11,
    fontWeight: '800' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  developerToolsTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  controlRoomToggle: {
    minHeight: 32,
    borderRadius: 16,
    paddingHorizontal: 10,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 5,
    backgroundColor: Colors.primary,
  },
  controlRoomToggleText: {
    color: Colors.black,
    fontSize: 11,
    fontWeight: '800' as const,
  },
  controlRoomToggleTextActive: {
    color: Colors.black,
  },
  controlRoomCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 24,
    backgroundColor: '#071017',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.22)',
    gap: 14,
  },
  controlRoomHeaderRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    justifyContent: 'space-between' as const,
    gap: 12,
  },
  controlRoomHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  controlRoomActions: {
    alignItems: 'flex-end' as const,
    gap: 8,
  },
  controlRoomTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '900' as const,
  },
  controlRoomSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600' as const,
  },
  controlRoomError: {
    color: Colors.error,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700' as const,
  },
  controlRoomList: {
    gap: 10,
  },
  controlRoomRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  controlRoomIndex: {
    width: 24,
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '900' as const,
    lineHeight: 18,
  },
  controlRoomRowCopy: {
    flex: 1,
    gap: 6,
  },
  controlRoomRowTop: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: 10,
  },
  controlRoomLabel: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  controlRoomStatusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  controlRoomStatusBadgePass: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.24)',
  },
  controlRoomStatusBadgeWarn: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.24)',
  },
  controlRoomStatusBadgeError: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.24)',
  },
  controlRoomStatusBadgePending: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderColor: 'rgba(59,130,246,0.24)',
  },
  controlRoomStatusText: {
    fontSize: 10,
    fontWeight: '900' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
  },
  controlRoomStatusTextPass: {
    color: Colors.success,
  },
  controlRoomStatusTextWarn: {
    color: Colors.warning,
  },
  controlRoomStatusTextError: {
    color: Colors.error,
  },
  controlRoomStatusTextPending: {
    color: Colors.info,
  },
  controlRoomDetail: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  controlRoomMissing: {
    color: Colors.warning,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700' as const,
  },
  developerStatusGrid: {
    gap: 10,
  },
  developerStatusTile: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
  },
  developerStatusTilePass: {
    backgroundColor: 'rgba(34,197,94,0.10)',
    borderColor: 'rgba(34,197,94,0.24)',
  },
  developerStatusTileWarn: {
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderColor: 'rgba(245,158,11,0.24)',
  },
  developerStatusTileError: {
    backgroundColor: 'rgba(239,68,68,0.10)',
    borderColor: 'rgba(239,68,68,0.24)',
  },
  developerStatusTilePending: {
    backgroundColor: 'rgba(59,130,246,0.10)',
    borderColor: 'rgba(59,130,246,0.24)',
  },
  developerStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
  },
  developerStatusDotPass: {
    backgroundColor: Colors.success,
  },
  developerStatusDotWarn: {
    backgroundColor: Colors.warning,
  },
  developerStatusDotError: {
    backgroundColor: Colors.error,
  },
  developerStatusDotPending: {
    backgroundColor: Colors.info,
  },
  developerStatusLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  developerStatusValue: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  developerToolsFootnote: {
    color: Colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
  },
  sendBranchProofRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    marginHorizontal: 12,
    marginBottom: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 6,
  },
  sendBranchProofLabel: {
    color: 'rgba(255,255,255,0.36)',
    fontSize: 9,
    fontWeight: '700' as const,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  sendBranchProofValue: {
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.3,
  },
  sendBranchProofValuePass: {
    color: '#34D399',
  },
  sendBranchProofValueWarn: {
    color: '#FBBF24',
  },
  sendBranchProofValueDegraded: {
    color: '#F87171',
  },
  sendBranchProofValuePending: {
    color: 'rgba(255,255,255,0.40)',
  },
  sendBranchProofContext: {
    flex: 1,
    color: 'rgba(255,255,255,0.30)',
    fontSize: 9,
    fontWeight: '600' as const,
    textAlign: 'right' as const,
  },
  providerProofCard: {
    marginHorizontal: 8,
    marginBottom: 3,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 0,
    gap: 2,
  },
  providerProofCardPass: {
    borderColor: 'rgba(34,197,94,0.24)',
    backgroundColor: 'rgba(34,197,94,0.08)',
  },
  providerProofCardBlocked: {
    borderColor: 'rgba(239,68,68,0.24)',
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  providerProofCardPending: {
    borderColor: 'rgba(59,130,246,0.24)',
    backgroundColor: 'rgba(59,130,246,0.08)',
  },
  providerProofCardWarn: {
    borderColor: 'rgba(245,158,11,0.24)',
    backgroundColor: 'rgba(245,158,11,0.08)',
  },
  providerProofHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  providerProofCopy: {
    flex: 1,
    gap: 3,
  },
  providerProofTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '800' as const,
  },
  detailsToggle: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.backgroundSecondary,
  },
  detailsToggleText: {
    color: '#D0D0D0',
    fontSize: 8,
    fontWeight: '700' as const,
  },
  providerProofDetail: {
    color: '#E8EDF5',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600' as const,
  },
  qaCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  qaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  qaEyebrow: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  qaTitle: {
    marginTop: 6,
    color: Colors.text,
    fontSize: 17,
    fontWeight: '800' as const,
  },
  qaBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  qaBadgePass: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.24)',
  },
  qaBadgeWarn: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderColor: 'rgba(245,158,11,0.24)',
  },
  qaBadgeBlocked: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.24)',
  },
  qaBadgePending: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderColor: 'rgba(59,130,246,0.24)',
  },
  qaBadgeText: {
    fontSize: 11,
    fontWeight: '800' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  qaBadgeTextPass: {
    color: Colors.success,
  },
  qaBadgeTextWarn: {
    color: Colors.warning,
  },
  qaBadgeTextBlocked: {
    color: Colors.error,
  },
  qaBadgeTextPending: {
    color: Colors.info,
  },
  qaChecklist: {
    gap: 12,
  },
  qaItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  qaDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 5,
  },
  qaDotPass: {
    backgroundColor: Colors.success,
  },
  qaDotWarn: {
    backgroundColor: Colors.warning,
  },
  qaCopy: {
    flex: 1,
    gap: 4,
  },
  qaItemLabel: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  qaItemDetail: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  proofRail: {
    gap: 10,
  },
  proofRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  proofDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 5,
  },
  proofDotPass: {
    backgroundColor: Colors.success,
  },
  proofDotWarn: {
    backgroundColor: Colors.warning,
  },
  proofDotBlocked: {
    backgroundColor: Colors.error,
  },
  proofDotPending: {
    backgroundColor: Colors.info,
  },
  proofCopy: {
    flex: 1,
    gap: 4,
  },
  proofTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  proofDetail: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  proofMeta: {
    color: Colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
  },
  qaScopeText: {
    color: Colors.textTertiary,
    fontSize: 12,
    lineHeight: 18,
  },
  functionalitySummary: {
    alignItems: 'flex-end',
    gap: 4,
  },
  functionalitySummaryText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '800' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  functionalityLedgerList: {
    gap: 10,
  },
  functionalityLedgerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  functionalityLedgerIndex: {
    width: 28,
    color: Colors.textTertiary,
    fontSize: 12,
    fontWeight: '800' as const,
    lineHeight: 18,
  },
  functionalityLedgerCopy: {
    flex: 1,
    gap: 4,
  },
  functionalityLedgerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  functionalityLedgerTitle: {
    flex: 1,
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  functionalityLedgerBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  functionalityLedgerBadgeLive: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.24)',
  },
  functionalityLedgerBadgePass: {
    backgroundColor: 'rgba(59,130,246,0.12)',
    borderColor: 'rgba(59,130,246,0.24)',
  },
  functionalityLedgerBadgeFail: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.24)',
  },
  functionalityLedgerBadgeText: {
    fontSize: 10,
    fontWeight: '800' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  functionalityLedgerBadgeTextLive: {
    color: Colors.success,
  },
  functionalityLedgerBadgeTextPass: {
    color: Colors.info,
  },
  functionalityLedgerBadgeTextFail: {
    color: Colors.error,
  },
  functionalityLedgerDetail: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  functionalityLedgerEvidence: {
    color: Colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
  },
  backendAuditCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.24)',
    backgroundColor: 'rgba(59,130,246,0.08)',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  backendAuditEyebrow: {
    color: Colors.info,
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  backendAuditTitle: {
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  backendAuditBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backendAuditBadgePass: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderColor: 'rgba(34,197,94,0.24)',
  },
  backendAuditBadgeBlocked: {
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderColor: 'rgba(239,68,68,0.24)',
  },
  backendAuditBadgeText: {
    fontSize: 11,
    fontWeight: '800' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  backendAuditBadgeTextPass: {
    color: Colors.success,
  },
  backendAuditBadgeTextBlocked: {
    color: Colors.error,
  },
  backendAuditRow: {
    gap: 2,
  },
  backendAuditLabel: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  backendAuditValue: {
    color: Colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  backendAuditBody: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  backendAuditFootnote: {
    color: Colors.info,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  backendAuditList: {
    gap: 6,
    marginTop: 2,
  },
  backendAuditListItem: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  runtimeProofBanner: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.24)',
    backgroundColor: 'rgba(9,11,15,0.26)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  runtimeProofBannerTitle: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800' as const,
  },
  runtimeProofBannerDetail: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
  },
  graphCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 14,
  },
  graphHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  graphEyebrow: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  graphTitle: {
    marginTop: 6,
    color: Colors.text,
    fontSize: 16,
    fontWeight: '800' as const,
  },
  graphActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  graphActionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.backgroundTertiary,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  graphActionButtonText: {
    color: Colors.text,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  graphNodeList: {
    gap: 10,
  },
  graphNodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  graphNodeDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  graphNodeDotPass: {
    backgroundColor: Colors.success,
  },
  graphNodeDotWarn: {
    backgroundColor: Colors.warning,
  },
  graphNodeDotBlocked: {
    backgroundColor: Colors.error,
  },
  graphNodeDotPending: {
    backgroundColor: Colors.info,
  },
  graphNodeCopy: {
    flex: 1,
    gap: 3,
  },
  graphNodeTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  graphNodeMeta: {
    color: Colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
  },
  graphRiskList: {
    gap: 10,
  },
  graphRiskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  graphRiskCopy: {
    flex: 1,
    gap: 4,
  },
  graphRiskTitle: {
    color: Colors.text,
    fontSize: 13,
    fontWeight: '700' as const,
    textTransform: 'capitalize',
  },
  graphRiskMeta: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  graphRiskValue: {
    color: Colors.warning,
    fontSize: 15,
    fontWeight: '800' as const,
  },
  graphProofList: {
    gap: 10,
  },
  graphProofRow: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: Colors.backgroundTertiary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 4,
  },
  graphProofClaim: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  graphProofMeta: {
    color: Colors.textTertiary,
    fontSize: 11,
    lineHeight: 16,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  loadingEyebrow: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '800' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontSize: 14,
  },
  errorState: {
    flex: 1,
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 24,
    padding: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 10,
  },
  errorTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  retryButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: Colors.black,
    fontSize: 14,
    fontWeight: '700' as const,
  },
  messageList: {
    flex: 1,
    minHeight: 0,
  },
  listContent: {
    flexGrow: 1,
    paddingHorizontal: 10,
    paddingTop: 0,
    gap: 3,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  emptyState: {
    alignItems: 'center',
    gap: 10,
    padding: 20,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  emptyTitle: {
    color: Colors.text,
    fontSize: 18,
    fontWeight: '700' as const,
    textAlign: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  dateSeparatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 18,
    marginTop: 12,
    marginBottom: 10,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.surfaceBorder,
  },
  dateSeparatorText: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  messageRowOwn: {
    justifyContent: 'flex-end',
  },
  messageRowOther: {
    justifyContent: 'flex-start',
  },
  messageRowHighlighted: {
    borderRadius: 24,
    backgroundColor: 'rgba(246,200,95,0.24)',
    borderWidth: 1,
    borderColor: 'rgba(246,200,95,0.62)',
    shadowColor: '#F6C85F',
    shadowOpacity: 0.34,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  missingReplyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(246,200,95,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(246,200,95,0.28)',
  },
  missingReplyText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700' as const,
    lineHeight: 16,
  },
  messageBubble: {
    maxWidth: '86%',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
  },
  messageBubbleOwn: {
    backgroundColor: Colors.primary,
  },
  messageBubbleOther: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  messageLabel: {
    color: Colors.background,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  messageLabelOther: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  assistantLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  messageText: {
    color: Colors.background,
    fontSize: 15,
    lineHeight: 22,
  },
  messageTextOther: {
    color: Colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  messageMeta: {
    color: 'rgba(0,0,0,0.65)',
    fontSize: 11,
    fontWeight: '600' as const,
  },
  messageMetaOther: {
    color: Colors.textTertiary,
    fontSize: 11,
    fontWeight: '600' as const,
  },
  systemMessageRow: {
    alignItems: 'center',
    marginBottom: 12,
  },
  systemBubble: {
    maxWidth: '90%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.18)',
  },
  systemLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  systemLabel: {
    color: Colors.info,
    fontSize: 11,
    fontWeight: '700' as const,
  },
  systemText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  commandCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    backgroundColor: Colors.backgroundTertiary,
    overflow: 'hidden',
  },
  commandRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  commandLabel: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '800' as const,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  commandValue: {
    color: Colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
  systemMeta: {
    color: Colors.textTertiary,
    fontSize: 10,
    fontWeight: '600' as const,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  attachmentText: {
    color: Colors.background,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  attachmentTextOther: {
    color: Colors.text,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  composerDock: {
    paddingHorizontal: 10,
    paddingTop: 6,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.surfaceBorder,
    zIndex: 20,
    elevation: 20,
  },
  composerCard: {
    paddingTop: 8,
    paddingHorizontal: 10,
    paddingBottom: 8,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
    elevation: 6,
  },
  replyComposerPreview: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(246,200,95,0.24)',
    backgroundColor: 'rgba(246,200,95,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  replyComposerAccent: {
    width: 3,
    alignSelf: 'stretch',
    borderRadius: 999,
    backgroundColor: '#F6C85F',
  },
  replyComposerCopy: {
    flex: 1,
    gap: 2,
  },
  replyComposerLabel: {
    color: '#F6C85F',
    fontSize: 11,
    fontWeight: '900' as const,
    letterSpacing: 0.2,
  },
  replyComposerText: {
    color: Colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
  },
  replyComposerClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  templateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 4,
  },
  templateChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(246,200,95,0.26)',
    backgroundColor: 'rgba(246,200,95,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  templateChipText: {
    color: '#F6C85F',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.2,
  },
  composerPrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  composerInput: {
    flex: 1,
    minHeight: 46,
    maxHeight: 112,
    color: '#F8FAFC',
    fontSize: 14,
    lineHeight: 19,
    textAlignVertical: 'top',
    backgroundColor: '#12161C',
    borderRadius: 13,
    paddingHorizontal: 11,
    paddingTop: 10,
    paddingBottom: 10,
    borderWidth: 1,
    borderColor: '#46505E',
    minWidth: 0,
  },
  composerSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 26,
  },
  composerHintText: {
    flex: 1,
    color: '#D2DAE6',
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '600' as const,
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    flexShrink: 0,
  },
  voiceButtonActive: {
    borderColor: 'rgba(239,68,68,0.42)',
    backgroundColor: 'rgba(239,68,68,0.14)',
  },
  sendIconButton: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: Colors.primary,
    flexShrink: 0,
    alignSelf: 'flex-end',
  },
  aiButton: {
    minWidth: 58,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    paddingHorizontal: 10,
    flexShrink: 0,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  aiButtonText: {
    color: Colors.text,
    fontSize: 9,
    fontWeight: '700' as const,
  },
  listFooterSpacer: {
    height: 2,
  },
  listFooterContainer: {
    paddingTop: 4,
  },
});
