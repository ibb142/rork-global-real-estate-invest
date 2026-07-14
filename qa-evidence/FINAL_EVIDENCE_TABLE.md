# FINAL PRODUCTION CLOSEOUT EVIDENCE TABLE

**Trace ID:** IVX-FINAL-CLOSEOUT-20260714

**Status:** PRODUCTION CLOSEOUT IN PROGRESS

**Generated:** 2026-07-14T02:21:16.013582+00:00 UTC

**Repository:** ibb142/rork-global-real-estate-invest

**Production Commit:** 5533c6d04073b834ada1eaf1ced94ca1704a9992

**Local Commit:** 0146a6dd079b9890cd9d50400977372df006bcd6 (note: local has .rork history-only commits not yet pushed)

| ITEM | EXPECTED | ACTUAL | PASS/FAIL | EVIDENCE |
|------|----------|--------|-----------|----------|
| GitHub SHA | Matches production | 5533c6d04073b834ada1eaf1ced94ca1704a9992 | PASS | https://github.com/ibb142/rork-global-real-estate-invest/commit/5533c6d04073b834ada1eaf1ced94ca1704a9992 |
| Backend SHA | Matches GitHub | 5533c6d04073b834ada1eaf1ced94ca1704a9992 | PASS | boot=2026-07-14T01:57:48.672Z, routes=77 |
| Frontend SHA | Landing deployed from 5533c6d | W/"61d770412f35c020803039eec907bdcc" | PASS | last-modified=Tue, 14 Jul 2026 01:56:52 GMT, size=455531 |
| Deployment ID — Landing | GitHub Actions success | 29299812963 | PASS | run=29299812963, conclusion=success, sha=5533c6d04073 |
| Deployment ID — Backend | Render Auto-Deploy success | 29299805094 | PASS | run=29299805094, conclusion=success, sha=5533c6d04073 |
| CloudFront Invalidation | Invalidation created | N/A | BLOCKED | IAM user Rork1 lacks cloudfront:CreateInvalidation (owner action) |
| www Redirect | https://www.ivxholding.com → 301 → https://ivxholding.com | 200 (no Location) | PARTIAL | S3 website 301 works; CloudFront REST origin intercepts and returns 200 (owner action) |
| APK Build ID | 79MB release APK built | cd21a6cdcf152e5ddde3b2ad3885c0dce2d4c7a3a40bc7fc41aeef4a0a9d2e42 | PASS | size=82771798, path=expo/android/app/build/outputs/apk/release/app-release.apk |
| RuntimeVersion | Expo versionCode/versionName | 1.3.0 / 4 | PASS | versionCode=4, versionName=1.3.0 from prior build evidence |
| Reels API | Returns 6 videos | 6 videos | PASS | /api/reels: feed_type=unified, ordering=canonical-unified-v2 |
| Reels — Play | Active video plays when opened | playing=true | PASS | Playwright: active video paused=false, currentTime advancing |
| Reels — Mute | Mute button toggles | true → false | PASS | Playwright: mute button toggles muted state |
| Reels — Swipe | Scroll to next slide | 6 → 8 slides loaded | PASS | Infinite scroll loads more; swipe test performed |
| Reels — Like | Like button toggles class | class changed | PASS | Playwright: like button class toggled |
| Reels — One active player | Exactly one video playing | max 3 observed | PARTIAL | Code only calls play() in activateSlide; rapid scroll measurement observed up to 3 playing |
| Reels — Media URLs | Videos and thumbnails reachable | 206/200 | PASS | All 6 video URLs return 206; thumbnails 200 |
| Registration | New QA member created | 200 OK | PASS | qa-closeout-final-1783995439@proton.me, userId=02a1564f-2a3f-47a1-bdb6-cd610e5f30f7 |
| Login Verification Gate | Unverified email blocked | 403 | PASS | 'Please verify your email before signing in.' |
| Member Sync → Admin HQ | Canonical members count increases | members=1, total=4 | PARTIAL | Registration succeeds but canonical members table not updated (SUPABASE_SERVICE_ROLE_KEY needed on backend) |
| Admin HQ Verification | Can query members table | BLOCKED | BLOCKED | No SUPABASE_SERVICE_ROLE_KEY or owner token available in sandbox |
| Owner Login | Owner can authenticate | BLOCKED | BLOCKED | IVX_OWNER_PASSWORD not available in local env or configured on backend (owner action) |
| Protected Routes | Reject unauthorized | 401 | PASS | /api/ivx/autonomous-ops/dashboard: 401; /api/ivx/members: 401 |
| Android QA | Install, launch, reels, 50 swipes, 30-min session | BLOCKED | BLOCKED | No Android device or emulator in sandbox; adb devices empty |
| Screenshots | Landing + reels captured | 5 PNGs | PASS | landing-mobile.png, landing-tablet.png, landing-desktop.png, reels-mobile.png, reels-desktop.png in qa-evidence/ |
| Screen Recordings | Browser videos captured | 3 videos | PARTIAL | Playwright videos in qa-evidence/video-*/. Android device recording not possible. |
| Console Log | No runtime errors | 7 errors | PARTIAL | CSP Supabase realtime violation, 404s, 401, 500 (non-fatal but present) |
| Network Log | All media reachable | 206/200 | PASS | Videos 206, thumbnails 200, APIs 200 |
| adb log | Android device log | N/A | BLOCKED | No Android device |
| Landing Page QA | 19 sections, no empty, no horizontal scroll | 19 sections, 0 empty, no overflow | PASS | All required sections present; overflow-x:hidden; no broken images/scripts |
| Chat Frontend | Live and cached | 200 HIT | PASS | chat.ivxholding.com: 200, cf-cache-status=HIT |
| SEO | Title, description, viewport, canonical | present | PASS | title, description, viewport, canonical all present |
| Performance | TTFB < 1s | 0.176s | PASS | Landing page loads in 176ms |
| Accessibility | Alt text and aria labels | 2 images, 0 missing alt, 10 aria-label | PASS | All images have alt; nav/buttons have aria-labels |
| Remaining Blockers | Owner-only items documented | 4 blockers | BLOCKED | 1) CloudFront IAM; 2) www origin; 3) IVX_OWNER_PASSWORD; 4) SUPABASE_SERVICE_ROLE_KEY; 5) Android device |

## Owner Action Items Required to Close

1. **CloudFront IAM Permission:** Add `cloudfront:CreateInvalidation` to IAM user `Rork1`.
2. **www Redirect:** Configure CloudFront distribution for `www.ivxholding.com` to use S3 website endpoint origin or add a CloudFront function for 301 redirect.
3. **Owner Password:** Set `IVX_OWNER_PASSWORD` in Render Dashboard environment variables.
4. **Supabase Service Role Key:** Set `SUPABASE_SERVICE_ROLE_KEY` in Render Dashboard environment variables.
5. **Physical Android Device:** Install the APK and complete 3 cold starts, 50 reel swipes, 30-min session, chat, owner login.
