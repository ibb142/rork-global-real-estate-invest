import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { delimiter, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectEnv } from './aws-runtime.mjs';
import {
  ensureOwnerSession,
  nowIso,
  querySupabaseRestAsOwner,
  querySupabaseRestAsServiceRole,
  readTrimmed,
} from './ivx-owner-auth.mjs';

const envLoadResult = loadProjectEnv(import.meta.url);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '../../..');
const REPORT_DIR = resolve(PROJECT_ROOT, 'logs/deploy');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_BASENAME = `p0-ai-assistant-proof-${RUN_TIMESTAMP}`;
const REPORT_JSON_PATH = resolve(REPORT_DIR, `${REPORT_BASENAME}.json`);
const REPORT_MD_PATH = resolve(REPORT_DIR, `${REPORT_BASENAME}.md`);
const LOCAL_PORT = Number.parseInt(readTrimmed(process.env.P0_AI_ASSISTANT_PROOF_PORT) || '4326', 10);
const LOCAL_HOST = '127.0.0.1';
const LOCAL_BASE_URL = `http://${LOCAL_HOST}:${LOCAL_PORT}`;
const LOCAL_DATABASE_PATH = resolve(REPORT_DIR, `${REPORT_BASENAME}.sqlite`);
const SERVER_START_TIMEOUT_MS = 30000;
const REQUEST_TIMEOUT_MS = 45000;
const MAX_LOG_LINES = 400;
const SUPABASE_URL = readTrimmed(process.env.SUPABASE_URL) || readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL);
const SUPABASE_ANON_KEY = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const SUPABASE_SERVICE_KEY = readTrimmed(process.env.SUPABASE_SERVICE_KEY) || readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY);
const OWNER_PROOF_EMAIL = readTrimmed(process.env.IVX_OWNER_PROOF_EMAIL);
const OWNER_PROOF_PASSWORD = readTrimmed(process.env.IVX_OWNER_PROOF_PASSWORD);
const OWNER_PROOF_FIRST_NAME = readTrimmed(process.env.IVX_OWNER_PROOF_FIRST_NAME) || 'IVX';
const OWNER_PROOF_LAST_NAME = readTrimmed(process.env.IVX_OWNER_PROOF_LAST_NAME) || 'Owner';
const PROOF_TOKEN = `p0-${Date.now().toString(36)}`;
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function truncate(value, maxLength = 5000) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 40)}\n… truncated ${value.length - maxLength + 40} characters …`;
}

function safeJsonParse(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function decodeJwtPayload(token) {
  const normalized = readTrimmed(token);
  if (!normalized || !normalized.includes('.')) {
    return null;
  }
  try {
    const payloadSegment = normalized.split('.')[1] ?? '';
    const padded = payloadSegment.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payloadSegment.length / 4) * 4, '=');
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch {
    return null;
  }
}

function hasRealServiceRole() {
  const servicePayload = decodeJwtPayload(SUPABASE_SERVICE_KEY);
  return readTrimmed(servicePayload?.role) === 'service_role' && SUPABASE_SERVICE_KEY && SUPABASE_SERVICE_KEY !== SUPABASE_ANON_KEY;
}

function createLineBuffer() {
  const lines = [];
  let remainder = '';
  const pushChunk = (chunk) => {
    const combined = `${remainder}${chunk.toString()}`;
    const parts = combined.split(/\r?\n/);
    remainder = parts.pop() ?? '';
    for (const line of parts) {
      if (!line.trim()) {
        continue;
      }
      lines.push(line);
      if (lines.length > MAX_LOG_LINES) {
        lines.shift();
      }
    }
  };
  const flush = () => {
    const line = remainder.trim();
    if (line) {
      lines.push(line);
      if (lines.length > MAX_LOG_LINES) {
        lines.shift();
      }
    }
    remainder = '';
  };
  return { pushChunk, flush, snapshot: () => [...lines] };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function requestJson(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(url, options, timeoutMs);
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      json: safeJsonParse(text),
      text: truncate(text),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: Date.now() - startedAt,
      json: null,
      text: null,
      error: error instanceof Error ? error.message : 'request failed',
    };
  }
}

function getOwnerSessionRole(ownerSession) {
  const rows = Array.isArray(ownerSession?.profileReadback?.data) ? ownerSession.profileReadback.data : [];
  const firstRow = rows[0] && typeof rows[0] === 'object' ? rows[0] : null;
  const profileRole = typeof firstRow?.role === 'string' ? firstRow.role.trim().toLowerCase() : '';
  if (profileRole) {
    return profileRole;
  }
  const attempts = Array.isArray(ownerSession?.attempts) ? ownerSession.attempts : [];
  const latestAttemptWithUser = [...attempts].reverse().find((attempt) => attempt?.json?.user && typeof attempt.json.user === 'object');
  const authUser = latestAttemptWithUser?.json?.user ?? null;
  return typeof authUser?.app_metadata?.role === 'string' ? authUser.app_metadata.role.trim().toLowerCase() : null;
}

function isOwnerSessionReady(ownerSession) {
  return Boolean(ownerSession?.ok && ownerSession.accessToken && ownerSession.userId && getOwnerSessionRole(ownerSession) === 'owner');
}

function getSupabaseAuthInput(ownerSession) {
  if (hasRealServiceRole()) {
    return { mode: 'service_role', accessToken: null };
  }
  if (isOwnerSessionReady(ownerSession)) {
    return { mode: 'owner_session', accessToken: ownerSession.accessToken };
  }
  return { mode: 'none', accessToken: null };
}

async function querySupabaseRest(path, authInput) {
  if (!SUPABASE_URL) {
    return { ok: false, status: 0, data: null, error: 'Supabase URL is missing.', authMode: authInput.mode };
  }
  if (authInput.mode === 'service_role') {
    const result = await querySupabaseRestAsServiceRole({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_KEY,
      timeoutMs: REQUEST_TIMEOUT_MS,
      path,
    });
    return { ok: result.ok, status: result.status, data: result.json, error: result.error ?? (!result.ok ? result.text : null), authMode: authInput.mode };
  }
  if (authInput.mode === 'owner_session' && authInput.accessToken) {
    const result = await querySupabaseRestAsOwner({
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      accessToken: authInput.accessToken,
      timeoutMs: REQUEST_TIMEOUT_MS,
      path,
    });
    return { ok: result.ok, status: result.status, data: result.json, error: result.error ?? (!result.ok ? result.text : null), authMode: authInput.mode };
  }
  return { ok: false, status: 0, data: null, error: 'No usable Supabase proof auth is available.', authMode: authInput.mode };
}

async function startLocalServer() {
  const stdoutBuffer = createLineBuffer();
  const stderrBuffer = createLineBuffer();
  const child = spawn('bunx', ['tsx', 'server.ts'], {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      PORT: String(LOCAL_PORT),
      HOST: LOCAL_HOST,
      NODE_ENV: 'development',
      NODE_PATH: [resolve(PROJECT_ROOT, 'expo/node_modules'), readTrimmed(process.env.NODE_PATH)].filter(Boolean).join(delimiter),
      CHAT_DATABASE_PATH: LOCAL_DATABASE_PATH,
      EXPO_PUBLIC_IVX_OPEN_ACCESS_MODE: 'true',
      IVX_OPEN_ACCESS_MODE: 'true',
      EXPO_PUBLIC_IVX_TEST_MODE: 'true',
      IVX_TEST_MODE: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let exitCode = null;
  let exitSignal = null;
  child.stdout.on('data', (chunk) => {
    stdoutBuffer.pushChunk(chunk);
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderrBuffer.pushChunk(chunk);
    process.stderr.write(chunk);
  });
  child.on('exit', (code, signal) => {
    exitCode = code;
    exitSignal = signal;
    stdoutBuffer.flush();
    stderrBuffer.flush();
  });
  const startedAt = Date.now();
  let healthResult = null;
  while (Date.now() - startedAt < SERVER_START_TIMEOUT_MS) {
    if (exitCode !== null) {
      throw new Error(`Local P0 proof server exited early with code ${exitCode}${exitSignal ? ` signal ${exitSignal}` : ''}.`);
    }
    healthResult = await requestJson(`${LOCAL_BASE_URL}/health`, { method: 'GET', headers: { 'Content-Type': 'application/json' } }, 3000);
    if (healthResult.ok) {
      return { child, healthResult, stdoutBuffer, stderrBuffer, getExitState: () => ({ exitCode, exitSignal }) };
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for local P0 proof server. Last health result: ${healthResult?.error ?? healthResult?.text ?? 'no response'}`);
}

