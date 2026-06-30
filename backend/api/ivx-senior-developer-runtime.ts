import {
  IVX_GIT_DEPLOY_CONFIRM_TEXT,
  IVX_SAFE_PATCH_CONFIRM_TEXT,
  IVX_SENIOR_DEVELOPER_RUNTIME_MARKER,
  auditIVXGithubRuntimeAccess,
  auditIVXProductionCredentialRuntime,
  buildIVXSeniorDeveloperStatusSnapshot,
  listSeniorDeveloperWorkSessions,
  runIVXSeniorDeveloperTask,
} from '../services/ivx-senior-developer-runtime';
import {
  IVXOwnerApprovalError,
  assertIVXOwnerOnly,
  assertIVXRegisteredOwnerBearer,
  ownerOnlyJson,
  ownerOnlyOptions,
} from './owner-only';

type SeniorDeveloperRiskLevel = 'low' | 'medium' | 'high';

type SeniorDeveloperRunRequest = {
  goal?: unknown;
  proposedPlan?: unknown;
  filesAffected?: unknown;
  riskLevel?: unknown;
  rollbackOption?: unknown;
  approvePatch?: unknown;
  patchConfirmationText?: unknown;
  approveGitDeploy?: unknown;
  gitDeployConfirmationText?: unknown;
  validationMode?: unknown;
};

function readTrimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readBoolean(value: unknown): boolean {
  return value === true || readTrimmed(value).toLowerCase() === 'true';
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => readTrimmed(item)).filter(Boolean))).slice(0, 25);
}

function normalizeRiskLevel(value: unknown): SeniorDeveloperRiskLevel {
  const risk = readTrimmed(value).toLowerCase();
  return risk === 'low' || risk === 'high' ? risk : 'medium';
}

function normalizeValidationMode(value: unknown): 'focused' | 'typecheck' {
  return readTrimmed(value).toLowerCase() === 'typecheck' ? 'typecheck' : 'focused';
}

function statusForError(error: unknown): number {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('missing bearer token') || message.includes('invalid or expired')) return 401;
  if (message.includes('privileged ivx access is required') || message.includes('owner')) return 403;
  return 500;
}

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'IVX senior developer runtime failed.';
  if (error instanceof IVXOwnerApprovalError) {
    return ownerOnlyJson({
      ok: false,
      ownerOnly: true,
      marker: IVX_SENIOR_DEVELOPER_RUNTIME_MARKER,
      error: message.slice(0, 500),
      ownerApproval: error.proof,
      exactBlocker: error.proof.blocker ?? message.slice(0, 500),
      secretValuesReturned: false,
      timestamp: new Date().toISOString(),
    }, error.status);
  }

  return ownerOnlyJson({
    ok: false,
    marker: IVX_SENIOR_DEVELOPER_RUNTIME_MARKER,
    error: message.slice(0, 500),
    secretValuesReturned: false,
    timestamp: new Date().toISOString(),
  }, statusForError(error));
}

export function OPTIONS(): Response {
  return ownerOnlyOptions();
}

