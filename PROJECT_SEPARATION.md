# IVX Project Separation — Owner Decision (Final)

## ACTIVE PHASE 1 — Expo / React Native
- Source: `expo/`
- Status: ACTIVE production app
- Framework: React Native (Expo SDK 54)
- Build: `expo/android/` (Expo prebuild, `com.ivxholdings.app`)
- Deploy: Render / EAS / APK from `expo/`
- Version: 1.4.5, versionCode 36
- Rork app path: `expo` (registered in `rork.json`)

## ACTIVE PHASE 1 — Backend
- Source: `backend/`
- Status: ACTIVE production backend
- Deploy: Render at `https://api.ivxholding.com`
- Live endpoints:
  - `GET /health` → 200
  - `GET /api/ivx/video-platform/home-feed` → 200 (mixed feed, 3 deals + 1 video)
  - `GET /api/ivx/videos/feed` → 200 (video reel feed)

## PRESERVED PHASE 2 — Kotlin Native
- Source: `android-ivx-holdings/`
- Status: INACTIVE, PRESERVED for future native app after Expo Phase 1 is verified
- Build: NOT run now
- Deploy: NOT connected to Render / EAS / Expo / CI
- Package: `com.rork.ivxholdings` (separate from Expo package `com.ivxholdings.app`)
- Rork app path: `android-ivx-holdings` (registered but excluded from current build)
- Do not modify, delete, or build until owner explicitly authorizes Phase 2.

## Exclusion Verification
Kotlin is excluded from:
- Expo builds: YES (separate directory, separate package)
- EAS: YES (EAS config in expo/ only)
- package scripts: YES (expo/package.json has no Kotlin references)
- CI/CD: YES (no shared pipeline)
- Render: YES (backend deploy is backend/ only)
- Current APK: YES (APK builds from expo/)
- Expo routing: YES (expo-router in expo/app/ only)
- Current production deployments: YES

## Owner Authorization Required
No Kotlin Phase 2 work until the owner explicitly authorizes it after Expo Phase 1 is fully completed and verified.
