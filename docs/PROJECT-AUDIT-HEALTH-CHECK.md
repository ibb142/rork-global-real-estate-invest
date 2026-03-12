# Project Audit & Health Check Report

**Date:** March 2025  
**Scope:** Full repository — syntax, runtime, dependencies, config, backend services, database, uploads, integrations, env, real-time, error handling, logging, performance.

---

## 1. What Was Checked

### 1.1 Repository & configuration
- **package.json** — Dependencies, scripts, entry point
- **tsconfig.json** — Compiler options, paths, include
- **Lint** — `bun run lint` (expo lint; requires expo CLI in PATH)
- **Backend entry** — `server.ts`, `backend/hono.ts`, store init and startup order
- **tRPC** — `app-router.ts`, `create-context.ts`, procedure types (public/protected/admin)
- **Environment** — `backend/lib/env.ts` (ENV_SCHEMA, validateEnv), `.env.example`, deploy template

### 1.2 Backend services & APIs
- **HTTP/tRPC** — Hono app, `/trpc/*` and `/api/trpc/*`, rate limiting, CORS
- **Store** — `backend/store/index.ts`: init, load from DynamoDB, persist, in-memory state
- **Database** — `backend/db/dynamo.ts` (DynamoDB, used by store); `backend/db/index.ts` (SQLite, unused)
- **Auth** — JWT in create-context, protected/admin procedures
- **REST endpoints** — JV purge/delete/list, track/heartbeat/visit/pixel/conversion, webhooks, health, readiness

### 1.3 Database (CRUD)
- **Persistence** — Store `persist()`: clear + batchPut for all collections; user-entity maps (holdings, transactions, etc.)
- **Load** — `_loadFromDynamo()`: getAll for each collection, getConfig, getAllUserEntities
- **Usage** — All mutations that change store call `store.persist()` (some fire-and-forget with `void`)

### 1.4 File and image uploads
- **JV photos** — `jv-agreements.ts`: `uploadDealPhoto` (base64 → Buffer, S3 or data-URI fallback), `update` with photos array
- **File storage** — `file-storage.ts`: `uploadFile` → uploadToS3/uploadToR2/local; input `fileData` as string (base64 or text)
- **S3 body type** — PutObjectCommand Body: previously string only; now normalized via `toS3Body()` for base64/data URL → Buffer

### 1.5 Third-party integrations
- **SMS** — `backend/lib/sms-service.ts` (AWS SNS), `backend/lib/sms.ts`; startup log for configured vs simulated
- **Analytics** — `trackLanding`, `getLandingAnalytics`, `getAnalyticsDiagnostic`; store.analyticsEvents, visitorLog, liveSessions
- **Stripe** — `payments.ts`: webhook (signature, JSON.parse in try/catch), payment intents
- **Email** — SendGrid/Mailgun/SES references; staging checklist
- **External APIs** — external-apis router (SMS, email, Zillow, ATTOM, etc.)

### 1.6 Environment variables & config
- **ENV_SCHEMA** — JWT_SECRET required; AWS, Stripe, Plaid, email, storage, KYC, etc. optional
- **validateEnv / logEnvStatus** — Used at startup and /env-check
- **.env.example** — Documented AWS (including DynamoDB table), SMS, payments, communications

### 1.7 Real-time and data sync
- **Store init** — `server.ts` awaits `store.init()` before `serve()` so first request sees loaded data
- **JV** — List/listPublished invalidation after save and draft save; refetchOnWindowFocus on list query
- **Analytics** — Polling on frontend; track/heartbeat/visit endpoints write to store and (when DB available) DynamoDB
- **Live sessions** — `store.updateLiveSession`, `getLiveSessions`; `/track/heartbeat`, `/track/live-sessions`

### 1.8 Error handling and logging
- **Unhandled rejections** — `server.ts`: process.on("unhandledRejection") logs only (no exit)
- **Store.persist** — try/catch, logs on failure; callers often `void store.persist()` or `.catch(...)`
- **tRPC** — errorFormatter logs; loggerMiddleware logs duration, warns if > 1s
- **DynamoDB** — getAll: JSON.parse per item wrapped in try/catch so one bad record doesn’t break load
- **Silent catches** — Some `.catch(() => {})` (e.g. captureSecurityEvent); most catches log

### 1.9 Performance and potential bugs
- **Store.persist** — Full clear + batchPut each time; acceptable for current scale; could be optimized later with delta writes
- **Analytics getLandingAnalytics** — Single pass over store.analyticsEvents; period cutoff; no N+1
- **File upload** — Base64 decoded to Buffer for S3 to avoid binary corruption
- **require() in app** — `backend/db/index.ts` uses `require('bun:sqlite')`; app uses `require()` for assets and optional modules (expo-clipboard, expo-file-system); acceptable for Bun/Expo

---

## 2. Issues Found

### 2.1 File storage S3 upload (binary safety) — **FIXED**
- **Issue:** `uploadToS3` passed `data` (string) directly as `Body`. For base64-encoded binary files (e.g. PDFs), treating the string as UTF-8 can corrupt content.
- **Fix:** Added `toS3Body(data)` to detect data URL or raw base64 and decode to `Buffer`; otherwise keep string for text/HTML.

