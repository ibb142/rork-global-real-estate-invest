const OWNER="b8d6f01528fe515ead5390d3c408ea79b2b34c3f39eefebc004efdc02734284b";
const API="https://api.ivxholding.com";
const H={Authorization:`Bearer ${OWNER}`,"Content-Type":"application/json"};
async function j(url,opts){const r=await fetch(url,opts);let b;try{b=await r.json();}catch{b=await r.text().catch(()=>null);}return{status:r.status,body:b};}
(async()=>{
  // AUTONOMOUS RUN
  const run=await j(`${API}/api/ivx/autonomous-mode/run`,{method:"POST",headers:H,body:JSON.stringify({task:"Verify autonomous lifecycle end-to-end and return proof"})});
  const rb=run.body?.report??run.body;
  console.log("AUTONOMOUS HTTP",run.status,"final",rb?.finalStatus,"class",rb?.classification,"runId",rb?.runId??rb?.id,"trace",rb?.executionTraceId);
  if(rb?.steps)console.log("  steps:",rb.steps.length);

  // SENIOR DEVELOPER credential audit
  const sd=await j(`${API}/api/ivx/senior-developer/credential-audit`,{headers:H});
  console.log("SENIOR-DEV audit HTTP",sd.status,"ready",sd.body?.ready??sd.body?.ok,JSON.stringify(sd.body).slice(0,200));
})();
