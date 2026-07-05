/**
 * End-to-end regression proof for the IVX Owner Variables / Credentials module.
 * Exercises the full lifecycle on the in-memory dev store:
 *   - status (initial)
 *   - save (add)        — confirmation + masked preview returned, raw secret NOT returned
 *   - save (edit)       — overwrite existing value, masked preview updates
 *   - test (single)     — last_tested_at + testResult recorded
 *   - test (provider)   — provider readiness computed
 *   - self-sync         — copies from process.env into the encrypted store
 *   - delete            — row removed, status reverts to missing
 *   - audit trail       — every action: secretValuesReturned is always false
 *
 * Run: `bun test backend/ivx-owner-variables-e2e.test.ts`
 */
import { describe, it, expect, beforeAll } from 'bun:test';

// IMPORTANT: ES imports are hoisted, so we set env vars here, then use a
// dynamic import() inside beforeAll() to load the SUT AFTER the env is set.
// The owner-only guard caches IVX_AI_SYSTEM_SECRET at module-load time and
// the variables module caches the memory-store flag / encryption secret.
beforeAll(async () => {
  process.env.IVX_OWNER_VARIABLES_MEMORY_STORE = '1';
  process.env.NODE_ENV = 'development';
  process.env.APP_SECRET = 'ivx-owner-variables-e2e-test-secret-do-not-use-in-prod';
  process.env.IVX_AI_SYSTEM_SECRET = 'ivx-e2e-system-secret-do-not-use-in-prod';
  process.env.GITHUB_TOKEN = 'ghp_e2e_test_token_1234567890abcdef';
  process.env.GITHUB_REPO_URL = 'https://github.com/ibb142/rork-global-real-estate-invest';
  process.env.RENDER_API_KEY = 'rnd_e2e_test_render_key';
  process.env.RENDER_SERVICE_ID = 'srv-e2etest123';
  // Dynamic import so the module reads the env vars we just set.
  const mod = await import('./api/ivx-owner-variables');
  handlersRef.current = mod;
});

const handlersRef: { current: typeof import('./api/ivx-owner-variables') | null } = { current: null };

function handlers(): typeof import('./api/ivx-owner-variables') {
  if (!handlersRef.current) throw new Error('handlers not loaded — beforeAll failed.');
  return handlersRef.current;
}

const SYSTEM_KEY = 'ivx-e2e-system-secret-do-not-use-in-prod';