export async function handleIVXSeniorDeveloperStatusRequest(request: Request): Promise<Response> {
  try {
    await assertIVXOwnerOnly(request);
    const recentSessions = await listSeniorDeveloperWorkSessions(20);
    return ownerOnlyJson({
      ...buildIVXSeniorDeveloperStatusSnapshot(),
      ownerOnly: true,
      workSessionMemory: {
        durable: recentSessions.some((session) => session.durable),
        recentSessionCount: recentSessions.length,
        recentSessions,
      },
      routes: {
        status: 'GET /api/ivx/senior-developer/status',
        githubAudit: 'GET /api/ivx/senior-developer/github-audit',
        credentialAudit: 'GET /api/ivx/senior-developer/credential-audit',
        run: 'POST /api/ivx/senior-developer/run (requires real Supabase owner bearer + IVX_OWNER_REGISTRATION_EMAILS match for mutation)',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleIVXSeniorDeveloperGithubAuditRequest(request: Request): Promise<Response> {
  try {
    const { approval } = await assertIVXRegisteredOwnerBearer(request, 'senior_developer_github_audit');
    const github = await auditIVXGithubRuntimeAccess();
    return ownerOnlyJson({
      ok: github.canReadRepo && github.canPush,
      ownerOnly: true,
      ownerApproval: approval,
      marker: IVX_SENIOR_DEVELOPER_RUNTIME_MARKER,
      github,
      deniedByGithub: Boolean(github.auth.httpStatus && github.auth.httpStatus >= 400)
        || Boolean(github.repository.httpStatus && github.repository.httpStatus >= 400)
        || Boolean(github.branchRef.httpStatus && github.branchRef.httpStatus >= 400)
        || (github.canReadRepo && !github.canPush),
      secretValuesReturned: false,
      timestamp: new Date().toISOString(),
    }, github.canReadRepo && github.canPush ? 200 : 409);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleIVXSeniorDeveloperCredentialAuditRequest(request: Request): Promise<Response> {
  try {
    const { approval } = await assertIVXRegisteredOwnerBearer(request, 'senior_developer_github_render_audit');
    const audit = await auditIVXProductionCredentialRuntime();
    return ownerOnlyJson({
      ok: audit.ok,
      ownerOnly: true,
      ownerApproval: approval,
      marker: IVX_SENIOR_DEVELOPER_RUNTIME_MARKER,
      audit,
      exactBlocker: audit.ok ? null : audit.blockers[0] ?? 'Credential/runtime audit did not pass.',
      secretValuesReturned: false,
      timestamp: new Date().toISOString(),
    }, audit.ok ? 200 : 409);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function handleIVXSeniorDeveloperRunRequest(request: Request): Promise<Response> {
  try {
    const { approval } = await assertIVXRegisteredOwnerBearer(request, 'senior_developer_git_commit_render_deploy');
    const body = await request.json().catch((): SeniorDeveloperRunRequest => ({}));
    const goal = readTrimmed(body.goal);
    const isSystemMode = approval.role === 'system' && approval.guardMode === 'system_bypass';
    const proposedPlan = readTrimmed(body.proposedPlan);
    const filesAffected = readStringArray(body.filesAffected);
    const riskLevel = normalizeRiskLevel(body.riskLevel);
    const rollbackOption = readTrimmed(body.rollbackOption);
    const approveGitDeploy = readBoolean(body.approveGitDeploy);
    if (!goal) {
      return ownerOnlyJson({
        ok: false,
        marker: IVX_SENIOR_DEVELOPER_RUNTIME_MARKER,
        error: 'A senior developer goal is required.',
        requiredPatchConfirmationText: IVX_SAFE_PATCH_CONFIRM_TEXT,
        requiredGitDeployConfirmationText: IVX_GIT_DEPLOY_CONFIRM_TEXT,
        ownerApproval: approval,
        secretValuesReturned: false,
        timestamp: new Date().toISOString(),
      }, 400);
    }

    if (!isSystemMode && approveGitDeploy && (!proposedPlan || filesAffected.length === 0 || !rollbackOption)) {
      return ownerOnlyJson({
        ok: false,
        marker: IVX_SENIOR_DEVELOPER_RUNTIME_MARKER,
        error: 'Owner-approved senior developer mutation requires a visible proposed plan, files affected, risk level, and rollback option before GitHub/Render execution.',
        exactBlocker: 'approval_contract_missing_plan_files_or_rollback',
        requiredFields: ['proposedPlan', 'filesAffected', 'riskLevel', 'rollbackOption'],
        ownerApproval: approval,
        secretValuesReturned: false,
        timestamp: new Date().toISOString(),
      }, 400);
    }

    const approvedAction = {
      proposedPlan,
      filesAffected,
      riskLevel,
      rollbackOption,
      rollbackAvailable: rollbackOption.length > 0,
      auditLog: [
        `ownerSessionDetected=${approval.ownerSessionDetected}`,
        `bearerAccepted=${approval.bearerAccepted}`,
        `ownerVerified=${approval.ownerVerified}`,
        `role=${approval.role}`,
        `guardMode=${approval.guardMode}`,
        `filesAffected=${filesAffected.join(', ')}`,
        `riskLevel=${riskLevel}`,
      ],
      secretValuesReturned: false as const,
    };

    const result = await runIVXSeniorDeveloperTask({
      goal,
      approvePatch: readBoolean(body.approvePatch),
      patchConfirmationText: readTrimmed(body.patchConfirmationText),
      approveGitDeploy,
      gitDeployConfirmationText: readTrimmed(body.gitDeployConfirmationText),
      validationMode: normalizeValidationMode(body.validationMode),
      ownerApprovedAction: approvedAction,
      systemMode: isSystemMode,
    });

    return ownerOnlyJson({
      ok: result.ok,
      ownerOnly: true,
      ownerApproval: approval,
      proof: {
        ownerSessionDetected: approval.ownerSessionDetected,
        bearerAccepted: approval.bearerAccepted,
        ownerVerified: approval.ownerVerified,
        githubCommitHash: result.gitDeployOperator.github.commitSha,
        renderDeployId: result.gitDeployOperator.render.deployId,
        productionHealthResult: result.productionVerification,
        exactBlocker: result.ok ? null : result.gitDeployOperator.reason || result.productionVerification.error || 'Senior developer production proof did not complete.',
        approvedAction,
      },
      approvedAction,
      result,
      secretValuesReturned: false,
      timestamp: new Date().toISOString(),
    }, result.ok ? 200 : 409);
  } catch (error) {
    return errorResponse(error);
  }
}
