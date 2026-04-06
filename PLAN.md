# Landing Page Audit + Fix

## Scope

Landing page + admin sync diagnostics for landing readiness.
No admin guard work.
Developer module refresh requested separately.
Expanded to include investor-trust blocks, legal disclosures, automatic landing deploy flow across admin publish/update/save actions, full-brand logo cleanup, landing tracker warning suppression, and explicit owner IP access handling.
Expanded again to cover richer investor intake capture across landing + app: verified cell OTP, name split, investment range, target return, preferred call time, optional proof-of-funds metadata, member agreement acceptance/signature capture, and clearer property exit/share math for investor review.
Expanded once more to cover stricter legal/compliance intake on landing + app: investor/entity type, dual-ID references, tax-responsibility acknowledgements, corporate EIN/tax details, beneficial-owner capture, and stronger member-registration terms for identity review and entity authority.
Expanded further to cover investor registration document photos from gallery/camera plus admin visibility for uploaded identity and tax files.
Expanded again to cover visible copy/paste actions on report screens for easier export from the app UI.
Expanded further to cover deep landing stability audit work: repair the malformed public landing bundle, hide the empty live ticker warning strip, remove the bad Jacksonville photo cross-mapping, and re-validate the deployed public HTML.
Expanded again to remove visitor-facing landing photo-source and fallback diagnostics from investor-facing deal cards while keeping the admin-side audit visibility.
Expanded once more to cover landing analytics and AWS backup regression handling so optional telemetry failures fall back locally without surfacing investor-facing console errors.
Expanded again to cover durable member registration retention: one-time signup, returning-user login-only flow, non-disappearing member records, and stronger admin member visibility/sync.
Expanded once more to cover trusted owner recognition: remove the public owner login bypass, require server-verified enablement from owner controls, and only restore owner auto-access on the previously verified device/IP.
Expanded again to cover backend/API route and AWS owner-recognition auditing: require a live authenticated owner session for deploy/write paths, attach project/app identity to AWS backup proxy calls, and disable unsafe trusted-owner restoration when network verification is unavailable.
Expanded once more to cover a visible admin audit panel with live owner-session, member-retention, backend-write, and deploy-pipeline status.
Expanded again to cover a landing-screen owner shortcut that only appears on the previously verified owner network/device and manually opens the full app modules when tapped.
Expanded once more to cover admin analytics breakdown for most-viewed screens, most-clicked functionality, and estimated time-spent metrics.
Expanded again to cover real-time thousands formatting across creator/user amount-entry screens so values auto-display like 1,000 while typing.
Expanded once more to cover admin-side live timeline persistence plus sale-price-driven fractional market math on investor deal cards and JV investment flows.
Expanded again to cover hard API JSON validation, CloudFront /api bypass routing, backend-direct checks, real load-test payload validation, and write-path probes for signup/waitlist/member persistence.
Expanded once more to publish static JSON API payloads and health responses to S3/CloudFront when the public domain is serving as a static site so /api/* and /health stop falling through to index.html.
Expanded again to harden signup safety and remove audit probe dependence on rate-limited email sends by using admin-created probe users when the service role is available.
Expanded once more to add a dedicated owner access hub with three controlled entry paths so the verified owner can reach the full app, Admin HQ, and Owner Controls without reintroducing unsafe public bypasses.
Expanded again to correct investor-facing deal cards so sale price appears in only one location while fractional dollar amounts stay in their own synced area across the app and landing page.
Expanded once more to force home and investor deal cards onto the same live published-deals photo source with faster real-time refresh.
Expanded again to remove the investor-facing 1H Ask pill so home/invest cards match the landing-page ownership display.
Expanded once more to suppress duplicated minimum-entry dollar pills when the entry amount matches the fractional minimum so home, invest, and landing cards stay visually synced.
Expanded again to remove stale public landing marketing claims so ivxholding.com matches the latest live app messaging, investor flow, and compliance-safe copy.
Expanded once more to cover a mobile landing hotfix for the Jacksonville fallback card so broken media never exposes alt text or malformed button/card layout on small screens.
Expanded again to fix canonical deal source-of-truth mapping so title, developer identity, and media resolve from the correct underlying fields everywhere, not only in the landing hotfix.

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
- [ ] Sync the latest code changes to GitHub
- [x] Upgrade landing/app waitlist capture to collect first name, last name, email, verified cell OTP, investment amount range, target return, and best time for a call
- [x] Add optional proof-of-funds capture and persist its metadata in the investor lead flow
- [x] Sync richer investor lead data into the existing waitlist/admin submission pipeline
- [x] Add investor member agreement acceptance and typed-signature capture on landing and in-app intake flows
- [x] Add clearer property exit-sale math and investor ownership-share math on landing deal cards
- [x] Add clearer investment timeline guidance on investor-facing app property surfaces
- [x] Re-run checks after investor intake changes
- [x] Re-deploy the refreshed landing page bundle to AWS S3 after investor intake changes
- [ ] Sync the latest investor-intake code changes to GitHub
- [x] Expand landing/app registration to collect investor type, two identification references, issuing country, and tax residency details
- [x] Add individual SSN/tax-reference capture plus corporate company name, signer role, EIN, company tax ID, registration jurisdiction, and beneficial-owner fields
- [x] Add tax-responsibility, identity-review, and entity-authority acknowledgements to member registration on landing and in-app flows
- [x] Persist the expanded compliance intake payload through the waitlist and landing-submission sync path
- [x] Wire expanded investor/compliance fields into admin waitlist review screens and CSV export
- [x] Re-run checks after the expanded legal/compliance intake changes
- [x] Add camera/gallery document image capture for passport, ID, and SSN/tax files in investor registration
- [x] Persist uploaded identity/tax document metadata through the waitlist and landing-submission sync path
- [x] Surface uploaded investor document links in admin waitlist review and CSV export
- [x] Re-run checks after investor document upload changes
- [x] Audit the deployed static ivxholding.com landing bundle for parity with the richer investor intake flow
- [x] Replace the legacy email-only public waitlist form with the richer investor intake fields on the static landing bundle
- [x] Re-run checks after the public landing intake parity fix
- [x] Re-deploy the static landing bundle after the public landing intake parity fix
- [x] Add visible copy and paste actions to report screens for easier export
- [x] Audit the deployed public landing bundle for crash-level markup/script corruption
- [x] Repair the malformed static landing HTML so only one complete document is shipped
- [x] Hide the live activity ticker until real content is ready so the empty green warning strip never shows
- [x] Remove the bad Jacksonville → Casa Rosario photo mapping and use a neutral Jacksonville placeholder until verified media exists
- [x] Add a hard cross-deal photo guard so polluted Jacksonville records cannot render Casa Rosario media again
- [x] Re-deploy and validate the repaired public landing HTML over the live domain
- [x] Remove visitor-facing photo source / fallback diagnostic badges from public landing deal cards and app landing cards
- [x] Keep landing analytics capture alive locally/AWS when Supabase landing_analytics writes are blocked or disabled
- [x] Stop AWS backup proxy retry loops when the configured endpoint returns permanent 4xx/5xx availability errors
- [x] Re-run checks after the landing analytics/AWS backup regression fix
- [x] Audit the current auth, registration, and member admin persistence flow
- [x] Fix signup so registration is only required once and returning users only need login
- [x] Fix durable member storage and admin member sync so records do not disappear
- [x] Run error checks after the auth/member persistence fix
- [x] Remove the public owner login bypass from the login screen and admin guard auto-recovery
- [x] Restrict owner auto-access to a previously server-verified owner device/IP only
- [x] Re-run error checks after the trusted owner access hardening
- [x] Audit the actual backend/API route usage and AWS-side owner recognition paths
- [x] Require a real authenticated owner session for deploy/write paths instead of anon fallback
- [x] Attach app/project identity headers to AWS backup proxy calls and treat permanent backend route failures as hard disable conditions
- [x] Remove unsafe trusted-owner restoration when IP/network verification is unavailable or init falls back
- [x] Add a visible admin audit panel in Admin HQ showing live owner access, member durability, backend guard, and deploy pipeline status
- [x] Extend Sync Diagnostics with the same live admin audit status blocks for quick verification
- [x] Add a landing-screen owner shortcut that only renders on the verified owner network/device and opens the full app modules on tap
- [x] Add admin analytics breakdown for most-viewed screens, most-clicked functionality, and estimated time-spent metrics
- [x] Add real-time thousands formatting across creator/user amount-entry screens so values auto-display like 1,000 while typing
- [x] Fix admin timeline edits so timeline changes auto-save live while editing active deal settings
- [x] Add sale price and fractional share pricing controls in admin and sync them into investor ownership math
- [x] Show sale price, live fractional pricing, and dynamic ownership copy on investor-facing deal cards and JV investment screens
- [x] Re-run checks after the timeline and sale-price market sync update
- [x] Add hard JSON response validation so HTML 200s fail health checks for landing deal APIs
- [x] Update CloudFront/API routing config so /api/* and /health* can bypass the SPA catch-all
- [x] Rebuild the load audit so it validates JSON payloads instead of counting static 200 responses
- [x] Add backend-direct API audit coverage alongside public-domain checks
- [x] Add live write-path probes for signup, waitlist submission, and member profile persistence
- [x] Stop accepting base64 deal media in published API payload mapping and require URL-backed assets
- [x] Publish static JSON payloads for /api/landing-deals, /api/published-jv-deals, and /health to the public S3/CloudFront site
- [x] Re-deploy and validate the public JSON API endpoints over ivxholding.com after publishing static API payloads
- [x] Harden the readiness audit so 30k and 1M support are reported separately with honest blocker/evidence status
- [x] Harden legacy waitlist fallback writes so older live Supabase schemas still persist landing/app submissions
- [x] Re-run the live 30k audit and record the current blocker evidence honestly
- [x] Shift landing/app published-deal read paths to prefer the live public JSON endpoints before direct backend fallback
- [x] Reduce user-facing landing/app exposure to missing direct backend `/api/published-jv-deals` and `/health` routes
- [x] Harden signup messaging so rate-limited auth sends do not misreport saved registration state
- [x] Normalize signup email input before submission and steer existing/rate-limited users into Sign In safely
- [x] Remove optional audit signup probe dependence on Supabase outbound email rate limits when service-role admin user creation is available
- [x] Add a dedicated owner access hub with three controlled owner entry paths
- [x] Link landing, login, and admin surfaces to the owner access hub for faster verified-owner recovery
- [x] Tighten owner-access hub messaging so the carried owner email and exact next sign-in action are shown clearly
- [x] Remove duplicated sale-price presentation from investor deal cards and keep fractional dollar amounts in a separate synced area on app + landing surfaces
- [x] Sync home and investor deal cards to the same live published-deals photo source with faster refresh
- [x] Remove the investor-facing 1H Ask pill so home/invest cards match the landing-page ownership display
- [x] Hide duplicate entry-dollar pills when the entry amount matches the fractional minimum across home, invest, and landing cards
- [x] Audit the public landing page for stale investor-facing marketing claims that no longer match the live app
- [x] Update and re-deploy the static landing copy so ivxholding.com matches the latest investor flow and compliance-safe messaging
- [x] Add a human smoke check script for landing HTML, live JSON endpoints, and manual app/landing verification
- [x] Add a strict investor CTA audit script that traces one landing investor path end-to-end and lists exact remaining human-risk points
- [x] Hotfix the mobile Jacksonville fallback card so missing media cannot expose alt text or break the small-screen deal layout
- [x] Remove false-success investor funnel behavior so landing/app success states only render after a confirmed persisted save
- [x] Fix canonical deal source-of-truth mapping so title, developer identity, and media resolve from the correct fields across app, sync, and static export paths

## Live Audit Status — 2026-04-05

- Public landing JSON endpoints are live and valid:
  - `https://ivxholding.com/api/landing-deals` → pass
  - `https://ivxholding.com/api/published-jv-deals` → pass
  - `https://ivxholding.com/health` → pass
- Direct backend deal endpoint is live for `/api/landing-deals`.
- The direct origin still only exposes `/api/landing-deals`, but the readiness proof now validates the supported production mirror architecture for `/api/published-jv-deals` and `/health` through the live public JSON endpoints instead of treating those legacy direct-route 404s as launch blockers.
- Audit tooling was updated to stop false failures caused by:
  - invalid `@example.com` signup probe emails
  - hardcoded `waitlist_entries` probe assumptions when the live project is still using the legacy `waitlist` fallback path
  - older legacy waitlist schemas that do not contain the richer `first_name`/`last_name` columns
- App/runtime fallback was hardened so landing/app submissions can still persist through the legacy waitlist path with a minimal compatible payload when the older schema is live.
- Landing/app published-deal read paths now prefer the live public JSON endpoints on `ivxholding.com` first, then fall back to the direct backend only if needed, so user-facing deal reads are no longer dependent on the missing direct `/api/published-jv-deals` route.
- Latest live validation after the rebuild:
  - `bun ./scripts/api-direct-audit.mjs` → pass
  - `BACKEND_READY_RUN_WRITE_PROBES=false bun ./scripts/backend-readiness.mjs` → pass
  - `LOAD_AUDIT_TOTAL_REQUESTS=300 LOAD_AUDIT_CONCURRENCY=30 LOAD_AUDIT_RUN_WRITE_PROBES=false bun ./scripts/load-audit.mjs` → pass
- Direct `/api/published-jv-deals` and `/health` 404s are now treated as mirrored compatibility paths, not production blockers, because the live public JSON endpoints are the supported launch surface and validate successfully.
- Signup flow was hardened so email input is normalized before submission and email-send throttling now reports that registration was not saved yet instead of implying success.
- Audit tooling now prefers Supabase admin user creation for signup probes when the service role is available, which removes dependency on outbound auth email rate limits during full write-probe runs.
- Honest status right now: the direct-route blocker has been removed from the 30k backend-proof path, and the prior optional signup-probe rate-limit gap is now hardened in both the app flow and the audit tooling.
- Added `expo/scripts/human-smoke-check.mjs` so landing HTML structure, live JSON endpoints, and a human manual verification checklist can be run together quickly.

## Live Audit Status — 2026-04-06

- Re-ran the live audit suite successfully:
  - `bun ./scripts/api-direct-audit.mjs` → pass
  - `BACKEND_READY_RUN_WRITE_PROBES=false bun ./scripts/backend-readiness.mjs` → pass
  - `LOAD_AUDIT_TOTAL_REQUESTS=300 LOAD_AUDIT_CONCURRENCY=30 LOAD_AUDIT_RUN_WRITE_PROBES=false bun ./scripts/load-audit.mjs` → pass
  - `bun ./scripts/human-smoke-check.mjs` → pass
- Re-ran targeted code validation:
  - `checkErrors` on the audit scripts → pass
- Current live evidence from today’s run:
  - `https://ivxholding.com/` returned valid HTML with the expected IVX/invest/member/owner/deal markers.
  - `https://ivxholding.com/api/landing-deals` → pass
  - `https://ivxholding.com/api/published-jv-deals` → pass
  - `https://ivxholding.com/health` → pass
  - `https://dev-jh1qrutuhy6vu1bkysoln.rorktest.dev/api/landing-deals` → pass
- Honest limitation: the script-based smoke check passed, but the manual human checklist still requires a person on a real device/browser to confirm tap flow, real form submission, Expo Go visual parity, real login/returning-user flow, and final visual sync of image/sale price/minimum entry.
- Honest bottom line: everything that can be verified automatically from this environment passed today; only the manual human verification items remain outside this terminal run.
- Post-audit correction from user screenshot: a remaining mobile landing bug was still present in the static Jacksonville fallback card. The card could briefly render an empty `<img>` without a `src`, which let mobile Chrome display the alt text inside the gallery area. This hotfix removes that exposure and tightens the small-screen card header/action layout.
- Re-deployed the landing hotfix with `bun ./scripts/deploy-landing-v2.mjs` after the default deploy script hit an S3 TLS host validation error on the bucket-style endpoint. The path-style deploy succeeded and the post-deploy `bun ./scripts/human-smoke-check.mjs` run passed against `https://ivxholding.com/`.
- Honest audit correction after the latest end-to-end check: the earlier landing pass proved that the public JSON endpoints were alive, but it did not prove they matched the live `jv_deals` source rows. The new audit now compares the public landing payload count against a schema-safe Supabase source-of-truth read so stale mirrored payloads are caught instead of being reported as healthy.
- Root cause found today: the live public landing JSON had gone stale. Supabase showed 3 currently visible JV rows (`PEREZ RESIDENCE`, `CASA ROSARIO`, and `ONE STOP CONSTRUCTORS INC`), while the public `/api/published-jv-deals` mirror was still serving the older Jacksonville card. This is why the later JV card view did not match the current source of truth even though the endpoint itself returned HTTP 200.
- Fix shipped today: hardened `expo/scripts/landing-static-api.mjs`, `expo/lib/canonical-deals.ts`, `expo/lib/landing-sync.ts`, and `expo/scripts/human-smoke-check.mjs` to use schema-safe full-row reads plus local landing-visibility filtering, avoiding false assumptions about a missing `is_published` column in production.
- Re-deployed the refreshed landing payload with `bun ./scripts/deploy-landing-v2.mjs` and re-ran `bun ./scripts/human-smoke-check.mjs` successfully after the fix.
- Latest live re-check just completed in this session:
  - `bun ./scripts/human-smoke-check.mjs` → pass
  - `landing_deals_public` → 200 with 3 deals
  - `published_deals_public` → 200 with 3 deals
  - `landing_deals_direct` → 200 with 3 deals
  - direct `published_deals` still reports the expected mirrored 404 compatibility note, while the public mirrored endpoint is healthy
- Investor-funnel hardening shipped in code: landing and investor intake success UI now requires a confirmed persisted row id from the waitlist write path before success is shown, including the legacy waitlist fallback path.
- Added `expo/scripts/investor-cta-audit.mjs` to trace one real landing investor CTA end-to-end in code: landing mounts `InvestorIntakeForm`, OTP/compliance gating is enforced before submit, `submitWaitlistEntry()` re-validates inputs, and both primary + legacy persistence paths require a returned row id before success UI is allowed.
- Exact remaining human-risk points now surfaced explicitly by the new investor CTA audit:
  - real Supabase SMS OTP delivery/verification still requires a physical phone test
  - optional proof/ID uploads are non-blocking, so a lead can save even if file storage fails
  - confirmation email remains async/best-effort and is not proof of persistence
  - final browser/device runtime behavior still needs manual verification on a real device
- Targeted validation after the funnel hardening:
  - `checkErrors` on `expo/lib/waitlist-service.ts`, `expo/components/InvestorIntakeForm.tsx`, and `expo/app/landing.tsx` → pass
- Source-of-truth mapping hardening shipped in this session:
  - added `expo/lib/deal-identity.ts` as the canonical resolver for deal title, project name, and developer identity
  - updated `expo/lib/published-deal-card-model.ts`, `expo/lib/landing-sync.ts`, `expo/lib/parse-deal.ts`, `expo/lib/jv-storage.ts`, and `expo/scripts/landing-static-api.mjs` to consume the same canonical mapping and photo identity
  - removed the old fallback that could incorrectly derive the developer line from `project_name` or stale ad hoc field order in some paths
  - targeted validation passed: `checkErrors` on the touched TypeScript files → pass
  - script-level validation passed: `bun -e "import('./scripts/landing-static-api.mjs').then(() => console.log('landing-static-api import ok'))"` → pass
- Jacksonville strict trace hardening shipped in this session:
  - updated `expo/scripts/investor-cta-audit.mjs` to print the Jacksonville record path field-by-field from source row → canonical mapping → mirrored public payload
  - tightened `expo/lib/deal-identity.ts` so a stale raw developer field that simply duplicates the project name no longer overrides a clearer company-style title
  - expanded `expo/scripts/landing-static-api.mjs` so the mirrored public JSON exports both camelCase and snake_case field aliases for canonical deal identity fields
  - re-deployed the static landing payload with `bun ./scripts/deploy-landing-v2.mjs`
  - latest live Jacksonville public payload now resolves as:
    - `title` → `ONE STOP CONSTRUCTORS INC`
    - `projectName` / `project_name` → `IVX JACKSONVILLE PRIME`
    - `developerName` / `developer_name` → `ONE STOP CONSTRUCTORS INC`
    - `photos` → 8 remote storage URLs from `JV-202603-5190` (no Casa Rosario cross-map, no base64 image in the mirrored public payload)
- Honest GitHub correction from the public repo evidence:
  - the public GitHub repository page shows the latest visible update as `2 days ago` on `main`
  - the earlier statement that GitHub was updated today was not proven by the public repo evidence
  - passing deploy/audit checks today does not prove a fresh public GitHub push today
  - until a new public commit timestamp appears, GitHub sync should be treated as unconfirmed

## Session Update — 2026-04-06 (continued)

- Fixed the investor CTA audit script photo comparison:
  - `buildCanonicalCardSnapshotLocal` was appending `?ivxv=<timestamp>` version params to canonical photo URLs
  - public API photos did not have those params, so strict `JSON.stringify` comparison always failed
  - normalized both sides through `normalizePhotoFingerprint()` before comparing
  - `bun ./scripts/investor-cta-audit.mjs` → now PASS (was previously FAIL on `jacksonville_record_trace`)
- Re-ran all audit scripts successfully:
  - `bun ./scripts/investor-cta-audit.mjs` → PASS
  - `bun ./scripts/human-smoke-check.mjs` → PASS
  - `checkErrors` on all landing/lib files → 0 errors
- Re-deployed static landing payload:
  - `bun ./scripts/deploy-landing-v2.mjs` → success at 2026-04-06T16:05:07.245Z
  - All 3 deals present: Jacksonville, Perez, Casa Rosario
  - All API endpoints uploaded: index.html, ivx-config.json, api/landing-deals, api/published-jv-deals, health
