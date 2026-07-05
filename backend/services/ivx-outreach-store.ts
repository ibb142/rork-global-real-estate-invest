/**
 * IVX Capital Deployment Platform — Automated Outreach store (owner-only).
 *
 * BLOCK 23. The third pillar of the Capital Deployment Platform: an automated
 * outreach system. IVX DRAFTS messages automatically (subject + body via the
 * deterministic ivx-outreach-drafter), but every draft requires OWNER APPROVAL
 * before it can move to a sent state. Engagement (sent / opened / clicked /
 * replied / meeting booked) is tracked per message.
 *
 * SAFETY (enforced here):
 *   - A message starts as `draft`. The lifecycle is:
 *       draft → pending_approval → approved → sent → replied
 *     A message can only become `approved`/`sent` through explicit owner action.
 *   - IVX never sends on its own; `markSent` only flips state once approved.
 *
 * HONESTY (enforced here):
 *   - IVX never fabricates recipient contact details. `recipientName` /
 *     `recipientContact` are owner-supplied; unknowns stay empty.
 *   - Engagement metrics are OWNER-RECORDED (no email-provider tracking is wired),
 *     so opened/clicked/replied/meetingBooked default to false and only change
 *     when the owner records them. We never invent open/click stats.
 *
 * Durable layout (mirrors the proven ivx-investor-crm-store pattern):
 *   logs/audit/outreach/messages.jsonl  append-only event log
 *   logs/audit/outreach/messages.json   materialised current state
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildOutreachDraft, type OutreachType } from './ivx-outreach-drafter';
import { auditDir } from './ivx-data-root';
import {
  isDurableStoreConfigured,
  readDurableJson,
  writeDurableJson,
  appendDurableEvent,
} from './ivx-durable-store';

export const IVX_OUTREACH_MARKER = 'ivx-outreach-2026-05-31';

export type { OutreachType } from './ivx-outreach-drafter';

/** Message lifecycle state. Sending is gated behind owner approval. */
export type OutreachStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'replied';

/** Owner-recorded engagement (no provider tracking is wired — never invented). */
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
  /** Owner-supplied contact (email/phone). Empty if unknown — never fabricated. */
  recipientContact: string;
  relatedDeal: string;
  status: OutreachStatus;
  engagement: OutreachEngagement;
  /** True when IVX generated the draft (vs. owner hand-wrote it). */
  aiDrafted: boolean;
  notes: string;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  sentAt: string | null;
};

const ROOT = auditDir('outreach');
const STATE = path.join(ROOT, 'messages.json');

