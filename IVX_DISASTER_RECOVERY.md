# IVX Holdings — Disaster Recovery Procedure

**Version:** 2026-07-14
**Scope:** Full clean-room recovery from GitHub source to production
**Audience:** IVX Holdings technical owner / operator

---

## 1. Clone Repository from GitHub

```bash
git clone https://github.com/ibb142/rork-global-real-estate-invest.git ivx-holdings
cd ivx-holdings
git checkout main
```

**Repository:** `ibb142/rork-global-real-estate-invest`
**Default branch:** `main`
**Current production SHA:** `5533c6d04073b834ada1eaf1ced94ca1704a9992`

## 2. Install Dependencies

### Backend
```bash
cd backend
bun install
```

### Frontend (Expo)
```bash
cd expo
bun install
```

### Root (QA scripts, deployment tooling)
```bash
cd /ivx-holdings
bun install
```

## 3. Configure Environment Variables

Create `.env` at the project root and `expo/.env` in the expo directory using `.env.example` as a template. Fill in the following variables with real values from your provider consoles:

### Environment Variable Name Inventory

#### Backend (root .env)
| Variable | Purpose | Source |
|----------|---------|--------|
| `API_BASE_URL` | Backend public URL | Render dashboard |
| `JWT_SECRET` | JWT signing secret | Generate with `openssl rand -hex 32` |
| `APP_SECRET` | App session secret | Generate with `openssl rand -hex 32` |
| `AI_GATEWAY_API_KEY` | AI provider key | Vercel AI Gateway / OpenAI |
| `SUPABASE_URL` | Supabase project URL | Supabase dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key | Supabase dashboard → Settings → API |
| `EXPO_PUBLIC_SUPABASE_URL` | Same as SUPABASE_URL (public) | Supabase dashboard |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | Supabase dashboard → Settings → API |
| `SUPABASE_DB_URL` | Postgres connection string | Supabase dashboard → Settings → Database |
| `SUPABASE_DB_PASSWORD` | Database password | Supabase dashboard → Settings → Database |
| `GITHUB_REPO_URL` | GitHub API repo URL | `https://api.github.com/repos/ibb142/rork-global-real-estate-invest` |
| `GITHUB_TOKEN` | GitHub personal access token | GitHub → Settings → Developer settings → PAT |
| `GITHUB_DEFAULT_BRANCH` | Default branch | `main` |
| `RENDER_API_KEY` | Render API key | Render dashboard → Settings → API Keys |
| `RENDER_SERVICE_ID` | Render service ID | Render dashboard → Service → Settings |
| `RENDER_SERVICE_NAME` | Render service name | Render dashboard |
| `AWS_ACCESS_KEY_ID` | AWS access key | AWS IAM console |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | AWS IAM console |
| `AWS_REGION` | AWS region | `us-east-1` (or your region) |
| `S3_BUCKET_NAME` | S3 bucket for landing page | AWS S3 console |
| `CLOUDFRONT_DISTRIBUTION_ID` | CloudFront distribution ID | AWS CloudFront console |
| `IVX_OWNER_RECOVERY_PHONE` | Owner recovery phone (E.164) | Owner provisioned |
| `STRIPE_API_KEY` | Stripe API key (optional) | Stripe dashboard |

#### Frontend (expo/.env)
| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EXPO_PUBLIC_IVX_API_BASE_URL` | Backend API URL (`https://api.ivxholding.com`) |
| `EXPO_PUBLIC_API_BASE_URL` | Same as above |
| `EXPO_PUBLIC_CHAT_API_URL` | Chat API URL (`https://api.ivxholding.com`) |
| `EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL` | Owner AI URL |
| `EXPO_PUBLIC_CHAT_DEFAULT_ROOM_ID` | `main-room` |
| `EXPO_PUBLIC_CHAT_SOCKET_PATH` | `/socket.io` |
| `EXPO_PUBLIC_PROJECT_ID` | Expo project ID |

## 4. Run Backend Locally

```bash
cd backend
bun install
bun run src/index.ts  # or: bun run dev
```

Backend starts on `http://localhost:3000`.
Verify: `curl http://localhost:3000/health` → `{"ok":true}`

## 5. Run Landing Page Locally

```bash
cd expo/ivxholding-landing
# The landing page is static HTML + JS served from S3
# To preview locally:
python3 -m http.server 8080
# Open http://localhost:8080/index.html
```

## 6. Run Expo App Locally

```bash
cd expo
bun install
bunx expo start
```

App starts in Expo Dev Server. Scan QR code with Expo Go or press `a` for Android emulator / `i` for iOS simulator.

## 7. Build Android

```bash
cd expo/android
./gradlew assembleRelease
```

Output: `expo/android/app/build/outputs/apk/release/app-release.apk`

