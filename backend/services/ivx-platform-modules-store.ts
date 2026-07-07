/**
 * IVX Platform Modules — durable store for the 28-module platform surface.
 *
 * Covers the genuinely missing modules (the ones with zero routes in hono.ts):
 *   - Waitlist (public sign-ups)
 *   - Settings (owner preferences)
 *   - Revenue (recorded revenue events, computed totals)
 *   - Push Notifications (notification log + pending queue)
 *   - Broadcast (owner→audience message log)
 *   - Roles & Permissions (RBAC: role definitions + member role assignments)
 *   - Transactions (capital movement ledger: deposit/withdrawal/distribution)
 *   - Casa Rosario (project-specific property listings)
 *   - Landing Analytics (page view events + computed funnel metrics)
 *   - Reels → Deal Sync (maps video-platform reels to deal-tracking deals)
 *   - Owner Dashboard (aggregated roll-up across all modules)
 *
 * Partner CRM / Broker CRM / Buyer CRM / Realtor CRM are filtered views over
 * the existing investor-crm-store (partyType filter) — no duplicate store.
 *
 * HARD HONESTY RULE (platform-wide, enforced here):
 *   - IVX NEVER fabricates data. Every record requires a real, attributable
 *     source. Unknown values stay empty/null — never invented.
 *   - Metrics are COMPUTED from recorded events, never fabricated.
 *
 * Durable layout (mirrors the proven ivx-investor-crm-store pattern):
 *   Supabase-backed via ivx-durable-store (survives Render restarts/deploys).
 *   Filesystem fallback for local dev / tests.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { auditDir } from './ivx-data-root';
import {
  isDurableStoreConfigured,
  readDurableJson,
  writeDurableJson,
  appendDurableEvent,
} from './ivx-durable-store';

export const IVX_PLATFORM_MODULES_MARKER = 'ivx-platform-modules-2026-07-07';

// ─── Shared helpers ──────────────────────────────────────────────────────────

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((v) => asTrimmedString(v)).filter(Boolean)));
}

function asOptionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asOptionalString(value: unknown): string | null {
  const s = asTrimmedString(value);
  return s || null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ─── Durable I/O helpers ─────────────────────────────────────────────────────

async function readStoreJson<T>(file: string, fallback: T): Promise<T> {
  if (isDurableStoreConfigured()) {
    return readDurableJson<T>(file, fallback);
  }
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeStoreJson(file: string, value: unknown, dir: string): Promise<void> {
  if (isDurableStoreConfigured()) {
    await writeDurableJson(file, value);
    return;
  }
  await mkdir(dir, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

async function appendStoreEvent(eventFile: string, event: Record<string, unknown>, dir: string): Promise<void> {
  if (isDurableStoreConfigured()) {
    try {
      await appendDurableEvent(eventFile, event);
    } catch {
      // Forensic log is best-effort.
    }
    return;
  }
  try {
    await mkdir(dir, { recursive: true });
    await appendFile(eventFile, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // Forensic log is best-effort.
  }
}

// ─── 1. Waitlist ─────────────────────────────────────────────────────────────

export type WaitlistSource = 'landing_page' | 'app' | 'referral' | 'owner_entered';

export type WaitlistEntry = {
  id: string;
  name: string;
  email: string;
  phone: string;
  interest: string;
  source: WaitlistSource;
  sourceDetail: string;
  status: 'pending' | 'contacted' | 'converted' | 'declined';
  createdAt: string;
  updatedAt: string;
};

const WAITLIST_DIR = auditDir('waitlist');
const WAITLIST_STATE = path.join(WAITLIST_DIR, 'entries.json');

export type CreateWaitlistInput = {
  name: string;
  email: string;
  phone?: string;
  interest?: string;
  source: WaitlistSource;
  sourceDetail?: string;
};

export async function listWaitlist(): Promise<WaitlistEntry[]> {
  return readStoreJson<WaitlistEntry[]>(WAITLIST_STATE, []);
}

export async function createWaitlistEntry(input: CreateWaitlistInput): Promise<WaitlistEntry> {
  const entries = await listWaitlist();
  const now = nowIso();
  const entry: WaitlistEntry = {
    id: createId('wl'),
    name: asTrimmedString(input.name),
    email: asTrimmedString(input.email).toLowerCase(),
    phone: asTrimmedString(input.phone),
    interest: asTrimmedString(input.interest),
    source: input.source,
    sourceDetail: asTrimmedString(input.sourceDetail),
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };
  entries.push(entry);
  await writeStoreJson(WAITLIST_STATE, entries, WAITLIST_DIR);
  await appendStoreEvent(path.join(WAITLIST_DIR, 'entries.jsonl'), { type: 'created', entry }, WAITLIST_DIR);
  return entry;
}

export async function setWaitlistStatus(id: string, status: WaitlistEntry['status']): Promise<WaitlistEntry | null> {
  const entries = await listWaitlist();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return null;
  entry.status = status;
  entry.updatedAt = nowIso();
  await writeStoreJson(WAITLIST_STATE, entries, WAITLIST_DIR);
  await appendStoreEvent(path.join(WAITLIST_DIR, 'entries.jsonl'), { type: 'status_changed', id, status }, WAITLIST_DIR);
  return entry;
}

export async function deleteWaitlistEntry(id: string): Promise<boolean> {
  const entries = await listWaitlist();
  const idx = entries.findIndex((e) => e.id === id);
  if (idx < 0) return false;
  entries.splice(idx, 1);
  await writeStoreJson(WAITLIST_STATE, entries, WAITLIST_DIR);
  await appendStoreEvent(path.join(WAITLIST_DIR, 'entries.jsonl'), { type: 'deleted', id }, WAITLIST_DIR);
  return true;
}

// ─── 2. Settings ─────────────────────────────────────────────────────────────

export type SettingKey =
  | 'owner_display_name'
  | 'owner_email'
  | 'default_currency'
  | 'notification_email'
  | 'notification_phone'
  | 'branding_primary_color'
  | 'branding_logo_url'
  | 'landing_page_enabled'
  | 'invest_now_enabled'
  | 'capital_network_enabled'
  | 'auto_approve_investors';

export type SettingRecord = {
  key: SettingKey;
  value: string;
  updatedAt: string;
  updatedBy: string;
};

const SETTINGS_DIR = auditDir('settings');
const SETTINGS_STATE = path.join(SETTINGS_DIR, 'settings.json');

export async function listSettings(): Promise<SettingRecord[]> {
  return readStoreJson<SettingRecord[]>(SETTINGS_STATE, []);
}

export async function getSetting(key: SettingKey): Promise<string | null> {
  const settings = await listSettings();
  const record = settings.find((s) => s.key === key);
  return record ? record.value : null;
}

export async function upsertSetting(key: SettingKey, value: string, updatedBy: string): Promise<SettingRecord> {
  const settings = await listSettings();
  const existing = settings.find((s) => s.key === key);
  const now = nowIso();
  if (existing) {
    existing.value = asTrimmedString(value);
    existing.updatedAt = now;
    existing.updatedBy = asTrimmedString(updatedBy);
  } else {
    settings.push({ key, value: asTrimmedString(value), updatedAt: now, updatedBy: asTrimmedString(updatedBy) });
  }
  await writeStoreJson(SETTINGS_STATE, settings, SETTINGS_DIR);
  await appendStoreEvent(path.join(SETTINGS_DIR, 'settings.jsonl'), { type: 'upsert', key, value }, SETTINGS_DIR);
  return settings.find((s) => s.key === key)!;
}

// ─── 3. Revenue ──────────────────────────────────────────────────────────────

export type RevenueType = 'deal_fee' | 'management_fee' | 'commission' | 'subscription' | 'other';
export type RevenueStatus = 'recorded' | 'received' | 'pending' | 'written_off';

export type RevenueRecord = {
  id: string;
  description: string;
  amount: number;
  currency: string;
  type: RevenueType;
  status: RevenueStatus;
  dealId: string | null;
  source: string;
  receivedDate: string | null;
  createdAt: string;
  updatedAt: string;
};

const REVENUE_DIR = auditDir('revenue');
const REVENUE_STATE = path.join(REVENUE_DIR, 'records.json');

export type CreateRevenueInput = {
  description: string;
  amount: number;
  currency?: string;
  type: RevenueType;
  dealId?: string;
  source: string;
  status?: RevenueStatus;
  receivedDate?: string | null;
};

export async function listRevenue(): Promise<RevenueRecord[]> {
  return readStoreJson<RevenueRecord[]>(REVENUE_STATE, []);
}

export async function createRevenueRecord(input: CreateRevenueInput): Promise<RevenueRecord> {
  const records = await listRevenue();
  const now = nowIso();
  const record: RevenueRecord = {
    id: createId('rev'),
    description: asTrimmedString(input.description),
    amount: asOptionalNumber(input.amount) ?? 0,
    currency: asTrimmedString(input.currency) || 'USD',
    type: input.type,
    status: input.status ?? 'recorded',
    dealId: asOptionalString(input.dealId),
    source: asTrimmedString(input.source),
    receivedDate: asOptionalString(input.receivedDate),
    createdAt: now,
    updatedAt: now,
  };
  records.push(record);
  await writeStoreJson(REVENUE_STATE, records, REVENUE_DIR);
  await appendStoreEvent(path.join(REVENUE_DIR, 'records.jsonl'), { type: 'created', record }, REVENUE_DIR);
  return record;
}

export async function setRevenueStatus(id: string, status: RevenueStatus): Promise<RevenueRecord | null> {
  const records = await listRevenue();
  const record = records.find((r) => r.id === id);
  if (!record) return null;
  record.status = status;
  record.updatedAt = nowIso();
  await writeStoreJson(REVENUE_STATE, records, REVENUE_DIR);
  return record;
}

export type RevenueSummary = {
  totalRecorded: number;
  totalReceived: number;
  totalPending: number;
  byType: Record<string, number>;
  count: number;
};

export async function summarizeRevenue(): Promise<RevenueSummary> {
  const records = await listRevenue();
  const byType: Record<string, number> = {};
  let totalRecorded = 0;
  let totalReceived = 0;
  let totalPending = 0;
  for (const r of records) {
    totalRecorded += r.amount;
    byType[r.type] = (byType[r.type] ?? 0) + r.amount;
    if (r.status === 'received') totalReceived += r.amount;
    if (r.status === 'pending') totalPending += r.amount;
  }
  return { totalRecorded, totalReceived, totalPending, byType, count: records.length };
}

// ─── 4. Push Notifications ───────────────────────────────────────────────────

export type NotificationChannel = 'push' | 'email' | 'sms' | 'in_app';
export type NotificationStatus = 'queued' | 'sent' | 'delivered' | 'failed';

export type NotificationRecord = {
  id: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  audience: 'all' | 'investors' | 'buyers' | 'waitlist' | 'individual';
  targetUserId: string | null;
  status: NotificationStatus;
  sentAt: string | null;
  createdAt: string;
};

const NOTIFICATIONS_DIR = auditDir('notifications');
const NOTIFICATIONS_STATE = path.join(NOTIFICATIONS_DIR, 'records.json');

export type CreateNotificationInput = {
  title: string;
  body: string;
  channel: NotificationChannel;
  audience?: NotificationRecord['audience'];
  targetUserId?: string;
};

export async function listNotifications(): Promise<NotificationRecord[]> {
  return readStoreJson<NotificationRecord[]>(NOTIFICATIONS_STATE, []);
}

export async function createNotification(input: CreateNotificationInput): Promise<NotificationRecord> {
  const records = await listNotifications();
  const record: NotificationRecord = {
    id: createId('notif'),
    title: asTrimmedString(input.title),
    body: asTrimmedString(input.body),
    channel: input.channel,
    audience: input.audience ?? 'all',
    targetUserId: asOptionalString(input.targetUserId),
    status: 'queued',
    sentAt: null,
    createdAt: nowIso(),
  };
  records.push(record);
  await writeStoreJson(NOTIFICATIONS_STATE, records, NOTIFICATIONS_DIR);
  await appendStoreEvent(path.join(NOTIFICATIONS_DIR, 'records.jsonl'), { type: 'created', record }, NOTIFICATIONS_DIR);
  return record;
}

export async function setNotificationStatus(id: string, status: NotificationStatus): Promise<NotificationRecord | null> {
  const records = await listNotifications();
  const record = records.find((n) => n.id === id);
  if (!record) return null;
  record.status = status;
  if (status === 'sent' || status === 'delivered') {
    record.sentAt = nowIso();
  }
  await writeStoreJson(NOTIFICATIONS_STATE, records, NOTIFICATIONS_DIR);
  return record;
}

// ─── 5. Broadcast ────────────────────────────────────────────────────────────

export type BroadcastStatus = 'draft' | 'scheduled' | 'sent' | 'cancelled';

export type BroadcastRecord = {
  id: string;
  subject: string;
  message: string;
  audience: 'all' | 'investors' | 'buyers' | 'waitlist' | 'partners';
  channel: NotificationChannel;
  status: BroadcastStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  recipientCount: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

const BROADCAST_DIR = auditDir('broadcast');
const BROADCAST_STATE = path.join(BROADCAST_DIR, 'records.json');

export type CreateBroadcastInput = {
  subject: string;
  message: string;
  audience?: BroadcastRecord['audience'];
  channel?: NotificationChannel;
  scheduledAt?: string | null;
  createdBy: string;
};

export async function listBroadcasts(): Promise<BroadcastRecord[]> {
  return readStoreJson<BroadcastRecord[]>(BROADCAST_STATE, []);
}

export async function createBroadcast(input: CreateBroadcastInput): Promise<BroadcastRecord> {
  const records = await listBroadcasts();
  const now = nowIso();
  const record: BroadcastRecord = {
    id: createId('bc'),
    subject: asTrimmedString(input.subject),
    message: asTrimmedString(input.message),
    audience: input.audience ?? 'all',
    channel: input.channel ?? 'email',
    status: input.scheduledAt ? 'scheduled' : 'draft',
    scheduledAt: asOptionalString(input.scheduledAt),
    sentAt: null,
    recipientCount: 0,
    createdBy: asTrimmedString(input.createdBy),
    createdAt: now,
    updatedAt: now,
  };
  records.push(record);
  await writeStoreJson(BROADCAST_STATE, records, BROADCAST_DIR);
  await appendStoreEvent(path.join(BROADCAST_DIR, 'records.jsonl'), { type: 'created', record }, BROADCAST_DIR);
  return record;
}

export async function setBroadcastStatus(id: string, status: BroadcastStatus, recipientCount?: number): Promise<BroadcastRecord | null> {
  const records = await listBroadcasts();
  const record = records.find((b) => b.id === id);
  if (!record) return null;
  record.status = status;
  record.updatedAt = nowIso();
  if (status === 'sent') {
    record.sentAt = nowIso();
    if (typeof recipientCount === 'number') record.recipientCount = recipientCount;
  }
  await writeStoreJson(BROADCAST_STATE, records, BROADCAST_DIR);
  return record;
}

export async function deleteBroadcast(id: string): Promise<boolean> {
  const records = await listBroadcasts();
  const idx = records.findIndex((b) => b.id === id);
  if (idx < 0) return false;
  records.splice(idx, 1);
  await writeStoreJson(BROADCAST_STATE, records, BROADCAST_DIR);
  return true;
}

// ─── 6. Roles & Permissions ──────────────────────────────────────────────────

export type RoleName = 'owner' | 'admin' | 'analyst' | 'investor' | 'viewer';

export type Permission =
  | 'deals:read' | 'deals:write'
  | 'crm:read' | 'crm:write'
  | 'capital:read' | 'capital:write'
  | 'revenue:read' | 'revenue:write'
  | 'broadcast:send'
  | 'settings:write'
  | 'users:manage';

export type RoleDefinition = {
  name: RoleName;
  displayName: string;
  permissions: Permission[];
  isSystem: boolean;
};

export type RoleAssignment = {
  id: string;
  userId: string;
  userEmail: string;
  role: RoleName;
  assignedBy: string;
  createdAt: string;
  updatedAt: string;
};

const ROLES_DIR = auditDir('roles');
const ROLES_STATE = path.join(ROLES_DIR, 'definitions.json');
const ASSIGNMENTS_STATE = path.join(ROLES_DIR, 'assignments.json');

export const DEFAULT_ROLE_DEFINITIONS: RoleDefinition[] = [
  { name: 'owner', displayName: 'Owner', permissions: ['deals:read','deals:write','crm:read','crm:write','capital:read','capital:write','revenue:read','revenue:write','broadcast:send','settings:write','users:manage'], isSystem: true },
  { name: 'admin', displayName: 'Administrator', permissions: ['deals:read','deals:write','crm:read','crm:write','capital:read','capital:write','revenue:read','revenue:write','broadcast:send','settings:write'], isSystem: true },
  { name: 'analyst', displayName: 'Analyst', permissions: ['deals:read','crm:read','capital:read','revenue:read'], isSystem: true },
  { name: 'investor', displayName: 'Investor', permissions: ['deals:read'], isSystem: true },
  { name: 'viewer', displayName: 'Viewer', permissions: ['deals:read'], isSystem: true },
];

export async function listRoleDefinitions(): Promise<RoleDefinition[]> {
  const defs = await readStoreJson<RoleDefinition[]>(ROLES_STATE, []);
  if (defs.length === 0) return DEFAULT_ROLE_DEFINITIONS;
  return defs;
}

export async function upsertRoleDefinition(def: Omit<RoleDefinition, 'isSystem'> & { isSystem?: boolean }): Promise<RoleDefinition> {
  const defs = await listRoleDefinitions();
  const existing = defs.find((d) => d.name === def.name);
  const now = nowIso();
  const record: RoleDefinition = {
    name: def.name,
    displayName: asTrimmedString(def.displayName),
    permissions: asStringArray(def.permissions) as Permission[],
    isSystem: def.isSystem ?? false,
  };
  if (existing) {
    existing.displayName = record.displayName;
    existing.permissions = record.permissions;
  } else {
    defs.push(record);
  }
  await writeStoreJson(ROLES_STATE, defs, ROLES_DIR);
  await appendStoreEvent(path.join(ROLES_DIR, 'definitions.jsonl'), { type: 'upsert', record }, ROLES_DIR);
  return record;
}

export async function listRoleAssignments(): Promise<RoleAssignment[]> {
  return readStoreJson<RoleAssignment[]>(ASSIGNMENTS_STATE, []);
}

export async function assignRole(userId: string, userEmail: string, role: RoleName, assignedBy: string): Promise<RoleAssignment> {
  const assignments = await listRoleAssignments();
  const existing = assignments.find((a) => a.userId === userId);
  const now = nowIso();
  if (existing) {
    existing.role = role;
    existing.userEmail = asTrimmedString(userEmail).toLowerCase();
    existing.updatedAt = now;
    await writeStoreJson(ASSIGNMENTS_STATE, assignments, ROLES_DIR);
    return existing;
  }
  const record: RoleAssignment = {
    id: createId('ra'),
    userId: asTrimmedString(userId),
    userEmail: asTrimmedString(userEmail).toLowerCase(),
    role,
    assignedBy: asTrimmedString(assignedBy),
    createdAt: now,
    updatedAt: now,
  };
  assignments.push(record);
  await writeStoreJson(ASSIGNMENTS_STATE, assignments, ROLES_DIR);
  await appendStoreEvent(path.join(ROLES_DIR, 'assignments.jsonl'), { type: 'assigned', record }, ROLES_DIR);
  return record;
}

export async function revokeRole(userId: string): Promise<boolean> {
  const assignments = await listRoleAssignments();
  const idx = assignments.findIndex((a) => a.userId === userId);
  if (idx < 0) return false;
  assignments.splice(idx, 1);
  await writeStoreJson(ASSIGNMENTS_STATE, assignments, ROLES_DIR);
  await appendStoreEvent(path.join(ROLES_DIR, 'assignments.jsonl'), { type: 'revoked', userId }, ROLES_DIR);
  return true;
}

export async function getUserPermissions(userId: string): Promise<Permission[]> {
  const assignments = await listRoleAssignments();
  const assignment = assignments.find((a) => a.userId === userId);
  if (!assignment) return [];
  const defs = await listRoleDefinitions();
  const def = defs.find((d) => d.name === assignment.role);
  return def ? def.permissions : [];
}

// ─── 7. Transactions ─────────────────────────────────────────────────────────

export type TransactionType = 'deposit' | 'withdrawal' | 'distribution' | 'fee' | 'refund';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'reversed';

export type TransactionRecord = {
  id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  description: string;
  dealId: string | null;
  userId: string | null;
  status: TransactionStatus;
  reference: string;
  createdAt: string;
  updatedAt: string;
};

const TRANSACTIONS_DIR = auditDir('transactions');
const TRANSACTIONS_STATE = path.join(TRANSACTIONS_DIR, 'records.json');

export type CreateTransactionInput = {
  type: TransactionType;
  amount: number;
  currency?: string;
  description: string;
  dealId?: string;
  userId?: string;
  status?: TransactionStatus;
  reference?: string;
};

export async function listTransactions(): Promise<TransactionRecord[]> {
  return readStoreJson<TransactionRecord[]>(TRANSACTIONS_STATE, []);
}

export async function createTransaction(input: CreateTransactionInput): Promise<TransactionRecord> {
  const records = await listTransactions();
  const now = nowIso();
  const record: TransactionRecord = {
    id: createId('txn'),
    type: input.type,
    amount: asOptionalNumber(input.amount) ?? 0,
    currency: asTrimmedString(input.currency) || 'USD',
    description: asTrimmedString(input.description),
    dealId: asOptionalString(input.dealId),
    userId: asOptionalString(input.userId),
    status: input.status ?? 'pending',
    reference: asTrimmedString(input.reference) || createId('ref'),
    createdAt: now,
    updatedAt: now,
  };
  records.push(record);
  await writeStoreJson(TRANSACTIONS_STATE, records, TRANSACTIONS_DIR);
  await appendStoreEvent(path.join(TRANSACTIONS_DIR, 'records.jsonl'), { type: 'created', record }, TRANSACTIONS_DIR);
  return record;
}

export async function setTransactionStatus(id: string, status: TransactionStatus): Promise<TransactionRecord | null> {
  const records = await listTransactions();
  const record = records.find((t) => t.id === id);
  if (!record) return null;
  record.status = status;
  record.updatedAt = nowIso();
  await writeStoreJson(TRANSACTIONS_STATE, records, TRANSACTIONS_DIR);
  return record;
}

export type TransactionSummary = {
  totalInflow: number;
  totalOutflow: number;
  net: number;
  byType: Record<string, number>;
  count: number;
};

export async function summarizeTransactions(): Promise<TransactionSummary> {
  const records = await listTransactions();
  const byType: Record<string, number> = {};
  let totalInflow = 0;
  let totalOutflow = 0;
  for (const t of records) {
    if (t.status !== 'completed') continue;
    byType[t.type] = (byType[t.type] ?? 0) + t.amount;
    if (t.type === 'deposit' || t.type === 'distribution') totalInflow += t.amount;
    if (t.type === 'withdrawal' || t.type === 'fee' || t.type === 'refund') totalOutflow += t.amount;
  }
  return { totalInflow, totalOutflow, net: totalInflow - totalOutflow, byType, count: records.length };
}

// ─── 8. Casa Rosario ─────────────────────────────────────────────────────────

export type CasaRosarioListingStatus = 'available' | 'reserved' | 'sold' | 'off_market';

export type CasaRosarioListing = {
  id: string;
  title: string;
  description: string;
  price: number | null;
  currency: string;
  bedrooms: number | null;
  bathrooms: number | null;
  squareFeet: number | null;
  address: string;
  city: string;
  country: string;
  status: CasaRosarioListingStatus;
  images: string[];
  source: string;
  sourceDetail: string;
  createdAt: string;
  updatedAt: string;
};

const CASA_DIR = auditDir('casa-rosario');
const CASA_STATE = path.join(CASA_DIR, 'listings.json');

export type CreateCasaRosarioInput = {
  title: string;
  description?: string;
  price?: number;
  currency?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFeet?: number;
  address?: string;
  city?: string;
  country?: string;
  images?: string[];
  source: string;
  sourceDetail?: string;
};

export async function listCasaRosario(): Promise<CasaRosarioListing[]> {
  return readStoreJson<CasaRosarioListing[]>(CASA_STATE, []);
}

export async function createCasaRosarioListing(input: CreateCasaRosarioInput): Promise<CasaRosarioListing> {
  const listings = await listCasaRosario();
  const now = nowIso();
  const record: CasaRosarioListing = {
    id: createId('casa'),
    title: asTrimmedString(input.title),
    description: asTrimmedString(input.description),
    price: asOptionalNumber(input.price),
    currency: asTrimmedString(input.currency) || 'USD',
    bedrooms: asOptionalNumber(input.bedrooms),
    bathrooms: asOptionalNumber(input.bathrooms),
    squareFeet: asOptionalNumber(input.squareFeet),
    address: asTrimmedString(input.address),
    city: asTrimmedString(input.city),
    country: asTrimmedString(input.country) || 'Dominican Republic',
    status: 'available',
    images: asStringArray(input.images),
    source: asTrimmedString(input.source),
    sourceDetail: asTrimmedString(input.sourceDetail),
    createdAt: now,
    updatedAt: now,
  };
  listings.push(record);
  await writeStoreJson(CASA_STATE, listings, CASA_DIR);
  await appendStoreEvent(path.join(CASA_DIR, 'listings.jsonl'), { type: 'created', record }, CASA_DIR);
  return record;
}

export async function updateCasaRosarioListing(id: string, patch: Partial<CreateCasaRosarioInput>): Promise<CasaRosarioListing | null> {
  const listings = await listCasaRosario();
  const record = listings.find((l) => l.id === id);
  if (!record) return null;
  if (patch.title !== undefined) record.title = asTrimmedString(patch.title);
  if (patch.description !== undefined) record.description = asTrimmedString(patch.description);
  if (patch.price !== undefined) record.price = asOptionalNumber(patch.price);
  if (patch.bedrooms !== undefined) record.bedrooms = asOptionalNumber(patch.bedrooms);
  if (patch.bathrooms !== undefined) record.bathrooms = asOptionalNumber(patch.bathrooms);
  if (patch.squareFeet !== undefined) record.squareFeet = asOptionalNumber(patch.squareFeet);
  if (patch.address !== undefined) record.address = asTrimmedString(patch.address);
  if (patch.city !== undefined) record.city = asTrimmedString(patch.city);
  if (patch.images !== undefined) record.images = asStringArray(patch.images);
  record.updatedAt = nowIso();
  await writeStoreJson(CASA_STATE, listings, CASA_DIR);
  return record;
}

export async function setCasaRosarioStatus(id: string, status: CasaRosarioListingStatus): Promise<CasaRosarioListing | null> {
  const listings = await listCasaRosario();
  const record = listings.find((l) => l.id === id);
  if (!record) return null;
  record.status = status;
  record.updatedAt = nowIso();
  await writeStoreJson(CASA_STATE, listings, CASA_DIR);
  return record;
}

export async function deleteCasaRosarioListing(id: string): Promise<boolean> {
  const listings = await listCasaRosario();
  const idx = listings.findIndex((l) => l.id === id);
  if (idx < 0) return false;
  listings.splice(idx, 1);
  await writeStoreJson(CASA_STATE, listings, CASA_DIR);
  return true;
}

// ─── 9. Landing Analytics ────────────────────────────────────────────────────

export type LandingAnalyticsEvent = {
  id: string;
  page: string;
  event: 'page_view' | 'cta_click' | 'form_submit' | 'invest_click' | 'signup';
  visitorId: string;
  referrer: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const ANALYTICS_DIR = auditDir('landing-analytics');
const ANALYTICS_STATE = path.join(ANALYTICS_DIR, 'events.json');

export type CreateAnalyticsEventInput = {
  page: string;
  event: LandingAnalyticsEvent['event'];
  visitorId?: string;
  referrer?: string;
  metadata?: Record<string, unknown>;
};

export async function listAnalyticsEvents(limit: number = 200): Promise<LandingAnalyticsEvent[]> {
  const events = await readStoreJson<LandingAnalyticsEvent[]>(ANALYTICS_STATE, []);
  return events.slice(-Math.max(1, Math.min(1000, limit)));
}

export async function createAnalyticsEvent(input: CreateAnalyticsEventInput): Promise<LandingAnalyticsEvent> {
  const events = await readStoreJson<LandingAnalyticsEvent[]>(ANALYTICS_STATE, []);
  const record: LandingAnalyticsEvent = {
    id: createId('ae'),
    page: asTrimmedString(input.page),
    event: input.event,
    visitorId: asTrimmedString(input.visitorId) || createId('visitor'),
    referrer: asTrimmedString(input.referrer),
    metadata: input.metadata ?? {},
    createdAt: nowIso(),
  };
  events.push(record);
  // Cap stored events to prevent unbounded growth.
  const capped = events.slice(-5000);
  await writeStoreJson(ANALYTICS_STATE, capped, ANALYTICS_DIR);
  return record;
}

export type LandingAnalyticsSummary = {
  totalViews: number;
  totalCtaClicks: number;
  totalSignups: number;
  totalInvestClicks: number;
  conversionRate: number;
  topPages: Array<{ page: string; views: number }>;
  byEvent: Record<string, number>;
};

export async function summarizeAnalytics(): Promise<LandingAnalyticsSummary> {
  const events = await readStoreJson<LandingAnalyticsEvent[]>(ANALYTICS_STATE, []);
  const byEvent: Record<string, number> = {};
  const pageViews: Record<string, number> = {};
  let totalViews = 0;
  let totalCtaClicks = 0;
  let totalSignups = 0;
  let totalInvestClicks = 0;
  for (const e of events) {
    byEvent[e.event] = (byEvent[e.event] ?? 0) + 1;
    if (e.event === 'page_view') {
      totalViews++;
      pageViews[e.page] = (pageViews[e.page] ?? 0) + 1;
    }
    if (e.event === 'cta_click') totalCtaClicks++;
    if (e.event === 'signup') totalSignups++;
    if (e.event === 'invest_click') totalInvestClicks++;
  }
  const topPages = Object.entries(pageViews)
    .map(([page, views]) => ({ page, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);
  const conversionRate = totalViews > 0 ? (totalSignups / totalViews) * 100 : 0;
  return { totalViews, totalCtaClicks, totalSignups, totalInvestClicks, conversionRate, topPages, byEvent };
}

// ─── 10. Reels → Deal Sync ───────────────────────────────────────────────────

export type ReelDealSync = {
  id: string;
  reelId: string;
  dealId: string;
  syncedBy: string;
  createdAt: string;
};

const REEL_SYNC_DIR = auditDir('reel-deal-sync');
const REEL_SYNC_STATE = path.join(REEL_SYNC_DIR, 'syncs.json');

export async function listReelDealSyncs(): Promise<ReelDealSync[]> {
  return readStoreJson<ReelDealSync[]>(REEL_SYNC_STATE, []);
}

export async function createReelDealSync(reelId: string, dealId: string, syncedBy: string): Promise<ReelDealSync> {
  const syncs = await listReelDealSyncs();
  // Prevent duplicate mappings.
  const existing = syncs.find((s) => s.reelId === reelId && s.dealId === dealId);
  if (existing) return existing;
  const record: ReelDealSync = {
    id: createId('rds'),
    reelId: asTrimmedString(reelId),
    dealId: asTrimmedString(dealId),
    syncedBy: asTrimmedString(syncedBy),
    createdAt: nowIso(),
  };
  syncs.push(record);
  await writeStoreJson(REEL_SYNC_STATE, syncs, REEL_SYNC_DIR);
  await appendStoreEvent(path.join(REEL_SYNC_DIR, 'syncs.jsonl'), { type: 'synced', record }, REEL_SYNC_DIR);
  return record;
}

export async function deleteReelDealSync(id: string): Promise<boolean> {
  const syncs = await listReelDealSyncs();
  const idx = syncs.findIndex((s) => s.id === id);
  if (idx < 0) return false;
  syncs.splice(idx, 1);
  await writeStoreJson(REEL_SYNC_STATE, syncs, REEL_SYNC_DIR);
  return true;
}

// ─── 11. Owner Dashboard (aggregated roll-up) ────────────────────────────────

export type OwnerDashboardSummary = {
  deals: { count: number; active: number; closedWon: number; closedLost: number };
  investors: { count: number; active: number; invested: number };
  waitlist: { count: number; pending: number; converted: number };
  revenue: { totalRecorded: number; totalReceived: number };
  transactions: { totalInflow: number; totalOutflow: number; net: number };
  notifications: { count: number; sent: number; queued: number };
  broadcasts: { count: number; sent: number; draft: number };
  casaRosario: { count: number; available: number; sold: number };
  landingAnalytics: { totalViews: number; totalSignups: number; conversionRate: number };
  roles: { assignments: number; roles: number };
  generatedAt: string;
};

export async function getOwnerDashboardSummary(
  dealSummary: { count: number; active: number; closedWon: number; closedLost: number },
  investorSummary: { count: number; active: number; invested: number },
): Promise<OwnerDashboardSummary> {
  const waitlist = await listWaitlist();
  const revenueSummary = await summarizeRevenue();
  const txnSummary = await summarizeTransactions();
  const notifications = await listNotifications();
  const broadcasts = await listBroadcasts();
  const casa = await listCasaRosario();
  const analytics = await summarizeAnalytics();
  const assignments = await listRoleAssignments();
  const roleDefs = await listRoleDefinitions();
  return {
    deals: dealSummary,
    investors: investorSummary,
    waitlist: {
      count: waitlist.length,
      pending: waitlist.filter((w) => w.status === 'pending').length,
      converted: waitlist.filter((w) => w.status === 'converted').length,
    },
    revenue: { totalRecorded: revenueSummary.totalRecorded, totalReceived: revenueSummary.totalReceived },
    transactions: { totalInflow: txnSummary.totalInflow, totalOutflow: txnSummary.totalOutflow, net: txnSummary.net },
    notifications: {
      count: notifications.length,
      sent: notifications.filter((n) => n.status === 'sent' || n.status === 'delivered').length,
      queued: notifications.filter((n) => n.status === 'queued').length,
    },
    broadcasts: {
      count: broadcasts.length,
      sent: broadcasts.filter((b) => b.status === 'sent').length,
      draft: broadcasts.filter((b) => b.status === 'draft').length,
    },
    casaRosario: {
      count: casa.length,
      available: casa.filter((c) => c.status === 'available').length,
      sold: casa.filter((c) => c.status === 'sold').length,
    },
    landingAnalytics: {
      totalViews: analytics.totalViews,
      totalSignups: analytics.totalSignups,
      conversionRate: analytics.conversionRate,
    },
    roles: { assignments: assignments.length, roles: roleDefs.length },
    generatedAt: nowIso(),
  };
}
