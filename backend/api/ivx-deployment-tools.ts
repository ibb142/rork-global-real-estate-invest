/**
 * IVX Deployment Tools — Unified API Routes
 *
 * Public endpoints (no auth needed for status):
 *   GET  /api/ivx/deploy-tools/brain         — full deployment brain assessment
 *   GET  /api/ivx/deploy-tools/brain/health  — quick health check
 *   GET  /api/ivx/deploy-tools/github        — GitHub tool status
 *   GET  /api/ivx/deploy-tools/render        — Render tool status
 *   GET  /api/ivx/deploy-tools/supabase      — Supabase tool status
 *   GET  /api/ivx/deploy-tools/vercel        — Vercel tool status
 *   GET  /api/ivx/deploy-tools/evidence      — production evidence
 *   GET  /api/ivx/deploy-tools/credentials   — credential sync status
 *   GET  /api/ivx/deploy-tools/dashboard     — unified dashboard (all in one)
 *
 * Owner-only endpoints (require auth):
 *   POST /api/ivx/deploy-tools/render/deploy — trigger Render deploy
 *   POST /api/ivx/deploy-tools/render/rollback — rollback Render deploy
 *   POST /api/ivx/deploy-tools/render/auto-deploy — toggle auto-deploy
 */
import { assertIVXOwnerOnly, ownerOnlyJson, ownerOnlyOptions } from './owner-only';
import * as GitHubTool from '../services/ivx-deployment-tools/github-tool';
import * as RenderTool from '../services/ivx-deployment-tools/render-tool';
import * as SupabaseTool from '../services/ivx-deployment-tools/supabase-tool';
import * as VercelTool from '../services/ivx-deployment-tools/vercel-tool';
import * as ProductionEvidence from '../services/ivx-deployment-tools/production-evidence';
import * as CredentialSync from '../services/ivx-deployment-tools/credential-sync';
import { assessDeploymentBrain, quickHealthCheck } from '../services/ivx-deployment-tools/deployment-brain';

// ─── CORS Helpers ──────────────────────────────────────────────────────

const PUBLIC_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
} as const;

function publicJson(payload: Record<string, unknown>, status: number = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: PUBLIC_HEADERS });
}

// ─── OPTIONS ────────────────────────────────────────────────────────────

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: PUBLIC_HEADERS });
}

// ─── BRAIN ──────────────────────────────────────────────────────────────

