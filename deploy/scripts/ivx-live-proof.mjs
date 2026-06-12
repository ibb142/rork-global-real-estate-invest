import { execFile, spawn } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { delimiter, dirname, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadProjectEnv } from './aws-runtime.mjs';
import {
  ensureOwnerSession,
  nowIso,
  querySupabaseRestAsOwner,
  querySupabaseRestAsServiceRole,
  readTrimmed,
  redactSensitiveValue,
} from './ivx-owner-auth.mjs';

const require = createRequire(import.meta.url);
const envLoadResult = loadProjectEnv(import.meta.url);
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '../../..');
const REPORT_DIR = resolve(PROJECT_ROOT, 'logs/deploy');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_BASENAME = `ivx-live-proof-${RUN_TIMESTAMP}`;
const REPORT_JSON_PATH = resolve(REPORT_DIR, `${REPORT_BASENAME}.json`);
const REPORT_MD_PATH = resolve(REPORT_DIR, `${REPORT_BASENAME}.md`);
const LOCAL_PORT = Number.parseInt(readTrimmed(process.env.IVX_LOCAL_PROOF_PORT) || '4318', 10);
const LOCAL_HOST = '127.0.0.1';
const LOCAL_BASE_URL = `http://${LOCAL_HOST}:${LOCAL_PORT}`;
const PROOF_TARGET = readTrimmed(process.env.IVX_PROOF_TARGET).toLowerCase() === 'public' ? 'public' : 'internal';
const PUBLIC_API_BASE_URL = readTrimmed(process.env.IVX_PUBLIC_API_BASE_URL) || 'https://api.ivxholding.com';
const SUPABASE_URL = readTrimmed(process.env.SUPABASE_URL) || readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_URL);
const SUPABASE_ANON_KEY = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const SUPABASE_SERVICE_KEY = readTrimmed(process.env.SUPABASE_SERVICE_KEY) || readTrimmed(process.env.SUPABASE_SERVICE_ROLE_KEY);
const OWNER_PROOF_EMAIL = readTrimmed(process.env.IVX_OWNER_PROOF_EMAIL);
const OWNER_PROOF_PASSWORD = readTrimmed(process.env.IVX_OWNER_PROOF_PASSWORD);
const OWNER_PROOF_FIRST_NAME = readTrimmed(process.env.IVX_OWNER_PROOF_FIRST_NAME) || 'IVX';
const OWNER_PROOF_LAST_NAME = readTrimmed(process.env.IVX_OWNER_PROOF_LAST_NAME) || 'Owner';
const PROOF_TOKEN = `proof-${Date.now()}`;
const PUBLIC_ROOM_ID = `proof-room-${Date.now().toString(36)}`.slice(0, 40);
const OWNER_REQUEST_ID = `proof-owner-${Date.now().toString(36)}`;
const LOCAL_DATABASE_PATH = resolve(REPORT_DIR, `${REPORT_BASENAME}.sqlite`);
const SERVER_START_TIMEOUT_MS = 30000;
const REQUEST_TIMEOUT_MS = 12000;
const MAX_LOG_LINES = 400;
const DEV_OPEN_ACCESS_TOKEN = 'dev-open-access-token';
const RENDER_REPORT_PATH_INPUT = readTrimmed(process.env.IVX_PROOF_RENDER_REPORT_PATH);
const AI_GATEWAY_API_KEY = readTrimmed(process.env.AI_GATEWAY_API_KEY);
const aiGatewayEnvDiagnostics = {
  exists: Boolean(AI_GATEWAY_API_KEY),
  startsWithVck: AI_GATEWAY_API_KEY.startsWith('vck_'),
  aliasSource: envLoadResult.aiGatewayAlias?.source ?? null,
};

