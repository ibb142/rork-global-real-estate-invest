import { loadProjectEnv } from './expo/deploy/scripts/aws-runtime.mjs';
import app from './backend/hono';
import { seedDealPipelineFromJvDeals } from './backend/services/ivx-deal-pipeline-seed';
import { resolveDataRoot, migrateLegacyDataIntoDataRoot } from './backend/services/ivx-data-root';

loadProjectEnv(import.meta.url);

/**
 * Restore the real published deals (Casa Rosario, PEREZ RESIDENCE, ONE STOP
 * CONSTRUCTORS INC) into the now-durable Deal Tracking + Capital Pipeline stores.
 * Idempotent and never fabricates — only seeds real `jv_deals`. Best-effort and
 * non-blocking so it never delays boot or affects the health check; with the
 * persistent-disk fix in place the seeded deals survive every restart/deploy.
 */
/**
 * One-time, idempotent migration that carries any pre-fix business data from the old
 * ephemeral path onto the durable disk on the first boot after the data-loss fix.
 * Runs synchronously before seeding so seeds land on the durable disk. Best-effort.
 */
function migrateDurableDataOnBoot(): void {
  try {
    const root = resolveDataRoot();
    const result = migrateLegacyDataIntoDataRoot();
    console.log('[IVX-Migrate] Durable data root resolved', {
      dataRoot: root,
      migrated: result.migrated,
      skipped: result.skipped,
    });
  } catch (error) {
    console.log('[IVX-Migrate] Migration note:', error instanceof Error ? error.message : 'unknown');
  }
}

function seedRealDealsOnBoot(): void {
  void seedDealPipelineFromJvDeals()
    .then((result) => {
      if (result.ok) {
        console.log('[IVX-Seed] Deal pipeline seed complete', {
          publishedProjects: result.publishedProjects,
          dealsCreated: result.dealsCreated,
          dealsSkipped: result.dealsSkipped,
          pipelineCreated: result.pipelineCreated,
        });
      } else {
        console.log('[IVX-Seed] Deal pipeline seed skipped', {
          error: result.error,
          missingEnv: result.missingEnv,
        });
      }
    })
    .catch((error: unknown) => {
      console.log('[IVX-Seed] Deal pipeline seed error:', error instanceof Error ? error.message : 'unknown');
    });
}

const portValue = process.env.PORT ?? '3000';
const parsedPort = Number.parseInt(portValue, 10);
const port = Number.isFinite(parsedPort) ? parsedPort : 3000;
const hostname = (process.env.HOST ?? '0.0.0.0').trim() || '0.0.0.0';

type RuntimeServer = {
  stop?: () => void;
  close?: () => void;
};

type BunServeLike = {
  serve?: (options: { port: number; hostname?: string; fetch: typeof app.fetch }) => RuntimeServer;
};

const maybeBun = globalThis as typeof globalThis & { Bun?: BunServeLike };

function registerShutdown(server: RuntimeServer, runtime: 'bun' | 'node'): void {
  const shutdown = (signal: string) => {
    console.log('[IVXOwnerAI-Server] Shutdown requested', {
      runtime,
      signal,
      port,
      hostname,
    });

    try {
      if (typeof server.stop === 'function') {
        server.stop();
      }
      if (typeof server.close === 'function') {
        server.close();
      }
    } catch (error) {
      console.log('[IVXOwnerAI-Server] Shutdown note:', error instanceof Error ? error.message : 'unknown');
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function startServer(): Promise<void> {
  console.log('[IVXOwnerAI-Server] Starting API server', {
    port,
    hostname,
    nodeEnv: process.env.NODE_ENV ?? 'development',
  });

  if (typeof maybeBun.Bun?.serve === 'function') {
    const server = maybeBun.Bun.serve({
      port,
      hostname,
      fetch: app.fetch,
    });

    registerShutdown(server, 'bun');
    console.log('[IVXOwnerAI-Server] Bun runtime online', {
      port,
      hostname,
      healthUrl: `http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${port}/health`,
    });
    migrateDurableDataOnBoot();
    seedRealDealsOnBoot();
    return;
  }

  const { serve } = await import('@hono/node-server');
  const server = serve(
    {
      fetch: app.fetch,
      port,
      hostname,
    },
    (info) => {
      console.log('[IVXOwnerAI-Server] Node runtime online', {
        port: info.port,
        hostname,
        healthUrl: `http://${hostname === '0.0.0.0' ? 'localhost' : hostname}:${info.port}/health`,
      });
      migrateDurableDataOnBoot();
      seedRealDealsOnBoot();
    },
  );

  registerShutdown(server, 'node');
}

void startServer().catch((error: unknown) => {
  console.error('[IVXOwnerAI-Server] Fatal startup error:', error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
