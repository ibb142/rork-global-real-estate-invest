import AsyncStorage from '@react-native-async-storage/async-storage';
import { IVX_OWNER_AI_PROFILE, IVX_OWNER_AI_ROOM_ID, IVX_OWNER_AI_ROOM_SLUG } from '@/constants/ivx-owner-ai';
import { getIVXOwnerAuthContext, getIVXSupabaseClient } from '@/lib/ivx-supabase-client';
import {
  IVX_OWNER_AI_BUCKET,
  type IVXAttachmentKind,
  type IVXConversation,
  type IVXMessage,
  type IVXUploadInput,
} from '@/shared/ivx';
import { ivxFileUploadService } from './ivxFileUploadService';
import {
  resolveIVXTables,
  mapGenericMessageRow,
  buildMessageInsertPayload,
  buildInboxUpsertPayload,
  getScopedSupabaseClient,
  getRealtimeSchema,
  type ResolvedTables,
} from './ivxTableResolver';

type IVXConversationRow = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  created_at: string;
  updated_at: string;
  last_message_text: string | null;
  last_message_at: string | null;
};

const IVX_OWNER_FILE_URL_TTL_SECONDS = 60 * 60;
const IVX_LOCAL_MESSAGES_STORAGE_KEY = 'ivx_owner_ai_local_messages';
const activeOwnerRealtimeTeardowns = new Set<string>();
const activeOwnerRealtimeSubscriptions = new Set<string>();
const ownerLocalMessageListeners = new Set<(message: IVXMessage) => void>();

export type IVXOwnerRealtimeSubscriptionAudit = {
  activeChannelCount: number;
  activeChannels: string[];
  teardownCount: number;
  localListenerCount: number;
};

export function getOwnerRealtimeSubscriptionAudit(): IVXOwnerRealtimeSubscriptionAudit {
  return {
    activeChannelCount: activeOwnerRealtimeSubscriptions.size,
    activeChannels: Array.from(activeOwnerRealtimeSubscriptions.values()).sort(),
    teardownCount: activeOwnerRealtimeTeardowns.size,
    localListenerCount: ownerLocalMessageListeners.size,
  };
}

export type IVXOwnerSendAudit = {
  transport: 'remote_db_insert' | 'local_fallback' | 'auth_session_failure';
  conversationId: string;
  messageId: string;
  senderRole: 'owner' | 'assistant' | 'system';
  reason: string;
  observedAt: string;
};

export type IVXOwnerReceiveAudit = {
  transport: 'realtime_event' | 'local_listener';
  conversationId: string;
  messageId: string;
  senderRole: 'owner' | 'assistant' | 'system';
  reason: string;
  observedAt: string;
};

let lastOwnerSendAudit: IVXOwnerSendAudit | null = null;
let lastOwnerReceiveAudit: IVXOwnerReceiveAudit | null = null;

function setLastOwnerSendAudit(audit: IVXOwnerSendAudit): void {
  lastOwnerSendAudit = audit;
  console.log('[IVXChatService] Send audit updated:', audit);
}

export function getLastOwnerSendAudit(): IVXOwnerSendAudit | null {
  return lastOwnerSendAudit;
}

function setLastOwnerReceiveAudit(audit: IVXOwnerReceiveAudit): void {
  lastOwnerReceiveAudit = audit;
  console.log('[IVXChatService] Receive audit updated:', audit);
}

export function getLastOwnerReceiveAudit(): IVXOwnerReceiveAudit | null {
  return lastOwnerReceiveAudit;
}

function trackOwnerSendAudit(input: {
  transport: IVXOwnerSendAudit['transport'];
  conversationId: string;
  messageId: string;
  senderRole: IVXOwnerSendAudit['senderRole'];
  reason: string;
}): void {
  setLastOwnerSendAudit({
    transport: input.transport,
    conversationId: input.conversationId,
    messageId: input.messageId,
    senderRole: input.senderRole,
    reason: input.reason,
    observedAt: nowIso(),
  });
}

function resolveLocalAuditTransport(ownerContextAvailable: boolean): IVXOwnerSendAudit['transport'] {
  return ownerContextAvailable ? 'local_fallback' : 'auth_session_failure';
}

function resolveLocalAuditReason(ownerContextAvailable: boolean, detail: string): string {
  return ownerContextAvailable ? detail : `Owner auth/session unavailable. ${detail}`;
}

