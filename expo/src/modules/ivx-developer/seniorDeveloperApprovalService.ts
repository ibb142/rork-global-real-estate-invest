/**
 * Owner-approved senior developer production mutation service.
 * Sends only the logged-in Supabase session bearer to the backend; secrets stay server-side.
 */
import { getIVXOwnerAIConfigAudit } from '@/lib/ivx-supabase-client';
import { supabase } from '@/lib/supabase';

export const IVX_SAFE_PATCH_CONFIRM_TEXT = 'CONFIRM_IVX_SAFE_CODE_PATCH' as const;
export const IVX_GIT_DEPLOY_CONFIRM_TEXT = 'CONFIRM_IVX_GIT_DEPLOY_OPERATOR' as const;

export type IVXOwnerMutationApprovalProof = {
  ownerSessionDetected: boolean;
  bearerAccepted: boolean;
  ownerVerified: boolean;
  ownerEmailMatched: boolean;
  ownerEmailMasked: string | null;
  userId: string | null;
  role: string | null;
  guardMode: string | null;
  allowlistConfigured: boolean;
  action: string;
  blocker: string | null;
  secretValuesReturned: false;
};

export type IVXSeniorDeveloperCredentialAudit = {
  ok: boolean;
  runtimeInjectionIssue: boolean;
  blockers: string[];
  secretValuesReturned: false;
  github?: {
    tokenConfigured?: boolean;
    repoConfigured?: boolean;
    auth?: { attempted?: boolean; ok?: boolean; httpStatus?: number | null; login?: string | null; scopes?: string | null; error?: string | null };
    repository?: { attempted?: boolean; ok?: boolean; httpStatus?: number | null; defaultBranch?: string | null; permissions?: { admin?: boolean; maintain?: boolean; push?: boolean }; error?: string | null };
    branchRef?: { attempted?: boolean; ok?: boolean; httpStatus?: number | null; sha?: string | null; error?: string | null };
    canReadRepo?: boolean;
    canPush?: boolean;
  };
  render?: {
    apiKeyConfigured?: boolean;
    serviceConfigured?: boolean;
    service?: { attempted?: boolean; ok?: boolean; httpStatus?: number | null; id?: string | null; name?: string | null; error?: string | null };
    deployPermission?: { attempted?: boolean; ok?: boolean; httpStatus?: number | null; latestDeployId?: string | null; latestDeployStatus?: string | null; error?: string | null };
    canDeploy?: boolean;
  };
};

export type IVXProductionVerification = {
  endpoint: string;
  attempted: boolean;
  ok: boolean;
  httpStatus: number | null;
  bodyPreview: string | null;
  error: string | null;
};

export type IVXSeniorDeveloperRiskLevel = 'low' | 'medium' | 'high';

export type IVXSeniorDeveloperApprovedAction = {
  proposedPlan: string;
  filesAffected: string[];
  riskLevel: IVXSeniorDeveloperRiskLevel;
  rollbackOption: string;
  rollbackAvailable: boolean;
  auditLog: string[];
  secretValuesReturned: false;
};

export type IVXSeniorDeveloperRunProof = {
  ownerSessionDetected: boolean;
  bearerAccepted: boolean;
  ownerVerified: boolean;
  githubCommitHash: string | null;
  renderDeployId: string | null;
  productionHealthResult: IVXProductionVerification | null;
  exactBlocker: string | null;
  approvedAction?: IVXSeniorDeveloperApprovedAction;
};

export type IVXSeniorDeveloperRunResponse = {
  ok: boolean;
  ownerOnly: boolean;
  ownerApproval?: IVXOwnerMutationApprovalProof;
  proof?: IVXSeniorDeveloperRunProof;
  result?: {
    ok?: boolean;
    endToEndProductionComplete?: boolean;
    jobId?: string;
    auditFiles?: { json?: string; jsonl?: string };
    gitDeployOperator?: {
      status?: string;
      reason?: string;
      github?: { commitSha?: string | null; branch?: string | null; error?: string | null };
      render?: { deployId?: string | null; deployStatus?: string | null; error?: string | null };
    };
    productionVerification?: IVXProductionVerification;
    changedRouteVerification?: IVXProductionVerification;
    logs?: Array<{ sequence?: number; at?: string; phase?: string; level?: string; message?: string }>;
  };
  approvedAction?: IVXSeniorDeveloperApprovedAction;
  error?: string;
  exactBlocker?: string | null;
  secretValuesReturned: false;
  timestamp: string;
  httpStatus: number;
};