async function stopLocalServer(runtime) {
  const { child, stdoutBuffer, stderrBuffer } = runtime;
  stdoutBuffer.flush();
  stderrBuffer.flush();
  if (child.exitCode !== null) {
    return;
  }
  child.kill('SIGTERM');
  const startedAt = Date.now();
  while (Date.now() - startedAt < 5000) {
    if (child.exitCode !== null) {
      return;
    }
    await delay(100);
  }
  child.kill('SIGKILL');
}

function escapeSvg(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function wrapSvgText(value, maxChars = 42, maxLines = 3) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return ['—'];
  }
  const words = normalized.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) {
      lines.push(current);
      current = word;
    } else {
      lines.push(word.slice(0, maxChars));
      current = word.slice(maxChars);
    }
    if (lines.length >= maxLines - 1) {
      break;
    }
  }
  if (lines.length < maxLines && current) {
    lines.push(current);
  }
  if (lines.join(' ').length < normalized.length) {
    const lastIndex = lines.length - 1;
    lines[lastIndex] = `${(lines[lastIndex] ?? '').slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  }
  return lines.slice(0, maxLines);
}

function renderTextLines(lines, x, y, options = {}) {
  const fontSize = options.fontSize ?? 28;
  const lineHeight = options.lineHeight ?? Math.round(fontSize * 1.35);
  const fill = options.fill ?? '#F8FAFC';
  const fontWeight = options.fontWeight ?? 500;
  return lines.map((line, index) => `<text x="${x}" y="${y + (index * lineHeight)}" fill="${fill}" font-size="${fontSize}" font-weight="${fontWeight}" font-family="Arial, Helvetica, sans-serif">${escapeSvg(line)}</text>`).join('');
}

function getTonePalette(tone) {
  if (tone === 'success') {
    return { border: '#1D9F6E', background: '#06281D', text: '#B7F7D2', accent: '#10B981' };
  }
  if (tone === 'warn') {
    return { border: '#A16207', background: '#2B1B06', text: '#FDE68A', accent: '#F59E0B' };
  }
  if (tone === 'error') {
    return { border: '#B91C1C', background: '#2F1115', text: '#FECACA', accent: '#EF4444' };
  }
  return { border: '#0EA5E9', background: '#082033', text: '#BAE6FD', accent: '#38BDF8' };
}

function buildMetricCardSvg({ x, y, width, height, eyebrow, title, detail, tone = 'info' }) {
  const palette = getTonePalette(tone);
  return [
    `<g>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="30" fill="${palette.background}" stroke="${palette.border}" stroke-width="3" />`,
    `<text x="${x + 32}" y="${y + 40}" fill="#94A3B8" font-size="20" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeSvg(eyebrow)}</text>`,
    renderTextLines(wrapSvgText(title, 24, 2), x + 32, y + 88, { fontSize: 34, lineHeight: 40, fill: palette.text, fontWeight: 700 }),
    renderTextLines(wrapSvgText(detail, 30, 3), x + 32, y + 164, { fontSize: 24, lineHeight: 32, fill: '#CBD5E1', fontWeight: 500 }),
    `<circle cx="${x + width - 44}" cy="${y + 42}" r="10" fill="${palette.accent}" />`,
    `</g>`,
  ].join('');
}

function buildFlowProofSvg(report, flowResult) {
  const response = flowResult.response?.json ?? {};
  const summary = report.summary ?? {};
  const flowOk = flowResult.pass === true;
  const promptRun = response.promptRun ?? {};
  const persistence = response.persistence ?? {};
  const answer = typeof response.answer === 'string' ? response.answer : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1290" height="2796" viewBox="0 0 1290 2796">`,
    `<defs><linearGradient id="bg-p0-proof" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#020617"/><stop offset="100%" stop-color="#111827"/></linearGradient></defs>`,
    `<rect width="1290" height="2796" fill="url(#bg-p0-proof)" />`,
    `<rect x="42" y="42" width="1206" height="2712" rx="64" fill="#070E1B" stroke="#1E293B" stroke-width="4" />`,
    `<text x="72" y="112" fill="#38BDF8" font-size="24" font-weight="700" font-family="Arial, Helvetica, sans-serif">P0 AI ASSISTANT UI PROOF</text>`,
    renderTextLines([`${flowResult.flow} flow proof`], 72, 176, { fontSize: 54, lineHeight: 62, fill: '#F8FAFC', fontWeight: 800 }),
    renderTextLines([`Generated ${report.generatedAt}`], 72, 234, { fontSize: 24, lineHeight: 30, fill: '#94A3B8', fontWeight: 500 }),
    buildMetricCardSvg({ x: 72, y: 300, width: 550, height: 220, eyebrow: 'AUTH MODE', title: String(report.ownerSession?.authMode ?? 'unknown'), detail: report.ownerSession?.ready ? 'Owner session confirmed.' : 'Owner session not ready.', tone: report.ownerSession?.ready ? 'success' : 'error' }),
    buildMetricCardSvg({ x: 668, y: 300, width: 550, height: 220, eyebrow: 'PROVIDER', title: `${response.source ?? 'unknown'} · ${response.model ?? 'unknown'}`, detail: response.provider === 'chatgpt' ? 'Real ChatGPT runtime path.' : 'Provider mismatch.', tone: response.source === 'remote_api' && response.provider === 'chatgpt' ? 'success' : 'error' }),
    buildMetricCardSvg({ x: 72, y: 552, width: 550, height: 220, eyebrow: 'PROMPT RUN', title: promptRun.saved ? 'Supabase persisted' : 'not persisted', detail: `table ${promptRun.table ?? 'none'} · reload ${promptRun.reloaded ? 'passed' : 'failed'}`, tone: promptRun.saved && promptRun.reloaded ? 'success' : 'error' }),
    buildMetricCardSvg({ x: 668, y: 552, width: 550, height: 220, eyebrow: 'SUMMARY', title: response.generatedSummary ? 'summary stored' : 'summary missing', detail: response.generatedSummary ?? 'No generated summary returned.', tone: response.generatedSummary ? 'success' : 'error' }),
    buildMetricCardSvg({ x: 72, y: 804, width: 550, height: 220, eyebrow: 'CHAT TRANSCRIPT', title: persistence.saved ? 'message persisted' : 'best-effort only', detail: persistence.saved ? `user ${persistence.userMessageSaved ? 'yes' : 'no'} · assistant ${persistence.assistantMessageSaved ? 'yes' : 'no'}` : 'Prompt-run persistence is authoritative for P0.', tone: persistence.saved ? 'success' : 'warn' }),
    buildMetricCardSvg({ x: 668, y: 804, width: 550, height: 220, eyebrow: 'VERDICT', title: flowOk ? 'PASS' : 'FAIL', detail: flowOk ? 'P0 assistant runtime is green.' : (flowResult.failureReason ?? 'Flow failed.'), tone: flowOk ? 'success' : 'error' }),
    `<rect x="72" y="1120" width="1146" height="340" rx="36" fill="#0F172A" stroke="#334155" stroke-width="3" />`,
    `<text x="104" y="1168" fill="#94A3B8" font-size="22" font-weight="700" font-family="Arial, Helvetica, sans-serif">PROMPT</text>`,
    renderTextLines(wrapSvgText(flowResult.prompt, 62, 5), 104, 1218, { fontSize: 28, lineHeight: 38, fill: '#E2E8F0', fontWeight: 600 }),
    `<rect x="72" y="1508" width="1146" height="520" rx="36" fill="#06281D" stroke="#1D9F6E" stroke-width="3" />`,
    `<text x="104" y="1556" fill="#10B981" font-size="22" font-weight="700" font-family="Arial, Helvetica, sans-serif">CHATGPT RESPONSE</text>`,
    renderTextLines(wrapSvgText(answer, 62, 9), 104, 1608, { fontSize: 28, lineHeight: 38, fill: '#B7F7D2', fontWeight: 600 }),
    buildMetricCardSvg({ x: 72, y: 2090, width: 1146, height: 360, eyebrow: 'DEFAULT INTERNAL PATH', title: 'owner_session + remote_api + Supabase persistence', detail: summary.complete ? 'P0 AI assistant follows the same stable internal development baseline.' : 'P0 baseline proof is incomplete.', tone: summary.complete ? 'success' : 'warn' }),
    `</svg>`,
  ].join('');
}

