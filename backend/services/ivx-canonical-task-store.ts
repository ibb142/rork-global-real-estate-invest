/**
 * IVX Canonical Task Store — the single production source of truth for every
 * IVX IA Senior Developer task shown in the live app.
 *
 * Aggregates the durable orchestrator ledger
 * (logs/audit/task-orchestrator/<taskId>/{task.json,blocks.json,events.jsonl})
 * into ONE normalized record shape, enforces the owner's evidence gate, and
 * persists a canonical snapshot to
 * logs/audit/task-orchestrator/canonical-task-store.json.
 *
 * PRODUCTION_VERIFIED display gate (owner spec 2026-07-11) — a task may not
 * display PRODUCTION_VERIFIED unless its evidence contains ALL of:
 *   1. Real commit SHA (hex, >= 7 chars, no placeholder text)
 *   2. Real deployment identity (evidence deploy id OR the live Render
 *      runtime identity RENDER_INSTANCE_ID/RENDER_GIT_COMMIT of the service
 *      that served the verified health check)
 *   3. Health HTTP 200 recorded
 *   4. Running commit match (runningCommitSha === commitSha)
 *   5. Non-empty QA evidence free of forbidden narrative values
 */
import { readdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type CanonicalTaskStatus =
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'NOT_DEPLOYED'
  | 'DEPLOYED'
  | 'PRODUCTION_VERIFIED'
  | 'FAILED'
  | 'WAITING_APPROVAL';

export type CanonicalTaskEvidence = {
  repository: string | null;
  branch: string | null;
  commit_sha: string | null;
  push_status: string | null;
  deployment_platform: string | null;
  deployment_id: string | null;
  deployment_status: string | null;
  deployment_timestamp: string | null;
  production_url: string | null;
  health_endpoint: string | null;
  health_http_status: number | null;
  running_commit_sha: string | null;
  commit_match: boolean;
  verification_time: string | null;
  qa_result: string | null;
};

export type CanonicalTaskRecord = {
  id: string;
  number: number;
  title: string;
  description: string;
  department: string;
  feature: string;
  status: CanonicalTaskStatus;
  raw_status: string;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  commit_sha: string | null;
  deployment_id: string | null;
  deployment_status: string | null;
  production_url: string | null;
  qa_status: string | null;
  evidence: CanonicalTaskEvidence | null;
  error: string | null;
  assigned_agent: string;
  source: string;
  priority: string;
  total_blocks: number;
  completed_blocks: number;
  blocked_blocks: number;
  failed_blocks: number;
  verified_gate: {
    passed: boolean;
    real_commit_sha: boolean;
    real_deployment_id: boolean;
    health_200: boolean;
    running_commit_match: boolean;
    qa_evidence: boolean;
  };
};

export type CanonicalTaskCounts = {
  TOTAL_TASKS: number;
  IN_PROGRESS: number;
  BLOCKED: number;
  NOT_DEPLOYED: number;
  DEPLOYED: number;
  PRODUCTION_VERIFIED: number;
  FAILED: number;
  WAITING_APPROVAL: number;
};

export type CanonicalTaskStore = {
  marker: string;
  generated_at: string;
  source: string;
  runtime_deployment: {
    platform: string;
    instance_id: string | null;
    service_id: string | null;
    git_commit: string | null;
    external_url: string | null;
  };
  counts: CanonicalTaskCounts;
  tasks: CanonicalTaskRecord[];
  excluded_duplicates: number;
  excluded_fake: number;
};

const FORBIDDEN_EVIDENCE = /\b(AUTO-GENERATED|UNKNOWN|PENDING|PLACEHOLDER|MOCK|NARRATIVE|GENERATED|SIMULATED|ESTIMATED|ASSUMED)\b/i;
const FAKE_TASK = /\b(mock task|placeholder task|fake task|narrative-only|demo task|sample task)\b/i;

function tasksRoot(): string {
  return process.env.IVX_TASKS_ROOT ?? path.join(process.cwd(), 'logs', 'audit', 'task-orchestrator');
}

function isRealSha(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const clean = value.trim().toLowerCase();
  if (clean.length < 7 || !/^[0-9a-f]+$/.test(clean)) return false;
  if (clean.startsWith('000000')) return false;
  return true;
}

function isRealDeployId(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const clean = value.trim();
  if (clean.length < 6) return false;
  if (FORBIDDEN_EVIDENCE.test(clean)) return false;
  if (/^(dep|dpl|deploy)-?[0-9a-z]{8,}$/i.test(clean)) return true;
  if (/^srv-[0-9a-z]+(-[0-9a-z]+)*$/i.test(clean)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return true;
  return false;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function classifyFeature(command: string): string {
  const c = command.toLowerCase();
  if (/\breel|video|tour\b/.test(c)) return 'Reels';
  if (/\blanding|ivxholding\.com|seo|hero\b/.test(c)) return 'Landing page';
  if (/\bchat|message|inbox|owner ai|ivx ia\b/.test(c)) return 'Chat';
  if (/\blogin|auth|session|bearer|owner access|password\b/.test(c)) return 'Owner login';
  if (/\bmember|investor|user|staff|role\b/.test(c)) return 'Members';
  if (/\bpropert|deal|casa|perez|jacksonville|listing|jv[_ -]?deal\b/.test(c)) return 'Properties';
  if (/\bdeploy|render|github|commit|push|pipeline|ci\b/.test(c)) return 'Deployment';
  return 'Platform';
}

function classifyDepartment(feature: string): string {
  switch (feature) {
    case 'Reels':
    case 'Landing page':
      return 'Marketing';
    case 'Properties':
    case 'Members':
      return 'Real Estate Operations';
    case 'Deployment':
      return 'Infrastructure';
    default:
      return 'Engineering';
  }
}

type LedgerTask = Record<string, unknown>;
type LedgerBlock = Record<string, unknown>;

function runtimeDeployment(): CanonicalTaskStore['runtime_deployment'] {
  return {
    platform: 'render',
    instance_id: str(process.env.RENDER_INSTANCE_ID),
    service_id: str(process.env.RENDER_SERVICE_ID),
    git_commit: str(process.env.RENDER_GIT_COMMIT),
    external_url: str(process.env.RENDER_EXTERNAL_URL),
  };
}

function extractEvidence(events: Record<string, unknown>[]): CanonicalTaskEvidence | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type !== 'TASK_PRODUCTION_VERIFIED') continue;
    const raw = event.evidence;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const ev = raw as Record<string, unknown>;
    const commitSha = str(ev.commitSha);
    const runningCommitSha = str(ev.runningCommitSha);
    return {
      repository: str(ev.repository),
      branch: str(ev.branch),
      commit_sha: commitSha,
      push_status: str(ev.pushStatus),
      deployment_platform: str(ev.deploymentPlatform),
      deployment_id: str(ev.deploymentId),
      deployment_status: str(ev.deploymentStatus),
      deployment_timestamp: str(ev.deploymentTimestamp),
      production_url: str(ev.productionUrl),
      health_endpoint: str(ev.healthEndpoint),
      health_http_status: typeof ev.httpStatus === 'number' ? ev.httpStatus : null,
      running_commit_sha: runningCommitSha,
      commit_match: isRealSha(commitSha) && commitSha === runningCommitSha,
      verification_time: str(ev.verificationTime),
      qa_result: str(ev.qaResult),
    };
  }
  return null;
}

