/**
 * IVX Power Tools Core — client (owner-only management surface).
 *
 * BLOCK 98. Thin client over the owner-gated Power Tools API: Lead Capture Engine,
 * behavior-based lead scoring, the deal CRM pipeline, the Deal Packet Builder, the
 * Gmail-first outreach draft gate, and the unified Power Tools dashboard. Auth + base
 * URL reuse the same owner-session pattern as the rest of the IVX developer module.
 * IVX never fabricates a lead or a contact.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { assertOwnerSessionAccessToken } from '@/src/modules/ivx-owner-ai/services/ownerSessionPreflight';

export type LeadRole = 'buyer' | 'investor' | 'broker' | 'seller' | 'lender';
export type LeadSource = 'lead_form' | 'cta_click' | 'owner_entered' | 'crm_import';
export type LeadCtaType = 'get_deal_access' | 'request_investor_packet' | 'schedule_call' | null;
export type LeadTemperature = 'cold' | 'warm' | 'hot' | 'qualified';
export type LeadPipelineStage =
  | 'new_lead' | 'qualified' | 'contacted' | 'replied' | 'meeting_requested'
  | 'data_room_sent' | 'loi_requested' | 'soft_commitment' | 'closed' | 'lost';

export const LEAD_PIPELINE_STAGES: readonly LeadPipelineStage[] = [
  'new_lead', 'qualified', 'contacted', 'replied', 'meeting_requested',
  'data_room_sent', 'loi_requested', 'soft_commitment', 'closed', 'lost',
];

export type LeadBehaviorSignals = {
  browsed: boolean;
  returned: boolean;
  viewedDeal: boolean;
  clickedCta: boolean;
  submittedForm: boolean;
  requestedPacket: boolean;
  bookedCall: boolean;
  contactVerified: boolean;
};

export type LeadRecord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: LeadRole;
  budgetRange: string;
  preferredMarket: string;
  consent: boolean;
  ctaType: LeadCtaType;
  relatedDeal: string;
  notes: string;
  source: LeadSource;
  sourceDetail: string;
  signals: LeadBehaviorSignals;
  temperature: LeadTemperature;
  leadScore: number;
  stage: LeadPipelineStage;
  followUpDueAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeadCaptureSummary = {
  marker: string;
  generatedAt: string;
  total: number;
  byTemperature: Record<LeadTemperature, number>;
  byStage: Record<LeadPipelineStage, number>;
  byRole: Record<LeadRole, number>;
  hot: number;
  qualified: number;
  followUpsDue: number;
  closed: number;
  avgLeadScore: number;
};

export type CaptureLeadInput = {
  name: string;
  email?: string;
  phone?: string;
  role?: LeadRole;
  budgetRange?: string;
  preferredMarket?: string;
  consent?: boolean;
  ctaType?: LeadCtaType;
  relatedDeal?: string;
  notes?: string;
  source?: LeadSource;
  sourceDetail?: string;
};

export type PacketItemStatus = 'pending' | 'ready' | 'not_applicable';
export type PacketItem = {
  key: string;
  label: string;
  required: boolean;
  status: PacketItemStatus;
  reference: string;
  updatedAt: string;
};
export type DealPacket = {
  id: string;
  dealName: string;
  relatedDealId: string;
  items: PacketItem[];
  readiness: number;
  complete: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PowerToolsDashboard = {
  marker: string;
  generatedAt: string;
  counts: {
    leadsCaptured: number;
    hotLeads: number;
    qualifiedLeads: number;
    draftsCreated: number;
    emailsSent: number;
    draftsSaved: number;
    followUpsDue: number;
    meetingsRequested: number;
    dataRoomsSent: number;
    loisRequested: number;
    closedDeals: number;
  };
  emailProvider: { configured: boolean; provider: string | null; note: string };
  note: string;
};

export type OutreachType =
  | 'email_campaign' | 'follow_up' | 'investor_intro' | 'buyer_intro' | 'meeting_request' | 'deal_update';

export type PreparedDraft = {
  subject: string;
  body: string;
  sendPath: 'gmail_draft' | 'provider_send' | 'draft_only';
  provider: string | null;
  canSendAfterApproval: boolean;
  blocker: 'EMAIL_PROVIDER_NOT_CONFIGURED' | 'CONTACT_NOT_VERIFIED' | null;
  requiresOwnerApproval: boolean;
  complianceNote: string;
  note: string;
};

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
    throw new Error(readError(payload, `IVX Power Tools request failed with HTTP ${response.status}.`));
  }
  return payload;
}

export type LeadListResult = { leads: LeadRecord[]; summary: LeadCaptureSummary | null };

export async function listLeads(): Promise<LeadListResult> {
  const payload = readRecord(await ownerFetch('/api/ivx/leads'));
  return {
    leads: Array.isArray(payload.leads) ? (payload.leads as LeadRecord[]) : [],
    summary: (payload.summary as LeadCaptureSummary | undefined) ?? null,
  };
}

export async function captureLead(input: CaptureLeadInput): Promise<LeadRecord | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/leads/capture', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.lead as LeadRecord | undefined) ?? null;
}

export async function recordLeadBehavior(id: string, signals: Partial<LeadBehaviorSignals>): Promise<LeadRecord | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/leads/${encodeURIComponent(id)}/behavior`, {
      method: 'POST',
      body: JSON.stringify({ signals }),
    }),
  );
  return (payload.lead as LeadRecord | undefined) ?? null;
}

export async function setLeadStage(id: string, stage: LeadPipelineStage): Promise<LeadRecord | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/leads/${encodeURIComponent(id)}/stage`, {
      method: 'POST',
      body: JSON.stringify({ stage }),
    }),
  );
  return (payload.lead as LeadRecord | undefined) ?? null;
}

export async function setLeadFollowUp(id: string, dueInDays: number | null): Promise<LeadRecord | null> {
  const body = dueInDays === null ? { followUpDueAt: null } : { dueInDays };
  const payload = readRecord(
    await ownerFetch(`/api/ivx/leads/${encodeURIComponent(id)}/follow-up`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
  return (payload.lead as LeadRecord | undefined) ?? null;
}

export async function deleteLead(id: string): Promise<boolean> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/leads/${encodeURIComponent(id)}/delete`, { method: 'POST', body: '{}' }),
  );
  return payload.deleted === true;
}

export type DealPacketListResult = {
  packets: DealPacket[];
  summary: { marker: string; total: number; complete: number; avgReadiness: number } | null;
};

export async function listDealPackets(): Promise<DealPacketListResult> {
  const payload = readRecord(await ownerFetch('/api/ivx/deal-packets'));
  return {
    packets: Array.isArray(payload.packets) ? (payload.packets as DealPacket[]) : [],
    summary: (payload.summary as DealPacketListResult['summary']) ?? null,
  };
}

export async function createDealPacket(dealName: string, relatedDealId?: string): Promise<DealPacket | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/deal-packets', { method: 'POST', body: JSON.stringify({ dealName, relatedDealId }) }),
  );
  return (payload.packet as DealPacket | undefined) ?? null;
}

export async function setPacketItem(
  packetId: string,
  itemKey: string,
  status: PacketItemStatus,
  reference?: string,
): Promise<DealPacket | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/deal-packets/${encodeURIComponent(packetId)}/item`, {
      method: 'POST',
      body: JSON.stringify({ itemKey, status, reference }),
    }),
  );
  return (payload.packet as DealPacket | undefined) ?? null;
}

export async function deleteDealPacket(id: string): Promise<boolean> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/deal-packets/${encodeURIComponent(id)}/delete`, { method: 'POST', body: '{}' }),
  );
  return payload.deleted === true;
}

export async function getPowerToolsDashboard(): Promise<PowerToolsDashboard | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/power-tools/dashboard'));
  return (payload.dashboard as PowerToolsDashboard | undefined) ?? null;
}

export type PrepareDraftInput = {
  type: OutreachType;
  recipientName?: string;
  recipientCompany?: string;
  recipientContact?: string;
  relatedDeal?: string;
  contextNote?: string;
  senderName?: string;
  contactVerified?: boolean;
};

export async function prepareOutreachDraft(input: PrepareDraftInput): Promise<PreparedDraft | null> {
  const payload = readRecord(
    await ownerFetch('/api/ivx/power-tools/draft', { method: 'POST', body: JSON.stringify(input) }),
  );
  return (payload.draft as PreparedDraft | undefined) ?? null;
}
