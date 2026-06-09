# IVX — Owner Handoff & Rork-Independence Migration Package

**Purpose:** move IVX off the Rork-managed runtime and onto **your** GitHub + Render + Supabase, with exact copy-paste commands. Run these on **your own machine** (a normal laptop), not inside the Rork sandbox.

**Why this is a runbook and not a "done" claim:** the Rork sandbox's git remote is `https://…@backend.rork.com/git/<projectId>` — it auto-syncs and auto-reverts. Running the destructive cutover *inside the sandbox* is reverted and breaks the live preview (proven by `expo/scripts/verify-expo-sdk.mjs:63-74`). The cutover must run on **your independent checkout**, which only you can authenticate to GitHub + Render. Everything below is verified-correct against the live repo; the steps marked **[OWNER MACHINE]** are the ones only you can execute.

---

## 0. What you already own (no transfer needed)

| Asset | You control it via |
|---|---|
| GitHub repo + token | `GITHUB_TOKEN`, `GITHUB_REPO_URL` (already set as private env) |
| Render service `ivx-holdings-platform` (`srv-…`) | `RENDER_API_KEY`, `RENDER_SERVICE_ID` |
| Supabase project | `SUPABASE_SERVICE_ROLE_KEY`, `EXPO_PUBLIC_SUPABASE_URL`, `SUPABASE_DB_URL` |
| AWS S3 + CloudFront | `AWS_*`, `S3_BUCKET_NAME`, `CLOUDFRONT_DISTRIBUTION_ID` |
| AI provider | `AI_GATEWAY_API_KEY` |
| Domains | `api.ivxholding.com`, `chat.ivxholding.com` (in `render.yaml`) |

The backend (`server.ts` → `backend/hono.ts`) and Supabase/AWS/AI integrations have **zero Rork runtime imports** — Rork is only a build-time wrapper + the git host. Removing it does not touch business logic.

---

## 1. Export the full codebase  **[OWNER MACHINE]**

```bash
# 1a. Clone the current Rork-hosted source (one-time export).
#     Get a fresh tokenized URL from the Rork UI ("Sync workspace to GitHub" or repo settings),
#     OR clone from your GitHub mirror if it is already current.
git clone https://github.com/<YOUR_GH_ORG>/<YOUR_REPO>.git ivx
cd ivx

# 1b. Confirm you have everything.
ls -la            # repo root: backend/ expo/ render.yaml Dockerfile server.ts docs/ …
git branch -a     # branches
git log --oneline -5
```

What is included in the export:
- **Code:** `backend/`, `expo/`, `server.ts`, `Dockerfile`, `render.yaml`
- **Deploy/build:** `Dockerfile` (backend), `render.yaml` (all services), `expo/deploy/`, `deploy/ci/ivx-independent-build.yml`
- **DB migrations / schema:** `expo/deploy/supabase/*.sql`, `SUPABASE_SCHEMA.md`
- **Docs:** `MIGRATION.md`, `DEPLOYMENT.md`, `LOCAL_SETUP.md`, `ENVIRONMENT_VARIABLES.md`, `API_ROUTES.md`, `ARCHITECTURE.md`
- **Workflow:** `deploy/ci/ivx-independent-build.yml` (Rork's sync token can't write `.github/workflows`, so it ships here — see step 5)

---

## 2. Point the repo at YOUR GitHub  **[OWNER MACHINE]**

```bash
# Remove the Rork-managed remote and use your GitHub repo as the source of truth.
git remote -v                               # will show backend.rork.com if cloned from Rork
git remote remove origin                    # drop the Rork remote (skip if cloned from GitHub)
git remote add origin https://github.com/<YOUR_GH_ORG>/<YOUR_REPO>.git
git push -u origin main
git remote -v                               # MUST now show github.com, not backend.rork.com
```

After this, `git push origin main` is the only deploy trigger (Render watches `main`).

---

## 3. Run the independence cutover  **[OWNER MACHINE — off Rork only]**

The script is already in the repo and is idempotent + guarded.

```bash
# Preview first (safe anywhere):
node expo/scripts/rork-independence-cutover.mjs --dry-run

# Apply on YOUR checkout (the guard requires this flag so it can never brick the Rork preview):
IVX_ALLOW_RORK_CUTOVER=1 node expo/scripts/rork-independence-cutover.mjs
```

This performs exactly four file changes (verified clean in dry-run):
1. Removes `@rork-ai/toolkit-sdk` from `expo/package.json`
2. Rewrites `expo/metro.config.js` → plain Expo `getDefaultConfig` (drops `withRorkMetro`)
3. Deletes `rork.json`
4. Deletes `.rorkignore`