const VALID_TYPES: ReadonlySet<string> = new Set([
  'email_campaign', 'follow_up', 'investor_intro', 'buyer_intro', 'meeting_request', 'deal_update',
]);

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function emptyEngagement(): OutreachEngagement {
  return { opened: false, clicked: false, replied: false, meetingBooked: false };
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
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

async function writeJsonFile(file: string, value: unknown): Promise<void> {
  if (isDurableStoreConfigured()) {
    await writeDurableJson(file, value);
    return;
  }
  await mkdir(ROOT, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

async function appendEvent(event: Record<string, unknown>): Promise<void> {
  const eventFile = path.join(ROOT, 'messages.jsonl');
  if (isDurableStoreConfigured()) {
    try {
      await appendDurableEvent(eventFile, event);
    } catch {
      // Forensic log is best-effort; never break a write on log failure.
    }
    return;
  }
  try {
    await mkdir(ROOT, { recursive: true });
    await appendFile(eventFile, `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // Forensic log is best-effort; never break a write on log failure.
  }
}

export type CreateOutreachInput = {
  type: OutreachType;
  recipientName?: string;
  recipientCompany?: string;
  recipientContact?: string;
  relatedDeal?: string;
  /** Free-text hook/context the owner provides for the draft. */
  contextNote?: string;
  /** Owner's sign-off name. */
  senderName?: string;
  /** Override the auto-draft with an owner-written subject/body. */
  subject?: string;
  body?: string;
  notes?: string;
};

export type OutreachValidation = { ok: true } | { ok: false; error: string };

/** A message needs a valid type and a recipient name or company to be meaningful. */
export function validateCreateOutreach(input: CreateOutreachInput): OutreachValidation {
  if (!VALID_TYPES.has(input.type)) {
    return { ok: false, error: 'A valid outreach type is required.' };
  }
  if (!asTrimmedString(input.recipientName) && !asTrimmedString(input.recipientCompany)) {
    return { ok: false, error: 'A recipient name or company is required — IVX never invents recipients.' };
  }
  return { ok: true };
}

/**
 * Create an outreach message. If subject/body aren't supplied, IVX drafts them
 * deterministically from the recipient + deal context. Always starts as `draft`.
 */
export async function createOutreachMessage(
  input: CreateOutreachInput,
): Promise<{ ok: true; message: OutreachMessage } | { ok: false; error: string }> {
  const validation = validateCreateOutreach(input);
  if (!validation.ok) return validation;

  const ownerSubject = asTrimmedString(input.subject);
  const ownerBody = asTrimmedString(input.body);
  const aiDrafted = !ownerSubject || !ownerBody;
  const draft = aiDrafted
    ? buildOutreachDraft({
        type: input.type,
        recipientName: input.recipientName,
        recipientCompany: input.recipientCompany,
        relatedDeal: input.relatedDeal,
        contextNote: input.contextNote,
        senderName: input.senderName,
      })
    : { subject: ownerSubject, body: ownerBody };

  const message: OutreachMessage = {
    id: createId('outreach'),
    type: input.type,
    subject: ownerSubject || draft.subject,
    body: ownerBody || draft.body,
    recipientName: asTrimmedString(input.recipientName),
    recipientCompany: asTrimmedString(input.recipientCompany),
    recipientContact: asTrimmedString(input.recipientContact),
    relatedDeal: asTrimmedString(input.relatedDeal),
    status: 'draft',
    engagement: emptyEngagement(),
    aiDrafted,
    notes: asTrimmedString(input.notes),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    approvedAt: null,
    sentAt: null,
  };

  const items = await readJsonFile<OutreachMessage[]>(STATE, []);
  items.push(message);
  await writeJsonFile(STATE, items);
  await appendEvent({ type: 'create', message, at: message.createdAt });
  return { ok: true, message };
}

export async function listOutreachMessages(): Promise<OutreachMessage[]> {
  const items = await readJsonFile<OutreachMessage[]>(STATE, []);
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getOutreachMessage(id: string): Promise<OutreachMessage | null> {
  const items = await readJsonFile<OutreachMessage[]>(STATE, []);
  return items.find((item) => item.id === id) ?? null;
}

async function mutate(
  id: string,
  apply: (message: OutreachMessage) => OutreachMessage,
  eventType: string,
): Promise<OutreachMessage | null> {
  const items = await readJsonFile<OutreachMessage[]>(STATE, []);
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const next = { ...apply(items[index]!), updatedAt: nowIso() };
  items[index] = next;
  await writeJsonFile(STATE, items);
  await appendEvent({ type: eventType, messageId: id, message: next, at: next.updatedAt });
  return next;
}

export type UpdateOutreachInput = {
  subject?: string;
  body?: string;
  recipientName?: string;
  recipientCompany?: string;
  recipientContact?: string;
  relatedDeal?: string;
  notes?: string;
};

/** Edit a draft's content/recipient. Only allowed before it is sent. */
export async function updateOutreachMessage(id: string, patch: UpdateOutreachInput): Promise<OutreachMessage | null> {
  return mutate(id, (m) => {
    if (m.status === 'sent' || m.status === 'replied') return m; // immutable once sent
    return {
      ...m,
      subject: patch.subject !== undefined ? asTrimmedString(patch.subject) || m.subject : m.subject,
      body: patch.body !== undefined ? asTrimmedString(patch.body) || m.body : m.body,
      recipientName: patch.recipientName !== undefined ? asTrimmedString(patch.recipientName) : m.recipientName,
      recipientCompany: patch.recipientCompany !== undefined ? asTrimmedString(patch.recipientCompany) : m.recipientCompany,
      recipientContact: patch.recipientContact !== undefined ? asTrimmedString(patch.recipientContact) : m.recipientContact,
      relatedDeal: patch.relatedDeal !== undefined ? asTrimmedString(patch.relatedDeal) : m.relatedDeal,
      notes: patch.notes !== undefined ? asTrimmedString(patch.notes) : m.notes,
      // Editing content reverts an approval — the owner must re-approve.
      status: m.status === 'approved' || m.status === 'pending_approval' ? 'draft' : m.status,
      approvedAt: m.status === 'approved' || m.status === 'pending_approval' ? null : m.approvedAt,
    };
  }, 'update');
}

/** Move a draft into the approval queue. */
export async function submitForApproval(id: string): Promise<OutreachMessage | null> {
  return mutate(id, (m) => (m.status === 'draft' ? { ...m, status: 'pending_approval' } : m), 'submit');
}

/** Owner approves a message for sending. Only valid from draft/pending_approval. */
export async function approveOutreachMessage(id: string): Promise<OutreachMessage | null> {
  return mutate(id, (m) => {
    if (m.status === 'draft' || m.status === 'pending_approval') {
      return { ...m, status: 'approved', approvedAt: nowIso() };
    }
    return m;
  }, 'approve');
}

/**
 * Mark an approved message as sent. SAFETY: only an `approved` message can be
 * sent — returns the message unchanged (still requiring approval) otherwise.
 */
export async function markOutreachSent(id: string): Promise<OutreachMessage | null> {
  return mutate(id, (m) => (m.status === 'approved' ? { ...m, status: 'sent', sentAt: nowIso() } : m), 'sent');
}

/** Record owner-observed engagement on a sent message. */
export async function recordEngagement(id: string, patch: Partial<OutreachEngagement>): Promise<OutreachMessage | null> {
  return mutate(id, (m) => {
    const engagement: OutreachEngagement = {
      opened: patch.opened ?? m.engagement.opened,
      clicked: patch.clicked ?? m.engagement.clicked,
      replied: patch.replied ?? m.engagement.replied,
      meetingBooked: patch.meetingBooked ?? m.engagement.meetingBooked,
    };
    // A reply implies the message reached a sent/replied state.
    const status: OutreachStatus = engagement.replied && (m.status === 'sent') ? 'replied' : m.status;
    return { ...m, engagement, status };
  }, 'engagement');
}

export async function deleteOutreachMessage(id: string): Promise<boolean> {
  const items = await readJsonFile<OutreachMessage[]>(STATE, []);
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  await writeJsonFile(STATE, next);
  await appendEvent({ type: 'delete', messageId: id, at: nowIso() });
  return true;
}

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

/** Read-only roll-up over outreach for the dashboard header. */
export async function summarizeOutreach(): Promise<OutreachSummary> {
  const items = await readJsonFile<OutreachMessage[]>(STATE, []);
  const byStatus: Record<OutreachStatus, number> = {
    draft: 0, pending_approval: 0, approved: 0, sent: 0, replied: 0,
  };
  const byType: Record<OutreachType, number> = {
    email_campaign: 0, follow_up: 0, investor_intro: 0, buyer_intro: 0, meeting_request: 0, deal_update: 0,
  };
  let sent = 0;
  let opened = 0;
  let clicked = 0;
  let replied = 0;
  let meetingsBooked = 0;

  for (const item of items) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    byType[item.type] = (byType[item.type] ?? 0) + 1;
    if (item.status === 'sent' || item.status === 'replied') sent += 1;
    if (item.engagement.opened) opened += 1;
    if (item.engagement.clicked) clicked += 1;
    if (item.engagement.replied) replied += 1;
    if (item.engagement.meetingBooked) meetingsBooked += 1;
  }

  return {
    marker: IVX_OUTREACH_MARKER,
    generatedAt: nowIso(),
    total: items.length,
    byStatus,
    byType,
    drafts: byStatus.draft,
    pendingApproval: byStatus.pending_approval,
    sent,
    opened,
    clicked,
    replied,
    meetingsBooked,
  };
}
