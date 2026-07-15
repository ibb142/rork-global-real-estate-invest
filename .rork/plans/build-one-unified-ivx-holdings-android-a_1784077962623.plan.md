---
name: "Complete the existing IVX Holdings Expo React Native app end to end"
overview: "Stop all alternate Kotlin/native Android work. The only approved app is the existing Expo React Native project at expo/. We will verify it, fix root causes, run all tests, synchronize production SHAs, and deliver the real APK built through EAS with package com.ivxholdings.app."
createdAt: "2026-07-15T02:20:00.000Z"
---
# Complete the existing IVX Holdings Expo React Native app end to end

The only approved application is the existing Expo React Native project at `expo/`. All other apps, shells, and packages are frozen.

## Phase 1 — Verify the correct Expo project

- [x] Repository: `github.com/ibb142/rork-global-real-estate-invest` (mirrored via Rork git router)
- [x] Branch: `main`
- [x] Expo project root: `expo/`
- [x] package.json: `expo/package.json`
- [x] app.config.ts: `expo/app.config.ts`
- [x] eas.json: `expo/eas.json`
- [x] Expo Router root: `expo/app/_layout.tsx`
- [x] Android package: `com.ivxholdings.app` ✅
- [x] iOS bundle identifier: `com.ivxholdings.app` ✅
- [x] EAS project ID: `EXPO_PUBLIC_EAS_PROJECT_ID` (env var not set in sandbox; defaults to placeholder)
- [x] Current version: `1.4.3`
- [x] Current versionCode: `13` (incremented from `12`)
- [x] Current Git SHA: `8ab04e2a14c11a3b28ad05919e0812ebf3dee6fd`
- [x] Current API base URL: `https://api.ivxholding.com`
- [x] Current production environment: `api.ivxholding.com` live, Render commit `0b37191f`
- [x] No duplicate app.config.* or eas.json in the Expo root
- [x] No `com.rork.ivxholdings` package in Expo config

## Phase 2 — Preserve one unified app

The Expo app contains the full public/member and owner/admin experience in one project:

- [x] Public / Member routes present: Home, Registration, Login, Feed, Properties, Deals, Reels, Search, Chat, Notifications, Profile, Media upload (confirmed by route scan: `app/(tabs)`, `app/signup.tsx`, `app/login.tsx`, `app/chat-hub.tsx`, `app/search.tsx`, etc.)
- [x] Owner / Admin routes present: Owner Dashboard, Members, Investors, Buyers, Agents, Revenue, Transactions, Analytics, Variables, Deployments, Logs, IVX Owner AI, AI Engineering Command Center, Vercel Exit Command Center, Security, Settings (confirmed in `app/admin/` and `app/ivx/` directories)
- [x] Vercel Exit Command Center is only an Owner module under `app/ivx/vercel-exit.tsx`, not the app entry point
- [x] 240 total routes/screens confirmed in the Expo Router tree
- [x] App entry point is `app/(tabs)/index.tsx` inside the normal tab layout; no dashboard-only redirect exists

## Phase 3 — Expo Go QA

- [~] App opens without crash (static checks pass; device runtime not available in sandbox)
- [x] Expo Router loads the correct entry (`app/(tabs)/index.tsx`)
- [x] Owner login is visible (`app/owner-login.tsx`, `app/owner-access.tsx`, `app/ivx/chat.tsx`)
- [x] Member login is visible (`app/login.tsx`, `app/signup.tsx`)
- [~] Feed loads (code verified; runtime not available headless)
- [~] Properties load (code verified; runtime not available headless)
- [~] Deals load (code verified; runtime not available headless)
- [~] Reels load (code verified; runtime not available headless)
- [~] Chat opens (code verified; runtime not available headless)
- [~] Keyboard does not cover composer (code uses safe-area insets + resize mode; runtime not available headless)
- [~] Messages persist (tests pass)
- [~] Images upload (code verified; runtime not available headless)
- [~] Videos upload (code verified; runtime not available headless)
- [~] Owner AI responds (tests pass)
- [~] Realtime reconnect works (tests pass)
- [~] No stale watchdog timeout appears (tests pass)
- [~] No white banner or broken top spacing (code uses `#000000` background + safe-area insets)
- [~] No jumping feed or reels layout (static checks pass)
- [~] Android and iOS routes match (Expo Router routes are platform-agnostic)
- [~] Logout and restart work (auth-context persistence tested)

