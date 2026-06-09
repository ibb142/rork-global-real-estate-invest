# IVX → Rork Dependency Inventory

Generated: 2026-05-13
Goal: 0% Rork dependency · 100% IVX-owned infrastructure + application stack.
Project ID (Rork-assigned, sandbox-only): `jh1qrutuhy6vu1bkysoln`

Legend:
- Risk: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low / cosmetic
- Status %: portion already migrated off Rork (100% = fully IVX-owned)

---

## 1. Code Hosting / Source of Truth

### 1.1 Rork-hosted Git remote
- **Current dependency:** `origin` = `https://backend.rork.com/git/jh1qrutuhy6vu1bkysoln` (tokenized, ephemeral). All commits made by the Rork agent land here first.
- **Risk:** 🔴 Critical — Rork is the canonical source; IVX GitHub is a mirror only.
- **Migration steps:**
  1. Make `github.com/ibb142/rork-global-real-estate-invest` the canonical remote.
  2. Run `expo/sync-github.mjs` on every Rork commit (already implemented; needs scheduling).
  3. Set Render `autoDeployTrigger: commit` to watch the GitHub repo branch instead of Rork.
  4. Eventually export the project, drop the Rork sandbox, and develop directly against GitHub via local checkouts + CI.
- **Transfer to IVX owner:**
  - Owner already owns the GitHub repo + `GITHUB_TOKEN`.
  - Add an IVX-owned cron (GitHub Actions `schedule:` or Render cron) that runs `sync-github.mjs` so syncing does not depend on the Rork agent being invoked.
- **Status:** 60% (mirror exists, sync script exists, but Rork remote is still authoritative).

### 1.2 `rork.json` + `.rork/` + `rork.com` schema
- **Current dependency:** `rork.json` references `https://rork.com/schema/rork.json`; `.rorkignore`; `.rork/skills/*` and `.rork/history/*` are Rork-specific.
- **Risk:** 🟢 Low — config-only, not runtime.
- **Migration steps:** Once off Rork, delete `rork.json`, `.rorkignore`, `.rork/` from the IVX-owned branch.
- **Transfer:** No external transfer needed.
- **Status:** 0% (still present, but harmless until cut-over).

---

## 2. Rork Agent Sandbox (this environment)

- **Current dependency:** The Linux sandbox you're talking to, including `runChecks`, asset URLs at `rork.app/pa/{projectId}/...`, and Rork CI preview.
- **Risk:** 🟠 High — every change you currently make flows through this agent. If Rork is unavailable, code edits stop.
- **Migration steps:**
  1. Export final source from Rork repo to IVX GitHub (done weekly via `sync-github.mjs`).
  2. Move day-to-day development to local IDE + Claude/Codex/Cursor against the GitHub repo.
  3. Keep Rork only as an optional preview environment.
- **Transfer:** N/A — IVX owner already has GitHub + Render + Supabase + AWS accounts. Owner just needs to stop opening Rork.
- **Status:** 0% (still primary editor).

---

## 3. CI / CD

### 3.1 Rork CI preview (iOS sim + Android sim + Expo Go tunnel)
- **Current dependency:** Live preview via Rork CI. No replacement wired.
- **Risk:** 🟡 Medium — only affects developer preview, not production users.
- **Migration steps:**
  1. Use `expo start --tunnel` from a local machine or a GitHub Actions Codespace.
  2. For production previews, configure Expo's free EAS Update or self-host Expo Updates (Render static + signed manifests).
- **Transfer:** Expo account is IVX-owned (`EXPO_PUBLIC_PROJECT_ID`, `EXPO_PUBLIC_TEAM_ID` already present).
- **Status:** 20%.

### 3.2 Render auto-deploy (production CI/CD)
- **Current dependency:** Render watches GitHub `main` and auto-deploys (`render.yaml` → `autoDeployTrigger: commit`).
- **Risk:** 🟢 Already IVX-owned.
- **Migration steps:** none.
- **Transfer:** Already done. Owner controls `RENDER_API_KEY` + `RENDER_SERVICE_ID`.
- **Status:** 100%.

