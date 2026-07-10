import { describe, expect, it, mock } from 'bun:test';

const asyncStorageMemory = new Map<string, string>();

mock.module('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => asyncStorageMemory.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      asyncStorageMemory.set(key, value);
    },
    removeItem: async (key: string) => {
      asyncStorageMemory.delete(key);
    },
    clear: async () => {
      asyncStorageMemory.clear();
    },
  },
}));

const mockSupabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    refreshSession: async () => ({ data: { session: null }, error: { message: 'No session' } }),
  },
};

mock.module('@/lib/supabase', () => ({
  supabase: mockSupabase,
  getSupabaseClient: () => mockSupabase,
}));

mock.module('@/lib/ivx-supabase-client', () => ({
  getIVXAccessToken: async () => null,
  getIVXOwnerAIConfigAudit: () => ({
    currentEnvironment: 'test',
    configuredBaseUrl: 'https://ivx-holdings-platform.onrender.com',
    configuredFrom: 'test',
    devFallbackBaseUrl: null,
    projectApiBaseUrl: null,
    directApiBaseUrl: null,
    webPreviewBaseUrl: null,
    canonicalBaseUrl: 'https://ivx-holdings-platform.onrender.com',
  }),
}));

// Dynamic imports AFTER mock.module registration — static imports are hoisted
// and would load the real @/lib/supabase → async-storage → react-native chain,
// which bun cannot parse (Flow-typed entry point).
const {
  buildSeniorDeveloperApprovalCard,
  buildSeniorDeveloperJobDraft,
  buildSeniorDeveloperSubmitStatusCard,
  deriveTemplateMode,
  isSeniorDeveloperBuildRequest,
  requestsProductionDeploy,
} = await import('@/src/modules/ivx-developer/seniorDeveloperBuildIntent');
const { isWorkerJobComplete } = await import('@/src/modules/ivx-developer/seniorDeveloperWorkerService');
import type { WorkerJobResultSummary } from '@/src/modules/ivx-developer/seniorDeveloperWorkerService';

