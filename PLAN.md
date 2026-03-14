# JV Deals — Real-time from Database Only

## Current Setup

All JV deals (including Casa Rosario) are managed exclusively through the **Admin Panel**.

- [x] Removed hardcoded `casa-rosario-001` fallback from jv-storage.ts
- [x] Removed auto-seed logic from app startup (_layout.tsx)
- [x] Removed fallback injection from landing.tsx
- [x] Removed fallback injection from home/index.tsx
- [x] Removed destructive startup cleanup that was deleting real user deals on every app launch
- [x] Fixed photo parsing: handles string JSON, arrays, null, and filters invalid entries
- [x] Fixed pool_tiers mapping from Supabase snake_case to camelCase
- [x] Only real deals created via Admin Panel appear in app and landing page

## Delete Protection (NEVER delete without admin authorization)

- [x] Added soft-delete (archive) — deals are archived instead of permanently deleted
- [x] Added restore functionality — archived deals can be restored to active status
- [x] Added "Archived" filter tab in Admin JV Deals
- [x] Permanent delete requires typing the exact project name to confirm
- [x] Disabled `deleteJVDealsByProjectName()` — bulk delete by name is blocked
- [x] Disabled `deleteAllJVDeals()` — bulk delete all is blocked
- [x] No code anywhere in the app auto-deletes deals on startup or navigation

## Trash Bin System (v2 — March 2026)

- [x] `deleteJVDeal()` now moves deals to trash (soft-delete) instead of permanent delete
- [x] All deleted deals are saved to a local trash backup (AsyncStorage) for recovery
- [x] Trashed deals in Supabase get status='trashed' + published=false
- [x] New `fetchTrashDeals()` — retrieves all trashed deals from Supabase + local backup
- [x] New `restoreFromTrash()` — restores deals from trash back to active status
- [x] New `permanentlyDeleteJVDeal()` — ONLY available in Admin Trash Bin, requires typing project name
- [x] Created **Admin > Trash Bin** page (`app/admin/trash-bin.tsx`) with restore + permanent delete
- [x] Removed ALL delete buttons from `jv-agreement.tsx` (non-admin page)
- [x] Removed ALL delete buttons from `landing.tsx` (non-admin page)
- [x] Replaced delete with archive in `owner-controls.tsx`
- [x] Removed "Purge All" / "Delete All" button from owner-controls
- [x] Added Trash Bin link in owner-controls for easy access
- [x] Admin JV Deals permanent delete now uses `permanentlyDeleteJVDeal()` (only for already-archived deals)
- [x] One-time auto-restore for Casa ROSARIO if it was deleted
- [x] Casa ROSARIO auto-create DISABLED — no hardcoded deals plan

## Performance Fixes (March 2026)

- [x] #81 — Unified cache key `published-jv-deals` between home and landing (no more double-fetching)
- [x] #57/59/82/102 — Removed triple polling: realtime only does fallback when explicitly enabled, removed refetchInterval from both pages
- [x] #79/103 — Created shared `lib/parse-deal.ts` with single `parseDeal()` function used by both home and landing
- [x] #64/104 — Consistent partners parsing via `getPartnersArray()` / `getPartnerCount()` — handles string JSON, array, number
- [x] #72 — JV card in home now navigates to specific deal (`/jv-invest?jvId=X`) instead of deal list
- [x] #110 — Added `LandingDealsErrorBoundary` around live deals section on landing page
- [x] #87 — Removed `runSupabaseDiagnostics()` from every landing page load (was inserting test rows)
- [x] #95 — Fixed hardcoded 360px image width on landing page deals — now uses 100% width
- [x] #40/105 — Disabled `restoreCasaRosarioIfNeeded()` auto-create — contradicts no hardcoded deals plan
- [x] Fully removed `restoreCasaRosarioIfNeeded()` call from home screen queryFn
- [x] Removed hardcoded Casa Rosario fallback + `ensureCasaRosario()` from landing HTML
- [x] Removed `CASA_ROSARIO_ORIGINAL_PHOTOS` constant and restore logic from jv-storage.ts
- [x] Removed Casa Rosario seed INSERT from supabase-patch-jv-deals.sql

## Photo Protection System (March 2026)

