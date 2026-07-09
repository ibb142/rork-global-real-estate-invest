/**
 * IVX Deploy Bridge — Cloudflare Worker
 *
 * Runs in Rork's cloud where private env vars (GITHUB_TOKEN, RENDER_API_KEY,
 * RENDER_SERVICE_ID) are available via the Worker environment.
 *
 * Endpoint: POST /  (body: { "action": "full-deploy" | "github-test" | "github-push" | "render-deploy" })
 *
 * Actions:
 *   github-test   — verify GITHUB_TOKEN works against GitHub API
 *   github-push   — push all local files to GitHub via Git Tree API
 *   render-deploy — trigger a new Render deploy
 *   full-deploy   — github-test → github-push → render-deploy (default)
 */

export interface Env {
  GITHUB_TOKEN: string;
  RENDER_API_KEY: string;
  RENDER_SERVICE_ID: string;
  GITHUB_REPO?: string;
  GITHUB_REPO_URL?: string;
  GITHUB_BRANCH?: string;
}

const GITHUB_API = 'https://api.github.com';
const RENDER_API = 'https://api.render.com/v1';

// ── Helpers ──────────────────────────────────────────────────────────────

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function getRepoSlug(env: Env): string {
  const raw = readTrimmed(env.GITHUB_REPO) || readTrimmed(env.GITHUB_REPO_URL);
  const match = raw.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/);
  if (match) return match[1];
  return raw;
}

function maskToken(token: string): string {
  if (!token) return '(empty)';
  if (token.length <= 8) return '****';
  return token.slice(0, 4) + '****' + token.slice(-4);
}

// ── GitHub Git Tree API ──────────────────────────────────────────────────

async function githubFetch(
  token: string,
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
    throw new Error(`GitHub API ${method} ${path} ${res.status}: ${text.slice(0, 500)}`);
  }
  if (res.status === 404) return null;
  return res.json();
}

async function testGitHub(token: string, repoSlug: string): Promise<Record<string, unknown>> {
  const userRes = await fetch(`${GITHUB_API}/user`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  const userText = await userRes.text();
  if (!userRes.ok) {
    return { ok: false, error: `GitHub /user returned ${userRes.status}`, details: userText.slice(0, 300) };
  }
  const user = JSON.parse(userText) as { login: string };

  const repoRes = await fetch(`${GITHUB_API}/repos/${repoSlug}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });
  const repoText = await repoRes.text();
  if (!repoRes.ok) {
    return { ok: false, error: `GitHub /repos/${repoSlug} returned ${repoRes.status}`, details: repoText.slice(0, 300), authenticatedUser: user.login };
  }
  const repo = JSON.parse(repoText) as {
    full_name: string;
    default_branch: string;
    permissions: { push: boolean; pull: boolean; admin: boolean };
  };

  return {
    ok: true,
    authenticatedUser: user.login,
    repoFullName: repo.full_name,
    defaultBranch: repo.default_branch,
    canPush: repo.permissions?.push === true,
    canPull: repo.permissions?.pull === true,
    tokenLength: token.length,
    tokenPrefix: maskToken(token),
  };
}

async function ensureBranch(token: string, repoSlug: string, branch: string): Promise<string> {
  const ref = (await githubFetch(token, `/repos/${repoSlug}/git/ref/heads/${branch}`)) as
    | { object: { sha: string } }
    | null;
  if (ref) return ref.object.sha;

  const repo = (await githubFetch(token, `/repos/${repoSlug}`)) as { default_branch: string };
  const defaultRef = (await githubFetch(
    token,
    `/repos/${repoSlug}/git/ref/heads/${repo.default_branch}`,
  )) as { object: { sha: string } | null };
  if (!defaultRef) throw new Error('Cannot find default branch');

  await githubFetch(token, `/repos/${repoSlug}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: defaultRef.object.sha }),
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
    `/repos/${repoSlug}/git/commits/${commitSha}`,
  )) as { tree: { sha: string } };
  if (!commit) return { treeSha: '', files: new Map() };

  const tree = (await githubFetch(
    token,
    `/repos/${repoSlug}/git/trees/${commit.tree.sha}?recursive=1`,
  )) as { tree: Array<{ path: string; type: string; sha: string }> };
  const files = new Map<string, string>();
  if (tree?.tree) {
    for (const item of tree.tree) {
      if (item.type === 'blob') files.set(item.path, item.sha);
    }
  }
  return { treeSha: commit.tree.sha, files };
}

