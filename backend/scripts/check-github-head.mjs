import https from 'node:https';

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
  const r = await fetch('https://api.github.com/repos/ibb142/rork-global-real-estate-invest/commits/main', { headers: { Accept: 'application/json', 'User-Agent': 'rork-ivx-proof' } });
  const body = j(r.body || '{}');
  console.log(JSON.stringify({ status: r.status, sha: body?.sha, message: body?.commit?.message, date: body?.commit?.committer?.date }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