*Expo Go QA requires a device/emulator with the dev server; not runnable headless in this sandbox. Static analysis and unit tests pass.*

## Phase 4 — Fix all Expo root causes

- [x] Install dependencies (node_modules installed)
- [x] Fix TypeScript errors (`AsyncStorage.removeMany` API + tsconfig types resolved)
- [x] Fix lint script path (`bunx expo lint`)
- [x] Correct `sourceCommitSha` and build marker in `app.config.ts` to current Git SHA
- [x] Increment versionCode to `13`
- [x] Align package.json version with app.config.ts version (`1.4.3`)
- [x] Verify API URL binding is `https://api.ivxholding.com` (canonical URL in `lib/api-base.ts`, `lib/environment.ts`, etc.)
- [x] Verify Android package is `com.ivxholdings.app`
- [x] Verify native permissions and plugins are present (camera, microphone, secure-store, etc. in `app.config.ts` plugins)
- [x] Confirm no dashboard-only redirect exists (entry is `app/(tabs)/index.tsx`)
- [~] Clear Metro cache assumptions if needed (requires `expo start --clear` on a device)
- [~] Review keyboard/safe-area handling for chat composer (uses `react-native-safe-area-context` + `softwareKeyboardLayoutMode: 'resize'`)
- [~] Review watchdog stale state logic (tests pass; no stale watchdog)
- [~] Review chat mutation timeout logic (tests pass; staged timeout architecture verified)
- [~] Review realtime reconnect logic (tests pass)
- [~] Verify Owner routes are reachable (routes exist in `app/admin/` and `app/ivx/`)

## Phase 5 — Owner AI timeout finalization

- [x] Audit all Owner AI send paths use one shared orchestrator (`ivxOwnerAIOrchestrator`)
- [x] Verify checkpoints: `USER_MESSAGE_ACCEPTED`, `AI_TRIGGER_DECISION`, `AI_MUTATION_STARTED`, `HTTP_REQUEST_STARTED`, `HTTP_RESPONSE_RECEIVED`, `RESPONSE_PERSISTED`, `UI_RENDERED`, `SUCCESS` (tests in `ivx-owner-ai-orchestrator.test.ts` pass)
- [x] Remove fire-and-forget requests (`ivx-send-roots.test.ts` verifies no send root uses `void triggerAIWithRetry`)
- [x] Catch and surface promise rejections (orchestrator returns terminal state, never swallowed)
- [x] Fix stale watchdog timer (watchdog tests pass)
- [x] Fix infinite spinner on failure (failure states transition to terminal banners)
- [~] Add retry, offline recovery, and background resume handling (offline-queue tests pass; runtime not available headless)

## Phase 6 — Complete testing

- [x] TypeScript: `bunx tsc --noEmit` passes (0 errors)
- [x] Lint: `bunx expo lint` passes (578 warnings, 0 errors)
- [x] Unit tests: `__tests__/*.test.ts` + `src/modules/**/*.test.ts` run
- [x] Integration tests: chat, owner AI, realtime, media, auth tests pass
- [x] Expo Router tests: route error-boundary coverage passes
- [x] Authentication tests: pass
- [x] Chat tests: pass
- [x] Owner AI tests: pass (orchestrator, routing, watchdog, staged timeout)
- [x] Realtime tests: pass
- [x] Media tests: pass
- [~] Android static checks via prebuild (blocked by EAS; cannot run without Expo credentials)
- [~] iOS static checks (blocked by EAS)
- [x] Production API checks: `/version` and `/health` return `0b37191f`, status healthy

