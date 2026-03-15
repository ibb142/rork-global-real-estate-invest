# Remove hardcoded photos — Only show uploaded images

**What changed**:

- [x] Removed all hardcoded Unsplash photos from Home screen
- [x] Removed `isCasaRosarioDeal` function and `CASA_ROSARIO_PHOTOS` array
- [x] App now only displays photos that exist in the database (uploaded by the user)
- [x] No fake/unauthorized images will ever be injected into any deal

**How it works**:

- [x] JV deals load photos directly from Supabase `photos` field — no overrides
- [x] If a deal has no photos uploaded, no images are shown (no fallback to stock photos)
- [x] This applies to all deals, including Casa Rosario

# Fix uploaded photo display + landing page real-time sync

**Root cause fixed**: Photos uploaded from device are stored as `data:image/` base64 URIs in Supabase, but ALL display code was filtering with `p.startsWith('http')` which **rejected** user-uploaded photos.

**Files fixed**:

- [x] `lib/parse-deal.ts` — Added `isValidPhoto()` and `filterValidPhotos()` shared helpers that accept both `http` URLs and `data:image/` URIs
- [x] `app/(tabs)/(home)/index.tsx` — Home screen now uses `isValidPhoto()` to show uploaded photos
- [x] `app/(tabs)/invest/index.tsx` — Invest tab now uses `filterValidPhotos()` for photo display
- [x] `app/jv-invest.tsx` — JV invest screen accepts `data:image/` photos
- [x] `lib/jv-storage.ts` — `mapSupabaseRowToCamelCase` now preserves `data:image/` photos from database
- [x] `lib/landing-sync.ts` — Landing sync now passes `data:image/` photos to landing page; auto-deploys full HTML to S3 after publish
- [x] `ivxholding-landing/index.html` — Landing page `mapDeal()` now accepts `data:image/` photos for rendering

**Landing page real-time sync**:

- [x] Landing page already has Supabase realtime subscription on `jv_deals` table
- [x] When you publish a deal, it saves to Supabase → landing page detects the change via realtime → re-fetches and renders
- [x] `syncToLandingPage()` also syncs to `landing_deals` Supabase table as backup
- [x] S3 auto-deploy now pushes full HTML (not just config) after publish for permanent updates
