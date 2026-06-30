/**
 * IVX Incident Store — central, persistent, owner-readable record of every
 * runtime failure (frontend, backend, provider, auth, render, timeout).
 *
 * Storage strategy:
 *   - In-memory ring (fast read for diagnosis agent + health metric)
 *   - File-backed JSONL append at logs/audit/incidents.jsonl so incidents
 *     survive a single backend process restart (best-effort; safe to fail)
 *
 * No PII, no message bodies, no tokens. `requestBodyPreview` is capped and
 * sanitized; `stack` is capped to 8 KB.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export type IVXIncidentSeverity = 'info' | 'warning' | 'error' | 'critical';
export type IVXIncidentSource =
  | 'frontend'
  | 'backend'
  | 'provider'
  | 'auth'
  | 'render'
  | 'timeout'
  | 'rollback'
  | 'silent_failure'
  | 'unknown';
export type IVXIncidentStatus =
  | 'open'
  | 'diagnosing'
  | 'awaiting_approval'
  | 'fix_proposed'
  | 'staging_deploying'
  | 'staging_failed'
  | 'staging_passed'
  | 'awaiting_production_approval'
  | 'production_deploying'
  | 'production_deployed'
  | 'rolled_back'
  | 'resolved'
  | 'ignored';

export type IVXRepairLifecycleStage =
  | 'detected'
  | 'diagnosed'
  | 'staging_deploy_started'
  | 'staging_deploy_succeeded'
  | 'staging_deploy_failed'
  | 'replay_started'
  | 'replay_passed'
  | 'replay_failed'
  | 'production_approval_requested'
  | 'production_approved'
  | 'production_deploy_started'
  | 'production_deploy_succeeded'
  | 'production_deploy_failed'
  | 'production_health_ok'
  | 'production_health_failed'
  | 'auto_rollback_triggered'
  | 'fallback_served';

export type IVXRepairLifecycleEvent = {
  stage: IVXRepairLifecycleStage;
  at: string;
  note: string | null;
  actor: 'system' | 'owner';
  metadata?: Record<string, unknown>;
};

export type IVXIncidentDiagnosis = {
  rootCause: string;
  fileLine: string | null;
  patchPlan: string;
  riskLevel: 'low' | 'medium' | 'high';
  rollbackPlan: string;
  model: string | null;
  diagnosedAt: string;
};

export type IVXIncidentApproval = {
  approvedBy: string;
  approvedAt: string;
  note: string | null;
};

export type IVXIncident = {
  id: string;
  traceId: string | null;
  userId: string | null;
  conversationId: string | null;
  source: IVXIncidentSource;
  checkpoint: string | null;
  fileLine: string | null;
  message: string;
  stack: string | null;
  requestBodyPreview: string | null;
  responseStatus: number | null;
  environment: string;
  buildId: string | null;
  suggestedFix: string | null;
  severity: IVXIncidentSeverity;
  status: IVXIncidentStatus;
  diagnosis: IVXIncidentDiagnosis | null;
  approval: IVXIncidentApproval | null;
  lifecycle: IVXRepairLifecycleEvent[];
  createdAt: string;
  updatedAt: string;
};

export type IVXIncidentInput = {
  traceId?: string | null;
  userId?: string | null;
  conversationId?: string | null;
  source?: IVXIncidentSource;
  checkpoint?: string | null;
  fileLine?: string | null;
  message: string;
  stack?: string | null;
  requestBodyPreview?: string | null;
  responseStatus?: number | null;
  buildId?: string | null;
  suggestedFix?: string | null;
  severity?: IVXIncidentSeverity;
};

const MAX_ENTRIES = 500;
const STACK_CAP = 8 * 1024;
const BODY_CAP = 2 * 1024;
const STORE: Map<string, IVXIncident> = new Map();
const ORDER: string[] = [];

const INCIDENTS_FILE = path.resolve(process.cwd(), 'logs/audit/incidents.jsonl');
let restoreAttempted = false;

function nowIso(): string {
  return new Date().toISOString();
}

function makeId(): string {
  return `inc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function capString(value: string | null | undefined, cap: number): string | null {
  if (!value) return null;
  const s = String(value);
  if (s.length <= cap) return s;
  return `${s.slice(0, cap)}\n…(truncated ${s.length - cap} chars)`;
}

function sanitizeBodyPreview(value: string | null | undefined): string | null {
  if (!value) return null;
  const redacted = String(value)
    .replace(/("?(?:authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|secret|password|jwt)"?\s*[:=]\s*"?)([^"\s,}]+)/gi, '$1<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, 'Bearer <redacted>');
  return capString(redacted, BODY_CAP);
}

function currentEnvironment(): string {
  return process.env.NODE_ENV || process.env.RENDER_ENV || 'unknown';
}

function currentBuildId(): string | null {
  return (
    process.env.RENDER_GIT_COMMIT
    || process.env.GIT_COMMIT
    || process.env.IVX_BUILD_ID
    || null
  );
}

async function persistIncidentLine(entry: IVXIncident): Promise<void> {
  try {
    await fs.mkdir(path.dirname(INCIDENTS_FILE), { recursive: true });
    await fs.appendFile(INCIDENTS_FILE, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // best-effort persistence
  }
}

async function restoreIncidentsFromDisk(): Promise<void> {
  if (restoreAttempted) return;
  restoreAttempted = true;
  try {
    const raw = await fs.readFile(INCIDENTS_FILE, 'utf8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0).slice(-MAX_ENTRIES);
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as IVXIncident;
        if (parsed && typeof parsed.id === 'string') {
          STORE.set(parsed.id, parsed);
          ORDER.push(parsed.id);
        }
      } catch {
        // skip corrupt line
      }
    }
  } catch {
    // no file yet
  }
}

export async function ensureIncidentStoreReady(): Promise<void> {
  await restoreIncidentsFromDisk();
}

/**
 * Records an incident synchronously into memory and asynchronously to disk.
 * Returns the created incident immediately.
 */
