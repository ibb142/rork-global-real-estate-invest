import https from 'node:https';

const RENDER_KEY = process.env.RENDER_API_KEY || 'RENDER_API_KEY_PLACEHOLDER';
const BACKEND_SVC = 'srv-d7t9ivreo5us73ftose0';
const FRONTEND_SVC = 'srv-d7t9j00sfn5c738a18j0';
const COMMIT = '8720b102abc1f9ba79e6eda10844b5d83e2db8c1';

function fetch(url, opts = {}, timeout = 15000) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: opts.method || 'GET', headers: opts.headers || {}, timeout }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, body }));
    });
    req.on('error', (e) => resolve({ status: 0, error: String(e.message || e), body: '' }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout', body: '' }); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };

async function triggerDeploy(serviceId) {
  const r = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${RENDER_KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ commit: { id: COMMIT } }),
  });
  return { serviceId, status: r.status, body: j(r.body || '{}'), text: r.body?.slice(0, 200) };
}

async function main() {
  const backend = await triggerDeploy(BACKEND_SVC);
  const frontend = await triggerDeploy(FRONTEND_SVC);
  console.log(JSON.stringify({ backend, frontend }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
