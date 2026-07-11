/**
 * IVX Canonical Task API — read-only visibility surface for the IVX IA Senior
 * Developer dashboard in the live app.
 *
 * Endpoints:
 *   GET /api/ivx/senior-developer/tasks          → canonical store (counts + filtered tasks)
 *   GET /api/ivx/senior-developer/tasks/:taskId  → one task + blocks + events + evidence
 *
 * Read-only: serves the durable orchestrator ledger normalized through the
 * five-point PRODUCTION_VERIFIED evidence gate. No secrets are ever included.
 */
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import {
  buildCanonicalTaskStore,
  filterCanonicalTasks,
  persistCanonicalTaskStore,
  type CanonicalTaskStore,
} from '../services/ivx-canonical-task-store';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export const OPTIONS = (): Response => new Response(null, { status: 204, headers: CORS_HEADERS });

let cache: { store: CanonicalTaskStore; builtAt: number } | null = null;
const CACHE_TTL_MS = 15_000;

async function getStore(forceRefresh: boolean): Promise<CanonicalTaskStore> {
  if (!forceRefresh && cache && Date.now() - cache.builtAt < CACHE_TTL_MS) {
    return cache.store;
  }
  const store = await buildCanonicalTaskStore();
  cache = { store, builtAt: Date.now() };
  void persistCanonicalTaskStore(store);
  return store;
}

export async function handleCanonicalTasksListRequest(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const store = await getStore(url.searchParams.get('refresh') === '1');
    const sinceRaw = url.searchParams.get('sinceHours');
    const sinceHours = sinceRaw ? Number.parseFloat(sinceRaw) : undefined;
    const tasks = filterCanonicalTasks(store.tasks, {
      status: url.searchParams.get('status') ?? undefined,
      feature: url.searchParams.get('feature') ?? undefined,
      search: url.searchParams.get('search') ?? undefined,
      sinceHours: Number.isFinite(sinceHours) ? sinceHours : undefined,
    });
    return json({
      ok: true,
      marker: store.marker,
      generated_at: store.generated_at,
      source: store.source,
      runtime_deployment: store.runtime_deployment,
      counts: store.counts,
      total_matching: tasks.length,
      excluded_duplicates: store.excluded_duplicates,
      excluded_fake: store.excluded_fake,
      tasks,
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'canonical task store failed' }, 500);
  }
}

export async function handleCanonicalTaskDetailRequest(_request: Request, taskId: string): Promise<Response> {
  try {
    const safe = taskId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safe) return json({ ok: false, error: 'invalid task id' }, 400);
    const store = await getStore(false);
    const task = store.tasks.find((record) => record.id === safe);
    if (!task) return json({ ok: false, error: 'task not found' }, 404);

    const root = process.env.IVX_TASKS_ROOT ?? path.join(process.cwd(), 'logs', 'audit', 'task-orchestrator');
    const dir = path.join(root, safe);
    let blocks: unknown[] = [];
    let events: unknown[] = [];
    try {
      const raw = await readFile(path.join(dir, 'blocks.json'), 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      blocks = Array.isArray(parsed) ? parsed : [];
    } catch {
      blocks = [];
    }
    try {
      const raw = await readFile(path.join(dir, 'events.jsonl'), 'utf8');
      events = raw
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .map((line) => {
          try {
            return JSON.parse(line) as unknown;
          } catch {
            return null;
          }
        })
        .filter((event) => event !== null)
        .slice(-300);
    } catch {
      events = [];
    }
    return json({ ok: true, marker: store.marker, runtime_deployment: store.runtime_deployment, task, blocks, events });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'canonical task detail failed' }, 500);
  }
}
