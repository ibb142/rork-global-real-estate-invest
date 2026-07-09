# IVX Independence Runbook — Rork Removal & Full Cutover

> **Purpose:** Remove all Rork dependencies and migrate IVX to fully independent
> infrastructure (GitHub + Render + Supabase + AWS/S3/CloudFront).
>
> **Who runs it:** The owner (Ivan), on a local machine — NOT inside the Rork sandbox.
>
> **Time required:** ~30 minutes
>
> **Prerequisites:** Node 20+, Bun 1.2+, git, AWS CLI, Supabase CLI

---

## STEP 0 — Pre-flight Check (2 min)

Verify you have the required tools installed:

```bash
node --version    # must be v20+
bun --version     # must be 1.2+
git --version
aws --version     # AWS CLI v2
npx supabase --version
```

If any are missing:
```bash
# Node 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Bun
curl -fsSL https://bun.sh/install | bash

# AWS CLI
pip3 install awscli

# Supabase CLI
npm install -g supabase
```

---

## STEP 1 — Clone IVX GitHub Repo (independent checkout) (3 min)

```bash
# Clone the official IVX repo (NOT the Rork sandbox)
git clone https://github.com/ibb142/rork-global-real-estate-invest.git ivx-independent
cd ivx-independent

# Verify you're on the correct repo
git remote -v
# EXPECTED: origin  https://github.com/ibb142/rork-global-real-estate-invest.git (fetch/push)
# If it shows rork-git-router.rork-direct.workers.dev — STOP and fix:
#   git remote set-url origin https://github.com/ibb142/rork-global-real-estate-invest.git

git checkout main
git pull origin main
```

---

## STEP 2 — Set IVX-Owned Git Remote (1 min)

```bash
# Ensure the remote points to YOUR GitHub repo, not Rork's router
git remote set-url origin https://github.com/ibb142/rork-global-real-estate-invest.git

# Verify
git remote -v
# EXPECTED: origin  https://github.com/ibb142/rork-global-real-estate-invest.git
```

---

## STEP 3 — Run Independence Cutover (dry-run first) (2 min)

```bash
# DRY-RUN — safe, no files changed, just shows what will happen
node expo/scripts/ivx-independence-cutover.mjs

# EXPECTED OUTPUT:
#   Files changed: 4  (package.json, metro.config.js, verify-expo-sdk.mjs, rork.json)
#   Manual steps: 2   (delete Rork env keys, set git remote)
#   Errors: 0
```

If dry-run shows errors, STOP and investigate before proceeding.

---

## STEP 4 — Apply the Cutover (2 min)

```bash
# APPLY — makes the changes (with automatic backup)
IVX_ALLOW_RORK_CUTOVER=1 node expo/scripts/ivx-independence-cutover.mjs --apply

# This will:
#   1. Backup all files to expo/logs/ivx-cutover-backup-<timestamp>/
#   2. Remove @rork-ai/toolkit-sdk from package.json
#   3. Rewrite metro.config.js to plain Expo config (no withRorkMetro)
#   4. Remove Rork assertions from verify-expo-sdk.mjs
#   5. Delete rork.json
#   6. Write audit log to expo/logs/ivx-cutover-<timestamp>.log
#   7. Print rollback instructions
```

If anything goes wrong:
```bash
# ROLLBACK — restores all files from the latest backup
node expo/scripts/ivx-independence-cutover.mjs --rollback
```

---

## STEP 5 — Install Dependencies (refresh lockfile) (2 min)

```bash
cd expo
bun install    # drops @rork-ai/toolkit-sdk from the lockfile
cd ..
```

---

## STEP 6 — Run Tests (3 min)

```bash
cd expo

# Type check
bunx tsc --noEmit

# Lint
bun run lint

# Unit tests
bun test

cd ..
```

If type check or tests fail, fix the issues or rollback:
```bash
node expo/scripts/ivx-independence-cutover.mjs --rollback
```

---

## STEP 7 — Verify App Launches (2 min)

```bash
cd expo

# Verify the app starts on the plain Metro config (no Rork toolkit)
bunx expo start --clear

# You should see the Expo dev server start without errors.
# Press 'w' for web or scan QR for device.
# Ctrl+C to stop when verified.

cd ..
```

---

## STEP 8 — Commit and Push to GitHub (2 min)

```bash
# Stage all changes
git add -A

# Commit
git commit -m "ivx: remove Rork dependency — independence cutover

- Remove @rork-ai/toolkit-sdk from package.json
- Rewrite metro.config.js to plain Expo config (drop withRorkMetro)
- Remove Rork assertions from verify-expo-sdk.mjs
- Delete rork.json project config
- IVX now builds on owner-controlled pipeline (GitHub + Render + AWS)
"

# Push to GitHub (triggers Render auto-deploy + GitHub Actions)
git push origin main
```

