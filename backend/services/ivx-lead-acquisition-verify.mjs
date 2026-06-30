/**
 * BLOCK — Lead Acquisition verification (ad-hoc, runnable proof).
 * Creates one test lead per acquisition audience type through the REAL capture
 * pipeline, then prints the CRM record + score + temperature + pipeline stage +
 * outreach draft for each. Honest: uses the same store/drafter the live API uses.
 *
 * Run: bun backend/services/ivx-lead-acquisition-verify.mjs
 */
import { captureLead, summarizeLeads } from './ivx-lead-capture-store.ts';
import { buildOutreachDraft } from './ivx-outreach-drafter.ts';

const AUDIENCES = [
  { role: 'investor', cta: 'request_investor_packet', outreach: 'investor_intro', campaign: 'q3-investor-launch', interest: 'Casa Rosario fractional ownership' },
  { role: 'buyer', cta: 'get_deal_access', outreach: 'buyer_intro', campaign: 'q3-buyer-launch', interest: 'South Florida luxury buyer' },
  { role: 'seller', cta: 'schedule_call', outreach: 'meeting_request', campaign: 'seller-acquisition', interest: 'Sell Pembroke Pines property' },
  { role: 'jv_partner', cta: 'request_investor_packet', outreach: 'investor_intro', campaign: 'jv-capital-partners', interest: 'JV capital partner on development deals' },
  { role: 'broker', cta: 'get_deal_access', outreach: 'investor_intro', campaign: 'broker-network', interest: 'Realtor / broker referral partner' },
  { role: 'developer', cta: 'get_deal_access', outreach: 'deal_update', campaign: 'builder-developer', interest: 'Builder / developer on redevelopment sites' },
  { role: 'land_owner', cta: 'schedule_call', outreach: 'meeting_request', campaign: 'land-acquisition', interest: 'Land owner with off-market parcel' },
];

let okCount = 0;
const rows = [];

for (let i = 0; i < AUDIENCES.length; i++) {
  const a = AUDIENCES[i];
  const res = await captureLead({
    name: `Test ${a.role} ${i + 1}`,
    email: `test-${a.role}@example.com`,
    phone: '555-0100',
    role: a.role,
    consent: true,
    source: 'lead_form',
    sourceDetail: 'verification-script',
    campaign: a.campaign,
    page: '/capture',
    dealInterest: a.interest,
    ctaType: a.cta,
    relatedDeal: 'Casa Rosario',
  });
  if (!res.ok) {
    rows.push({ role: a.role, ok: false, error: res.error });
    continue;
  }
  const lead = res.lead;
  const draft = buildOutreachDraft({
    type: a.outreach,
    recipientName: lead.name,
    relatedDeal: lead.relatedDeal,
    contextNote: lead.dealInterest,
    senderName: 'IVX Holdings',
  });
  const captured =
    lead.role === a.role &&
    !!lead.id &&
    typeof lead.leadScore === 'number' &&
    !!lead.temperature &&
    !!lead.stage &&
    lead.campaign === a.campaign &&
    lead.page === '/capture' &&
    lead.dealInterest === a.interest &&
    draft.subject.length > 0 &&
    draft.body.length > 0;
  if (captured) okCount++;
  rows.push({
    role: lead.role,
    ok: captured,
    id: lead.id,
    score: lead.leadScore,
    temperature: lead.temperature,
    stage: lead.stage,
    source: lead.source,
    campaign: lead.campaign,
    page: lead.page,
    dealInterest: lead.dealInterest,
    draftSubject: draft.subject,
  });
}

console.log('\n=== LEAD ACQUISITION VERIFICATION ===');
for (const r of rows) {
  if (!r.ok && r.error) {
    console.log(`✗ ${r.role.padEnd(12)} FAILED: ${r.error}`);
    continue;
  }
  console.log(
    `${r.ok ? '✓' : '✗'} ${r.role.padEnd(12)} score=${String(r.score).padStart(3)} ` +
    `temp=${r.temperature.padEnd(9)} stage=${r.stage.padEnd(10)} ` +
    `campaign=${r.campaign} page=${r.page}\n   draft: "${r.draftSubject}"`,
  );
}

const summary = await summarizeLeads();
console.log('\n=== CRM SUMMARY ===');
console.log('total:', summary.total, '| byRole:', JSON.stringify(summary.byRole));
console.log('byTemperature:', JSON.stringify(summary.byTemperature));
console.log('byStage:', JSON.stringify(summary.byStage));
console.log(`\nRESULT: ${okCount}/${AUDIENCES.length} audience types captured with full CRM record + score + temperature + stage + tracking + outreach draft`);
