/**
 * IVX Platform Modules — client service for the 28-module platform surface.
 *
 * Thin client over the owner-gated platform-modules API. Covers waitlist,
 * settings, revenue, notifications, broadcast, roles & permissions,
 * transactions, Casa Rosario, landing analytics, reels→deal sync, and the
 * aggregated owner dashboard. IVX never fabricates data.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { getIVXAccessToken } from '@/lib/ivx-supabase-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export type WaitlistSource = 'landing_page' | 'app' | 'referral' | 'owner_entered';
export type WaitlistStatus = 'pending' | 'contacted' | 'converted' | 'declined';

export type WaitlistEntry = {
  id: string;
  name: string;
  email: string;
  phone: string;
  interest: string;
  source: WaitlistSource;
  sourceDetail: string;
  status: WaitlistStatus;
  createdAt: string;
  updatedAt: string;
};

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

export type RevenueSummary = {
  totalRecorded: number;
  totalReceived: number;
  totalPending: number;
  byType: Record<string, number>;
  count: number;
};

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

export type TransactionSummary = {
  totalInflow: number;
  totalOutflow: number;
  net: number;
  byType: Record<string, number>;
  count: number;
};

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

export type AnalyticsEventType = 'page_view' | 'cta_click' | 'form_submit' | 'invest_click' | 'signup';

export type LandingAnalyticsEvent = {
  id: string;
  page: string;
  event: AnalyticsEventType;
  visitorId: string;
  referrer: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type LandingAnalyticsSummary = {
  totalViews: number;
  totalCtaClicks: number;
  totalSignups: number;
  totalInvestClicks: number;
  conversionRate: number;
  topPages: Array<{ page: string; views: number }>;
  byEvent: Record<string, number>;
};

export type ReelDealSync = {
  id: string;
  reelId: string;
  dealId: string;
  syncedBy: string;
  createdAt: string;
};

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

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function backendBaseUrl(): string {
  return getDirectApiBaseUrl().replace(/\/+$/, '');
}

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { error: text.slice(0, 300) };
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readError(payload: unknown, fallback: string): string {
  const record = readRecord(payload);
  return typeof record.error === 'string' && record.error.trim() ? record.error.trim() : fallback;
}

async function ownerFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const accessToken = await getIVXAccessToken();
  if (!accessToken) {
    throw new Error('Owner session token unavailable. Sign in again.');
  }
  const response = await fetch(`${backendBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(readError(payload, `IVX platform request failed with HTTP ${response.status}.`));
  }
  return payload;
}

/** Public fetch — no auth token needed (waitlist signup, analytics events). */
async function publicFetch(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${backendBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(readError(payload, `IVX public request failed with HTTP ${response.status}.`));
  }
  return payload;
}

// ─── Waitlist ────────────────────────────────────────────────────────────────

export async function listWaitlist(): Promise<WaitlistEntry[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/waitlist'));
  return Array.isArray(payload.entries) ? (payload.entries as WaitlistEntry[]) : [];
}

export async function joinWaitlist(input: {
  name: string;
  email: string;
  phone?: string;
  interest?: string;
  source: WaitlistSource;
  sourceDetail?: string;
}): Promise<WaitlistEntry | null> {
  const payload = readRecord(await publicFetch('/api/ivx/waitlist', { method: 'POST', body: JSON.stringify(input) }));
  return (payload.entry as WaitlistEntry | undefined) ?? null;
}

export async function setWaitlistStatus(id: string, status: WaitlistStatus): Promise<WaitlistEntry | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/waitlist/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  );
  return (payload.entry as WaitlistEntry | undefined) ?? null;
}

