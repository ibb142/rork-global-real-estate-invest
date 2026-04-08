# Audit and complete the landing page for real investor readiness

## Progress

- [x] Audit the live landing flow, intake path, and investor-trust gaps
- [x] Add clear company credibility and management-access proof to the landing page
- [x] Add stronger investor disclosures and more precise investor-intake CTAs
- [x] Surface approved-member readiness and remove hype-heavy public claims before ad traffic
- [x] Validate the updated landing markup and investor-facing links
- [x] Add the shared IVX investor chat experience to the public landing page
- [x] Fix the in-app support chat keyboard overlap and tab-bar collision
- [x] Expand the shared AI support chat to answer technical-support, frontend/backend, AWS, and AI-integration questions
- [x] Route technical, AWS, backend, and ChatGPT support requests into smarter live-support escalation tickets across app and landing
- [x] Wire AI Ops owner alerts into email and WhatsApp escalation flows
- [x] Surface owner-facing AI Ops alert routing and incident feed inside the System Blueprint screen
- [x] Remove hard-coded landing timeline defaults and sync admin-edited deal timeline fields to landing data in real time
- [x] Remove hard-coded sale price rendering so landing and app cards only show admin-set sale price values
- [x] Fix the admin/shared chat room keyboard overlap on Android and keep messaging usable when Supabase chat tables are missing

## Features

- Keep the shared landing deal card intact while improving conversion readiness for real investors.
- Surface the legal entity, investor relations contact, business address, and management diligence path above the fold of the trust journey.
- Make investor-risk disclosures visible on the public page instead of relying only on the footer and legal modal.
- Tighten CTA copy so the public site clearly routes visitors into investor intake rather than vague waitlist language.
- Add owner-facing AI Ops escalation wiring so operational failures can trigger direct alert actions from the app.

## Design

- Keep the existing IVX landing aesthetic and section rhythm.
- Add credibility and disclosure blocks that feel native to the current dark luxury visual system.
- Improve trust without introducing a redesign of the live deals section or unrelated flows.

## Pages / Screens

- Static landing page: strengthen the public investor-conversion flow, credibility surface, and approved-member readiness story.
- App landing screen: mirror the trust, readiness, and investor-contact improvements used on the public flow.
- Landing support chat: expose the same investor chat experience available in-app, including live-support escalation.
- In-app support chat: keep the composer visible above the keyboard and prevent tab-bar overlap during typing.
- Shared support routing: classify technical, AWS, backend, and AI-integration chat requests before creating human-support tickets.
- Footer and CTA areas: align labels and contact points with real investor intake.
- System Blueprint screen: show live AI Ops owner alert routing, incident feed, and one-tap escalation actions.
- Admin/shared chat room: keep the composer visible above the Android keyboard and preserve room messaging when the Supabase chat tables are unavailable.

## Audit focus

- Confirm the live landing already exposes real deals and a real intake path.
- Close trust gaps that make the page feel incomplete for paid investor traffic.
- Make key diligence information visible before the investor submits the intake.

## Result

- The landing page presents a stronger real-investor story.
- Investor contact, management diligence access, and risk disclosures are visible on-page.
- Approved-member readiness for registration, profiles, wallet preparation, and transaction visibility is now surfaced publicly.
- Hype-heavy or weakly substantiated public claims were tightened so paid traffic lands on a more factual intake experience.
- The site remains focused on conversion without changing the core product flow.
- Public visitors can now use the same investor chat flow available inside the app before submitting the intake form.
- The authenticated app chat now stays usable while typing without the keyboard or tab bar covering the composer.
- The shared AI support chat now answers investor and technical-support questions across the app and landing flow, with honest escalation when a human is still needed.
- Human-support escalations now route technical and AI-integration conversations to more appropriate ticket categories and priorities.
- AI Ops can now stage direct owner alerts through email delivery and WhatsApp escalation from the live System Blueprint view.
- The System Blueprint screen now surfaces owner routing targets, recent AI Ops alert activity, and fast escalation actions when incidents appear.
- Landing deal cards now honor admin-set timeline values and the landing sync payload keeps trust info, display order, and property values aligned with admin edits.
- Sale price pills now render only from real admin-managed sale price data instead of legacy fallback or hard-coded values.
- The admin/shared chat room now measures real Android keyboard overlap, auto-scrolls more reliably, and falls back to local room storage when `messages` and `realtime_snapshots` are unavailable.