function trackOwnerReceiveAudit(input: {
  transport: IVXOwnerReceiveAudit['transport'];
  conversationId: string;
  messageId: string;
  senderRole: IVXOwnerReceiveAudit['senderRole'];
  reason: string;
}): void {
  setLastOwnerReceiveAudit({
    transport: input.transport,
    conversationId: input.conversationId,
    messageId: input.messageId,
    senderRole: input.senderRole,
    reason: input.reason,
    observedAt: nowIso(),
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function createLocalMessageId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoRef?.randomUUID) {
    return cryptoRef.randomUUID();
  }

  return `ivx-local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmedValue = value?.trim() ?? '';
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function getMessagePreview(value: string | null): string | null {
  const trimmedValue = trimOrNull(value);
  if (!trimmedValue) {
    return null;
  }

  if (trimmedValue.length <= 80) {
    return trimmedValue;
  }

  return `${trimmedValue.slice(0, 77)}...`;
}

async function loadLocalMessages(): Promise<IVXMessage[]> {
  try {
    const stored = await AsyncStorage.getItem(IVX_LOCAL_MESSAGES_STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as IVXMessage[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch (error) {
    console.log('[IVXChatService] Failed to load local messages:', error instanceof Error ? error.message : 'unknown');
    return [];
  }
}

async function saveLocalMessages(messages: IVXMessage[]): Promise<void> {
  try {
    await AsyncStorage.setItem(IVX_LOCAL_MESSAGES_STORAGE_KEY, JSON.stringify(messages));
  } catch (error) {
    console.log('[IVXChatService] Failed to save local messages:', error instanceof Error ? error.message : 'unknown');
  }
}

function getLocalConversation(): IVXConversation {
  return {
    id: IVX_OWNER_AI_ROOM_ID,
    slug: IVX_OWNER_AI_ROOM_SLUG,
    title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
    subtitle: 'Dev owner workspace. Messages are stored locally when shared backend access is unavailable.',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastMessageText: null,
    lastMessageAt: null,
  };
}

function createLocalMessage(input: {
  conversationId: string;
  senderUserId: string | null;
  senderRole: 'owner' | 'assistant' | 'system';
  senderLabel: string | null;
  body: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  attachmentKind: IVXAttachmentKind;
}): IVXMessage {
  const timestamp = nowIso();
  return {
    id: createLocalMessageId(),
    conversationId: input.conversationId,
    senderUserId: input.senderUserId,
    senderRole: input.senderRole,
    senderLabel: input.senderLabel,
    body: input.body,
    attachmentUrl: input.attachmentUrl ?? null,
    attachmentName: input.attachmentName ?? null,
    attachmentMime: input.attachmentMime ?? null,
    attachmentSize: input.attachmentSize ?? null,
    attachmentKind: input.attachmentKind,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

async function appendLocalMessage(message: IVXMessage): Promise<void> {
  const currentMessages = await loadLocalMessages();
  await saveLocalMessages([...currentMessages, message]);
}

function emitLocalOwnerMessage(message: IVXMessage, reason: string): void {
  console.log('[IVXChatService] Emitting local owner message:', {
    reason,
    messageId: message.id,
    senderRole: message.senderRole,
    conversationId: message.conversationId,
  });

  ownerLocalMessageListeners.forEach((listener) => {
    try {
      listener(message);
    } catch (error) {
      console.log('[IVXChatService] Local owner message listener failed:', error instanceof Error ? error.message : 'unknown');
    }
  });
}

function createLocalAttachmentMessage(input: {
  conversationId: string;
  senderUserId: string | null;
  senderLabel: string | null;
  body: string | null;
  upload: IVXUploadInput;
}): IVXMessage {
  const attachmentMime = trimOrNull(input.upload.type);
  const attachmentUrl = trimOrNull(input.upload.uri);
  const attachmentName = trimOrNull(input.upload.name) ?? 'Attachment';
  const attachmentSize = typeof input.upload.size === 'number' ? input.upload.size : null;

  return createLocalMessage({
    conversationId: input.conversationId,
    senderUserId: input.senderUserId,
    senderRole: 'owner',
    senderLabel: input.senderLabel,
    body: trimOrNull(input.body),
    attachmentUrl,
    attachmentName,
    attachmentMime,
    attachmentSize,
    attachmentKind: getAttachmentKindFromMime(attachmentMime),
  });
}

function getAttachmentKindFromMime(mimeType: string | null | undefined): IVXAttachmentKind {
  const normalizedMimeType = mimeType?.trim().toLowerCase() ?? '';

  if (!normalizedMimeType) {
    return 'file';
  }

  if (normalizedMimeType.startsWith('image/')) {
    return 'image';
  }

  if (normalizedMimeType.startsWith('video/')) {
    return 'video';
  }

  if (normalizedMimeType === 'application/pdf') {
    return 'pdf';
  }

  return 'file';
}

function normalizeMessageComparisonValue(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

function buildOwnerMessageSignature(message: IVXMessage): string {
  return [
    normalizeMessageComparisonValue(message.conversationId),
    normalizeMessageComparisonValue(message.senderUserId),
    normalizeMessageComparisonValue(message.senderRole),
    normalizeMessageComparisonValue(message.body),
    normalizeMessageComparisonValue(message.attachmentUrl),
    normalizeMessageComparisonValue(message.attachmentName),
    normalizeMessageComparisonValue(message.createdAt),
  ].join('::');
}

function mergeOwnerMessages(remoteMessages: IVXMessage[], localMessages: IVXMessage[]): IVXMessage[] {
  if (localMessages.length === 0) {
    return [...remoteMessages].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  }

  const merged = new Map<string, IVXMessage>();

  for (const message of remoteMessages) {
    merged.set(buildOwnerMessageSignature(message), message);
  }

  for (const message of localMessages) {
    const signature = buildOwnerMessageSignature(message);
    if (merged.has(signature)) {
      continue;
    }
    merged.set(signature, message);
  }

  return Array.from(merged.values()).sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

function mapConversation(row: Record<string, unknown>): IVXConversation {
  const fallbackId = ((row.id ?? IVX_OWNER_AI_ROOM_ID) as string) || IVX_OWNER_AI_ROOM_ID;
  return {
    id: fallbackId,
    slug: ((row.slug ?? fallbackId ?? IVX_OWNER_AI_ROOM_SLUG) as string) || IVX_OWNER_AI_ROOM_SLUG,
    title: (row.title ?? IVX_OWNER_AI_PROFILE.sharedRoom.title) as string,
    subtitle: (row.subtitle ?? IVX_OWNER_AI_PROFILE.sharedRoom.subtitle ?? null) as string | null,
    createdAt: (row.created_at ?? nowIso()) as string,
    updatedAt: (row.updated_at ?? nowIso()) as string,
    lastMessageText: (row.last_message_text ?? null) as string | null,
    lastMessageAt: (row.last_message_at ?? null) as string | null,
  };
}

function getRowsFromSelectResult(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  }

  if (data && typeof data === 'object') {
    return [data as Record<string, unknown>];
  }

  return [];
}

function getFirstRowFromSelectResult(data: unknown, context: string): Record<string, unknown> | null {
  const rows = getRowsFromSelectResult(data);

  if (rows.length > 1) {
    console.log(`[IVXChatService] ${context} returned multiple rows; using the first row to avoid singular coercion failure:`, {
      rowCount: rows.length,
    });
  }

  return rows[0] ?? null;
}

function getOwnerConversationLookupAttempts(_tables?: ResolvedTables): Array<{ field: 'id' | 'slug' | 'title'; value: string }> {
  return [
    { field: 'id', value: IVX_OWNER_AI_ROOM_ID },
    { field: 'slug', value: IVX_OWNER_AI_ROOM_SLUG },
    { field: 'title', value: IVX_OWNER_AI_PROFILE.sharedRoom.title },
  ];
}

function buildConversationInsertPayloads(schema: ResolvedTables['schema']): Record<string, unknown>[] {
  if (schema === 'generic') {
    return [
      {
        id: IVX_OWNER_AI_ROOM_ID,
        slug: IVX_OWNER_AI_ROOM_SLUG,
        title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
        subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
        last_message_text: null,
        last_message_at: null,
      },
      {
        id: IVX_OWNER_AI_ROOM_ID,
        title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
        subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
        last_message_text: null,
        last_message_at: null,
      },
      {
        id: IVX_OWNER_AI_ROOM_ID,
        title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
        subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
      },
      {
        id: IVX_OWNER_AI_ROOM_ID,
        title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
      },
    ];
  }

  return [
    {
      id: IVX_OWNER_AI_ROOM_ID,
      slug: IVX_OWNER_AI_ROOM_SLUG,
      title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
      subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
      created_at: nowIso(),
      updated_at: nowIso(),
      last_message_text: null,
      last_message_at: null,
    },
    {
      id: IVX_OWNER_AI_ROOM_ID,
      title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
      subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
      created_at: nowIso(),
      updated_at: nowIso(),
      last_message_text: null,
      last_message_at: null,
    },
    {
      id: IVX_OWNER_AI_ROOM_ID,
      title: IVX_OWNER_AI_PROFILE.sharedRoom.title,
      subtitle: IVX_OWNER_AI_PROFILE.sharedRoom.subtitle,
    },
  ];
}

function formatInsertPayloadKeys(payload: Record<string, unknown>): string[] {
  return Object.keys(payload).sort();
}

function getConversationTimestampScore(row: Record<string, unknown>): number {
  const updatedAt = typeof row.updated_at === 'string' ? Date.parse(row.updated_at) : Number.NaN;
  if (Number.isFinite(updatedAt)) {
    return updatedAt;
  }

  const createdAt = typeof row.created_at === 'string' ? Date.parse(row.created_at) : Number.NaN;
  if (Number.isFinite(createdAt)) {
    return createdAt;
  }

  return 0;
}

function scoreOwnerConversationRow(row: Record<string, unknown>): number {
  let score = 0;

  if (typeof row.id === 'string' && row.id === IVX_OWNER_AI_ROOM_ID) {
    score += 1000;
  }

  if (typeof row.slug === 'string' && row.slug === IVX_OWNER_AI_ROOM_SLUG) {
    score += 600;
  }

  if (typeof row.title === 'string' && row.title === IVX_OWNER_AI_PROFILE.sharedRoom.title) {
    score += 250;
  }

  return score + getConversationTimestampScore(row) / 1_000_000_000_000;
}

function pickBestOwnerConversationRow(rows: Record<string, unknown>[], context: string): Record<string, unknown> | null {
  if (rows.length === 0) {
    return null;
  }

  const sortedRows = [...rows].sort((left, right) => scoreOwnerConversationRow(right) - scoreOwnerConversationRow(left));
  const selectedRow = sortedRows[0] ?? null;

  if (sortedRows.length > 1) {
    console.log(`[IVXChatService] ${context} found multiple candidate owner conversations; selecting best match:`, {
      candidateCount: sortedRows.length,
      selectedRow: describeConversationRow(selectedRow),
      candidateRows: sortedRows.slice(0, 5).map((row) => describeConversationRow(row)),
    });
  }

  return selectedRow;
}

async function loadRecentOwnerConversationCandidates(
  tables: ResolvedTables,
  context: string,
): Promise<Record<string, unknown>[]> {
  const client = getIVXSupabaseClient();
  const scopedClient = getScopedSupabaseClient(client, tables.dbSchema);
  const primaryOrderField = tables.schema === 'generic' ? 'last_message_at' : 'updated_at';
  let recentResult = await scopedClient
    .from(tables.conversations)
    .select('*')
    .order(primaryOrderField, { ascending: false })
    .limit(10);

  if (recentResult.error && primaryOrderField !== 'last_message_at') {
    console.log(`[IVXChatService] ${context} recent conversation probe retrying with last_message_at order:`, {
      schema: tables.schema,
      dbSchema: tables.dbSchema,
      table: tables.conversations,
      previousError: recentResult.error.message,
    });
    recentResult = await scopedClient
      .from(tables.conversations)
      .select('*')
      .order('last_message_at', { ascending: false })
      .limit(10);
  }

  if (recentResult.error) {
    console.log(`[IVXChatService] ${context} recent conversation probe failed:`, {
      schema: tables.schema,
      dbSchema: tables.dbSchema,
      table: tables.conversations,
      message: recentResult.error.message,
    });
    return [];
  }

  const recentRows = getRowsFromSelectResult(recentResult.data).filter((row) => {
    const rowSlug = typeof row.slug === 'string' ? row.slug : null;
    const rowTitle = typeof row.title === 'string' ? row.title : null;
    return rowSlug === IVX_OWNER_AI_ROOM_SLUG || rowTitle === IVX_OWNER_AI_PROFILE.sharedRoom.title;
  });

  console.log(`[IVXChatService] ${context} recent conversation probe result:`, {
    rowCount: recentRows.length,
    sampleRow: describeConversationRow(recentRows[0] ?? null),
  });

  return recentRows;
}

function dedupeConversationRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const dedupedRows: Record<string, unknown>[] = [];

  for (const row of rows) {
    const key = `${typeof row.id === 'string' ? row.id : 'missing-id'}:${typeof row.slug === 'string' ? row.slug : 'missing-slug'}:${typeof row.title === 'string' ? row.title : 'missing-title'}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    dedupedRows.push(row);
  }

  return dedupedRows;
}

