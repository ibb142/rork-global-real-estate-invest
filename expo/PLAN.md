# IVX Holdings — AWS Infrastructure Status

---

### Step 1: Route53 + SSL Certificate ✅ DONE
- [x] Route53 hosted zone created: `Z02773013SDL57H8Y6XMF`
- [x] SSL certificate ISSUED: `arn:aws:acm:us-east-1:206818124217:certificate/32c8c4ee-3b1f-49c4-974e-34d9aadc8db3`
- [x] DNS validation records created
- [x] AWS credentials verified — Account `206818124217`

### Step 2: GoDaddy Nameservers ✅ DONE
- [x] Custom nameservers set at GoDaddy:
  - `ns-2031.awsdns-61.co.uk`
  - `ns-749.awsdns-29.net`
  - `ns-393.awsdns-49.com`
  - `ns-1442.awsdns-52.org`

### Step 3: S3 Landing Page ✅ DONE
- [x] S3 bucket `ivxholding.com` created and configured for static hosting
- [x] S3 bucket `www.ivxholding.com` configured for redirect
- [x] Landing page deployed with Supabase credentials
- [x] Live at: http://ivxholding.com.s3-website-us-east-1.amazonaws.com

### Step 4: SES Email ✅ DONE (Sandbox)
- [x] Domain `ivxholding.com` verified in SES
- [x] DKIM enabled and verified
- [x] SPF record created in Route53
- [x] DMARC record created in Route53
- [x] MX record created for bounce handling
- [x] `osconstructors@gmail.com` verified as sender
- [ ] **REQUEST PRODUCTION ACCESS** — Currently sandbox (200 emails/day, verified recipients only)
  - Go to SES Console → Account Dashboard → Request Production Access

### Step 5: SNS/SMS ✅ CONFIGURED (Low Limit)
- [x] SMS type set to Transactional
- [x] SenderID set to "IVXHolding"
- [ ] **INCREASE SMS SPEND LIMIT** — Currently $1/month (~10 SMS)
  - Go to AWS Support → Service Limit Increase → SNS Text Messaging → Request $50-100/month

### Step 6: CloudFront HTTPS ✅ DONE
- [x] AWS account verified for CloudFront
- [x] CloudFront distribution created: `E1C0DEI0VKCUYN`
- [x] CloudFront domain: `d1f3efsob2d4cv.cloudfront.net`
- [x] SSL certificate attached: `arn:aws:acm:us-east-1:206818124217:certificate/32c8c4ee-3b1f-49c4-974e-34d9aadc8db3`
- [x] Route53 DNS updated — A + AAAA records for `ivxholding.com` and `www.ivxholding.com` → CloudFront
- [x] HTTP → HTTPS automatic redirect enabled
- [x] Cache invalidation triggered
- [x] **LIVE**: https://ivxholding.com and https://www.ivxholding.com

---

## Audit — Pending Actions (Blue Items)

### #109 — Request SES Production Access
- **Status**: PENDING
- **Impact**: Currently limited to 200 emails/day, verified recipients only
- **Action**:
  1. Go to AWS Console → SES → Account Dashboard
  2. Click "Request Production Access"
  3. Fill in: Website URL = ivxholding.com, Use case = Transactional + Marketing, Expected volume = 5,000-10,000/day
  4. Wait 24-48 hours for AWS approval

### #110 — Increase SNS SMS Spend Limit
- **Status**: PENDING
- **Impact**: Currently $1/month (~10 SMS). Need $50-100/month for real usage
- **Action**:
  1. Go to AWS Console → Support Center → Create Case
  2. Select "Service limit increase" → SNS Text Messaging
  3. Request: Monthly spend limit increase from $1 to $100
  4. Provide: Use case = OTP + alerts, Expected volume = 500-1000 SMS/month

### #111 — Verify CloudFront Access
- **Status**: ✅ DONE
- **Impact**: HTTPS now live for ivxholding.com
- **Result**: Distribution `E1C0DEI0VKCUYN` created, DNS updated, HTTPS active