describe('senior developer build intent', () => {
  it('detects build/module/feature/deploy requests', () => {
    expect(isSeniorDeveloperBuildRequest('build a module for investor outreach')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('create a feature to export reports')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('add an endpoint GET /api/ivx/proof-live')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('modify the code to fix the bug')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('deploy this to production')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('run the senior developer')).toBe(true);
  });

  it('detects natural imperative variants without an explicit object noun', () => {
    expect(isSeniorDeveloperBuildRequest('build login')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('create dashboard')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('finish app')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('complete ivx')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('fix chat')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('repair bug')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('deploy production')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('update worker')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('rewrite routing')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('please build a login screen')).toBe(true);
    expect(isSeniorDeveloperBuildRequest('can you optimize the chat send flow')).toBe(true);
  });

  it('does not flag plain conversation or questions', () => {
    expect(isSeniorDeveloperBuildRequest('what is Casa Rosario?')).toBe(false);
    expect(isSeniorDeveloperBuildRequest('how many investors do we have?')).toBe(false);
    expect(isSeniorDeveloperBuildRequest('show me the supabase tables')).toBe(false);
    expect(isSeniorDeveloperBuildRequest('update me on the investor pipeline')).toBe(false);
    expect(isSeniorDeveloperBuildRequest('')).toBe(false);
  });

  it('marks deploy intent and risk correctly', () => {
    expect(requestsProductionDeploy('build a module and deploy it')).toBe(true);
    const localDraft = buildSeniorDeveloperJobDraft('create a feature to list deals');
    expect(localDraft.requestsDeploy).toBe(false);
    expect(localDraft.riskLevel).toBe('low');
    const deployDraft = buildSeniorDeveloperJobDraft('build an endpoint and deploy to production');
    expect(deployDraft.requestsDeploy).toBe(true);
    expect(deployDraft.riskLevel).toBe('medium');
    const riskyDraft = buildSeniorDeveloperJobDraft('modify the code to change the auth schema and deploy');
    expect(riskyDraft.riskLevel).toBe('high');
  });

  it('maps requests to the correct execution template mode', () => {
    expect(deriveTemplateMode('build a whole new app from scratch')).toBe('NEW_APP_FROM_SCRATCH');
    expect(deriveTemplateMode('create a new module for reporting')).toBe('NEW_MODULE_FROM_SCRATCH');
    expect(deriveTemplateMode('build an investor discovery feature')).toBe('INVESTOR_WORKFLOW');
    expect(deriveTemplateMode('add a CRM contact import')).toBe('CRM_WORKFLOW');
    expect(deriveTemplateMode('automate the daily report workflow')).toBe('BUSINESS_WORKFLOW');
    expect(deriveTemplateMode('fix the bug in the login screen')).toBe('BUG_FIX');
    expect(deriveTemplateMode('fix chat')).toBe('BUG_FIX');
    expect(deriveTemplateMode('refactor the chat send flow')).toBe('REFACTOR');
    expect(deriveTemplateMode('rewrite routing')).toBe('REFACTOR');
    expect(deriveTemplateMode('add an endpoint to export data')).toBe('NEW_FEATURE');
    expect(deriveTemplateMode('')).toBe('NEW_FEATURE');
  });

  it('includes the template mode on the job draft and approval card', () => {
    const draft = buildSeniorDeveloperJobDraft('build a new module from scratch and deploy');
    expect(draft.templateMode).toBe('NEW_MODULE_FROM_SCRATCH');
    expect(buildSeniorDeveloperApprovalCard(draft)).toContain('Template mode: NEW_MODULE_FROM_SCRATCH');
  });

  it('builds a structured approval card with all required fields', () => {
    const draft = buildSeniorDeveloperJobDraft('build an endpoint GET /api/ivx/proof-live and deploy');
    const card = buildSeniorDeveloperApprovalCard(draft);
    expect(card).toContain('Result: OWNER_APPROVAL_REQUIRED');
    expect(card).toContain('Title:');
    expect(card).toContain('Goal:');
    expect(card).toContain('Proposed plan:');
    expect(card).toContain('Files affected:');
    expect(card).toContain('Risk level:');
    expect(card).toContain('Rollback plan:');
    expect(card).toContain('/confirm');
  });

  it('builds stable status cards for non-success outcomes', () => {
    expect(buildSeniorDeveloperSubmitStatusCard('OWNER_APPROVAL_REQUIRED', null)).toContain('Result: OWNER_APPROVAL_REQUIRED');
    expect(buildSeniorDeveloperSubmitStatusCard('WORKER_UNAVAILABLE', null)).toContain('Result: WORKER_UNAVAILABLE');
    expect(buildSeniorDeveloperSubmitStatusCard('DEPLOY_SECRETS_MISSING', 'missing_credentials')).toContain('Result: DEPLOY_SECRETS_MISSING');
  });
});

describe('worker job completeness contract', () => {
  const base: WorkerJobResultSummary = {
    jobId: 'ivx-worker-1',
    finalStatus: 'COMPLETE',
    commitSha: 'abc1234def5678',
    deployId: 'dep-d98iucrtqb8s73b34q70',
    deployStatus: 'live',
    healthStatus: 200,
    healthOk: true,
    commitMatch: true,
    changedFiles: ['backend/hono.ts'],
    testsRun: true,
    testsPassed: true,
    typecheckRun: true,
    buildRun: true,
    error: null,
  };

  it('is COMPLETE only with commit + deploy + health 200 + version match', () => {
    expect(isWorkerJobComplete(base)).toBe(true);
    expect(isWorkerJobComplete({ ...base, commitSha: null })).toBe(false);
    expect(isWorkerJobComplete({ ...base, deployId: null })).toBe(false);
    expect(isWorkerJobComplete({ ...base, healthStatus: 503 })).toBe(false);
    expect(isWorkerJobComplete({ ...base, commitMatch: false })).toBe(false);
    expect(isWorkerJobComplete({ ...base, finalStatus: 'LOCAL_ONLY' })).toBe(false);
    expect(isWorkerJobComplete(null)).toBe(false);
  });
});
