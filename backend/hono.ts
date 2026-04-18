import { Hono } from 'hono';
import { GET, OPTIONS, handleIVXOwnerAIRequest } from './api/ivx-owner-ai';

async function loadRoute53Module() {
  try {
    return await import('./api/route53-dns');
  } catch (error) {
    console.log('[IVXOwnerAI-Hono] Route53 module unavailable:', error instanceof Error ? error.message : 'unknown');
    return null;
  }
}

function route53UnavailableResponse(): Response {
  return new Response(JSON.stringify({
    error: 'Route53 DNS tooling is unavailable in this runtime.',
  }), {
    status: 503,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

async function handleRoute53Options(): Promise<Response> {
  const route53Module = await loadRoute53Module();
  if (!route53Module) {
    return route53UnavailableResponse();
  }

  return route53Module.route53DnsOptions();
}

async function handleRoute53Request(
  request: Request,
  action: 'audit' | 'upsert',
): Promise<Response> {
  const route53Module = await loadRoute53Module();
  if (!route53Module) {
    return route53UnavailableResponse();
  }

  if (action === 'audit') {
    return route53Module.handleRoute53DNSAudit(request);
  }

  return route53Module.handleRoute53DNSUpsert(request);
}

const app = new Hono();
const DEPLOYMENT_MARKER = 'ivx-owner-ai-hono-2026-04-13t0015z';

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

app.get('/ivx/owner-ai', () => {
  console.log('[IVXOwnerAI-Hono] Handling legacy owner-ai GET', DEPLOYMENT_MARKER);
  return GET();
});

app.get('/api/ivx/owner-ai', () => {
  console.log('[IVXOwnerAI-Hono] Handling api owner-ai GET', DEPLOYMENT_MARKER);
  return GET();
});

app.post('/ivx/owner-ai', async (context) => {
  console.log('[IVXOwnerAI-Hono] Handling legacy owner-ai POST', DEPLOYMENT_MARKER);
  return handleIVXOwnerAIRequest(context.req.raw);
});

app.post('/api/ivx/owner-ai', async (context) => {
  console.log('[IVXOwnerAI-Hono] Handling api owner-ai POST', DEPLOYMENT_MARKER);
  return handleIVXOwnerAIRequest(context.req.raw);
});

app.options('/api/aws/route53/audit', async () => {
  return await handleRoute53Options();
});

app.options('/api/aws/route53/upsert', async () => {
  return await handleRoute53Options();
});

app.post('/api/aws/route53/audit', async (context) => {
  console.log('[IVXOwnerAI-Hono] Handling Route53 audit POST', DEPLOYMENT_MARKER);
  return await handleRoute53Request(context.req.raw, 'audit');
});

app.post('/api/aws/route53/upsert', async (context) => {
  console.log('[IVXOwnerAI-Hono] Handling Route53 upsert POST', DEPLOYMENT_MARKER);
  return await handleRoute53Request(context.req.raw, 'upsert');
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