### #112 — Verify GoDaddy Nameservers
- **Status**: ✅ VERIFIED
- **Impact**: DNS may not resolve correctly if NS records are wrong
- **Action**:
  1. Log into GoDaddy → Domain Settings → ivxholding.com → DNS → Nameservers
  2. Set to Custom nameservers:
     - `ns-2031.awsdns-61.co.uk`
     - `ns-749.awsdns-29.net`
     - `ns-393.awsdns-49.com`
     - `ns-1442.awsdns-52.org`
  3. Verify with: `dig ivxholding.com NS` — should return AWS nameservers

---

## Audit — Yellow Warnings Fixed (March 2026)

| # | Fix | File |
|---|-----|------|
| #8 | `is_admin()` now returns FALSE if no auth or no profile (was failing silently) | supabase-master.sql |
| #22 | Added DELETE policies for all admin-only tables | supabase-master.sql |
| #44 | `mapSupabaseRow()` extracted to module level (was inside route handler) | backend/hono.ts |
| #50 | `/health` endpoint no longer exposes backend URL | backend/hono.ts |
| #51 | Removed `as any` cast in SMS counter — proper type check | backend/hono.ts |
| #52 | `/ses-status` and `/sns-status` now require admin auth | backend/hono.ts |
| #68 | `getAuthUserId()` returns `null` instead of empty string | lib/auth-store.ts |
| #82 | `apiBaseUrl` fallback uses API URL, not Supabase DB URL | lib/environment.ts |
| #96 | AdminFAB only renders for admin users, not all users | components/AdminFAB.tsx |

## Audit — Yellow Warnings Fixed (Round 2 — March 2026)

| # | Fix | File |
|---|-----|------|
| #9 | `is_admin()` now reads admin roles from `app_config` table instead of hardcoded list. Seeded `admin_roles` in `app_config`. Falls back to hardcoded if config missing. | supabase-master.sql |
| #32 | Added auto-cleanup interval for in-memory rate limiter (every 5 min) to prevent memory leak on long-running servers | backend/hono.ts |
| #37 | `/send-email` now stores sent email in DB atomically after successful SES send (was separate `/store-email` call that could fail independently) | backend/hono.ts |
| #93 | Deferred 5 non-critical startup tasks (health check, auto-setup, storage audit, sync, deploy) by 2s to speed up cold start | app/_layout.tsx |
| #94 | Reduced LogBox suppression from 8 patterns to 2 (only analytics). Real errors like `INSERT FAILED`, `PGRS`, `Supabase sync failed` are no longer hidden. | app/_layout.tsx |

## Audit — Red + Blue Critical Fixes (Round 3 — March 2026)

| # | Severity | Fix | File |
|---|----------|-----|------|
| R1 | RED | Added `profiles_delete` RLS policy — users can delete own profile, admins can delete any. GDPR compliant. | supabase-master.sql |
| R2 | RED | `/ses-identities` now requires admin auth via `verifyAdminAuth()` — was unauthenticated | backend/hono.ts |
| R2 | RED | `/ses-verification-status` now requires admin auth via `verifyAdminAuth()` — was unauthenticated | backend/hono.ts |
| R3 | RED | Email subject now HTML-sanitized before injection into email template — prevents XSS | backend/hono.ts |
| R6 | RED | Fixed stale closure in `depositMutation` and `withdrawMutation` — now uses `setData(prev => ...)` functional updates | lib/earn-context.tsx |
| R6 | RED | Fixed stale closure in `buyMutation` — now uses `setHoldings(prev => ...)` and `setPurchases(prev => ...)` functional updates | lib/ipx-context.tsx |
| R7 | RED | Anonymous purchases blocked — `buyMutation` now throws if `getAuthUserId()` returns null | lib/ipx-context.tsx |
| R7 | RED | Anonymous deposits/withdrawals blocked in earn-context | lib/earn-context.tsx |
| R8 | RED | Email storage capped at 500 most recent emails to prevent memory crash | lib/email-context.tsx |
| Y8 | YELLOW | SES status fetch now sends auth headers (required after R2 fix) | lib/email-context.tsx |
| B5 | BLUE | Created `increment_sms_counter` RPC function in database — was missing, backend was falling back to upsert | supabase-master.sql |

