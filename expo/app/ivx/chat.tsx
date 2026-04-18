import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
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
import { Paperclip, Send, Sparkles, Terminal } from 'lucide-react-native';
import ErrorBoundary from '@/components/ErrorBoundary';
import Colors from '@/constants/colors';
import { IVX_OWNER_AI_PROFILE } from '@/constants/ivx-owner-ai';
import { useAuth } from '@/lib/auth-context';
import { resolveDevTestModeContext, getDevTestModeLabel } from '@/lib/dev-test-mode';
import { getIVXOwnerAIConfigAudit, type IVXOwnerAIConfigAudit } from '@/lib/ivx-supabase-client';
import { isOpenAccessModeEnabled } from '@/lib/open-access';
import type { IVXMessage, IVXUploadInput } from '@/shared/ivx';
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
  shouldShowRuntimeDebugDetails,
  supportsTrueChunkStreaming,
} from '@/src/modules/chat/chatRuntimeState';
import {
  buildIVXChatAuditReport,
  buildIVXFunctionalityProofList,
  buildIVXRoomRuntimeSnapshot,
  getIVXOwnerAIErrorDiagnostics,
  getLastIVXOwnerAIRuntimeProof,
  ivxAIRequestService,
  ivxChatService,
  ivxInboxService,
  detectIVXRoomStatus,
  invalidateIVXRoomProbeCache,
  type IVXChatAuditReport,
  type IVXFunctionalityProofItem,
  type IVXOwnerReceiveAudit,
  type IVXOwnerRealtimeSubscriptionAudit,
  type IVXOwnerSendAudit,
  type IVXProofRecord,
  type IVXRoomRuntimeSnapshot,
} from '@/src/modules/ivx-owner-ai/services';
import {
  isExplicitSensitiveActionConfirmation,
  resolveOwnerTrustContext,
  stripSensitiveActionConfirmationPrefix,
  type OwnerRequestClass,
} from '@/src/modules/ivx-owner-ai/services/ownerTrust';
import type { ChatRoomRuntimeSignals, ChatRoomStatus, ServiceRuntimeHealth } from '@/src/modules/chat/types/chat';
import { resolveRoomCapabilityState, type RoomCapabilityResolution } from '@/src/modules/chat/services/roomCapabilityResolver';
import { RoomHeader } from '@/src/modules/chat/components/RoomHeader';
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

type ProbeMetadata = {
  observedAt: string | null;
  source: 'remote_api' | 'toolkit_fallback' | 'pending' | 'unknown';
  endpoint: string | null;
  deploymentMarker: string | null;
  lastFailureReason: string | null;
};

type RuntimeDebugSnapshot = {
  authMode: 'owner_session' | 'open_access_dev_bypass' | 'missing_owner_session';
  ownerBypassEnabled: boolean;
  conversationId: string | null;
  requestId: string | null;
  source: 'remote_api' | 'toolkit_fallback' | 'pending' | 'unknown';
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
  activeEndpoint: string;
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
};

