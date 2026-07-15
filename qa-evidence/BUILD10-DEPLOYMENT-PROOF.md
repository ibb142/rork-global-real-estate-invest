# IVX Holdings Build 10 — AI Watchdog Timeout Fix Deployment Proof

**Generated:** 2026-07-14T22:20:00Z UTC
**Status:** Client fix deployed in build artifact; backend verified live; pending owner device install.

## 1. Production Backend Verified (Live)

| Endpoint | URL | Status | Response Time | Evidence |
|---|---|---|---|---|
| Health | `https://api.ivxholding.com/health` | HTTP 200 | 147ms | ok=true, healthy, 77 routes, aiEnabled=true |
| Version | `https://api.ivxholding.com/version` | HTTP 200 | 60ms | commit=d4cbfc2e, deploymentMarker=ivx-owner-ai-hono-autodeploy-live |
| Readiness | `https://api.ivxholding.com/readiness` | HTTP 200 | 154ms | ready=true, status=ok |
| AI Proxy | `https://api.ivxholding.com/api/ivx/owner-ai/proxy-status` | HTTP 200 | 752ms | proxyOwnedBy=ivx_backend, model=openai/gpt-4o, endpointConfigured=true, runtimeV2 active |

## 2. Client Fix Verified in Build 10 APK

Extracted `assets/index.android.bundle` from `ivx-holdings-v1.4.3-build10.apk` and verified every patched checkpoint string is present.

| Root Cause | Fix String | Occurrences in Bundle |
|---|---|---|
| `ai_only` branch missing sync checkpoint | `ai_only branch invoking assistantReplyMutation` | 1 |
| `send_and_ai` branch missing sync checkpoint | `send_and_ai branch invoking assistantReplyMutation` | 1 |
| `localFirstChatMode` branch missing sync checkpoint | `local_first branch invoking assistantReplyMutation` | 1 |
| Knowledge command missing sync checkpoint | `owner_command knowledge invoking assistantReplyMutation` | 1 |
| Defensive guard inside mutationFn | `AI_MUTATION_STARTED` | 1 |
| Senior dev confirm branch never completed | `branch=senior_developer_confirm` | 1 |
| Senior dev build branch never completed | `branch=senior_developer_build` | 1 |
| Local first send-only branch never completed | `branch=local_first_send_only` | 1 |
| Owner command elevated confirmation never completed | `branch=owner_command_elevated_confirmation` | 1 |
| Elevated confirmation branch never completed | `branch=elevated_confirmation class` | 1 |
| Send-only branch never completed | `branch=send_only_no_ai` | 1 |

## 3. Final Artifacts

| Artifact | File | Version | SHA-256 | Build Date |
|---|---|---|---|---|
| Android APK | `ivx-holdings-v1.4.3-build10.apk` | 1.4.3 (versionCode 10) | `e0547d9af2401982e5a663b82798d29cc6ba69eeac50b34cd0c4a4c5fa3555b3` | 2026-07-14T22:02:00Z |
| Android AAB | `ivx-holdings-v1.4.3-build10.aab` | 1.4.3 (versionCode 10) | `6f93707a8e444f017285803cb2432483cab8b8cd4129fa5d467b25480c4191a1` | 2026-07-14T22:02:00Z |

## 4. Root Causes Fixed (6 verified)

1. `send_and_ai` branch did not pass `AI_MUTATION_STARTED` synchronously before async mutation.
2. `send_and_ai` used `void triggerAIWithRetry()` (fire-and-forget) instead of `await`.
3. `ai_only` branch did not pass `AI_MUTATION_STARTED` synchronously.
4. `localFirstChatMode` branch did not pass `AI_MUTATION_STARTED` synchronously.
5. Owner command `knowledge` did not pass `AI_MUTATION_STARTED` synchronously.
6. Non-AI branches passed `AI_TRIGGER_DECISION` but never called `watchdogTrace.complete('SUCCESS')`, causing the watchdog to still wait for `AI_MUTATION_STARTED`.

## 5. Next Step

Install `ivx-holdings-v1.4.3-build10.apk` on the Android device and re-test AI chat. The red `IVX AI BLOCKED — TIMEOUT` banner should no longer appear because the watchdog trace is now advanced correctly in every branch.