function makeRequest(method: string, body: unknown = null): Request {
  const init: RequestInit = {
    method,
    headers: { 'X-IVX-System-Key': SYSTEM_KEY },
  };
  if (body !== null) init.body = JSON.stringify(body);
  return new Request('https://e2e.test/api/ivx/owner-variables', init);
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function findVariable(statusPayload: Record<string, unknown>, name: string): Record<string, unknown> | undefined {
  const vars = Array.isArray(statusPayload.variables) ? statusPayload.variables : [];
  return (vars as Array<Record<string, unknown>>).find((item) => item.name === name);
}

describe('IVX Owner Variables — end-to-end lifecycle (in-memory store)', () => {
  it('step 1: initial status lists all 15 tracked variables as missing', async () => {
    const res = await handlers().handleIVXOwnerVariablesStatusRequest(makeRequest('GET'));
    expect(res.status).toBe(200);
    const payload = await json(res);
    expect(payload.ok).toBe(true);
    expect(payload.ownerOnly).toBe(true);
    expect(payload.secretValuesReturned).toBe(false);
    expect(Array.isArray(payload.variables)).toBe(true);
    const vars = payload.variables as Array<Record<string, unknown>>;
    expect(vars.length).toBe(15);
    // GITHUB_TOKEN is seeded into process.env for the self-sync test, so the
    // merged status logic correctly reports it as 'saved' (runtime-readable).
    // Assert missing on a variable that is genuinely absent from env.
    const jwtSecret = findVariable(payload, 'JWT_SECRET');
    expect(jwtSecret?.status).toBe('missing');
    expect(jwtSecret?.maskedPreview).toBeNull();
    // And confirm env-present variables are surfaced as saved (not missing).
    const githubToken = findVariable(payload, 'GITHUB_TOKEN');
    expect(githubToken?.status).toBe('saved');
    expect(githubToken?.presentInRuntime).toBe(true);
  });

  it('step 2: save (ADD) stores GITHUB_TOKEN and returns masked preview only', async () => {
    const res = await handlers().handleIVXOwnerVariablesSaveRequest(
      makeRequest('POST', { name: 'GITHUB_TOKEN', value: 'ghp_realtoken_abcdef1234567890' }),
    );
    expect(res.status).toBe(200);
    const payload = await json(res);
    expect(payload.ok).toBe(true);
    expect(payload.secretValuesReturned).toBe(false);
    const saved = payload.saved as Record<string, unknown>;
    expect(saved.name).toBe('GITHUB_TOKEN');
    expect(saved.status).toBe('saved');
    const preview = String(saved.maskedPreview ?? '');
    expect(preview.length).toBeGreaterThan(0);
    expect(preview).not.toContain('ghp_realtoken_abcdef1234567890');
    const raw = await res.clone().text();
    expect(raw).not.toContain('ghp_realtoken_abcdef1234567890');
  });

  it('step 3: status after save shows GITHUB_TOKEN as saved with masked preview', async () => {
    const res = await handlers().handleIVXOwnerVariablesStatusRequest(makeRequest('GET'));
    const payload = await json(res);
    const row = findVariable(payload, 'GITHUB_TOKEN');
    expect(row?.status).toBe('saved');
    expect(row?.saved).toBe(true);
    expect(row?.maskedPreview).toBeTruthy();
    expect(String(row?.maskedPreview).startsWith('ghp_')).toBe(true);
  });

  it('step 4: save (EDIT) overwrites GITHUB_TOKEN with a new value', async () => {
    const res = await handlers().handleIVXOwnerVariablesSaveRequest(
      makeRequest('POST', { name: 'GITHUB_TOKEN', value: 'ghp_new_edited_token_zzz999' }),
    );
    expect(res.status).toBe(200);
    const payload = await json(res);
    const saved = payload.saved as Record<string, unknown>;
    expect(saved.name).toBe('GITHUB_TOKEN');
    expect(saved.status).toBe('saved');
    const newPreview = String(saved.maskedPreview ?? '');
    expect(newPreview).not.toContain('ghp_realtoken_abcdef1234567890');
    expect(newPreview).not.toContain('ghp_new_edited_token_zzz999');
    const status = payload.statusAfterSave as Record<string, unknown>;
    const row = findVariable(status, 'GITHUB_TOKEN');
    expect(row?.status).toBe('saved');
    expect(row?.lastTestedAt).toBeNull();
    const raw = await res.clone().text();
    expect(raw).not.toContain('ghp_new_edited_token_zzz999');
  });

  it('step 5: save ADDs GITHUB_REPO_URL (non-secret) and AWS_REGION', async () => {
    const res1 = await handlers().handleIVXOwnerVariablesSaveRequest(
      makeRequest('POST', { name: 'GITHUB_REPO_URL', value: 'https://github.com/ibb142/rork-global-real-estate-invest' }),
    );
    expect(res1.status).toBe(200);
    const res2 = await handlers().handleIVXOwnerVariablesSaveRequest(
      makeRequest('POST', { name: 'AWS_REGION', value: 'us-east-1' }),
    );
    expect(res2.status).toBe(200);
    const status = await handlers().handleIVXOwnerVariablesStatusRequest(makeRequest('GET'));
    const payload = await json(status);
    const repo = findVariable(payload, 'GITHUB_REPO_URL');
    expect(repo?.status).toBe('saved');
    const region = findVariable(payload, 'AWS_REGION');
    expect(region?.status).toBe('saved');
    expect(region?.maskedPreview).toBe('us-east-1');
  });

  it('step 6: test (SINGLE variable) marks GITHUB_TOKEN tested and records last_tested_at', async () => {
    const res = await handlers().handleIVXOwnerVariablesTestRequest(
      makeRequest('POST', { name: 'GITHUB_TOKEN' }),
    );
    expect(res.status).toBe(200);
    const payload = await json(res);
    expect(payload.testResult).toBe('tested');
    const status = payload.statusAfterTest as Record<string, unknown>;
    const row = findVariable(status, 'GITHUB_TOKEN');
    expect(row?.status).toBe('tested');
    expect(row?.lastTestedAt).toBeTruthy();
  });

  it('step 7: test (PROVIDER) updates readiness for all variables in that provider', async () => {
    const res = await handlers().handleIVXOwnerVariablesTestRequest(
      makeRequest('POST', { provider: 'github' }),
    );
    const payload = await json(res);
    expect(payload.provider).toBe('github');
    const providerResult = payload.providerResult as Record<string, unknown>;
    expect(['tested', 'invalid', 'missing']).toContain(providerResult.status);
  });

  it('step 8: self-sync copies GITHUB_TOKEN from process.env into the encrypted store', async () => {
    const res = await handlers().handleIVXOwnerVariablesSelfSyncRequest(
      makeRequest('POST', { names: ['GITHUB_TOKEN', 'GITHUB_REPO_URL'], overwriteExisting: true }),
    );
    expect(res.status).toBe(200);
    const payload = await json(res);
    expect(payload.ok).toBe(true);
    expect(payload.secretValuesReturned).toBe(false);
    const summary = payload.summary as Record<string, unknown>;
    expect(summary.syncedCount).toBe(2);
    const results = payload.results as Array<Record<string, unknown>>;
    const github = results.find((item) => item.name === 'GITHUB_TOKEN');
    expect(github?.action).toBe('synced');
    expect(github?.maskedPreview).toBeTruthy();
    const raw = await res.clone().text();
    expect(raw).not.toContain('ghp_e2e_test_token_1234567890abcdef');
  });

  it('step 9: self-sync skips existing when overwriteExisting=false', async () => {
    const res = await handlers().handleIVXOwnerVariablesSelfSyncRequest(
      makeRequest('POST', { names: ['GITHUB_TOKEN'], overwriteExisting: false }),
    );
    const payload = await json(res);
    const results = payload.results as Array<Record<string, unknown>>;
    const github = results.find((item) => item.name === 'GITHUB_TOKEN');
    expect(github?.action).toBe('skipped_existing');
  });

  it('step 10: self-sync reports missing_in_env for variables absent from process.env', async () => {
    const res = await handlers().handleIVXOwnerVariablesSelfSyncRequest(
      makeRequest('POST', { names: ['AI_GATEWAY_API_KEY'], overwriteExisting: true }),
    );
    const payload = await json(res);
    const results = payload.results as Array<Record<string, unknown>>;
    const ai = results.find((item) => item.name === 'AI_GATEWAY_API_KEY');
    expect(ai?.action).toBe('missing_in_env');
  });

  it('step 11: delete removes the variable and status reverts to missing', async () => {
    const before = await handlers().handleIVXOwnerVariablesStatusRequest(makeRequest('GET'));
    const beforePayload = await json(before);
    expect(findVariable(beforePayload, 'AWS_REGION')?.status).toBe('saved');

    const res = await handlers().handleIVXOwnerVariablesDeleteRequest(
      makeRequest('POST', { name: 'AWS_REGION' }),
    );
    expect(res.status).toBe(200);
    const payload = await json(res);
    expect(payload.deleted).toBe(true);

    const status = payload.statusAfterDelete as Record<string, unknown>;
    const row = findVariable(status, 'AWS_REGION');
    expect(row?.status).toBe('missing');
    expect(row?.saved).toBe(false);
  });

  it('step 12: delete on a non-saved variable returns deleted=false (idempotent)', async () => {
    const res = await handlers().handleIVXOwnerVariablesDeleteRequest(
      makeRequest('POST', { name: 'AI_GATEWAY_API_KEY' }),
    );
    expect(res.status).toBe(200);
    const payload = await json(res);
    expect(payload.deleted).toBe(false);
  });

  it('step 13: save rejects blank values with a 400', async () => {
    const res = await handlers().handleIVXOwnerVariablesSaveRequest(
      makeRequest('POST', { name: 'GITHUB_TOKEN', value: '   ' }),
    );
    expect(res.status).toBe(400);
    const payload = await json(res);
    expect(payload.ok).toBe(false);
  });

  it('step 14: save rejects unsupported variable names', async () => {
    const res = await handlers().handleIVXOwnerVariablesSaveRequest(
      makeRequest('POST', { name: 'NOT_A_REAL_VARIABLE', value: 'whatever' }),
    );
    expect(res.status).toBe(400);
  });

  it('step 15: full audit trail — secretValuesReturned is always false across every action', async () => {
    const save = await handlers().handleIVXOwnerVariablesSaveRequest(
      makeRequest('POST', { name: 'JWT_SECRET', value: 'super-secret-jwt-value-xyz' }),
    );
    const savePayload = await json(save);
    expect(savePayload.secretValuesReturned).toBe(false);
    const saveRaw = await save.clone().text();
    expect(saveRaw).not.toContain('super-secret-jwt-value-xyz');

    const test = await handlers().handleIVXOwnerVariablesTestRequest(
      makeRequest('POST', { name: 'JWT_SECRET' }),
    );
    const testPayload = await json(test);
    expect(testPayload.secretValuesReturned).toBe(false);

    const del = await handlers().handleIVXOwnerVariablesDeleteRequest(
      makeRequest('POST', { name: 'JWT_SECRET' }),
    );
    const delPayload = await json(del);
    expect(delPayload.secretValuesReturned).toBe(false);
  });
});