- [x] `protectPhotos()` guard in `updateJVDeal()` — if update sends empty photos, fetches existing from DB and preserves them
- [x] `protectPhotos()` guard in `upsertJVDeal()` — same protection for upsert operations
- [x] Local storage upsert also checks for existing photos before allowing clear
- [x] Fixed `jv-agreement.tsx` `buildJVPayload()` — no longer sends `photos: []` when form has no photos (was the root cause of photo deletion)
- [x] `recoverPhotosForDeal()` — tries to recover photos from trash backup and local storage
- [x] `adminRestorePhotos()` — admin-only function to manually add/restore photo URLs to a deal
- [x] Admin JV Deals page now shows photo count per deal with camera icon button
- [x] Admin can auto-recover photos from backups or manually paste photo URLs
- [x] Photo Restore Modal in Admin Panel for pasting URLs
- [x] `removePhoto()` in `jv-agreement.tsx` now blocked for non-admin users editing existing deals
- [x] `protectPhotos()` now blocks photo REDUCTION (not just clearing) — if incoming photos < existing photos, update is rejected unless `adminOverride: true`
- [x] `upsertJVDeal()` and `updateJVDeal()` accept `{ adminOverride: true }` option — only admin callers pass it
- [x] Admin JV Deals page passes `adminOverride: true` on all update operations
- [x] Restore Casa ROSARIO 8 original photos — auto-restore on home screen load if photos missing
- [x] `removePhoto()` completely blocked for ALL existing deals (even admin) — must use Admin Panel photo management
- [x] Remove button hidden in UI for existing deal photos
- [x] `protectPhotos()` rewritten with cleaner audit logging and absolute block on reduction/clearing

## Real-time Admin → Landing Page Sync Fixes (March 2026)

### Bugs Found in Audit
- [x] `useJVRealtime('landing-jv-deals', false)` — fallback polling was DISABLED on landing page, so if Supabase Realtime failed to connect, the landing page NEVER got updates
- [x] No `refetchInterval` on published deals query — after staleTime expired, no automatic refetch happened
- [x] Realtime channel name included `Date.now()` suffix — every reconnect created a new channel instead of reusing, causing subscription leaks
- [x] `invalidateAllJVQueries()` only invalidated but didn't force refetch — stale cache could persist
- [x] Admin mutations manually listed query keys to invalidate — inconsistent and missing some keys

### Fixes Applied
- [x] **jv-realtime.ts**: Stable channel name (removed `Date.now()` suffix) — reuses same channel on reconnect
- [x] **jv-realtime.ts**: `invalidateAllJVQueries()` now also calls `refetchQueries()` for `published-jv-deals` and `jvAgreements.list` — forces immediate data refresh
- [x] **jv-realtime.ts**: Fallback polling stays active as safety net even when realtime connects (slower 30s interval)
- [x] **jv-realtime.ts**: Increased max retries from 5 to 8, handles `CLOSED` status
- [x] **jv-realtime.ts**: Added `useForceJVRefresh()` hook for manual force-refresh
- [x] **landing.tsx**: Changed `useJVRealtime('landing-jv-deals', false)` → `true` — enables fallback polling
- [x] **landing.tsx**: Added `refetchInterval: 12000` — auto-refetch every 12s as safety net
- [x] **landing.tsx**: Reduced `staleTime` from 10s to 5s, `gcTime` from 30s to 15s
- [x] **admin/jv-deals.tsx**: All mutations now use centralized `invalidateAllJVQueries()` instead of manual key lists

### Red Items Fixed (Follow-up Audit)
- [x] 🔴→✅ **Cross-tab invalidation**: Added `BroadcastChannel` API to `jv-realtime.ts` — when admin publishes/deletes in one browser tab, landing page in another tab receives instant notification and refetches
- [x] 🔴→✅ **checkSupabaseTable() failure cache too long (10s)**: Reduced failure cache TTL from 10s to 2s in `jv-storage.ts` — if Supabase check fails, retries in 2s instead of waiting 10s
- [x] 🔴→✅ **Supabase Realtime not enabled on jv_deals table**: Added SQL to `supabase-patch-jv-deals.sql` — `ALTER PUBLICATION supabase_realtime ADD TABLE jv_deals` — **USER MUST RUN THIS IN SUPABASE SQL EDITOR**