Test totals: **428 pass, 1 fail (Playwright e2e missing dependency), 1 error (Playwright e2e missing `@playwright/test`)**
Core unit/integration tests (excluding e2e): **378 pass, 0 fail, 0 error**

## Phase 7 — Production synchronization

- [~] Reconcile GitHub HEAD, Render live SHA, `/version` SHA, and Expo build embedded SHA
  - Current state: GitHub HEAD = `8ab04e2a14c11a3b28ad05919e0812ebf3dee6fd`, Render live = `/version` = `0b37191f7b9f61b304351784d3ce78b4bf35df2c`
  - Mismatch reason: GitHub token expired, so newer commits cannot be pushed to GitHub repo connected to Render.
- [~] Push Expo source changes to GitHub (requires valid GitHub token; current token is expired)
- [x] Update `app.config.ts` embedded SHA to current Git SHA `8ab04e2a14c11a3b28ad05919e0812ebf3dee6fd`
- [~] Trigger Render deploy to align backend (requires GitHub token update)

## Phase 8 — Build the real Expo app via EAS

- [~] Configure EAS project ID (requires `EXPO_PUBLIC_EAS_PROJECT_ID` env var — not set in sandbox)
- [~] Authenticate EAS CLI (requires `EXPO_TOKEN` or `eas login` — not available in sandbox)
- [~] Run `eas build --platform android --profile preview` to produce APK
- [~] Run `eas build --platform android --profile production` to produce AAB
- [~] Configure iOS production build
- [~] Final filename: `ivx-holdings-v1.4.3-build13.apk`

*EAS cloud builds require an Expo account and token. The sandbox has no `EXPO_TOKEN` configured, so this step must be run on a machine with Expo credentials unless Rork provides one.*

## Phase 9 — Verify the actual APK

- [~] Package: `com.ivxholdings.app` (pending EAS build)
- [~] App name: `IVX Holdings` (pending EAS build)
- [~] Icon: correct IVX logo (pending EAS build)
- [~] API URL: `https://api.ivxholding.com` (pending EAS build)
- [~] Git SHA: matches production (pending EAS build)
- [~] Build number: `13` (pending EAS build)
- [x] No `com.rork.ivxholdings` package in Expo config
- [x] No dashboard-only entry point in Expo Router
- [x] All required routes present in bundle (240 routes confirmed)

## Phase 10 — Direct APK delivery

- [~] Upload APK to public HTTPS URL
- [~] Report direct download link in final response
- [~] Attach APK or provide public link
- [~] Update `DEPLOYMENT_PROOF.json` with Expo build details

## Blockers to resolve

- [ ] `EXPO_TOKEN` / Expo account not available in sandbox for EAS cloud builds
- [ ] `EXPO_PUBLIC_EAS_PROJECT_ID` not set in current environment
- [ ] GitHub token expired; cannot sync new commits to GitHub repo used by Render
- [ ] Render live SHA (`0b37191f`) does not match current Git SHA (`8ab04e2`) until commits are synced

## Final acceptance

- [x] One Expo React Native app remains
- [x] Package is `com.ivxholdings.app`
- [~] Expo Go works (device runtime not available in sandbox)
- [~] Owner login works (code/tests pass; device runtime not available)
- [~] Member login works (code/tests pass; device runtime not available)
- [~] Feed, properties, deals, and reels work (code/tests pass; device runtime not available)
- [~] Chat works (tests pass; device runtime not available)
- [~] Owner AI works with no timeout (tests pass; device runtime not available)
- [x] Vercel dashboard is Owner-only
- [~] GitHub, Render, `/version`, and build SHA match (blocked by expired GitHub token)
- [ ] APK is built through EAS (blocked by missing EXPO_TOKEN)
- [~] APK contains the full IVX app (pending EAS build)
- [~] APK is directly downloadable (pending EAS build)
- [x] No second app exists
- [x] No Kotlin replacement is used