export async function deleteWaitlistEntry(id: string): Promise<boolean> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/waitlist/${encodeURIComponent(id)}/delete`, { method: 'POST', body: '{}' }),
  );
  return payload.deleted === true;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function listSettings(): Promise<SettingRecord[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/settings'));
  return Array.isArray(payload.settings) ? (payload.settings as SettingRecord[]) : [];
}

export async function upsertSetting(key: SettingKey, value: string): Promise<SettingRecord | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/settings', { method: 'POST', body: JSON.stringify({ key, value }) }),
  );
  return (payload.setting as SettingRecord | undefined) ?? null;
}

// ─── Revenue ─────────────────────────────────────────────────────────────────

export type RevenueListResult = { records: RevenueRecord[]; summary: RevenueSummary | null };

export async function listRevenue(): Promise<RevenueListResult> {
  const payload = readRecord(await ownerFetch('/api/ivx/revenue'));
  return {
    records: Array.isArray(payload.records) ? (payload.records as RevenueRecord[]) : [],
    summary: (payload.summary as RevenueSummary | undefined) ?? null,
  };
}

export async function createRevenue(input: {
  description: string;
  amount: number;
  type: RevenueType;
  source: string;
  currency?: string;
  dealId?: string;
  status?: RevenueStatus;
  receivedDate?: string | null;
}): Promise<RevenueRecord | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/revenue', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.record as RevenueRecord | undefined) ?? null;
}

export async function setRevenueStatus(id: string, status: RevenueStatus): Promise<RevenueRecord | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/revenue/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  );
  return (payload.record as RevenueRecord | undefined) ?? null;
}

// ─── Notifications ───────────────────────────────────────────────────────────

export async function listNotifications(): Promise<NotificationRecord[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/notifications'));
  return Array.isArray(payload.records) ? (payload.records as NotificationRecord[]) : [];
}

export async function createNotification(input: {
  title: string;
  body: string;
  channel: NotificationChannel;
  audience?: NotificationRecord['audience'];
  targetUserId?: string;
}): Promise<NotificationRecord | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/notifications', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.record as NotificationRecord | undefined) ?? null;
}

export async function setNotificationStatus(id: string, status: NotificationStatus): Promise<NotificationRecord | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/notifications/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  );
  return (payload.record as NotificationRecord | undefined) ?? null;
}

// ─── Broadcast ───────────────────────────────────────────────────────────────

export async function listBroadcasts(): Promise<BroadcastRecord[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/broadcast'));
  return Array.isArray(payload.records) ? (payload.records as BroadcastRecord[]) : [];
}

export async function createBroadcast(input: {
  subject: string;
  message: string;
  audience?: BroadcastRecord['audience'];
  channel?: NotificationChannel;
  scheduledAt?: string | null;
}): Promise<BroadcastRecord | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/broadcast', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.record as BroadcastRecord | undefined) ?? null;
}

export async function setBroadcastStatus(id: string, status: BroadcastStatus, recipientCount?: number): Promise<BroadcastRecord | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/broadcast/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, recipientCount }),
    }),
  );
  return (payload.record as BroadcastRecord | undefined) ?? null;
}

export async function deleteBroadcast(id: string): Promise<boolean> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/broadcast/${encodeURIComponent(id)}/delete`, { method: 'POST', body: '{}' }),
  );
  return payload.deleted === true;
}

// ─── Roles & Permissions ─────────────────────────────────────────────────────

export type RolesListResult = { definitions: RoleDefinition[]; assignments: RoleAssignment[] };

export async function listRoles(): Promise<RolesListResult> {
  const payload = readRecord(await ownerFetch('/api/ivx/roles'));
  return {
    definitions: Array.isArray(payload.definitions) ? (payload.definitions as RoleDefinition[]) : [],
    assignments: Array.isArray(payload.assignments) ? (payload.assignments as RoleAssignment[]) : [],
  };
}

export async function upsertRoleDefinition(input: {
  name: RoleName;
  displayName: string;
  permissions: string[];
  isSystem?: boolean;
}): Promise<RoleDefinition | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/roles/definitions', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.definition as RoleDefinition | undefined) ?? null;
}

export async function assignRole(userId: string, userEmail: string, role: RoleName): Promise<RoleAssignment | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/roles/assign', { method: 'POST', body: JSON.stringify({ userId, userEmail, role }) }),
  );
  return (payload.assignment as RoleAssignment | undefined) ?? null;
}

export async function revokeRole(userId: string): Promise<boolean> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/roles/revoke', { method: 'POST', body: JSON.stringify({ userId }) }),
  );
  return payload.revoked === true;
}

export async function getUserPermissions(userId: string): Promise<Permission[]> {
  const payload = readRecord(await ownerFetch(`/api/ivx/roles/${encodeURIComponent(userId)}/permissions`));
  return Array.isArray(payload.permissions) ? (payload.permissions as Permission[]) : [];
}

// ─── Transactions ────────────────────────────────────────────────────────────

export type TransactionsListResult = { records: TransactionRecord[]; summary: TransactionSummary | null };

