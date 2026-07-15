import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import {
  logDeveloperAction,
  scanForSafetyIssues,
  sanitizeForDisplay,
  type SafetyFinding,
} from '@/src/modules/ivx-developer/developerWorkspaceService';

/**
 * IVX IA Code Developer — Block 21 Approved Developer Actions.
 *
 * Owner-approved write actions for: file_patch, github_commit, supabase_sql, render_deploy.
 * Every action is proposal -> approve -> execute, never autonomous, with a persistent
 * audit log capturing approver, action type, files/routes affected, timestamp, result.
 *
 * Execution is delegated to the existing owner-authenticated backend route
 * `POST /api/ivx/developer-deploy/action` so secrets never reach the phone.
 */

export const BLOCK21_APPROVED_ACTIONS_MARKER =
  'ivx-developer-approved-actions-2026-05-16t-block21';

const ACTIONS_STORE_KEY = 'ivx.developer-workspace.approved-actions.v1';
const AUDIT_STORE_KEY = 'ivx.developer-workspace.approved-actions-audit.v1';
const MAX_ACTIONS = 100;
const MAX_AUDIT_ENTRIES = 500;

const IVX_BACKEND_ORIGIN = 'https://ivx-holdings-platform.onrender.com' as const;
const SUPABASE_CONFIRM_TEXT = 'CONFIRM_IVX_SUPABASE_MIGRATION' as const;
const RENDER_CONFIRM_TEXT = 'CONFIRM_IVX_RENDER_DEPLOY' as const;

export type ApprovedActionKind =
  | 'file_patch'
  | 'github_commit'
  | 'supabase_sql'
  | 'render_deploy';

export type ApprovedActionStatus =
  | 'proposed'
  | 'approved'
  | 'executing'
  | 'executed'
  | 'failed'
  | 'rejected';

export type ApprovedAction = {
  id: string;
  kind: ApprovedActionKind;
  status: ApprovedActionStatus;
  title: string;
  reason: string;
  createdAt: number;
  updatedAt: number;
  approver?: string;
  approvedAt?: number;
  executedAt?: number;
  /** Files/paths/routes affected — used in audit log. */
  affected: readonly string[];
  destructive: boolean;
  /** True for SQL containing DROP/DELETE/TRUNCATE; requires double-confirm. */
  doubleConfirmRequired: boolean;
  /** Owner has typed double-confirm phrase. */
  doubleConfirmed: boolean;
  /** Sanitized payload preview (diff/SQL/commit-message/deploy-options). */
  preview: string;
  /** Raw payload (sanitized) used at execute time. */
  payload: ApprovedActionPayload;
  result?: ApprovedActionResult;
};

export type ApprovedActionPayload =
  | { kind: 'file_patch'; patchId: string; filePath: string; diff: string }
  | { kind: 'github_commit'; commitMessage: string; files: readonly string[]; patchIds: readonly string[] }
  | { kind: 'supabase_sql'; sql: string; returnRows: boolean }
  | { kind: 'render_deploy'; clearCache: boolean; commitSha?: string };

export type ApprovedActionResult = {
  ok: boolean;
  httpStatus: number;
  summary: string;
  detail?: string;
  finishedAt: number;
  /** Optional post-deploy verification block. */
  postCheck?: {
    publicChatHttp?: number;
    publicChatSource?: string;
    healthHttp?: number;
  };
};

export type AuditLogEntry = {
  id: string;
  at: number;
  actionId: string;
  kind: ApprovedActionKind;
  event:
    | 'proposed'
    | 'approved'
    | 'rejected'
    | 'execute_started'
    | 'execute_succeeded'
    | 'execute_failed'
    | 'safety_blocked'
    | 'double_confirm_required';
  approver?: string;
  affected: readonly string[];
  result: 'success' | 'failed' | 'started' | 'blocked';
  detail: string;
};

// ---------- Safety / classification ----------

const DESTRUCTIVE_SQL_RX = /\b(DROP|TRUNCATE|DELETE)\b/i;

