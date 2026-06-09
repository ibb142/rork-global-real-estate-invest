const RKEY="rnd_1H0XCquMZQTRyAnHgbEv8dVWYPVs";
const OWNER="b8d6f01528fe515ead5390d3c408ea79b2b34c3f39eefebc004efdc02734284b";
const SID="srv-d7t9ivreo5us73ftose0";
const API="https://api.ivxholding.com";
const H={Authorization:`Bearer ${OWNER}`,"Content-Type":"application/json"};
async function j(url,opts){const r=await fetch(url,opts);let b;try{b=await r.json();}catch{b=await r.text().catch(()=>null);}return{status:r.status,body:b};}

(async()=>{
  // HEALTH
  const h=await j(`${API}/health`);
  console.log("HEALTH",h.status,"commit",h.body?.commitShort,"boot",h.body?.bootTime,"aiEnabled",h.body?.aiEnabled,"autoRoutes",h.body?.autonomousCoreRoutesRegistered);

  // OWNER AI x5
  const codes=[];
  for(let i=0;i<5;i++){
    const t=Date.now();
    const r=await j(`${API}/api/ivx/owner-ai`,{method:"POST",headers:H,body:JSON.stringify({message:`Proof ping ${i+1}: reply with one short sentence.`})});
    const ms=Date.now()-t;
    const txt=(r.body?.reply??r.body?.message??r.body?.text??r.body?.output??"").toString().slice(0,80);
    codes.push(r.status);
    console.log(`OWNER-AI #${i+1} HTTP ${r.status} ${ms}ms source=${r.body?.source??"?"} :: ${txt}`);
  }
  console.log("OWNER-AI failures:",codes.filter(c=>c!==200).length,"/5");
})();