### Deep Audit Fix (March 2026 — Round 2)
- [x] 🔴→✅ **Supabase client missing realtime config**: Added `realtime: { params: { eventsPerSecond: 10 } }` to `lib/supabase.ts` — ensures realtime channels connect properly
- [x] 🔴→✅ **Admin page had NO useJVRealtime**: Admin only broadcasted changes but never listened — added `useJVRealtime('admin-jv-deals', true)` so admin sees external changes too
- [x] 🔴→✅ **Home page fallback polling DISABLED**: `useJVRealtime('home-jv-deals', false)` → changed to `true` + added `refetchInterval: 15000` — home now auto-refreshes
- [x] 🔴→✅ **BroadcastChannel singleton leaked**: Never cleaned up on unmount → added ref counting, `bc.close()` when last listener unmounts
- [x] 🔴→✅ **No visibility-based reconnect**: After phone sleep/tab switch, realtime went stale → added `visibilitychange` (web) + `AppState` (native) listeners that force refetch + reconnect on focus
- [x] 🔴→✅ **jv-storage.ts failure cache still slow**: Reduced `SUPABASE_FAILURE_CACHE_TTL` from 2s to 1.5s, `SUPABASE_CACHE_TTL` from 10s to 8s, `TABLE_CACHE_TTL` from 15s to 10s

## How it works now
- All deals come from Supabase (or local storage fallback)
- No hardcoded deals — what you create in Admin is what shows
- Landing page syncs via 4 layers: (1) Supabase Realtime subscription, (2) fallback polling every 8-25s, (3) refetchInterval every 12s, (4) visibility-based reconnect on tab/app focus
- Home page syncs via same 4 layers with refetchInterval every 15s
- Admin page now ALSO listens to realtime changes (was only broadcasting before)
- Admin changes trigger Supabase UPDATE/DELETE → Realtime delivers event to ALL pages → queries auto-refetch
- Cross-tab sync via BroadcastChannel — admin tab broadcasts, landing/home tabs receive and refetch instantly
- Edit, publish, unpublish, or archive any deal from Admin Panel
- **Deleting a deal moves it to Trash** — never permanently deleted without admin authorization
- Trash Bin in Admin lets you restore or permanently delete (requires typing project name)
- Non-admin pages (JV Agreement, Landing) have NO delete buttons at all
- Photos, partners, and poolTiers are robustly parsed from any format (string JSON, array, null)
- **Photo Protection**: No code can clear or reduce photos from a deal — the storage layer automatically preserves existing photos if an update tries to send fewer photos (unless admin override is used)
- Admin Panel has photo recovery tools: auto-recover from backups or manually add URLs
- No startup code interferes with user-created deals
- All hardcoded Casa Rosario code has been fully removed (no fallbacks, no auto-create, no auto-restore)
- `removePhoto()` is completely disabled for existing deals — no one can remove photos through the JV Agreement form
- Photo removal is ONLY possible through Admin Panel > JV Deals > Photo Management with `adminOverride: true`

## Fake Data Purge & Project-Scoped Storage Isolation (March 2026)

### Fake Data Removal
- [x] Removed ALL fake properties from `mocks/properties.ts` — empty array, only real admin-created data
- [x] Removed ALL fake market data from `mocks/market.ts` — empty record, only real API data
- [x] Removed ALL fake debt acquisition properties + token purchases + first lien investments from `mocks/debt-acquisition.ts`
- [x] Removed ALL fake tokenized properties + sample trades from `mocks/share-trading.ts`
- [x] Removed fake admin stats counts (totalProperties: 6, liveProperties: 4) from `mocks/admin.ts` — now zero
- [x] Updated `lib/data-hooks.ts` — no longer falls back to fake mock data; returns empty arrays when Supabase has no data
- [x] Removed `mockUser` dependency from `useCurrentUser()` — replaced with `DEFAULT_USER` object (no more mock imports)
- [x] Removed `mockHoldings` fallback from `useHoldings()` — returns `[]` when Supabase has no data
- [x] Removed `mockNotifications` fallback from `useNotifications()` — returns `[]` when Supabase has no data
- [x] Removed `mockUser.walletBalance` fallback from `useWalletBalance()` — returns `0` when Supabase has no data

### Project-Scoped Storage Isolation (Instagram-style)
- [x] Created `lib/project-storage.ts` — core isolation system
  - Every AsyncStorage key is prefixed with project ID (`@ivx_p_{PROJECT_ID}::`)
  - User-scoped keys add user ID (`@ivx_p_{PROJECT_ID}_u_{USER_ID}::`)
  - `validateKeyOwnership()` — blocks cross-project access at the storage layer
  - `auditStorageKeys()` — detects foreign keys from other projects
  - `cleanForeignKeys()` — removes any data from other projects
  - `runStorageIntegrityCheck()` — full health check on startup
  - `migrateUnscopedKey()` — safely migrates old unscoped keys to new format
