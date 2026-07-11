import { describe, expect, test, beforeAll } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = mkdtempSync(path.join(tmpdir(), 'ivx-canonical-store-test-'));
process.env.IVX_TASKS_ROOT = ROOT;
process.env.RENDER_INSTANCE_ID = 'srv-abc123def456-7890xyz';
process.env.RENDER_GIT_COMMIT = '69731cb3fa800a34498bd05192bd5f2a1b34c4a9';

import { buildCanonicalTaskStore, filterCanonicalTasks } from './ivx-canonical-task-store';

function writeTask(id: string, task: Record<string, unknown>, blocks: unknown[], events: Record<string, unknown>[]): void {
  const dir = path.join(ROOT, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'task.json'), JSON.stringify({ id, ...task }));
  writeFileSync(path.join(dir, 'blocks.json'), JSON.stringify(blocks));
  writeFileSync(path.join(dir, 'events.jsonl'), events.map((event) => JSON.stringify(event)).join('\n'));
}

const REAL_EVIDENCE = {
  repository: 'ibb142/rork-global-real-estate-invest',
  branch: 'main',
  commitSha: '69731cb3fa800a34498bd05192bd5f2a1b34c4a9',
  pushStatus: 'COMPLETED',
  deploymentPlatform: 'render',
  deploymentId: 'dep-d98iucrtqb8s73b34q70',
  deploymentStatus: 'live',
  deploymentTimestamp: '2026-07-11T03:28:59.536Z',
  productionUrl: 'https://ivx-holdings-platform.onrender.com',
  healthEndpoint: '/health',
  httpStatus: 200,
  runningCommitSha: '69731cb3fa800a34498bd05192bd5f2a1b34c4a9',
  verificationTime: '2026-07-11T03:40:00.000Z',
  qaResult: 'health 200; commit match; perez media 8/8 clean',
};

beforeAll(() => {
  writeTask(
    'task-verified-1',
    { ownerCommand: 'Fix Perez Residence reels media', status: 'completed', createdAt: '2026-07-10T00:00:00Z', updatedAt: '2026-07-11T03:40:00Z', completedAt: '2026-07-11T03:40:00Z', totalBlocks: 1, completedBlockIds: ['b1'], failedBlockIds: [], blockedBlockIds: [], deploymentStatus: 'deployed_verified', error: null },
    [{ id: 'b1', index: 0, title: 'fix', status: 'COMPLETED', startedAt: '2026-07-10T01:00:00Z' }],
    [{ type: 'TASK_PRODUCTION_VERIFIED', at: '2026-07-11T03:40:00Z', evidence: REAL_EVIDENCE }],
  );
  // Verified via runtime identity (ledger deploy id is descriptive, not an id)
  writeTask(
    'task-verified-runtime',
    { ownerCommand: 'Landing page cache guard', status: 'completed', createdAt: '2026-07-10T00:00:00Z', updatedAt: '2026-07-11T03:41:00Z', completedAt: '2026-07-11T03:41:00Z', totalBlocks: 1, completedBlockIds: ['b1'], failedBlockIds: [], blockedBlockIds: [], deploymentStatus: 'deployed_verified', error: null },
    [],
    [{ type: 'TASK_PRODUCTION_VERIFIED', at: '2026-07-11T03:41:00Z', evidence: { ...REAL_EVIDENCE, deploymentId: 'autodeploy-on-push (render api key unavailable for id lookup)' } }],
  );
  // Completed label but NO evidence → must NOT display verified
  writeTask(
    'task-label-only',
    { ownerCommand: 'Update chat header', status: 'completed', createdAt: '2026-07-09T00:00:00Z', updatedAt: '2026-07-09T01:00:00Z', completedAt: '2026-07-09T01:00:00Z', totalBlocks: 1, completedBlockIds: [], failedBlockIds: [], blockedBlockIds: [], deploymentStatus: null, error: null },
    [],
    [],
  );
  // Forbidden narrative evidence → must NOT display verified
  writeTask(
    'task-forbidden-evidence',
    { ownerCommand: 'Owner login session fix', status: 'completed', createdAt: '2026-07-09T00:00:00Z', updatedAt: '2026-07-09T02:00:00Z', completedAt: null, totalBlocks: 1, completedBlockIds: [], failedBlockIds: [], blockedBlockIds: [], deploymentStatus: null, error: null },
    [],
    [{ type: 'TASK_PRODUCTION_VERIFIED', at: '2026-07-09T02:00:00Z', evidence: { ...REAL_EVIDENCE, qaResult: 'PLACEHOLDER QA PENDING' } }],
  );
  writeTask(
    'task-blocked-1',
    { ownerCommand: 'Delete all user data from production', status: 'blocked', createdAt: '2026-07-10T00:00:00Z', updatedAt: '2026-07-10T00:10:00Z', completedAt: null, totalBlocks: 3, completedBlockIds: [], failedBlockIds: [], blockedBlockIds: ['b2'], deploymentStatus: null, error: null },
    [],
    [],
  );
  // TRUE duplicate of verified-1 (same command AND same createdAt) → excluded.
  writeTask(
    'task-duplicate-1',
    { ownerCommand: 'Fix Perez Residence reels media', status: 'not_deployed', createdAt: '2026-07-10T00:00:00Z', updatedAt: '2026-07-08T01:00:00Z', completedAt: null, totalBlocks: 1, completedBlockIds: [], failedBlockIds: [], blockedBlockIds: [], deploymentStatus: null, error: null },
    [],
    [],
  );
  // Re-run of the same command at a DIFFERENT time → a separate real task, kept.
  writeTask(
    'task-rerun-1',
    { ownerCommand: 'Fix Perez Residence reels media', status: 'blocked', createdAt: '2026-07-06T00:00:00Z', updatedAt: '2026-07-06T01:00:00Z', completedAt: null, totalBlocks: 1, completedBlockIds: [], failedBlockIds: [], blockedBlockIds: ['b1'], deploymentStatus: null, error: null },
    [],
    [],
  );
  // Fake/mock task → excluded
  writeTask(
    'task-fake-1',
    { ownerCommand: 'mock task for testing the dashboard', status: 'completed', createdAt: '2026-07-08T00:00:00Z', updatedAt: '2026-07-08T01:00:00Z', completedAt: null, totalBlocks: 0, completedBlockIds: [], failedBlockIds: [], blockedBlockIds: [], deploymentStatus: null, error: null },
    [],
    [],
  );
});

