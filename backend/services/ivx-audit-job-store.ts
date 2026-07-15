/**
 * IVX enterprise audit job store — durable, resumable, indexed.
 *
 * Large audits (1–5000+ items) cannot fit in a single LLM response, and an
 * in-memory map is lost on restart. This store persists each audit job and its
 * generated chunks to disk so the engine can:
 *   - run in the background, one chunk at a time,
 *   - resume after an interruption from the persisted cursor,
 *   - serve chunks lazily (paginated) to the UI,
 *   - assemble a final export on demand.
 *
 * Layout (durable across process restarts):
 *   logs/audit/audit-jobs/<jobId>/job.json     → metadata + cursor
 *   logs/audit/audit-jobs/<jobId>/chunks.jsonl  → append-only chunk log
 */
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type IVXAuditJobStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type IVXAuditChunk = {
  /** Zero-based index, the lazy-loading cursor. */
  index: number;
  /** One-based human-facing part number. */
  partNumber: number;
  text: string;
  itemStart: number | null;
  itemEnd: number | null;
  createdAt: string;
};

export type IVXAuditJobRecord = {
  id: string;
  prompt: string;
  module: string;
  model: string | null;
  conversationId: string | null;
  /** Upper bound of items the owner asked for (e.g. 5000). null = open-ended. */
  targetItemCount: number | null;
  maxOutputTokens: number;
  status: IVXAuditJobStatus;
  /** Last completed item number — the resume cursor. */
  cursorLastItem: number;
  chunkCount: number;
  totalChars: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

const AUDIT_JOBS_ROOT = path.join(process.cwd(), 'logs', 'audit', 'audit-jobs');

function nowIso(): string {
  return new Date().toISOString();
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `audit-${crypto.randomUUID()}`;
  }
  return `audit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sanitizeJobId(jobId: string): string {
  return jobId.replace(/[^a-zA-Z0-9_-]/g, '');
}

function jobDir(jobId: string): string {
  const safe = sanitizeJobId(jobId);
  if (!safe) {
    throw new Error('Invalid audit job id.');
  }
  return path.join(AUDIT_JOBS_ROOT, safe);
}

function jobMetaPath(jobId: string): string {
  return path.join(jobDir(jobId), 'job.json');
}

function jobChunksPath(jobId: string): string {
  return path.join(jobDir(jobId), 'chunks.jsonl');
}

export type CreateAuditJobInput = {
  prompt: string;
  module?: string;
  model?: string | null;
  conversationId?: string | null;
  targetItemCount?: number | null;
  maxOutputTokens?: number;
};

export async function createAuditJob(input: CreateAuditJobInput): Promise<IVXAuditJobRecord> {
  const record: IVXAuditJobRecord = {
    id: createId(),
    prompt: input.prompt,
    module: input.module ?? 'owner-room',
    model: input.model ?? null,
    conversationId: input.conversationId ?? null,
    targetItemCount: input.targetItemCount ?? null,
    maxOutputTokens: Math.min(Math.max(input.maxOutputTokens ?? 8000, 1000), 12_000),
    status: 'queued',
    cursorLastItem: 0,
    chunkCount: 0,
    totalChars: 0,
    error: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    completedAt: null,
  };
  await mkdir(jobDir(record.id), { recursive: true });
  await writeFile(jobMetaPath(record.id), JSON.stringify(record, null, 2), 'utf8');
  await writeFile(jobChunksPath(record.id), '', 'utf8');
  return record;
}

export async function getAuditJob(jobId: string): Promise<IVXAuditJobRecord | null> {
  try {
    const raw = await readFile(jobMetaPath(jobId), 'utf8');
    return JSON.parse(raw) as IVXAuditJobRecord;
  } catch {
    return null;
  }
}

export async function updateAuditJob(
  jobId: string,
  patch: Partial<IVXAuditJobRecord>,
): Promise<IVXAuditJobRecord | null> {
  const current = await getAuditJob(jobId);
  if (!current) {
    return null;
  }
  const next: IVXAuditJobRecord = { ...current, ...patch, id: current.id, updatedAt: nowIso() };
  await writeFile(jobMetaPath(jobId), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/**
 * Append a generated chunk to the durable log and advance the persisted cursor.
 * Returns the updated job record so the engine can keep an in-memory mirror.
 */
export async function appendAuditChunk(
  jobId: string,
  input: { text: string; itemStart: number | null; itemEnd: number | null; itemCount?: number },
): Promise<{ job: IVXAuditJobRecord; chunk: IVXAuditChunk } | null> {
  const current = await getAuditJob(jobId);
  if (!current) {
    return null;
  }
  const chunk: IVXAuditChunk = {
    index: current.chunkCount,
    partNumber: current.chunkCount + 1,
    text: input.text,
    itemStart: input.itemStart,
    itemEnd: input.itemEnd,
    createdAt: nowIso(),
  };
  await appendFile(jobChunksPath(jobId), `${JSON.stringify(chunk)}\n`, 'utf8');
  // Advance the cursor robustly: if the model continued numbering normally,
  // `itemEnd` wins; if it restarted numbering low (e.g. 1–40 again), the
  // cumulative item count keeps the cursor moving so the job never stalls
  // prematurely on a 5000-item run.
  const cumulativeCursor = current.cursorLastItem + (input.itemCount ?? 0);
  const cursorLastItem = Math.max(
    current.cursorLastItem,
    input.itemEnd ?? current.cursorLastItem,
    cumulativeCursor,
  );
  const updated = await updateAuditJob(jobId, {
    chunkCount: current.chunkCount + 1,
    totalChars: current.totalChars + input.text.length,
    cursorLastItem,
  });
  return updated ? { job: updated, chunk } : null;
}

async function readAllChunks(jobId: string): Promise<IVXAuditChunk[]> {
  try {
    const raw = await readFile(jobChunksPath(jobId), 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as IVXAuditChunk)
      .sort((a, b) => a.index - b.index);
  } catch {
    return [];
  }
}

/**
 * Lazy-loading window over a job's chunks. The UI requests `offset`/`limit` so
 * a 5000-item report never has to materialise in memory all at once.
 */
export async function readAuditChunks(
  jobId: string,
  offset: number = 0,
  limit: number = 20,
): Promise<{ chunks: IVXAuditChunk[]; total: number; nextOffset: number | null }> {
  const all = await readAllChunks(jobId);
  const safeOffset = Math.max(0, Math.floor(offset));
  const safeLimit = Math.min(Math.max(1, Math.floor(limit)), 100);
  const window = all.slice(safeOffset, safeOffset + safeLimit);
  const consumed = safeOffset + window.length;
  return {
    chunks: window,
    total: all.length,
    nextOffset: consumed < all.length ? consumed : null,
  };
}

/** The tail of the most recent chunk — used to seed continuation context cheaply. */
export async function getLastChunkTail(jobId: string, tailChars: number = 1200): Promise<string> {
  const all = await readAllChunks(jobId);
  const last = all[all.length - 1];
  if (!last) {
    return '';
  }
  return last.text.slice(-Math.max(200, tailChars));
}

/** Assemble the complete report from all persisted chunks (final export). */
export async function assembleAuditReport(jobId: string): Promise<string> {
  const all = await readAllChunks(jobId);
  return all.map((chunk) => chunk.text.trim()).filter(Boolean).join('\n\n');
}

export async function listAuditJobs(limit: number = 25): Promise<IVXAuditJobRecord[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(AUDIT_JOBS_ROOT);
  } catch {
    return [];
  }
  const records = await Promise.all(entries.map((entry) => getAuditJob(entry)));
  return records
    .filter((record): record is IVXAuditJobRecord => record !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, Math.min(Math.max(1, limit), 100));
}
