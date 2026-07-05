/**
 * IVX South Florida Luxury Capital Intelligence Network client (owner-only).
 *
 * BLOCK 17 (revised). Thin client over the owner-gated capital-network API —
 * the highest-probability capital sources (buyers/investors/developers/partners)
 * for IVX's South Florida luxury deals. Auth + base URL reuse the same owner-session
 * pattern as the rest of the IVX developer module.
 */
import { getDirectApiBaseUrl } from '@/lib/api-base';
import { assertOwnerSessionAccessToken } from '@/src/modules/ivx-owner-ai/services/ownerSessionPreflight';

export type ProspectType = 'buyer' | 'investor' | 'developer' | 'partner';
export type ProspectStatus = 'new' | 'researching' | 'contacted' | 'qualified' | 'matched' | 'dismissed';

export type ProspectScores = {
  confidence: number;
  relevance: number;
  dealFit: number;
};

export type ProspectProfile = {
  id: string;
  type: ProspectType;
  segment: string;
  companyType: string;
  market: string;
  investmentFocus: string;
  publicSource: string;
  scores: ProspectScores;
  overall: number;
  rationale: string;
  evidence: string;
  signal: string;
  risks: string[];
  nextAction: string;
  matchedDealNames: string[];
  complianceNote: string;
  status: ProspectStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProspectRecommendation = {
  prospect: ProspectProfile | null;
  why: string;
  evidence: string;
  confidence: number;
  risks: string[];
  nextAction: string;
};

export type MarketPick = {
  market: string;
  prospectCount: number;
  avgFit: number;
  topSegment: string | null;
};

export type DealMatch = {
  dealName: string;
  prospects: { id: string; type: ProspectType; segment: string; dealFit: number; overall: number }[];
};

export type CapitalNetworkDashboard = {
  marker: string;
  generatedAt: string;
  totals: { total: number; buyer: number; investor: number; developer: number; partner: number };
  bestBuyerToday: ProspectRecommendation;
  bestInvestorToday: ProspectRecommendation;
  bestDeveloperToday: ProspectRecommendation;
  bestPartnerToday: ProspectRecommendation;
  bestFollowUpToday: ProspectRecommendation;
  bestMarketToday: MarketPick | null;
  buyerIntelligence: ProspectProfile[];
  investorIntelligence: ProspectProfile[];
  matches: DealMatch[];
  topProspects: ProspectProfile[];
  disclaimer: string;
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
    throw new Error(readError(payload, `IVX capital-network request failed with HTTP ${response.status}.`));
  }
  return payload;
}

// ── BLOCK 18 — Capital Outreach Intelligence ────────────────────────────────

export type OutreachPriority = 'high' | 'medium' | 'low';
export type PacketPriority = 'required' | 'recommended' | 'optional';

export type OutreachStep = {
  order: number;
  action: string;
  channel: string;
  timing: string;
};

export type OutreachStrategy = {
  prospectId: string;
  type: ProspectType;
  segment: string;
  market: string;
  priority: OutreachPriority;
  overall: number;
  primaryChannel: string;
  approach: string;
  steps: OutreachStep[];
  evidence: string;
  matchedDealNames: string[];
  complianceNote: string;
};

export type InvestorPacketItem = {
  item: string;
  reason: string;
  priority: PacketPriority;
  forSegments: string[];
};

export type BrokerIntroduction = {
  prospectId: string;
  segment: string;
  channel: string;
  why: string;
  nextAction: string;
};

export type PartnershipTarget = {
  prospectId: string;
  segment: string;
  companyType: string;
  overall: number;
  why: string;
  nextAction: string;
};

export type CapitalRaisePhase = {
  window: string;
  focus: string;
  actions: string[];
  targets: string[];
};

export type CapitalOutreachPlan = {
  marker: string;
  generatedAt: string;
  totalProspects: number;
  readiness: 'ready' | 'partial' | 'no-prospects';
  headline: string;
  outreachStrategies: OutreachStrategy[];
  investorPacket: InvestorPacketItem[];
  brokerIntroductions: BrokerIntroduction[];
  partnershipTargets: PartnershipTarget[];
  thirtyDayPlan: CapitalRaisePhase[];
  disclaimer: string;
};

/** Build the evidence-grounded capital outreach plan over the scored prospects. */
export async function getCapitalOutreachPlan(): Promise<CapitalOutreachPlan | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/capital-network/outreach'));
  return (payload.outreach as CapitalOutreachPlan | undefined) ?? null;
}

export async function getCapitalNetworkDashboard(): Promise<CapitalNetworkDashboard | null> {
  const payload = readRecord(await ownerFetch('/api/ivx/capital-network/dashboard'));
  return (payload.dashboard as CapitalNetworkDashboard | undefined) ?? null;
}