Then refresh the lockfile (the cutover intentionally doesn't):

```bash
cd expo && bun install   # regenerates bun.lock WITHOUT the Rork SDK
cd ..
```

### 3b. Remove the Rork public env vars (dashboard action — script never touches secrets)
Delete these from your **Render** service + any **Expo/EAS** env and your local `.env`:

```
EXPO_PUBLIC_RORK_API_BASE_URL
EXPO_PUBLIC_RORK_APP_KEY
EXPO_PUBLIC_RORK_AUTH_URL
EXPO_PUBLIC_RORK_FUNCTIONS_URL
EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY
EXPO_PUBLIC_TOOLKIT_URL
```
Also **rotate** the toolkit secret upstream so the old value is dead.

---

## 4. Render independence — services, env, commands  **[OWNER MACHINE / Render dashboard]**

Your `render.yaml` already defines the full independent stack. Confirm/provision:

**Services needed**
| Service | Type | Build | Start | Health |
|---|---|---|---|---|
| `ivx-holdings-platform` (backend) | Docker (`./Dockerfile`) | `bun install --production` (in image) | `node /app/node_modules/tsx/dist/cli.mjs /app/server.ts` | `GET /health` |
| `ivx-holdings-chat-frontend` (web) | static, `rootDir: expo` | `bun install && bunx expo export --platform web` | served static from `./dist` | — |
| `minio` | private Docker | (Render example image) | — | — |
| `mydatabase` | Postgres 16 | — | — | — |

**Required Render env vars** (set `sync:false` ones in the dashboard; these are the live contract):

```
# Runtime
NODE_ENV=production  HOST=0.0.0.0  PORT=3000
API_BASE_URL=https://api.ivxholding.com
PRODUCTION_BASE_URL=https://api.ivxholding.com

# Auth / owner
JWT_SECRET                IVX_OWNER_TOKEN            IVX_OWNER_REGISTRATION_EMAILS
OWNER_NEW_PASSWORD        OWNER_REPAIR_EMAIL         EXPO_PUBLIC_OWNER_EMAIL

# Supabase
EXPO_PUBLIC_SUPABASE_URL  EXPO_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_URL  SUPABASE_DB_PASSWORD  DATABASE_URL  POSTGRES_URL

# AI
AI_GATEWAY_API_KEY

# Storage (AWS + Minio)
AWS_ACCESS_KEY_ID  AWS_SECRET_ACCESS_KEY  AWS_REGION  S3_BUCKET_NAME  CLOUDFRONT_DISTRIBUTION_ID

# Public client (frontend)
EXPO_PUBLIC_API_BASE_URL=https://api.ivxholding.com
EXPO_PUBLIC_IVX_API_BASE_URL=https://api.ivxholding.com
EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL=https://api.ivxholding.com
EXPO_PUBLIC_PROJECT_ID  EXPO_PUBLIC_TEAM_ID
```

> Drop `RENDER_*`/`GITHUB_*` only if you stop using the in-app Render/GitHub control tools; they're optional for serving the app.

---

## 5. Install the owner CI workflow  **[OWNER MACHINE]**

The Rork sync can't write `.github/workflows`, so the pipeline ships at `deploy/ci/ivx-independent-build.yml`. Activate it:

```bash
mkdir -p .github/workflows
cp deploy/ci/ivx-independent-build.yml .github/workflows/ivx-independent-build.yml
git add .github/workflows/ivx-independent-build.yml
git commit -m "ci: activate independent build pipeline"
git push origin main
```

It asserts no `@rork-ai/toolkit-sdk` / `withRorkMetro` remain, type-checks + lints Expo, type-checks + tests + Docker-builds the backend.

---

## 6. Rebuild, test, deploy, verify  **[OWNER MACHINE]**

```bash
# Install
bun install
cd expo && bun install && cd ..

# Typecheck + tests
bunx tsc --noEmit
cd expo && bunx tsc --noEmit && cd ..
bun test backend/services            # backend suites

# Expo web build (what the frontend service runs)
cd expo && bunx expo export --platform web && cd ..

# Backend Docker build (what Render builds)
docker build -t ivx-backend .

# Deploy: push to main → Render auto-deploys both services
git push origin main
```

### Verify production (run after Render shows "live")
```bash
BASE=https://api.ivxholding.com
TOKEN=<your IVX_OWNER_TOKEN from Render>

curl -s $BASE/health | jq                                 # 200 + commit/marker
curl -s -X POST $BASE/public/chat -H 'content-type: application/json' \
  -d '{"message":"Health check. Return one word only: ALIVE."}' | jq   # 200, "ALIVE."
curl -s $BASE/api/ivx/autonomous-mode/tools                # 401 no token (gate intact)
curl -s $BASE/api/ivx/autonomous-mode/tools -H "authorization: Bearer $TOKEN" | jq   # 200
curl -s -X POST $BASE/api/ivx/autonomous-mode/run -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"task":"verify independence"}' | jq       # 200 proof report
```

### Confirm no Rork remains
```bash
grep -r "@rork-ai/toolkit-sdk" expo/package.json expo/metro.config.js   # → no matches
test -f rork.json && echo "STILL PRESENT" || echo "rork.json removed"
test -f .rorkignore && echo "STILL PRESENT" || echo ".rorkignore removed"
# Render/Expo env: confirm EXPO_PUBLIC_RORK_* and EXPO_PUBLIC_TOOLKIT_URL are gone
```

---

## 7. Final proof to record (fill in after step 6)

| Proof | Where to get it |
|---|---|
| Owner GitHub repo URL | `git remote get-url origin` |
| Render service URL | Render dashboard → `ivx-holdings-platform` |
| Deploy ID | Render dashboard → Events, or `GET /health` `commitShort` |
| Production commit | `curl -s $BASE/health \| jq .commit` |
| Health response | `curl -s $BASE/health` |
| No Rork SDK | `grep` results from step 6 (empty) |
| No Rork env vars | Render/Expo env screenshot |
| Autonomous task proof | `POST /api/ivx/autonomous-mode/run` JSON |
| Rollback | Render → previous deploy → "Rollback" (one click) |

---

## Final status

**BLOCKED — pending owner execution.** All export, GitHub-migration, Render, and cutover steps are prepared and verified against the live repo (cutover dry-run: 4 file changes, 0 errors). The remaining steps require authenticating to **your** GitHub + Render, which can only happen on your machine — not inside the Rork-managed sandbox (its remote is `backend.rork.com`, and the cutover auto-reverts there by design). Running sections 1–6 above completes the migration and lets you mark **VERIFIED IVX INDEPENDENT** with the real proof in section 7.