export async function listTransactions(): Promise<TransactionsListResult> {
  const payload = readRecord(await ownerFetch('/api/ivx/transactions'));
  return {
    records: Array.isArray(payload.records) ? (payload.records as TransactionRecord[]) : [],
    summary: (payload.summary as TransactionSummary | undefined) ?? null,
  };
}

export async function createTransaction(input: {
  type: TransactionType;
  amount: number;
  description: string;
  currency?: string;
  dealId?: string;
  userId?: string;
  status?: TransactionStatus;
  reference?: string;
}): Promise<TransactionRecord | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/transactions', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.record as TransactionRecord | undefined) ?? null;
}

export async function setTransactionStatus(id: string, status: TransactionStatus): Promise<TransactionRecord | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/transactions/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  );
  return (payload.record as TransactionRecord | undefined) ?? null;
}

// ─── Casa Rosario ────────────────────────────────────────────────────────────

export async function listCasaRosario(): Promise<CasaRosarioListing[]> {
  const payload = readRecord(await publicFetch('/api/ivx/casa-rosario'));
  return Array.isArray(payload.listings) ? (payload.listings as CasaRosarioListing[]) : [];
}

export async function createCasaRosarioListing(input: {
  title: string;
  source: string;
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
  sourceDetail?: string;
}): Promise<CasaRosarioListing | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/casa-rosario', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.record as CasaRosarioListing | undefined) ?? null;
}

export async function updateCasaRosarioListing(id: string, patch: Partial<{
  title: string;
  description: string;
  price: number;
  bedrooms: number;
  bathrooms: number;
  squareFeet: number;
  address: string;
  city: string;
  images: string[];
}>): Promise<CasaRosarioListing | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/casa-rosario/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(patch) }),
  );
  return (payload.record as CasaRosarioListing | undefined) ?? null;
}

export async function setCasaRosarioStatus(id: string, status: CasaRosarioListingStatus): Promise<CasaRosarioListing | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/casa-rosario/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  );
  return (payload.record as CasaRosarioListing | undefined) ?? null;
}

export async function deleteCasaRosarioListing(id: string): Promise<boolean> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/casa-rosario/${encodeURIComponent(id)}/delete`, { method: 'POST', body: '{}' }),
  );
  return payload.deleted === true;
}

// ─── Landing Analytics ───────────────────────────────────────────────────────

export type AnalyticsSummaryResult = { summary: LandingAnalyticsSummary | null; recent: LandingAnalyticsEvent[] };

export async function getAnalyticsSummary(): Promise<AnalyticsSummaryResult> {
  const payload = readRecord(await ownerFetch('/api/ivx/landing-analytics'));
  return {
    summary: (payload.summary as LandingAnalyticsSummary | undefined) ?? null,
    recent: Array.isArray(payload.recent) ? (payload.recent as LandingAnalyticsEvent[]) : [],
  };
}

export async function recordAnalyticsEvent(input: {
  page: string;
  event: AnalyticsEventType;
  visitorId?: string;
  referrer?: string;
  metadata?: Record<string, unknown>;
}): Promise<LandingAnalyticsEvent | null> {
  const payload = readRecord(
    await publicFetch('/api/ivx/landing-analytics', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.record as LandingAnalyticsEvent | undefined) ?? null;
}

// ─── Reels → Deal Sync ───────────────────────────────────────────────────────

export async function listReelDealSyncs(): Promise<ReelDealSync[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/reel-deal-sync'));
  return Array.isArray(payload.syncs) ? (payload.syncs as ReelDealSync[]) : [];
}

export async function createReelDealSync(reelId: string, dealId: string): Promise<ReelDealSync | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/reel-deal-sync', { method: 'POST', body: JSON.stringify({ reelId, dealId }) }),
  );
  return (payload.record as ReelDealSync | undefined) ?? null;
}

export async function deleteReelDealSync(id: string): Promise<boolean> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/reel-deal-sync/${encodeURIComponent(id)}/delete`, { method: 'POST', body: '{}' }),
  );
  return payload.deleted === true;
}

// ─── Owner Dashboard ─────────────────────────────────────────────────────────

export async function getOwnerDashboard(): Promise<OwnerDashboardSummary | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/owner-dashboard'));
  return (payload.dashboard as OwnerDashboardSummary | undefined) ?? null;
}