Record the commit SHA:
```bash
git rev-parse HEAD
# SAVE THIS — it's your GITHUB_COMMIT_SHA for verification
```

---

## STEP 9 — Trigger Render Deploy (3 min)

If Render is connected to your GitHub repo (auto-deploy on push), it will
deploy automatically. Verify:

```bash
# Check Render deploy status (replace SERVICE_ID with your Render service ID)
curl -sS -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys?limit=1" \
  | python3 -m json.tool

# If auto-deploy didn't trigger, manually deploy:
curl -sS -X POST -H "Authorization: Bearer $RENDER_API_KEY" \
  -H "Content-Type: application/json" \
  "https://api.render.com/v1/services/$RENDER_SERVICE_ID/deploys" \
  -d '{"commitId":"'"$(git rev-parse HEAD)"'"}'
```

---

## STEP 10 — Run Supabase Migration (3 min)

Run all migration files in order via the Supabase SQL Editor
(https://supabase.com/dashboard → SQL Editor):

```sql
-- Run each file in order:
-- 1. supabase/ivx-owner-ai-phase1.sql          (profiles, conversations, messages)
-- 2. supabase/ivx-enterprise-access-control.sql (roles, permissions, departments)
-- 3. supabase/ivx-owner-variables.sql           (encrypted credential store)
-- 4. supabase/ivx-access-tests-and-commands.sql (command logs, access tests)
-- 5. supabase/ivx-owner-room-dedupe.sql         (conversation dedup fix)
-- 6. supabase/FIX-owner-ai-chat-persistence.sql (chat persistence fix)
```

Or via CLI:
```bash
# Set your Supabase connection string
export SUPABASE_DB_URL="postgresql://postgres:YOUR_PASSWORD@db.YOUR_PROJECT.supabase.co:5432/postgres"

# Run migrations
for f in expo/supabase/ivx-owner-ai-phase1.sql \
         expo/supabase/ivx-enterprise-access-control.sql \
         expo/supabase/ivx-owner-variables.sql \
         expo/supabase/ivx-access-tests-and-commands.sql \
         expo/supabase/ivx-owner-room-dedupe.sql \
         expo/supabase/FIX-owner-ai-chat-persistence.sql; do
  echo "Running $f..."
  psql "$SUPABASE_DB_URL" -f "$f"
done
```

---

## STEP 11 — Deploy Landing Page to AWS/S3/CloudFront (3 min)

The GitHub Action `.github/workflows/deploy-landing.yml` auto-deploys on
push to main when `ivxholding-landing/**` files change. To trigger manually:

```bash
# Option A: Use the deploy script (requires AWS credentials in env)
cd expo
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID \
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY \
AWS_REGION=us-east-1 \
node scripts/deploy-landing-v2.mjs
cd ..

# Option B: Trigger via GitHub Actions UI
# Go to: https://github.com/ibb142/rork-global-real-estate-invest/actions
# → "Deploy Landing Page to S3" → "Run workflow"

# Option C: Direct AWS CLI
aws s3 cp expo/ivxholding-landing/index.html s3://ivxholding.com/index.html \
  --content-type "text/html; charset=utf-8" \
  --cache-control "no-cache, no-store, must-revalidate"

aws cloudfront create-invalidation \
  --distribution-id $(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(Aliases.Items,'ivxholding.com')].Id" \
    --output text | head -1) \
  --paths "/*"
```

---

## STEP 12 — Verify Production Endpoints (3 min)

```bash
# 1. Landing page
echo "--- ivxholding.com ---"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://ivxholding.com
# EXPECTED: HTTP 200

# 2. API health
echo "--- api.ivxholding.com/health ---"
curl -sS https://api.ivxholding.com/health | python3 -m json.tool
# EXPECTED: {"ok": true, "status": "healthy", ...}

# 3. Verify the commit SHA matches what you pushed
# The /health response includes "commit" and "commitShort" fields.
# Compare commitShort to your git rev-parse HEAD from Step 8.

# 4. Owner signup audit
echo "--- api/ivx/owner-signup-audit ---"
curl -sS https://api.ivxholding.com/api/ivx/owner-signup-audit | python3 -m json.tool

# 5. Video platform home feed
echo "--- api/ivx/video-platform/home-feed ---"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://api.ivxholding.com/api/ivx/video-platform/home-feed

# 6. Members count
echo "--- api/ivx/members/count ---"
curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://api.ivxholding.com/api/ivx/members/count
```

---

## STEP 13 — Delete Rork Environment Variables (2 min)

In your **Render dashboard** and **Expo dashboard**, delete these env vars:

| Variable | Where |
|----------|-------|
| `EXPO_PUBLIC_RORK_API_BASE_URL` | Render + Expo |
| `EXPO_PUBLIC_RORK_APP_KEY` | Render + Expo |
| `EXPO_PUBLIC_RORK_AUTH_URL` | Render + Expo |
| `EXPO_PUBLIC_RORK_FUNCTIONS_URL` | Render + Expo |
| `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY` | Render + Expo |
| `EXPO_PUBLIC_TOOLKIT_URL` | Render + Expo |
| `EXPO_PUBLIC_PROJECT_ID` | Render + Expo (if Rork-specific) |
| `EXPO_PUBLIC_TEAM_ID` | Render + Expo (if Rork-specific) |

Also rotate the toolkit secret upstream (it's no longer used).

---

## ROLLBACK (if anything fails)

```bash
# Rollback the cutover script changes
node expo/scripts/ivx-independence-cutover.mjs --rollback

# Restore the lockfile
cd expo && bun install && cd ..

# Undo the git commit (if already pushed)
git revert HEAD
git push origin main
```

---

## Required Variables Reference

### GitHub Actions Secrets
| Secret | Purpose |
|--------|---------|
| `AWS_ACCESS_KEY_ID` | S3/CloudFront/ECS deploy |
| `AWS_SECRET_ACCESS_KEY` | S3/CloudFront/ECS deploy |
| `EXPO_PUBLIC_SUPABASE_URL` | Landing page config injection |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Landing page config injection |
| `EXPO_PUBLIC_IVX_API_BASE_URL` | Landing page app URL |
| `EXPO_PUBLIC_GOOGLE_ADS_API_KEY` | Landing page ads |
| `META_PIXEL_ID` | Landing page tracking |
| `TIKTOK_PIXEL_ID` | Landing page tracking |
| `LINKEDIN_PARTNER_ID` | Landing page tracking |

### Render Environment Variables
| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Auth token signing |
| `NODE_ENV` | Runtime mode (production) |
| `PORT` | Server port (3000) |
| `SUPABASE_SERVICE_ROLE_KEY` | Backend Supabase access |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `AWS_ACCESS_KEY_ID` | S3 file uploads |
| `AWS_SECRET_ACCESS_KEY` | S3 file uploads |
| `AWS_REGION` | AWS region (us-east-1) |
| `S3_BUCKET_NAME` | S3 bucket for files |
| `IVX_OWNER_AI_MODEL` | AI model ID |
| `OPENAI_API_KEY` | AI gateway (if using OpenAI directly) |
| `GITHUB_TOKEN` | Backend GitHub sync (if using sync-github.mjs) |

### Supabase Project Settings
| Setting | Purpose |
|---------|---------|
| Database password | Migration execution |
| Project URL | API + client access |
| Anon key | Client-side access |
| Service role key | Backend-only access |
| RLS policies | Access control enforcement |

### AWS IAM / S3 / CloudFront
| Resource | Purpose |
|----------|---------|
| IAM user with S3+CloudFront access | Landing deploy + file uploads |
| S3 bucket: `ivxholding.com` | Landing page hosting |
| S3 bucket: `ivx-holdings-prod` | App file uploads |
| CloudFront distribution | CDN for ivxholding.com |
| Route53 hosted zone | DNS for ivxholding.com |

### IVX Developer Workspace Variables
| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | Push to GitHub |
| `GITHUB_REPO` | `ibb142/rork-global-real-estate-invest` |
| `RENDER_API_KEY` | Trigger Render deploys |
| `RENDER_SERVICE_ID` | Render service ID |
| `SUPABASE_SERVICE_ROLE_KEY` | Run migrations |
| `AWS_ACCESS_KEY_ID` | S3/CloudFront deploy |
| `AWS_SECRET_ACCESS_KEY` | S3/CloudFront deploy |
| `AWS_REGION` | `us-east-1` |

---

## Success Criteria

IVX is independent when ALL of these are true:

1. `git remote -v` shows `github.com/ibb142/rork-global-real-estate-invest` (no Rork router)
2. `expo/package.json` has NO `@rork-ai/toolkit-sdk`
3. `expo/metro.config.js` has NO `withRorkMetro`
4. `rork.json` does not exist in the repo
5. No `EXPO_PUBLIC_RORK_*` env vars in Render or Expo
6. `https://api.ivxholding.com/health` returns `{"ok": true, "status": "healthy"}`
7. The `commit` field in `/health` matches your pushed commit SHA
8. `https://ivxholding.com` returns HTTP 200
9. The app builds with `bunx expo start` on plain Metro (no Rork toolkit)
10. Render auto-deploys on git push (no Rork sandbox involved)