/** Run the network scan: derive prospect profiles from live jv_deals. */
export async function runCapitalNetworkScan(): Promise<{ generatedCount: number; prospects: ProspectProfile[] }> {
  const payload = readRecord(await ownerFetch('/api/ivx/capital-network/scan', { method: 'POST', body: '{}' }));
  const scan = readRecord(payload.scan);
  return {
    generatedCount: typeof scan.generatedCount === 'number' ? scan.generatedCount : 0,
    prospects: Array.isArray(scan.prospects) ? (scan.prospects as ProspectProfile[]) : [],
  };
}

export async function listProspects(): Promise<ProspectProfile[]> {
  const payload = readRecord(await ownerFetch('/api/ivx/capital-network/prospects'));
  return Array.isArray(payload.prospects) ? (payload.prospects as ProspectProfile[]) : [];
}

// ── BLOCK 93 — Capital Network Action Engine ───────────────────────────

export type ProspectActionPlan = {
  prospectId: string;
  segment: string;
  type: ProspectType;
  whyThisProspect: string;
  bestOutreachAngle: string;
  likelyObjections: string[];
  recommendedNextStep: string;
  complianceWarning: string;
  confidenceScore: number;
};

export type ResearchSourceType =
  | 'public_website'
  | 'investor_portal'
  | 'referral_network'
  | 'crm_contact'
  | 'owner_provided';

export type ResearchChannel = {
  type: ResearchSourceType;
  label: string;
  detail: string;
  verified: boolean;
};

export type ProspectResearch = {
  prospectId: string;
  segment: string;
  channels: ResearchChannel[];
  contactStatus: 'CONTACT_NOT_VERIFIED' | 'CONTACT_VERIFIED';
  note: string;
};

export type ProspectOutreachDraft = {
  prospectId: string;
  segment: string;
  outreachType: string;
  subject: string;
  emailBody: string;
  shortMessage: string;
  attachmentPlaceholder: string;
  complianceDisclaimer: string;
};

export type EmailProviderStatus = {
  configured: boolean;
  provider: string | null;
  available: string[];
  missing: { provider: string; requiredEnv: string[] }[];
  note: string;
};

export type OutreachDraftResult = {
  draft: ProspectOutreachDraft;
  outreachMessage: { id: string; status: string } | null;
  outreachError: string | null;
  emailProvider: EmailProviderStatus;
  sendStatus: 'PROVIDER_CONFIGURED' | 'EMAIL_PROVIDER_NOT_CONFIGURED';
  note: string;
};

/** Why this prospect / best angle / likely objections / next step / compliance / confidence. */
export async function getProspectActionPlan(prospectId: string): Promise<ProspectActionPlan | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/capital-network/${encodeURIComponent(prospectId)}/action-plan`, { method: 'POST', body: '{}' }),
  );
  return (payload.actionPlan as ProspectActionPlan | undefined) ?? null;
}

/** Legitimate public sourcing channels (labelled) + CONTACT_NOT_VERIFIED status. */
export async function getProspectResearch(prospectId: string): Promise<ProspectResearch | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/capital-network/${encodeURIComponent(prospectId)}/research`, { method: 'POST', body: '{}' }),
  );
  return (payload.research as ProspectResearch | undefined) ?? null;
}

/** Generate an owner-approval-gated outreach draft; reports EMAIL_PROVIDER_NOT_CONFIGURED. */
export async function createProspectOutreachDraft(prospectId: string, senderName?: string): Promise<OutreachDraftResult | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/capital-network/${encodeURIComponent(prospectId)}/outreach-draft`, {
      method: 'POST',
      body: JSON.stringify(senderName ? { senderName } : {}),
    }),
  );
  if (!payload.draft) return null;
  return {
    draft: payload.draft as ProspectOutreachDraft,
    outreachMessage: (payload.outreachMessage as { id: string; status: string } | null) ?? null,
    outreachError: typeof payload.outreachError === 'string' ? payload.outreachError : null,
    emailProvider: payload.emailProvider as EmailProviderStatus,
    sendStatus: payload.sendStatus === 'PROVIDER_CONFIGURED' ? 'PROVIDER_CONFIGURED' : 'EMAIL_PROVIDER_NOT_CONFIGURED',
    note: typeof payload.note === 'string' ? payload.note : '',
  };
}

export async function setProspectStatus(prospectId: string, status: ProspectStatus): Promise<ProspectProfile | null> {
  const payload = readRecord(
    await ownerFetch(`/api/ivx/capital-network/${encodeURIComponent(prospectId)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  );
  return (payload.prospect as ProspectProfile | undefined) ?? null;
}
