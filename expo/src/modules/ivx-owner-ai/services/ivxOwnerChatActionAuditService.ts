import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordAuditEvent } from '@/lib/platform-persistence';

export type IVXOwnerChatAuditAction =
  | 'room_open'
  | 'message_send'
  | 'assistant_reply'
  | 'attachment_upload'
  | 'voice_transcription'
  | 'search'
  | 'pin_message'
  | 'reply_context'
  | 'template_apply'
  | 'control_action'
  | 'sync_probe'
  | 'developer_workspace_prompt'
  | 'developer_workspace_response'
  | 'developer_workspace_error'
  | 'error';

export type IVXOwnerChatAuditEvent = {
  id: string;
  action: IVXOwnerChatAuditAction;
  conversationId: string | null;
  messageId?: string | null;
  status: 'started' | 'success' | 'failed' | 'blocked';
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const IVX_OWNER_CHAT_AUDIT_STORAGE_KEY = 'ivx.owner.chat.audit.v1';
const MAX_LOCAL_AUDIT_EVENTS = 200;
const SECRET_PATTERNS: readonly RegExp[] = [
  /ghp_[A-Za-z0-9_]{16,}/g,
  /github_pat_[A-Za-z0-9_]{16,}/g,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{24,}/gi,
  /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9._-]{12,}\b/g,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
];

function nowIso(): string {
  return new Date().toISOString();
}

function createAuditId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return `chat-audit-${cryptoRef.randomUUID()}`;
  }
  return `chat-audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeString(value: string): string {
  return SECRET_PATTERNS.reduce((current, pattern) => current.replace(pattern, '[redacted]'), value).slice(0, 1000);
}

function sanitizeMetadata(value: unknown, depth: number = 0): unknown {
  if (depth > 4) {
    return '[depth-limit]';
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeMetadata(item, depth + 1));
  }

  if (typeof value === 'object') {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes('token') || lowerKey.includes('secret') || lowerKey.includes('password') || lowerKey.includes('key')) {
        next[key] = '[redacted]';
        continue;
      }
      next[key] = sanitizeMetadata(item, depth + 1);
    }
    return next;
  }

  return String(value);
}

async function readLocalEvents(): Promise<IVXOwnerChatAuditEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(IVX_OWNER_CHAT_AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((event): event is IVXOwnerChatAuditEvent => {
      return !!event && typeof event === 'object' && typeof (event as IVXOwnerChatAuditEvent).id === 'string';
    });
  } catch (error) {
    console.log('[IVXOwnerChatActionAudit] Local audit read failed:', error instanceof Error ? error.message : 'unknown');
    return [];
  }
}

async function writeLocalEvent(event: IVXOwnerChatAuditEvent): Promise<void> {
  try {
    const current = await readLocalEvents();
    const next = [event, ...current.filter((item) => item.id !== event.id)].slice(0, MAX_LOCAL_AUDIT_EVENTS);
    await AsyncStorage.setItem(IVX_OWNER_CHAT_AUDIT_STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.log('[IVXOwnerChatActionAudit] Local audit write failed:', error instanceof Error ? error.message : 'unknown');
  }
}

/**
 * Records owner-room chat activity to local storage immediately and mirrors it
 * into Phase 1 `audit_events` when the production migration is available.
 */
export async function recordIVXOwnerChatAuditEvent(input: {
  action: IVXOwnerChatAuditAction;
  conversationId?: string | null;
  messageId?: string | null;
  status: IVXOwnerChatAuditEvent['status'];
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<IVXOwnerChatAuditEvent> {
  const event: IVXOwnerChatAuditEvent = {
    id: createAuditId(),
    action: input.action,
    conversationId: input.conversationId ?? null,
    messageId: input.messageId ?? null,
    status: input.status,
    summary: sanitizeString(input.summary),
    metadata: (sanitizeMetadata(input.metadata ?? {}) as Record<string, unknown>),
    createdAt: nowIso(),
  };

  await writeLocalEvent(event);

  void recordAuditEvent({
    category: 'ivx_owner_chat',
    action: input.action,
    targetType: 'conversation',
    targetId: input.conversationId ?? 'ivx-owner-room',
    afterState: {
      status: event.status,
      summary: event.summary,
      messageId: event.messageId ?? null,
    },
    metadata: {
      auditEventId: event.id,
      ...event.metadata,
    },
  });

  return event;
}

export async function getRecentIVXOwnerChatAuditEvents(limit: number = 50): Promise<IVXOwnerChatAuditEvent[]> {
  const events = await readLocalEvents();
  return events.slice(0, Math.max(1, Math.min(limit, MAX_LOCAL_AUDIT_EVENTS)));
}