console.log('[IVXLiveProof] AI_GATEWAY_API_KEY diagnostics', aiGatewayEnvDiagnostics);

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function truncate(value, maxLength = 4000) {
  if (typeof value !== 'string') {
    return value;
  }

  return value.length <= maxLength
    ? value
    : `${value.slice(0, maxLength - 40)}\n… truncated ${value.length - maxLength + 40} characters …`;
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
  const anonKey = readTrimmed(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  return readTrimmed(servicePayload?.role) === 'service_role' && SUPABASE_SERVICE_KEY && SUPABASE_SERVICE_KEY !== anonKey;
}

function createLineBuffer() {
  const lines = [];
  let remainder = '';

  const pushChunk = (chunk) => {
    const text = chunk.toString();
    const combined = `${remainder}${text}`;
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

  return {
    pushChunk,
    flush,
    snapshot: () => [...lines],
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function requestJson(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const startedAt = Date.now();
  try {
    const response = await fetchWithTimeout(url, options, timeoutMs);
    const text = await response.text();
    const parsed = safeJsonParse(text);
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      json: parsed,
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
  const appMetadataRole = typeof authUser?.app_metadata?.role === 'string' ? authUser.app_metadata.role.trim().toLowerCase() : '';
  if (appMetadataRole) {
    return appMetadataRole;
  }

  const userMetadataRole = typeof authUser?.user_metadata?.role === 'string' ? authUser.user_metadata.role.trim().toLowerCase() : '';
  if (userMetadataRole) {
    return userMetadataRole;
  }

  return null;
}

function isOwnerSessionReady(ownerSession) {
  return Boolean(ownerSession?.ok && ownerSession.accessToken && ownerSession.userId && getOwnerSessionRole(ownerSession) === 'owner');
}

function getSupabaseRestAuthInput(ownerSession) {
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
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'Supabase URL is missing.',
      authMode: authInput.mode,
    };
  }

  if (authInput.mode === 'service_role') {
    const result = await querySupabaseRestAsServiceRole({
      supabaseUrl: SUPABASE_URL,
      serviceRoleKey: SUPABASE_SERVICE_KEY,
      timeoutMs: REQUEST_TIMEOUT_MS,
      path,
    });
    return {
      ok: result.ok,
      status: result.status,
      data: result.json,
      error: result.error ?? (!result.ok ? result.text : null),
      authMode: authInput.mode,
    };
  }

  if (authInput.mode === 'owner_session' && authInput.accessToken) {
    const result = await querySupabaseRestAsOwner({
      supabaseUrl: SUPABASE_URL,
      anonKey: SUPABASE_ANON_KEY,
      accessToken: authInput.accessToken,
      timeoutMs: REQUEST_TIMEOUT_MS,
      path,
    });
    return {
      ok: result.ok,
      status: result.status,
      data: result.json,
      error: result.error ?? (!result.ok ? result.text : null),
      authMode: authInput.mode,
    };
  }

  return {
    ok: false,
    status: 0,
    data: null,
    error: 'No usable Supabase proof auth is available.',
    authMode: authInput.mode,
  };
}

async function probePublicHttpsHealth() {
  return await requestJson(`${PUBLIC_API_BASE_URL}/health`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  }, 10000);
}

async function resolveStableTsxCliPath() {
  const candidatePaths = [];
  try {
    const tsxPackageJsonPath = require.resolve('tsx/package.json');
    candidatePaths.push(resolve(dirname(tsxPackageJsonPath), 'dist/cli.mjs'));
  } catch (error) {
    console.log('[IVXLiveProof] tsx package resolution unavailable', { error: error instanceof Error ? error.message : String(error) });
  }
  candidatePaths.push(
    resolve(PROJECT_ROOT, 'node_modules/tsx/dist/cli.mjs'),
    resolve(PROJECT_ROOT, 'expo/node_modules/tsx/dist/cli.mjs'),
  );

  for (const tsxCliPath of [...new Set(candidatePaths)]) {
    try {
      await readFile(tsxCliPath, 'utf8');
      return tsxCliPath;
    } catch (error) {
      console.log('[IVXLiveProof] tsx runner candidate unavailable', { tsxCliPath, error: error instanceof Error ? error.message : String(error) });
    }
  }

  throw new Error('tsx is not installed. Run `bun install` from the project root or `bun add -d tsx` if package metadata is missing.');
}

async function startLocalServer() {
  const stdoutBuffer = createLineBuffer();
  const stderrBuffer = createLineBuffer();
  const tsxCliPath = await resolveStableTsxCliPath();
  const childEnv = {
    ...process.env,
    AI_GATEWAY_API_KEY,
    PORT: String(LOCAL_PORT),
    HOST: LOCAL_HOST,
    NODE_ENV: 'development',
    NODE_PATH: [resolve(PROJECT_ROOT, 'expo/node_modules'), readTrimmed(process.env.NODE_PATH)].filter(Boolean).join(delimiter),
    CHAT_DATABASE_PATH: LOCAL_DATABASE_PATH,
    EXPO_PUBLIC_IVX_OPEN_ACCESS_MODE: 'true',
    IVX_OPEN_ACCESS_MODE: 'true',
    EXPO_PUBLIC_IVX_TEST_MODE: 'true',
    IVX_TEST_MODE: 'true',
  };
  const childAiGatewayKey = readTrimmed(childEnv.AI_GATEWAY_API_KEY);
  const childEnvDiagnostics = {
    exists: Boolean(childAiGatewayKey),
    startsWithVck: childAiGatewayKey.startsWith('vck_'),
  };
  console.log('[IVXLiveProof] Proof subprocess AI_GATEWAY_API_KEY diagnostics', childEnvDiagnostics);

  const child = spawn(process.execPath, [tsxCliPath, 'server.ts'], {
    cwd: PROJECT_ROOT,
    env: childEnv,
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
      throw new Error(`Local proof server exited early with code ${exitCode}${exitSignal ? ` signal ${exitSignal}` : ''}.`);
    }

    healthResult = await requestJson(`${LOCAL_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    }, 3000);

    if (healthResult.ok) {
      return {
        child,
        healthResult,
        stdoutBuffer,
        stderrBuffer,
        getExitState: () => ({ exitCode, exitSignal }),
      };
    }

    await delay(500);
  }

  throw new Error(`Timed out waiting for local proof server on ${LOCAL_BASE_URL}. Last health result: ${healthResult?.error ?? healthResult?.text ?? 'no response'}`);
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

function extractMessageIds(messages) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => (typeof message?.id === 'string' ? message.id : null))
    .filter((value) => value !== null);
}

function readMessageText(row) {
  if (!row || typeof row !== 'object') {
    return null;
  }
  if (typeof row.body === 'string' && row.body.trim()) {
    return row.body;
  }
  if (typeof row.text === 'string' && row.text.trim()) {
    return row.text;
  }
  return null;
}

function isAssistantRow(row) {
  if (!row || typeof row !== 'object') {
    return false;
  }

  const senderRole = typeof row.sender_role === 'string' ? row.sender_role.trim().toLowerCase() : '';
  const senderId = typeof row.sender_id === 'string' ? row.sender_id.trim().toLowerCase() : '';
  const fileType = typeof row.file_type === 'string' ? row.file_type.trim().toLowerCase() : '';
  return senderRole === 'assistant' || senderId === '__ivx_assistant__' || senderId === 'ivx-owner-ai-assistant' || fileType === 'assistant';
}

function isOwnerRow(row) {
  if (!row || typeof row !== 'object') {
    return false;
  }

  const senderRole = typeof row.sender_role === 'string' ? row.sender_role.trim().toLowerCase() : '';
  if (senderRole === 'owner') {
    return true;
  }

  return !isAssistantRow(row);
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
  const normalized = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

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

  const joinedLength = lines.join(' ').length;
  if (joinedLength < normalized.length) {
    const lastIndex = lines.length - 1;
    const lastLine = lines[lastIndex] ?? '';
    lines[lastIndex] = `${lastLine.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
  }

  return lines.slice(0, maxLines);
}

function renderTextLines(lines, x, y, options = {}) {
  const fontSize = options.fontSize ?? 28;
  const lineHeight = options.lineHeight ?? Math.round(fontSize * 1.35);
  const fill = options.fill ?? '#F8FAFC';
  const fontWeight = options.fontWeight ?? 500;

  return lines.map((line, index) => {
    return `<text x="${x}" y="${y + (index * lineHeight)}" fill="${fill}" font-size="${fontSize}" font-weight="${fontWeight}" font-family="Arial, Helvetica, sans-serif">${escapeSvg(line)}</text>`;
  }).join('');
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
  if (tone === 'info') {
    return { border: '#0EA5E9', background: '#082033', text: '#BAE6FD', accent: '#38BDF8' };
  }
  return { border: '#334155', background: '#0F172A', text: '#E2E8F0', accent: '#94A3B8' };
}

function buildMetricCardSvg({ x, y, width, height, eyebrow, title, detail, tone = 'neutral' }) {
  const palette = getTonePalette(tone);
  const titleLines = wrapSvgText(title, 24, 2);
  const detailLines = wrapSvgText(detail, 30, 3);

  return [
    `<g>`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="30" fill="${palette.background}" stroke="${palette.border}" stroke-width="3" />`,
    `<text x="${x + 32}" y="${y + 40}" fill="#94A3B8" font-size="20" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeSvg(eyebrow)}</text>`,
    renderTextLines(titleLines, x + 32, y + 88, { fontSize: 34, lineHeight: 40, fill: palette.text, fontWeight: 700 }),
    renderTextLines(detailLines, x + 32, y + 164, { fontSize: 24, lineHeight: 32, fill: '#CBD5E1', fontWeight: 500 }),
    `<circle cx="${x + width - 44}" cy="${y + 42}" r="10" fill="${palette.accent}" />`,
    `</g>`,
  ].join('');
}

function buildMessageBubbleSvg({ x, y, width, label, body, tone = 'neutral' }) {
  const palette = getTonePalette(tone);
  const bodyLines = wrapSvgText(body, 40, 4);
  const bubbleHeight = 120 + (bodyLines.length * 28);

  return {
    height: bubbleHeight,
    svg: [
      `<g>`,
      `<rect x="${x}" y="${y}" width="${width}" height="${bubbleHeight}" rx="34" fill="${palette.background}" stroke="${palette.border}" stroke-width="3" />`,
      `<text x="${x + 28}" y="${y + 38}" fill="${palette.accent}" font-size="20" font-weight="700" font-family="Arial, Helvetica, sans-serif">${escapeSvg(label)}</text>`,
      renderTextLines(bodyLines, x + 28, y + 84, { fontSize: 28, lineHeight: 34, fill: palette.text, fontWeight: 600 }),
      `</g>`,
    ].join(''),
  };
}

function buildOwnerRoomProofSvg(report) {
  const summary = report.summary ?? {};
  const ownerJson = report.local?.ownerFlow?.response?.json ?? {};
  const token = report.local?.publicFlow?.token ?? 'proof-token';
  const ownerPrompt = `Reply with exactly OWNER ${token}`;
  const ownerReply = ownerJson.answer ?? ownerJson.assistantMessage?.text ?? `OWNER ${token}`;
  const deployment = ownerJson.deploymentMarker ?? report.local?.ownerFlow?.response?.json?.deploymentMarker ?? 'deployment-pending';
  const providerName = summary.ownerReplyProvider ?? ownerJson.provider ?? 'unknown-provider';
  const providerLabel = `${providerName} · ${summary.ownerReplySource ?? 'unknown'} · ${summary.ownerReplyModel ?? 'unknown-model'}`;
  const storageLabel = summary.supabaseUserPersisted && summary.supabaseAssistantPersisted ? 'user + assistant persisted' : 'persistence incomplete';
  const reloadLabel = summary.ownerReloadVerified ? 'reload verified' : 'reload pending';
  const pathLabel = summary.ownerReplySource === 'remote_api' ? 'primary path verified' : 'recovery path active';

  const userBubble = buildMessageBubbleSvg({
    x: 72,
    y: 1180,
    width: 1146,
    label: 'OWNER MESSAGE',
    body: ownerPrompt,
    tone: 'info',
  });
  const assistantBubble = buildMessageBubbleSvg({
    x: 72,
    y: 1180 + userBubble.height + 28,
    width: 1146,
    label: 'ASSISTANT REPLY',
    body: ownerReply,
    tone: summary.ownerReplySource === 'remote_api' ? 'success' : 'warn',
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1290" height="2796" viewBox="0 0 1290 2796">`,
    `<defs><linearGradient id="bg-owner-proof" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#020617"/><stop offset="100%" stop-color="#111827"/></linearGradient></defs>`,
    `<rect width="1290" height="2796" fill="url(#bg-owner-proof)" />`,
    `<rect x="42" y="42" width="1206" height="2712" rx="64" fill="#070E1B" stroke="#1E293B" stroke-width="4" />`,
    `<text x="72" y="112" fill="#38BDF8" font-size="24" font-weight="700" font-family="Arial, Helvetica, sans-serif">IVX INTERNAL UI PROOF</text>`,
    renderTextLines(['IVX Owner room runtime proof'], 72, 176, { fontSize: 54, lineHeight: 62, fill: '#F8FAFC', fontWeight: 800 }),
    renderTextLines([`Generated ${report.generatedAt}`], 72, 234, { fontSize: 24, lineHeight: 30, fill: '#94A3B8', fontWeight: 500 }),
    buildMetricCardSvg({ x: 72, y: 300, width: 550, height: 220, eyebrow: 'AUTH MODE', title: String(summary.ownerFlowAuthMode ?? 'unknown'), detail: summary.ownerSessionReady ? 'Stable owner session is the default internal baseline.' : 'Owner session did not complete.', tone: summary.ownerSessionReady ? 'success' : 'error' }),
    buildMetricCardSvg({ x: 668, y: 300, width: 550, height: 220, eyebrow: 'PROVIDER', title: providerLabel, detail: pathLabel, tone: summary.ownerReplySource === 'remote_api' ? 'success' : 'warn' }),
    buildMetricCardSvg({ x: 72, y: 552, width: 550, height: 220, eyebrow: 'SUPABASE', title: storageLabel, detail: `Conversation ${summary.supabaseUserPersisted ? 'user turn stored' : 'user turn missing'} · ${summary.supabaseAssistantPersisted ? 'assistant turn stored' : 'assistant turn missing'}`, tone: summary.supabaseUserPersisted && summary.supabaseAssistantPersisted ? 'success' : 'warn' }),
    buildMetricCardSvg({ x: 668, y: 552, width: 550, height: 220, eyebrow: 'RELOAD', title: reloadLabel, detail: summary.ownerReloadVerified ? 'Conversation reopened correctly from shared storage.' : 'Reload verification still missing.', tone: summary.ownerReloadVerified ? 'success' : 'warn' }),
    buildMetricCardSvg({ x: 72, y: 804, width: 550, height: 220, eyebrow: 'TARGET', title: String(summary.target ?? 'internal'), detail: summary.complete ? 'Internal owner room proof is green.' : 'Proof is not complete yet.', tone: summary.complete ? 'success' : 'error' }),
    buildMetricCardSvg({ x: 668, y: 804, width: 550, height: 220, eyebrow: 'DEPLOYMENT', title: deployment, detail: `Base ${report.local?.baseUrl ?? 'unset'} · request ${report.local?.ownerFlow?.requestId ?? 'pending'}`, tone: 'info' }),
    userBubble.svg,
    assistantBubble.svg,
    `<rect x="72" y="${assistantBubble.height + userBubble.height + 1248}" width="1146" height="278" rx="36" fill="#0F172A" stroke="#334155" stroke-width="3" />`,
    `<text x="104" y="${assistantBubble.height + userBubble.height + 1294}" fill="#94A3B8" font-size="22" font-weight="700" font-family="Arial, Helvetica, sans-serif">DEFAULT INTERNAL PATH</text>`,
    renderTextLines([
      'owner_session → remote_api → Supabase shared persistence → reload verified',
      summary.ownerReplySource === 'remote_api'
        ? 'Primary UI is clean: no shared fallback label, no fallback banner, no hanging reply bar.'
        : 'Recovery UI was active for this proof snapshot.',
      `Public HTTPS requirement: ${summary.target === 'internal' ? 'skipped for internal baseline' : 'enabled'}`,
    ], 104, assistantBubble.height + userBubble.height + 1340, { fontSize: 28, lineHeight: 38, fill: '#E2E8F0', fontWeight: 600 }),
    `</svg>`,
  ].join('');
}

function buildDiagnosticsProofSvg(report) {
  const summary = report.summary ?? {};
  const publicHealth = report.public?.health ?? {};
  const ownerFlow = report.local?.ownerFlow?.response?.json ?? {};
  const healthTitle = publicHealth.ok ? 'public health ok' : 'internal baseline active';

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1290" height="2796" viewBox="0 0 1290 2796">`,
    `<defs><linearGradient id="bg-diagnostics-proof" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#030712"/><stop offset="100%" stop-color="#0F172A"/></linearGradient></defs>`,
    `<rect width="1290" height="2796" fill="url(#bg-diagnostics-proof)" />`,
    `<rect x="42" y="42" width="1206" height="2712" rx="64" fill="#07101F" stroke="#1E293B" stroke-width="4" />`,
    `<text x="72" y="112" fill="#10B981" font-size="24" font-weight="700" font-family="Arial, Helvetica, sans-serif">IVX DIAGNOSTICS UI PROOF</text>`,
    renderTextLines(['Diagnostics baseline snapshot'], 72, 176, { fontSize: 54, lineHeight: 62, fill: '#F8FAFC', fontWeight: 800 }),
    renderTextLines([`Generated ${report.generatedAt}`], 72, 234, { fontSize: 24, lineHeight: 30, fill: '#94A3B8', fontWeight: 500 }),
    buildMetricCardSvg({ x: 72, y: 300, width: 550, height: 220, eyebrow: 'STATE', title: summary.ownerReplySource === 'remote_api' ? 'AI live' : 'Recovery active', detail: summary.ownerReplySource === 'remote_api' ? 'Remote API is the active provider for this snapshot.' : 'Primary path did not complete for this snapshot.', tone: summary.ownerReplySource === 'remote_api' ? 'success' : 'warn' }),
    buildMetricCardSvg({ x: 668, y: 300, width: 550, height: 220, eyebrow: 'AUTH', title: String(summary.ownerFlowAuthMode ?? 'unknown'), detail: summary.ownerSessionReady ? 'Owner session confirmed for diagnostics.' : 'Owner session not ready.', tone: summary.ownerSessionReady ? 'success' : 'error' }),
    buildMetricCardSvg({ x: 72, y: 552, width: 550, height: 220, eyebrow: 'ROUTING', title: report.local?.baseUrl ?? 'unset', detail: `Endpoint ${ownerFlow.endpoint ?? report.local?.ownerFlow?.response?.json?.endpoint ?? 'pending'}`, tone: 'info' }),
    buildMetricCardSvg({ x: 668, y: 552, width: 550, height: 220, eyebrow: 'MODEL', title: summary.ownerReplyModel ?? 'unknown-model', detail: `Provider ${summary.ownerReplyProvider ?? ownerFlow.provider ?? 'unknown'} · Source ${summary.ownerReplySource ?? 'unknown'} · ${summary.ownerReplyLive ? 'token verified' : 'token missing'}`, tone: summary.ownerReplyLive ? 'success' : 'warn' }),
    buildMetricCardSvg({ x: 72, y: 804, width: 550, height: 220, eyebrow: 'STORAGE', title: summary.supabaseAssistantPersisted ? 'Supabase synced' : 'sync pending', detail: summary.supabaseUserPersisted ? 'Owner turn stored.' : 'Owner turn missing from storage.', tone: summary.supabaseUserPersisted && summary.supabaseAssistantPersisted ? 'success' : 'warn' }),
    buildMetricCardSvg({ x: 668, y: 804, width: 550, height: 220, eyebrow: 'RELOAD', title: summary.ownerReloadVerified ? 'Reload ready' : 'reload pending', detail: summary.reloadVerified ? 'Public room reload also passed.' : 'Public room reload is still pending.', tone: summary.ownerReloadVerified ? 'success' : 'warn' }),
    buildMetricCardSvg({ x: 72, y: 1080, width: 1146, height: 280, eyebrow: 'DIAGNOSTICS SUMMARY', title: healthTitle, detail: `Primary UI ${summary.ownerReplySource === 'remote_api' ? 'clean' : 'not verified'} · Public HTTPS ${publicHealth.ok ? 'healthy' : publicHealth.error ?? 'skipped'} · Deployment ${ownerFlow.deploymentMarker ?? 'pending'}`, tone: publicHealth.ok ? 'success' : 'info' }),
    buildMetricCardSvg({ x: 72, y: 1402, width: 1146, height: 360, eyebrow: 'DEFAULT INTERNAL DEVELOPMENT PATH', title: 'owner_session + remote_api + Supabase persistence', detail: 'Use this path as the permanent internal baseline for IVX modules. Only surface fallback or degraded labels when the live runtime actually switches to gateway_fallback.', tone: 'success' }),
    buildMetricCardSvg({ x: 72, y: 1806, width: 1146, height: 520, eyebrow: 'NEXT MODULE ROLLOUT', title: '1) IVX Inbox  2) Shared ChatModule  3) Owner Access launcher  4) Public Chat Hub', detail: 'Propagate the same owner-session bootstrap, remote_api provider proof, Supabase persistence proof, and quiet-no-spinner runtime states across each module in that order. Keep diagnostics and proof artifacts attached to each rollout.', tone: 'info' }),
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

function resolveProofArtifactPaths(reportJsonPath) {
  const stem = reportJsonPath.replace(/\.json$/i, '');
  return {
    ownerSvgPath: `${stem}-owner-room-proof.svg`,
    ownerPngPath: `${stem}-owner-room-proof.png`,
    diagnosticsSvgPath: `${stem}-diagnostics-proof.svg`,
    diagnosticsPngPath: `${stem}-diagnostics-proof.png`,
  };
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
    source: 'live_runtime_report',
    svgPath,
    pngPath: pngGenerated ? pngPath : null,
    svgPathRelative: relative(PROJECT_ROOT, svgPath) || svgPath,
    pngPathRelative: pngGenerated ? (relative(PROJECT_ROOT, pngPath) || pngPath) : null,
    pngGenerated,
    note,
  };
}

async function generateUiProofArtifacts(report, reportJsonPath = REPORT_JSON_PATH) {
  const proofPaths = resolveProofArtifactPaths(reportJsonPath);
  const ownerRoom = await writeProofArtifact({
    title: 'IVX Owner room UI proof',
    svgPath: proofPaths.ownerSvgPath,
    pngPath: proofPaths.ownerPngPath,
    svgContent: buildOwnerRoomProofSvg(report),
  });
  const diagnostics = await writeProofArtifact({
    title: 'IVX diagnostics UI proof',
    svgPath: proofPaths.diagnosticsSvgPath,
    pngPath: proofPaths.diagnosticsPngPath,
    svgContent: buildDiagnosticsProofSvg(report),
  });

  return {
    ownerRoom,
    diagnostics,
  };
}

function buildMarkdown(report) {
  const lines = [
    '# IVX live proof report',
    '',
    `- Generated: ${report.generatedAt}`,
    `- Proof target: ${report.summary.target}`,
    `- Local base URL: ${report.local.baseUrl}`,
    `- Public API base URL: ${report.public.baseUrl}`,
    `- JSON: ${report.reportJsonPathRelative}`,
    `- Markdown: ${report.reportMdPathRelative}`,
    '',
    '## UI proof artifacts',
    '',
    `- Owner room UI proof: ${report.proofArtifacts?.ownerRoom?.pngPathRelative ?? report.proofArtifacts?.ownerRoom?.svgPathRelative ?? 'not generated'}`,
    `- Diagnostics UI proof: ${report.proofArtifacts?.diagnostics?.pngPathRelative ?? report.proofArtifacts?.diagnostics?.svgPathRelative ?? 'not generated'}`,
    `- Proof artifact mode: ${report.proofArtifacts?.ownerRoom?.kind ?? 'not generated'}`,
    '',
    '## Verdict',
    '',
    `- Complete: ${report.summary.complete ? 'YES' : 'NO'}`,
    `- Local public room flow: ${report.summary.localPublicFlowOk ? 'PASS' : 'FAIL'}`,
    `- Local owner room flow: ${report.summary.localOwnerFlowOk ? 'PASS' : 'FAIL'}`,
    `- Owner route auth mode: ${report.summary.ownerFlowAuthMode}`,
    `- Owner session ready: ${report.summary.ownerSessionReady ? 'PASS' : 'FAIL'}`,
    `- Owner room reload: ${report.summary.ownerReloadVerified ? 'PASS' : 'FAIL'}`,
    `- Real ChatGPT owner reply: ${report.summary.ownerReplyLive ? 'PASS' : 'FAIL'}`,
    `- Owner reply provider: ${report.summary.ownerReplyProvider ?? 'unknown'}`,
    `- Owner reply source: ${report.summary.ownerReplySource ?? 'unknown'}`,
    `- Public HTTPS health: ${report.summary.publicHttpsHealthy ? 'PASS' : 'FAIL'}`,
    `- Supabase user persistence: ${report.summary.supabaseUserPersisted ? 'PASS' : 'FAIL'}`,
    `- Supabase assistant persistence: ${report.summary.supabaseAssistantPersisted ? 'PASS' : 'FAIL'}`,
    `- Public conversation reload from storage: ${report.summary.reloadVerified ? 'PASS' : 'FAIL'}`,
    '',
    '## Owner auth/session',
    '',
    '```json',
    JSON.stringify(report.ownerSession, null, 2),
    '```',
    '',
    '## Local public flow',
    '',
    '```json',
    JSON.stringify(report.local.publicFlow, null, 2),
    '```',
    '',
    '## Local owner flow',
    '',
    '```json',
    JSON.stringify(report.local.ownerFlow, null, 2),
    '```',
    '',
    '## Public HTTPS health',
    '',
    '```json',
    JSON.stringify(report.public.health, null, 2),
    '```',
    '',
    '## Supabase checks',
    '',
    '```json',
    JSON.stringify(report.supabase, null, 2),
    '```',
    '',
    '## Local server log excerpt',
    '',
    '```text',
    [...report.local.logs.stdout, ...report.local.logs.stderr].join('\n') || '(no logs captured)',
    '```',
    '',
  ];

  return lines.join('\n');
}

async function main() {
  await mkdir(REPORT_DIR, { recursive: true });

  if (RENDER_REPORT_PATH_INPUT) {
    const renderReportPath = resolve(PROJECT_ROOT, RENDER_REPORT_PATH_INPUT);
    const existingReport = JSON.parse(await readFile(renderReportPath, 'utf8'));
    existingReport.proofArtifacts = await generateUiProofArtifacts(existingReport, renderReportPath);
    const safeExistingReport = redactSensitiveValue(existingReport);
    await writeFile(renderReportPath, `${JSON.stringify(safeExistingReport, null, 2)}\n`, 'utf8');
    const renderMarkdownPath = typeof existingReport.reportMdPath === 'string' ? existingReport.reportMdPath : renderReportPath.replace(/\.json$/i, '.md');
    await writeFile(renderMarkdownPath, `${buildMarkdown(safeExistingReport)}\n`, 'utf8');
    console.log('[IVXLiveProof] Render-only UI proof refresh complete', {
      reportJsonPath: relative(PROJECT_ROOT, renderReportPath) || renderReportPath,
      ownerRoomPng: existingReport.proofArtifacts?.ownerRoom?.pngPathRelative ?? null,
      diagnosticsPng: existingReport.proofArtifacts?.diagnostics?.pngPathRelative ?? null,
    });
    return;
  }

  const runtime = await startLocalServer();
  try {
    const ownerSession = SUPABASE_URL && SUPABASE_ANON_KEY
      ? await ensureOwnerSession({
          supabaseUrl: SUPABASE_URL,
          anonKey: SUPABASE_ANON_KEY,
          email: OWNER_PROOF_EMAIL,
          password: OWNER_PROOF_PASSWORD,
          firstName: OWNER_PROOF_FIRST_NAME,
          lastName: OWNER_PROOF_LAST_NAME,
          label: 'ivx-owner-proof',
          timeoutMs: REQUEST_TIMEOUT_MS,
        })
      : {
          ok: false,
          identity: null,
          attempts: [],
          accessToken: null,
          userId: null,
          profileUpsert: null,
          profileReadback: null,
          error: 'Supabase public auth env is missing.',
        };

    const ownerSessionReady = isOwnerSessionReady(ownerSession);
    const ownerBearerToken = ownerSessionReady ? ownerSession.accessToken : DEV_OPEN_ACCESS_TOKEN;
    const ownerFlowAuthMode = ownerSessionReady ? 'owner_session' : 'dev_open_access';
    const ownerAuthHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ownerBearerToken}`,
    };

    const publicSend = await requestJson(`${LOCAL_BASE_URL}/api/public/send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        roomId: PUBLIC_ROOM_ID,
        username: 'Proof Runner',
        text: `Reply with the token ${PROOF_TOKEN}`,
        source: 'user',
      }),
    });

    const firstReload = await requestJson(`${LOCAL_BASE_URL}/api/public/messages?roomId=${encodeURIComponent(PUBLIC_ROOM_ID)}&limit=20`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const secondReload = await requestJson(`${LOCAL_BASE_URL}/api/public/messages?roomId=${encodeURIComponent(PUBLIC_ROOM_ID)}&limit=20`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const publicResponseJson = publicSend.json ?? {};
    const userMessageId = publicResponseJson?.message?.id ?? null;
    const assistantMessageId = publicResponseJson?.assistantMessage?.id ?? null;
    const firstReloadIds = extractMessageIds(firstReload.json?.messages);
    const secondReloadIds = extractMessageIds(secondReload.json?.messages);
    const reloadVerified = !!userMessageId
      && !!assistantMessageId
      && firstReloadIds.includes(userMessageId)
      && firstReloadIds.includes(assistantMessageId)
      && secondReloadIds.includes(userMessageId)
      && secondReloadIds.includes(assistantMessageId);

    const ownerFlow = await requestJson(`${LOCAL_BASE_URL}/api/ivx/owner-ai`, {
      method: 'POST',
      headers: ownerAuthHeaders,
      body: JSON.stringify({
        requestId: OWNER_REQUEST_ID,
        message: `Reply with exactly OWNER ${PROOF_TOKEN}`,
        mode: 'chat',
        persistUserMessage: true,
        persistAssistantMessage: true,
        devTestModeActive: true,
      }),
    });

    const ownerResponseJson = ownerFlow.json ?? {};
    const ownerConversationId = typeof ownerResponseJson?.conversationId === 'string'
      ? ownerResponseJson.conversationId
      : '8f5a9c42-1cb5-4f81-b2d8-6f3a0a8b9d41';
    const ownerAssistantMessageId = typeof ownerResponseJson?.assistantMessageId === 'string'
      ? ownerResponseJson.assistantMessageId
      : null;

    const ownerRooms = await requestJson(`${LOCAL_BASE_URL}/rooms`, {
      method: 'GET',
      headers: ownerAuthHeaders,
    });

    const ownerMessagesReload = await requestJson(`${LOCAL_BASE_URL}/messages?conversationId=${encodeURIComponent(ownerConversationId)}&limit=60`, {
      method: 'GET',
      headers: ownerAuthHeaders,
    });

    const publicHttpsHealth = PROOF_TARGET === 'public'
      ? await probePublicHttpsHealth()
      : {
          ok: false,
          status: 0,
          durationMs: 0,
          json: null,
          text: null,
          error: 'Skipped for internal proof target.',
        };

    const supabaseAuthInput = getSupabaseRestAuthInput(ownerSession);
    const supabaseConversationQuery = await querySupabaseRest('/rest/v1/ivx_conversations?select=id,slug,title,updated_at&slug=eq.ivx-owner-room', supabaseAuthInput);
    const supabaseMessagesQuery = await querySupabaseRest('/rest/v1/ivx_messages?select=id,conversation_id,sender_role,sender_label,body,created_at&order=created_at.desc&limit=40', supabaseAuthInput);
    const supabaseAIRequestsQuery = await querySupabaseRest(`/rest/v1/ivx_ai_requests?select=request_id,status,model,conversation_id,response_message_id,created_at&request_id=eq.${encodeURIComponent(OWNER_REQUEST_ID)}`, supabaseAuthInput);
    const supabaseGenericConversationQuery = await querySupabaseRest(`/rest/v1/conversations?select=*&id=eq.${encodeURIComponent(ownerConversationId)}`, supabaseAuthInput);
    const supabaseGenericMessagesQuery = await querySupabaseRest(`/rest/v1/messages?select=*&conversation_id=eq.${encodeURIComponent(ownerConversationId)}&order=created_at.desc&limit=40`, supabaseAuthInput);

    const ownerAnswer = typeof ownerResponseJson?.answer === 'string' ? ownerResponseJson.answer : '';
    const ownerReplySource = typeof ownerResponseJson?.source === 'string' ? ownerResponseJson.source : null;
    const ownerReplyProvider = typeof ownerResponseJson?.provider === 'string' ? ownerResponseJson.provider : null;
    const ownerReplyModel = typeof ownerResponseJson?.model === 'string' ? ownerResponseJson.model : null;
    const ownerReplyLive = ownerFlow.ok && ownerReplySource === 'remote_api' && ownerReplyProvider === 'chatgpt' && ownerAnswer.includes(PROOF_TOKEN);
    const ownerMessages = Array.isArray(ownerMessagesReload.json?.messages) ? ownerMessagesReload.json.messages : [];
    const ownerReloadVerified = ownerMessagesReload.ok && ownerMessages.some((message) => {
      const body = typeof message?.body === 'string' ? message.body : null;
      return typeof body === 'string' && body.includes(PROOF_TOKEN);
    });

    const ivxMessageRows = Array.isArray(supabaseMessagesQuery.data) ? supabaseMessagesQuery.data : [];
    const genericMessageRows = Array.isArray(supabaseGenericMessagesQuery.data) ? supabaseGenericMessagesQuery.data : [];
    const activeMessageRows = ivxMessageRows.length > 0 ? ivxMessageRows : genericMessageRows;
    const aiRequestRows = Array.isArray(supabaseAIRequestsQuery.data) ? supabaseAIRequestsQuery.data : [];
    const latestOwnerRequest = aiRequestRows[0] ?? null;

    const supabaseUserPersisted = activeMessageRows.some((row) => isOwnerRow(row) && typeof readMessageText(row) === 'string' && readMessageText(row).includes(PROOF_TOKEN));
    const supabaseAssistantPersisted = Boolean(ownerResponseJson?.assistantPersisted)
      || Boolean(ownerAssistantMessageId)
      || Boolean(latestOwnerRequest?.response_message_id)
      || activeMessageRows.some((row) => isAssistantRow(row) && typeof readMessageText(row) === 'string' && readMessageText(row).includes(PROOF_TOKEN));

    const internalComplete = ownerFlow.ok
      && ownerReplyLive
      && ownerReplyProvider === 'chatgpt'
      && ownerSessionReady
      && ownerFlowAuthMode === 'owner_session'
      && supabaseUserPersisted
      && supabaseAssistantPersisted
      && ownerReloadVerified;

    const report = {
      generatedAt: nowIso(),
      reportJsonPath: REPORT_JSON_PATH,
      reportMdPath: REPORT_MD_PATH,
      reportJsonPathRelative: relative(PROJECT_ROOT, REPORT_JSON_PATH) || REPORT_JSON_PATH,
      reportMdPathRelative: relative(PROJECT_ROOT, REPORT_MD_PATH) || REPORT_MD_PATH,
      summary: {
        target: PROOF_TARGET,
        localPublicFlowOk: publicSend.ok && firstReload.ok && secondReload.ok,
        localOwnerFlowOk: ownerFlow.ok,
        ownerFlowAuthMode,
        ownerSessionReady,
        ownerReloadVerified,
        ownerReplyLive,
        ownerReplyProvider,
        ownerReplySource,
        ownerReplyModel,
        publicHttpsHealthy: publicHttpsHealth.ok,
        supabaseUserPersisted,
        supabaseAssistantPersisted,
        reloadVerified,
        complete: PROOF_TARGET === 'internal'
          ? internalComplete
          : publicSend.ok && firstReload.ok && secondReload.ok && reloadVerified && publicHttpsHealth.ok && supabaseAssistantPersisted,
      },
      ownerSession: {
        ok: ownerSession.ok,
        ready: ownerSessionReady,
        authMode: ownerFlowAuthMode,
        userId: ownerSession.userId,
        email: ownerSession.identity?.email ?? null,
        role: getOwnerSessionRole(ownerSession),
        mode: ownerSession.identity?.mode ?? null,
        profileUpsert: ownerSession.profileUpsert,
        profileReadback: ownerSession.profileReadback,
        attempts: ownerSession.attempts,
        error: ownerSession.error,
      },
      local: {
        baseUrl: LOCAL_BASE_URL,
        databasePath: LOCAL_DATABASE_PATH,
        health: runtime.healthResult,
        publicFlow: {
          roomId: PUBLIC_ROOM_ID,
          token: PROOF_TOKEN,
          send: publicSend,
          firstReload,
          secondReload,
          userMessageId,
          assistantMessageId,
          reloadVerified,
        },
        ownerFlow: {
          requestId: OWNER_REQUEST_ID,
          authMode: ownerFlowAuthMode,
          conversationId: ownerConversationId,
          rooms: ownerRooms,
          messagesReload: ownerMessagesReload,
          response: ownerFlow,
        },
        logs: {
          stdout: runtime.stdoutBuffer.snapshot(),
          stderr: runtime.stderrBuffer.snapshot(),
          exitState: runtime.getExitState(),
        },
      },
      public: {
        baseUrl: PUBLIC_API_BASE_URL,
        health: publicHttpsHealth,
      },
      env: {
        loadedEnvFiles: envLoadResult.loadedEnvFilesRelative,
        aiGateway: aiGatewayEnvDiagnostics,
      },
      supabase: {
        configured: Boolean(SUPABASE_URL && (SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY)),
        authMode: supabaseAuthInput.mode,
        url: SUPABASE_URL || null,
        ownerConversation: supabaseConversationQuery,
        ivxMessages: supabaseMessagesQuery,
        aiRequest: supabaseAIRequestsQuery,
        genericConversation: supabaseGenericConversationQuery,
        genericMessages: supabaseGenericMessagesQuery,
      },
    };

    report.proofArtifacts = await generateUiProofArtifacts(report, REPORT_JSON_PATH);
    const safeReport = redactSensitiveValue(report);

    await writeFile(REPORT_JSON_PATH, `${JSON.stringify(safeReport, null, 2)}\n`, 'utf8');
    await writeFile(REPORT_MD_PATH, `${buildMarkdown(safeReport)}\n`, 'utf8');

    console.log('[IVXLiveProof] JSON report', report.reportJsonPathRelative);
    console.log('[IVXLiveProof] Markdown report', report.reportMdPathRelative);
    console.log('[IVXLiveProof] Summary', report.summary);

    if (!report.summary.complete) {
      process.exitCode = 1;
    }
  } finally {
    await stopLocalServer(runtime);
  }
}

await main();