**Current build:** versionCode=4, versionName=1.3.0, 79MB
**SHA256:** `cd21a6cdcf152e5ddde3b2ad3885c0dce2d4c7a3a40bc7fc41aeef4a0a9d2e42`

## 8. Build iOS

```bash
cd ios-ivx
open Ivx.xcodeproj
# In Xcode: select target → set signing team → Product → Build
```

**Bundle identifier:** Currently `app.rork.r64gj6i3shhxqnlbhiewv` (needs update to `com.ivxholdings.app` for production)
**Signing:** Requires Apple Developer account + provisioning profile
**Status:** Source complete (41 Swift files), not yet built or signed for production

## 9. Deploy Backend to Render

1. Log into Render dashboard
2. Service: `ivx-holdings-platform` (service ID from RENDER_SERVICE_ID)
3. Connect GitHub repo: `ibb142/rork-global-real-estate-invest`
4. Set root directory: `backend/`
5. Build command: `bun install`
6. Start command: `bun run src/index.ts`
7. Set all environment variables from Section 3
8. Deploy → Render auto-deploys on push to `main`

**Live URL:** `https://api.ivxholding.com` (via Cloudflare DNS → Render)
**Render internal URL:** `https://ivx-holdings-platform.onrender.com`

## 10. Deploy Landing Page to S3

```bash
# Sync landing page files to S3
aws s3 sync expo/ivxholding-landing/ s3://YOUR_BUCKET_NAME/ \
  --delete \
  --cache-control "no-cache, no-store, must-revalidate" \
  --content-type "text/html" \
  --exclude "*" --include "index.html" \
  --include "*.js" --include "*.css" --include "*.jpg" --include "*.png" \
  --include "*.mp4" --include "*.svg" --include "*.ico"
```

**S3 bucket:** configured in S3_BUCKET_NAME
**CloudFront distribution:** configured in CLOUDFRONT_DISTRIBUTION_ID
**Live URL:** `https://ivxholding.com`

Alternatively, use the GitHub Actions workflow `.github/workflows/` which auto-deploys on push to main.

## 11. Connect Supabase

1. Log into Supabase dashboard
2. Project reference: `kvclcdjmjghndxsngfzb`
3. URL: `https://kvclcdjmjghndxsngfzb.supabase.co`
4. Run migrations from `expo/supabase/` directory:
   ```bash
   bunx supabase db push
   ```
5. Verify tables: `members`, `investors`, `deals`, `reels`, `push_tokens`, `chat_messages`, `chat_rooms`, `owner_actions`, `crm_investors`, `agent_runs`

## 12. Configure AWS / CDN

### S3 Bucket
- Bucket name: from S3_BUCKET_NAME
- Static website hosting enabled
- Public read access via bucket policy

### CloudFront
- Distribution ID: from CLOUDFRONT_DISTRIBUTION_ID
- Origin: S3 bucket website endpoint
- Viewer protocol: Redirect HTTP to HTTPS
- Cache behaviors: `no-cache, no-store, must-revalidate` for HTML; longer TTL for assets

### CloudFront Invalidation
```bash
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

**Note:** IAM user must have `cloudfront:CreateInvalidation` permission.

## 13. Configure Domains

### DNS Records (Route 53 or current DNS provider)
| Record | Type | Value |
|--------|------|-------|
| `ivxholding.com` | A (ALIAS) | CloudFront distribution |
| `www.ivxholding.com` | A (ALIAS) | CloudFront distribution |
| `api.ivxholding.com` | CNAME | `ivx-holdings-platform.onrender.com` |
| `chat.ivxholding.com` | CNAME | Render service or Cloudflare Pages |

### SSL/TLS
- CloudFront: ACM certificate for `ivxholding.com` and `*.ivxholding.com`
- Render: Automatic TLS for `api.ivxholding.com`
- Chat: Cloudflare SSL/TLS

## 14. Restore Database Backup

### Supabase Backup
1. Supabase dashboard → Database → Backups
2. Select the most recent backup point
3. Click "Restore" (Supabase managed backups run daily)
4. Verify row counts: `SELECT count(*) FROM members; SELECT count(*) FROM deals; SELECT count(*) FROM reels;`

### Manual SQL Backup
```bash
# Export
pg_dump "$SUPABASE_DB_URL" -F p > ivx_backup_$(date +%Y%m%d).sql

# Restore
psql "$SUPABASE_DB_URL" < ivx_backup_YYYYMMDD.sql
```

## 15. Restore Storage / Media

### Supabase Storage
- Deal photos: `deal-photos/` bucket
- User uploads: `attachments/` bucket
- Videos: served from `ivxholding.com/videos/` (S3 origin)

### Cloudflare R2 (Casa Rosario photos)
- Bucket: `pub-e001eb4506b145aa938b5d3badbff6a5`
- Objects in `attachments/` path
- Public access via R2 public URL

### Restore from backup
```bash
# Supabase storage
supabase storage restore --bucket deal-photos --from backup.tar.gz

