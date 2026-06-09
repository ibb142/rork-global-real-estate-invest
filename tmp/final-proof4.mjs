const OWNER="b8d6f01528fe515ead5390d3c408ea79b2b34c3f39eefebc004efdc02734284b";
const API="https://api.ivxholding.com";
const H={Authorization:`Bearer ${OWNER}`,"Content-Type":"application/json"};
async function j(url,opts){const r=await fetch(url,opts);let b;try{b=await r.json();}catch{b=await r.text().catch(()=>null);}return{status:r.status,body:b};}
(async()=>{
  const before=await j(`${API}/api/ivx/leads`,{headers:H});
  console.log("LEADS before:",before.body?.leads?.length, "| summary:",JSON.stringify(before.body?.summary?.byStage??before.body?.summary??{}).slice(0,120));
  const lead=await j(`${API}/api/ivx/leads/capture`,{method:"POST",headers:H,body:JSON.stringify({
    name:"Proof Investor",email:`proof+${Date.now()}@ivx.test`,phone:"+10000000000",
    role:"investor",budgetRange:"1M-5M",preferredMarket:"Miami",consent:true,
    ctaType:"book_call",source:"lead_form",notes:"End-to-end durability proof",
    signals:{viewedDeal:true,requestedCall:true}
  })});
  console.log("LEAD CAPTURE HTTP",lead.status,"| leadId:",lead.body?.lead?.id,"| score:",lead.body?.lead?.score,"| temp:",lead.body?.lead?.temperature,"| stage:",lead.body?.lead?.stage,"| crmContactId:",lead.body?.crmContact?.id);
  if(lead.body?.error)console.log("  error:",lead.body.error);
  const after=await j(`${API}/api/ivx/leads`,{headers:H});
  console.log("LEADS after:",after.body?.leads?.length);
  const dt=await j(`${API}/api/ivx/deal-tracking`,{headers:H});
  const deals=dt.body?.deals??dt.body?.items??(Array.isArray(dt.body)?dt.body:[]);
  console.log("DEALS count:",Array.isArray(deals)?deals.length:"n/a","| names:",Array.isArray(deals)?deals.map(d=>d.name??d.title??d.dealName).join(", "):"");
})();
