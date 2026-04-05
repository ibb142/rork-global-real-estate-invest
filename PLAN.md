# Landing Page Audit + Fix

## Scope

Landing page + admin sync diagnostics for landing readiness.
No admin guard work.
Developer module refresh requested separately.
Expanded to include investor-trust blocks, legal disclosures, automatic landing deploy flow across admin publish/update/save actions, full-brand logo cleanup, landing tracker warning suppression, and explicit owner IP access handling.
Expanded again to cover richer investor intake capture across landing + app: verified cell OTP, name split, investment range, target return, preferred call time, optional proof-of-funds metadata, member agreement acceptance/signature capture, and clearer property exit/share math for investor review.

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
- [x] Replace cropped/yellow logo presentation with the full IVX brand logo across landing and login surfaces
- [x] Suppress visitor-facing landing tracker debug noise that was surfacing at the bottom of Expo Go
- [x] Harden owner IP access so it restores only when explicitly enabled instead of auto-promoting every device
- [x] Deploy the refreshed landing page bundle to AWS S3
- [x] Sync the latest code changes to GitHub
- [x] Upgrade landing/app waitlist capture to collect first name, last name, email, verified cell OTP, investment amount range, target return, and best time for a call
- [x] Add optional proof-of-funds capture and persist its metadata in the investor lead flow
- [x] Sync richer investor lead data into the existing waitlist/admin submission pipeline
- [x] Add investor member agreement acceptance and typed-signature capture on landing and in-app intake flows
- [x] Add clearer property exit-sale math and investor ownership-share math on landing deal cards
- [x] Add clearer investment timeline guidance on investor-facing app property surfaces
- [x] Re-run checks after investor intake changes
- [ ] Re-deploy the refreshed landing page bundle to AWS S3 after investor intake changes
- [ ] Sync the latest investor-intake code changes to GitHub