export async function handleBrain(): Promise<Response> {
  try {
    const brain = await assessDeploymentBrain();
    return publicJson({ ok: true, brain });
  } catch (err) {
    return publicJson({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

export async function handleBrainHealth(): Promise<Response> {
  try {
    const health = await quickHealthCheck();
    return publicJson({ ok: true, health });
  } catch (err) {
    return publicJson({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

// ─── GITHUB TOOL ────────────────────────────────────────────────────────

export async function handleGitHubStatus(): Promise<Response> {
  try {
    const [fullStatus, branches, commit, perms] = await Promise.all([
      GitHubTool.getFullGitHubStatus(),
      GitHubTool.getBranches(),
      GitHubTool.getLatestCommit(),
      GitHubTool.verifyPermissions(),
    ]);

    return publicJson({
      ok: fullStatus.ok,
      error: fullStatus.error,
      branches: branches.branches ?? [],
      commit: commit.commit ?? null,
      permissions: perms.permissions ?? null,
    });
  } catch (err) {
    return publicJson({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

// ─── RENDER TOOL ────────────────────────────────────────────────────────

export async function handleRenderStatus(): Promise<Response> {
  try {
    const fullStatus = await RenderTool.getFullRenderStatus();
    return publicJson({
      ok: fullStatus.ok,
      error: fullStatus.error,
      service: fullStatus.service ?? null,
      deploys: fullStatus.deploys ?? [],
      envVarsCount: fullStatus.envVars?.length ?? 0,
      autoDeploy: fullStatus.autoDeployEnabled ?? null,
    });
  } catch (err) {
    return publicJson({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

export async function handleRenderDeploy(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
  } catch (err) {
    return ownerOnlyJson({ ok: false, error: err instanceof Error ? err.message : 'unauthorized' }, 401);
  }

  try {
    let clearCache = false;
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { clearCache?: boolean };
      clearCache = body.clearCache === true;
    }
    const result = await RenderTool.triggerDeploy(clearCache);
    return ownerOnlyJson({
      ok: result.ok,
      error: result.error,
      deploy: result.deploy ?? null,
    });
  } catch (err) {
    return ownerOnlyJson({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

export async function handleRenderRollback(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
  } catch (err) {
    return ownerOnlyJson({ ok: false, error: err instanceof Error ? err.message : 'unauthorized' }, 401);
  }

  try {
    const body = await request.json().catch(() => ({})) as { deployId?: string };
    const deployId = body.deployId;
    if (!deployId) {
      return ownerOnlyJson({ ok: false, error: 'deployId is required' }, 400);
    }
    const result = await RenderTool.rollbackDeploy(deployId);
    return ownerOnlyJson({
      ok: result.ok,
      error: result.error,
      deploy: result.deploy ?? null,
    });
  } catch (err) {
    return ownerOnlyJson({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

export async function handleRenderAutoDeploy(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
  } catch (err) {
    return ownerOnlyJson({ ok: false, error: err instanceof Error ? err.message : 'unauthorized' }, 401);
  }

  try {
    const body = await request.json().catch(() => ({})) as { enabled?: boolean };
    const enabled = body.enabled !== false;
    const result = await RenderTool.setAutoDeploy(enabled);
    return ownerOnlyJson({
      ok: result.ok,
      error: result.error,
      autoDeployEnabled: result.autoDeployEnabled ?? null,
    });
  } catch (err) {
    return ownerOnlyJson({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

// ─── SUPABASE TOOL ──────────────────────────────────────────────────────

export async function handleSupabaseStatus(): Promise<Response> {
  try {
    const [connections, tables, auth, rw, critical] = await Promise.all([
      SupabaseTool.testConnections(),
      SupabaseTool.listTables(),
      SupabaseTool.checkAuth(),
      SupabaseTool.testReadWrite(),
      SupabaseTool.checkCriticalTables(),
    ]);

    return publicJson({
      ok: connections.ok,
      error: [connections.error, tables.error, auth.error, rw.error, critical.error].filter(Boolean).join('; ') || null,
      connections: connections.connections ?? [],
      tablesCount: tables.tables?.length ?? 0,
      auth: auth.auth ?? null,
      readTest: rw.readTest ?? null,
      writeTest: rw.writeTest ?? null,
      criticalTables: critical.specificTables ?? {},
    });
  } catch (err) {
    return publicJson({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

// ─── VERCEL TOOL ────────────────────────────────────────────────────────

export async function handleVercelStatus(): Promise<Response> {
  try {
    const configured = (process.env.VERCEL_TOKEN ?? '').trim().length > 0;
    if (!configured) {
      return publicJson({
        ok: false,
        error: 'VERCEL_TOKEN not configured — Vercel tool is inactive',
        configured: false,
        projects: [],
        deploys: [],
      });
    }

    const fullStatus = await VercelTool.getFullVercelStatus();
    return publicJson({
      ok: fullStatus.ok,
      error: fullStatus.error,
      configured: true,
      projects: fullStatus.projects ?? [],
      deploys: fullStatus.deploys ?? [],
    });
  } catch (err) {
    return publicJson({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

// ─── PRODUCTION EVIDENCE ────────────────────────────────────────────────

export async function handleEvidence(): Promise<Response> {
  try {
    const evidence = await ProductionEvidence.generateFullEvidence();
    return publicJson({
      ok: true,
      evidence,
    });
  } catch (err) {
    return publicJson({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

// ─── CREDENTIALS ────────────────────────────────────────────────────────

export async function handleCredentials(): Promise<Response> {
  try {
    const creds = await CredentialSync.discoverAllCredentials();
    return publicJson({
      ok: creds.ok,
      credentials: creds.credentials.map(c => ({
        name: c.name,
        category: c.category,
        required: c.required,
        validation: c.validation,
        validationDetail: c.validationDetail,
        sources: c.sources.map(s => ({ source: s.source, present: s.present })),
        tested: c.tested,
      })),
      summary: creds.summary,
      gaps: creds.gaps,
      recommendations: creds.recommendations,
    });
  } catch (err) {
    return publicJson({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

// ─── UNIFIED DASHBOARD ──────────────────────────────────────────────────

export async function handleDashboard(): Promise<Response> {
  try {
    const [brain, evidence, credentials] = await Promise.all([
      assessDeploymentBrain(),
      ProductionEvidence.generateFullEvidence(),
      CredentialSync.discoverAllCredentials(),
    ]);

    return publicJson({
      ok: true,
      brain,
      evidence: {
        endpoints: evidence.endpoints.map(e => ({
          name: e.name,
          ok: e.ok,
          status: e.status,
          latencyMs: e.latencyMs,
          error: e.error,
        })),
        commitMatch: evidence.commitMatch,
        commits: evidence.commits,
        allEndpointsOk: evidence.allEndpointsOk,
        healthStatus: evidence.healthStatus,
      },
      credentials: {
        summary: credentials.summary,
        gaps: credentials.gaps,
        recommendations: credentials.recommendations,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return publicJson({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}