export function recordIncident(input: IVXIncidentInput): IVXIncident {
  const id = makeId();
  const entry: IVXIncident = {
    id,
    traceId: input.traceId?.trim() || null,
    userId: input.userId?.trim() || null,
    conversationId: input.conversationId?.trim() || null,
    source: input.source ?? 'unknown',
    checkpoint: input.checkpoint?.trim() || null,
    fileLine: input.fileLine?.trim() || null,
    message: String(input.message || 'unknown error').slice(0, 1024),
    stack: capString(input.stack ?? null, STACK_CAP),
    requestBodyPreview: sanitizeBodyPreview(input.requestBodyPreview ?? null),
    responseStatus: typeof input.responseStatus === 'number' ? input.responseStatus : null,
    environment: currentEnvironment(),
    buildId: input.buildId ?? currentBuildId(),
    suggestedFix: input.suggestedFix ? capString(input.suggestedFix, 2048) : null,
    severity: input.severity ?? 'error',
    status: 'open',
    diagnosis: null,
    approval: null,
    lifecycle: [{ stage: 'detected', at: nowIso(), note: null, actor: 'system' }],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  STORE.set(id, entry);
  ORDER.push(id);
  while (ORDER.length > MAX_ENTRIES) {
    const oldest = ORDER.shift();
    if (oldest) STORE.delete(oldest);
  }
  void persistIncidentLine(entry);
  return entry;
}

export function listIncidents(limit: number = 50, filter?: { severity?: IVXIncidentSeverity; status?: IVXIncidentStatus; source?: IVXIncidentSource }): IVXIncident[] {
  const safeLimit = Math.max(1, Math.min(MAX_ENTRIES, Math.floor(limit)));
  const ids = ORDER.slice().reverse();
  const out: IVXIncident[] = [];
  for (const id of ids) {
    const e = STORE.get(id);
    if (!e) continue;
    if (filter?.severity && e.severity !== filter.severity) continue;
    if (filter?.status && e.status !== filter.status) continue;
    if (filter?.source && e.source !== filter.source) continue;
    out.push(e);
    if (out.length >= safeLimit) break;
  }
  return out;
}

export function getIncident(id: string): IVXIncident | null {
  return STORE.get(id) ?? null;
}

export function updateIncident(id: string, patch: Partial<Pick<IVXIncident, 'status' | 'diagnosis' | 'approval' | 'suggestedFix'>>): IVXIncident | null {
  const existing = STORE.get(id);
  if (!existing) return null;
  if (patch.status) existing.status = patch.status;
  if (patch.diagnosis !== undefined) existing.diagnosis = patch.diagnosis;
  if (patch.approval !== undefined) existing.approval = patch.approval;
  if (patch.suggestedFix !== undefined) existing.suggestedFix = patch.suggestedFix;
  existing.updatedAt = nowIso();
  void persistIncidentLine(existing);
  return existing;
}

/**
 * Append a lifecycle event to an incident. Used by the repair-policy state
 * machine to record every gate transition (stage → replay → approve → promote
 * → monitor → rollback). Best-effort persistence.
 */
export function appendLifecycleEvent(
  id: string,
  event: Omit<IVXRepairLifecycleEvent, 'at'> & { at?: string },
): IVXIncident | null {
  const existing = STORE.get(id);
  if (!existing) return null;
  const entry: IVXRepairLifecycleEvent = {
    stage: event.stage,
    at: event.at ?? nowIso(),
    note: event.note ?? null,
    actor: event.actor,
    metadata: event.metadata,
  };
  existing.lifecycle = [...(existing.lifecycle ?? []), entry];
  existing.updatedAt = nowIso();
  void persistIncidentLine(existing);
  return existing;
}

/**
 * Rolling failure rate over last `windowSize` owner-ai-style events (server source only).
 * Used by the production guard.
 */
export function getRollingFailureRate(windowSize: number = 50, sources: IVXIncidentSource[] = ['backend', 'provider', 'timeout', 'auth']): {
  total: number;
  failures: number;
  rate: number;
  windowStartedAt: string | null;
  windowEndedAt: string | null;
} {
  const ids = ORDER.slice(-windowSize);
  const entries = ids.map((i) => STORE.get(i)).filter((e): e is IVXIncident => Boolean(e));
  const relevant = entries.filter((e) => sources.includes(e.source));
  const failures = relevant.filter((e) => e.severity === 'error' || e.severity === 'critical').length;
  const total = relevant.length;
  return {
    total,
    failures,
    rate: total > 0 ? failures / total : 0,
    windowStartedAt: relevant[0]?.createdAt ?? null,
    windowEndedAt: relevant[relevant.length - 1]?.createdAt ?? null,
  };
}

export function clearIncidentsForTest(): void {
  STORE.clear();
  ORDER.length = 0;
  restoreAttempted = false;
}