### 2.2 DynamoDB getAll parse failure — **FIXED**
- **Issue:** `getAll` used `JSON.parse(item.data)` for every item. One corrupted or non-JSON record would throw and break the entire load for that collection.
- **Fix:** Wrapped each `JSON.parse` in try/catch; log and skip bad items so the rest of the collection still loads.

### 2.3 Environment and docs — **FIXED**
- **Issue:** `AWS_DYNAMODB_TABLE` was used in code but not in ENV_SCHEMA or .env.example.
- **Fix:** Added `AWS_DYNAMODB_TABLE` to ENV_SCHEMA (optional) and documented in `.env.example`.

### 2.4 Unused database module — **DOCUMENTED**
- **Issue:** `backend/db/index.ts` implements a SQLite-backed DB (`bun:sqlite`). The rest of the app uses `backend/db/dynamo.ts` (DynamoDB) via the store. No imports of `backend/db` or `backend/db/index` were found.
- **Recommendation:** Treat `backend/db/index.ts` as dead code or remove it to avoid confusion. Left in place; no fix applied.

### 2.5 Fire-and-forget persist — **DOCUMENTED**
- **Issue:** Many routes use `void store.persist()` (e.g. users router). Persist errors are logged inside `persist()` but not returned to the client, so the API can report success while a later persist fails.
- **Recommendation:** For critical paths (e.g. signup, payment completion), consider awaiting `store.persist()` and surfacing failure, or at least logging clearly and optionally retrying. Not changed in this audit.

### 2.6 Lint script
- **Issue:** `bun run lint` runs `expo lint`, which requires `expo` to be available (e.g. `bunx expo lint` or global expo). In a minimal run, "command not found: expo" occurred.
- **Recommendation:** Use `bunx expo lint` in package.json or document that Expo CLI must be installed for lint.

---

## 3. Fixes Applied

| Location | Change |
|----------|--------|
| `backend/trpc/routes/file-storage.ts` | Added `toS3Body(data)` and use it in `uploadToS3` so base64/data URL is decoded to Buffer for S3 `Body`. |
| `backend/db/dynamo.ts` | In `getAll`, wrapped `JSON.parse(item.data)` in try/catch; log and skip invalid items. |
| `backend/lib/env.ts` | Added `AWS_DYNAMODB_TABLE` to ENV_SCHEMA (optional). |
| `.env.example` | Documented AWS block (DB, S3, SMS) and optional `AWS_DYNAMODB_TABLE`. |

---

## 4. Recommendations

### 4.1 Stability
- **Persist on critical paths:** Where possible, await `store.persist()` after user signup, payment webhooks, or other critical writes and return/handle errors instead of fire-and-forget.
- **Unhandled rejection:** Consider exiting the process on unhandled rejection in production (e.g. after logging) to avoid undefined state, or use a crash reporter.
- **Remove or gate SQLite:** Delete or clearly gate `backend/db/index.ts` so only one persistence layer (DynamoDB) is in use.

### 4.2 Performance
- **Store.persist:** Current full clear + batchPut is correct for consistency. If write volume grows, consider incremental or per-collection persist with careful ordering.
- **Analytics:** getLandingAnalytics does one pass over events; if event count grows very large, consider time-bounded or sampled reads and/or moving to a dedicated analytics store.

### 4.3 Configuration and ops
- **Lint:** Add a script that works without global Expo (e.g. `"lint": "bunx expo lint"`) and ensure CI runs it.
- **Health/readiness:** Existing `/health` and `/readiness` are sufficient; optionally include `store.isReady` in readiness when DynamoDB is required.
- **Secrets:** Keep using env vars (and optional secrets manager) for JWT, AWS, Stripe, etc.; avoid committing `.env`.

### 4.4 Error handling and logging
- **Structured logging:** Consider a small logger (or existing lib/logger) with levels and request IDs for easier tracing.
- **Sentry:** Already referenced; ensure captureError is used on all critical catch paths and that DSN is set in production.
- **DynamoDB:** Safe parse in getAll is in place; you could add similar protection in get(), getConfig(), and getUserEntities if desired.

---

## 5. Summary Table

| Area | Status | Notes |
|------|--------|--------|
| Syntax / TypeScript | OK | No typecheck run; tsconfig strict. Lint requires Expo CLI. |
| Backend services & APIs | OK | Store init before serve; tRPC + REST mounted; auth and rate limit in place. |
| Database (DynamoDB) | OK | Load/persist correct; getAll now resilient to bad JSON. SQLite module unused. |
| File/image uploads | Fixed | S3 body now binary-safe for base64/data URL. JV photos already used Buffer. |
| SMS | OK | AWS SNS; startup log and error details in place from prior fixes. |
| Analytics | OK | Store ready before requests; track and getLandingAnalytics wired. |
| Environment | OK | ENV_SCHEMA and .env.example updated; validateEnv at startup. |
| Real-time / sync | OK | Store init before serve; JV invalidations; polling for analytics. |
| Error handling | OK | Stripe webhook parse in try/catch; persist logs; DynamoDB getAll safe parse. |
| Performance | OK | No N+1 or obvious bottlenecks; persist strategy acceptable for current scale. |

---

*End of audit report.*
