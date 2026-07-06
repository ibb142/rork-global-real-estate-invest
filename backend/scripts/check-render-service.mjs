import https from 'node:https';

const RENDER_KEY = process.env.RENDER_API_KEY || 'RENDER_API_KEY_PLACEHOLDER';
const BACKEND_SVC = 'srv-d7t9ivreo5us73ftose0';
const FRONTEND_SVC = 'srv-d7t9j00sfn5c738a18j0';

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
    req.end();
  });
}
const j = (s) => { try { return JSON.parse(s); } catch { return null; } };

async function main() {
  const backend = await fetch(`https://api.render.com/v1/services/${BACKEND_SVC}`, { headers: { Authorization: `Bearer ${RENDER_KEY}`, Accept: 'application/json' } });
  const frontend = await fetch(`https://api.render.com/v1/services/${FRONTEND_SVC}`, { headers: { Authorization: `Bearer ${RENDER_KEY}`, Accept: 'application/json' } });
  console.log(JSON.stringify({
    backend: { status: backend.status, body: j(backend.body || '{}') },
    frontend: { status: frontend.status, body: j(frontend.body || '{}') },
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