export type IVXSeniorDeveloperCredentialAuditResponse = {
  ok: boolean;
  ownerOnly: boolean;
  ownerApproval?: IVXOwnerMutationApprovalProof;
  audit?: IVXSeniorDeveloperCredentialAudit;
  exactBlocker?: string | null;
  error?: string;
  secretValuesReturned: false;
  timestamp: string;
  httpStatus: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function buildSeniorDeveloperUrls(suffix: string): string[] {
  const audit = getIVXOwnerAIConfigAudit();
  const urls: string[] = [];
  const push = (raw: string | null | undefined): void => {
    const trimmed = raw?.trim();
    if (!trimmed || urls.includes(trimmed)) return;
    urls.push(trimmed);
  };
  const pushFromBase = (baseUrl: string | null | undefined): void => {
    const base = baseUrl?.trim().replace(/\/+$/, '');
    if (!base) return;
    push(`${base}${suffix}`);
  };

  pushFromBase(audit.activeBaseUrl);
  for (const endpoint of audit.candidateEndpoints) {
    const normalized = endpoint.replace(/\/+$/, '');
    if (normalized.endsWith('/api/ivx/owner-ai')) {
      pushFromBase(normalized.slice(0, -'/api/ivx/owner-ai'.length));
    } else if (normalized.endsWith('/ivx/owner-ai')) {
      pushFromBase(normalized.slice(0, -'/ivx/owner-ai'.length));
    }
  }
  return urls;
}

async function getRealSupabaseOwnerBearer(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token ?? '';
  const tokenPresent = accessToken.length > 0 && accessToken.split('.').length === 3;
  console.log('[SeniorDeveloperApprovalService] Owner bearer check', { tokenPresent, hasSession: !!data.session, error: error?.message ?? null });
  if (!tokenPresent) {
    throw new Error(error?.message || 'No real Supabase owner session detected. Sign in as the IVX owner, then approve the senior-developer action.');
  }
  return accessToken;
}

async function readJsonPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : { value: parsed };
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

async function fetchOwnerApprovedJson<T extends Record<string, unknown>>(
  suffix: string,
  init: RequestInit,
): Promise<T & { httpStatus: number }> {
  const accessToken = await getRealSupabaseOwnerBearer();
  const urls = buildSeniorDeveloperUrls(suffix);
  if (urls.length === 0) {
    throw new Error('Senior-developer backend URL is not configured.');
  }

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      console.log('[SeniorDeveloperApprovalService] Sending owner-approved request', { bearerHeaderPresent: true, url: suffix });
      const response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          ...(init.headers ?? {}),
        },
      });
      const payload = await readJsonPayload(response);
      const typedPayload = { ...payload, httpStatus: response.status } as T & { httpStatus: number };
      if (!response.ok) {
        const message = typeof payload.exactBlocker === 'string'
          ? payload.exactBlocker
          : typeof payload.error === 'string'
            ? payload.error
            : `Senior-developer request failed with HTTP ${response.status}.`;
        const error = new Error(message);
        (error as Error & { payload?: unknown }).payload = typedPayload;
        throw error;
      }
      return typedPayload;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error('Senior-developer backend is not reachable.');
}

export async function auditSeniorDeveloperProductionReadiness(): Promise<IVXSeniorDeveloperCredentialAuditResponse> {
  return await fetchOwnerApprovedJson<IVXSeniorDeveloperCredentialAuditResponse>('/api/ivx/senior-developer/credential-audit', {
    method: 'GET',
  });
}

export async function runOwnerApprovedSeniorDeveloperProduction(input: {
  goal: string;
  proposedPlan: string;
  filesAffected: string[];
  riskLevel: IVXSeniorDeveloperRiskLevel;
  rollbackOption: string;
  validationMode?: 'focused' | 'typecheck';
}): Promise<IVXSeniorDeveloperRunResponse> {
  return await fetchOwnerApprovedJson<IVXSeniorDeveloperRunResponse>('/api/ivx/senior-developer/run', {
    method: 'POST',
    body: JSON.stringify({
      goal: input.goal,
      proposedPlan: input.proposedPlan,
      filesAffected: input.filesAffected,
      riskLevel: input.riskLevel,
      rollbackOption: input.rollbackOption,
      approvePatch: true,
      patchConfirmationText: IVX_SAFE_PATCH_CONFIRM_TEXT,
      approveGitDeploy: true,
      gitDeployConfirmationText: IVX_GIT_DEPLOY_CONFIRM_TEXT,
      validationMode: input.validationMode ?? 'focused',
    }),
  });
}