# S3 videos
aws s3 sync s3://YOUR_BUCKET/videos/ ./videos/
```

## 16. Verify Production

Run this verification sequence after full recovery:

```bash
# 1. Backend health
curl https://api.ivxholding.com/health
# Expected: {"ok":true,"status":"healthy"}

# 2. Landing page
curl -I https://ivxholding.com
# Expected: HTTP 200, content-type: text/html

# 3. Chat
curl -I https://chat.ivxholding.com
# Expected: HTTP 200

# 4. API routes
curl https://api.ivxholding.com/api/reels  # 200, 6 videos
curl https://api.ivxholding.com/api/properties  # 200, 3 properties
curl https://api.ivxholding.com/api/landing-config  # 200
curl https://api.ivxholding.com/api/members/authoritative-count  # 200

# 5. Protected routes
curl https://api.ivxholding.com/api/ivx/autonomous-ops/dashboard  # 401

# 6. CORS
curl -X OPTIONS -H "Origin: https://ivxholding.com" https://api.ivxholding.com/api/reels
# Expected: access-control-allow-origin: https://ivxholding.com

# 7. Registration
curl -X POST https://api.ivxholding.com/api/members/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@verify.com","password":"Test1234!","firstName":"Test","lastName":"Recovery","phone":"5551234567","dateOfBirth":"1990-01-15","gender":"prefer_not_to_say","acceptTerms":true,"roles":["buyer"]}'
# Expected: {"success":true,...}
```

---

## Service Inventory

| Service | Provider | URL | Purpose |
|---------|----------|-----|---------|
| Backend API | Render | api.ivxholding.com | Hono server, 77 routes |
| Landing page | AWS S3 + CloudFront | ivxholding.com | Static HTML/JS |
| Chat frontend | Render/Cloudflare | chat.ivxholding.com | Chat web UI |
| Database | Supabase | kvclcdjmjghndxsngfzb.supabase.co | Postgres + Auth + Storage |
| Media storage (deals) | Supabase Storage | kvclcdjmjghndxsngfzb.supabase.co/storage | Deal photos |
| Media storage (Casa Rosario) | Cloudflare R2 | pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev | Project photos |
| Video hosting | AWS S3 | ivxholding.com/videos/ | Reel videos |
| Source control | GitHub | github.com/ibb142/rork-global-real-estate-invest | Git repository |
| Mobile app | Expo/React Native | com.ivxholdings.app | Android APK |
| iOS app | Swift/Xcode | ios-ivx/ | Native iOS (source complete, unsigned) |
| AI provider | Vercel AI Gateway | ai-gateway.vercel.sh | GPT-4o for Owner AI |
| Push notifications | Expo Notifications | N/A | expo-notifications ~0.32.17 |
| DNS | Route 53 / DNS provider | N/A | Domain management |
| CDN | AWS CloudFront | d1f3efsob2d4cv.cloudfront.net | Landing page delivery |

## Deployment Runbook

### Backend Deployment (Render auto-deploy)
1. Push code to `main` on GitHub
2. Render detects push → builds → deploys automatically
3. Monitor: Render dashboard → Logs
4. Verify: `curl https://api.ivxholding.com/health` → check `commit` matches

### Landing Page Deployment (GitHub Actions)
1. Landing page files in `expo/ivxholding-landing/`
2. Push to `main` triggers GitHub Actions workflow
3. Workflow syncs to S3 → verifies URLs
4. CloudFront invalidation runs (requires IAM permission)
5. Verify: `curl -I https://ivxholding.com` → check `last-modified`

### Android APK Build
1. `cd expo/android && ./gradlew assembleRelease`
2. Output: `app/build/outputs/apk/release/app-release.apk`
3. Install: `adb install app-release.apk`
4. Version: versionCode=4, versionName=1.3.0

### Rollback Procedure

#### Backend Rollback
1. Render dashboard → Deployments
2. Select previous deployment → "Rollback to this deploy"
3. Or: `git revert <commit> && git push origin main` (triggers new deploy)

#### Landing Page Rollback
1. S3 versioning must be enabled on bucket
2. S3 console → bucket → select previous version → restore
3. CloudFront invalidation: `aws cloudfront create-invalidation --distribution-id ID --paths "/*"`

#### Database Rollback
1. Supabase dashboard → Database → Backups
2. Select point-in-time before the issue
3. Click "Restore" — this creates a new database instance
4. Update SUPABASE_URL/SUPABASE_DB_URL to the new instance
5. Redeploy backend with new env vars

#### Full System Rollback
1. Revert Git: `git revert <bad-commit> && git push`
2. Render auto-deploys the revert
3. Restore database to pre-issue backup
4. Restore S3 to previous version
5. Invalidate CloudFront
6. Rebuild APK if mobile code changed
7. Run verification sequence (Section 16)
