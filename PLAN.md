# Landing Page Audit + Fix

## Scope

Landing page + admin sync diagnostics for landing readiness.
No admin guard work.
Developer module refresh requested separately.
Expanded to include investor-trust blocks, legal disclosures, and automatic landing deploy flow across admin publish/update/save actions.

## Checklist

- [x] Audit the current landing implementation against the requested landing items
- [x] Fix routing so unauthenticated visitors land on the public landing page
- [x] Sync featured deals section with the same shared published-deals source used by the app
- [x] Add stronger photo recovery/fallback handling for landing deal cards
- [x] Keep the waitlist section visible and reachable from CTA buttons on web/mobile
- [x] Refresh the developer module so it shows current project work split instead of stale generic items
- [x] Add admin-side deal image health diagnostics so bad photo sources are visible before publishing ads
- [x] Add landing-side image source badges showing whether deal media is coming from DB, Storage, or Fallback
- [x] Add hard trust proof blocks near each live deal card on the landing page
- [x] Add legal/risk disclosure content near CTA and footer-facing landing sections
- [x] Add a real company credibility block with entity, contact, address, and diligence access details
- [x] Force admin publish/unpublish/update actions to trigger automatic landing deploy flow
- [x] Surface GitHub/AWS/auto-deploy pipeline status inside sync diagnostics
- [x] Default landing auto-deploy configuration to enabled for new sessions
- [x] Run error checks on the touched landing/admin/deploy files
