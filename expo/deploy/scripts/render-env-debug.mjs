import { loadProjectEnv } from './aws-runtime.mjs';
loadProjectEnv(import.meta.url);
const KEY = process.env.RENDER_API_KEY;
const id = 'srv-d7t9ivreo5us73ftose0';
const r = await fetch(`https://api.render.com/v1/services/${id}/env-vars`, { headers: { Authorization: `Bearer ${KEY}` } });
const t = await r.text();
console.log('status=', r.status, 'len=', t.length);
console.log('first800=', t.slice(0, 800));
