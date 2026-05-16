import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordIVXOwnerChatAuditEvent } from '@/src/modules/ivx-owner-ai/services';

/**
 * IVX IA Code Developer Workspace — Block 18 service layer.
 *
 * Owner-only, additive. Provides:
 *  - Static project file/route/module registry for the workspace browser.
 *  - Patch proposal store (AsyncStorage) with status: proposed | approved | applied | failed | rejected.
 *  - Safety scanner that blocks secret exposure and flags destructive ops.
 *  - Action audit hook (mirrors to existing owner chat audit pipeline).
 */

export const BLOCK18_DEVELOPER_WORKSPACE_MARKER = 'ivx-developer-workspace-2026-05-16t-block18';
const PATCH_STORE_KEY = 'ivx.developer-workspace.patches.v1';
const ACTION_LOG_KEY = 'ivx.developer-workspace.actions.v1';
const MAX_PATCHES = 50;
const MAX_ACTIONS = 200;

export type ProjectFileKind =
  | 'route'
  | 'screen'
  | 'service'
  | 'module'
  | 'backend'
  | 'migration'
  | 'config'
  | 'doc';

export type ProjectFileEntry = {
  id: string;
  path: string;
  kind: ProjectFileKind;
  category: string;
  title: string;
  summary: string;
  tags: readonly string[];
  ownerOnly?: boolean;
};