async function recoverOwnerConversationRowAfterWriteFailure(
  tables: ResolvedTables,
  context: string,
): Promise<Record<string, unknown> | null> {
  const exactMatches = await findOwnerConversationRow(tables, `${context} exact lookup`, { includeRecentProbe: false });
  if (exactMatches) {
    return exactMatches;
  }

  const recentCandidates = await loadRecentOwnerConversationCandidates(tables, context);
  const recoveredRow = pickBestOwnerConversationRow(recentCandidates, `${context} recent recovery`);

  if (recoveredRow) {
    console.log(`[IVXChatService] ${context} recovered owner conversation from recent candidates:`, {
      resolvedRow: describeConversationRow(recoveredRow),
    });
  }

  return recoveredRow;
}


function describeConversationRow(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) {
    return null;
  }

  return {
    id: typeof row.id === 'string' ? row.id : null,
    slug: typeof row.slug === 'string' ? row.slug : null,
    title: typeof row.title === 'string' ? row.title : null,
    subtitle: typeof row.subtitle === 'string' ? row.subtitle : null,
    created_at: typeof row.created_at === 'string' ? row.created_at : null,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : null,
    last_message_text: typeof row.last_message_text === 'string' ? row.last_message_text : null,
    last_message_at: typeof row.last_message_at === 'string' ? row.last_message_at : null,
  };
}

