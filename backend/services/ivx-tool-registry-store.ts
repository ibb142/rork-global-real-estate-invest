/**
 * IVX Self-Upgrade Tool System — Tool Registry (durable, owner-managed).
 *
 * After IVX is independent from Rork, IVX must be able to add, test, verify, and
 * use its own tools safely. The registry is the single source of truth for every
 * IVX-native tool: name, purpose, permissions, risk level, enabled/disabled,
 * required secrets, and test status.
 *
 * HARD HONESTY RULE (platform-wide, enforced here):
 *   - A tool is only `enabled` after it has PASSED the full test gate. Registering
 *     a tool never enables it; activation requires `testStatus === 'passed'`.
 *   - `lastSuccessfulRunAt` only advances on a REAL successful execution.
 *   - Required secrets are env-var NAMES only — never secret values.
 *
 * Durable layout (mirrors the proven ivx-investor-crm-store pattern):
 *   logs/audit/tool-registry/tools.jsonl  append-only event log
 *   logs/audit/tool-registry/tools.json   materialised current state
 *
 * Runtime-light + deterministic: only filesystem I/O, no AI/network. Fully testable.
 */
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const IVX_TOOL_REGISTRY_MARKER = 'ivx-tool-registry-2026-06-05';

/** Risk classification for a tool, lowest → highest. */
export type ToolRiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * What a tool is permitted to do. Read-only/network-free tools are inherently
 * safe; the destructive permissions gate owner approval at install time.
 */
export type ToolPermission =
  | 'read_only'
  | 'network'
  | 'filesystem_read'
  | 'filesystem_write'
  | 'database_write'
  | 'send_external'
  | 'spend_money';

/** Lifecycle of a tool's verification state. */
export type ToolTestStatus = 'untested' | 'passed' | 'failed';

/** The owner-approval categories a tool can trip (maps to the platform gates). */
export type ToolApprovalCategory =
  | 'payments'
  | 'deletes'
  | 'production_schema'
  | 'credential_changes'
  | 'external_publishing'
  | 'legal_compliance';

/** A single phase result inside a stored test report. */
export type ToolTestPhaseRecord = {
  phase: string;
  label: string;
  passed: boolean;
  detail: string;
};

/** The persisted summary of the last test run for a tool. */
export type ToolTestReport = {
  passed: boolean;
  overallLabel: string;
  ranAt: string;
  phases: ToolTestPhaseRecord[];
};

export type ToolRecord = {
  id: string;
  name: string;
  purpose: string;
  permissions: ToolPermission[];
  riskLevel: ToolRiskLevel;
  enabled: boolean;
  requiredSecrets: string[];
  testStatus: ToolTestStatus;
  /** True when this tool touches a guarded category and needs owner approval to install. */
  requiresApproval: boolean;
  approvalCategories: ToolApprovalCategory[];
  /** Where the tool definition came from (the approved catalog id, or 'self_upgrade'). */
  source: string;
  /** Last persisted test report, or null if never tested. */
  lastTestReport: ToolTestReport | null;
  /** ISO timestamp of the last REAL successful run, or null. */
  lastSuccessfulRunAt: string | null;
  /** The evidence label of the most recent run output (see ivx-tool-catalog). */
  lastRunLabel: string | null;
  /** Number of successful real executions. */
  runCount: number;
  createdAt: string;
  updatedAt: string;
};

const REGISTRY_ROOT = path.join(process.cwd(), 'logs', 'audit', 'tool-registry');
const TOOLS_STATE = path.join(REGISTRY_ROOT, 'tools.json');

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await mkdir(REGISTRY_ROOT, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), 'utf8');
}

async function appendEvent(event: Record<string, unknown>): Promise<void> {
  try {
    await mkdir(REGISTRY_ROOT, { recursive: true });
    await appendFile(path.join(REGISTRY_ROOT, 'tools.jsonl'), `${JSON.stringify(event)}\n`, 'utf8');
  } catch {
    // Forensic log is best-effort; never break a registry write on log failure.
  }
}

export type RegisterToolInput = {
  name: string;
  purpose: string;
  permissions: ToolPermission[];
  riskLevel: ToolRiskLevel;
  requiredSecrets?: string[];
  requiresApproval?: boolean;
  approvalCategories?: ToolApprovalCategory[];
  source?: string;
};

