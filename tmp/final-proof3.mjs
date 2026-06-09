const OWNER="b8d6f01528fe515ead5390d3c408ea79b2b34c3f39eefebc004efdc02734284b";
const API="https://api.ivxholding.com";
const H={Authorization:`Bearer ${OWNER}`,"Content-Type":"application/json"};
async function j(url,opts){const r=await fetch(url,opts);let b;try{b=await r.json();}catch{b=await r.text().catch(()=>null);}return{status:r.status,body:b};}
(async()=>{
  for(const p of ["/api/ivx/leads","/api/ivx/investor-crm/contacts","/api/ivx/deals","/api/ivx/deal-tracking","/api/ivx/capital-pipeline"]){
    const r=await j(`${API}${p}`,{headers:H});
    const arr=Array.isArray(r.body)?r.body:(r.body?.items??r.body?.leads??r.body?.contacts??r.body?.deals??r.body?.data);
    const n=Array.isArray(arr)?arr.length:"n/a";
    console.log(`${p} HTTP ${r.status} count=${n}`);
  }
  // capture a live lead
  const lead=await j(`${API}/api/ivx/leads/capture`,{method:"POST",headers:H,body:JSON.stringify({name:"Proof Investor",email:`proof+${Date.now()}@ivx.test`,audience:"investor",message:"End-to-end durability proof",source:"final-proof"})});
  console.log("LEAD CAPTURE HTTP",lead.status,"id",lead.body?.id??lead.body?.lead?.id,"crmContactId",lead.body?.crmContactId??lead.body?.contact?.id,"stage",lead.body?.stage??lead.body?.lead?.stage,"score",lead.body?.score??lead.body?.lead?.score);
})();