export const PROJECT_FILE_REGISTRY: readonly ProjectFileEntry[] = [
  {
    id: 'route-public-chat',
    path: 'backend/api/public-chat.ts',
    kind: 'route',
    category: 'Backend · Public Chat',
    title: 'POST /api/public/chat',
    summary:
      'Public ChatGPT route. Persists turns to Supabase, returns source=chatgpt, rate-limited, sanitized.',
    tags: ['public', 'chatgpt', 'rate-limit', 'block17'],
  },
  {
    id: 'route-public-chat-history',
    path: 'backend/api/public-chat.ts',
    kind: 'route',
    category: 'Backend · Public Chat',
    title: 'GET /api/public/chat/history',
    summary: 'Block 17 — restores public chat history per session id.',
    tags: ['public', 'history', 'block17'],
  },
  {
    id: 'route-public-chat-sessions',
    path: 'backend/api/public-chat.ts',
    kind: 'route',
    category: 'Backend · Public Chat',
    title: 'GET /api/public/chat/sessions',
    summary: 'Block 17 — lists recent sessions for the hashed visitor identity.',
    tags: ['public', 'sessions', 'block17'],
  },
  {
    id: 'route-owner-ai',
    path: 'backend/api/ivx-owner-ai.ts',
    kind: 'route',
    category: 'Backend · Owner AI',
    title: 'POST /api/ivx/owner-ai',
    summary: 'Owner-authenticated IVX AI proxy via Vercel AI Gateway. Logs to ai_usage_logs.',
    tags: ['owner', 'chatgpt', 'audit'],
    ownerOnly: true,
  },
  {
    id: 'route-owner-ai-status',
    path: 'backend/api/ivx-owner-ai.ts',
    kind: 'route',
    category: 'Backend · Owner AI',
    title: 'GET /api/ivx/owner-ai/proxy-status',
    summary: 'Owner AI proxy verification + audit logging snapshot.',
    tags: ['owner', 'health', 'audit'],
    ownerOnly: true,
  },
  {
    id: 'route-upload',
    path: 'backend/api/owner-routes.ts',
    kind: 'route',
    category: 'Backend · Uploads',
    title: 'POST /api/upload',
    summary:
      'Block 10 — owner-auth signed upload URL into ivx-chat-uploads bucket; service-role backed.',
    tags: ['upload', 'storage', 'owner', 'block10'],
    ownerOnly: true,
  },
  {
    id: 'route-transcribe',
    path: 'backend/api/owner-transcription.ts',
    kind: 'route',
    category: 'Backend · Voice',
    title: 'POST /api/audio/transcribe',
    summary: 'ElevenLabs Scribe primary, Whisper fallback. Owner-auth.',
    tags: ['voice', 'transcription', 'owner'],
    ownerOnly: true,
  },
  {
    id: 'route-supabase-health',
    path: 'backend/hono.ts',
    kind: 'route',
    category: 'Backend · Health',
    title: 'GET /api/ivx/supabase/owner-action-health',
    summary: 'Verifies Supabase service-role + Phase 1 readiness.',
    tags: ['health', 'supabase'],
    ownerOnly: true,
  },
  {
    id: 'route-developer-deploy',
    path: 'backend/hono.ts',
    kind: 'route',
    category: 'Backend · Deploy',
    title: 'POST /api/ivx/developer-deploy/action',
    summary: 'Owner-only Render trigger + guarded SQL execution. Confirm token required.',
    tags: ['deploy', 'render', 'sql', 'owner'],
    ownerOnly: true,
  },
  {
    id: 'screen-chat-hub',
    path: 'expo/app/chat-hub.tsx',
    kind: 'screen',
    category: 'App · Public ChatGPT',
    title: 'Public Chat Hub',
    summary: 'Block 17 — session-aware public ChatGPT UI with history restore.',
    tags: ['public', 'history', 'block17'],
  },
  {
    id: 'screen-ivx-chat',
    path: 'expo/app/ivx/chat.tsx',
    kind: 'screen',
    category: 'App · Owner Chat',
    title: 'IVX Owner Chat',
    summary: 'Owner chat with voice, attachments, templates, audit, realtime sync.',
    tags: ['owner', 'voice', 'attachments', 'realtime'],
    ownerOnly: true,
  },
  {
    id: 'screen-developer-workspace',
    path: 'expo/app/admin/ivx-developer-workspace.tsx',
    kind: 'screen',
    category: 'App · Developer',
    title: 'IVX IA Developer Workspace',
    summary: 'Block 18 — code workspace with files, assistant, patches, tests.',
    tags: ['owner', 'developer', 'block18'],
    ownerOnly: true,
  },
  {
    id: 'service-public-chat-supabase',
    path: 'backend/public-chat-supabase-store.ts',
    kind: 'service',
    category: 'Backend · Persistence',
    title: 'Public Chat Supabase Store',
    summary: 'Block 17 — Supabase-first public chat persistence with hashed client identity.',
    tags: ['supabase', 'persistence', 'block17'],
  },
  {
    id: 'service-public-chat-ai',
    path: 'backend/public-chat-ai.ts',
    kind: 'service',
    category: 'Backend · AI',
    title: 'Public Chat AI Generator',
    summary: 'Prompt-shape ChatGPT generator via IVX AI runtime; preserves exact proof tokens.',
    tags: ['chatgpt', 'gateway'],
  },
  {
    id: 'service-ai-reliability',
    path: 'expo/src/modules/chat/services/aiReliability.ts',
    kind: 'service',
    category: 'App · AI Reliability',
    title: 'AI Reliability Layer',
    summary: 'Per-conversation cancel, exponential backoff with jitter, retry classifier, traces.',
    tags: ['ai', 'retries', 'cancel'],
  },
  {
    id: 'service-offline-queue',
    path: 'expo/src/modules/chat/services/offlineQueueService.ts',
    kind: 'service',
    category: 'App · Offline',
    title: 'Offline Queue Service',
    summary: 'AsyncStorage-backed offline queue with reconnect auto-flush.',
    tags: ['offline', 'queue'],
  },
  {
    id: 'service-owner-audit',
    path: 'expo/src/modules/ivx-owner-ai/services/ivxOwnerChatActionAuditService.ts',
    kind: 'service',
    category: 'App · Audit',
    title: 'Owner Chat Audit Service',
    summary: 'Local-first audit with mirror to Phase 1 audit_events.',
    tags: ['audit', 'owner'],
    ownerOnly: true,
  },
  {
    id: 'migration-phase1',
    path: 'expo/deploy/supabase/ivx-platform-persistence-phase1.sql',
    kind: 'migration',
    category: 'Supabase · Migrations',
    title: 'Phase 1 Persistence Migration',
    summary: '7 owner tables + RLS + storage bucket. Idempotent.',
    tags: ['supabase', 'rls', 'phase1'],
    ownerOnly: true,
  },
  {
    id: 'config-app',
    path: 'expo/app.config.ts',
    kind: 'config',
    category: 'Config',
    title: 'Expo App Config',
    summary: 'Permissions, plugins, scheme, build profile.',
    tags: ['config', 'permissions'],
  },
  {
    id: 'config-metro',
    path: 'expo/metro.config.js',
    kind: 'config',
    category: 'Config',
    title: 'Metro Bundler Config',
    summary: 'Plain Expo config (no withRorkMetro).',
    tags: ['bundler'],
  },
  {
    id: 'doc-plan',
    path: 'PLAN.md',
    kind: 'doc',
    category: 'Docs',
    title: 'Master PLAN.md',
    summary: 'Crash-safe block-by-block project log.',
    tags: ['plan', 'history'],
  },
];

