/**
 * One-shot reclassification — owner spec 2026-07-11 step 3.
 *
 * Every persisted task marked `completed` whose blocks never passed the
 * six-point deployment checklist (real commit + push + deploy + health 200 +
 * production commit match) is reclassified to `not_deployed`, and its
 * COMPLETED/DEPLOYED blocks without verification evidence become NOT_DEPLOYED.
 *
 * Idempotent: re-running changes nothing once the store is clean.
 *
 *   bun run backend/scripts/reclassify-undeployed-tasks.ts
 */
import { readdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';

type BlockRecord = {
  id: string;
  status: string;
  commitHash: string | null;
  verification: { ok: boolean; httpStatus: number | null } | null;
  blocker: string | null;
};

type TaskRecord = {
  id: string;
  status: string;
  deploymentStatus: string | null;
  updatedAt: string;
};

const ROOT = path.join(process.cwd(), 'logs', 'audit', 'task-orchestrator');

function blockHasRealProductionEvidence(block: BlockRecord): boolean {
  return (
    block.status === 'VERIFIED' &&
    block.verification !== null &&
    block.verification.ok === true &&
    block.verification.httpStatus === 200
  );
}

async function main(): Promise<void> {
  let dirs: string[] = [];
  try {
    dirs = await readdir(ROOT);
  } catch {
    console.log('No task store found — nothing to reclassify.');
    return;
  }

  let tasksReclassified = 0;
  let blocksReclassified = 0;
  let tasksAlreadyHonest = 0;

  for (const dir of dirs) {
    const taskPath = path.join(ROOT, dir, 'task.json');
    const blocksPath = path.join(ROOT, dir, 'blocks.json');
    const eventsPath = path.join(ROOT, dir, 'events.jsonl');

    let task: TaskRecord;
    let blocks: BlockRecord[];
    try {
      task = JSON.parse(await readFile(taskPath, 'utf8')) as TaskRecord;
      blocks = JSON.parse(await readFile(blocksPath, 'utf8')) as BlockRecord[];
    } catch {
      continue;
    }

    // Reclassify blocks that claim terminal success without production evidence.
    let blocksChanged = false;
    for (const block of blocks) {
      if ((block.status === 'COMPLETED' || block.status === 'DEPLOYED') && !blockHasRealProductionEvidence(block)) {
        block.status = 'NOT_DEPLOYED';
        block.blocker =
          block.blocker ??
          'NOT DEPLOYED — no commit/push/deploy/health/production-commit evidence recorded for this block.';
        blocksChanged = true;
        blocksReclassified++;
      }
    }

    const anyVerified = blocks.every((b) => blockHasRealProductionEvidence(b)) && blocks.length > 0;
    const taskNeedsReclass = task.status === 'completed' && !anyVerified;

    if (blocksChanged) {
      await writeFile(blocksPath, JSON.stringify(blocks, null, 2), 'utf8');
    }

    if (taskNeedsReclass) {
      task.status = 'not_deployed';
      task.deploymentStatus = 'NOT_DEPLOYED';
      task.updatedAt = new Date().toISOString();
      await writeFile(taskPath, JSON.stringify(task, null, 2), 'utf8');
      const event = {
        at: new Date().toISOString(),
        type: 'TASK_RECLASSIFIED_NOT_DEPLOYED',
        blockId: null,
        detail: 'Owner spec 2026-07-11: completed status revoked — no production deployment evidence exists.',
      };
      try {
        await appendFile(eventsPath, `${JSON.stringify(event)}\n`, 'utf8');
      } catch { /* forensics only */ }
      tasksReclassified++;
      console.log(`RECLASSIFIED ${task.id}: completed → not_deployed`);
    } else if (task.status === 'completed') {
      tasksAlreadyHonest++;
    }
  }

  console.log(
    JSON.stringify(
      { tasksScanned: dirs.length, tasksReclassified, blocksReclassified, completedWithRealEvidence: tasksAlreadyHonest },
      null,
      2,
    ),
  );
}

await main();
