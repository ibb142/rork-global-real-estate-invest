/**
 * IVX Holdings — Production Entry Point
 * 
 * Starts the Hono API server (backend/hono.ts) which serves all API routes
 * including engagement APIs, member APIs, deploy tools, and chat endpoints.
 * 
 * Runtime: Node.js (tsx) on Render (render.yaml dockerCommand override)
 * Port:    PORT env var (default 3000)
 */
import { serve } from '@hono/node-server';
import type { Server as HttpServer } from 'node:http';
import app from './backend/hono';
import { attachChatRealtime } from './backend/chat-realtime';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

console.log('[IVX Server] Starting Hono API server...', {
  host: HOST,
  port: PORT,
  nodeEnv: process.env.NODE_ENV || 'development',
});

const server = serve(
  {
    fetch: app.fetch,
    port: PORT,
    hostname: HOST,
  },
  (info) => {
    console.log('[IVX Server] Hono API server online', {
      host: HOST,
      port: info.port,
      family: info.family,
    });
  },
);

// Mount the Socket.IO realtime chat layer on the same HTTP server so
// /socket.io works in production (previously only REST was served).
const realtime = attachChatRealtime(server as unknown as HttpServer);

function shutdown(signal: string): void {
  console.log('[IVX Server] Shutdown requested', { signal });
  realtime.close();
  server.close(() => {
    console.log('[IVX Server] HTTP server closed');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