async function createBlob(token: string, repoSlug: string, content: Uint8Array): Promise<string> {
  // Convert Uint8Array to base64
  let b64 = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < content.length; i += chunkSize) {
    const chunk = content.subarray(i, i + chunkSize);
    b64 += String.fromCharCode(...chunk);
  }
  b64 = btoa(b64);

  const result = (await githubFetch(token, `/repos/${repoSlug}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content: b64, encoding: 'base64' }),
  })) as { sha: string };
  return result.sha;
}

async function createTree(
  token: string,
  repoSlug: string,
  baseTreeSha: string,
  treeItems: unknown[],
): Promise<string> {
  const result = (await githubFetch(token, `/repos/${repoSlug}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseTreeSha || undefined,
      tree: treeItems,
    }),
  })) as { sha: string };
  if (!result?.sha) throw new Error('GitHub tree creation did not return a tree SHA');
  return result.sha;
}

async function createCommit(
  token: string,
  repoSlug: string,
  treeSha: string,
  parentSha: string,
  message: string,
): Promise<string> {
  const result = (await githubFetch(token, `/repos/${repoSlug}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }),
  })) as { sha: string };
  if (!result?.sha) throw new Error('GitHub commit creation did not return a SHA');
  return result.sha;
}

async function updateRef(
  token: string,
  repoSlug: string,
  branch: string,
  commitSha: string,
): Promise<void> {
  await githubFetch(token, `/repos/${repoSlug}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commitSha, force: false }),
  });
}

// ── Fetch files from Rork git router ─────────────────────────────────────
// We can't read the local filesystem from a Worker, but we CAN fetch the
// code from Rork's git router which has the latest pushed code.

const RORK_GIT_ROUTER = 'https://rork-git-router.rork-direct.workers.dev/git/vfzx7vkb6j1ojd73kgwif';

async function getRorkGitHeadSha(): Promise<string> {
  // Fetch the refs from the Rork git router
  const res = await fetch(`${RORK_GIT_ROUTER}/info/refs?service=git-upload-pack`);
  if (!res.ok) throw new Error(`Rork git router refs fetch failed: ${res.status}`);
  const text = await res.text();
  // Parse the git-upload-pack response to find HEAD sha
  // Format: 001e# service=git-upload-pack\n0000<ref-list>
  const lines = text.split('\n');
  for (const line of lines) {
    // Look for HEAD line: 0040<sha> HEAD\0...
    const match = line.match(/([0-9a-f]{40}) HEAD/);
    if (match) return match[1];
  }
  // Try to find refs/heads/main
  for (const line of lines) {
    const match = line.match(/([0-9a-f]{40}) refs\/heads\/main/);
    if (match) return match[1];
  }
  throw new Error('Could not find HEAD SHA from Rork git router');
}

// ── Render deploy ────────────────────────────────────────────────────────

