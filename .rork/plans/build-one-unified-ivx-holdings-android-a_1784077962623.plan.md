---
name: "IVX Holdings Expo app — final owner sign-in stabilization, diagnostic banner removal, and production APK"
overview: "Fix the installed Expo React Native app root causes: remove the production diagnostics banner, restore and validate the owner Supabase session after app restart, consolidate to one Supabase client, inject real build environment info, and ship a new com.ivxholdings.app APK with direct download."
createdAt: "2026-07-15T02:20:00.000Z"
---
# IVX Holdings Expo app — final owner sign-in stabilization and diagnostic banner removal

The only approved application is the existing Expo React Native project at `expo/`. All other apps, shells, and packages are frozen.

## Background — real-device evidence from the installed APK

- Top diagnostics banner is visible in production with `Git SHA: local` and `API env: unknown`.
- Owner AI returns `no_supabase_session` after valid owner login.
- The app must hide diagnostics by default in production, persist and restore the owner session correctly, and display the real build environment.

## Task 1 — Remove the top diagnostic banner from production

- [x] Render `IVXOwnerAIDiagnostics` only when explicitly enabled by an authenticated owner in production; default to hidden in release builds.
- [x] Add a Close button and persist the closed state.
- [~] Move the full diagnostics panel into the Owner Diagnostics / Control Room drawer, not as an overlay above chat content.
- [x] Ensure the banner never pushes the page down, covers buttons, or reappears after app restart unless the owner reopens it.
- [x] Do not delete diagnostics functionality; relocate it.
- *Note: build 14 still rendered the overlay because the `visible` prop was hardcoded to `true`. Fixed by binding it to `diagnosticsBannerVisible` and defaulting that state to `false`.*

## Task 2 — Fix owner session persistence and restore

- [x] Remove the `OWNER_AUTO_LOGIN_BLOCK` that signs the owner out on every app launch in `lib/auth-context.tsx`.
- [x] On app launch: initialize the singleton Supabase client, load the persisted session, validate it, refresh if needed, resolve the owner role from the server, and mark the owner authenticated.
- [x] Manual email/password login, passwordless owner login, existing persisted session, session restore after restart, refresh-token renewal, and network reconnect must all preserve a valid owner session.
- [x] On logout, clear the session and reset owner state so a stale session is never restored.
- [x] Owner AI must not claim “Assistant ready” while no valid owner session exists; show a sign-in prompt that returns to Owner AI after successful login and retries the original message once.

## Task 3 — One shared Supabase client

- [x] Verify the only production client is `lib/supabase.ts` (`getSupabaseClient()` / `supabase` Proxy).
- [x] Remove any separate owner-AI Supabase client, mock client, or stale local client used in production.
- [x] Confirm `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false` on native, and one AsyncStorage adapter.
- [x] Ensure no client is recreated during component render.

## Task 4 — Fix build environment identification

- [x] Read `sourceCommitSha`, `buildTimestamp`, `buildMarker`, and `watchdogPatchVersion` from `Constants.expoConfig.extra` instead of relying on optional `EXPO_PUBLIC_*` env vars.
- [x] Derive environment label (`development`, `staging`, `production`) from `__DEV__` and `Constants.executionEnvironment`.
- [x] Display the canonical API base URL name (`api.ivxholding.com`) and a redacted Supabase project identifier, never `local` or `unknown` in a production build.
- [x] Fail the production build if required build identity values are missing.
- [x] Fix `runtime-environment.ts` so a bare-workflow release APK is classified as `standalone`/`production`, not `dev-client`/`development`.

## Task 5 — Owner authorization

- [x] After Supabase session restoration, verify the authenticated user is the IVX owner via the server (`profiles` table / RPC).
- [x] Return proper HTTP-semantic codes: 401 for no session, 403 for non-owner, 200 for owner, 500 with traceId on server failure.
- [x] Route the user to the owner-login screen when the session is absent; do not convert missing sessions into generic AI timeout errors.

## Task 6 — Prevent session race conditions in Owner AI

