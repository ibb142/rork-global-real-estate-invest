/**
 * IVX crash-safe task state store — durable, block-structured, resumable.
 *
 * A large owner task is split into ordered BLOCKS. Each block is executed one at
 * a time and its result is persisted before the next block starts, so a crash,
 * reload, or timeout loses at most the single in-flight block — never the whole
 * task and never the original owner command.
 *
 * Durable layout (survives process restarts):
 *   logs/audit/task-orchestrator/<taskId>/task.json    → task metadata + cursor
 *   logs/audit/task-orchestrator/<taskId>/blocks.json  → full ordered block array
 *   logs/audit/task-orchestrator/<taskId>/events.jsonl → append-only crash/forensics log
 *
 * task.json holds the cursor (`currentBlockIndex`) + roll-ups (completed/failed/
 * blocked ids). blocks.json is rewritten atomically on every block update so the
 * latest status of each block is always on disk. events.jsonl is append-only so a
 * crash mid-write to blocks.json can still be reconstructed/audited.
 */
import { appendFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type IVXTaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled';

/** Real production-verification evidence captured after a deploy, so the owner
 * sees proof (endpoint + HTTP status) — not just a "verified" label. */
export type IVXBlockVerification = {
  endpoint: string;
  ok: boolean;
  httpStatus: number | null;
  changedRouteOk: boolean;
  verifiedAt: string;
};

/** Per-block lifecycle states required by the owner spec. */
export type IVXTaskBlockStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'DEPLOYED'
  | 'VERIFIED';

export const TERMINAL_BLOCK_STATUSES: ReadonlySet<IVXTaskBlockStatus> = new Set([
  'COMPLETED',
  'DEPLOYED',
  'VERIFIED',
]);

export type IVXTaskBlock = {
  id: string;
  /** Zero-based position in the ordered plan; the resume cursor. */
  index: number;
  title: string;
  goal: string;
  filesInvolved: string[];
  status: IVXTaskBlockStatus;
  codeChanges: string | null;
  /** The real unified-diff / source text written during this block, for the live coding stream. */
  codeDiff: string | null;
  validationCommand: string | null;
  testResult: string | null;
  commitHash: string | null;
  deploymentStatus: string | null;
  /** Real production-verification evidence after deploy (null until verified). */
  verification: IVXBlockVerification | null;
  blocker: string | null;
  /** Id of the next block in the plan, null on the last block. */
  nextBlockId: string | null;
  attempts: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type IVXTaskRecord = {
  id: string;
  ownerCommand: string;
  /** The full original task, copied EXACTLY at creation — never mutated. */
  originalTask: string;
  status: IVXTaskStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  /** Resume cursor — index of the block to run next. */
  currentBlockIndex: number;
  currentBlockId: string | null;
  totalBlocks: number;
  completedBlockIds: string[];
  failedBlockIds: string[];
  blockedBlockIds: string[];
  deploymentStatus: string | null;
  error: string | null;
  /** Set when a crash/interruption was detected & recovered. */
  lastCrash: { at: string; detail: string; blockId: string | null } | null;
  /** Count of crash recoveries so loops can be capped. */
  recoveryCount: number;
};

export type IVXTaskEvent = {
  at: string;
  type: string;
  blockId: string | null;
  detail: string;
};

const TASKS_ROOT = path.join(process.cwd(), 'logs', 'audit', 'task-orchestrator');

function nowIso(): string {
  return new Date().toISOString();
}

function createTaskId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `task-${crypto.randomUUID()}`;
  }
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createBlockId(taskId: string, index: number): string {
  return `${taskId}-b${index + 1}`;
}

function sanitizeTaskId(taskId: string): string {
  return taskId.replace(/[^a-zA-Z0-9_-]/g, '');
}

function taskDir(taskId: string): string {
  const safe = sanitizeTaskId(taskId);
  if (!safe) {
    throw new Error('Invalid task id.');
  }
  return path.join(TASKS_ROOT, safe);
}

function taskMetaPath(taskId: string): string {
  return path.join(taskDir(taskId), 'task.json');
}

function taskBlocksPath(taskId: string): string {
  return path.join(taskDir(taskId), 'blocks.json');
}

function taskEventsPath(taskId: string): string {
  return path.join(taskDir(taskId), 'events.jsonl');
}

/** Atomic write: write to a temp file then rename, so a crash can't corrupt the JSON. */
async function atomicWrite(filePath: string, contents: string): Promise<void> {
  const tmp = `${filePath}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  await writeFile(tmp, contents, 'utf8');
  await rename(tmp, filePath);
}

export type CreateTaskBlockInput = {
  title: string;
  goal: string;
  filesInvolved?: string[];
  validationCommand?: string | null;
};

export type CreateTaskInput = {
  ownerCommand: string;
  originalTask: string;
  blocks: CreateTaskBlockInput[];
};

export async function createTask(input: CreateTaskInput): Promise<{ task: IVXTaskRecord; blocks: IVXTaskBlock[] }> {
  const id = createTaskId();
  const createdAt = nowIso();
  const blocks: IVXTaskBlock[] = input.blocks.map((block, index) => ({
    id: createBlockId(id, index),
    index,
    title: block.title,
    goal: block.goal,
    filesInvolved: block.filesInvolved ?? [],
    status: 'PENDING',
    codeChanges: null,
    codeDiff: null,
    validationCommand: block.validationCommand ?? null,
    testResult: null,
    commitHash: null,
    deploymentStatus: null,
    verification: null,
    blocker: null,
    nextBlockId: index + 1 < input.blocks.length ? createBlockId(id, index + 1) : null,
    attempts: 0,
    error: null,
    createdAt,
    startedAt: null,
    completedAt: null,
  }));

  const task: IVXTaskRecord = {
    id,
    ownerCommand: input.ownerCommand,
    originalTask: input.originalTask,
    status: 'queued',
    createdAt,
    updatedAt: createdAt,
    completedAt: null,
    currentBlockIndex: 0,
    currentBlockId: blocks[0]?.id ?? null,
    totalBlocks: blocks.length,
    completedBlockIds: [],
    failedBlockIds: [],
    blockedBlockIds: [],
    deploymentStatus: null,
    error: null,
    lastCrash: null,
    recoveryCount: 0,
  };

  await mkdir(taskDir(id), { recursive: true });
  await atomicWrite(taskMetaPath(id), JSON.stringify(task, null, 2));
  await atomicWrite(taskBlocksPath(id), JSON.stringify(blocks, null, 2));
  await writeFile(taskEventsPath(id), '', 'utf8');
  await appendTaskEvent(id, { type: 'TASK_CREATED', blockId: null, detail: `${blocks.length} blocks planned` });
  return { task, blocks };
}

export async function getTask(taskId: string): Promise<IVXTaskRecord | null> {
  try {
    const raw = await readFile(taskMetaPath(taskId), 'utf8');
    return JSON.parse(raw) as IVXTaskRecord;
  } catch {
    return null;
  }
}

export async function getTaskBlocks(taskId: string): Promise<IVXTaskBlock[]> {
  try {
    const raw = await readFile(taskBlocksPath(taskId), 'utf8');
    const parsed = JSON.parse(raw) as IVXTaskBlock[];
    return parsed.sort((a, b) => a.index - b.index);
  } catch {
    return [];
  }
}

export async function updateTask(
  taskId: string,
  patch: Partial<IVXTaskRecord>,
): Promise<IVXTaskRecord | null> {
  const current = await getTask(taskId);
  if (!current) {
    return null;
  }
  const next: IVXTaskRecord = { ...current, ...patch, id: current.id, updatedAt: nowIso() };
  await atomicWrite(taskMetaPath(taskId), JSON.stringify(next, null, 2));
  return next;
}

/**
 * Persist a block update AND advance the task roll-ups/cursor in one durable
 * step. Returns the updated block + task so callers keep an in-memory mirror.
 */
export async function updateTaskBlock(
  taskId: string,
  blockId: string,
  patch: Partial<IVXTaskBlock>,
): Promise<{ task: IVXTaskRecord; block: IVXTaskBlock } | null> {
  const blocks = await getTaskBlocks(taskId);
  const idx = blocks.findIndex((block) => block.id === blockId);
  if (idx < 0) {
    return null;
  }
  const updatedBlock: IVXTaskBlock = { ...blocks[idx], ...patch, id: blockId, index: blocks[idx].index };
  blocks[idx] = updatedBlock;
  await atomicWrite(taskBlocksPath(taskId), JSON.stringify(blocks, null, 2));

  // Recompute roll-ups from the authoritative block array so they can never drift.
  const completedBlockIds = blocks.filter((b) => TERMINAL_BLOCK_STATUSES.has(b.status)).map((b) => b.id);
  const failedBlockIds = blocks.filter((b) => b.status === 'FAILED').map((b) => b.id);
  const blockedBlockIds = blocks.filter((b) => b.status === 'BLOCKED').map((b) => b.id);
  const firstUnfinished = blocks.find(
    (b) => !TERMINAL_BLOCK_STATUSES.has(b.status) && b.status !== 'FAILED' && b.status !== 'BLOCKED',
  );

  const task = await updateTask(taskId, {
    completedBlockIds,
    failedBlockIds,
    blockedBlockIds,
    currentBlockIndex: firstUnfinished?.index ?? blocks.length,
    currentBlockId: firstUnfinished?.id ?? null,
  });
  if (!task) {
    return null;
  }
  await appendTaskEvent(taskId, {
    type: `BLOCK_${updatedBlock.status}`,
    blockId,
    detail: updatedBlock.blocker ?? updatedBlock.error ?? updatedBlock.title,
  });
  return { task, block: updatedBlock };
}

export async function appendTaskEvent(
  taskId: string,
  input: { type: string; blockId: string | null; detail: string },
): Promise<void> {
  const event: IVXTaskEvent = {
    at: nowIso(),
    type: input.type,
    blockId: input.blockId,
    detail: input.detail,
  };
  try {
    await appendFile(taskEventsPath(taskId), `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // Forensics logging must never break execution.
  }
}

export async function readTaskEvents(taskId: string, limit: number = 200): Promise<IVXTaskEvent[]> {
  try {
    const raw = await readFile(taskEventsPath(taskId), 'utf8');
    const events = raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as IVXTaskEvent);
    return events.slice(-Math.min(Math.max(1, limit), 1000));
  } catch {
    return [];
  }
}

export async function listTasks(limit: number = 25): Promise<IVXTaskRecord[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(TASKS_ROOT);
  } catch {
    return [];
  }
  const records = await Promise.all(entries.map((entry) => getTask(entry)));
  return records
    .filter((record): record is IVXTaskRecord => record !== null)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, Math.min(Math.max(1, limit), 100));
}

/** The first block that is neither terminal, failed, nor blocked — the resume point. */
export function findResumeBlock(blocks: IVXTaskBlock[]): IVXTaskBlock | null {
  return (
    blocks.find(
      (b) => !TERMINAL_BLOCK_STATUSES.has(b.status) && b.status !== 'FAILED' && b.status !== 'BLOCKED',
    ) ?? null
  );
}