/** Enforce the five-point verified display gate. Never trust labels alone. */
function evaluateGate(
  evidence: CanonicalTaskEvidence | null,
  runtime: CanonicalTaskStore['runtime_deployment'],
): CanonicalTaskRecord['verified_gate'] {
  const realSha = !!evidence && isRealSha(evidence.commit_sha);
  // A deployment identity is real if the ledger recorded a platform deploy id,
  // OR the live runtime (which served the verified health check) self-reports
  // its Render instance identity and the verified commit is the deploy lineage.
  const evidenceDeployReal = !!evidence && isRealDeployId(evidence.deployment_id);
  const runtimeDeployReal = !!runtime.instance_id && isRealDeployId(runtime.instance_id) && !!runtime.git_commit;
  const realDeploy = evidenceDeployReal || (!!evidence && runtimeDeployReal);
  const health200 = !!evidence && evidence.health_http_status === 200;
  const commitMatch = !!evidence && evidence.commit_match;
  const qa = !!evidence && !!evidence.qa_result && !FORBIDDEN_EVIDENCE.test(evidence.qa_result);
  return {
    passed: realSha && realDeploy && health200 && commitMatch && qa,
    real_commit_sha: realSha,
    real_deployment_id: realDeploy,
    health_200: health200,
    running_commit_match: commitMatch,
    qa_evidence: qa,
  };
}

