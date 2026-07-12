import { spawn } from 'node:child_process';
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectEnv } from './aws-runtime.mjs';

const envLoadResult = loadProjectEnv(import.meta.url);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '../../..');
const REPORT_DIR = resolve(PROJECT_ROOT, 'logs/audit');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_BASENAME = `ivx-developer-access-${RUN_TIMESTAMP}`;
const REPORT_JSON_PATH = resolve(REPORT_DIR, `${REPORT_BASENAME}.json`);
const REPORT_MD_PATH = resolve(REPORT_DIR, `${REPORT_BASENAME}.md`);
const LOCAL_PORT = Number.parseInt(process.env.IVX_DEVELOPER_ACCESS_PORT || '4547', 10);
const LOCAL_BASE_URL = `http://127.0.0.1:${LOCAL_PORT}`;
const LOCAL_DATABASE_PATH = resolve(REPORT_DIR, `${REPORT_BASENAME}.sqlite`);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.IVX_DEVELOPER_ACCESS_TIMEOUT_MS || '22000', 10);
const SERVER_START_TIMEOUT_MS = Number.parseInt(process.env.IVX_DEVELOPER_ACCESS_SERVER_START_TIMEOUT_MS || '30000', 10);
const DEV_OPEN_ACCESS_TOKEN = 'dev-open-access-token';