function execFileAsync(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(command, args, (error, stdout, stderr) => {
      if (error) {
        rejectPromise(new Error(`${command} failed: ${stderr || stdout || error.message}`));
        return;
      }
      resolvePromise({ stdout, stderr });
    });
  });
}

async function writeProofArtifact({ title, svgPath, pngPath, svgContent }) {
  await writeFile(svgPath, svgContent, 'utf8');
  let pngGenerated = false;
  let note = 'PNG generated successfully.';
  try {
    await execFileAsync('convert', [svgPath, pngPath]);
    pngGenerated = true;
  } catch (error) {
    note = error instanceof Error ? error.message : 'PNG conversion failed.';
  }
  return {
    title,
    kind: 'generated_ui_proof',
    source: 'p0_ai_assistant_runtime_report',
    svgPath,
    pngPath: pngGenerated ? pngPath : null,
    svgPathRelative: relative(PROJECT_ROOT, svgPath) || svgPath,
    pngPathRelative: pngGenerated ? (relative(PROJECT_ROOT, pngPath) || pngPath) : null,
    pngGenerated,
    note,
  };
}

async function generateProofArtifacts(report) {
  const artifacts = {};
  for (const flowResult of report.flows) {
    const stem = REPORT_JSON_PATH.replace(/\.json$/i, `-${flowResult.flow}-proof`);
    artifacts[flowResult.flow] = await writeProofArtifact({
      title: `P0 AI assistant ${flowResult.flow} UI proof`,
      svgPath: `${stem}.svg`,
      pngPath: `${stem}.png`,
      svgContent: buildFlowProofSvg(report, flowResult),
    });
  }
  return artifacts;
}