export type PatchStatus = 'proposed' | 'approved' | 'applied' | 'failed' | 'rejected';

export type PatchProposal = {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: PatchStatus;
  filePath: string;
  reason: string;
  oldBehavior: string;
  newBehavior: string;
  diff: string;
  testPlan?: string;
  rollback?: string;
  riskLevel: 'low' | 'medium' | 'high';
  source: 'manual' | 'ai_suggestion';
  destructive: boolean;
  appliedAt?: number;
  failedReason?: string;
  approver?: string;
};

export type CreatePatchInput = Omit<
  PatchProposal,
  'id' | 'createdAt' | 'updatedAt' | 'status' | 'destructive' | 'appliedAt' | 'failedReason' | 'approver'
> & { destructive?: boolean };

export type DeveloperActionLog = {
  id: string;
  at: number;
  actor: 'owner' | 'ai' | 'system';
  action: string;
  detail: string;
  patchId?: string;
};

// ---------- Safety scanner ----------

const SECRET_PATTERNS: readonly { name: string; rx: RegExp }[] = [
  { name: 'AWS access key', rx: /AKIA[0-9A-Z]{16}/g },
  { name: 'Vercel AI Gateway key', rx: /vck_[A-Za-z0-9_-]{20,}/g },
  { name: 'OpenAI key', rx: /sk-[A-Za-z0-9_-]{20,}/g },
  { name: 'Supabase service-role JWT', rx: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g },
  { name: 'GitHub token', rx: /gh[pousr]_[A-Za-z0-9]{30,}/g },
  { name: 'Render API key', rx: /rnd_[A-Za-z0-9]{20,}/g },
];

const DESTRUCTIVE_PATTERNS: readonly { name: string; rx: RegExp }[] = [
  { name: 'DROP TABLE', rx: /\bDROP\s+TABLE\b/i },
  { name: 'DROP SCHEMA', rx: /\bDROP\s+SCHEMA\b/i },
  { name: 'TRUNCATE', rx: /\bTRUNCATE\b/i },
  { name: 'DELETE without WHERE', rx: /\bDELETE\s+FROM\s+\w+\s*;/i },
  { name: 'rm -rf', rx: /rm\s+-rf\b/i },
  { name: 'force push', rx: /git\s+push\s+(--force|-f)\b/i },
];

export type SafetyFinding = {
  kind: 'secret' | 'destructive';
  name: string;
  match: string;
};