### 3.3 Sync scripts (`expo/sync-github.mjs`, `expo/pipeline.mjs`, `expo/deploy-landing.mjs`, `auto-sync.mjs`)
- **Current dependency:** Currently invoked manually inside the Rork sandbox.
- **Risk:** 🟡 Medium.
- **Migration steps:** Move execution to a GitHub Actions workflow (`.github/workflows/sync.yml` or cron). Keep scripts in repo.
- **Transfer:** `GITHUB_TOKEN` already in private envs.
- **Status:** 50% (scripts exist, not yet scheduled).

---

## 4. GitHub Sync

- **Current dependency:** Rork → GitHub sync runs only when the agent calls `expo/sync-github.mjs`.
- **Risk:** 🟠 High — divergence between Rork repo and GitHub main has already occurred.
- **Migration steps:**
  1. Schedule sync on GitHub Actions (`on: schedule: cron`) every 15 min.
  2. Or: stop committing through Rork and commit straight to GitHub once the cut-over happens.
- **Transfer:** `GITHUB_TOKEN`, `GITHUB_REPO_URL` are IVX-owned.
- **Status:** 60%.

---

## 5. Environment Variables

### 5.1 Rork-prefixed public envs (`EXPO_PUBLIC_RORK_*`, `EXPO_PUBLIC_TOOLKIT_URL`, `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY`, `EXPO_PUBLIC_RORK_APP_KEY`)
- **Current dependency:** 5 `EXPO_PUBLIC_RORK_*` variables + `EXPO_PUBLIC_TOOLKIT_URL` still listed in the project's public env scope (visible in this prompt's public env block).
- **Risk:** 🟠 High — secret-shaped value (`RORK_TOOLKIT_SECRET_KEY`) marked `EXPO_PUBLIC_` was bundled into the client and routes to `toolkit.rork.com`.
- **Migration steps:**
  1. ✅ (code) All client + bundler references removed (Phase 4a–4e).
  2. Delete the 5 variables from the Rork project env panel and from any Render service that still has them.
  3. Rotate `RORK_TOOLKIT_SECRET_KEY` upstream (revoke in Rork dashboard) since it was previously exposed.
- **Transfer:** Owner deletes from Rork dashboard + Render. No replacement needed (IVX AI now uses `/api/ivx/owner-ai` proxy with `AI_GATEWAY_API_KEY`).
- **Status:** 80% (code is brain-free; dashboard cleanup pending).

### 5.2 IVX-owned envs (Supabase, AWS, Render, GitHub, AI gateway, JWT)
- **Current dependency:** Live in Render service env + Rork project env.
- **Risk:** 🟢 Low.
- **Migration steps:** Authoritative store should be Render (backend) + Expo dashboard (public). Stop relying on Rork as a secret store; treat the Rork copy as ephemeral.
- **Transfer:** Already IVX-owned in Render. Removing from Rork is a one-click action per variable.
- **Status:** 90%.

### 5.3 `EXPO_PUBLIC_PROJECT_ID` / `EXPO_PUBLIC_TEAM_ID`
- **Current dependency:** Rork project + team identifiers used for asset URLs (`rork.app/pa/{projectId}/...`).
- **Risk:** 🟡 Medium — any `@asset_name` references break once Rork is dropped.
- **Migration steps:**
  1. Inventory all `rork.app/pa/...` URLs in app code.
  2. Re-host assets in IVX S3 / CloudFront (`S3_BUCKET_NAME` + `CLOUDFRONT_DISTRIBUTION_ID` already configured).
  3. Replace URLs.
- **Transfer:** Owner controls AWS S3 + CloudFront.
- **Status:** 30%.

---

## 6. Secrets / Tokens

| Secret | Owner today | Risk | Action |
|---|---|---|---|
| `RORK_TOOLKIT_SECRET_KEY` | Rork | 🔴 | Revoke + delete; no longer used. |
| `GITHUB_TOKEN` | IVX | 🟢 | Keep; rotate quarterly. |
| `RENDER_API_KEY` / `RENDER_SERVICE_ID` | IVX | 🟢 | Keep. |
| `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_DB_PASSWORD` / `SUPABASE_DB_URL` | IVX | 🟢 | Keep; backend-only. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | IVX | 🟡 | Replace with read-only IAM + scoped write IAM; current keys appear broad. |
| `JWT_SECRET` / `OWNER_NEW_PASSWORD` / `OWNER_REPAIR_EMAIL` | IVX | 🟢 | Keep; backend-only. |
| `AI_GATEWAY_API_KEY` | IVX (Vercel AI Gateway) | 🟢 | Keep. |
| Rork agent ephemeral git token (in remote URL) | Rork | 🟠 | Stop relying on it — switch authoritative remote to GitHub. |

