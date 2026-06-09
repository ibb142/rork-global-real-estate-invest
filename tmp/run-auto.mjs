const OWNER="b8d6f01528fe515ead5390d3c408ea79b2b34c3f39eefebc004efdc02734284b";
const API="https://api.ivxholding.com";
const ctrl=new AbortController();
const t=setTimeout(()=>ctrl.abort(),120000);
try{
  const r=await fetch(`${API}/api/ivx/autonomous-mode/run`,{
    method:"POST",signal:ctrl.signal,
    headers:{Authorization:`Bearer ${OWNER}`,"Content-Type":"application/json"},
    body:JSON.stringify({task:"Owner live certification: run full 12-step autonomous lifecycle"})
  });
  clearTimeout(t);
  const txt=await r.text();
  let j=null;try{j=JSON.parse(txt)}catch{}
  if(j){const rep=j.report||j;
    console.log("HTTP",r.status,"finalStatus:",rep.finalStatus,"classification:",rep.classification,"taskId:",rep.taskId,"traceId:",rep.executionTraceId,"durationMs:",rep.durationMs);
  } else { console.log("HTTP",r.status,"body:",txt.slice(0,300)); }
}catch(e){clearTimeout(t);console.log("fetch error:",e.name,e.message);}