async function findOwnerConversationRow(
  tables: ResolvedTables,
  context: string,
  options?: { includeRecentProbe?: boolean },
): Promise<Record<string, unknown> | null> {
  const client = getIVXSupabaseClient();
  const scopedClient = getScopedSupabaseClient(client, tables.dbSchema);
  const lookupAttempts = getOwnerConversationLookupAttempts(tables);
  const candidateRows: Record<string, unknown>[] = [];

  for (const lookup of lookupAttempts) {
    console.log(`[IVXChatService] ${context} lookup select:`, {
      schema: tables.schema,
      dbSchema: tables.dbSchema,
      table: tables.conversations,
      select: '*',
      where: `${lookup.field} = ${lookup.value}`,
      canonicalId: IVX_OWNER_AI_ROOM_ID,
      canonicalSlug: IVX_OWNER_AI_ROOM_SLUG,
    });

    const lookupResult = await scopedClient.from(tables.conversations).select('*').eq(lookup.field, lookup.value).limit(5);

    if (lookupResult.error) {
      console.log(`[IVXChatService] ${context} lookup failed:`, {
        field: lookup.field,
        value: lookup.value,
        message: lookupResult.error.message,
      });
      continue;
    }

    const rows = getRowsFromSelectResult(lookupResult.data);
    console.log(`[IVXChatService] ${context} lookup result:`, {
      field: lookup.field,
      value: lookup.value,
      rowCount: rows.length,
      sampleRow: describeConversationRow(rows[0] ?? null),
    });

    candidateRows.push(...rows);
  }

  if (options?.includeRecentProbe ?? true) {
    candidateRows.push(...(await loadRecentOwnerConversationCandidates(tables, context)));
  }

  const row = pickBestOwnerConversationRow(dedupeConversationRows(candidateRows), context);
  if (row) {
    console.log(`[IVXChatService] ${context} resolved owner conversation:`, {
      resolvedRow: describeConversationRow(row),
    });
    return row;
  }

  console.log(`[IVXChatService] ${context} found no owner conversation row`, {
    schema: tables.schema,
    dbSchema: tables.dbSchema,
    conversationTable: tables.conversations,
    canonicalId: IVX_OWNER_AI_ROOM_ID,
    canonicalSlug: IVX_OWNER_AI_ROOM_SLUG,
    lookupFields: getOwnerConversationLookupAttempts(tables).map((attempt) => attempt.field),
  });
  return null;
}

function isMissingSlugColumn(message: string): boolean {
  const normalizedMessage = (typeof message === 'string' ? message : '').trim().toLowerCase();
  return normalizedMessage.includes('column conversations.slug does not exist')
    || normalizedMessage.includes('column ivx_conversations.slug does not exist')
    || normalizedMessage.includes('could not find the column') && normalizedMessage.includes('slug');
}

function isRemoteUrl(value: string | null | undefined): boolean {
  const trimmedValue = value?.trim() ?? '';
  return /^https?:\/\//i.test(trimmedValue);
}

async function resolveAttachmentUrl(rawAttachmentUrl: string | null): Promise<string | null> {
  const trimmedAttachmentUrl = trimOrNull(rawAttachmentUrl);

  if (!trimmedAttachmentUrl) {
    return null;
  }

  if (isRemoteUrl(trimmedAttachmentUrl)) {
    return trimmedAttachmentUrl;
  }

  const client = getIVXSupabaseClient();
  const signedUrlResult = await client.storage.from(IVX_OWNER_AI_BUCKET).createSignedUrl(trimmedAttachmentUrl, IVX_OWNER_FILE_URL_TTL_SECONDS);

  if (signedUrlResult.error || !signedUrlResult.data?.signedUrl) {
    console.log('[IVXChatService] Failed to sign attachment URL:', signedUrlResult.error?.message ?? 'missing signed url');
    return null;
  }

  return signedUrlResult.data.signedUrl;
}

async function mapMessage(row: Record<string, unknown>): Promise<IVXMessage> {
  const normalized = mapGenericMessageRow(row);
  return {
    id: normalized.id,
    conversationId: normalized.conversation_id,
    senderUserId: normalized.sender_user_id,
    senderRole: normalized.sender_role,
    senderLabel: normalized.sender_label,
    body: normalized.body,
    attachmentUrl: await resolveAttachmentUrl(normalized.attachment_url),
    attachmentName: normalized.attachment_name,
    attachmentMime: normalized.attachment_mime,
    attachmentSize: normalized.attachment_size,
    attachmentKind: (normalized.attachment_kind as IVXAttachmentKind | null) ?? getAttachmentKindFromMime(normalized.attachment_mime),
    createdAt: normalized.created_at,
    updatedAt: normalized.updated_at,
  };
}

async function ensureInboxState(tables: ResolvedTables, conversationId: string, userId: string): Promise<void> {
  const client = getIVXSupabaseClient();
  const scopedClient = getScopedSupabaseClient(client, tables.dbSchema);
  const { payload, onConflict } = buildInboxUpsertPayload(tables.schema, conversationId, userId);

  const upsertResult = await scopedClient.from(tables.inboxState).upsert(payload, {
    onConflict,
  });

  if (upsertResult.error) {
    console.log('[IVXChatService] Failed to ensure inbox state (non-blocking):', upsertResult.error.message);
  }
}

