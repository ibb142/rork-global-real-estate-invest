/**
 * IVX Gmail OAuth Draft Provider — client (owner-only).
 *
 * BLOCK 4. Thin client over the owner-gated Gmail provider API. EVERY call runs the
 * owner-session preflight FIRST via `assertOwnerSessionAccessToken()` inside
 * `ownerFetch` — if no real owner session exists it throws `OwnerSessionRequiredError`
 * (label OWNER_SESSION_REQUIRED) and NO Gmail OAuth/draft work starts. The Gmail draft
 * gate (connected → verified contact → owner approval) is enforced server-side; this
 * client surfaces the exact blocker. IVX never auto-sends and never invents a contact.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import {
  assertOwnerSessionAccessToken,
  OwnerSessionRequiredError,
} from '@/src/modules/ivx-owner-ai/services/ownerSessionPreflight';

export type GmailConnectionState = 'connected' | 'not_connected';

export type GmailProviderStatus = {
  marker: string;
  state: GmailConnectionState;
  connected: boolean;
  ownerEmail: string | null;
  scopeGranted: string[];
  lastVerifiedAt: string | null;
  tokenExpiry: string | null;
  backedByCredentials: boolean;
  missingEnv: string[];
  note: string;
};

export type GmailActionResult =
  | { ok: true; status: GmailProviderStatus; note: string }
  | {
      ok: false;
      error: 'GMAIL_OAUTH_NOT_CONFIGURED' | 'GMAIL_PROVIDER_NOT_CONNECTED';
      detail: string;
      status: GmailProviderStatus;
    };

export type GmailTestResult = {
  ok: boolean;
  canDraft: boolean;
  result: 'draft_access_ok' | 'GMAIL_PROVIDER_NOT_CONNECTED';
  status: GmailProviderStatus;
  note: string;
};

export type GmailOutreachType =
  | 'email_campaign' | 'follow_up' | 'investor_intro' | 'buyer_intro' | 'meeting_request' | 'deal_update';

export type GmailDraftRecord = {
  id: string;
  gmailDraftId: string;
  type: GmailOutreachType;
  subject: string;
  body: string;
  recipientName: string;
  recipientCompany: string;
  recipientContact: string;
  relatedDeal: string;
  outreachStatus: 'draft_created';
  autoSent: false;
  followUpDueAt: string;
  createdAt: string;
};

export type CreateGmailDraftInput = {
  type: GmailOutreachType;
  recipientName?: string;
  recipientCompany?: string;
  recipientContact?: string;
  relatedDeal?: string;
  contextNote?: string;
  senderName?: string;
  contactVerified?: boolean;
  ownerApproved?: boolean;
  followUpInDays?: number;
};

export type CreateGmailDraftResult =
  | { ok: true; draft: GmailDraftRecord; note: string }
  | {
      ok: false;
      blocker: 'GMAIL_PROVIDER_NOT_CONNECTED' | 'CONTACT_NOT_VERIFIED' | 'OWNER_APPROVAL_REQUIRED';
      detail: string;
    };

/** Re-exported so screens can detect a preflight block and route to Auth Diagnostics. */
export { OwnerSessionRequiredError };

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

/**
 * Owner-gated fetch. Runs the owner-session preflight FIRST (throws
 * OwnerSessionRequiredError when no real owner session exists). Returns the parsed
 * payload regardless of HTTP status so callers can read structured gate blockers
 * (409) without losing the body.
 */
async function ownerFetch(path: string, init: RequestInit = {}): Promise<{ payload: unknown; status: number; ok: boolean }> {
  const accessToken = await assertOwnerSessionAccessToken();
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
  return { payload, status: response.status, ok: response.ok };
}

export async function getGmailStatus(): Promise<GmailProviderStatus | null> {
  const { payload } = await ownerFetch('/api/ivx/gmail/status');
  return (readRecord(payload).status as GmailProviderStatus | undefined) ?? null;
}

export async function connectGmail(): Promise<GmailActionResult> {
  const { payload } = await ownerFetch('/api/ivx/gmail/connect', { method: 'POST', body: '{}' });
  return payload as GmailActionResult;
}

export async function disconnectGmail(): Promise<GmailActionResult> {
  const { payload } = await ownerFetch('/api/ivx/gmail/disconnect', { method: 'POST', body: '{}' });
  return payload as GmailActionResult;
}

export async function refreshGmailToken(): Promise<GmailActionResult> {
  const { payload } = await ownerFetch('/api/ivx/gmail/refresh', { method: 'POST', body: '{}' });
  return payload as GmailActionResult;
}

export async function testGmailDraftAccess(): Promise<GmailTestResult> {
  const { payload } = await ownerFetch('/api/ivx/gmail/test', { method: 'POST', body: '{}' });
  return payload as GmailTestResult;
}

export async function listGmailDrafts(): Promise<GmailDraftRecord[]> {
  const { payload } = await ownerFetch('/api/ivx/gmail/drafts');
  const drafts = readRecord(payload).drafts;
  return Array.isArray(drafts) ? (drafts as GmailDraftRecord[]) : [];
}

export async function createGmailDraft(input: CreateGmailDraftInput): Promise<CreateGmailDraftResult> {
  const { payload } = await ownerFetch('/api/ivx/gmail/draft', { method: 'POST', body: JSON.stringify(input) });
  const record = readRecord(payload);
  if (record.ok === true && record.draft) {
    return { ok: true, draft: record.draft as GmailDraftRecord, note: String(record.note ?? '') };
  }
  const blocker = record.blocker as 'GMAIL_PROVIDER_NOT_CONNECTED' | 'CONTACT_NOT_VERIFIED' | 'OWNER_APPROVAL_REQUIRED';
  return {
    ok: false,
    blocker,
    detail: String(record.error ?? record.detail ?? 'Gmail draft was blocked.'),
  };
}