describe('canonical task store', () => {
  test('aggregates ledger, excludes duplicates and fakes, enforces verified gate', async () => {
    const store = await buildCanonicalTaskStore();
    expect(store.counts.TOTAL_TASKS).toBe(6);
    expect(store.excluded_duplicates).toBe(1);
    expect(store.excluded_fake).toBe(1);
    expect(store.counts.PRODUCTION_VERIFIED).toBe(2);
    expect(store.counts.BLOCKED).toBe(2);
    // label-only (no evidence) → NOT_DEPLOYED; forbidden-evidence → DEPLOYED (evidence exists but gate failed)
    expect(store.counts.NOT_DEPLOYED).toBe(1);
    expect(store.counts.DEPLOYED).toBe(1);
  });

  test('verified task carries real evidence fields', async () => {
    const store = await buildCanonicalTaskStore();
    const verified = store.tasks.find((task) => task.id === 'task-verified-1');
    expect(verified?.status).toBe('PRODUCTION_VERIFIED');
    expect(verified?.commit_sha).toBe('69731cb3fa800a34498bd05192bd5f2a1b34c4a9');
    expect(verified?.deployment_id).toBe('dep-d98iucrtqb8s73b34q70');
    expect(verified?.verified_gate.passed).toBe(true);
    expect(verified?.qa_status).toBe('PASS');
  });

  test('runtime render identity satisfies deployment id when ledger id is descriptive', async () => {
    const store = await buildCanonicalTaskStore();
    const verified = store.tasks.find((task) => task.id === 'task-verified-runtime');
    expect(verified?.status).toBe('PRODUCTION_VERIFIED');
    expect(verified?.deployment_id).toBe('srv-abc123def456-7890xyz');
  });

  test('completed label without evidence never displays verified', async () => {
    const store = await buildCanonicalTaskStore();
    const labelOnly = store.tasks.find((task) => task.id === 'task-label-only');
    expect(labelOnly?.status).toBe('NOT_DEPLOYED');
  });

  test('forbidden narrative evidence never displays verified', async () => {
    const store = await buildCanonicalTaskStore();
    const forbidden = store.tasks.find((task) => task.id === 'task-forbidden-evidence');
    expect(forbidden?.status).not.toBe('PRODUCTION_VERIFIED');
    expect(forbidden?.verified_gate.qa_evidence).toBe(false);
  });

  test('filters by status, feature, and search', async () => {
    const store = await buildCanonicalTaskStore();
    expect(filterCanonicalTasks(store.tasks, { status: 'PRODUCTION_VERIFIED' }).length).toBe(2);
    expect(filterCanonicalTasks(store.tasks, { feature: 'reels' }).length).toBe(2);
    expect(filterCanonicalTasks(store.tasks, { search: 'perez' }).length).toBe(2);
    expect(filterCanonicalTasks(store.tasks, { search: '69731cb3' }).length).toBe(3);
  });
});
