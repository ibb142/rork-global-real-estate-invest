/**
 * IVX Execution Trace & Audit System (owner-only) — TASK 3.
 *
 * Makes every IVX action traceable. For each tool/action execution we persist a
 * single durable, append-only trace record linking together:
 *   - toolName              the tool/service that ran
 *   - requestId             the owner-AI request/trace id
 *   - timestamp             ISO-8601 capture time
 *   - taskId                the orchestrator task id (when the action belongs to one)
 *   - conversationId        the chat conversation the action originated from
 *   - rawOutput             a bounded snapshot of the real tool output
 *   - rawOutputRef          a pointer to the full raw output (file path / log key)
 *   - linkedClaim           the user-visible claim this evidence backs
 *
 * Layout (durable across process restarts / sessions), mirroring the proven
 * audit/agent-activity stores:
 *   logs/audit/execution-trace/traces.jsonl   append-only event log (source of truth)
 *   logs/audit/execution-trace/traces.json    materialised current state (fast reads)
 *
 * Retrieval works ACROSS SESSIONS because the materialised state + append-only
 * log live on disk — a fresh process reads them back. Retrieval is indexed by
 * traceId, requestId, conversationId, and taskId.
 *
 * Runtime-light + deterministic: only filesystem I/O, no AI/network. The store
 * never throws into callers — a failed persist is swallowed so recording a
 * trace can never break the action it traces.
 */
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const IVX_EXECUTION_TRACE_MARKER = 'ivx-execution-trace-2026-06-01';

/** A single, fully-linked execution trace record. */
export type ExecutionTrace = {
  /** Unique trace id. */
  id: string;
  /** The tool/service that produced this evidence. */
  toolName: string;
  /** Owner-AI request / trace id (links to diagnostics + the response). */
  requestId: string;
  /** ISO-8601 capture timestamp. */
  timestamp: string;
  /** Orchestrator task id, when the action belongs to a task (else null). */
  taskId: string | null;
  /** Chat conversation id the action originated from (else null). */
  conversationId: string | null;
  /** Bounded snapshot of the real tool output (truncated for storage safety). */
  rawOutput: string;
  /** Pointer to the full raw output (file path, log key, API response ref). */
  rawOutputRef: string | null;
  /** The user-visible claim this evidence backs (linked claim). */
  linkedClaim: string | null;
  /** Whether the bounded rawOutput was truncated from a larger original. */
  outputTruncated: boolean;
};

export type RecordExecutionTraceInput = {
  toolName: string;
  requestId: string;
  taskId?: string | null;
  conversationId?: string | null;
  rawOutput?: unknown;
  rawOutputRef?: string | null;
  linkedClaim?: string | null;
};

const DIR = path.join(process.cwd(), 'logs', 'audit', 'execution-trace');
const LOG_PATH = path.join(DIR, 'traces.jsonl');
const STATE_PATH = path.join(DIR, 'traces.json');
const MAX_TRACES = 1000;
const MAX_RAW_OUTPUT_CHARS = 8000;

let writeChain: Promise<void> = Promise.resolve();

async function ensureDir(): Promise<void> {
  await mkdir(DIR, { recursive: true });
}

async function readState(): Promise<ExecutionTrace[]> {
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ExecutionTrace[]) : [];
  } catch {
    return [];
  }
}