**Status:** 75% — all production secrets are IVX-owned except the Rork toolkit key and the embedded Rork git token.

---

## 7. Supabase Ownership

- **Current dependency:** Project URL + anon key + service role key already in IVX envs.
- **Risk:** 🟢 Low.
- **Migration steps:**
  1. Confirm the Supabase project's organization owner is the IVX owner email, not a Rork-team email.
  2. Add a second admin (backup) on the Supabase org.
  3. Enable Supabase project-level MFA.
- **Transfer:** Likely already IVX-owned; verify org membership in Supabase dashboard.
- **Status:** 95% — verify org ownership.

---

## 8. Auth Ownership

- **Current dependency:** Supabase Auth (owner role gated by `profiles.role IN ('owner','admin','super_admin')` + `public.ivx_is_owner()`).
- **Risk:** 🟢 Low — fully under IVX Supabase project.
- **Migration steps:** none.
- **Transfer:** Already IVX-owned.
- **Status:** 100%.

---

## 9. API Routing

### 9.1 `api.ivxholding.com` / `chat.ivxholding.com`
- **Current dependency:** Custom domains pointing to Render. DNS via owner's Cloudflare/registrar.
- **Risk:** 🟢 Low.
- **Status:** 100% IVX-owned.

### 9.2 `ivx-holdings-platform.onrender.com` (fallback origin)
- **Current dependency:** Hardcoded in several files (`expo/lib/platform-persistence.ts`, `expo/app/login.tsx`, `deploy/cloudflare/ivx-render-origin-worker.js`).
- **Risk:** 🟡 Medium — works, but ties owner code to Render's default-subdomain product. Render is IVX-owned, so this is not a Rork dependency, just a vendor coupling.
- **Migration steps:** Replace hardcoded origin with `EXPO_PUBLIC_API_BASE_URL` once custom domain is verified everywhere.
- **Status:** 85%.

### 9.3 `toolkit.rork.com` (Rork AI proxy)
- **Current dependency:** None at runtime (Phase 4a–4e removed it). Only referenced in `.rork/skills/*` docs.
- **Risk:** 🟢 Low.
- **Status:** 100%.

---

## 10. Runtime Services / Cloud Infrastructure

| Service | Provider | Owner | Status |
|---|---|---|---|
| Backend API | Render Docker Web Service `ivx-holdings-platform` | IVX | 100% |
| Static web (chat.ivxholding.com) | Render Static Site `ivx-holdings-chat-frontend` | IVX | 100% |
| Postgres | Render `mydatabase` + Supabase | IVX | 100% |
| Object storage | AWS S3 (`S3_BUCKET_NAME`) + Render MinIO pserv | IVX | 95% |
| CDN | CloudFront (`CLOUDFRONT_DISTRIBUTION_ID`) | IVX | 95% |
| DNS / TLS | Cloudflare (custom domains) | IVX | 100% |
| Mobile preview | Rork CI + Expo Go | Rork + Expo | 20% |
| Asset hosting (`@asset_name`) | `rork.app/pa/...` | Rork | 30% |

**Overall infra status:** 90% IVX-owned; only preview + bundled assets still touch Rork.

---

## 11. Build Pipelines

- **Frontend (Expo web export):** `bun install --frozen-lockfile && bunx expo export --platform web` on Render Static Site. ✅ IVX-owned.
- **Backend Docker build:** Render Dockerfile build. ✅ IVX-owned.
- **Mobile bundles (iOS .ipa / Android .aab):** Not configured. EAS is unavailable. Needs decision: enable EAS under IVX Expo account, or move to Bare workflow + Fastlane.
- **Rork build artifacts:** ephemeral preview only; not used for app store delivery.

**Status:** 80% (web + backend covered; native binaries gap remains).

---

## 12. Monitoring / Logs

- **Current dependency:**
  - Render logs (IVX-owned).
  - In-repo `logs/` directory (developer copies only).
  - No third-party APM/Sentry.
  - Rork sandbox logs `logs/audit/*` are local to this agent only.
