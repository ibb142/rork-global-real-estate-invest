/**
 * IVX Cloudflare Worker origin router for Render.
 *
 * Purpose:
 * - Terminate TLS at Cloudflare for api.ivxholding.com and chat.ivxholding.com.
 * - Forward API traffic to the Render backend origin.
 * - Forward chat/frontend traffic to the Render static-site origin.
 *
 * This file intentionally contains no secrets.
 */
const ORIGINS = {
  'api.ivxholding.com': 'ivx-holdings-platform.onrender.com',
  'chat.ivxholding.com': 'ivx-holdings-chat-frontend.onrender.com',
};

const BOOLEAN_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const HTTPS_PROTOCOL = 'https:';

function shouldUseResolveOverride(env) {
  const value = typeof env?.IVX_WORKER_USE_RESOLVE_OVERRIDE === 'string'
    ? env.IVX_WORKER_USE_RESOLVE_OVERRIDE.trim().toLowerCase()
    : '';

  return BOOLEAN_TRUE_VALUES.has(value);
}

function createJsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD',
    },
  });
}

function buildForwardHeaders(request, originalHost, originHost) {
  const headers = new Headers(request.headers);

  headers.delete('host');
  headers.set('x-forwarded-host', originalHost);
  headers.set('x-forwarded-proto', 'https');
  headers.set('x-ivx-origin-host', originHost);

  return headers;
}

function buildTargetUrl(requestUrl, targetHost, keepIncomingHost) {
  const targetUrl = new URL(requestUrl);
  targetUrl.protocol = HTTPS_PROTOCOL;
  targetUrl.username = '';
  targetUrl.password = '';
  targetUrl.port = '';

  if (!keepIncomingHost) {
    targetUrl.hostname = targetHost;
  }

  return targetUrl;
}

async function handleRequest(request, env = {}) {
  const incomingUrl = new URL(request.url);
  const originalHost = incomingUrl.hostname.toLowerCase();
  const originHost = ORIGINS[originalHost];
  const useResolveOverride = shouldUseResolveOverride(env);

  if (request.method === 'OPTIONS') {
    return createJsonResponse({ ok: true, status: 'preflight' });
  }

  if (!originHost) {
    return createJsonResponse({
      ok: false,
      status: 'unknown_host',
      host: originalHost,
      allowedHosts: Object.keys(ORIGINS),
    }, 404);
  }

  const targetUrl = buildTargetUrl(request.url, originHost, useResolveOverride);
  const proxyRequestInit = {
    method: request.method,
    headers: buildForwardHeaders(request, originalHost, originHost),
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    proxyRequestInit.body = request.body;
  }

  const fetchInit = useResolveOverride
    ? { cf: { resolveOverride: originHost } }
    : undefined;
  const proxyRequest = new Request(targetUrl.toString(), proxyRequestInit);
  const response = await fetch(proxyRequest, fetchInit);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('x-ivx-worker-router', 'cloudflare-to-render');
  responseHeaders.set('x-ivx-render-origin', originHost);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

if (typeof addEventListener === 'function') {
  addEventListener('fetch', (event) => {
    event.respondWith(handleRequest(event.request));
  });
}

export default {
  fetch: handleRequest,
};
