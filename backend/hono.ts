import { Hono } from 'hono';
import { OPTIONS, handleIVXOwnerAIRequest } from './api/ivx-owner-ai';

const app = new Hono();
const DEPLOYMENT_MARKER = 'ivx-owner-ai-hono-2026-04-12t0028z';

app.use('*', async (context, next) => {
  console.log('[IVXOwnerAI-Hono] Incoming request:', {
    method: context.req.method,
    path: context.req.path,
    marker: DEPLOYMENT_MARKER,
  });
  await next();
});

app.get('/health', (context) => {
  return context.json({ ok: true, status: 'healthy', service: 'ivx-owner-ai-backend', deploymentMarker: DEPLOYMENT_MARKER });
});

app.options('/ivx/owner-ai', () => {
  return OPTIONS();
});

app.options('/api/ivx/owner-ai', () => {
  return OPTIONS();
});

app.post('/ivx/owner-ai', async (context) => {
  console.log('[IVXOwnerAI-Hono] Handling legacy owner-ai POST', DEPLOYMENT_MARKER);
  return handleIVXOwnerAIRequest(context.req.raw);
});

app.post('/api/ivx/owner-ai', async (context) => {
  console.log('[IVXOwnerAI-Hono] Handling api owner-ai POST', DEPLOYMENT_MARKER);
  return handleIVXOwnerAIRequest(context.req.raw);
});

app.notFound((context) => {
  console.log('[IVXOwnerAI-Hono] Route not found:', {
    method: context.req.method,
    path: context.req.path,
    marker: DEPLOYMENT_MARKER,
  });
  return context.json({ error: 'Not found', deploymentMarker: DEPLOYMENT_MARKER }, 404);
});

export default app;
