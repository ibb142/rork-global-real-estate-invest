/**
 * IVX Capital Deployment Platform — Automated Outreach client (owner-only).
 *
 * BLOCK 23. Thin client over the owner-gated outreach API. IVX drafts messages
 * automatically; the owner approves before any message is sent. Auth + base URL
 * reuse the same owner-session pattern as the rest of the IVX developer module.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { assertOwnerSessionAccessToken } from '@/src/modules/ivx-owner-ai/services/ownerSessionPreflight';

export type OutreachType =
  | 'email_campaign'
  | 'follow_up'
  | 'investor_intro'
  | 'buyer_intro'
  | 'meeting_request'
  | 'deal_update';

export const OUTREACH_TYPES: OutreachType[] = [
  'email_campaign', 'follow_up', 'investor_intro', 'buyer_intro', 'meeting_request', 'deal_update',
];

export const OUTREACH_TYPE_LABEL: Record<OutreachType, string> = {
  email_campaign: 'Email campaign',
  follow_up: 'Follow-up',
  investor_intro: 'Investor intro',
  buyer_intro: 'Buyer intro',
  meeting_request: 'Meeting request',
  deal_update: 'Deal update',
};

export type OutreachStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'replied';

export type OutreachEngagement = {
  opened: boolean;
  clicked: boolean;
  replied: boolean;
  meetingBooked: boolean;
};

export type OutreachMessage = {
  id: string;
  type: OutreachType;
  subject: string;
  body: string;
  recipientName: string;
  recipientCompany: string;
  recipientContact: string;
  relatedDeal: string;
  status: OutreachStatus;
  engagement: OutreachEngagement;
  aiDrafted: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  sentAt: string | null;
};

export type OutreachSummary = {
  marker: string;
  generatedAt: string;
  total: number;
  byStatus: Record<OutreachStatus, number>;
  byType: Record<OutreachType, number>;
  drafts: number;
  pendingApproval: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  meetingsBooked: number;
};

export type OutreachCreateInput = {
  type: OutreachType;
  recipientName?: string;
  recipientCompany?: string;
  recipientContact?: string;
  relatedDeal?: string;
  contextNote?: string;
  senderName?: string;
  subject?: string;
  body?: string;
  notes?: string;
};

export type OutreachDraft = { subject: string; body: string };

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
  if (!response.ok) {
    throw new Error(readError(payload, `IVX outreach request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export type OutreachListResult = {
  messages: OutreachMessage[];
  summary: OutreachSummary | null;
};

export async function listOutreachMessages(): Promise<OutreachListResult> {
  const payload = readRecord(await ownerFetch('/api/ivx/outreach'));
  return {
    messages: Array.isArray(payload.messages) ? (payload.messages as OutreachMessage[]) : [],
    summary: (payload.summary as OutreachSummary | undefined) ?? null,
  };
}

export async function previewOutreachDraft(input: OutreachCreateInput): Promise<OutreachDraft | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/outreach/draft', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.draft as OutreachDraft | undefined) ?? null;
}

export async function createOutreachMessage(input: OutreachCreateInput): Promise<OutreachMessage | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/outreach', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.message as OutreachMessage | undefined) ?? null;
}

export async function updateOutreachMessage(id: string, patch: Partial<OutreachCreateInput>): Promise<OutreachMessage | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/outreach/${encodeURIComponent(id)}`, { method: 'POST', body: JSON.stringify(patch) }),
  );
  return (payload.message as OutreachMessage | undefined) ?? null;
}

async function action(id: string, verb: string): Promise<OutreachMessage | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/outreach/${encodeURIComponent(id)}/${verb}`, { method: 'POST', body: '{}' }),
  );
  return (payload.message as OutreachMessage | undefined) ?? null;
}

export async function submitOutreachForApproval(id: string): Promise<OutreachMessage | null> {
  return action(id, 'submit');
}

export async function approveOutreachMessage(id: string): Promise<OutreachMessage | null> {
  return action(id, 'approve');
}

export async function sendOutreachMessage(id: string): Promise<OutreachMessage | null> {
  return action(id, 'send');
}

export async function recordOutreachEngagement(id: string, patch: Partial<OutreachEngagement>): Promise<OutreachMessage | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/outreach/${encodeURIComponent(id)}/engagement`, { method: 'POST', body: JSON.stringify(patch) }),
  );
  return (payload.message as OutreachMessage | undefined) ?? null;
}

export async function deleteOutreachMessage(id: string): Promise<boolean> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/outreach/${encodeURIComponent(id)}/delete`, { method: 'POST', body: '{}' }),
  );
  return payload.deleted === true;
}