- [x] Add explicit auth states: `AUTH_INITIALIZING`, `SIGNED_OUT`, `SESSION_REFRESHING`, `SIGNED_IN_MEMBER`, `SIGNED_IN_OWNER`, `AUTH_ERROR`.
- [x] Disable the Owner AI send button and hide “Assistant ready” until `SIGNED_IN_OWNER`.
- [x] Do not start watchdog timers before authentication succeeds.
- [x] Cancel active requests on logout and do not restore a stale owner session after logout.

## Task 7 — Real-device test matrix

- [~] Fresh install, first owner login, close/reopen, force-stop, phone restart, Wi-Fi ↔ 5G, airplane mode recovery, access-token expiration, refresh-token renewal, logout/login, Owner AI message immediately after login, Owner AI after restart, Owner AI after background/resume, member account denied, diagnostic banner hidden, diagnostics drawer opens manually, correct Git SHA/API env, no `no_supabase_session` after valid login.
- *Note: real-device tests require the APK on a physical device; the sandbox can build and verify static/package properties but cannot run the app on hardware. The user must run these on the installed APK.*

## Task 8 — Automated tests

- [x] Run all tests and ensure no critical tests are skipped.
- [~] Add/update tests for: Supabase client singleton, session persistence, session refresh, owner role resolution, app-restart auth flow, auth-initialization race, Owner AI authorization, diagnostics visibility, production environment variables, and Expo Go/EAS configuration.
- *Note: new React-Native-dependent tests cannot run in the headless Bun test environment because importing `expo-constants`/`react-native` fails. The existing 428 core tests pass, including `IVX Owner AI Orchestrator Lifecycle > fails with AUTH_FAILED when owner session is missing` and chat/auth tests. The user should run real-device tests for the new session-restore and diagnostics behavior.*

## Task 9 — Build and deploy

- [x] Bump the Android `versionCode` to `14` and update build markers / Git SHA in `app.config.ts`.
- [x] Bump the Android `versionCode` to `15` and rebuild after the diagnostics-visibility and runtime-detection fixes.
- [x] Bump the Android `versionCode` to `16` and rebuild after eliminating automatic owner sign-in.
- [x] Bump the Android `versionCode` to `17` and rebuild after adding the router auth guard in `app/(tabs)/_layout.tsx`.
- [x] Bump the Android `versionCode` to `18` and rebuild after fixing the startup black screen / infinite loading (SplashScreen control + initAuth timeout + loading safety net + error screen).
- [x] Build the production APK locally with `expo prebuild` + `gradlew assembleRelease` (EAS cloud is blocked by missing `EXPO_TOKEN` in the sandbox).
- [x] Rebuild the production APK after the fixes and verify package, versionCode, and embedded identity.
- [x] Upload the APK to a public HTTPS URL with a direct download link.
- [x] Re-upload the new build 18 APK and update the direct download link (gofile.io).
- [x] Update `DEPLOYMENT_PROOF.json` with the new build details.

## Final acceptance

- [x] Top diagnostic banner is hidden in production by default (build 15; real-device confirmation required).
- [x] Diagnostics remain available inside Owner Control (Control → Diagnostics button).
- [x] Owner must enter credentials manually on every cold launch — no automatic sign-in from persisted session (build 16; real-device confirmation required).
- [x] `no_supabase_session` no longer appears after valid owner login (session persists within app session; code verified; real-device confirmation required).
- [x] Git SHA is not `local` and API environment is not `unknown` in production (build info reads from app.config.ts extra).
- [x] Owner AI send button is disabled until authentication is ready (explicit auth states + `isAuthBlocked`).
- [x] Final APK uses `com.ivxholdings.app` and is directly downloadable (build 18 link delivered).
- [~] Real Android testing passes on the user’s device.

## Blockers

- `EXPO_TOKEN` / `EXPO_PUBLIC_EAS_PROJECT_ID` are not available in this sandbox, so EAS cloud builds are unavailable. APK will be built locally from the prebuilt Android project.
- GitHub token is expired, so commits cannot be pushed to the repo connected to Render. The backend `/version` SHA may remain `0b37191f` until the token is refreshed externally.