async function updateConversationSummary(tables: ResolvedTables, conversationId: string, messagePreview: string | null): Promise<void> {
  const client = getIVXSupabaseClient();
  const scopedClient = getScopedSupabaseClient(client, tables.dbSchema);
  const updateResult = await scopedClient.from(tables.conversations).update({
    updated_at: nowIso(),
    last_message_text: getMessagePreview(messagePreview),
    last_message_at: nowIso(),
  }).eq('id', conversationId);

  if (updateResult.error) {
    console.log('[IVXChatService] Failed to update summary (non-blocking):', updateResult.error.message);
  }
}

async function insertMessage(tables: ResolvedTables, input: {
  conversationId: string;
  senderUserId: string | null;
  senderRole: string;
  senderLabel: string | null;
  body: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  attachmentKind?: string;
}): Promise<IVXMessage> {
  const client = getIVXSupabaseClient();
  const scopedClient = getScopedSupabaseClient(client, tables.dbSchema);
  const insertPayload = buildMessageInsertPayload(tables.schema, input);

  console.log('[IVXChatService] Inserting message into:', tables.messages, 'schema:', tables.schema, 'dbSchema:', tables.dbSchema);
  const insertResult = await scopedClient.from(tables.messages).insert(insertPayload).select('*');

  if (insertResult.error) {
    console.log('[IVXChatService] Failed to insert message:', insertResult.error.message);
    throw new Error(insertResult.error.message);
  }

  const insertedRow = getFirstRowFromSelectResult(insertResult.data, 'Message insert readback');
  if (!insertedRow) {
    throw new Error('Message insert did not return a readable row.');
  }

  return await mapMessage(insertedRow);
}

async function bootstrapOwnerConversation(): Promise<IVXConversation> {
  const client = getIVXSupabaseClient();
  const tables = await resolveIVXTables();

  console.log('[IVXChatService] Bootstrapping conversation using schema:', tables.schema, 'dbSchema:', tables.dbSchema, 'table:', tables.conversations);

  let ownerContext = null as Awaited<ReturnType<typeof getIVXOwnerAuthContext>> | null;
  try {
    ownerContext = await getIVXOwnerAuthContext();
  } catch (error) {
    console.log('[IVXChatService] Owner auth context unavailable, using local owner conversation:', error instanceof Error ? error.message : 'unknown');
    return getLocalConversation();
  }

  const scopedClient = getScopedSupabaseClient(client, tables.dbSchema);
  const existingConversation = await findOwnerConversationRow(tables, 'Owner conversation lookup');
  if (existingConversation) {
    await ensureInboxState(tables, (existingConversation.id as string) ?? IVX_OWNER_AI_ROOM_ID, ownerContext.userId);
    return mapConversation(existingConversation);
  }

  const insertPayloads = buildConversationInsertPayloads(tables.schema);
  let insertResult = null as Awaited<ReturnType<typeof client.from>> extends never ? never : { data: unknown; error: { message: string } | null } | null;
  let successfulPayload = null as Record<string, unknown> | null;
  let lastInsertError = null as string | null;

  for (const payload of insertPayloads) {
    console.log('[IVXChatService] Owner conversation insert attempt:', {
      schema: tables.schema,
      dbSchema: tables.dbSchema,
      table: tables.conversations,
      payload,
      payloadKeys: formatInsertPayloadKeys(payload),
    });

    const currentResult = await scopedClient.from(tables.conversations).insert(payload).select('*');
    insertResult = currentResult;

    if (!currentResult.error) {
      successfulPayload = payload;
      break;
    }

    lastInsertError = currentResult.error.message;
    console.log('[IVXChatService] Owner conversation insert attempt failed:', {
      schema: tables.schema,
      dbSchema: tables.dbSchema,
      table: tables.conversations,
      payloadKeys: formatInsertPayloadKeys(payload),
      message: currentResult.error.message,
      missingSlugColumn: isMissingSlugColumn(currentResult.error.message),
    });
  }

  if (!insertResult || insertResult.error) {
    console.log('[IVXChatService] Owner conversation insert returned:', {
      message: lastInsertError ?? insertResult?.error?.message ?? 'unknown insert failure',
      schema: tables.schema,
      dbSchema: tables.dbSchema,
      table: tables.conversations,
      attemptedPayloadKeys: insertPayloads.map((payload) => formatInsertPayloadKeys(payload)),
    });
    const fallbackConversation = await recoverOwnerConversationRowAfterWriteFailure(tables, 'Owner conversation fallback readback');
    if (!fallbackConversation) {
      console.log('[IVXChatService] Owner conversation recovery failed after insert error; using local owner conversation instead:', {
        schema: tables.schema,
        dbSchema: tables.dbSchema,
        table: tables.conversations,
        canonicalId: IVX_OWNER_AI_ROOM_ID,
        canonicalSlug: IVX_OWNER_AI_ROOM_SLUG,
        message: lastInsertError ?? insertResult?.error?.message ?? 'unknown insert failure',
      });
      return getLocalConversation();
    }
    await ensureInboxState(tables, (fallbackConversation.id as string) ?? IVX_OWNER_AI_ROOM_ID, ownerContext.userId);
    return mapConversation(fallbackConversation);
  }

  console.log('[IVXChatService] Owner conversation insert readback:', {
    schema: tables.schema,
    dbSchema: tables.dbSchema,
    table: tables.conversations,
    successfulPayloadKeys: formatInsertPayloadKeys(successfulPayload ?? {}),
    row: describeConversationRow(getFirstRowFromSelectResult(insertResult.data, 'Owner conversation insert readback preview')),
  });

  const insertedConversation = getFirstRowFromSelectResult(insertResult.data, 'Owner conversation insert readback')
    ?? await findOwnerConversationRow(tables, 'Owner conversation insert post-write lookup');
  if (!insertedConversation) {
    throw new Error('Owner conversation insert returned no rows after successful write.');
  }

  await ensureInboxState(tables, (insertedConversation.id as string) ?? IVX_OWNER_AI_ROOM_ID, ownerContext.userId);
  return mapConversation(insertedConversation);
}