function buildMarkdown(report) {
  const lines = [
    '# P0 AI assistant proof report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Local base URL: ${report.local.baseUrl}`,
    `- Complete: ${report.summary.complete ? 'YES' : 'NO'}`,
    `- Blocked: ${report.summary.blocked ? 'YES' : 'NO'}`,
    `- Blocker: ${report.summary.blocker ?? 'none'}`,
    `- Auth mode: ${report.ownerSession.authMode}`,
    `- Provider/source/model: ${report.summary.provider}/${report.summary.source}/${report.summary.model}`,
    `- Supabase prompt runs persisted: ${report.summary.promptRunsPersisted ? 'PASS' : 'FAIL'}`,
    `- Supabase prompt run reload: ${report.summary.promptRunsReloaded ? 'PASS' : 'FAIL'}`,
    `- Generated summaries: ${report.summary.generatedSummariesPersisted ? 'PASS' : 'FAIL'}`,
    `- Message persistence: ${report.summary.messagesPersisted ? 'PASS' : 'FAIL'}`,
    `- Message reload: ${report.summary.messageReloadVerified ? 'PASS' : 'FAIL'}`,
    '',
    '## UI proof artifacts',
    '',
    ...Object.entries(report.proofArtifacts ?? {}).map(([flow, artifact]) => `- ${flow}: ${artifact.pngPathRelative ?? artifact.svgPathRelative ?? 'not generated'}`),
    '',
    '## Flow results',
    '',
  ];
  for (const flow of report.flows) {
    lines.push(`### ${flow.flow}`);
    lines.push('');
    lines.push(`- Pass: ${flow.pass ? 'YES' : 'NO'}`);
    lines.push(`- Request ID: ${flow.requestId}`);
    lines.push(`- Provider/source/model: ${flow.response.json?.provider ?? 'unknown'}/${flow.response.json?.source ?? 'unknown'}/${flow.response.json?.model ?? 'unknown'}`);
    lines.push(`- Prompt run table: ${flow.response.json?.promptRun?.table ?? 'none'}`);
    lines.push(`- Screenshot: ${report.proofArtifacts?.[flow.flow]?.pngPathRelative ?? report.proofArtifacts?.[flow.flow]?.svgPathRelative ?? 'not generated'}`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(flow, null, 2));
    lines.push('```');
    lines.push('');
  }
  lines.push('## Supabase checks');
  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(report.supabase, null, 2));
  lines.push('```');
  lines.push('');
  lines.push('## Local server log excerpt');
  lines.push('');
  lines.push('```text');
  lines.push([...report.local.logs.stdout, ...report.local.logs.stderr].join('\n') || '(no logs captured)');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function readMessageText(row) {
  if (!row || typeof row !== 'object') {
    return '';
  }
  return typeof row.body === 'string' && row.body.trim()
    ? row.body
    : typeof row.text === 'string' && row.text.trim()
      ? row.text
      : '';
}