async function writeState(traces: ExecutionTrace[]): Promise<void> {
  await ensureDir();
  const bounded = traces.slice(0, MAX_TRACES);
  const tmp = `${STATE_PATH}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await writeFile(tmp, JSON.stringify(bounded, null, 2), 'utf8');
  await rename(tmp, STATE_PATH);
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task, task);
  writeChain = run.then(() => undefined, () => undefined);
  return run;
}

function genId(): string {
  return `trace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function trimString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Serialize an arbitrary raw tool output into a bounded, storable string.
 * Objects are JSON-stringified; everything is capped so a single huge output
 * can never bloat the trace store. Returns the bounded text + truncation flag.
 *
 * Pure (no I/O) — exported for unit testing.
 */
export function serializeRawOutput(raw: unknown): { text: string; truncated: boolean } {
  let text: string;
  if (raw === null || raw === undefined) {
    text = '';
  } else if (typeof raw === 'string') {
    text = raw;
  } else {
    try {
      text = JSON.stringify(raw, null, 2);
    } catch {
      text = String(raw);
    }
  }
  if (text.length > MAX_RAW_OUTPUT_CHARS) {
    return {
      text: `${text.slice(0, MAX_RAW_OUTPUT_CHARS)}\n…[truncated ${text.length - MAX_RAW_OUTPUT_CHARS} chars; full output at rawOutputRef]`,
      truncated: true,
    };
  }
  return { text, truncated: false };
}

/**
 * Record a single execution trace. Returns the created trace's id.
 * Never throws — persistence failures are swallowed so tracing an action
 * can never break the action itself.
 */
export async function recordExecutionTrace(input: RecordExecutionTraceInput): Promise<string> {
  const id = genId();
  const { text, truncated } = serializeRawOutput(input.rawOutput);
  const trace: ExecutionTrace = {
    id,
    toolName: trimString(input.toolName) ?? 'unknown_tool',
    requestId: trimString(input.requestId) ?? 'unknown_request',
    timestamp: new Date().toISOString(),
    taskId: trimString(input.taskId),
    conversationId: trimString(input.conversationId),
    rawOutput: text,
    rawOutputRef: trimString(input.rawOutputRef),
    linkedClaim: trimString(input.linkedClaim),
    outputTruncated: truncated,
  };
  await enqueue(async () => {
    try {
      await ensureDir();
      await appendFile(LOG_PATH, `${JSON.stringify({ at: trace.timestamp, event: 'trace', trace })}\n`, 'utf8');
      const traces = await readState();
      await writeState([trace, ...traces]);
    } catch {
      // Never break the traced action on a persistence error.
    }
  });
  return id;
}

/** List recent execution traces (newest first). Durable across sessions. */
export async function listExecutionTraces(limit: number = 100): Promise<ExecutionTrace[]> {
  const traces = await readState();
  const safe = Math.max(1, Math.min(MAX_TRACES, Math.floor(limit)));
  return traces.slice(0, safe);
}

/** Retrieve a single trace by its id (across sessions). */
export async function getExecutionTrace(id: string): Promise<ExecutionTrace | null> {
  const key = trimString(id);
  if (!key) return null;
  const traces = await readState();
  return traces.find((t) => t.id === key) ?? null;
}

/** Retrieve every trace for a given owner-AI request id (newest first). */
export async function getTracesByRequestId(requestId: string): Promise<ExecutionTrace[]> {
  const key = trimString(requestId);
  if (!key) return [];
  const traces = await readState();
  return traces.filter((t) => t.requestId === key);
}

/** Retrieve every trace for a given conversation id (newest first). */
export async function getTracesByConversationId(conversationId: string): Promise<ExecutionTrace[]> {
  const key = trimString(conversationId);
  if (!key) return [];
  const traces = await readState();
  return traces.filter((t) => t.conversationId === key);
}

/** Retrieve every trace for a given orchestrator task id (newest first). */
export async function getTracesByTaskId(taskId: string): Promise<ExecutionTrace[]> {
  const key = trimString(taskId);
  if (!key) return [];
  const traces = await readState();
  return traces.filter((t) => t.taskId === key);
}

/** Roll-up summary of the trace store for the owner dashboard. */
export type ExecutionTraceSummary = {
  marker: string;
  total: number;
  byTool: Record<string, number>;
  uniqueRequests: number;
  uniqueConversations: number;
  uniqueTasks: number;
  withLinkedClaim: number;
  oldestAt: string | null;
  newestAt: string | null;
};

/** Summarize the durable trace store (read-only). */
export async function summarizeExecutionTraces(): Promise<ExecutionTraceSummary> {
  const traces = await readState();
  const byTool: Record<string, number> = {};
  const requests = new Set<string>();
  const conversations = new Set<string>();
  const tasks = new Set<string>();
  let withLinkedClaim = 0;
  for (const t of traces) {
    byTool[t.toolName] = (byTool[t.toolName] ?? 0) + 1;
    requests.add(t.requestId);
    if (t.conversationId) conversations.add(t.conversationId);
    if (t.taskId) tasks.add(t.taskId);
    if (t.linkedClaim) withLinkedClaim += 1;
  }
  // traces are stored newest-first
  const newestAt = traces.length > 0 ? traces[0].timestamp : null;
  const oldestAt = traces.length > 0 ? traces[traces.length - 1].timestamp : null;
  return {
    marker: IVX_EXECUTION_TRACE_MARKER,
    total: traces.length,
    byTool,
    uniqueRequests: requests.size,
    uniqueConversations: conversations.size,
    uniqueTasks: tasks.size,
    withLinkedClaim,
    oldestAt,
    newestAt,
  };
}