async function listOwnerMessages(): Promise<IVXMessage[]> {
  const client = getIVXSupabaseClient();
  const tables = await resolveIVXTables();
  const scopedClient = getScopedSupabaseClient(client, tables.dbSchema);
  const conversation = await bootstrapOwnerConversation();
  const localMessages = await loadLocalMessages();
  const messageConversationField = tables.schema === 'generic' ? 'room_id' : 'conversation_id';

  if (tables.schema === 'none') {
    console.log('[IVXChatService] No IVX tables available, listing local owner messages');
    return localMessages;
  }

  console.log('[IVXChatService] Listing messages from:', tables.messages, 'conversation:', conversation.id, 'dbSchema:', tables.dbSchema, 'localFallbackCount:', localMessages.length, 'messageConversationField:', messageConversationField);
  const messageResult = await scopedClient.from(tables.messages).select('*').eq(messageConversationField, conversation.id).order('created_at', { ascending: true });

  if (messageResult.error) {
    console.log('[IVXChatService] Failed to list messages, falling back to local cache:', messageResult.error.message);
    return localMessages;
  }

  const remoteMessages = await Promise.all((messageResult.data ?? []).map((row) => mapMessage(row as Record<string, unknown>)));
  const mergedMessages = mergeOwnerMessages(remoteMessages, localMessages);

  console.log('[IVXChatService] Owner message list resolved:', {
    remoteCount: remoteMessages.length,
    localFallbackCount: localMessages.length,
    mergedCount: mergedMessages.length,
  });

  return mergedMessages;
}

async function sendOwnerTextMessage(input: {
  body: string;
  senderLabel?: string | null;
}): Promise<IVXMessage> {
  let ownerContext = null as Awaited<ReturnType<typeof getIVXOwnerAuthContext>> | null;
  try {
    ownerContext = await getIVXOwnerAuthContext();
  } catch (error) {
    console.log('[IVXChatService] Owner auth unavailable for sendOwnerTextMessage, switching to local mode:', error instanceof Error ? error.message : 'unknown');
  }
  const tables = await resolveIVXTables();
  const conversation = await bootstrapOwnerConversation();
  const body = trimOrNull(input.body);

  if (!body) {
    throw new Error('Type a message before sending.');
  }

  if (!ownerContext || tables.schema === 'none') {
    const localMessage = createLocalMessage({
      conversationId: conversation.id,
      senderUserId: ownerContext?.userId ?? null,
      senderRole: 'owner',
      senderLabel: trimOrNull(input.senderLabel) ?? ownerContext?.email ?? 'IVX Owner',
      body,
      attachmentKind: 'text',
    });
    await appendLocalMessage(localMessage);
    emitLocalOwnerMessage(localMessage, 'send_owner_text_local_mode');
    trackOwnerSendAudit({
      transport: resolveLocalAuditTransport(!!ownerContext),
      conversationId: conversation.id,
      messageId: localMessage.id,
      senderRole: 'owner',
      reason: resolveLocalAuditReason(!!ownerContext, tables.schema === 'none'
        ? 'IVX shared tables are unavailable, so the message was persisted locally.'
        : 'Owner text send switched to local persistence.'),
    });
    console.log('[IVXChatService] Owner text message stored locally');
    return localMessage;
  }

  console.log('[IVXChatService] Sending owner text message:', {
    conversationId: conversation.id,
    userId: ownerContext.userId,
    bodyLength: body.length,
    schema: tables.schema,
  });

  try {
    const message = await insertMessage(tables, {
      conversationId: conversation.id,
      senderUserId: ownerContext.userId,
      senderRole: 'owner',
      senderLabel: trimOrNull(input.senderLabel) ?? ownerContext.email,
      body,
      attachmentKind: 'text',
    });

    await updateConversationSummary(tables, conversation.id, body);
    await ensureInboxState(tables, conversation.id, ownerContext.userId);
    trackOwnerSendAudit({
      transport: 'remote_db_insert',
      conversationId: conversation.id,
      messageId: message.id,
      senderRole: 'owner',
      reason: `Inserted into ${tables.messages} using shared IVX room persistence.`,
    });
    return message;
  } catch (error) {
    console.log('[IVXChatService] Remote owner text send failed, storing locally instead:', error instanceof Error ? error.message : 'unknown');
    const localMessage = createLocalMessage({
      conversationId: conversation.id,
      senderUserId: ownerContext.userId,
      senderRole: 'owner',
      senderLabel: trimOrNull(input.senderLabel) ?? ownerContext.email,
      body,
      attachmentKind: 'text',
    });
    await appendLocalMessage(localMessage);
    emitLocalOwnerMessage(localMessage, 'send_owner_text_remote_fallback');
    trackOwnerSendAudit({
      transport: 'local_fallback',
      conversationId: conversation.id,
      messageId: localMessage.id,
      senderRole: 'owner',
      reason: `Remote owner text insert failed and the message was persisted locally instead: ${error instanceof Error ? error.message : 'unknown error'}`,
    });
    return localMessage;
  }
}

