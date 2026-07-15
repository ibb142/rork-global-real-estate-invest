import { describe, expect, test } from 'bun:test';
import {
  buildSeniorDeveloperWorkerStatus,
  enqueueSeniorDeveloperJob,
  getSeniorDeveloperJob,
  listSeniorDeveloperJobs,
  summarizeProof,
} from './services/ivx-senior-developer-worker';
import type { IVXSeniorDeveloperRunProof } from './services/ivx-senior-developer-runtime';

function makeProof(overrides: Partial<IVXSeniorDeveloperRunProof> = {}): IVXSeniorDeveloperRunProof {
  const base = {
    ok: true,
    endToEndProductionComplete: true,
    jobId: 'job-1',
    goal: 'Build a new module from scratch',
    changedFiles: ['backend/services/example.ts'],
    validations: [
      { block: 35, command: 'bun test routing', cwd: '.', ok: true, exitCode: 0, durationMs: 10, stdoutTail: '', stderrTail: '', error: null },
      { block: 35, command: 'bunx tsc --noEmit', cwd: '.', ok: true, exitCode: 0, durationMs: 20, stdoutTail: '', stderrTail: '', error: null },
    ],
    gitDeployOperator: {
      block: 36,
      status: 'executed',
      github: { repoConfigured: true, tokenConfigured: true, canCommitWithApproval: true, commitAttempted: true, commitSha: 'deadbeef', commitUrl: 'https://github.com/x/y/commit/deadbeef', branch: 'main', committedPaths: ['backend/services/example.ts'], error: null, accessCheck: null },
      render: { serviceConfigured: true, apiKeyConfigured: true, canDeployWithApproval: true, deployAttempted: true, deployId: 'dep-1', deployStatus: 'live', deployUrl: null, error: null },
      requiredConfirmationText: 'CONFIRM_IVX_GIT_DEPLOY_OPERATOR',
      reason: 'executed',
      secretValuesReturned: false,
    },
    productionVerification: { endpoint: 'https://api.ivxholding.com/health', attempted: true, ok: true, httpStatus: 200, bodyPreview: '{}', error: null },
    generatedFeature: { built: true, feature: { slug: 'new-module' }, liveRoute: '/x', listRoute: '/y', visibleAfterDeployCompletes: true },
    auditFiles: { json: 'logs/audit/job-1.json', jsonl: 'logs/audit/job-1.jsonl' },
    generatedAt: '2026-06-16T00:00:00.000Z',
  };
  return { ...base, ...overrides } as unknown as IVXSeniorDeveloperRunProof;
}

describe('summarizeProof', () => {
  test('maps a successful end-to-end proof to a COMPLETE secret-safe result', () => {
    const result = summarizeProof('job-1', makeProof(), {
      requestedCommit: 'deadbeef',
      liveCommit: 'deadbeef',
      match: true,
      deploymentId: 'dep-1',
      deployStatus: 'live',
      deployPolled: true,
      deployReachedTerminalState: true,
      deployPollAttempts: 1,
      versionEndpoint: 'https://api.ivxholding.com/version',
      versionHttpStatus: 200,
      versionAttempts: 1,
      error: null,
      secretValuesReturned: false,
    });

    expect(result.finalStatus).toBe('COMPLETE');
    expect(result.commitCreated).toBe(true);
    expect(result.commitSha).toBe('deadbeef');
    expect(result.pushed).toBe(true);
    expect(result.deployVerified).toBe(true);
    expect(result.commitMatch).toBe(true);
    expect(result.testsPassed).toBe(true);
    expect(result.typecheckRun).toBe(true);
    expect(result.healthOk).toBe(true);
    // No secret values are ever serialized into the ledger summary.
    expect(JSON.stringify(result)).not.toContain('Bearer');
  });

  test('reports LOCAL_ONLY when validation passed but deploy was not end-to-end', () => {
    const proof = makeProof({ endToEndProductionComplete: false, ok: true });
    const result = summarizeProof('job-2', proof, null);
    expect(result.finalStatus).toBe('LOCAL_ONLY');
    expect(result.deployVerified).toBe(false);
  });

  test('reports BLOCKED when credentials are missing', () => {
    const proof = makeProof({
      ok: false,
      endToEndProductionComplete: false,
      gitDeployOperator: {
        ...makeProof().gitDeployOperator,
        status: 'blocked_missing_credentials',
        reason: 'GITHUB_TOKEN missing',
      } as IVXSeniorDeveloperRunProof['gitDeployOperator'],
    });
    const result = summarizeProof('job-3', proof, null);
    expect(result.finalStatus).toBe('BLOCKED');
    expect(result.error).toContain('GITHUB_TOKEN');
  });
});

describe('worker queue', () => {
  test('rejects a job without verified owner approval', async () => {
    await expect(
      enqueueSeniorDeveloperJob({
        goal: 'do a thing',
        ownerApproved: false,
        approvePatch: false,
        approveGitDeploy: false,
        validationMode: 'focused',
        systemMode: false,
        ownerApprovedAction: null,
      }),
    ).rejects.toThrow(/owner approval/i);
  });

  test('enqueues an owner-approved job and exposes it via getJob/listJobs', async () => {
    const job = await enqueueSeniorDeveloperJob({
      goal: 'inspect the repo only',
      ownerApproved: true,
      approvePatch: false,
      approveGitDeploy: false,
      validationMode: 'focused',
      systemMode: false,
      ownerApprovedAction: null,
    });

    expect(job.jobId).toMatch(/^ivx-worker-/);
    expect(['queued', 'running', 'completed', 'failed', 'blocked']).toContain(job.status);

    const fetched = await getSeniorDeveloperJob(job.jobId);
    expect(fetched?.jobId).toBe(job.jobId);

    const jobs = await listSeniorDeveloperJobs(10);
    expect(jobs.some((j) => j.jobId === job.jobId)).toBe(true);
  });
});

describe('buildSeniorDeveloperWorkerStatus', () => {
  test('declares Rork is not required as the executor and all capabilities are present', () => {
    const status = buildSeniorDeveloperWorkerStatus();
    expect(status.rorkRequiredAsExecutor).toBe(false);
    const capabilities = status.capabilities as Record<string, boolean>;
    expect(capabilities.commitService).toBe(true);
    expect(capabilities.renderDeploy).toBe(true);
    expect(capabilities.proofLedger).toBe(true);
    expect(capabilities.ownerApprovalGate).toBe(true);
  });
});
