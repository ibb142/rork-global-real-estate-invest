import { loadProjectEnv } from './aws-runtime.mjs';
loadProjectEnv(import.meta.url);

const KEY = process.env.RENDER_API_KEY;
const SVC_ENV = process.env.RENDER_SERVICE_ID;
console.log('hasRenderKey=', !!KEY, 'hasRenderSvc=', !!SVC_ENV);
if (!KEY) { console.error('missing RENDER_API_KEY in shell'); process.exit(2); }

const svcRes = await fetch('https://api.render.com/v1/services?limit=50', { headers: { Authorization: `Bearer ${KEY}`, Accept: 'application/json' } });
const svcArr = await svcRes.json();
const list = Array.isArray(svcArr) ? svcArr : [];
const backend = list.find(s => s.service?.name === 'ivx-holdings-platform') || list.find(s => s.service?.id === SVC_ENV);
const backendId = backend?.service?.id;
console.log('backendName=', backend?.service?.name, 'id_suffix=', backendId ? backendId.slice(-8) : 'none');
if (!backendId) { console.error('backend service not found'); process.exit(3); }

const dep = await fetch(`https://api.render.com/v1/services/${backendId}/deploys`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ clearCache: 'do_not_clear' }) });
const depJson = await dep.json();
const depId = depJson.id;
console.log('deploy_trigger_status=', dep.status, 'depId=', depId, 'commit=', depJson.commit?.id?.slice(0,12));
if (!dep.ok) { console.error('deploy_trigger_failed', JSON.stringify(depJson).slice(0,300)); process.exit(4); }

console.log('polling_deploy...');
const start = Date.now();
let final = null;
while (Date.now() - start < 360000) {
  await new Promise(r => setTimeout(r, 8000));
  const p = await fetch(`https://api.render.com/v1/services/${backendId}/deploys/${depId}`, { headers: { Authorization: `Bearer ${KEY}` } });
  const pj = await p.json();
  process.stdout.write(`status=${pj.status} `);
  if (['live','build_failed','update_failed','canceled','deactivated'].includes(pj.status)) { final = pj; break; }
}
console.log('\nfinal_status=', final?.status);
if (final?.status !== 'live') { console.error('deploy did not reach live'); process.exit(5); }

await new Promise(r => setTimeout(r, 4000));
const h = await fetch('https://api.ivxholding.com/health');
const hj = await h.json();
console.log('health_marker=', hj.deploymentMarker);

const statusResponse = await fetch('https://api.ivxholding.com/api/ivx/owner-access-repair/status', {
  method: 'GET',
  headers: { Accept: 'application/json' },
});
const statusJson = await statusResponse.json().catch(() => ({}));
console.log('owner_repair_status_http=', statusResponse.status,
  'backendVersion=', statusJson.backendVersion,
  'requiresClientPassword=', statusJson.requiresClientPassword,
  'passwordUpdateSource=', statusJson.passwordUpdateSource,
  'ownerNewPasswordRuntimeSecretUsed=', statusJson.ownerNewPasswordRuntimeSecretUsed,
  'secretValuesReturned=', statusJson.secretValuesReturned);

if (statusJson.backendVersion !== 'V5' || statusJson.passwordUpdateSource !== 'client_request' || statusJson.ownerNewPasswordRuntimeSecretUsed !== false) {
  console.error('owner_repair_v5_not_live — do not run no-password/OWNER_NEW_PASSWORD repair. Use the phone UI: type a new password, then tap Reset password & log in.');
  process.exit(6);
}

console.log('OWNER_REPAIR_V5_LIVE=ok phone_password_is_source_of_truth secretValuesReturned=false');