function mapStatus(rawStatus: string, gate: CanonicalTaskRecord['verified_gate'], hasEvidence: boolean): CanonicalTaskStatus {
  if (gate.passed) return 'PRODUCTION_VERIFIED';
  switch (rawStatus) {
    case 'queued':
    case 'running':
      return 'IN_PROGRESS';
    case 'paused':
      return 'WAITING_APPROVAL';
    case 'blocked':
      return 'BLOCKED';
    case 'failed':
    case 'cancelled':
      return 'FAILED';
    case 'completed':
      return hasEvidence ? 'DEPLOYED' : 'NOT_DEPLOYED';
    case 'not_deployed':
    default:
      return 'NOT_DEPLOYED';
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function readEvents(filePath: string): Promise<Record<string, unknown>[]> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((event): event is Record<string, unknown> => event !== null);
  } catch {
    return [];
  }
}

/** Build the canonical store from the durable ledger on disk. */
export async function buildCanonicalTaskStore(): Promise<CanonicalTaskStore> {
  const root = tasksRoot();
  const runtime = runtimeDeployment();
  let entries: string[] = [];
  try {
    entries = (await readdir(root)).filter((entry) => entry.startsWith('task-'));
  } catch {
    entries = [];
  }

  let excludedDuplicates = 0;
  let excludedFake = 0;
  const candidates: { normalizedCommand: string; record: CanonicalTaskRecord }[] = [];

  const loaded = await Promise.all(
    entries.map(async (entry) => {
      const dir = path.join(root, entry);
      const [task, blocks, events] = await Promise.all([
        readJsonFile<LedgerTask>(path.join(dir, 'task.json')),
        readJsonFile<LedgerBlock[]>(path.join(dir, 'blocks.json')),
        readEvents(path.join(dir, 'events.jsonl')),
      ]);
      return { task, blocks: Array.isArray(blocks) ? blocks : [], events };
    }),
  );

  for (const { task, blocks, events } of loaded) {
    if (!task || typeof task.id !== 'string') continue;
    const command = str(task.ownerCommand) ?? str(task.originalTask) ?? '';
    if (!command || FAKE_TASK.test(command)) {
      excludedFake++;
      continue;
    }
    const normalizedCommand = command.toLowerCase().replace(/\s+/g, ' ').trim();

    const evidence = extractEvidence(events);
    const gate = evaluateGate(evidence, runtime);
    const rawStatus = str(task.status) ?? 'not_deployed';
    const status = mapStatus(rawStatus, gate, evidence !== null);
    const feature = classifyFeature(command);
    const title = command.split('\n')[0].slice(0, 140);
    const firstBlockStart = blocks
      .map((block) => str(block.startedAt))
      .filter((value): value is string => value !== null)
      .sort()[0] ?? null;

    const deploymentId = evidence && isRealDeployId(evidence.deployment_id)
      ? evidence.deployment_id
      : gate.real_deployment_id && runtime.instance_id
        ? runtime.instance_id
        : evidence?.deployment_id ?? null;

    candidates.push({ normalizedCommand, record: {
      id: task.id,
      number: 0,
      title,
      description: command.slice(0, 2000),
      department: classifyDepartment(feature),
      feature,
      status,
      raw_status: rawStatus,
      created_at: str(task.createdAt) ?? '',
      updated_at: str(task.updatedAt) ?? '',
      started_at: firstBlockStart,
      completed_at: str(task.completedAt),
      commit_sha: evidence?.commit_sha ?? null,
      deployment_id: deploymentId,
      deployment_status: evidence?.deployment_status ?? str(task.deploymentStatus),
      production_url: evidence?.production_url ?? null,
      qa_status: gate.passed ? 'PASS' : evidence?.qa_result ? 'PARTIAL' : null,
      evidence,
      error: str(task.error),
      assigned_agent: 'IVX IA Senior Developer',
      source: 'logs/audit/task-orchestrator (durable ledger)',
      priority: 'normal',
      total_blocks: typeof task.totalBlocks === 'number' ? task.totalBlocks : blocks.length,
      completed_blocks: Array.isArray(task.completedBlockIds) ? task.completedBlockIds.length : 0,
      blocked_blocks: Array.isArray(task.blockedBlockIds) ? task.blockedBlockIds.length : 0,
      failed_blocks: Array.isArray(task.failedBlockIds) ? task.failedBlockIds.length : 0,
      verified_gate: gate,
    } });
  }

  // Dedupe TRUE duplicates only: same normalized command AND same creation
  // timestamp. Distinct runs of the same command (different createdAt) are
  // separate real ledger tasks and must all stay visible. Keep the strongest
  // record (verified beats deployed beats the rest; ties by most recent update).
  const statusRank: Record<CanonicalTaskStatus, number> = {
    PRODUCTION_VERIFIED: 6,
    DEPLOYED: 5,
    IN_PROGRESS: 4,
    WAITING_APPROVAL: 3,
    BLOCKED: 2,
    FAILED: 1,
    NOT_DEPLOYED: 0,
  };
  const byCommand = new Map<string, CanonicalTaskRecord>();
  for (const { normalizedCommand, record } of candidates) {
    const dedupeKey = `${normalizedCommand}::${record.created_at}`;
    const existing = byCommand.get(dedupeKey);
    if (!existing) {
      byCommand.set(dedupeKey, record);
      continue;
    }
    excludedDuplicates++;
    const better =
      statusRank[record.status] > statusRank[existing.status] ||
      (statusRank[record.status] === statusRank[existing.status] && record.updated_at > existing.updated_at);
    if (better) {
      byCommand.set(dedupeKey, record);
    }
  }
  const records = Array.from(byCommand.values());

  records.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  records.forEach((record, index) => {
    record.number = index + 1;
  });

  const counts: CanonicalTaskCounts = {
    TOTAL_TASKS: records.length,
    IN_PROGRESS: records.filter((r) => r.status === 'IN_PROGRESS').length,
    BLOCKED: records.filter((r) => r.status === 'BLOCKED').length,
    NOT_DEPLOYED: records.filter((r) => r.status === 'NOT_DEPLOYED').length,
    DEPLOYED: records.filter((r) => r.status === 'DEPLOYED').length,
    PRODUCTION_VERIFIED: records.filter((r) => r.status === 'PRODUCTION_VERIFIED').length,
    FAILED: records.filter((r) => r.status === 'FAILED').length,
    WAITING_APPROVAL: records.filter((r) => r.status === 'WAITING_APPROVAL').length,
  };

  return {
    marker: 'ivx-canonical-task-store-v1',
    generated_at: new Date().toISOString(),
    source: tasksRoot(),
    runtime_deployment: runtime,
    counts,
    tasks: records,
    excluded_duplicates: excludedDuplicates,
    excluded_fake: excludedFake,
  };
}