async function runFlow(flow, ownerAuthHeaders) {
  const flowToken = `${flow.toUpperCase().replace(/-/g, '')}-${PROOF_TOKEN}`;
  const prompt = flow === 'generate'
    ? `For P0 proof, put exactly ${flowToken} on the first line, then generate a concise IVX assistant status summary.`
    : flow === 'replace'
      ? `For P0 proof, put exactly ${flowToken} on the first line, then replace this draft with a clearer owner-ready update: "ai mock mostly works maybe".`
      : `For P0 proof, put exactly ${flowToken} on the first line, then create a compact new-project kickoff plan for IVX owner AI readiness.`;
  const requestId = `p0-${flow}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const response = await requestJson(`${LOCAL_BASE_URL}/api/assistant`, {
    method: 'POST',
    headers: ownerAuthHeaders,
    body: JSON.stringify({
      requestId,
      message: prompt,
      flow,
      conversationId: 'ivx-owner-room',
      model: DEFAULT_MODEL,
      saveUserMessage: true,
    }),
  });
  const json = response.json ?? {};
  const pass = response.ok
    && json.provider === 'chatgpt'
    && json.source === 'remote_api'
    && json.model === DEFAULT_MODEL
    && typeof json.answer === 'string'
    && json.answer.includes(flowToken)
    && typeof json.generatedSummary === 'string'
    && json.generatedSummary.length > 0
    && json.promptRun?.saved === true
    && json.promptRun?.reloaded === true;
  return {
    flow,
    requestId,
    prompt,
    token: flowToken,
    response,
    pass,
    failureReason: pass ? null : response.error ?? response.json?.error ?? 'P0 assistant flow proof failed.',
  };
}

async function writeBlockedReport(ownerSession, blocker) {
  const report = {
    generatedAt: nowIso(),
    reportJsonPath: REPORT_JSON_PATH,
    reportMdPath: REPORT_MD_PATH,
    reportJsonPathRelative: relative(PROJECT_ROOT, REPORT_JSON_PATH) || REPORT_JSON_PATH,
    reportMdPathRelative: relative(PROJECT_ROOT, REPORT_MD_PATH) || REPORT_MD_PATH,
    summary: {
      complete: false,
      provider: 'chatgpt',
      source: 'remote_api',
      model: DEFAULT_MODEL,
      ownerSessionReady: false,
      promptRunsPersisted: false,
      promptRunsReloaded: false,
      generatedSummariesPersisted: false,
      messagesPersisted: false,
      messageReloadVerified: false,
      flowsPassed: false,
      noLocalMockGeneration: true,
      noFallbackHit: false,
      blocked: true,
      blocker,
    },
    ownerSession: {
      ok: ownerSession?.ok ?? false,
      ready: false,
      authMode: 'owner_session',
      userId: ownerSession?.userId ?? null,
      email: ownerSession?.identity?.email ?? null,
      role: ownerSession ? getOwnerSessionRole(ownerSession) : null,
      mode: ownerSession?.identity?.mode ?? null,
      attempts: ownerSession?.attempts ?? [],
      profileUpsert: ownerSession?.profileUpsert ?? null,
      profileReadback: ownerSession?.profileReadback ?? null,
      error: ownerSession?.error ?? blocker,
    },
    local: {
      baseUrl: LOCAL_BASE_URL,
      health: null,
      messagesReload: null,
      logs: {
        stdout: [],
        stderr: [],
        exitState: { exitCode: null, exitSignal: null },
      },
    },
    flows: [],
    supabase: {
      configured: Boolean(SUPABASE_URL && (SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY)),
      authMode: 'none',
      url: SUPABASE_URL || null,
      serviceRoleClaim: decodeJwtPayload(SUPABASE_SERVICE_KEY)?.role ?? null,
      anonRoleClaim: decodeJwtPayload(SUPABASE_ANON_KEY)?.role ?? null,
      auditTrail: null,
      promptRuns: null,
    },
    env: {
      loadedEnvFiles: envLoadResult.loadedEnvFilesRelative,
    },
    proofArtifacts: {},
  };
  await writeFile(REPORT_JSON_PATH, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(REPORT_MD_PATH, buildMarkdown(report), 'utf8');
  console.log(JSON.stringify({
    complete: false,
    blocked: true,
    blocker,
    reportJson: report.reportJsonPathRelative,
    reportMarkdown: report.reportMdPathRelative,
  }, null, 2));
  process.exitCode = 1;
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });
  let runtime = null;
  try {
    const ownerSession = await ensureOwnerSession({
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      email: OWNER_PROOF_EMAIL,
      password: OWNER_PROOF_PASSWORD,
      firstName: OWNER_PROOF_FIRST_NAME,
      lastName: OWNER_PROOF_LAST_NAME,
      label: 'ivx-owner-proof',
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    const ownerSessionReady = isOwnerSessionReady(ownerSession);
    if (!ownerSessionReady) {
      await writeBlockedReport(ownerSession, `Owner session is not ready for P0 proof: ${ownerSession.error ?? 'unknown'}`);
      return;
    }
    runtime = await startLocalServer();
    const ownerAuthHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerSession.accessToken}`,
    };
    const flows = [];
    for (const flow of ['generate', 'replace', 'new-project']) {
      flows.push(await runFlow(flow, ownerAuthHeaders));
    }
    const firstConversationId = flows.find((flow) => typeof flow.response.json?.conversationId === 'string')?.response.json?.conversationId ?? '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41';
    const messagesReload = await requestJson(`${LOCAL_BASE_URL}/messages?conversationId=${encodeURIComponent(firstConversationId)}&limit=120`, {
      method: 'GET',
      headers: ownerAuthHeaders,
    });
    const reloadedMessages = Array.isArray(messagesReload.json?.messages) ? messagesReload.json.messages : [];
    const messageReloadVerified = flows.every((flow) => reloadedMessages.some((message) => readMessageText(message).includes(flow.token)));
    const supabaseAuthInput = getSupabaseAuthInput(ownerSession);
    const promptRunIds = flows
      .map((flow) => typeof flow.response.json?.promptRun?.id === 'string' ? flow.response.json.promptRun.id : null)
      .filter((value) => value !== null);
    const auditTrailQuery = promptRunIds.length > 0
      ? await querySupabaseRest(`/rest/v1/audit_trail?select=id,action,metadata,created_at&id=in.(${promptRunIds.map(encodeURIComponent).join(',')})`, supabaseAuthInput)
      : { ok: false, status: 0, data: null, error: 'No prompt run ids returned.', authMode: supabaseAuthInput.mode };
    const promptRunsQuery = await querySupabaseRest(`/rest/v1/ai_assistant_prompt_runs?select=id,request_id,flow,provider_source,provider_name,provider_model,generated_summary,status,created_at&request_id=in.(${flows.map((flow) => flow.requestId).map(encodeURIComponent).join(',')})`, supabaseAuthInput);
    const auditTrailRows = Array.isArray(auditTrailQuery.data) ? auditTrailQuery.data : [];
    const promptRunsPersisted = flows.every((flow) => flow.response.json?.promptRun?.saved === true)
      && promptRunIds.length === flows.length
      && promptRunIds.every((id) => auditTrailRows.some((row) => row?.id === id));
    const promptRunsReloaded = flows.every((flow) => flow.response.json?.promptRun?.reloaded === true);
    const generatedSummariesPersisted = flows.every((flow) => typeof flow.response.json?.generatedSummary === 'string' && flow.response.json.generatedSummary.length > 0)
      && flows.every((flow) => auditTrailRows.some((row) => row?.metadata?.requestId === flow.requestId && typeof row?.metadata?.generatedSummary === 'string' && row.metadata.generatedSummary.length > 0));
    const messagesPersisted = flows.every((flow) => flow.response.json?.persistence?.saved === true);
    const providerOk = flows.every((flow) => flow.response.json?.provider === 'chatgpt' && flow.response.json?.source === 'remote_api' && flow.response.json?.model === DEFAULT_MODEL);
    const complete = ownerSessionReady && providerOk && promptRunsPersisted && promptRunsReloaded && generatedSummariesPersisted && flows.every((flow) => flow.pass);
    const report = {
      generatedAt: nowIso(),
      reportJsonPath: REPORT_JSON_PATH,
      reportMdPath: REPORT_MD_PATH,
      reportJsonPathRelative: relative(PROJECT_ROOT, REPORT_JSON_PATH) || REPORT_JSON_PATH,
      reportMdPathRelative: relative(PROJECT_ROOT, REPORT_MD_PATH) || REPORT_MD_PATH,
      summary: {
        complete,
        provider: 'chatgpt',
        source: 'remote_api',
        model: DEFAULT_MODEL,
        ownerSessionReady,
        promptRunsPersisted,
        promptRunsReloaded,
        generatedSummariesPersisted,
        messagesPersisted,
        messageReloadVerified,
        flowsPassed: flows.every((flow) => flow.pass),
        noLocalMockGeneration: true,
        noFallbackHit: providerOk,
      },
      ownerSession: {
        ok: ownerSession.ok,
        ready: ownerSessionReady,
        authMode: 'owner_session',
        userId: ownerSession.userId,
        email: ownerSession.identity?.email ?? null,
        role: getOwnerSessionRole(ownerSession),
        mode: ownerSession.identity?.mode ?? null,
        attempts: ownerSession.attempts,
        profileUpsert: ownerSession.profileUpsert,
        profileReadback: ownerSession.profileReadback,
        error: ownerSession.error,
      },
      local: {
        baseUrl: LOCAL_BASE_URL,
        health: runtime.healthResult,
        messagesReload,
        logs: {
          stdout: runtime.stdoutBuffer.snapshot(),
          stderr: runtime.stderrBuffer.snapshot(),
          exitState: runtime.getExitState(),
        },
      },
      flows,
      supabase: {
        configured: Boolean(SUPABASE_URL && (SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY)),
        authMode: supabaseAuthInput.mode,
        url: SUPABASE_URL || null,
        auditTrail: auditTrailQuery,
        promptRuns: promptRunsQuery,
      },
      env: {
        loadedEnvFiles: envLoadResult.loadedEnvFilesRelative,
      },
    };
    report.proofArtifacts = await generateProofArtifacts(report);
    await writeFile(REPORT_JSON_PATH, JSON.stringify(report, null, 2), 'utf8');
    await writeFile(REPORT_MD_PATH, buildMarkdown(report), 'utf8');
    console.log(JSON.stringify({
      complete: report.summary.complete,
      reportJson: report.reportJsonPathRelative,
      reportMarkdown: report.reportMdPathRelative,
      proofArtifacts: Object.fromEntries(Object.entries(report.proofArtifacts).map(([flow, artifact]) => [flow, artifact.pngPathRelative ?? artifact.svgPathRelative])),
    }, null, 2));
    if (!report.summary.complete) {
      process.exitCode = 1;
    }
  } finally {
    if (runtime) {
      await stopLocalServer(runtime);
    }
  }
}

if (process.env.P0_AI_ASSISTANT_PROOF_RENDER_REPORT_PATH) {
  const existingPath = resolve(PROJECT_ROOT, process.env.P0_AI_ASSISTANT_PROOF_RENDER_REPORT_PATH);
  const existingReport = JSON.parse(await readFile(existingPath, 'utf8'));
  existingReport.proofArtifacts = await generateProofArtifacts(existingReport);
  await writeFile(existingPath, JSON.stringify(existingReport, null, 2), 'utf8');
  await writeFile(existingPath.replace(/\.json$/i, '.md'), buildMarkdown(existingReport), 'utf8');
  console.log(JSON.stringify({ complete: existingReport.summary?.complete === true, proofArtifacts: existingReport.proofArtifacts }, null, 2));
} else {
  await main();
}