export function scanForSafetyIssues(text: string): SafetyFinding[] {
  const findings: SafetyFinding[] = [];
  if (!text) return findings;
  for (const p of SECRET_PATTERNS) {
    const matches = text.match(p.rx);
    if (matches) {
      for (const m of matches) {
        findings.push({ kind: 'secret', name: p.name, match: redactSecret(m) });
      }
    }
  }
  for (const p of DESTRUCTIVE_PATTERNS) {
    if (p.rx.test(text)) {
      findings.push({ kind: 'destructive', name: p.name, match: p.name });
    }
  }
  return findings;
}

export function redactSecret(value: string): string {
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}…${value.slice(-2)}`;
}

export function sanitizeForDisplay(text: string): string {
  let out = text;
  for (const p of SECRET_PATTERNS) {
    out = out.replace(p.rx, (m) => redactSecret(m));
  }
  return out;
}

// ---------- Patch store ----------

async function readPatches(): Promise<PatchProposal[]> {
  try {
    const raw = await AsyncStorage.getItem(PATCH_STORE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as PatchProposal[];
    return Array.isArray(arr) ? arr : [];
  } catch (err) {
    console.log('[DeveloperWorkspace] readPatches failed:', (err as Error)?.message);
    return [];
  }
}

async function writePatches(patches: PatchProposal[]): Promise<void> {
  try {
    const trimmed = patches.slice(0, MAX_PATCHES);
    await AsyncStorage.setItem(PATCH_STORE_KEY, JSON.stringify(trimmed));
  } catch (err) {
    console.log('[DeveloperWorkspace] writePatches failed:', (err as Error)?.message);
  }
}

export async function listPatches(): Promise<PatchProposal[]> {
  const patches = await readPatches();
  return [...patches].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createPatch(input: CreatePatchInput): Promise<PatchProposal> {
  const now = Date.now();
  const allText = `${input.diff ?? ''}\n${input.newBehavior ?? ''}\n${input.reason ?? ''}`;
  const findings = scanForSafetyIssues(allText);
  const destructive =
    input.destructive === true || findings.some((f) => f.kind === 'destructive');
  const patch: PatchProposal = {
    id: `patch_${now}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
    status: 'proposed',
    filePath: input.filePath,
    reason: input.reason,
    oldBehavior: input.oldBehavior,
    newBehavior: input.newBehavior,
    diff: sanitizeForDisplay(input.diff),
    testPlan: input.testPlan,
    rollback: input.rollback,
    riskLevel: input.riskLevel,
    source: input.source,
    destructive,
  };
  const existing = await readPatches();
  await writePatches([patch, ...existing]);
  await logDeveloperAction({
    actor: input.source === 'ai_suggestion' ? 'ai' : 'owner',
    action: 'patch_proposed',
    detail: `${patch.filePath} (risk=${patch.riskLevel}${destructive ? ', destructive' : ''})`,
    patchId: patch.id,
  });
  if (findings.length > 0) {
    await logDeveloperAction({
      actor: 'system',
      action: 'safety_findings',
      detail: findings.map((f) => `${f.kind}:${f.name}`).join(', '),
      patchId: patch.id,
    });
  }
  return patch;
}

export async function updatePatchStatus(
  id: string,
  status: PatchStatus,
  meta?: { approver?: string; failedReason?: string },
): Promise<PatchProposal | null> {
  const list = await readPatches();
  const idx = list.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const now = Date.now();
  const updated: PatchProposal = {
    ...list[idx],
    status,
    updatedAt: now,
    appliedAt: status === 'applied' ? now : list[idx].appliedAt,
    failedReason: status === 'failed' ? meta?.failedReason : undefined,
    approver: status === 'approved' ? meta?.approver ?? list[idx].approver : list[idx].approver,
  };
  list[idx] = updated;
  await writePatches(list);
  await logDeveloperAction({
    actor: 'owner',
    action: `patch_${status}`,
    detail: `${updated.filePath}`,
    patchId: id,
  });
  return updated;
}

