# Fix JV Deal Deletion — Bulletproof Delete System

## Problem
Previous delete attempts used tRPC mutations that weren't reliably reaching the backend. Deals kept reappearing because deletions weren't persisting to DynamoDB.

## Fix (Completed)
- [x] **Direct REST endpoints** added to Hono backend (`/api/jv/purge-all`, `/api/jv/:id`, `/api/jv/list`) — bypasses tRPC entirely
- [x] **Delete button on each JV card** — trash icon on every deal card in the JV Agreements page
- [x] **"Delete All" button** — red purge button right next to "Create New" on JV Agreements list
- [x] **Dual-method deletion** — tries REST first, falls back to tRPC if REST fails
- [x] **Instant UI update** — removes deal from local state immediately after backend confirms
- [x] **Owner Controls** already uses real backend data via tRPC (was fixed previously)

---

# Fix JV Photos Not Saving & Publishing Live

## Problems Found (Deep Audit)
1. **Photos lost during save** — `buildJVPayload` with `skipPhotos=true` excluded ALL photos (including already-uploaded remote URLs) from save payload
2. **Backend data URI fallback too small** — 0.3MB limit meant most phone photos failed without S3
3. **Web compression threshold too high** — only compressed photos >5MB; photos 0.3-5MB failed backend limit
4. **Remote photos not preserved** — `handleCreateAndPublish` set `agreement.photos` to only remote URLs or undefined, losing context for the upload flow
5. **Landing page stale data** — `refetchInterval: 30000` and no `staleTime: 0` meant published deals didn't appear immediately

## Fixes Applied
- [x] **`buildJVPayload`** — renamed `skipPhotos` to `skipLocalPhotos`; now ALWAYS includes remote/uploaded photo URLs in payload regardless of local upload status
- [x] **`handleSaveAndPublish`** — simplified photo flow: remote photos always in initial payload, local photos uploaded after save then merged via update
- [x] **`handleCreateAndPublish`** — fixed photo classification so local photos are properly separated and passed to upload flow
- [x] **Backend `uploadDealPhoto`** — increased data URI fallback limit from 0.3MB to 2.0MB so photos work without S3
- [x] **Web photo compression** — lowered threshold from 5MB to 800KB; all web photos >800KB now compressed to JPEG with quality 0.4-0.55
- [x] **Landing page query** — `staleTime: 0`, `refetchOnMount: 'always'`, `refetchInterval: 15000` for real-time published deal display
- [x] **Invest tab** — already correctly displays published deals with photos (verified)

---

# Fix JV Photos/Deals Not Saving, Analytics Report, SMS Delivery (March 2026)

## 1. JV Module — Photos and Deals Not Saving

### Root Causes
1. **Photo classification bug** — `handleCreateAndPublish` classified `data:image/` URIs (from web compression) as "remote" but `uploadAllPhotos` treated them as "local" needing upload, causing an inconsistency where photos were neither uploaded nor included in the save payload
2. **`buildJVPayload` filter too broad** — `isRemoteUrl` included `data:image/` URIs as safe photos, but these are base64 strings that shouldn't be persisted directly as photo URLs
3. **Empty deal list not synced** — when `backendDealsQuery.data.deals` returned an empty array (`length === 0`), `setAgreements` was skipped, so after deleting all deals the list wouldn't clear

### Fixes Applied
- [x] **`handleCreateAndPublish`** — unified photo classification: `isNeedsUpload` now includes `data:image/` URIs alongside `file://`, `content://`, `blob:` — all go through the upload pipeline
- [x] **`buildJVPayload`** — `skipLocalPhotos=true` now only includes hosted URLs (`https://`, `http://`), excluding `data:image/` base64 strings; `skipLocalPhotos=false` still includes data URIs for fallback
- [x] **Backend deal list sync** — changed condition from `deals.length > 0` to `deals.length >= 0` so empty arrays properly clear the local state

## 2. Analytics Report Not Working

### Root Causes
1. **`placeholderData: (prev) => prev`** masked loading/error states — when the query had stale data from a previous period, switching periods showed old data instead of a loading indicator
2. **Stale data not cleared** — `gcTime` was default (5 min), so old query results persisted and masked "no data" states
3. **Connection detection too narrow** — `isConnected` only checked `isSuccess`, not whether data was actually present