type OwnerAIProofStatus = {
  id: 'remote_api_verified' | 'blocked_by_auth' | 'dev_fallback' | 'remote_api_unverified';
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
    if (runtimeSource === 'remote_api') {
      return { branch: 'primary_realtime', label: 'primary_realtime', context: `remote_api db insert${statusFragment}` };
    }
    if (runtimeSource === 'toolkit_fallback') {
      return { branch: 'alternate_shared', label: 'alternate_shared', context: `toolkit db insert${statusFragment}` };
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
  if (source === 'remote_api') {
    return 'cleared';
  }
  if (source === 'toolkit_fallback') {
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
      title: `Blocked at ${runtime.requestStage}`,
      detail: `${runtime.failureClass} · HTTP ${runtime.httpStatus} · ${runtime.failureDetail}`,
    };
  }

  if (runtime.source === 'remote_api' && runtime.requestStage === 'response_ok') {
    return {
      title: 'Live runtime proof captured',
      detail: `Remote API replied 200 from ${runtime.endpoint ?? 'resolved endpoint pending'}`,
    };
  }

  if (runtime.source === 'toolkit_fallback' || runtime.requestStage === 'fallback_reply') {
    if (runtime.hasVisibleResponseText) {
      return {
        title: 'Fallback reply delivered',
        detail: 'Reply was delivered via backup path. Backend is degraded but the room is functional.',
      };
    }
    return {
      title: 'Fallback path active',
      detail: 'The room is replying through the backup path. Waiting for response.',
    };
  }

  if (isPendingRequestState(runtime)) {
    return {
      title: 'Awaiting live runtime proof',
      detail: 'Send one real message now and inspect stage, status, request ID, and response preview below.',
    };
  }

  return {
    title: 'Runtime proof idle',
    detail: 'No completed live send has been captured in this session yet.',
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
const AI_PROBE_INTERVAL_MS = 30_000;
const OWNER_COMMAND_PREFIX = '/';
const DEFAULT_OWNER_AI_CONFIG_AUDIT: IVXOwnerAIConfigAudit = getIVXOwnerAIConfigAudit();

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
    `Explanation: Owner room trust is active, but fallback_chat_only mode limits ${actionReason}. I can discuss or plan ${requestedAction}, but I will not claim backend/admin execution until backend_admin_verified is restored.`,
    'Evidence: owner_room_authenticated · backend_admin_unverified · fallback_chat_only',
    'Affected dependencies: owner room trust → fallback runtime → backend admin execution gate',
    'Operator action log: chat_only_limit',
    'Rollback: not required',
    'Linked proof cards: wait for backend_admin_verified or continue in chat-only mode',
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

function isOwnMessage(message: IVXMessage, ownerId: string): boolean {
  if (!safeTrim(ownerId)) {
    return message.senderRole === 'owner';
  }

  return message.senderUserId === ownerId || message.senderRole === 'owner';
}

function getAttachmentLabel(message: IVXMessage): string {
  return message.attachmentName ?? message.attachmentUrl ?? 'Attachment';
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
  const flatListRef = useRef<FlatList<IVXMessage> | null>(null);
  const composerInputRef = useRef<TextInput | null>(null);
  const composerValueRef = useRef<string>('');
  const insets = useSafeAreaInsets();
  const { user, userId } = useAuth();
  const [composerValue, setComposerValue] = useState<string>('');
  const [isPickingFile, setIsPickingFile] = useState<boolean>(false);
  const [composerHeight, setComposerHeight] = useState<number>(0);
  const [keyboardInset, setKeyboardInset] = useState<number>(0);
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const isOpenAccessBuild = isOpenAccessModeEnabled();
  const ownerId = useMemo<string>(() => user?.id ?? userId ?? (isOpenAccessBuild ? 'ivx-dev-owner' : ''), [isOpenAccessBuild, user?.id, userId]);
  const ownerLabel = useMemo<string>(() => safeTrim(user?.email) || (isOpenAccessBuild ? 'IVX Owner Dev' : 'IVX Owner'), [isOpenAccessBuild, user?.email]);
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
  const roomStatusLoading = roomStatusQuery.isLoading;

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
  const ownerRoomAuthenticated = useMemo<boolean>(() => {
    if (devTestMode.testModeActive) {
      return true;
    }
    const normalizedConversationId = safeTrim(conversationQuery.data?.id);
    const normalizedConversationSlug = safeTrim(conversationQuery.data?.slug);
    return isOpenAccessBuild
      || !!user
      || !!userId
      || normalizedConversationId === IVX_OWNER_AI_PROFILE.sharedRoom.id
      || normalizedConversationSlug === IVX_OWNER_AI_PROFILE.sharedRoom.slug;
  }, [conversationQuery.data?.id, conversationQuery.data?.slug, devTestMode.testModeActive, isOpenAccessBuild, user, userId]);
  const [transientAssistantMessages, setTransientAssistantMessages] = useState<IVXMessage[]>([]);
  const [pendingOwnerMessages, setPendingOwnerMessages] = useState<PendingOwnerMessage[]>([]);
  const normalizedComposerValue = useMemo<string>(() => normalizeComposerText(composerValue), [composerValue]);
  const sendingDisabled = safeTrim(normalizedComposerValue).length === 0;
  const allMessages = useMemo<IVXMessage[]>(() => {
    const persistentAssistantBodies = new Set(
      messages
        .filter((message) => message.senderRole === 'assistant')
        .map((message) => safeTrim(message.body))
        .filter((body) => body.length > 0),
    );
    const transientIds = new Set(transientAssistantMessages.map((message) => message.id));
    const deduped = new Map<string, IVXMessage>();

    for (const pendingMessage of pendingOwnerMessages) {
      const normalizedPendingText = safeTrim(pendingMessage.text);
      if (!normalizedPendingText) {
        continue;
      }

      deduped.set(pendingMessage.clientId, {
        id: pendingMessage.clientId,
        conversationId: conversationQuery.data?.id ?? 'ivx-owner-room',
        senderUserId: ownerId || null,
        senderRole: 'owner',
        senderLabel: ownerLabel,
        body: pendingMessage.text,
        attachmentUrl: null,
        attachmentName: null,
        attachmentMime: null,
        attachmentSize: null,
        attachmentKind: 'text',
        createdAt: pendingMessage.createdAt,
        updatedAt: pendingMessage.createdAt,
      });
    }

    for (const message of [...messages, ...transientAssistantMessages]) {
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

    void ivxInboxService.markOwnerConversationAsRead(conversationQuery.data?.id).catch((error: unknown) => {
      console.log('[IVXOwnerChatRoute] Mark read failed:', error instanceof Error ? error.message : 'unknown');
    });
  }, [conversationQuery.data?.id, messages.length]);

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
    });
    console.log('[IVXOwnerChatRoute] Support message persisted:', role, trimmedText.slice(0, 60));
  }, []);

  const [aiBackendReachable, setAiBackendReachable] = useState<boolean>(false);
  const [aiHealthDetail, setAiHealthDetail] = useState<ServiceRuntimeHealth>('inactive');
  const [messageSendPending, setMessageSendPending] = useState<boolean>(false);
  const [aiReplyPending, setAiReplyPending] = useState<boolean>(false);
  const [ownerCommandsActive, setOwnerCommandsActive] = useState<boolean>(true);
  const [knowledgeActive, setKnowledgeActive] = useState<boolean>(false);
  const [codeAwareActive, setCodeAwareActive] = useState<boolean>(false);
  const [roomProbeAt, setRoomProbeAt] = useState<string | null>(null);
  const [aiProbeMetadata, setAiProbeMetadata] = useState<ProbeMetadata>({
    observedAt: null,
    source: 'unknown',
    endpoint: null,
    deploymentMarker: null,
    lastFailureReason: null,
  });
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
  const ownerAIRoutingBlocked = ownerAIConfigAudit.blocksRemoteRequests || (ownerAIConfigAudit.currentEnvironment === 'production' && (!ownerAIConfigAudit.productionReady || ownerAIConfigAudit.pointsToDevHost));
  const effectiveAiBackendReachable = ownerAIRoutingBlocked ? false : aiBackendReachable;
  const effectiveAiHealthDetail: ServiceRuntimeHealth = ownerAIRoutingBlocked ? 'inactive' : aiHealthDetail;
  const trustRuntimeState = useMemo(() => ({
    source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
    requestStage: runtimeDebugSnapshot.requestStage,
    failureClass: runtimeDebugSnapshot.failureClass,
    isFallback: runtimeDebugSnapshot.source === 'toolkit_fallback',
    isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
    hasVisibleResponseText: runtimeDebugSnapshot.hasVisibleResponseText,
  }), [runtimeDebugSnapshot]);
  const fallbackChatOnlyActive = useMemo<boolean>(() => {
    if (devTestMode.testModeActive) {
      return false;
    }
    return ownerAIRoutingBlocked
      || aiProbeMetadata.source === 'toolkit_fallback'
      || trustRuntimeState.source === 'toolkit_fallback'
      || shouldShowFallbackUI(trustRuntimeState);
  }, [aiProbeMetadata.source, devTestMode.testModeActive, ownerAIRoutingBlocked, trustRuntimeState]);
  const backendAdminVerified = useMemo<boolean>(() => {
    if (devTestMode.testModeActive) {
      return true;
    }
    if (!ownerRoomAuthenticated) {
      return false;
    }

    if (fallbackChatOnlyActive || ownerAIRoutingBlocked) {
      return false;
    }

    return trustRuntimeState.source === 'remote_api'
      || aiProbeMetadata.source === 'remote_api'
      || (effectiveAiBackendReachable && effectiveAiHealthDetail === 'active');
  }, [aiProbeMetadata.source, devTestMode.testModeActive, effectiveAiBackendReachable, effectiveAiHealthDetail, fallbackChatOnlyActive, ownerAIRoutingBlocked, ownerRoomAuthenticated, trustRuntimeState.source]);
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
    controlTowerAggregator.start();
    setNerveSnapshot(controlTowerAggregator.getSnapshot());
    const unsubscribe = controlTowerAggregator.subscribe((snapshot) => {
      setNerveSnapshot(snapshot);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
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
  }, [conversationQuery.data?.id, ownerId, ownerLabel]);

  const assistantReplyMutation = useMutation<void, Error, { text: string; nonBlocking: boolean }>({
    mutationFn: async ({ text, nonBlocking }) => {
      console.log('[IVXOwnerChatRoute] assistant_generation_start. nonBlocking:', nonBlocking);
      const startedAt = Date.now();
      const startedAtIso = new Date(startedAt).toISOString();
      const placeholderId = createTransientMessageId('ivx-owner-ai-placeholder');
      const placeholderMessage: IVXMessage = {
        id: placeholderId,
        conversationId: conversationQuery.data?.id ?? 'ivx-owner-room',
        senderUserId: null,
        senderRole: 'assistant',
        senderLabel: IVX_OWNER_AI_PROFILE.name,
        body: '',
        attachmentUrl: null,
        attachmentName: null,
        attachmentMime: null,
        attachmentSize: null,
        attachmentKind: 'text',
        createdAt: startedAtIso,
        updatedAt: startedAtIso,
      };

      setTransientAssistantMessages((current) => [...current, placeholderMessage]);
      setRuntimeDebugSnapshot((current) => ({
        ...current,
        conversationId: conversationQuery.data?.id ?? current.conversationId,
        requestStage: 'request_started',
        failureClass: 'pending',
        httpStatus: 'pending',
        source: 'pending',
        responsePreview: safeTrim(text).slice(0, 160) || current.responsePreview,
        failureDetail: 'Awaiting AI response from live runtime.',
        lastAttemptAt: startedAtIso,
        hasVisibleResponseText: false,
      }));
      setAiReplyPending(true);
      try {
        const aiResult = await ivxAIRequestService.requestOwnerAI({
          message: text,
          senderLabel: ownerLabel,
          mode: 'chat',
          devTestModeActive: devTestMode.testModeActive,
        });
        const runtimeProof = getLastIVXOwnerAIRuntimeProof();
        const normalizedSource = normalizeRuntimeSource(runtimeProof?.source ?? aiResult.source);
        const normalizedAnswer = safeTrim(aiResult.answer);

        console.log('[IVXOwnerChatRoute] assistant_generation_success:', { source: normalizedSource, answerLength: normalizedAnswer.length, requestId: aiResult.requestId });
        if (!normalizedAnswer) {
          throw new Error('IVX Owner AI completed without returning visible response text.');
        }

        console.log('[IVXOwnerChatRoute] assistant_send_attempt (primary path)');
        setTransientAssistantMessages((current) => current.map((message) => {
          if (message.id !== placeholderId) {
            return message;
          }

          return {
            ...message,
            body: normalizedAnswer,
            updatedAt: new Date().toISOString(),
          };
        }));
        setRuntimeDebugSnapshot((current) => ({
          ...current,
          requestStage: normalizedSource === 'remote_api' ? 'response_ok' : 'fallback_reply',
          failureClass: 'none',
          source: normalizedSource,
          httpStatus: runtimeProof?.statusCode !== null && runtimeProof?.statusCode !== undefined
            ? String(runtimeProof.statusCode)
            : normalizedSource === 'remote_api'
              ? '200'
              : 'fallback',
          responsePreview: runtimeProof?.responsePreview ?? (normalizedAnswer.slice(0, 160) || current.responsePreview),
          failureDetail: runtimeProof?.detail ?? (normalizedSource === 'remote_api'
            ? 'Live backend replied with visible response text.'
            : 'Toolkit fallback produced visible response text.'),
          lastVerifiedAt: new Date().toISOString(),
          hasVisibleResponseText: true,
        }));

        const resolvedHealth: ServiceRuntimeHealth = (normalizedSource === 'toolkit_fallback' && !devTestMode.testModeActive) ? 'degraded' : 'active';
        setAiBackendReachable(true);
        setAiHealthDetail(resolvedHealth);
        setKnowledgeActive(true);
        setOwnerCommandsActive(true);
        setCodeAwareActive(true);
        setAiProbeMetadata({
          observedAt: new Date().toISOString(),
          source: normalizedSource,
          endpoint: aiResult.endpoint ?? runtimeProof?.endpoint ?? null,
          deploymentMarker: aiResult.deploymentMarker ?? runtimeProof?.deploymentMarker ?? null,
          lastFailureReason: null,
        });
        setRuntimeDebugSnapshot((current) => {
          const nextRequestStage = (runtimeProof?.failureClass === 'none' ? runtimeProof?.requestStage : null)
            ?? (normalizedSource === 'remote_api' ? 'response_ok' : 'fallback_reply');
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
              : normalizedSource === 'remote_api' ? '200' : 'fallback',
            responsePreview: runtimeProof?.responsePreview ?? (normalizedAnswer.slice(0, 160) || current.responsePreview),
            failureDetail: normalizedSource === 'remote_api'
              ? 'Live backend replied with visible response text.'
              : 'Toolkit fallback produced visible response text.',
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
          await persistSupportMessage(normalizedAnswer, 'assistant');
          console.log('[IVXOwnerChatRoute] assistant_commit_success (primary path)');
          await queryClient.invalidateQueries({ queryKey: IVX_OWNER_MESSAGES_QUERY_KEY });
          setTransientAssistantMessages((current) => current.filter((message) => message.id !== placeholderId));
        } catch (persistErr) {
          console.log('[IVXOwnerChatRoute] assistant_commit_failed (primary path, transient preserved):', persistErr instanceof Error ? persistErr.message : 'unknown');
          void queryClient.invalidateQueries({ queryKey: IVX_OWNER_MESSAGES_QUERY_KEY });
        }
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
              message: normalizedAnswer.slice(0, 240),
            },
          });
          if (normalizedSource === 'toolkit_fallback') {
            liveIntelligenceService.captureEvent({
              eventName: 'fallback_used',
              screen: '/ivx/chat',
              module: 'chat',
              sessionId: ownerSessionIdRef.current,
              userId: ownerId || null,
              anonId: ownerId || ownerSessionIdRef.current,
              metadata: {
                roomId: conversationQuery.data?.id ?? 'ivx-owner-room',
                fallbackSource: normalizedSource,
                endpoint: aiResult.endpoint ?? null,
              },
            });
          }
        } catch (eventErr) {
          console.log('[IVXOwnerChatRoute] Post-processing event capture failed (response still delivered):', eventErr instanceof Error ? eventErr.message : 'unknown');
        }
      } catch (aiErr) {
        const diagnostics = getIVXOwnerAIErrorDiagnostics(aiErr);
        const failureMessage = aiErr instanceof Error ? aiErr.message : 'Unable to reach IVX Owner AI.';
        console.log('[IVXOwnerChatRoute] assistant_send_failure:', {
          failureMessage,
          diagnostics,
          blockedByRoutingGuard: ownerAIRoutingBlocked,
          activeEndpoint: ownerAIConfigAudit.activeEndpoint,
          routingPolicy: ownerAIConfigAudit.routingPolicy,
        });
        const fallbackBody = ownerAIRoutingBlocked
          ? `Configuration error: ${ownerAIConfigAudit.configurationError ?? failureMessage} Owner AI remote routing is blocked in this build until EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL is fixed.`
          : devTestMode.testModeActive
            ? `AI request failed: ${failureMessage}`
            : 'Audit fallback reply: IVX Owner AI is unreachable right now. The room stays open, your message remains in the transcript, and operator commands can continue in degraded mode while backend routing is audited.';
        setTransientAssistantMessages((current) => current.map((message) => {
          if (message.id !== placeholderId) {
            return message;
          }
          return {
            ...message,
            body: fallbackBody,
            updatedAt: new Date().toISOString(),
          };
        }));
        setRuntimeDebugSnapshot((current) => ({
          ...current,
          conversationId: conversationQuery.data?.id ?? current.conversationId,
          requestId: diagnostics?.requestId ?? current.requestId,
          source: normalizeRuntimeSource(current.source === 'pending' ? 'toolkit_fallback' : current.source),
          endpoint: diagnostics?.endpoint ?? current.endpoint ?? ownerAIConfigAudit.activeEndpoint,
          requestStage: 'fallback_reply',
          failureClass: 'none',
          httpStatus: diagnostics?.statusCode !== null && diagnostics?.statusCode !== undefined
            ? String(diagnostics.statusCode)
            : 'fallback',
          responsePreview: fallbackBody.slice(0, 160),
          failureDetail: `AI request failed (${failureMessage}), fallback message delivered to thread.`,
          hasVisibleResponseText: true,
        }));
        setFallbackSuccessCount((count) => count + 1);
        setAiBackendReachable(false);
        setAiHealthDetail('degraded');
        setAiProbeMetadata((current) => ({
          ...current,
          observedAt: new Date().toISOString(),
          source: 'toolkit_fallback',
          endpoint: current.endpoint ?? ownerAIConfigAudit.activeEndpoint,
          lastFailureReason: null,
        }));
        liveIntelligenceService.captureEvent({
          eventName: ownerAIRoutingBlocked ? 'routing_selected' : 'error_seen',
          screen: '/ivx/chat',
          module: 'chat',
          sessionId: ownerSessionIdRef.current,
          userId: ownerId || null,
          anonId: ownerId || ownerSessionIdRef.current,
          metadata: {
            roomId: conversationQuery.data?.id ?? 'ivx-owner-room',
            blockedByRoutingGuard: ownerAIRoutingBlocked,
            failureMessage,
            endpoint: ownerAIConfigAudit.activeEndpoint,
          },
        });
        console.log('[IVXOwnerChatRoute] assistant_commit_attempt (fallback path)');
        try {
          await persistSupportMessage(fallbackBody, 'assistant');
          console.log('[IVXOwnerChatRoute] assistant_commit_success (fallback path)');
          await queryClient.invalidateQueries({ queryKey: IVX_OWNER_MESSAGES_QUERY_KEY });
          setTransientAssistantMessages((current) => current.filter((message) => message.id !== placeholderId));
        } catch (persistErr) {
          console.log('[IVXOwnerChatRoute] Fallback persist failed, transient message preserved in thread:', persistErr instanceof Error ? persistErr.message : 'unknown');
        }
        setLastReplyAt(new Date().toISOString());
      } finally {
        setAiReplyPending(false);
      }
    },
    onError: (error) => {
      console.log('[IVXOwnerChatRoute] Assistant reply mutation error:', error.message);
      Alert.alert('AI reply unavailable', error.message);
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

  const sendMessageMutation = useMutation<void, Error, { text: string; mode: 'send_only' | 'send_and_ai' | 'ai_only'; clientId: string; capturedText: string }>({
    mutationFn: async ({ text, mode }) => {
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
          await ivxChatService.sendOwnerTextMessage({ body: text, senderLabel: ownerLabel });
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
          message: text,
          confirmedSensitiveAction,
          requestClass: trustContext.requestClass,
          trustStates: trustContext.namedStates,
        },
      });
      setMessageSendPending(true);
      try {
        await ivxChatService.sendOwnerTextMessage({ body: text, senderLabel: ownerLabel });
        setLastSendAt(new Date().toISOString());
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
      setPendingOwnerMessages((current) => current.filter((message) => message.clientId !== variables.clientId));
      console.log('[IVXOwnerChatRoute] Send mutation error:', error.message);
      Alert.alert('Message not sent', error.message);
    },
    onSettled: () => {
      setMessageSendPending(false);
    },
  });

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const applyCapabilityHealth = (health: ServiceRuntimeHealth) => {
      const isAvailable = health === 'active' || health === 'degraded';
      setAiBackendReachable(isAvailable);
      setAiHealthDetail(health);
      setKnowledgeActive(isAvailable);
      setOwnerCommandsActive(isAvailable);
      setCodeAwareActive(isAvailable);
      if (isAvailable) {
        probeRetryCount.current = 0;
      }
    };

    const singleProbeAttempt = async (): Promise<ServiceRuntimeHealth> => {
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
      return result.health;
    };

    const probe = async () => {
      const health = await singleProbeAttempt();
      if (cancelled) return;

      if (health === 'active' || health === 'degraded') {
        applyCapabilityHealth(health);
        return;
      }

      if (probeRetryCount.current < MAX_PROBE_RETRIES) {
        probeRetryCount.current += 1;
        console.log('[IVXOwnerChatRoute] AI health probe: retry', probeRetryCount.current, 'of', MAX_PROBE_RETRIES, 'in', PROBE_RETRY_DELAY_MS, 'ms');
        await new Promise((resolve) => setTimeout(resolve, PROBE_RETRY_DELAY_MS));
        if (cancelled) return;
        const retryHealth = await singleProbeAttempt();
        if (cancelled) return;
        if (retryHealth === 'active' || retryHealth === 'degraded') {
          applyCapabilityHealth(retryHealth);
          return;
        }
      }

      if (aiReachableRef.current) {
        console.log('[IVXOwnerChatRoute] AI health probe: inactive after retries, keeping degraded state');
        setAiBackendReachable(true);
        setAiHealthDetail('degraded');
      } else {
        console.log('[IVXOwnerChatRoute] AI health probe: inactive after retries');
        setAiBackendReachable(false);
        setAiHealthDetail('inactive');
      }
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
    if (devTestMode.testModeActive) {
      const isReplying = aiReplyPending;
      const normalizedBypassSource = normalizeRuntimeSource(runtimeDebugSnapshot.source);
      const aiBackendSource: ChatRoomRuntimeSignals['aiBackendSource'] = normalizedBypassSource === 'pending'
        ? 'unknown'
        : normalizedBypassSource;
      return {
        aiBackendHealth: 'active',
        aiBackendSource,
        aiResponseState: isReplying ? 'responding' : 'idle',
        knowledgeBackendHealth: 'active',
        ownerCommandAvailability: 'active',
        codeAwareServiceAvailability: 'active',
      };
    }
    const normalizedRuntimeState = {
      source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
      requestStage: runtimeDebugSnapshot.requestStage,
      failureClass: runtimeDebugSnapshot.failureClass,
      isFallback: runtimeDebugSnapshot.source === 'toolkit_fallback',
      isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
      hasVisibleResponseText: runtimeDebugSnapshot.hasVisibleResponseText,
    };
    const activeRuntimeSource = getActiveRuntimeSource(normalizedRuntimeState);
    const activeFallback = shouldShowFallbackUI(normalizedRuntimeState);
    const hasFailure = hasRuntimeFailure(normalizedRuntimeState);
    const effectiveAiHealth: ServiceRuntimeHealth = hasFailure
      ? activeFallback
        ? 'degraded'
        : 'inactive'
      : activeFallback
        ? 'degraded'
        : aiReplyPending || activeRuntimeSource === 'remote_api' || aiHealthDetail !== 'inactive'
          ? 'active'
          : 'inactive';
    const isAiLive = effectiveAiHealth === 'active';
    const isAiDegraded = effectiveAiHealth === 'degraded';
    return {
      aiBackendHealth: effectiveAiHealth,
      aiBackendSource: activeRuntimeSource === 'pending' ? 'unknown' : activeRuntimeSource,
      aiResponseState: aiReplyPending ? 'responding' : isAiLive ? 'idle' : 'inactive',
      knowledgeBackendHealth: isAiLive || knowledgeActive ? 'active' : isAiDegraded ? 'degraded' : 'inactive',
      ownerCommandAvailability: ownerCommandsActive || isAiLive ? 'active' : isAiDegraded ? 'degraded' : 'inactive',
      codeAwareServiceAvailability: isAiLive || codeAwareActive ? 'active' : isAiDegraded ? 'degraded' : 'inactive',
    };
  }, [aiHealthDetail, aiReplyPending, codeAwareActive, devTestMode.testModeActive, knowledgeActive, ownerCommandsActive, runtimeDebugSnapshot]);

  const resolution = useMemo<RoomCapabilityResolution>(() => {
    console.log('[IVXOwnerChatRoute] Resolving capabilities:', {
      storageMode: ivxRoomStatus?.storageMode ?? 'unknown',
      deliveryMethod: ivxRoomStatus?.deliveryMethod ?? 'unknown',
      aiHealth: effectiveAiHealthDetail,
      aiReachable: effectiveAiBackendReachable,
      knowledgeActive,
      ownerCommandsActive,
    });
    return resolveRoomCapabilityState(ivxRoomStatus, runtimeSignals);
  }, [effectiveAiBackendReachable, effectiveAiHealthDetail, ivxRoomStatus, runtimeSignals, knowledgeActive, ownerCommandsActive]);

  const attachmentMutation = useMutation<IVXMessage, Error, IVXUploadInput>({
    mutationFn: async (upload) => {
      const capturedBody = composerValueRef.current;
      console.log('[IVXOwnerChatRoute] Attachment send body length:', capturedBody.length);
      return ivxChatService.sendOwnerAttachmentMessage({
        upload,
        body: capturedBody,
        senderLabel: ownerLabel,
      });
    },
    onSuccess: async () => {
      commitComposerClear(normalizeComposerText(composerValueRef.current));
      await queryClient.invalidateQueries({ queryKey: IVX_OWNER_MESSAGES_QUERY_KEY });
    },
    onError: (error) => {
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

    composerValueRef.current = '';
    setComposerValue('');
    composerInputRef.current?.clear();
  }, []);

  const handleSend = useCallback((submittedText?: unknown) => {
    if (messageSendPending || attachmentMutation.isPending || isPickingFile) return;
    const normalizedText = normalizeComposerText(submittedText, composerValueRef.current);
    const text = safeTrim(normalizedText);
    if (!text) {
      console.log('[IVXOwnerChatRoute] Skipping empty send after normalization');
      return;
    }
    const isCommand = text.startsWith(OWNER_COMMAND_PREFIX);
    const mode = isCommand ? 'send_only' : 'send_and_ai';
    const clientId = createTransientMessageId('ivx-owner-local-send');
    const createdAt = new Date().toISOString();
    setPendingOwnerMessages((current) => [...current, { clientId, text: normalizedText, createdAt }]);
    console.log('[IVXOwnerChatRoute] handleSend mode:', mode, 'isCommand:', isCommand, 'aiReachable:', aiReachableRef.current, 'length:', text.length, 'clientId:', clientId);
    sendMessageMutation.mutate({ text, mode: mode as 'send_only' | 'send_and_ai', clientId, capturedText: normalizedText });
  }, [attachmentMutation.isPending, isPickingFile, messageSendPending, sendMessageMutation]);

  const handleAskAI = useCallback((submittedText?: unknown) => {
    if (messageSendPending || aiReplyPending || attachmentMutation.isPending || isPickingFile) return;
    const normalizedText = normalizeComposerText(submittedText, composerValueRef.current);
    const text = safeTrim(normalizedText);
    if (!text) {
      console.log('[IVXOwnerChatRoute] Skipping empty AI ask after normalization');
      return;
    }
    const clientId = createTransientMessageId('ivx-owner-ai-only-send');
    const createdAt = new Date().toISOString();
    setPendingOwnerMessages((current) => [...current, { clientId, text: normalizedText, createdAt }]);
    console.log('[IVXOwnerChatRoute] handleAskAI explicit AI request length:', text.length, 'clientId:', clientId);
    sendMessageMutation.mutate({ text, mode: 'ai_only', clientId, capturedText: normalizedText });
  }, [aiReplyPending, attachmentMutation.isPending, isPickingFile, messageSendPending, sendMessageMutation]);

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
      setIsPickingFile(true);
      const pickerResult = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: '*/*',
      });

      if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
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

      console.log('[IVXOwnerChatRoute] Sending file upload:', upload.name);
      await attachmentMutation.mutateAsync(upload);
    } catch (error) {
      Alert.alert('File pick failed', error instanceof Error ? error.message : 'Unknown file picker error.');
    } finally {
      setIsPickingFile(false);
    }
  }, [attachmentMutation, isPickingFile]);

  const renderMessage = useCallback(({ item }: { item: IVXMessage }) => {
    const ownMessage = isOwnMessage(item, ownerId);
    const isAssistant = item.senderRole === 'assistant';
    const isSystem = item.senderRole === 'system';

    if (isSystem) {
      const structuredRows = parseStructuredSystemMessage(item.body);
      return (
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
      );
    }

    return (
      <View
        style={[styles.messageRow, ownMessage ? styles.messageRowOwn : styles.messageRowOther]}
        testID={`ivx-owner-message-${item.id}`}
      >
        <MessageBubble
          message={{
            id: item.id,
            conversationId: item.conversationId,
            senderId: item.senderUserId ?? item.senderRole,
            senderLabel: isAssistant ? (item.senderLabel ?? IVX_OWNER_AI_PROFILE.name) : (item.senderLabel ?? 'IVX Owner'),
            text: item.body ?? '',
            createdAt: item.createdAt,
            sendStatus: 'sent',
            optimistic: false,
            localOnly: false,
            readBy: ownMessage ? ['owner', 'assistant'] : undefined,
            fileUrl: item.attachmentUrl ?? undefined,
            fileName: item.attachmentName ?? undefined,
            fileType: item.attachmentKind === 'image'
              ? 'image'
              : item.attachmentKind === 'video'
                ? 'video'
                : item.attachmentKind === 'pdf'
                  ? 'pdf'
                  : item.attachmentUrl
                    ? 'file'
                    : undefined,
          }}
          isMine={ownMessage}
        />
      </View>
    );
  }, [ownerId]);

  const loading = messagesQuery.isLoading || conversationQuery.isLoading;
  const refreshing = messagesQuery.isRefetching || conversationQuery.isRefetching;
  const isBusy = messageSendPending || attachmentMutation.isPending || isPickingFile;
  const isAIDegraded = resolution.aiIndicator.state === 'degraded';
  const degradedStatusNote = useMemo(() => {
    return resolution.composerNotes.find((note) => note.id === 'ai-degraded')?.text
      ?? 'AI is degraded, but the room stays usable and messages still send.';
  }, [resolution.composerNotes]);
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
      model: runtimeSignals.aiBackendSource === 'toolkit_fallback' ? 'rork-toolkit-fallback' : runtimeSignals.aiBackendSource === 'remote_api' ? 'ivx-owner-remote' : 'unverified',
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
      recommendedResolution = `${recommendedResolution} Production does not silently downgrade Owner AI routing to a dev host or toolkit-backed health state when the configured remote endpoint fails.`;
    }

    if (ownerAIRoutingBlocked && ownerAIConfigAudit.currentEnvironment === 'production') {
      recommendedResolution = ownerAIConfigAudit.pointsToDevHost
        ? 'Replace the development-like Owner AI host with the intended production public URL in EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL.'
        : 'Provide EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL in production. No implicit fallback to EXPO_PUBLIC_RORK_API_BASE_URL or project-scoped dev hosts is allowed.';
    }

    return {
      currentEnvironment: ownerAIConfigAudit.currentEnvironment,
      routingPolicy: ownerAIConfigAudit.routingPolicy,
      auditState: ownerAIRoutingBlocked
        ? 'guard_blocked'
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
      activeEndpoint,
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
    if (devTestMode.testModeActive) {
      return null;
    }

    const normalizedRuntimeState = {
      source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
      requestStage: runtimeDebugSnapshot.requestStage,
      failureClass: runtimeDebugSnapshot.failureClass,
      isFallback: runtimeDebugSnapshot.source === 'toolkit_fallback',
      isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
      hasVisibleResponseText: runtimeDebugSnapshot.hasVisibleResponseText,
    };

    if (ownerAIRoutingBlocked) {
      return `Owner AI routing blocked. ${ownerAIConfigAudit.configurationError ?? backendAuditSummary.failureMode}`;
    }

    if (hasRuntimeFailure(normalizedRuntimeState) && aiProbeMetadata.lastFailureReason && !normalizedRuntimeState.hasVisibleResponseText) {
      return `Owner AI backend unreachable. ${backendAuditSummary.failureMode}`;
    }

    if (runtimeSnapshot.notes.length > 0 && !runtimeDebugSnapshot.hasVisibleResponseText) {
      return runtimeSnapshot.notes[0] ?? null;
    }

    if (shouldShowFallbackUI(normalizedRuntimeState)) {
      if (normalizedRuntimeState.hasVisibleResponseText) {
        return 'Owner room authenticated. Fallback chat-only mode delivered the reply without requiring identity re-verification.';
      }
      return 'Owner room authenticated. Fallback chat-only mode is active while backend execution proof recovers.';
    }

    if (isOpenAccessBuild && !runtimeDebugSnapshot.hasVisibleResponseText) {
      return 'Open-access development mode is active. Owner room access is unblocked in this build.';
    }

    return null;
  }, [aiProbeMetadata.lastFailureReason, backendAuditSummary.failureMode, devTestMode.testModeActive, isOpenAccessBuild, ownerAIConfigAudit.configurationError, ownerAIRoutingBlocked, runtimeDebugSnapshot, runtimeSnapshot.notes]);
  const ownerAIProofStatus = useMemo<OwnerAIProofStatus>(() => {
    if (devTestMode.testModeActive) {
      return {
        id: 'remote_api_verified',
        tone: 'pass',
        title: 'owner test mode active',
        detail: 'TEST_MODE is active. Owner is fully trusted. All actions execute directly without confirmation gates.',
        evidence: `test_mode · owner_room_authenticated · backend_admin_verified · full_backend_execution`,
        testID: 'ivx-owner-proof-test-mode-active',
      };
    }

    const normalizedRuntimeState = {
      source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
      requestStage: runtimeDebugSnapshot.requestStage,
      failureClass: runtimeDebugSnapshot.failureClass,
      isFallback: runtimeDebugSnapshot.source === 'toolkit_fallback',
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
        tone: fallbackHasVisibleReply ? 'pass' : 'warn',
        title: fallbackHasVisibleReply ? 'fallback reply delivered' : 'dev fallback',
        detail: fallbackHasVisibleReply
          ? 'Reply was delivered via fallback_chat_only. Owner room trust stayed active, backend admin proof stayed separated, and the room remained functional.'
          : 'The room is usable in fallback_chat_only mode. Normal owner conversation stays available while deployed backend proof recovers.',
        evidence: `${runtimeSnapshot.provider.endpoint ?? backendAuditSummary.activeFallbackBaseUrl} · fallback ${backendAuditSummary.fallbackUsed}`,
        testID: fallbackHasVisibleReply ? 'ivx-owner-proof-fallback-delivered' : 'ivx-owner-proof-dev-fallback',
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
  }, [auditReport.remoteReplyVerified, backendAuditSummary.activeEndpoint, backendAuditSummary.activeFallbackBaseUrl, backendAuditSummary.currentEnvironment, backendAuditSummary.fallbackUsed, devTestMode.testModeActive, ownerRoomAuthenticated, runtimeDebugSnapshot, runtimeSnapshot.provider.deploymentMarker, runtimeSnapshot.provider.endpoint, runtimeSnapshot.provider.source, runtimeSnapshot.runtimeStatus, runtimeSnapshot.streamStatus]);
  const qaChecklist = useMemo<QAProofItem[]>(() => {
    const canUseComposer = primaryState === 'ready';
    const hasRoom = !!conversationQuery.data?.id && !conversationQuery.error;
    const sendReady = canUseComposer && !isBusy;
    const assistantReady = !ownerAIRoutingBlocked && (resolution.aiIndicator.state === 'available' || resolution.aiIndicator.state === 'degraded' || isOpenAccessBuild);
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
    return 'Degraded';
  }, [runtimeSnapshot.runtimeStatus]);
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
  const composerDockInset = useMemo(() => {
    if (Platform.OS === 'android') {
      return Math.max(insets.bottom, 12) + 8;
    }
    return Math.max(insets.bottom, 10) + 10;
  }, [insets.bottom]);
  const isKeyboardOpen = keyboardInset > 0;
  const effectiveComposerBottom = useMemo(() => {
    if (Platform.OS === 'android') {
      // Android uses softwareKeyboardLayoutMode='resize' (see app.config.ts).
      // The window already shrinks when the keyboard opens, so we MUST NOT add
      // keyboardInset here or the composer double-shifts above the visible area.
      // When the keyboard is open, collapse the safe-area bottom padding because
      // the system nav is hidden behind the keyboard anyway.
      if (isKeyboardOpen) {
        return 8;
      }
      return composerDockInset;
    }

    if (isKeyboardOpen) {
      return 4;
    }

    return composerDockInset;
  }, [composerDockInset, isKeyboardOpen, keyboardInset]);
  const listContentContainerStyle = useMemo(() => {
    const bottomPadding = Math.max(composerHeight + effectiveComposerBottom + 20, insets.bottom + 30);
    return allMessages.length === 0
      ? [styles.emptyListContent, { paddingBottom: bottomPadding }]
      : [styles.listContent, { paddingTop: 2, paddingBottom: bottomPadding }];
  }, [allMessages.length, composerHeight, effectiveComposerBottom, insets.bottom]);
  const keyboardAvoidingBehavior = Platform.select<'padding' | undefined>({
    ios: 'padding',
    android: undefined,
    default: undefined,
  });
  const listFooter = useMemo(() => {
    const visibleAssistantPlaceholder = transientAssistantMessages.some((message) => message.senderRole === 'assistant');
    const shouldShowReplying = aiReplyPending || visibleAssistantPlaceholder;
    if (!shouldShowReplying) {
      return <View style={styles.listFooterSpacer} />;
    }

    return (
      <View style={styles.threadStatusCard} testID="ivx-owner-chat-thread-status">
        <ActivityIndicator size="small" color={Colors.info} />
        <Text style={styles.threadStatusText}>Assistant replying…</Text>
      </View>
    );
  }, [aiReplyPending, transientAssistantMessages]);
  const runtimeProofHeadline = useMemo(() => getRuntimeProofHeadline(runtimeDebugSnapshot), [runtimeDebugSnapshot]);
  const runtimeStatusCopy = useMemo(() => getRuntimeStatusCopy({
    source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
    requestStage: runtimeDebugSnapshot.requestStage,
    failureClass: runtimeDebugSnapshot.failureClass,
    isFallback: runtimeDebugSnapshot.source === 'toolkit_fallback',
    isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
    hasVisibleResponseText: runtimeDebugSnapshot.hasVisibleResponseText,
  }), [runtimeDebugSnapshot]);
  const streamingTransportMode = useMemo<'chunk' | 'final'>(( ) => {
    return supportsTrueChunkStreaming({
      requestStage: runtimeDebugSnapshot.requestStage,
      isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
    }) ? 'chunk' : 'final';
  }, [runtimeDebugSnapshot]);
  const runtimeProofPrimaryRows = useMemo<Array<{ label: string; value: string }>>(() => {
    return [
      { label: 'Request stage', value: runtimeDebugSnapshot.requestStage },
      { label: 'Failure class', value: runtimeDebugSnapshot.failureClass },
      { label: 'HTTP status', value: runtimeDebugSnapshot.httpStatus },
      { label: 'Base URL', value: backendAuditSummary.activeBaseUrl },
      { label: 'Endpoint', value: runtimeDebugSnapshot.endpoint ?? backendAuditSummary.activeEndpoint },
      { label: 'Request ID', value: runtimeDebugSnapshot.requestId ?? 'pending' },
      { label: 'Response preview', value: runtimeDebugSnapshot.responsePreview },
    ];
  }, [backendAuditSummary.activeBaseUrl, backendAuditSummary.activeEndpoint, runtimeDebugSnapshot]);
  const sendBranchProof = useMemo<SendBranchProofRow>(() => {
    return resolveSendBranch(
      deliveryBranchStatus.branch,
      runtimeDebugSnapshot.source,
      runtimeDebugSnapshot.httpStatus,
    );
  }, [deliveryBranchStatus.branch, runtimeDebugSnapshot.source, runtimeDebugSnapshot.httpStatus]);

  const composerStatusMessage = useMemo(() => {
    if (devTestMode.testModeActive) {
      if (aiReplyPending) {
        return 'Replying…';
      }
      return 'Assistant ready.';
    }
    if (aiReplyPending) {
      return streamingTransportMode === 'chunk'
        ? 'Reply streaming now. You can keep typing.'
        : 'Reply in progress. Final text will appear when ready.';
    }
    if (currentOwnerTrust.requiresElevatedConfirmation) {
      return 'Sensitive action detected. Explicit confirmation is required before admin execution.';
    }
    if (ownerAIProofStatus.id === 'remote_api_verified') {
      return 'Live response path ready.';
    }
    if (ownerAIProofStatus.id === 'blocked_by_auth') {
      return 'Owner room trust is required before live admin proof can be claimed.';
    }
    if (ownerAIProofStatus.id === 'dev_fallback') {
      return runtimeDebugSnapshot.hasVisibleResponseText
        ? 'Owner room authenticated. Fallback chat-only mode delivered the reply.'
        : 'Owner room authenticated. Fallback chat-only mode is active, but normal conversation stays available.';
    }
    if (ownerAIRoutingBlocked) {
      return 'Reply path blocked until configuration is fixed.';
    }
    return 'Assistant ready.';
  }, [aiReplyPending, currentOwnerTrust.requiresElevatedConfirmation, devTestMode.testModeActive, ownerAIProofStatus.id, ownerAIRoutingBlocked, runtimeDebugSnapshot.hasVisibleResponseText, streamingTransportMode]);

  const shouldShowDiagnosticsToggle = useMemo(() => {
    if (devTestMode.testModeActive) {
      return false;
    }
    return shouldShowRuntimeDebugDetails({
      source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
      requestStage: runtimeDebugSnapshot.requestStage,
      failureClass: runtimeDebugSnapshot.failureClass,
      isFallback: runtimeDebugSnapshot.source === 'toolkit_fallback',
      isStreaming: hasActiveStreamingState(runtimeDebugSnapshot),
      hasVisibleResponseText: runtimeDebugSnapshot.hasVisibleResponseText,
    }) || ownerAIRoutingBlocked || runtimeSnapshot.runtimeStatus !== 'live';
  }, [devTestMode.testModeActive, ownerAIRoutingBlocked, runtimeDebugSnapshot, runtimeSnapshot.runtimeStatus]);

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
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 60);
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
  }, [insets.bottom]);

  return (
    <ErrorBoundary fallbackTitle="IVX Owner AI unavailable">
      <Stack.Screen options={{ title: 'IVX Owner AI' }} />
      <KeyboardAvoidingView
        style={styles.container}
        behavior={keyboardAvoidingBehavior}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <RoomHeader
          title={IVX_OWNER_AI_PROFILE.sharedRoom.title}
          resolution={resolution}
          isLoading={roomStatusLoading && primaryState === 'loading'}
        />

        <View style={styles.content}>
          {topStatusNote ? (
            <View
              style={ownerAIRoutingBlocked ? styles.blockedBanner : isAIDegraded ? styles.degradedBanner : styles.devBanner}
              testID="ivx-owner-chat-top-status"
            >
              <Text numberOfLines={2} style={ownerAIRoutingBlocked ? styles.blockedBannerText : isAIDegraded ? styles.degradedBannerText : styles.devBannerText}>{topStatusNote}</Text>
            </View>
          ) : null}

          <View
            style={[
              styles.providerProofCard,
              ownerAIProofStatus.tone === 'pass'
                ? styles.providerProofCardPass
                : ownerAIProofStatus.tone === 'blocked'
                  ? styles.providerProofCardBlocked
                  : ownerAIProofStatus.tone === 'pending'
                    ? styles.providerProofCardPending
                    : styles.providerProofCardWarn,
            ]}
            testID={ownerAIProofStatus.testID}
          >
            <View style={styles.providerProofHeader}>
              <View style={styles.providerProofCopy}>
                <Text style={styles.providerProofTitle}>{runtimeStatusCopy.title}</Text>
                <Text style={styles.providerProofDetail} numberOfLines={1}>{runtimeStatusCopy.detail}</Text>
              </View>
              {shouldShowDiagnosticsToggle ? (
                <Pressable
                  style={styles.detailsToggle}
                  onPress={() => {
                    setShowDiagnostics((current) => !current);
                  }}
                  testID="ivx-owner-chat-toggle-details"
                >
                  <Text style={styles.detailsToggleText}>{showDiagnostics ? 'Hide' : 'Details'}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {ownerAIRoutingBlocked ? (
            <View style={styles.productionGuardCard} testID="ivx-owner-chat-production-guard-block">
              <Text style={styles.productionGuardEyebrow}>Reply path blocked</Text>
              <Text style={styles.productionGuardTitle}>Owner AI routing needs attention</Text>
              <Text style={styles.productionGuardBody}>{ownerAIConfigAudit.configurationError ?? 'Production configuration is invalid for IVX Owner AI.'}</Text>
              <View style={styles.productionGuardList}>
                <View style={styles.productionGuardItem}>
                  <Text style={styles.productionGuardLabel}>Environment</Text>
                  <Text style={styles.productionGuardValue}>{backendAuditSummary.currentEnvironment}</Text>
                </View>
                <View style={styles.productionGuardItem}>
                  <Text style={styles.productionGuardLabel}>Configured URL</Text>
                  <Text style={styles.productionGuardValue}>{backendAuditSummary.configuredOwnerAIBaseUrl}</Text>
                </View>
              </View>
            </View>
          ) : null}

          {showDiagnostics ? (
            <>
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
                <AuditInfoRow
                  label="Fallback state"
                  value={getRuntimeFallbackState(getActiveRuntimeSource({
                    source: normalizeRuntimeSource(runtimeDebugSnapshot.source),
                    requestStage: runtimeDebugSnapshot.requestStage,
                    failureClass: runtimeDebugSnapshot.failureClass,
                    isFallback: runtimeDebugSnapshot.source === 'toolkit_fallback',
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
                <AuditInfoRow label="Current environment" value={backendAuditSummary.currentEnvironment} />
                <AuditInfoRow label="Routing policy" value={backendAuditSummary.routingPolicy} />
                <AuditInfoRow label="Active endpoint chosen" value={backendAuditSummary.activeEndpoint} />
                <AuditInfoRow label="Fallback used" value={backendAuditSummary.fallbackUsed} />
                <Text style={styles.backendAuditBody}>{backendAuditSummary.failureMode}</Text>
                <Text style={styles.backendAuditFootnote}>{backendAuditSummary.gracefulDegradationNote}</Text>
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
              <ActivityIndicator color={Colors.primary} />
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
            <FlatList
              ref={flatListRef}
              data={allMessages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={listContentContainerStyle}
              refreshControl={<RefreshControl tintColor={Colors.primary} refreshing={refreshing} onRefresh={() => {
                void messagesQuery.refetch();
                void conversationQuery.refetch();
                void roomStatusQuery.refetch();
              }} />}
              ListEmptyComponent={
                <View style={styles.emptyState} testID="ivx-owner-chat-empty">
                  <Sparkles size={28} color={Colors.primary} />
                  <Text style={styles.emptyTitle}>{IVX_OWNER_AI_PROFILE.sharedRoom.emptyTitle}</Text>
                  <Text style={styles.emptyText}>{resolution.emptyStateText}</Text>
                </View>
              }
              ListFooterComponent={listFooter}
              ListFooterComponentStyle={styles.listFooterContainer}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              testID="ivx-owner-chat-list"
            />
          )}
        </View>

        {primaryState !== 'loading' && primaryState !== 'room_error' ? (
          <View style={[styles.composerDock, { paddingBottom: effectiveComposerBottom }]}>

            <View
              style={styles.composerCard}
              testID="ivx-owner-chat-composer"
              onLayout={(event) => {
                const nextHeight = event.nativeEvent.layout.height;
                if (Math.abs(nextHeight - composerHeight) > 1) {
                  setComposerHeight(nextHeight);
                }
              }}
            >
              <View style={styles.composerPrimaryRow}>
                <Pressable
                  style={styles.iconButton}
                  onPress={() => void handlePickFile()}
                  testID="ivx-owner-chat-attach"
                >
                  {attachmentMutation.isPending || isPickingFile ? (
                    <ActivityIndicator size="small" color={Colors.primary} />
                  ) : (
                    <Paperclip size={18} color={Colors.primary} />
                  )}
                </Pressable>
                <TextInput
                  ref={composerInputRef}
                  style={styles.composerInput}
                  value={composerValue}
                  onChangeText={handleComposerChange}
                  editable={!isBusy}
                  placeholder="Message IVX Owner AI"
                  placeholderTextColor="#B8C0CC"
                  multiline
                  textAlignVertical="top"
                  returnKeyType="send"
                  blurOnSubmit={false}
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
                  testID="ivx-owner-chat-send"
                >
                  {messageSendPending ? <ActivityIndicator size="small" color={Colors.black} /> : <Send size={18} color={Colors.black} />}
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
                  testID="ivx-owner-chat-ai"
                >
                  {aiReplyPending ? <ActivityIndicator size="small" color={Colors.text} /> : <Sparkles size={14} color={Colors.text} />}
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
  },
  devBanner: {
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.24)',
    backgroundColor: 'rgba(59,130,246,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  devBannerText: {
    color: Colors.info,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600' as const,
  },
  degradedBanner: {
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.24)',
    backgroundColor: 'rgba(245,158,11,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  degradedBannerText: {
    color: Colors.warning,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600' as const,
  },
  blockedBanner: {
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.28)',
    backgroundColor: 'rgba(239,68,68,0.10)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  blockedBannerText: {
    color: Colors.error,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '700' as const,
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
    marginHorizontal: 12,
    marginBottom: 4,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 3,
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
    fontSize: 11,
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
    fontSize: 9,
    lineHeight: 12,
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
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 1,
    gap: 4,
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
    paddingTop: 4,
    backgroundColor: Colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.surfaceBorder,
  },
  composerCard: {
    paddingTop: 7,
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderRadius: 14,
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
  composerPrimaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
  },
  composerInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 84,
    color: '#F8FAFC',
    fontSize: 14,
    lineHeight: 19,
    textAlignVertical: 'top',
    backgroundColor: '#12161C',
    borderRadius: 13,
    paddingHorizontal: 11,
    paddingTop: 7,
    paddingBottom: 7,
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
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    flexShrink: 0,
  },
  sendIconButton: {
    width: 34,
    height: 34,
    borderRadius: 11,
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
    height: 28,
    borderRadius: 10,
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
  threadStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.2)',
    backgroundColor: 'rgba(59,130,246,0.08)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  threadStatusText: {
    flex: 1,
    color: Colors.info,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '600' as const,
  },
  listFooterSpacer: {
    height: 6,
  },
  listFooterContainer: {
    paddingTop: 4,
  },
});