export function classifySupabaseSql(sql: string): {
  destructive: boolean;
  doubleConfirmRequired: boolean;
  findings: SafetyFinding[];
} {
  const findings = scanForSafetyIssues(sql);
  const destructive =
    findings.some((f) => f.kind === 'destructive') || DESTRUCTIVE_SQL_RX.test(sql);
  return { destructive, doubleConfirmRequired: destructive, findings };
}

export function classifyDiff(diff: string): {
  destructive: boolean;
  findings: SafetyFinding[];
} {
  const findings = scanForSafetyIssues(diff);
  const destructive = findings.some((f) => f.kind === 'destructive');
  return { destructive, findings };
}

// ---------- Storage ----------

async function readActions(): Promise<ApprovedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(ACTIONS_STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as ApprovedAction[];
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.log('[ApprovedActions] readActions failed:', (err as Error)?.message);
    return [];
  }
}

async function writeActions(list: ApprovedAction[]): Promise<void> {
  try {
    const trimmed = list.slice(0, MAX_ACTIONS);
    await AsyncStorage.setItem(ACTIONS_STORE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.log('[ApprovedActions] writeActions failed:', (err as Error)?.message);
  }
}

export async function listApprovedActions(): Promise<ApprovedAction[]> {
  const list = await readActions();
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

async function readAudit(): Promise<AuditLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(AUDIT_STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as AuditLogEntry[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function appendAudit(entry: Omit<AuditLogEntry, 'id' | 'at'>): Promise<AuditLogEntry> {
  const full: AuditLogEntry = {
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
    ...entry,
  };
  try {
    const existing = await readAudit();
    const next = [full, ...existing].slice(0, MAX_AUDIT_ENTRIES);
    await AsyncStorage.setItem(AUDIT_STORE_KEY, JSON.stringify(next));
  } catch (err) {
    console.log('[ApprovedActions] appendAudit failed:', (err as Error)?.message);
  }
  // Mirror to existing developer action log so the Patches tab also reflects it.
  void logDeveloperAction({
    actor: entry.event === 'execute_started' ? 'system' : 'owner',
    action: `block21:${entry.kind}:${entry.event}`,
    detail: `${entry.detail.slice(0, 140)} :: ${entry.affected.slice(0, 3).join(', ')}`,
  });
  return full;
}

export async function listAuditEntries(): Promise<AuditLogEntry[]> {
  const list = await readAudit();
  return [...list].sort((a, b) => b.at - a.at);
}

// ---------- Proposal ----------

export type ProposeInput =
  | {
      kind: 'file_patch';
      patchId: string;
      filePath: string;
      diff: string;
      reason: string;
    }
  | {
      kind: 'github_commit';
      commitMessage: string;
      files: readonly string[];
      patchIds?: readonly string[];
      reason: string;
    }
  | {
      kind: 'supabase_sql';
      sql: string;
      returnRows?: boolean;
      reason: string;
    }
  | {
      kind: 'render_deploy';
      clearCache?: boolean;
      commitSha?: string;
      reason: string;
    };

export async function proposeAction(input: ProposeInput): Promise<ApprovedAction> {
  const now = Date.now();
  let action: ApprovedAction;
  if (input.kind === 'file_patch') {
    const { destructive } = classifyDiff(input.diff);
    action = {
      id: `act_${now}_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'file_patch',
      status: 'proposed',
      title: `Apply patch · ${input.filePath}`,
      reason: input.reason,
      createdAt: now,
      updatedAt: now,
      affected: [input.filePath],
      destructive,
      doubleConfirmRequired: destructive,
      doubleConfirmed: false,
      preview: sanitizeForDisplay(input.diff).slice(0, 4000),
      payload: { kind: 'file_patch', patchId: input.patchId, filePath: input.filePath, diff: sanitizeForDisplay(input.diff) },
    };
  } else if (input.kind === 'github_commit') {
    action = {
      id: `act_${now}_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'github_commit',
      status: 'proposed',
      title: `Commit to GitHub · ${input.files.length} file(s)`,
      reason: input.reason,
      createdAt: now,
      updatedAt: now,
      affected: input.files,
      destructive: false,
      doubleConfirmRequired: false,
      doubleConfirmed: false,
      preview: `${input.commitMessage}\n\nFiles:\n${input.files.map((f) => `  • ${f}`).join('\n')}`,
      payload: {
        kind: 'github_commit',
        commitMessage: input.commitMessage,
        files: input.files,
        patchIds: input.patchIds ?? [],
      },
    };
  } else if (input.kind === 'supabase_sql') {
    const { destructive, doubleConfirmRequired, findings } = classifySupabaseSql(input.sql);
    if (findings.some((f) => f.kind === 'secret')) {
      await appendAudit({
        actionId: 'pre_proposal',
        kind: 'supabase_sql',
        event: 'safety_blocked',
        affected: [],
        result: 'blocked',
        detail: `Secret-shape value detected in SQL: ${findings
          .filter((f) => f.kind === 'secret')
          .map((f) => f.name)
          .join(', ')}`,
      });
      throw new Error('Secret-shaped value detected in SQL. Redact before proposing.');
    }
    action = {
      id: `act_${now}_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'supabase_sql',
      status: 'proposed',
      title: destructive ? 'Destructive Supabase SQL' : 'Supabase SQL migration',
      reason: input.reason,
      createdAt: now,
      updatedAt: now,
      affected: extractSqlTargets(input.sql),
      destructive,
      doubleConfirmRequired,
      doubleConfirmed: false,
      preview: sanitizeForDisplay(input.sql).slice(0, 6000),
      payload: { kind: 'supabase_sql', sql: input.sql, returnRows: input.returnRows ?? false },
    };
  } else {
    action = {
      id: `act_${now}_${Math.random().toString(36).slice(2, 8)}`,
      kind: 'render_deploy',
      status: 'proposed',
      title: input.clearCache ? 'Render deploy (clear cache)' : 'Render deploy',
      reason: input.reason,
      createdAt: now,
      updatedAt: now,
      affected: ['ivx-holdings-platform'],
      destructive: false,
      doubleConfirmRequired: false,
      doubleConfirmed: false,
      preview: `service: ivx-holdings-platform\nclearCache: ${input.clearCache ? 'true' : 'false'}${input.commitSha ? `\ncommit: ${input.commitSha}` : ''}`,
      payload: { kind: 'render_deploy', clearCache: input.clearCache ?? true, commitSha: input.commitSha },
    };
  }
  const list = await readActions();
  await writeActions([action, ...list]);
  await appendAudit({
    actionId: action.id,
    kind: action.kind,
    event: 'proposed',
    affected: action.affected,
    result: 'started',
    detail: `Proposed: ${action.title} :: ${action.reason.slice(0, 120)}`,
  });
  return action;
}

function extractSqlTargets(sql: string): readonly string[] {
  const targets = new Set<string>();
  const rx = /\b(?:CREATE|ALTER|DROP|TRUNCATE|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|CREATE\s+POLICY|CREATE\s+INDEX)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:TABLE\s+|POLICY\s+|INDEX\s+)?([a-zA-Z_][\w."]*)/gi;
  let match: RegExpExecArray | null;
  while ((match = rx.exec(sql)) !== null) {
    if (match[1]) targets.add(match[1].replace(/[";]/g, ''));
    if (targets.size >= 12) break;
  }
  return Array.from(targets);
}

// ---------- Approve / Reject ----------

export async function approveAction(
  id: string,
  meta: { approver: string; doubleConfirmed?: boolean },
): Promise<ApprovedAction | null> {
  const list = await readActions();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const current = list[idx];
  if (current.doubleConfirmRequired && !meta.doubleConfirmed) {
    await appendAudit({
      actionId: id,
      kind: current.kind,
      event: 'double_confirm_required',
      affected: current.affected,
      approver: meta.approver,
      result: 'blocked',
      detail: 'Double-confirm required for destructive action.',
    });
    return current;
  }
  const updated: ApprovedAction = {
    ...current,
    status: 'approved',
    approver: meta.approver,
    approvedAt: Date.now(),
    updatedAt: Date.now(),
    doubleConfirmed: meta.doubleConfirmed ?? false,
  };
  list[idx] = updated;
  await writeActions(list);
  await appendAudit({
    actionId: id,
    kind: updated.kind,
    event: 'approved',
    affected: updated.affected,
    approver: meta.approver,
    result: 'success',
    detail: `Approved: ${updated.title}`,
  });
  return updated;
}

export async function rejectAction(id: string, approver: string): Promise<ApprovedAction | null> {
  const list = await readActions();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const updated: ApprovedAction = {
    ...list[idx],
    status: 'rejected',
    updatedAt: Date.now(),
    approver,
  };
  list[idx] = updated;
  await writeActions(list);
  await appendAudit({
    actionId: id,
    kind: updated.kind,
    event: 'rejected',
    affected: updated.affected,
    approver,
    result: 'success',
    detail: `Rejected: ${updated.title}`,
  });
  return updated;
}

// ---------- Execute ----------

async function getOwnerBearer(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch (err) {
    console.log('[ApprovedActions] getOwnerBearer failed:', (err as Error)?.message);
    return null;
  }
}

async function postDeveloperDeployAction(
  body: Record<string, unknown>,
): Promise<{ httpStatus: number; payload: any | null; error?: string }> {
  const accessToken = await getOwnerBearer();
  if (!accessToken) {
    return { httpStatus: 0, payload: null, error: 'Owner session token unavailable. Sign in again.' };
  }
  try {
    const response = await fetch(`${IVX_BACKEND_ORIGIN}/api/ivx/developer-deploy/action`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text.slice(0, 400) };
    }
    return { httpStatus: response.status, payload };
  } catch (err) {
    return { httpStatus: 0, payload: null, error: `Network error: ${(err as Error)?.message ?? String(err)}` };
  }
}

async function verifyPostDeployHealth(): Promise<{ publicChatHttp?: number; publicChatSource?: string; healthHttp?: number }> {
  const out: { publicChatHttp?: number; publicChatSource?: string; healthHttp?: number } = {};
  try {
    const h = await fetch(`${IVX_BACKEND_ORIGIN}/health`, { method: 'GET' });
    out.healthHttp = h.status;
  } catch {}
  try {
    const c = await fetch(`${IVX_BACKEND_ORIGIN}/api/public/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'IVX Block 21 post-deploy verification probe.',
        sessionId: `block21-postdeploy-${Date.now()}`,
      }),
    });
    out.publicChatHttp = c.status;
    if (c.ok) {
      try {
        const j = await c.json();
        out.publicChatSource = typeof j?.source === 'string' ? j.source : undefined;
      } catch {}
    }
  } catch {}
  return out;
}

export async function executeApprovedAction(id: string): Promise<ApprovedAction | null> {
  const list = await readActions();
  const idx = list.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  const current = list[idx];
  if (current.status !== 'approved') {
    throw new Error(`Action ${id} is not approved (status=${current.status}).`);
  }
  const startedAt = Date.now();
  list[idx] = { ...current, status: 'executing', updatedAt: startedAt };
  await writeActions(list);
  await appendAudit({
    actionId: id,
    kind: current.kind,
    event: 'execute_started',
    affected: current.affected,
    approver: current.approver,
    result: 'started',
    detail: `Executing: ${current.title}`,
  });

  let result: ApprovedActionResult;
  try {
    if (current.payload.kind === 'file_patch') {
      // Phone cannot write files directly. Owner has approved the diff; the apply
      // is performed manually by the workspace promoter (Rork sync / git push).
      // We mark the action executed with a clear summary so audit reflects state.
      result = {
        ok: true,
        httpStatus: 200,
        summary: `File patch approved for manual apply :: ${current.payload.filePath}`,
        detail:
          'Approved patches are written through the GitHub commit action; the phone never edits files directly.',
        finishedAt: Date.now(),
      };
    } else if (current.payload.kind === 'github_commit') {
      const res = await postDeveloperDeployAction({
        action: 'github_commit_approved_patches',
        confirm: true,
        reason: current.reason,
        input: {
          commitMessage: current.payload.commitMessage,
          files: current.payload.files,
          patchIds: current.payload.patchIds,
        },
      });
      const ok = res.httpStatus >= 200 && res.httpStatus < 300 && res.payload?.ok !== false;
      const sha =
        res.payload?.result?.commitSha ||
        res.payload?.commitSha ||
        res.payload?.result?.sha ||
        null;
      result = {
        ok,
        httpStatus: res.httpStatus,
        summary: ok
          ? `GitHub commit ${sha ? sha.slice(0, 12) : 'queued'} :: ${current.payload.files.length} file(s)`
          : `GitHub commit failed (HTTP ${res.httpStatus})`,
        detail:
          res.error ||
          (res.payload?.error as string | undefined) ||
          (sha ? `commit: ${sha}` : undefined),
        finishedAt: Date.now(),
      };
    } else if (current.payload.kind === 'supabase_sql') {
      const res = await postDeveloperDeployAction({
        action: 'supabase_execute_sql',
        confirm: true,
        confirmText: SUPABASE_CONFIRM_TEXT,
        reason: current.reason,
        input: { sql: current.payload.sql, returnRows: current.payload.returnRows },
      });
      const ok = res.httpStatus >= 200 && res.httpStatus < 300 && res.payload?.ok !== false;
      result = {
        ok,
        httpStatus: res.httpStatus,
        summary: ok
          ? `Supabase SQL executed (${res.payload?.result?.rowCount ?? 'n/a'} rows)`
          : `Supabase SQL failed (HTTP ${res.httpStatus})`,
        detail:
          res.error ||
          (res.payload?.error as string | undefined) ||
          (typeof res.payload?.result?.command === 'string' ? `cmd: ${res.payload.result.command}` : undefined),
        finishedAt: Date.now(),
      };
    } else {
      const res = await postDeveloperDeployAction({
        action: 'render_trigger_deploy',
        confirm: true,
        confirmText: RENDER_CONFIRM_TEXT,
        clearCache: current.payload.clearCache,
        reason: current.reason,
      });
      const ok = res.httpStatus >= 200 && res.httpStatus < 300 && res.payload?.ok !== false;
      const deployId =
        res.payload?.result?.deployId ||
        res.payload?.deployId ||
        res.payload?.result?.deploy?.id ||
        null;
      const postCheck = ok ? await verifyPostDeployHealth() : undefined;
      result = {
        ok,
        httpStatus: res.httpStatus,
        summary: ok
          ? `Render deploy queued${deployId ? ` :: ${deployId}` : ''}`
          : `Render deploy failed (HTTP ${res.httpStatus})`,
        detail:
          res.error ||
          (res.payload?.error as string | undefined) ||
          (postCheck
            ? `health=${postCheck.healthHttp ?? '—'} chat=${postCheck.publicChatHttp ?? '—'} source=${postCheck.publicChatSource ?? '—'}`
            : undefined),
        finishedAt: Date.now(),
        postCheck,
      };
    }
  } catch (err) {
    result = {
      ok: false,
      httpStatus: 0,
      summary: 'Execution threw an exception',
      detail: (err as Error)?.message ?? String(err),
      finishedAt: Date.now(),
    };
  }

  const finalStatus: ApprovedActionStatus = result.ok ? 'executed' : 'failed';
  const updated: ApprovedAction = {
    ...current,
    status: finalStatus,
    executedAt: result.finishedAt,
    updatedAt: result.finishedAt,
    result,
  };
  const next = await readActions();
  const idx2 = next.findIndex((a) => a.id === id);
  if (idx2 !== -1) {
    next[idx2] = updated;
    await writeActions(next);
  }
  await appendAudit({
    actionId: id,
    kind: updated.kind,
    event: result.ok ? 'execute_succeeded' : 'execute_failed',
    affected: updated.affected,
    approver: updated.approver,
    result: result.ok ? 'success' : 'failed',
    detail: `${result.summary}${result.detail ? ` — ${result.detail}` : ''}`,
  });
  return updated;
}

export async function deleteApprovedAction(id: string): Promise<void> {
  const list = await readActions();
  await writeActions(list.filter((a) => a.id !== id));
}