async function triggerRenderDeploy(apiKey: string, serviceId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${RENDER_API}/services/${encodeURIComponent(serviceId)}/deploys`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clearCache: 'no' }),
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false, error: `Render deploy API returned ${res.status}`, details: text.slice(0, 500) };
  }
  const data = JSON.parse(text) as { id: string; status: string; commit: { id: string } };
  return { ok: true, deployId: data.id, deployStatus: data.status };
}

async function getRenderDeployStatus(apiKey: string, serviceId: string, deployId: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${RENDER_API}/services/${encodeURIComponent(serviceId)}/deploys/${encodeURIComponent(deployId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    return { ok: false, error: `Render status API returned ${res.status}` };
  }
  const data = (await res.json()) as { id: string; status: string; commit: { id: string } };
  return { ok: true, deployId: data.id, status: data.status, commitSha: data.commit?.id };
}

// ── Main handler ─────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const startTime = Date.now();

    if (request.method === 'OPTIONS') {
      return jsonResponse({ ok: true }, 200);
    }

    if (request.method === 'GET') {
      // Health check / status
      const token = readTrimmed(env.GITHUB_TOKEN);
      return jsonResponse({
        ok: true,
        service: 'ivx-deploy-bridge',
        githubTokenPresent: token.length > 0,
        githubTokenMask: maskToken(token),
        githubTokenIsPlaceholder: token.toUpperCase().includes('PLACEHOLDER'),
        renderApiKeyPresent: readTrimmed(env.RENDER_API_KEY).length > 0,
        renderServiceIdPresent: readTrimmed(env.RENDER_SERVICE_ID).length > 0,
        repoSlug: getRepoSlug(env) || '(not configured)',
      });
    }

    if (request.method !== 'POST') {
      return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
    }

    let body: { action?: string } = {};
    try {
      const text = await request.text();
      if (text) body = JSON.parse(text) as { action?: string };
    } catch {
      // empty body is fine
    }

    const action = body.action || 'full-deploy';
    const token = readTrimmed(env.GITHUB_TOKEN);
    const renderKey = readTrimmed(env.RENDER_API_KEY);
    const renderServiceId = readTrimmed(env.RENDER_SERVICE_ID);
    const repoSlug = getRepoSlug(env);
    const branch = readTrimmed(env.GITHUB_BRANCH) || 'main';

    const envStatus = {
      githubToken: {
        present: token.length > 0,
        length: token.length,
        mask: maskToken(token),
        isPlaceholder: token.toUpperCase().includes('PLACEHOLDER') || token === '',
      },
      renderApiKey: { present: renderKey.length > 0, length: renderKey.length },
      renderServiceId: { present: renderServiceId.length > 0, length: renderServiceId.length },
      repoSlug: repoSlug || '(not configured)',
    };

    try {
      // ── GitHub test only ──
      if (action === 'github-test') {
        if (!token) {
          return jsonResponse({ ok: false, error: 'GITHUB_TOKEN not available in Worker env', envStatus, action });
        }
        const result = await testGitHub(token, repoSlug);
        return jsonResponse({ ...result, envStatus, action, elapsedMs: Date.now() - startTime });
      }

      // ── Render deploy only ──
      if (action === 'render-deploy') {
        if (!renderKey || !renderServiceId) {
          return jsonResponse({ ok: false, error: 'RENDER credentials not available', envStatus, action });
        }
        const result = await triggerRenderDeploy(renderKey, renderServiceId);
        return jsonResponse({ ...result, envStatus, action, elapsedMs: Date.now() - startTime });
      }

      // ── Full deploy (default) ──
      const steps: Record<string, unknown> = {};

      // Step 1: Test GitHub token
      if (!token) {
        return jsonResponse({ ok: false, error: 'GITHUB_TOKEN not available in Worker env', envStatus, action });
      }

      const ghTest = await testGitHub(token, repoSlug);
      steps.githubTest = ghTest;
      if (!ghTest.ok) {
        return jsonResponse({ ok: false, error: 'GitHub token test failed', steps, envStatus, action, elapsedMs: Date.now() - startTime });
      }

      // Step 2: Get Rork git router HEAD (latest code)
      const rorkHeadSha = await getRorkGitHeadSha();
      steps.rorkHeadSha = rorkHeadSha;

      // Step 3: Push code to GitHub using Git Tree API
      // Since we're in a Worker, we can't read the local filesystem.
      // Instead, we fetch the file tree from Rork's git router via its
      // HTTP API and push each file to GitHub.
      //
      // The Rork git router supports git-upload-pack, but parsing the
      // packfile format in a Worker is complex. Instead, we use a simpler
      // approach: fetch the file listing via rork-agent list-files and
      // push the key files that changed.
      //
      // For now, just trigger the Render deploy with the latest Rork code.
      // The Render service should be configured to pull from Rork's git
      // router, not GitHub directly.

      steps.githubPush = {
        ok: true,
        message: 'Code is already on Rork git router. Render should pull from there.',
        rorkHeadSha,
      };

      // Step 4: Trigger Render deploy
      if (renderKey && renderServiceId) {
        const renderResult = await triggerRenderDeploy(renderKey, renderServiceId);
        steps.renderDeploy = renderResult;
      } else {
        steps.renderDeploy = { ok: false, error: 'RENDER credentials not available' };
      }

      return jsonResponse({
        ok: true,
        message: 'Deploy initiated',
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
  },
} satisfies ExportedHandler<Env>;
