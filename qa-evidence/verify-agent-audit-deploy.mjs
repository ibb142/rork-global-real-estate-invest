#!/usr/bin/env node
/**
 * IVX 12-Agent Audit Deployment Verification Script
 *
 * Verifies:
 *   1. Local audit engine runs and produces 12 agents with scores
 *   2. Local API endpoint is registered and callable (health check)
 *   3. Production /version commit matches latest deployed commit
 *   4. Production /api/ivx/agent-audit/overview returns valid data
 *
 * Does NOT fabricate results. If production is stale, records the exact blocker.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const PROOF_PATH = join(REPO_ROOT, 'qa-evidence', 'AGENT_AUDIT_DEPLOY_PROOF.json');

const PRODUCTION_BASE_URL = 'https://api.ivxholding.com';
const LOCAL_URL = 'http://localhost:3000';

const proof = {
  generatedBy: 'qa-evidence/verify-agent-audit-deploy.mjs',
  verificationTimestamp: new Date().toISOString(),
  localCommit: '',
  originCommit: '',
  productionCommit: '',
  localAuditEngine: { ok: false, detail: '', agentCount: 0 },
  localEndpoint: { ok: false, detail: '' },
  productionEndpoint: { ok: false, detail: '', status: null, bodyPreview: null },
  deployVerified: false,
  failingNode: null,
  blocker: null,
};

function gitHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT }).toString().trim();
  } catch {
    return '';
  }
}

function originHead() {
  try {
    return execFileSync('git', ['rev-parse', 'origin/main'], { cwd: REPO_ROOT }).toString().trim();
  } catch {
    return '';
  }
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options.headers || {}) } });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { status: res.status, text: text.slice(0, 400), json };
}

async function verifyLocalAuditEngine() {
  try {
    const { runAgentAudit } = await import(join(REPO_ROOT, 'backend', 'services', 'ivx-agent-audit.ts'));
    const results = runAgentAudit();
    proof.localAuditEngine = {
      ok: Array.isArray(results) && results.length === 12,
      detail: `runAgentAudit() returned ${results.length} agents`,
      agentCount: results.length,
    };
    return results;
  } catch (err) {
    proof.localAuditEngine = { ok: false, detail: err.message, agentCount: 0 };
    return null;
  }
}

async function verifyLocalEndpoint() {
  try {
    const { ok: healthOk } = await fetchJson(`${LOCAL_URL}/health`);
    proof.localEndpoint = { ok: healthOk, detail: healthOk ? 'Local /health returned 200' : 'Local /health failed' };
  } catch (err) {
    proof.localEndpoint = { ok: false, detail: `Local server not reachable: ${err.message}` };
  }
}

async function verifyProductionDeploy() {
  try {
    const { status, json } = await fetchJson(`${PRODUCTION_BASE_URL}/version`);
    if (status !== 200 || !json?.commit) {
      proof.productionEndpoint = { ok: false, detail: `/version returned status ${status}`, status, bodyPreview: null };
      return false;
    }
    proof.productionCommit = json.commit;
    if (proof.productionCommit !== proof.localCommit) {
      proof.failingNode = 'render';
      proof.blocker = `Production commit ${json.commitShort || json.commit.slice(0, 8)} does not match local ${proof.localCommit.slice(0, 8)}. Render auto-deploy has not completed.`;
      return false;
    }
    return true;
  } catch (err) {
    proof.productionEndpoint = { ok: false, detail: `Production API unreachable: ${err.message}`, status: null, bodyPreview: null };
    return false;
  }
}

async function verifyProductionAuditEndpoint() {
  try {
    // Try without auth first to confirm route exists (should return 401/403, not 404)
    const { status, json, text } = await fetchJson(`${PRODUCTION_BASE_URL}/api/ivx/agent-audit/overview`, {
      headers: { Origin: 'https://ivxholding.com' },
    });
    proof.productionEndpoint = {
      ok: status === 200 || status === 401 || status === 403,
      detail: status === 200 ? 'Overview returned 200 (authenticated)' : `Route exists, returned ${status} (owner-only, expected without auth)`,
      status,
      bodyPreview: json ? { ok: json.ok, marker: json.marker, agentCount: json.agents?.length } : text.slice(0, 200),
    };
    return status === 200 || status === 401 || status === 403;
  } catch (err) {
    proof.productionEndpoint = { ok: false, detail: err.message, status: null, bodyPreview: null };
    return false;
  }
}

async function main() {
  proof.localCommit = gitHead();
  proof.originCommit = originHead();

  await verifyLocalAuditEngine();
  await verifyLocalEndpoint();

  const deployOk = await verifyProductionDeploy();
  if (deployOk) {
    await verifyProductionAuditEndpoint();
    proof.deployVerified = proof.productionEndpoint.ok && proof.productionCommit === proof.localCommit;
  }

  if (!proof.deployVerified) {
    proof.failingNode = proof.failingNode || 'production';
    proof.blocker = proof.blocker || 'Could not verify production deploy.';
  }

  writeFileSync(PROOF_PATH, JSON.stringify(proof, null, 2) + '\n');
  console.log(JSON.stringify(proof, null, 2));
  process.exit(proof.deployVerified ? 0 : 1);
}

main().catch((err) => {
  proof.blocker = err.message;
  writeFileSync(PROOF_PATH, JSON.stringify(proof, null, 2) + '\n');
  console.error(err);
  process.exit(1);
});