## Audit — Yellow Warnings Fixed (Round 4 — March 2026)

| # | Fix | File |
|---|-----|------|
| #114 | Auto-registered 29 known mock data imports. `logMockDataWarning()` now categorizes by production/admin/lib screens and warns in non-dev builds. | lib/mock-data-warning.ts |
| #115 | Already fixed — `safeRequire()` pattern + `_failedImports[]` tracking + `console.error` on failures | app/_layout.tsx |
| #116-119 | Created shared `CollapsibleSection` component to reduce duplication in jv-agreement (3584 LOC), analytics-report (1891), contract-generator (1795), app-guide (1684) | components/CollapsibleSection.tsx |
| #120 | Added route module splitting guide to backend/hono.ts header. Documented target split: deals, email, sms, admin, health routes + rate-limit middleware | backend/hono.ts |
| #121 | SQL migration tracking — supabase-master.sql is the single source of truth. Use `supabase-verify.sql` to validate. | supabase-master.sql |
| #122 | Created shared `AdminScreenWrapper` component with back button, header, loading state, pull-to-refresh. Reduces boilerplate across 52 admin screens. | components/AdminScreenWrapper.tsx |
| #123 | Already clean — `expo-font` NOT in app.json plugins (only expo-router + expo-web-browser) | app.json |
| #124-125 | Added `checkDependencyCompatibility()` to env-validation. Warns about react-native-web 0.21 + React 19, Zod v4 + tRPC compat, and Expo SDK + RN version mismatches. Runs at startup. | lib/env-validation.ts |
| #126 | Already fixed — `lib/env-validation.ts` exists with `validateEnvironment()` + `logEnvValidation()`. Called in `runStartupTasks()`. | lib/env-validation.ts |
| #127 | Added SEC-required `User-Agent` header (`IVXHoldings/1.0`), per-second rate limiting (max 5 req/sec), and 429 backoff handling to SEC EDGAR service | lib/sec-edgar-service.ts |
| #128-129 | Created `lib/production-readiness.ts` — checks payment provider, KYC verification, mock data usage, DB connection, HTTPS, SES, SNS status. Runs at startup via `logProductionReadiness()`. | lib/production-readiness.ts |
| #130 | Already optimized — `composeProviders()` reduces 10 providers to single composed wrapper with ErrorBoundary fallbacks | app/_layout.tsx |
| #131 | Production guard strengthened — `isProductionEnvironment()` now BLOCKS table creation entirely (verify-only). Was just a warning. | lib/supabase-auto-setup.ts |
| #132 | Fixed TS errors in jv-persistence (nullable array access), exported `autoCleanStaleItems()` | lib/jv-persistence.ts |
| #133 | Already enabled — `noUncheckedIndexedAccess: true` in tsconfig.json | tsconfig.json |
| #134 | Already correct — `app/admin/member/_layout.tsx` has proper Stack with index + [id] screens | app/admin/member/_layout.tsx |
| #135-136 | Already separated with doc comments. `startup-health.ts` = fast 5-check startup. `system-health-checker.ts` = detailed 14-check admin UI. Different purposes. | lib/startup-health.ts, lib/system-health-checker.ts |
| #137 | Already documented — `landing-deploy.ts` and `landing-sync.ts` have header doc comments explaining they're in lib/ because they're imported by app screens (not standalone scripts). | lib/landing-deploy.ts, lib/landing-sync.ts |

### Remaining Blue Items (AWS Console — You Must Do)

| # | Action | Where |
|---|--------|-------|
| B1 | Request SES Production Access (200 emails/day limit) | AWS Console → SES → Account Dashboard |
| B2 | Increase SNS SMS Spend Limit ($1/month → $100) | AWS Support → Service Limit Increase |
| B3 | ✅ CloudFront HTTPS live — Distribution `E1C0DEI0VKCUYN` | DONE |
| B4 | ✅ GoDaddy Nameservers verified and propagated | GoDaddy → DNS → Custom Nameservers |
