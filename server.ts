import app from './backend/hono';

const portValue = process.env.PORT ?? '3000';
const parsedPort = Number.parseInt(portValue, 10);
const port = Number.isFinite(parsedPort) ? parsedPort : 3000;
const hostname = (process.env.HOST ?? '0.0.0.0').trim() || '0.0.0.0';

export default {
  port,
  hostname,
  fetch: app.fetch,
};

console.log('[IVXOwnerAI-Server] Starting Bun server', {
  port,
  hostname,
  nodeEnv: process.env.NODE_ENV ?? 'development',
});
