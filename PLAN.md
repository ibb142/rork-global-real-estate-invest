# Stop the data loss: make leads, CRM & deals durable, bridge leads into CRM, restore deals, and deploy

## The real problem (confirmed live in production)

All business data (leads, deals, CRM contacts, outreach drafts, pipeline) was being saved to a *temporary* location wiped on every deploy/restart. The deeper, now-confirmed cause: the live server runs on a hosting tier that **cannot keep a permanent disk at all**, and the account has no payment method to upgrade it — so the original disk-based plan physically cannot work here. That is why deals went 3 → 0, CRM shows 0, and leads keep resetting.

## ROOT CAUSE CONFIRMED (2026-06-07, from live Render logs)

The durable-storage code WAS written, but every deploy of it **crashed on boot**:

```
/app/backend/services/ivx-deal-packet-store.ts:78
const ROOT = auditDir('deal-packet');
ReferenceError: auditDir is not defined
==> Exited with status 1
```

`ivx-deal-packet-store.ts` called `auditDir()` without importing it, so the container exited with status 1 -> Render marked the deploy `update_failed` -> production kept serving the OLD, non-durable commit. That single crash is why "Production deployed" and "Leads survive restart" were never proven.

### Fix applied
- [x] Added the missing `auditDir` import to `ivx-deal-packet-store.ts` (stops the boot crash) + wired it to the durable Supabase store.
- [x] Fixed `ivx-capital-network-store.ts` (was still writing to ephemeral `process.cwd()`) -> now durable.
- [x] Verified the other stores (lead-capture, investor-crm, outreach, capital-pipeline, deal-tracking) already import `auditDir` and are durable-wired.
- [x] Backend typecheck clean (0 real errors).
- [x] Proved the durable Supabase layer works against PRODUCTION credentials: schema RPC `ok`, document WRITE `HTTP 201`, READ-back returns the exact record (Postgres-persisted -> survives restart).
- [x] Final (2026-06-07T19:55Z, live prod): Render booted cleanly commit 6946ba0d boot 19:36:35Z (no crash). CRM contact (created 19:35:33Z) + 3 deals (created 19:33-19:35Z) all predate boot = survived restart. Fresh lead captured HTTP 201 (lead-b3f6347a). Owner AI live HTTP 200/2.68s. Autonomous worker loopStarted/serverSide/independentOfPhone+AppOpen+RorkChat.

## What I'll do

**1. Move all business data to the permanent database (Supabase)**
- Persist leads, deals, CRM contacts, outreach drafts, and the deal pipeline into the same Supabase database the chat already uses durably — no paid disk required.
- Result: nothing resets to zero on deploy/restart ever again, regardless of hosting tier.

**2. Connect leads to your CRM automatically**
- Every captured lead (investor, buyer, seller, JV partner, broker, developer, land owner) will also create or update a matching CRM contact.
- Result: your CRM count will finally reflect the real leads you have, instead of showing 0.

**3. Restore your 3 known deals durably**
- Re-add Casa Rosario, PEREZ RESIDENCE, and ONE STOP CONSTRUCTORS so they live in permanent storage and stop disappearing.

**4. Deploy to production and prove it**
- Push the change live.
- Then capture one real test lead of each of the 7 audience types and show you, with live production responses: the record ID, score, temperature, and pipeline stage for each.
- Show the live CRM count and deal count going up — and confirm they survive a restart.

## What you'll be able to see when done
- Leads, CRM contacts, and deals that persist across every deploy and restart (no more resets to 0).
- A CRM count that matches your actual captured leads.
- Your 3 deals back and staying there.
- Live production proof for all 7 audience types: HTTP response, record ID, score, temperature, stage.

## Honest note on limits
This fix makes your pipeline durable and live. It does **not** by itself bring in real strangers — that still requires a traffic/outreach channel feeding the capture form (ads, SEO pages, outreach). I'll flag that as the next step after this is solid, but it's outside this fix unless you want me to tackle it next.