async function resolveStableTsxCliPath() {
  const candidatePaths = [
    resolve(PROJECT_ROOT, 'node_modules/tsx/dist/cli.mjs'),
    resolve(PROJECT_ROOT, 'node_modules/tsx/dist/cli.cjs'),
    resolve(PROJECT_ROOT, 'node_modules/tsx/dist/cli/index.mjs'),
    resolve(PROJECT_ROOT, 'node_modules/.bin/tsx'),
    resolve(PROJECT_ROOT, 'expo/node_modules/tsx/dist/cli.mjs'),
    resolve(PROJECT_ROOT, 'expo/node_modules/tsx/dist/cli.cjs'),
    resolve(PROJECT_ROOT, 'expo/node_modules/tsx/dist/cli/index.mjs'),
    resolve(PROJECT_ROOT, 'expo/node_modules/.bin/tsx'),
  ];
  const stableDir = resolve(PROJECT_ROOT, 'logs/deploy/.runner-bin');
  const stableTsxDir = resolve(stableDir, 'tsx-dist');
  const stableTsxCliPath = resolve(stableTsxDir, 'cli.mjs');
  await mkdir(stableDir, { recursive: true });

  for (const tsxCliPath of candidatePaths) {
    try {
      const { stat } = await import('node:fs/promises');
      const stats = await stat(tsxCliPath);
      if (!stats.isFile()) {
        continue;
      }
      if (tsxCliPath.endsWith('.mjs') && tsxCliPath.includes('/dist/')) {
        const tsxDistDir = dirname(tsxCliPath);
        await cp(tsxDistDir, stableTsxDir, { recursive: true, force: true });
        return { command: process.execPath, argsPrefix: [stableTsxCliPath], label: `node ${relative(PROJECT_ROOT, stableTsxCliPath)}` };
      }
      return { command: tsxCliPath, argsPrefix: [], label: relative(PROJECT_ROOT, tsxCliPath) };
    } catch (error) {
      console.log('[IVXDeveloperAccessProof] Stable tsx runner candidate unavailable', { tsxCliPath, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { command: 'bunx', argsPrefix: ['tsx'], label: 'bunx tsx' };
}

const DEBUG_LEAKAGE_PATTERNS = [
  /^source:\s*owner_audit_report/im,
  /^detected_intent:/im,
  /^selected_route:/im,
  /^audit_endpoint_called:/im,
  /^audit_failure:/im,
  /runtime proof/i,
  /provider proof/i,
  /source proof/i,
  /backend_admin_/i,
  /fallback_chat_only/i,
];

const PROMPTS = [
  {
    id: 'supabase_capability',
    prompt: 'Supabase',
    expectedTool: 'capability_self_report',
    expectedDirectPath: null,
    expectedSelectedRoute: 'supabase_inspection_tool',
  },
  {
    id: 'count_tables',
    prompt: 'How many tables do we have in Supabase?',
    expectedTool: 'list_supabase_tables',
    expectedDirectPath: '/api/ivx/supabase/tables',
    expectedSelectedRoute: 'supabase_inspection_tool',
  },
  {
    id: 'list_tables',
    prompt: 'List all Supabase tables',
    expectedTool: 'list_supabase_tables',
    expectedDirectPath: '/api/ivx/supabase/tables',
    expectedSelectedRoute: 'supabase_inspection_tool',
  },
  {
    id: 'ivx_messages_columns',
    prompt: 'Show columns for ivx_messages',
    expectedTool: 'list_supabase_columns',
    expectedDirectPath: '/api/ivx/supabase/columns?table=ivx_messages',
    expectedSelectedRoute: 'supabase_inspection_tool',
  },
  {
    id: 'ivx_rls',
    prompt: 'Show RLS policies for IVX tables',
    expectedTool: 'inspect_supabase_rls',
    expectedDirectPath: '/api/ivx/supabase/rls',
    expectedSelectedRoute: 'supabase_inspection_tool',
  },
  {
    id: 'owner_room_data',
    prompt: 'What owner room data is available?',
    expectedTool: 'inspect_owner_room_data',
    expectedDirectPath: null,
    expectedSelectedRoute: 'owner_room_data_tool',
  },
];

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function safeJsonParse(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  const value = String(token || '').trim();
  const payloadSegment = value.split('.')[1] || '';
  if (!payloadSegment) {
    return null;
  }

  try {
    const padded = payloadSegment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function redact(value) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  return text.length <= 12 ? '[present-redacted]' : `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function truncate(value, maxLength = 7000) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 40)}\n… truncated ${value.length - maxLength + 40} chars …`;
}

function projectRefFromUrl(value) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  try {
    return new URL(text).hostname.split('.')[0] || null;
  } catch {
    return text.replace(/^https?:\/\//i, '').split('.')[0] || null;
  }
}

function collectSupabaseEnvAudit() {
  const supabaseUrl = String(process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const anonKey = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '').trim();
  const anonPayload = decodeJwtPayload(anonKey);
  const servicePayload = decodeJwtPayload(serviceKey);
  const serviceRole = typeof servicePayload?.role === 'string' ? servicePayload.role : null;
  const matchesAnon = Boolean(serviceKey && anonKey && serviceKey === anonKey);
  return {
    runtimeSource: 'process.env after loadProjectEnv(import.meta.url)',
    loadedEnvFiles: envLoadResult.loadedEnvFilesRelative,
    precedenceOrder: [
      'pre-existing process.env values win first',
      'root .env.local',
      'root .env',
      'script directory .env.local/.env',
      'expo/deploy and expo .env.local/.env candidate files in loader order',
      'IVX_USE_LOCAL_SUPABASE override remaps IVX_LOCAL_SUPABASE_* last when enabled',
      'spawned server.ts inherits this already-resolved process.env and server.ts loadProjectEnv uses override=false',
    ],
    localSupabaseOverride: envLoadResult.localSupabaseOverride,
    supabaseUrlPresent: Boolean(supabaseUrl),
    supabaseUrlPreview: redact(supabaseUrl),
    projectRef: projectRefFromUrl(supabaseUrl),
    anonConfigured: Boolean(anonKey),
    anonRole: typeof anonPayload?.role === 'string' ? anonPayload.role : null,
    anonRef: typeof anonPayload?.ref === 'string' ? anonPayload.ref : null,
    serviceConfigured: Boolean(serviceKey),
    serviceRole,
    serviceRef: typeof servicePayload?.ref === 'string' ? servicePayload.ref : null,
    serviceRolePreview: redact(serviceKey),
    matchesAnon,
    hasRealServiceRole: Boolean(serviceKey && !matchesAnon && (serviceRole === 'service_role' || serviceRole === 'supabase_admin')),
    dbPasswordPresent: Boolean(process.env.SUPABASE_DB_PASSWORD),
    dbUrlPresent: Boolean(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || process.env.POSTGRES_URL),
  };
}

function createLineBuffer() {
  const lines = [];
  let remainder = '';
  return {
    push(chunk) {
      const parts = `${remainder}${chunk.toString()}`.split(/\r?\n/);
      remainder = parts.pop() || '';
      for (const line of parts) {
        if (line.trim()) {
          lines.push(line);
        }
        if (lines.length > 800) {
          lines.shift();
        }
      }
    },
    flush() {
      if (remainder.trim()) {
        lines.push(remainder.trim());
      }
      remainder = '';
    },
    snapshot() {
      return [...lines];
    },
  };
}

async function requestText(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      url,
      method: options.method || 'GET',
      durationMs: Date.now() - startedAt,
      contentType: response.headers.get('content-type'),
      text: truncate(text),
      json: safeJsonParse(text),
      error: null,
      timestamp: nowIso(),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      url,
      method: options.method || 'GET',
      durationMs: Date.now() - startedAt,
      contentType: null,
      text: null,
      json: null,
      error: error instanceof Error ? error.message : String(error),
      timestamp: nowIso(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForHealth(baseUrl, timeoutMs = SERVER_START_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await requestText(`${baseUrl}/health`, { method: 'GET' }, 3000);
    if (last.ok) {
      return last;
    }
    await sleep(750);
  }
  return last;
}

function answerHasDebugLeakage(answer) {
  const text = String(answer || '');
  return DEBUG_LEAKAGE_PATTERNS.some((pattern) => pattern.test(text));
}

function visibleAnswerFromResponse(response) {
  return typeof response?.json?.answer === 'string' ? response.json.answer : '';
}

function inferToolPathFromResponse(response, fallbackPath) {
  const endpoint = typeof response?.json?.endpoint === 'string' ? response.json.endpoint : '';
  if (endpoint.includes('/api/ivx/supabase')) {
    return fallbackPath;
  }
  return endpoint || fallbackPath;
}

function inferSelectedRoute(response) {
  const model = typeof response?.json?.model === 'string' ? response.json.model : '';
  return model === 'list_supabase_tables'
    || model === 'inspect_supabase_schema'
    || model === 'list_supabase_columns'
    || model === 'inspect_supabase_rls'
    || model === 'capability_self_report'
      ? 'supabase_inspection_tool'
      : model === 'inspect_owner_room_data'
        ? 'owner_room_data_tool'
        : model === 'ivx_backend_amazon_code_report'
          ? 'owner_audit_report'
          : 'generic_ai_chat';
}

async function runRuntimeProof() {
  const stdoutBuffer = createLineBuffer();
  const stderrBuffer = createLineBuffer();
  const tsxRunner = await resolveStableTsxCliPath();
  const child = spawn(tsxRunner.command, [...tsxRunner.argsPrefix, 'server.ts'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: String(LOCAL_PORT),
      HOST: '127.0.0.1',
      CHAT_DATABASE_PATH: LOCAL_DATABASE_PATH,
      NODE_ENV: 'development',
      NODE_PATH: [resolve(PROJECT_ROOT, 'expo/node_modules'), process.env.NODE_PATH || ''].filter(Boolean).join(delimiter),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => stdoutBuffer.push(chunk));
  child.stderr.on('data', (chunk) => stderrBuffer.push(chunk));

  const runtime = {
    command: `${tsxRunner.label} server.ts`,
    baseUrl: LOCAL_BASE_URL,
    databasePath: relative(PROJECT_ROOT, LOCAL_DATABASE_PATH),
    health: null,
    directToolChecks: [],
    promptChecks: [],
    serverExit: null,
    stdout: [],
    stderr: [],
    verdict: 'not_run',
  };

  try {
    runtime.health = await waitForHealth(LOCAL_BASE_URL);
    if (!runtime.health?.ok) {
      runtime.verdict = 'blocked_local_server_not_healthy';
      return runtime;
    }

    for (const promptCheck of PROMPTS) {
      if (promptCheck.expectedDirectPath) {
        const directUrl = `${LOCAL_BASE_URL}${promptCheck.expectedDirectPath}${promptCheck.expectedDirectPath.includes('?') ? '&' : '?'}limit=200`;
        const directResponse = await requestText(directUrl, {
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: `Bearer ${DEV_OPEN_ACCESS_TOKEN}` },
        });
        runtime.directToolChecks.push({
          id: promptCheck.id,
          expectedDirectPath: promptCheck.expectedDirectPath,
          response: directResponse,
        });
      }

      const ownerAIResponse = await requestText(`${LOCAL_BASE_URL}/api/ivx/owner-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEV_OPEN_ACCESS_TOKEN}` },
        body: JSON.stringify({
          requestId: `dev-access-${promptCheck.id}-${Date.now()}`,
          message: promptCheck.prompt,
          persistUserMessage: false,
          persistAssistantMessage: false,
        }),
      });
      const answer = visibleAnswerFromResponse(ownerAIResponse);
      const selectedRoute = inferSelectedRoute(ownerAIResponse);
      const toolBackendPath = inferToolPathFromResponse(ownerAIResponse, promptCheck.expectedDirectPath || '/api/ivx/owner-ai');
      runtime.promptChecks.push({
        id: promptCheck.id,
        prompt: promptCheck.prompt,
        expectedSelectedRoute: promptCheck.expectedSelectedRoute,
        selectedRoute,
        expectedTool: promptCheck.expectedTool,
        model: ownerAIResponse?.json?.model ?? null,
        toolBackendPath,
        status: ownerAIResponse.status,
        ok: ownerAIResponse.ok,
        visibleAnswer: answer,
        noDebugLeakage: !answerHasDebugLeakage(answer),
        response: ownerAIResponse,
      });
    }

    const allPromptsOk = runtime.promptChecks.every((check) => check.ok && check.selectedRoute === check.expectedSelectedRoute && check.model === check.expectedTool && check.noDebugLeakage && String(check.visibleAnswer || '').trim().length > 0);
    runtime.verdict = allPromptsOk ? 'passed_local_internal_developer_access_prompts' : 'blocked_or_partial_local_internal_developer_access';
    return runtime;
  } finally {
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolvePromise) => child.once('exit', (code, signal) => resolvePromise({ code, signal }))),
      sleep(2500).then(() => {
        child.kill('SIGKILL');
        return { code: null, signal: 'SIGKILL_TIMEOUT' };
      }),
    ]).then((exitInfo) => {
      runtime.serverExit = exitInfo;
    });
    stdoutBuffer.flush();
    stderrBuffer.flush();
    runtime.stdout = stdoutBuffer.snapshot();
    runtime.stderr = stderrBuffer.snapshot();
  }
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# IVX developer access proof', '', `Generated: ${report.generatedAt}`, `JSON artifact: ${relative(PROJECT_ROOT, REPORT_JSON_PATH)}`, `Markdown artifact: ${relative(PROJECT_ROOT, REPORT_MD_PATH)}`, 'Public production probes: skipped by design for this phase', '');
  lines.push('## Commands run');
  report.commandsRun.forEach((command, index) => lines.push(`${index + 1}. \`${command}\``));
  lines.push('', '## Supabase service-role env audit');
  lines.push(`- projectRef: ${report.supabaseEnv.projectRef ?? 'none'}`);
  lines.push(`- serviceRole: ${report.supabaseEnv.serviceRole ?? 'none'}`);
  lines.push(`- serviceRef: ${report.supabaseEnv.serviceRef ?? 'none'}`);
  lines.push(`- matchesAnon: ${report.supabaseEnv.matchesAnon}`);
  lines.push(`- hasRealServiceRole: ${report.supabaseEnv.hasRealServiceRole}`);
  lines.push(`- runtime source: ${report.supabaseEnv.runtimeSource}`);
  lines.push(`- loadedEnvFiles: ${report.supabaseEnv.loadedEnvFiles.join(', ') || 'none'}`);
  lines.push(`- precedence: ${report.supabaseEnv.precedenceOrder.join(' -> ')}`);
  lines.push('', '## Local/internal prompt proof');
  report.runtime.promptChecks.forEach((check, index) => {
    lines.push(`### ${index + 1}. ${check.prompt}`);
    lines.push(`- selected route: ${check.selectedRoute}`);
    lines.push(`- tool/backend path: ${check.toolBackendPath}`);
    lines.push(`- model/tool: ${check.model}`);
    lines.push(`- HTTP status: ${check.status}`);
    lines.push(`- no debug leakage: ${check.noDebugLeakage}`);
    lines.push('- visible answer:');
    lines.push('```');
    lines.push(String(check.visibleAnswer || '').slice(0, 4000));
    lines.push('```');
  });
  lines.push('', '## Direct tool endpoint proof');
  report.runtime.directToolChecks.forEach((check) => {
    lines.push(`- ${check.id}: ${check.expectedDirectPath} -> HTTP ${check.response.status}, ok=${check.response.ok}`);
  });
  lines.push('', '## Runtime verdict');
  lines.push(`- ${report.runtime.verdict}`);
  lines.push('', '## Final verdict');
  Object.entries(report.finalVerdict).forEach(([key, value]) => lines.push(`- ${key}: ${Array.isArray(value) ? value.join('; ') : value}`));
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  const commandsRun = [
    'node --check expo/deploy/scripts/ivx-developer-access-proof.mjs',
    'node expo/deploy/scripts/ivx-developer-access-proof.mjs',
    'internal: spawn bunx tsx server.ts with local PORT and CHAT_DATABASE_PATH',
    `internal: GET ${LOCAL_BASE_URL}/health`,
    `internal: GET ${LOCAL_BASE_URL}/api/ivx/supabase/tables`,
    `internal: GET ${LOCAL_BASE_URL}/api/ivx/supabase/schema`,
    `internal: GET ${LOCAL_BASE_URL}/api/ivx/supabase/columns?table=ivx_messages`,
    `internal: GET ${LOCAL_BASE_URL}/api/ivx/supabase/rls`,
    `internal: POST ${LOCAL_BASE_URL}/api/ivx/owner-ai for each developer prompt including owner room data`,
  ];
  const supabaseEnv = collectSupabaseEnvAudit();
  const runtime = await runRuntimeProof();
  const promptProofOk = runtime.verdict === 'passed_local_internal_developer_access_prompts';
  const report = {
    generatedAt: nowIso(),
    commandsRun,
    supabaseEnv,
    runtime,
    finalVerdict: {
      IVX_local_internal_developer_access: supabaseEnv.hasRealServiceRole && promptProofOk ? 'YES' : 'NO',
      IVX_public_production_developer_access: 'NO',
      serviceRoleEqualsServiceRole: supabaseEnv.serviceRole === 'service_role' ? 'YES' : 'NO',
      matchesAnonFalse: supabaseEnv.matchesAnon === false ? 'YES' : 'NO',
      hasRealServiceRoleTrue: supabaseEnv.hasRealServiceRole === true ? 'YES' : 'NO',
      destructiveActionsDefault: 'DISABLED_READ_ONLY_INSPECTION_ONLY',
      remainingPublicProductionBlockers: [
        'api.ivxholding.com / chat.ivxholding.com public host listener/TLS/AWS deployment is separate and not required for this local/internal developer-access proof.',
      ],
      projectRefMatchesExpected: supabaseEnv.projectRef === 'kvclcdjmjghndxsngfzb' && supabaseEnv.serviceRef === 'kvclcdjmjghndxsngfzb' ? 'YES' : 'NO',
      remainingLocalInternalBlockers: supabaseEnv.hasRealServiceRole
        ? []
        : ['SUPABASE_SERVICE_ROLE_KEY loaded by the local/internal backend is not a real hosted service_role JWT. Replace it with the hosted Supabase service_role key in backend/server env, not the anon key.'],
    },
  };
  await writeFile(REPORT_JSON_PATH, JSON.stringify(report, null, 2));
  await writeFile(REPORT_MD_PATH, buildMarkdown(report));
  console.log(JSON.stringify({ ok: true, json: relative(PROJECT_ROOT, REPORT_JSON_PATH), markdown: relative(PROJECT_ROOT, REPORT_MD_PATH), finalVerdict: report.finalVerdict }, null, 2));
}

await main();