- [x] Updated `lib/jv-storage.ts` — JV deals, waitlist, and trash all use project-scoped keys
- [x] Updated `lib/image-storage.ts` — image registry uses project-scoped keys
- [x] Updated `lib/email-context.tsx` — email storage + active account use project-scoped keys
- [x] Updated `lib/ipx-context.tsx` — IPX holdings + purchases use project-scoped keys
- [x] Updated `lib/earn-context.tsx` — earn data uses project-scoped keys
- [x] Updated `lib/lender-context.tsx` — imported lenders use project-scoped keys
- [x] Updated `lib/i18n-context.tsx` — language preference uses project-scoped keys
- [x] Updated `lib/intro-context.tsx` — onboarding steps + completion flag use project-scoped keys
- [x] Updated `lib/analytics.ts` — analytics events + session use project-scoped keys
- [x] Added startup integrity check in `app/_layout.tsx` — on every app launch:
  - Runs `runStorageIntegrityCheck()` to verify project isolation
  - Runs `auditStorageKeys()` to detect foreign data
  - Auto-cleans foreign keys from other projects via `cleanForeignKeys()`

### How Project Isolation Works
- Similar to how Instagram keeps each account's data separate
- Each project has a unique `EXPO_PUBLIC_PROJECT_ID` that namespaces ALL local storage
- No project can read, write, or delete another project's data
- Cross-project access is blocked at the storage layer with error logging
- On app startup, any leaked foreign data is automatically detected and cleaned
- Supabase queries are already scoped by authenticated user — this adds client-side isolation on top
- Image registry, JV deals, waitlist, and trash are all project-isolated
- The system prevents bugs where one project's pictures/info could appear in another project
- ALL contexts now use project-scoped storage: JV deals, images, emails, IPX holdings, earn data, lenders, language, onboarding, analytics

## Go-Live Fixes (March 2026)

### App Code Fixes
- [x] **#62** — `lib/analytics.ts`: Analytics table silent fail → added table existence verification with max 3 attempts, clear warning when `analytics_events` table missing, drops queue instead of infinite re-queue
- [x] **#65** — `lib/email-context.tsx`: Email edge function error handling → `sendEmail()` now returns `deliveryStatus: 'sent' | 'queued_locally'` with clear warnings when edge function is not deployed
- [x] **#104** — `lib/environment.ts`: Hardcoded fallback URLs → staging/production configs now fall back to `EXPO_PUBLIC_SUPABASE_URL` before hardcoded domain
- [x] **#57** — `lib/push-notifications.ts`: Push token registration → detects missing `push_tokens` table with clear warning message instead of generic error

### Infrastructure Files Created
- [x] **#107** — `deploy/aws/s3-config.ts`: S3 bucket configuration with prefix structure, file type validation, CloudFront CDN config
- [x] **#107** — `deploy/aws/s3-bucket-policy.json`: S3 bucket policy with CloudFront OAI access, deny unencrypted transport, deny public access
- [x] **#107** — `deploy/aws/cloudfront-config.json`: CloudFront distribution config with cache behaviors for images/documents, TLS 1.2, HTTP/2+3
- [x] **#109** — `deploy/.env.production`: Production env file generated from template with TODO markers for all required credentials
- [x] `supabase-go-live-verify.sql`: Comprehensive verification script — checks all 13 tables, RLS, realtime publication, policies, indexes, auth trigger

### Deferred to Next Phase
- [ ] **#12** — 2FA verification (stub only)
- [ ] **#13** — Owner direct access (stub only)

### Manual Steps Required (Not Code)
- Run `supabase-master-setup.sql` in Supabase SQL Editor (creates all 13 tables + RLS + realtime)
- Run `supabase-go-live-verify.sql` to confirm everything is ready
- Deploy `send-email` Supabase Edge Function for real email delivery
- Configure DNS for `ivxholding.com` / `staging.ivxholding.com` / `api.ivxholding.com`
- Provision SSL certs into `deploy/nginx/ssl/`
- Fill in `deploy/.env.production` with real credentials (search for TODO)