export async function deletePatch(id: string): Promise<void> {
  const list = await readPatches();
  await writePatches(list.filter((p) => p.id !== id));
  await logDeveloperAction({ actor: 'owner', action: 'patch_deleted', detail: id, patchId: id });
}

// ---------- Action log ----------

async function readActions(): Promise<DeveloperActionLog[]> {
  try {
    const raw = await AsyncStorage.getItem(ACTION_LOG_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as DeveloperActionLog[];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function listDeveloperActions(): Promise<DeveloperActionLog[]> {
  const list = await readActions();
  return [...list].sort((a, b) => b.at - a.at);
}

export async function logDeveloperAction(input: Omit<DeveloperActionLog, 'id' | 'at'>): Promise<void> {
  const entry: DeveloperActionLog = {
    id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
    ...input,
  };
  try {
    const existing = await readActions();
    const next = [entry, ...existing].slice(0, MAX_ACTIONS);
    await AsyncStorage.setItem(ACTION_LOG_KEY, JSON.stringify(next));
  } catch (err) {
    console.log('[DeveloperWorkspace] logDeveloperAction failed:', (err as Error)?.message);
  }
  void recordIVXOwnerChatAuditEvent({
    action: 'developer_workspace_action',
    conversationId: 'ivx-owner-ai-developer-workspace',
    status: input.actor === 'system' ? 'started' : 'success',
    summary: `[${input.actor}] ${input.action} :: ${input.detail.slice(0, 120)}`,
    metadata: {
      block: BLOCK18_DEVELOPER_WORKSPACE_MARKER,
      actor: input.actor,
      action: input.action,
      patchId: input.patchId ?? null,
    },
  }).catch(() => undefined);
}

// ---------- Helpers for AI parse ----------

/**
 * Best-effort parse of an AI patch reply into a CreatePatchInput.
 * The AI is asked to reply in a tagged block format; we accept partial.
 */
export function tryParseAIPatchReply(answer: string): CreatePatchInput | null {
  if (!answer || answer.length < 20) return null;
  const get = (label: string): string | undefined => {
    const rx = new RegExp(
      `<${label}>\\s*([\\s\\S]*?)\\s*</${label}>`,
      'i',
    );
    const m = answer.match(rx);
    return m?.[1]?.trim();
  };
  const filePath = get('file');
  const reason = get('reason');
  const oldBehavior = get('old_behavior') ?? get('old');
  const newBehavior = get('new_behavior') ?? get('new');
  const diff = get('diff') ?? get('patch');
  if (!filePath || !diff || !reason) return null;
  const riskRaw = (get('risk') ?? 'medium').toLowerCase();
  const risk: PatchProposal['riskLevel'] =
    riskRaw === 'low' || riskRaw === 'high' ? riskRaw : 'medium';
  return {
    filePath,
    reason,
    oldBehavior: oldBehavior ?? '(not specified)',
    newBehavior: newBehavior ?? '(not specified)',
    diff,
    testPlan: get('test_plan') ?? get('tests'),
    rollback: get('rollback'),
    riskLevel: risk,
    source: 'ai_suggestion',
  };
}

export const PATCH_REPLY_FORMAT_INSTRUCTION = [
  'When proposing a code change, REPLY IN THIS EXACT TAGGED FORMAT (use plain XML-style tags, not Markdown):',
  '<file>relative/path/to/file.ext</file>',
  '<reason>short reason</reason>',
  '<old_behavior>what currently happens</old_behavior>',
  '<new_behavior>what will happen after the patch</new_behavior>',
  '<risk>low|medium|high</risk>',
  '<diff>',
  '```diff',
  '--- a/relative/path',
  '+++ b/relative/path',
  '@@ context @@',
  '- removed line',
  '+ added line',
  '```',
  '</diff>',
  '<test_plan>how to verify</test_plan>',
  '<rollback>how to revert</rollback>',
  'Do NOT include real secret values. Do NOT silently modify files. Owner must approve before apply.',
].join('\n');
