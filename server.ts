import { loadProjectEnv } from './expo/deploy/scripts/aws-runtime.mjs';
import app from './backend/hono';

loadProjectEnv(import.meta.url);

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
    },
  );

  registerShutdown(server, 'node');
}

void startServer().catch((error: unknown) => {
  console.error('[IVXOwnerAI-Server] Fatal startup error:', error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