### Fixes Applied
- [x] **Removed `placeholderData`** — analytics now shows loading state when switching periods instead of stale data
- [x] **Added `gcTime: 0`** — query cache is cleared immediately so stale data doesn't persist
- [x] **Added `refetchOnMount: 'always'`** and `refetchOnWindowFocus: true` — data refreshes on every screen visit
- [x] **Added `networkMode: 'always'`** — queries fire even when React Query thinks the network is down
- [x] **Improved diagnostic query** — `staleTime: 10000`, `refetchInterval: 15000`, `refetchOnMount: 'always'` for faster diagnostic data
- [x] **Fixed `isConnected`** — now checks `!!data || analyticsQuery.isSuccess` for more accurate connection status
- [x] **Fixed `isLoading`** — only shows loading when there's no existing data (`isLoading && !data`)

## 3. SMS Messages Not Being Delivered

### Root Causes
1. **Simulated mode returns `success: true`** — when `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` are missing, `sendToPhone` returned `{ success: true }` with status "simulated" — the frontend treated this as successful delivery
2. **No distinction between simulated and sent** — `getReportingStatus` counted "simulated" messages in `totalSent`, and the frontend showed them as delivered
3. **No user-facing warning** — the frontend had no indication that AWS SNS wasn't configured and messages weren't actually reaching phones

### Fixes Applied
- [x] **Backend `sendToPhone`** — now returns `{ success: true, simulated: true }` with clear error message when AWS credentials are missing
- [x] **Backend `sendSMS`** — tracks `allSimulated` flag across all recipients; returns `simulated: true` and a warning message when all sends were simulated
- [x] **Backend `getReportingStatus`** — added `snsConfigured` boolean, separated `totalSent` (actually delivered) from `totalSimulated` (logged but not sent)
- [x] **tRPC `sendCustom`** — now returns `simulated` flag and `warning` message to frontend
- [x] **Frontend SMS warning card** — shows prominent yellow warning banner when `snsConfigured === false`, explaining that messages are being simulated
- [x] **Frontend stats** — now shows three columns: "Delivered", "Simulated", "Failed" instead of grouping simulated with sent
- [x] **Frontend alert on simulated send** — when a custom message is simulated, an Alert pops up explaining that AWS SNS needs to be configured for real delivery

---

# Fix JV Photos Not Saving + Admin Edit/Delete on Landing Page (March 2026)

## Problems
1. **Photos not saving after publish** — base64 photos too large (800KB+ threshold), two-step update+publish lost photo data between calls
2. **No admin edit/delete on Landing page** — published deals had no management controls
3. **Landing page not real-time enough** — 8s refetch interval too slow
4. **No way to edit deals from Landing page** — investors/owners couldn't manage published deals

## Fixes Applied
- [x] **Aggressive photo compression** — lowered web threshold from 800KB to 120KB; ALL photos now compressed via OffscreenCanvas (not just large ones); quality 0.25-0.45 based on size; max 700-800px dimensions
- [x] **Single save+publish call** — replaced two-step update→publish flow with single `supabase.from('jv_deals').update({...payload, published: true})` call to prevent photos being lost between calls
- [x] **Always include photos in payload** — `buildJVPayload` now always sets `payload.photos` (empty array if none) instead of conditionally omitting
- [x] **Admin edit/delete on Landing page** — added Edit and Delete buttons on each live deal card (visible to admin/authenticated users)
- [x] **Delete mutation on Landing** — direct Supabase delete with query invalidation and confirmation dialog
- [x] **Edit navigation from Landing** — Edit button navigates to `/jv-agreement?editId=<dealId>` which auto-loads the deal in edit mode
- [x] **editId query param support** — `jv-agreement.tsx` reads `editId` from URL params and auto-opens the matching deal in edit mode when data loads
- [x] **Faster real-time** — reduced Landing page refetchInterval from 8000ms to 4000ms
- [x] **Photo size logging** — added detailed logging of photo sizes in payload during save/publish for debugging

---

# Fix Edit/Delete Permissions — Admin-Only for Live Deals (March 2026)

## Problems
1. **Landing page edit/delete visible to all users** — condition was `isAdmin || isAuthenticated`, so any logged-in user could see edit/delete buttons on live deals
2. **Admin panel query invalidation incomplete** — admin JV deals page only invalidated `['jvAgreements.list']`, so changes from admin didn't propagate to landing page or JV module

## Fixes Applied
- [x] **Landing page edit/delete admin-only** — changed condition from `(isAdmin || isAuthenticated)` to `isAdmin` only
- [x] **Admin panel query sync** — all mutations (publish, unpublish, update, delete) now invalidate `['jvAgreements.list']`, `['jv-agreements']`, `['published-jv-deals']`, and `['jv-deals']` so changes propagate across all screens in real time
- [x] **JV module already correct** — published deals show "Admin Only" badge, no edit/delete; unpublished deals still editable from JV module
