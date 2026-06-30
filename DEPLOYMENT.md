# IVX IA — Deployment

Frozen at commit `da7c3c5ac79f`. Stable production = Render, but the app is fully Dockerized and deploys to any container host.

## Architecture deployed

- **Backend service**: Bun + Hono Docker container, exposes port 3000, health at `/health`.
- **Static frontend (web)**: Expo `bunx expo export --platform web` output served as SPA.
- **Postgres**: Supabase hosted.
- **Object storage**: Supabase Storage (`ivx-chat-uploads`). Optional: AWS S3 / MinIO.

## Option A — Render (proven path)

`render.yaml` is checked in. It declares:

1. `ivx-holdings-platform` (web, Docker) — backend, domain `api.ivxholding.com`, healthcheck `/health`, persistent disk `/app/data`.
2. `ivx-holdings-chat-frontend` (web, static) — Expo web export, domain `chat.ivxholding.com`.
3. `minio` (private service, Docker) — optional object storage, 10 GB disk.
4. `mydatabase` (Postgres) — optional managed Postgres if not using Supabase.

### One-time Render setup

```bash
# Fork the repo + push to your GitHub.
# In Render dashboard:
#   New → Blueprint → connect repo → render.yaml is auto-detected.
#   Fill in `sync: false` envs from ENVIRONMENT_VARIABLES.md.
#   Deploy.
```

### Auto-deploy

Every push to `main` triggers a Render deploy. Verify:

```bash
curl -s https://<your-backend>.onrender.com/health
# Expect: HTTP 200, aiProvider "chatgpt", model "openai/gpt-4o-mini".
```

### Manual deploy / clear cache

```bash
curl -X POST "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" \
  -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"clearCache":"clear"}'
```

## Option B — Plain Docker (any host)

```bash
# Backend
docker build -t ivx-backend -f Dockerfile .
docker run -d --name ivx-backend \
  --env-file .env \
  -p 3000:3000 \
  -v ivx-data:/app/data \
  ivx-backend

# Frontend (web export)
cd expo
bun install --frozen-lockfile
bunx expo export --platform web
# Serve dist/ via any static host (Nginx, Cloudflare Pages, Vercel static, S3+CloudFront).
```

Reverse proxy: see `expo/deploy/nginx/` for Nginx config templates and `expo/deploy/aws/` for AWS ECS/CloudFront templates.

## Option C — Fly.io / Railway / Heroku

Use the same `Dockerfile`. Set the env vars from `ENVIRONMENT_VARIABLES.md`. Set healthcheck path `/health`.

## Backend Dockerfile

Already in repo root. Highlights:

- Base: `oven/bun:1`
- Installs root + nothing else (backend has no separate folder install).
- Runs `node /app/node_modules/tsx/dist/cli.mjs /app/server.ts`.
- Exposes 3000.

## Domain + TLS

- Backend → CNAME `api.<your-domain>` to Render/your host.
- Frontend → CNAME `chat.<your-domain>` (or apex) to static host.
- Both ends must be HTTPS for Supabase auth and AI Gateway calls to work.

## CI / sync

The repo includes Rork-flavored sync helpers (`expo/sync-github.mjs`, `expo/auto-sync.mjs`, `expo/verify-sync.mjs`, `expo/bootstrap.sh`). On the independent host they are optional. Replace with normal git workflow:

```bash
git checkout main
git pull
git push origin main   # Render auto-deploys
```

GitHub Actions workflows exist under `.github/workflows/`. They are **not** required for runtime. Sync helpers explicitly skip `.github/workflows/**` because the saved `GITHUB_TOKEN` lacks `workflow` scope; that limitation does not apply when you push directly via your own credentials.

## Post-deploy proof checklist (independent host)

Run these against your new backend URL. All must pass:

```bash
BASE=https://api.<your-domain>

# 1. Health
curl -s "$BASE/health" | jq '{status, aiProvider, openAIModel}'
# → status: "healthy", aiProvider: "chatgpt", openAIModel: "openai/gpt-4o-mini"

# 2. Public chat ChatGPT-live
curl -s -X POST "$BASE/api/public/chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"echo INDEPENDENT_PROOF","sessionId":"smoke-1","exactToken":"INDEPENDENT_PROOF"}' \
  | jq '{ok, source, model, persistence}'
# → ok: true, source: "chatgpt", persistence: "supabase"

# 3. Sessions/history
curl -s "$BASE/api/public/chat/history?sessionId=smoke-1&limit=10" | jq '.messageCount'
# → 2

# 4. Owner upload guard
curl -s -o /dev/null -w "%{http_code}\n" -X POST "$BASE/api/upload"
# → 401

# 5. Owner AI proxy status
curl -s "$BASE/api/ivx/owner-ai/proxy-status" | jq '.runtime.provider'
# → "chatgpt"

# 6. Supabase verified
curl -s "$BASE/api/ivx/supabase/owner-action-health" | jq '.status'
# → "verified"
```

If any of the six fail, see `MIGRATION.md` for rollback notes and stop. Do not proceed to phone bundle release.

## Rollback

- Backend: redeploy previous Render commit, or `docker run` previous image tag.
- Frontend: restore previous `dist/` build.
- Schema: Phase 1 migration is idempotent. Roll forward only; no destructive DDL is required.