async function sendOwnerSupportMessage(input: {
  body: string;
  senderRole: 'assistant' | 'system';
  senderLabel?: string | null;
  attachmentKind?: IVXAttachmentKind;
}): Promise<IVXMessage> {
  let ownerContext = null as Awaited<ReturnType<typeof getIVXOwnerAuthContext>> | null;
  try {
    ownerContext = await getIVXOwnerAuthContext();
  } catch (error) {
    console.log('[IVXChatService] Owner auth unavailable for sendOwnerSupportMessage, switching to local mode:', error instanceof Error ? error.message : 'unknown');
  }
  const tables = await resolveIVXTables();
  const conversation = await bootstrapOwnerConversation();
  const body = trimOrNull(input.body);

  if (!body) {
    throw new Error('Support message body is required.');
  }

  const senderLabel = trimOrNull(input.senderLabel)
    ?? (input.senderRole === 'assistant' ? IVX_OWNER_AI_PROFILE.name : 'System');
  const attachmentKind = input.attachmentKind ?? (input.senderRole === 'assistant' ? 'text' : 'system');

  if (!ownerContext || tables.schema === 'none') {
    const localMessage = createLocalMessage({
      conversationId: conversation.id,
      senderUserId: null,
      senderRole: input.senderRole,
      senderLabel,
      body,
      attachmentKind,
    });
    await appendLocalMessage(localMessage);
    emitLocalOwnerMessage(localMessage, `send_owner_support_local_mode:${input.senderRole}`);
    trackOwnerSendAudit({
      transport: resolveLocalAuditTransport(!!ownerContext),
      conversationId: conversation.id,
      messageId: localMessage.id,
      senderRole: input.senderRole,
      reason: resolveLocalAuditReason(!!ownerContext, tables.schema === 'none'
        ? 'IVX shared tables are unavailable, so the support message was persisted locally.'
        : `Support message switched to local persistence for role ${input.senderRole}.`),
    });
    console.log('[IVXChatService] Support message stored locally, role:', input.senderRole);
    return localMessage;
  }

  console.log('[IVXChatService] Sending support message:', {
    conversationId: conversation.id,
    senderRole: input.senderRole,
    schema: tables.schema,
    bodyLength: body.length,
  });

  try {
    const message = await insertMessage(tables, {
      conversationId: conversation.id,
      senderUserId: null,
      senderRole: input.senderRole,
      senderLabel,
      body,
      attachmentKind,
    });

    await updateConversationSummary(tables, conversation.id, body);
    await ensureInboxState(tables, conversation.id, ownerContext.userId);
    trackOwnerSendAudit({
      transport: 'remote_db_insert',
      conversationId: conversation.id,
      messageId: message.id,
      senderRole: input.senderRole,
      reason: `Inserted into ${tables.messages} using shared IVX room persistence.`,
    });
    return message;
  } catch (error) {
    console.log('[IVXChatService] Remote support message send failed, storing locally instead:', error instanceof Error ? error.message : 'unknown');
    const localMessage = createLocalMessage({
      conversationId: conversation.id,
      senderUserId: null,
      senderRole: input.senderRole,
      senderLabel,
      body,
      attachmentKind,
    });
    await appendLocalMessage(localMessage);
    emitLocalOwnerMessage(localMessage, `send_owner_support_remote_fallback:${input.senderRole}`);
    trackOwnerSendAudit({
      transport: 'local_fallback',
      conversationId: conversation.id,
      messageId: localMessage.id,
      senderRole: input.senderRole,
      reason: `Remote support insert failed and the message was persisted locally instead: ${error instanceof Error ? error.message : 'unknown error'}`,
    });
    return localMessage;
  }
}

async function sendOwnerAttachmentMessage(input: {
  upload: IVXUploadInput;
  body?: string | null;
  senderLabel?: string | null;
}): Promise<IVXMessage> {
  let ownerContext = null as Awaited<ReturnType<typeof getIVXOwnerAuthContext>> | null;
  try {
    ownerContext = await getIVXOwnerAuthContext();
  } catch (error) {
    console.log('[IVXChatService] Owner auth unavailable for sendOwnerAttachmentMessage, switching to local attachment mode:', error instanceof Error ? error.message : 'unknown');
  }

  const tables = await resolveIVXTables();
  const conversation = await bootstrapOwnerConversation();
  const body = trimOrNull(input.body);
  const senderLabel = trimOrNull(input.senderLabel) ?? ownerContext?.email ?? 'IVX Owner';

  if (!ownerContext || tables.schema === 'none') {
    const localMessage = createLocalAttachmentMessage({
      conversationId: conversation.id,
      senderUserId: ownerContext?.userId ?? null,
      senderLabel,
      body,
      upload: input.upload,
    });
    await appendLocalMessage(localMessage);
    emitLocalOwnerMessage(localMessage, 'send_owner_attachment_local_mode');
    trackOwnerSendAudit({
      transport: resolveLocalAuditTransport(!!ownerContext),
      conversationId: conversation.id,
      messageId: localMessage.id,
      senderRole: 'owner',
      reason: resolveLocalAuditReason(!!ownerContext, tables.schema === 'none'
        ? 'IVX shared tables are unavailable, so the attachment message was persisted locally.'
        : 'Owner attachment send switched to local persistence.'),
    });
    console.log('[IVXChatService] Owner attachment stored locally');
    return localMessage;
  }

  try {
    const uploadedFile = await ivxFileUploadService.uploadOwnerFile({
      upload: input.upload,
      conversationId: conversation.id,
    });
    const attachmentKind = getAttachmentKindFromMime(uploadedFile.mimeType);

    console.log('[IVXChatService] Sending owner attachment message:', {
      conversationId: conversation.id,
      userId: ownerContext.userId,
      fileName: uploadedFile.fileName,
      mimeType: uploadedFile.mimeType,
      schema: tables.schema,
    });

    const message = await insertMessage(tables, {
      conversationId: conversation.id,
      senderUserId: ownerContext.userId,
      senderRole: 'owner',
      senderLabel,
      body,
      attachmentUrl: uploadedFile.path,
      attachmentName: uploadedFile.fileName,
      attachmentMime: uploadedFile.mimeType,
      attachmentSize: uploadedFile.size,
      attachmentKind,
    });

    await updateConversationSummary(tables, conversation.id, body ?? uploadedFile.fileName);
    await ensureInboxState(tables, conversation.id, ownerContext.userId);
    trackOwnerSendAudit({
      transport: 'remote_db_insert',
      conversationId: conversation.id,
      messageId: message.id,
      senderRole: 'owner',
      reason: `Attachment inserted into ${tables.messages} using shared IVX room persistence.`,
    });
    return message;
  } catch (error) {
    console.log('[IVXChatService] Remote attachment send failed, storing locally instead:', error instanceof Error ? error.message : 'unknown');
    const localMessage = createLocalAttachmentMessage({
      conversationId: conversation.id,
      senderUserId: ownerContext.userId,
      senderLabel,
      body,
      upload: input.upload,
    });
    await appendLocalMessage(localMessage);
    emitLocalOwnerMessage(localMessage, 'send_owner_attachment_remote_fallback');
    trackOwnerSendAudit({
      transport: 'local_fallback',
      conversationId: conversation.id,
      messageId: localMessage.id,
      senderRole: 'owner',
      reason: `Remote attachment send failed and the message was persisted locally instead: ${error instanceof Error ? error.message : 'unknown error'}`,
    });
    return localMessage;
  }
}