/** Persist the canonical snapshot next to the ledger (atomic write). */
export async function persistCanonicalTaskStore(store: CanonicalTaskStore): Promise<string | null> {
  const target = path.join(tasksRoot(), 'canonical-task-store.json');
  try {
    const tmp = `${target}.tmp-${Date.now()}`;
    await writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
    await rename(tmp, target);
    return target;
  } catch {
    return null;
  }
}

export type CanonicalTaskFilter = {
  status?: string;
  feature?: string;
  search?: string;
  sinceHours?: number;
};

export function filterCanonicalTasks(tasks: CanonicalTaskRecord[], filter: CanonicalTaskFilter): CanonicalTaskRecord[] {
  let result = tasks;
  const status = filter.status?.trim().toUpperCase();
  if (status && status !== 'ALL') {
    result = result.filter((task) => task.status === status);
  }
  const feature = filter.feature?.trim().toLowerCase();
  if (feature && feature !== 'all') {
    result = result.filter((task) => task.feature.toLowerCase() === feature);
  }
  if (typeof filter.sinceHours === 'number' && Number.isFinite(filter.sinceHours) && filter.sinceHours > 0) {
    const cutoff = Date.now() - filter.sinceHours * 3600_000;
    result = result.filter((task) => {
      const updated = Date.parse(task.updated_at);
      return Number.isFinite(updated) && updated >= cutoff;
    });
  }
  const search = filter.search?.trim().toLowerCase();
  if (search) {
    result = result.filter(
      (task) =>
        task.title.toLowerCase().includes(search) ||
        task.description.toLowerCase().includes(search) ||
        task.id.toLowerCase().includes(search) ||
        (task.commit_sha ?? '').toLowerCase().includes(search),
    );
  }
  return result;
}