/** List all registered tools, most-recently-updated first. */
export async function listTools(): Promise<ToolRecord[]> {
  const items = await readJsonFile<ToolRecord[]>(TOOLS_STATE, []);
  return [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getTool(id: string): Promise<ToolRecord | null> {
  const items = await readJsonFile<ToolRecord[]>(TOOLS_STATE, []);
  return items.find((item) => item.id === id) ?? null;
}

export async function getToolByName(name: string): Promise<ToolRecord | null> {
  const target = name.trim().toLowerCase();
  const items = await readJsonFile<ToolRecord[]>(TOOLS_STATE, []);
  return items.find((item) => item.name.toLowerCase() === target) ?? null;
}

/**
 * Register a tool (or refresh an existing one by name). A newly registered tool
 * is ALWAYS `enabled: false` + `testStatus: 'untested'` — activation only happens
 * after the test gate passes via `recordToolTest` + `setToolEnabled`.
 */
export async function registerTool(input: RegisterToolInput): Promise<ToolRecord> {
  const items = await readJsonFile<ToolRecord[]>(TOOLS_STATE, []);
  const name = input.name.trim();
  const existingIndex = items.findIndex((item) => item.name.toLowerCase() === name.toLowerCase());
  const prior = existingIndex >= 0 ? items[existingIndex] : undefined;
  const record: ToolRecord = {
    id: prior?.id ?? createId('tool'),
    name,
    purpose: input.purpose.trim(),
    permissions: Array.from(new Set(input.permissions)),
    riskLevel: input.riskLevel,
    // Registration never auto-enables — a fresh/refreshed definition must re-pass tests.
    enabled: false,
    requiredSecrets: Array.from(new Set((input.requiredSecrets ?? []).map((s) => s.trim()).filter(Boolean))),
    testStatus: 'untested',
    requiresApproval: input.requiresApproval ?? false,
    approvalCategories: Array.from(new Set(input.approvalCategories ?? [])),
    source: input.source?.trim() || 'self_upgrade',
    lastTestReport: prior?.lastTestReport ?? null,
    lastSuccessfulRunAt: prior?.lastSuccessfulRunAt ?? null,
    lastRunLabel: prior?.lastRunLabel ?? null,
    runCount: prior?.runCount ?? 0,
    createdAt: prior?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };
  if (existingIndex >= 0) {
    items[existingIndex] = record;
  } else {
    items.push(record);
  }
  await writeJsonFile(TOOLS_STATE, items);
  await appendEvent({ type: prior ? 'reregister' : 'register', toolId: record.id, name: record.name, at: record.updatedAt });
  return record;
}

/** Persist a test report and update the tool's testStatus accordingly. */
export async function recordToolTest(id: string, report: ToolTestReport): Promise<ToolRecord | null> {
  const items = await readJsonFile<ToolRecord[]>(TOOLS_STATE, []);
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const prior = items[index]!;
  const updated: ToolRecord = {
    ...prior,
    testStatus: report.passed ? 'passed' : 'failed',
    lastTestReport: report,
    // A failed re-test must disable a previously-enabled tool.
    enabled: report.passed ? prior.enabled : false,
    updatedAt: nowIso(),
  };
  items[index] = updated;
  await writeJsonFile(TOOLS_STATE, items);
  await appendEvent({ type: 'test', toolId: id, passed: report.passed, at: updated.updatedAt });
  return updated;
}

/**
 * Enable or disable a tool. A tool can only be enabled once it has PASSED its
 * test gate — attempting to enable an untested/failed tool returns null.
 */
export async function setToolEnabled(id: string, enabled: boolean): Promise<ToolRecord | null> {
  const items = await readJsonFile<ToolRecord[]>(TOOLS_STATE, []);
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const prior = items[index]!;
  if (enabled && prior.testStatus !== 'passed') {
    // Refuse to activate a tool that has not passed verification.
    return null;
  }
  const updated: ToolRecord = { ...prior, enabled, updatedAt: nowIso() };
  items[index] = updated;
  await writeJsonFile(TOOLS_STATE, items);
  await appendEvent({ type: enabled ? 'enable' : 'disable', toolId: id, at: updated.updatedAt });
  return updated;
}

/** Record a real successful run of a tool (advances run count + last-success time). */
export async function recordToolRun(id: string, label: string): Promise<ToolRecord | null> {
  const items = await readJsonFile<ToolRecord[]>(TOOLS_STATE, []);
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) return null;
  const prior = items[index]!;
  const updated: ToolRecord = {
    ...prior,
    lastSuccessfulRunAt: nowIso(),
    lastRunLabel: label,
    runCount: prior.runCount + 1,
    updatedAt: nowIso(),
  };
  items[index] = updated;
  await writeJsonFile(TOOLS_STATE, items);
  await appendEvent({ type: 'run', toolId: id, label, at: updated.updatedAt });
  return updated;
}

/** Remove a tool from the registry. Returns true if a tool was removed. */
export async function deleteTool(id: string): Promise<boolean> {
  const items = await readJsonFile<ToolRecord[]>(TOOLS_STATE, []);
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  await writeJsonFile(TOOLS_STATE, next);
  await appendEvent({ type: 'delete', toolId: id, at: nowIso() });
  return true;
}

export type ToolRegistrySummary = {
  marker: string;
  generatedAt: string;
  total: number;
  enabled: number;
  disabled: number;
  passed: number;
  failed: number;
  untested: number;
  byRisk: Record<ToolRiskLevel, number>;
  requiringApproval: number;
  missingSecrets: number;
};

/** Read-only roll-up over the registry for the dashboard header. */
export async function summarizeTools(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ToolRegistrySummary> {
  const items = await readJsonFile<ToolRecord[]>(TOOLS_STATE, []);
  const byRisk: Record<ToolRiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  let enabled = 0;
  let passed = 0;
  let failed = 0;
  let untested = 0;
  let requiringApproval = 0;
  let missingSecrets = 0;
  for (const item of items) {
    byRisk[item.riskLevel] = (byRisk[item.riskLevel] ?? 0) + 1;
    if (item.enabled) enabled += 1;
    if (item.testStatus === 'passed') passed += 1;
    else if (item.testStatus === 'failed') failed += 1;
    else untested += 1;
    if (item.requiresApproval) requiringApproval += 1;
    if (item.requiredSecrets.some((name) => !(env[name] && String(env[name]).trim()))) {
      missingSecrets += 1;
    }
  }
  return {
    marker: IVX_TOOL_REGISTRY_MARKER,
    generatedAt: nowIso(),
    total: items.length,
    enabled,
    disabled: items.length - enabled,
    passed,
    failed,
    untested,
    byRisk,
    requiringApproval,
    missingSecrets,
  };
}