async function subscribeToOwnerMessages(
  onMessage: (message: IVXMessage) => void,
  onStatusChange?: (status: string) => void,
): Promise<() => void> {
  const client = getIVXSupabaseClient();
  const tables = await resolveIVXTables();
  const conversation = await bootstrapOwnerConversation();
  const seenMessageIds = new Set<string>();
  let closed = false;
  let unsubscribeStarted = false;
  let channelTerminated = false;

  const markClosed = (): void => {
    closed = true;
  };

  const handleIncomingMessage = (message: IVXMessage, source: 'local' | 'realtime'): void => {
    if (closed || !message.id || seenMessageIds.has(message.id)) {
      return;
    }

    seenMessageIds.add(message.id);
    trackOwnerReceiveAudit({
      transport: source === 'realtime' ? 'realtime_event' : 'local_listener',
      conversationId: message.conversationId,
      messageId: message.id,
      senderRole: message.senderRole,
      reason: source === 'realtime'
        ? `Realtime subscription delivered ${message.senderRole} message ${message.id}.`
        : `Local fallback listener delivered ${message.senderRole} message ${message.id}.`,
    });
    console.log('[IVXChatService] Delivering owner message:', {
      source,
      messageId: message.id,
      senderRole: message.senderRole,
      conversationId: message.conversationId,
    });
    onMessage(message);
  };

  const localListener = (message: IVXMessage): void => {
    if (closed || message.conversationId !== conversation.id) {
      return;
    }

    onStatusChange?.('local_fallback');
    handleIncomingMessage(message, 'local');
  };

  ownerLocalMessageListeners.add(localListener);

  if (tables.schema === 'none') {
    console.log('[IVXChatService] Realtime subscription skipped because shared chat tables are unavailable');
    onStatusChange?.('unavailable');
    return () => {
      if (unsubscribeStarted) {
        return;
      }

      unsubscribeStarted = true;
      markClosed();
      ownerLocalMessageListeners.delete(localListener);
    };
  }

  const realtimeSchema = getRealtimeSchema(tables);
  const channelName = `ivx-owner-room:${conversation.id}`;
  const teardownKey = `${channelName}:${tables.messages}:${realtimeSchema}`;
  const realtimeConversationField = tables.schema === 'generic' ? 'room_id' : 'conversation_id';
  const channel = client.channel(channelName).on('postgres_changes', {
    event: 'INSERT',
    schema: realtimeSchema,
    table: tables.messages,
    filter: `${realtimeConversationField}=eq.${conversation.id}`,
  }, (payload) => {
    const rawId = typeof (payload.new as { id?: unknown } | null)?.id === 'string'
      ? (payload.new as { id?: string }).id ?? null
      : null;
    if (!rawId) {
      return;
    }

    console.log('[IVXChatService] Incoming realtime message on', tables.messages, 'messageId:', rawId);
    void mapMessage(payload.new as Record<string, unknown>)
      .then((message) => {
        handleIncomingMessage(message, 'realtime');
      })
      .catch((error: unknown) => {
        console.log('[IVXChatService] Failed to hydrate realtime message:', error instanceof Error ? error.message : 'unknown');
      });
  }).subscribe((status) => {
    const normalizedStatus = String(status ?? '').toLowerCase();
    console.log('[IVXChatService] Realtime status:', normalizedStatus);

    if (normalizedStatus === 'closed') {
      channelTerminated = true;
      markClosed();
    }

    if (closed && normalizedStatus !== 'subscribed') {
      return;
    }

    onStatusChange?.(normalizedStatus);
  });

  const unregisterActiveChannel = (): void => {
    if (activeOwnerRealtimeSubscriptions.delete(teardownKey)) {
      console.log('[IVXChatService] Owner realtime channel unregistered:', teardownKey, 'remainingActiveChannels:', activeOwnerRealtimeSubscriptions.size);
    }
  };

  const safeClose = (reason: string): void => {
    if (unsubscribeStarted) {
      return;
    }

    unsubscribeStarted = true;
    markClosed();
    ownerLocalMessageListeners.delete(localListener);
    unregisterActiveChannel();
    console.log('[IVXChatService] Closing owner realtime channel:', reason, 'channel:', channelName, 'alreadyTerminated:', channelTerminated);

    if (channelTerminated) {
      return;
    }

    if (activeOwnerRealtimeTeardowns.has(teardownKey)) {
      console.log('[IVXChatService] Owner realtime teardown already in progress:', teardownKey);
      return;
    }

    activeOwnerRealtimeTeardowns.add(teardownKey);
    setTimeout(() => {
      void (async () => {
        try {
          await client.removeChannel(channel as never);
          console.log('[IVXChatService] Owner realtime channel removed safely:', teardownKey);
        } catch (unsubscribeError) {
          console.log('[IVXChatService] Owner realtime teardown note:', unsubscribeError instanceof Error ? unsubscribeError.message : 'unknown');
        } finally {
          activeOwnerRealtimeTeardowns.delete(teardownKey);
        }
      })();
    }, 0);
  };

  activeOwnerRealtimeSubscriptions.add(teardownKey);
  console.log('[IVXChatService] Setting up realtime on:', tables.messages, 'conversation:', conversation.id, 'realtimeSchema:', realtimeSchema, 'conversationField:', realtimeConversationField, 'channel:', channelName, 'activeChannelCount:', activeOwnerRealtimeSubscriptions.size);
  onStatusChange?.('connecting');

  return () => {
    safeClose('cleanup');
  };
}

export const ivxChatService = {
  bootstrapOwnerConversation,
  listOwnerMessages,
  sendOwnerTextMessage,
  sendOwnerSupportMessage,
  sendOwnerAttachmentMessage,
  subscribeToOwnerMessages,
  getLastOwnerSendAudit,
  getLastOwnerReceiveAudit,
  getOwnerRealtimeSubscriptionAudit,
};