- **Risk:** 🟡 Medium — no centralized production monitoring.
- **Migration steps:**
  1. Add Sentry (or BetterStack/Logtail) to backend + Expo.
  2. Wire Render's log drain to BetterStack/S3.
  3. Add uptime check on `https://api.ivxholding.com/health`.
- **Transfer:** Owner picks vendor + creates account.
- **Status:** 30%.

---

## 13. Automation / Owner Actions

- **Current dependency:** Owner-approved write actions go through `/api/ivx/developer-deploy/action` (GitHub, Render, Supabase). Already gated by `CONFIRM_IVX_*` strings.
- **Risk:** 🟢 Low — IVX-owned.
- **Status:** 100%.

Outstanding automation that still requires the Rork agent:
- Editing the codebase itself.
- Triggering `sync-github.mjs` on demand.
- Generating assets via Rork skills.

**Plan:** Move codebase edits to GitHub-based IDE/agent once owner is ready.

---

## 14. Package Ownership (`@rork-ai/toolkit-sdk`)

- **Current state:** `expo/package.json` line 56 still lists `"@rork-ai/toolkit-sdk": "latest"`.
- **Note:** Phase 4e marked the SDK as removed (Metro config and runtime no longer use it), but the dependency line is still in `package.json`. `expo/scripts/verify-expo-sdk.mjs` has a regression guard that will fail if the package is actually installed.
- **Risk:** 🟠 High — installing dependencies fresh will pull the package back in and re-introduce Rork.
- **Migration steps:**
  1. `bun remove @rork-ai/toolkit-sdk` inside `expo/`.
  2. Commit updated `expo/package.json` + `expo/bun.lock`.
  3. Run `runChecks(expo)` to confirm SDK audit passes.
- **Status:** 60% (code clean; package manifest stale).

---

## 15. Documentation / Branding Mentions

- `expo/README.md` lines 5/16/312 still reference `rork.com`.
- `.rork/skills/*` — Rork-internal skill docs.
- **Risk:** 🟢 Cosmetic.
- **Status:** 50% (no urgency).

---

## Roll-up Scorecard

| Category | Status % |
|---|---|
| Code hosting / Git remote | 60% |
| Rork sandbox (editor) | 0% |
| CI/CD (Render) | 100% |
| CI/CD (Rork preview) | 20% |
| GitHub sync automation | 60% |
| Environment variables | 80% |
| Secrets / tokens | 75% |
| Supabase ownership | 95% |
| Auth ownership | 100% |
| API routing | 95% |
| Runtime services / cloud | 90% |
| Build pipelines | 80% |
| Monitoring | 30% |
| Owner-action automation | 100% |
| `@rork-ai/toolkit-sdk` package | 60% |
| Asset hosting (`rork.app/pa/...`) | 30% |
| Docs / branding | 50% |

**Weighted overall IVX ownership:** ~70%
**Remaining Rork dependency to eliminate:** ~30%

---

## Critical Path to 0% Rork

Ordered by blast radius:

1. **Remove `@rork-ai/toolkit-sdk` from `expo/package.json`** (10 min). 🔴
2. **Delete 5 `EXPO_PUBLIC_RORK_*` + `EXPO_PUBLIC_TOOLKIT_URL` + `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY` + `EXPO_PUBLIC_RORK_APP_KEY` from Rork/Render dashboards; revoke the toolkit secret** (15 min). 🔴
3. **Re-host any `@asset_name` / `rork.app/pa/...` URLs in IVX S3 + CloudFront** (1–4 hours depending on count). 🟠
4. **Schedule `sync-github.mjs` on GitHub Actions cron** so GitHub mirror is never stale (30 min). 🟠
5. **Promote GitHub to authoritative remote**; stop committing through the Rork agent (decision + cut-over). 🟠
6. **Add monitoring (Sentry + Render log drain + uptime probe)** (2–3 hours). 🟡
7. **Decide on EAS vs. Bare for mobile binary builds** under IVX Expo account (research). 🟡
8. **Delete `rork.json`, `.rorkignore`, `.rork/` and Rork README references** (cleanup). 🟢

Completing items 1–5 moves IVX ownership from ~70% to ~95%. Items 6–8 close the remaining 5%.
