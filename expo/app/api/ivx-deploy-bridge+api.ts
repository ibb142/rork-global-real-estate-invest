/**
 * IVX Deploy Bridge — runs in Rork's Expo cloud runtime where private env vars
 * (GITHUB_TOKEN, RENDER_API_KEY, RENDER_SERVICE_ID) are available via process.env.
 *
 * Endpoint: POST /api/ivx-deploy-bridge
 *
 * Body: { "action": "github-test" | "github-push" | "render-deploy" | "full-deploy" }
 *
 * This route bridges the gap: the Render backend has a placeholder GITHUB_TOKEN,
 * but Rork's cloud has the real token. We push code to GitHub from here, then
 * trigger a Render deploy which will pull the updated code from GitHub.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { createHash } from 'crypto';

type JsonRecord = Record<string, unknown>;

const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
} as const;

function jsonResponse(payload: JsonRecord, status: number = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: JSON_HEADERS,
  });
}

export function OPTIONS(): Response {
  return jsonResponse({ ok: true }, 200);
}

// ── Env reading ──────────────────────────────────────────────────────────
function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getGitHubToken(): string {
  return readTrimmed(process.env.GITHUB_TOKEN);
}

function getRenderApiKey(): string {
  return readTrimmed(process.env.RENDER_API_KEY);
}

function getRenderServiceId(): string {
  return readTrimmed(process.env.RENDER_SERVICE_ID);
}

function getRepoSlug(): string {
  const raw =
    readTrimmed(process.env.GITHUB_REPO) ||
    readTrimmed(process.env.GITHUB_REPO_URL);
  // Extract owner/repo from URL or raw slug
  const match = raw.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
  if (match) return match[1];
  return raw;
}

// ── GitHub Git Tree API ──────────────────────────────────────────────────
const GITHUB_API = 'https://api.github.com';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.expo', 'dist', 'build', '.ivx',
  '.DS_Store', '__pycache__', 'tmp', 'core',
  '.rork', 'logs',
  'dist-audit-ios', 'dist-audit-ios-final', 'dist-audit-ios-postfix',
  'dist-audit-web', 'dist-audit-web-final', 'dist-audit-web-postfix',
]);

const IGNORE_FILES = new Set([
  '.env', '.env.production', '.env.staging', '.env.local',
  '.env.development', 'ivx-eslint.config.js', 'bun.lock',
  'package-lock.json', 'yarn.lock',
]);

const IGNORE_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico',
  '.mp4', '.mov', '.avi', '.lock',
]);

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function getPathExtension(relativePath: string): string {
  const parts = String(relativePath || '').split(/[\\/]+/).filter(Boolean);
  const filename = parts.at(-1) || '';
  return filename.includes('.')
    ? `.${filename.split('.').pop()!.toLowerCase()}`
    : '';
}

function isIgnored(relativePath: string): boolean {
  const parts = String(relativePath || '').split(/[\\/]+/).filter(Boolean);
  if (parts.some((part) => IGNORE_DIRS.has(part))) return true;
  if (parts.length >= 2 && parts[0] === '.github' && parts[1] === 'workflows')
    return true;
  const filename = parts.at(-1) || '';
  if (IGNORE_FILES.has(filename)) return true;
  return IGNORE_EXTENSIONS.has(getPathExtension(relativePath));
}

function getAllFiles(dir: string, base: string = dir): Array<{ path: string; fullPath: string; size: number }> {
  const files: Array<{ path: string; fullPath: string; size: number }> = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry) || IGNORE_FILES.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      files.push(...getAllFiles(full, base));
    } else {
      const relativePath = relative(base, full);
      if (!isIgnored(relativePath) && stat.size <= MAX_FILE_SIZE) {
        files.push({ path: relativePath, fullPath: full, size: stat.size });
      }
    }
  }
  return files;
}

function gitBlobSha(content: Buffer): string {
  const header = `blob ${content.length}\0`;
  return createHash('sha1')
    .update(Buffer.concat([Buffer.from(header), content]))
    .digest('hex');
}

async function githubFetch(
  token: string,
  repoSlug: string,
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const url = path.startsWith('http') ? path : `${GITHUB_API}${path}`;
  const method = (options.method || 'GET').toUpperCase();
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });
  if (!res.ok && !(res.status === 404 && method === 'GET')) {
    const text = await res.text();
    throw new Error(
      `GitHub API ${method} ${path} ${res.status} ${res.statusText}: ${text.slice(0, 500)}`,
    );
  }
  if (res.status === 404) return null;
  return res.json();
}

type GithubRef = { object: { sha: string } };
type GithubRepo = { default_branch: string };
type GithubTree = { tree: Array<{ path: string; type: string; sha: string }> };
type GithubCommit = { tree: { sha: string } };

async function ensureBranch(
  token: string,
  repoSlug: string,
  branch: string,
): Promise<string> {
  const ref = (await githubFetch(
    token,
    repoSlug,
    `/repos/${repoSlug}/git/ref/heads/${branch}`,
  )) as GithubRef | null;
  if (ref) return ref.object.sha;

  const repo = (await githubFetch(
    token,
    repoSlug,
    `/repos/${repoSlug}`,
  )) as GithubRepo;
  const defaultRef = (await githubFetch(
    token,
    repoSlug,
    `/repos/${repoSlug}/git/ref/heads/${repo.default_branch}`,
  )) as GithubRef | null;
  if (!defaultRef) throw new Error('Cannot find default branch');

  await githubFetch(token, repoSlug, `/repos/${repoSlug}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({
      ref: `refs/heads/${branch}`,
      sha: defaultRef.object.sha,
    }),
  });
  return defaultRef.object.sha;
}

async function getRemoteTree(
  token: string,
  repoSlug: string,
  commitSha: string,
): Promise<{ treeSha: string; files: Map<string, string> }> {
  const commit = (await githubFetch(
    token,
    repoSlug,
    `/repos/${repoSlug}/git/commits/${commitSha}`,
  )) as GithubCommit;
  if (!commit) return { treeSha: '', files: new Map() };

  const tree = (await githubFetch(
    token,
    repoSlug,
    `/repos/${repoSlug}/git/trees/${commit.tree.sha}?recursive=1`,
  )) as GithubTree;
  const files = new Map<string, string>();
  if (tree?.tree) {
    for (const item of tree.tree) {
      if (item.type === 'blob') {
        files.set(item.path, item.sha);
      }
    }
  }
  return { treeSha: commit.tree.sha, files };
}

async function createBlob(
  token: string,
  repoSlug: string,
  content: Buffer,
): Promise<string> {
  const result = (await githubFetch(
    token,
    repoSlug,
    `/repos/${repoSlug}/git/blobs`,
    {
      method: 'POST',
      body: JSON.stringify({
        content: Buffer.from(content).toString('base64'),
        encoding: 'base64',
      }),
    },
  )) as { sha: string };
  return result.sha;
}

async function createTree(
  token: string,
  repoSlug: string,
  baseTreeSha: string,
  treeItems: unknown[],
): Promise<string> {
  const result = (await githubFetch(
    token,
    repoSlug,
    `/repos/${repoSlug}/git/trees`,
    {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha || undefined,
        tree: treeItems,
      }),
    },
  )) as { sha: string };
  if (!result?.sha) {
    throw new Error('GitHub tree creation did not return a tree SHA');
  }
  return result.sha;
}

async function createCommit(
  token: string,
  repoSlug: string,
  treeSha: string,
  parentSha: string,
  message: string,
): Promise<string> {
  const result = (await githubFetch(
    token,
    repoSlug,
    `/repos/${repoSlug}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: treeSha,
        parents: [parentSha],
      }),
    },
  )) as { sha: string };
  if (!result?.sha) throw new Error('GitHub commit creation did not return a SHA');
  return result.sha;
}

async function updateRef(
  token: string,
  repoSlug: string,
  branch: string,
  commitSha: string,
): Promise<void> {
  await githubFetch(token, repoSlug, `/repos/${repoSlug}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commitSha, force: false }),
  });
}

// ── Actions ──────────────────────────────────────────────────────────────

async function testGitHub(token: string, repoSlug: string): Promise<JsonRecord> {
  const userRes = await fetch(`${GITHUB_API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  const userText = await userRes.text();
  if (!userRes.ok) {
    return {
      ok: false,
      error: `GitHub /user returned ${userRes.status}`,
      details: userText.slice(0, 300),
    };
  }
  const user = JSON.parse(userText) as { login: string; name?: string };

  const repoRes = await fetch(`${GITHUB_API}/repos/${repoSlug}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  const repoText = await repoRes.text();
  if (!repoRes.ok) {
    return {
      ok: false,
      error: `GitHub /repos/${repoSlug} returned ${repoRes.status}`,
      details: repoText.slice(0, 300),
      authenticatedUser: user.login,
    };
  }
  const repo = JSON.parse(repoText) as {
    full_name: string;
    default_branch: string;
    permissions: { push: boolean; admin: boolean; pull: boolean };
  };

  return {
    ok: true,
    authenticatedUser: user.login,
    repoFullName: repo.full_name,
    defaultBranch: repo.default_branch,
    canPush: repo.permissions?.push === true,
    canRead: repo.permissions?.pull === true,
    tokenLength: token.length,
    tokenPrefix: token.slice(0, 4) + '****',
  };
}

async function pushToGitHub(
  token: string,
  repoSlug: string,
  branch: string,
  projectRoot: string,
): Promise<JsonRecord> {
  const headSha = await ensureBranch(token, repoSlug, branch);

  const localFiles = getAllFiles(projectRoot);
  const { treeSha: baseTreeSha, files: remoteFiles } = await getRemoteTree(
    token,
    repoSlug,
    headSha,
  );

  const toUpload: Array<{ path: string; fullPath: string; content: Buffer; isNew: boolean }> = [];
  for (const file of localFiles) {
    const content = readFileSync(file.fullPath);
    const localSha = gitBlobSha(content);
    const remoteSha = remoteFiles.get(file.path);
    if (remoteSha !== localSha) {
      toUpload.push({ ...file, content, isNew: !remoteSha });
    }
  }

  if (toUpload.length === 0) {
    return {
      ok: true,
      message: 'Everything is in sync. Nothing to push.',
      headSha,
      filesPushed: 0,
    };
  }

  // Upload blobs in batches
  const BATCH_SIZE = 5;
  const treeItems: unknown[] = [];
  for (let i = 0; i < toUpload.length; i += BATCH_SIZE) {
    const batch = toUpload.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (file) => {
        const blobSha = await createBlob(token, repoSlug, file.content);
        return {
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: blobSha,
        };
      }),
    );
    treeItems.push(...results);
  }

  // Create tree in chunks
  const CHUNK = 100;
  let currentBase = baseTreeSha;
  let newTreeSha = '';
  for (let i = 0; i < treeItems.length; i += CHUNK) {
    const slice = treeItems.slice(i, i + CHUNK);
    newTreeSha = await createTree(token, repoSlug, currentBase, slice);
    currentBase = newTreeSha;
  }
  if (!newTreeSha) newTreeSha = await createTree(token, repoSlug, baseTreeSha, []);

  const commitMessage = `sync: deploy bridge push ${new Date().toISOString().slice(0, 19)} UTC`;
  const newCommitSha = await createCommit(token, repoSlug, newTreeSha, headSha, commitMessage);
  await updateRef(token, repoSlug, branch, newCommitSha);

  return {
    ok: true,
    message: 'Push complete',
    headSha: newCommitSha,
    filesPushed: toUpload.length,
    newFiles: toUpload.filter((f) => f.isNew).length,
    modifiedFiles: toUpload.filter((f) => !f.isNew).length,
    commitUrl: `https://github.com/${repoSlug}/commit/${newCommitSha}`,
  };
}

async function triggerRenderDeploy(
  apiKey: string,
  serviceId: string,
): Promise<JsonRecord> {
  const res = await fetch(
    `https://api.render.com/v1/services/${encodeURIComponent(serviceId)}/deploys`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ clearCache: 'no' }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: `Render deploy API returned ${res.status}`,
      details: text.slice(0, 500),
    };
  }
  const data = JSON.parse(text) as { id: string; status: string };
  return {
    ok: true,
    deployId: data.id,
    deployStatus: data.status,
  };
}

// ── Main handler ─────────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const startTime = Date.now();

  let body: { action?: string } = {};
  try {
    const text = await request.text();
    if (text) body = JSON.parse(text) as { action?: string };
  } catch {
    // empty body is fine
  }

  const action = body.action || 'full-deploy';
  const token = getGitHubToken();
  const renderKey = getRenderApiKey();
  const renderServiceId = getRenderServiceId();
  const repoSlug = getRepoSlug();
  const branch = readTrimmed(process.env.GITHUB_BRANCH) || 'main';
  const projectRoot = join(process.cwd(), 'expo');

  const envStatus = {
    githubToken: {
      present: token.length > 0,
      length: token.length,
      prefix: token.length > 0 ? token.slice(0, 4) + '****' : '(empty)',
      isPlaceholder: token.toUpperCase().includes('PLACEHOLDER') || token === '',
    },
    renderApiKey: {
      present: renderKey.length > 0,
      length: renderKey.length,
    },
    renderServiceId: {
      present: renderServiceId.length > 0,
      length: renderServiceId.length,
    },
    repoSlug: repoSlug || '(not configured)',
  };

  try {
    // ── GitHub test ──
    if (action === 'github-test') {
      if (!token) {
        return jsonResponse({
          ok: false,
          error: 'GITHUB_TOKEN not available in process.env',
          envStatus,
        });
      }
      const result = await testGitHub(token, repoSlug);
      return jsonResponse({ ...result, envStatus, action, elapsedMs: Date.now() - startTime });
    }

    // ── Render deploy ──
    if (action === 'render-deploy') {
      if (!renderKey || !renderServiceId) {
        return jsonResponse({
          ok: false,
          error: 'RENDER_API_KEY or RENDER_SERVICE_ID not available',
          envStatus,
        });
      }
      const result = await triggerRenderDeploy(renderKey, renderServiceId);
      return jsonResponse({ ...result, envStatus, action, elapsedMs: Date.now() - startTime });
    }

    // ── Full deploy (default) ──
    const steps: JsonRecord = {};

    // Step 1: Test GitHub token
    if (!token) {
      return jsonResponse({
        ok: false,
        error: 'GITHUB_TOKEN not available in process.env (Rork cloud runtime)',
        envStatus,
        action,
      });
    }

    const ghTest = await testGitHub(token, repoSlug);
    steps.githubTest = ghTest;
    if (!ghTest.ok) {
      return jsonResponse({
        ok: false,
        error: 'GitHub token test failed',
        steps,
        envStatus,
        action,
        elapsedMs: Date.now() - startTime,
      });
    }

    // Step 2: Push code to GitHub
    const pushResult = await pushToGitHub(token, repoSlug, branch, projectRoot);
    steps.githubPush = pushResult;
    if (!pushResult.ok) {
      return jsonResponse({
        ok: false,
        error: 'GitHub push failed',
        steps,
        envStatus,
        action,
        elapsedMs: Date.now() - startTime,
      });
    }

    // Step 3: Trigger Render deploy
    if (renderKey && renderServiceId) {
      const renderResult = await triggerRenderDeploy(renderKey, renderServiceId);
      steps.renderDeploy = renderResult;
    } else {
      steps.renderDeploy = {
        ok: false,
        error: 'RENDER_API_KEY or RENDER_SERVICE_ID not available — code pushed to GitHub, deploy manually',
      };
    }

    return jsonResponse({
      ok: true,
      message: 'Full deploy initiated: code pushed to GitHub, Render deploy triggered',
      steps,
      envStatus,
      action,
      elapsedMs: Date.now() - startTime,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        envStatus,
        action,
        elapsedMs: Date.now() - startTime,
      },
      500,
    );
  }
}
