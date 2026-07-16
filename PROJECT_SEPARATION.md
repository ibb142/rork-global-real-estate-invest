# IVX Project Separation — Owner Decision

## ACTIVE PHASE 1 — Expo / React Native
- Source: `expo/`
- Status: ACTIVE production app
- Build: `expo/android/` (Expo prebuild, `com.ivxholdings.app`)
- Deploy: Render / EAS / APK from `expo/`

## ACTIVE PHASE 1 — Backend
- Source: `backend/`
- Status: ACTIVE production backend
- Deploy: Render at `https://api.ivxholding.com`

## PRESERVED PHASE 2 — Kotlin Native
- Source: `android-ivx-holdings/`
- Status: INACTIVE, PRESERVED for future native app after Expo Phase 1 is verified
- Build: NOT run now
- Deploy: NOT connected to Render / EAS / Expo
- Package: `com.rork.ivxholdings` (separate from Expo package `com.ivxholdings.app`)
- Do not modify, delete, or build until owner explicitly authorizes Phase 2.

## Owner Authorization Required
No Kotlin Phase 2 work until the owner explicitly authorizes it after Expo Phase 1 is fully completed and verified.
