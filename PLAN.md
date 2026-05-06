# IVX access-control audit and remediation

**Live Render end-to-end audit/update — 2026-05-06**
- [x] Loaded secure deploy environment through the Expo runtime loader without printing secrets; Render and GitHub deploy variables were available there and `secretValuesReturned=false`.
- [x] Audited Render services by API: backend `ivx-holdings-platform` is service `srv-d7t9ivreo5us73ftose0`; frontend `ivx-holdings-chat-frontend` is service `srv-d7t9j00sfn5c738a18j0`.
- [x] Fixed production source/deploy drift by syncing the required backend route set and deploy files to the Render-connected GitHub branch, including `/tool/*`, developer-deploy, variables-tool, control-room status, lockfile, Dockerfile, and `render.yaml`; no secret values were returned.
- [x] Replaced the backend Docker build with an API-only image so the backend service no longer rebuilds the separate Expo static frontend bundle.
- [x] Patched the live backend Render service to Docker runtime settings with `dockerfilePath=./Dockerfile`, `dockerContext=.`, `dockerCommand=node /app/node_modules/tsx/dist/cli.mjs /app/server.ts`, and `healthCheckPath=/health`; no secret values were returned.
- [x] Cleared stale Render deploys and redeployed the backend; Render deploy `dep-d7tj905iq8ic738j2to0` reached `live` for commit `272c858abe65` at `2026-05-06T12:32:55Z`.
- [x] Pushed available backend credentials from the secure Expo runtime loader into the correct Render backend service `srv-d7t9ivreo5us73ftose0`; accepted names included GitHub, Render, Supabase, AWS/S3/CloudFront, AI Gateway, JWT, generated `APP_SECRET`, and frontend-safe public env names. `secretValuesReturned=false`.
- [x] Pushed available frontend public variables into Render static service `srv-d7t9j00sfn5c738a18j0`; accepted names included Supabase public URL/anon key, project/team ids, Google Ads public key, and Rork/toolkit public URLs. `secretValuesReturned=false`.
- [x] Fixed the malformed loaded `RENDER_SERVICE_ID` handoff by resolving the correct backend service id from the Render API by service name before saving variables; no secret values were returned.
- [x] Redeployed after credential transfer: backend deploy `dep-d7tlerjrjlhs73b248cg` reached `live` at `2026-05-06T15:02:29Z`; frontend deploy `dep-d7tld40sfn5c73colmr0` reached `live` at `2026-05-06T14:58:45Z`.
- [x] Fixed the frontend static-site deployment; `https://chat.ivxholding.com` now returns HTTP `200` HTML.
- [x] Confirmed deployment marker changed from the old `ivx-owner-ai-hono-2026-04-20t00000z` / `ivx-owner-ai-hono-2026-04-20t0000z` family to `ivx-owner-ai-hono-2026-05-06t1200z`.
- [x] Verified production backend liveness at `2026-05-06T12:34:10Z`: `https://api.ivxholding.com/health` returns HTTP `200` JSON with deployment marker `ivx-owner-ai-hono-2026-05-06t1200z`.
- [x] Verified required production proof routes at `2026-05-06T12:34:10Z`: `/tool/render-status`, `/tool/github-status`, `/tool/supabase-status`, and `/tool/aws-status` all return HTTP `200` JSON with deployment marker `ivx-owner-ai-hono-2026-05-06t1200z`.
- [x] Verified Render/GitHub/Supabase/AWS live proof route behavior without printing secrets: GitHub, Supabase, and AWS proof routes report `verified`; Render proof route is live and authorized while still reporting missing optional/remaining env names `MINIO_PASSWORD` and `STRIPE_API_KEY` by name only.
- [x] Re-verified production after credential redeploy at `2026-05-06T15:02Z`: `https://api.ivxholding.com/health`, `/tool/render-status`, `/tool/github-status`, `/tool/supabase-status`, `/tool/aws-status`, and `https://chat.ivxholding.com/` all return HTTP `200`; backend marker remains `ivx-owner-ai-hono-2026-05-06t1200z`.
- [x] Deployment goal complete: backend `/tool/*` routes work in production, available credentials are deployed into Render by name/status proof, and `https://chat.ivxholding.com` is live.

**Current secure deploy proof pass — 2026-05-05**
- [x] Re-audited and clarified pre-live vs production-live access: IVX Owner AI does not need public production/custom domains live to receive full developer/deploy access; it needs a reachable backend runtime with backend-only credentials loaded there.
- [x] Added safe status fields to developer/deploy proof: `preLiveAccessSupported`, `productionLiveRequiredForAccess`, `productionLiveRequiredForPublicProof`, `currentRuntimeCanExecuteCoreOwnerApprovedActions`, and `accessBeforeLive`.
- [x] Re-audited the existing full developer/deploy control path: `backend/api/ivx-developer-deploy-control.ts`, `backend/hono.ts`, `render.yaml`, `ENVIRONMENT_VARIABLES.md`, and `IVX_AI_BRAIN_TOOLS.md`.
- [x] Confirmed the code already supports owner-approved GitHub writes, Render deploy/restart/env updates, and Supabase SQL/schema actions; all write/deploy actions require exact confirmation text and never return secret values.
- [x] Confirmed no plaintext credential inbox/folder was created and no credentials were shared with third parties; the safe path remains backend-only environment variables in Render/secure host storage.
- [x] After the owner reported environment variables were set, re-ran credential-presence proof from the current deploy-execution shell using env names only and `secretValuesReturned=false`; `GITHUB_TOKEN`, `GITHUB_REPO_URL`, `RENDER_API_KEY`, `RENDER_SERVICE_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` still resolve as unavailable in this shell.
- [x] Re-ran the project env loader proof; it loaded `0` local env files and still returned the requested credential names as unavailable in the current shell, without printing any secret values.
- [x] Confirmed a new Render deploy cannot be triggered from this shell because `RENDER_API_KEY` and `RENDER_SERVICE_ID` are not available to the runtime environment.
- [x] Re-tested Render public hostname with `curl --http1.1 -k https://ivx-holdings-platform.onrender.com/health`; result is still HTTP `404` with `x-render-routing: no-server`.
- [x] Re-tested `https://api.ivxholding.com/health` and `https://chat.ivxholding.com/`; both still fail TLS handshake before backend routes respond.
- [x] Fetched managed backend logs for the current Rork backend domain; no backend logs were returned for this Render/custom-domain blocker.
- [x] Added the missing Render Blueprint resource definitions for the referenced private service `minio` and Render Postgres database `mydatabase`, so the provided `MINIO_HOST` and `DATABASE_URL` bindings now point to declared resources instead of undefined Blueprint names.
- [x] Revalidated after the Blueprint resource patch with Rork `runChecks` for `expo`; checks passed.
- [x] Re-tested production/public endpoints after the Blueprint resource patch: `ivx-holdings-platform.onrender.com/health` and `ivx-holdings-chat-frontend.onrender.com/` still return Render `404` with `x-render-routing: no-server`; `api.ivxholding.com/health` and `chat.ivxholding.com/` still fail TLS handshake before application routes respond.
- [x] Applied the latest provided Render env var bindings safely to `render.yaml`: `API_BASE_URL=https://api.ivxholding.com`, generated `APP_SECRET`, manual `STRIPE_API_KEY`, `DATABASE_URL` from `mydatabase`, `MINIO_PASSWORD` from private service env `MINIO_ROOT_PASSWORD`, and backend `fromGroup: my-env-group`; no secret values were written.
- [x] Updated `ENVIRONMENT_VARIABLES.md` and `README_IVX_DEPLOYMENT.md` to document the new Blueprint env bindings and manual Render requirements.
- [x] Revalidated after the latest Blueprint env binding patch with Rork `runChecks` for `expo`; checks passed.
- [x] Re-tested production/public endpoints after the latest env binding patch: `ivx-holdings-platform.onrender.com/health` and `ivx-holdings-chat-frontend.onrender.com/` still return HTTP `404`; `api.ivxholding.com/health` and `chat.ivxholding.com/` still fail TLS handshake before application routes respond.
- [x] Added a top-level Blueprint `envVarGroups` declaration for `my-env-group` with non-secret runtime markers, so the backend `fromGroup: my-env-group` reference can be created/synced by Render instead of referencing an undefined group.
- [x] Added safe production proof endpoints for `GET /tool/render-status`, `GET /tool/supabase-status`, `GET /api/tool/render-status`, and `GET /api/tool/supabase-status`; these return credential names/status only and never return secret values.
- [x] Expanded developer-deploy status proof to include the full requested production access list by name only: GitHub, Render, Supabase DB/service role, AWS/S3/CloudFront, AI Gateway, Stripe, and generated app secret readiness.
- [x] Added the full production credential handoff checklist into the Owner AI chat control room, including future credential intake proof through the guarded Render env-var action; no secret values are returned.
- [x] Revalidated after the final credential/status proof patch with root `bun install && bunx tsc --noEmit --pretty false` and Rork `runChecks` for `expo`; checks passed.
- [x] Re-tested deploy-execution shell secret availability by name only; `RENDER_API_KEY` and `RENDER_SERVICE_ID` are still not available in this shell, so Render API deploy/Blueprint sync cannot be executed from here without those runtime vars.
- [x] Re-tested production/public endpoints after the final patch: custom domains still fail TLS before app routes respond, and both Render default hostnames still return HTTP `404` with `x-render-routing: no-server`.
- [x] Added optional Cloudflare Worker Render origin router at `deploy/cloudflare/ivx-render-origin-worker.js` plus `deploy/cloudflare/wrangler.toml` to route `api.ivxholding.com/*` to `ivx-holdings-platform.onrender.com` and `chat.ivxholding.com/*` to `ivx-holdings-chat-frontend.onrender.com` without storing secrets; this can bridge Cloudflare TLS/custom-domain routing but cannot activate a missing Render service.
- [x] Added `renderSubdomainPolicy: disabled` to the Render Blueprint for both backend and frontend services, matching the owner-provided Render API PATCH intent once custom domains are attached/verified.
- [x] Added guarded owner-approved `render_update_subdomain_policy` support through `POST /api/ivx/developer-deploy/action`, calling Render Update Service with `serviceDetails.renderSubdomainPolicy` and requiring `CONFIRM_IVX_RENDER_SERVICE_UPDATE`; secret values are never returned.
- [x] Re-tested deploy-execution shell secret availability by name only during the Render subdomain-policy pass; `RENDER_API_KEY=false` and `RENDER_SERVICE_ID=false`, so the live Render PATCH could not be executed from this shell.
- [x] Re-tested live endpoints after the Render subdomain-policy pass: `api.ivxholding.com/health` and `chat.ivxholding.com/` still fail TLS handshake; Render default hostnames still return HTTP `404` with `x-render-routing: no-server`.
- [x] Added the secure IVX AI variable/request file `backend/config/ivx-credential-request-manifest.ts`; it registers current and future credential names, public-vs-secret classification, Render target, placeholders, and guarded intake metadata only. No secret values are stored or returned.
- [x] Wired `credential_request_manifest` into IVX AI Brain tools and Owner AI chat routing, and embedded the manifest snapshot into `environment_checklist` and developer-deploy status proof.
- [x] Local proof completed without printing secrets: `credential_request_manifest` returned HTTP 200, `secretValuesReturned=false`, `secureCredentialIntakeEnabled=true`, `futureCredentialAction=render_upsert_env_var`, `ownerConfirmationRequired=CONFIRM_IVX_RENDER_SERVICE_UPDATE`, and 25 credential names registered by name only.
- [x] Revalidated after the secure variable/request file patch with root `bun install`, root `bunx tsc --noEmit --pretty false`, local owner-only AI Brain tool proof, and Rork `runChecks` for `expo`; checks passed.
- [x] Added final no-ambiguity access proof fields to developer-deploy status and AI Brain status: `renderLiveBlocksIVXAccess=false`, `currentRuntimeCredentialLoadingRequired=true`, `currentAccessBlocker`, and `accessProofStatement`, proving Render public live/routing does not block IVX AI developer access.
- [x] Added owner-only secure `Variables / Credentials Tool` backend routes: `GET /api/ivx/variables-tool/status` and `POST /api/ivx/variables-tool/save`.
- [x] Added secure Render Environment variable upsert support for `GITHUB_TOKEN`, `RENDER_API_KEY`, `RENDER_SERVICE_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `DATABASE_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`, `CLOUDFRONT_DISTRIBUTION_ID`, `AI_GATEWAY_API_KEY`, `STRIPE_API_KEY`, `APP_SECRET`, and `JWT_SECRET` without returning secret values.
- [x] Added final proof status output showing only variable name present true/false, backend runtime can access true/false, tool authorized true/false, production live true/false, and provider connection booleans.
- [x] Added IVX Owner AI app page `/ivx/variables` with masked credential inputs, owner-only status proof, secure save action, and optional backend redeploy trigger after saving Render env vars.
- [x] Re-checked current shell for live Render API execution after the owner-provided Render API response shape; `RENDER_API_KEY=false` and `RENDER_SERVICE_ID=false`, so the live `PATCH /v1/services/{service-id}` call cannot be executed from this shell without secure credential input.
- [x] Re-tested production endpoints in the same pass: `ivx-holdings-platform.onrender.com/health` and `ivx-holdings-chat-frontend.onrender.com/` still return HTTP `404` with `x-render-routing: no-server`; `api.ivxholding.com/health` and `chat.ivxholding.com/` still fail TLS handshake before app routes respond.
- [x] Live Render API access is now available through the secure Expo env loader in this execution environment; Render service settings were patched and backend deploys were triggered without returning secret values.
- [x] Production source drift is resolved: backend production now serves the current route set, including `/tool/*`, `/api/ivx/developer-deploy/status`, and `/api/ivx/variables-tool/status`; `/tool/render-status`, `/tool/supabase-status`, `/tool/github-status`, and `/tool/aws-status` return HTTP `200` JSON from the new deployment marker.

**Secure production credential deployment setup**
- [x] Replaced root `.env.example` with a names-only checklist containing no secret values.
- [x] Kept production secrets out of frontend code, source files, and chat.
- [x] Validation passed after the safe environment checklist update with Rork `runChecks` for `expo`.
- [x] Added `.env.example` names-only coverage for the secure credential request manifest names, including frontend-safe public variables, backend-only secrets, Render, Supabase, GitHub, AWS, storage, and Stripe names; no secret values were written.
- [x] Added `credential_request_manifest` documentation to `ENVIRONMENT_VARIABLES.md` and `IVX_AI_BRAIN_TOOLS.md`, including the owner-only proof request and safe future credential intake flow.
- [x] Added in-app secure credential intake through `/ivx/variables`, storing/updating values only via the owner-only backend route into Render Environment; UI/API responses never expose secret values.
- [x] Production validation is live for this deployment pass: backend `/health`, `/tool/render-status`, `/tool/github-status`, `/tool/supabase-status`, `/tool/aws-status`, and frontend `https://chat.ivxholding.com` return HTTP `200`; remaining missing optional env names are reported safely by name only.

**IVX Owner AI full developer/deploy control**
- [x] Audited existing owner-control surface and confirmed the missing gap was a single owner-approved route for GitHub write actions, Render deploy/service/env actions, and Supabase schema migrations.
- [x] Added owner-only `GET /api/ivx/developer-deploy/status` and `POST /api/ivx/developer-deploy/action` in `backend/api/ivx-developer-deploy-control.ts`.
- [x] Added guarded GitHub actions: `github_commit_file`, `github_create_pull_request`, and `github_dispatch_workflow`, requiring backend-only `GITHUB_TOKEN` and `CONFIRM_IVX_GITHUB_WRITE`.
- [x] Added guarded Render actions: `render_trigger_deploy`, `render_restart_service`, `render_upsert_env_var`, and `render_update_subdomain_policy`, requiring backend-only `RENDER_API_KEY`, `RENDER_SERVICE_ID`, and Render-specific confirmation text.
- [x] Added guarded Supabase SQL/schema action: `supabase_execute_sql`, requiring backend-only `SUPABASE_DB_URL`/`DATABASE_URL`/`POSTGRES_URL` and `CONFIRM_IVX_SUPABASE_MIGRATION`.
- [x] Kept existing Supabase row write/delete route intact with `CONFIRM_OWNER_SUPABASE_WRITE` and `CONFIRM_OWNER_SUPABASE_DELETE`.
- [x] Wired developer deploy status into Hono health routes, AI Brain `developer_deploy_control_status`, control-room status, setup export, readiness matrix, fix queue, and verification tests.
- [x] Updated `render.yaml`, `.env.example`, `ENVIRONMENT_VARIABLES.md`, and `IVX_AI_BRAIN_TOOLS.md` with required env names only; no secret values were written.
- [x] Added safe proof fields for the exact requested credentials (`GITHUB_TOKEN`, `RENDER_API_KEY`, `RENDER_SERVICE_ID`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `DATABASE_URL`, `POSTGRES_URL`) to developer deploy status and AI Brain status; values are never returned.
- [x] Expanded safe proof fields to cover the owner’s full handoff list: `SUPABASE_DB_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`, `CLOUDFRONT_DISTRIBUTION_ID`, `AI_GATEWAY_API_KEY`, `STRIPE_API_KEY`, and `APP_SECRET` by name/status only.
- [x] Added AI Brain `credential_request_manifest` so IVX AI can request future credential names/metadata with the same secure-intake pattern, while actual secret values stay in backend/Render environment storage only.
- [x] Validation passed for this pass: `bun install`, root `bunx tsc --noEmit --pretty false`, local credential manifest tool proof, and Rork `runChecks` for `expo`.

**Local/dev IVX Owner AI capability extension (production proof intentionally deferred)**
- [x] Extended `executeTool(command)` with local/dev commands: `/create-record`, `/update-record`, `/delete-record`, `/run-query`, `/upload-file`, and `/read-file`.
- [x] Added local/dev in-memory record store operations with affected-row proof and command-log persistence.
- [x] Added local/dev file upload/read tools backed by `logs/audit/ivx-local-dev-files`, with sensitive path blocking for read operations.
- [x] Improved local/dev knowledge indexing with multi-document support, sentence-aware overlapping chunks, keyword/exact/title/source ranking, retrieved chunk proof, and `source_id` answers.
- [x] Expanded code-aware local/dev inspection to scan deeper project tree, summarize architecture, read `server.ts`, explain `startServer`, and return heuristic bug-risk findings.
- [x] Added local/dev error tracking to `logs/audit/ivx-local-dev-errors.jsonl` plus `/run-query` access to `command_history`, `error_history`, and `logging_summary`.
- [x] Validation passed for this extension pass: `bun install`, root `bunx tsc --noEmit --pretty false`, local `/health` HTTP 200, local `/tool` proof for create/update/delete/query/upload/read/knowledge/logging/error-history, code-aware proof, and Rork `runChecks` for `expo`.

**Local/dev IVX Owner AI implementation completion (production proof intentionally deferred)**
- [x] Added local/dev owner tool mode guarded by `Authorization: Bearer dev-open-access-token` and disabled only when `NODE_ENV=production` or `IVX_LOCAL_DEV_TOOLS=0/false/off`.
- [x] Added `/tool` and `/api/tool` aliases for the real `executeTool(command)` route, alongside `/api/ivx/owner-ai/tools`.
- [x] Expanded direct command routing to support `/time-now`, `/room-status`, `/supabase-tables`, `/storage-diagnostics`, `/knowledge-reindex`, and `/inbox-diagnostics` locally.
- [x] Added local/dev command log persistence to `logs/audit/ivx-local-dev-command-logs.jsonl`, returning non-null `command_log_id` for every local tool command.
- [x] Added local/dev storage diagnostics using filesystem upload/read metadata/delete proof when Supabase storage is not connected.
- [x] Added local/dev knowledge reindex pipeline with document insert, chunk creation, chunk retrieval, assistant answer, and `source_id` proof in memory.
- [x] Added local/dev inbox diagnostics proving unread increment and explicit read reset without `ensureInboxState` zeroing existing unread counts.
- [x] Added local/dev code-aware support using repo tree traversal, `server.ts` source read, and `startServer` function explanation.
- [x] Added checked-in SQL schema fallback for Supabase table inspection so `/supabase-tables` returns table names, columns, and RLS metadata in local/dev when live DB env is absent.
- [x] Verified local/dev proof on `PORT=3148 IVX_LOCAL_DEV_TOOLS=1 bun server.ts`: `/health` HTTP 200, `/time-now` HTTP 200, `/room-status` HTTP 200, `/supabase-tables` HTTP 200 with 83 tables, `/storage-diagnostics` HTTP 200, `/knowledge-reindex` HTTP 200 with source id, `/inbox-diagnostics` HTTP 200 with unread increment, code-aware tool HTTP 200 with `server.ts` source/function proof, missing token blocked with 401, owner token succeeded.
- [x] Production validation remains intentionally deferred by current work order; do not mark production Render/TLS/Supabase-live/AWS-live proof complete from local/dev code proof.

**Runtime blocker: zod/v4 backend startup**
- [x] Confirmed project source does not import `zod/v4`; root backend dependency `ai@6.0.168` requires Zod v4 as a peer/runtime dependency.
- [x] Added root dependency `zod@^4.4.2` and refreshed `bun.lock` with `bun add zod && bun install`.
- [x] Verified `await import('ai')` succeeds and exposes `generateText`, proving the `Cannot find module 'zod/v4'` crash is fixed locally.
- [x] Verified local Bun backend start: `GET http://127.0.0.1:3117/health` returned HTTP 200 JSON.
- [x] Verified production-equivalent Node/tsx backend start: `NODE_ENV=production node ./node_modules/tsx/dist/cli.mjs server.ts` returned HTTP 200 JSON on `/health`.
- [x] Verified direct tool endpoint locally: `/time-now` returned HTTP 200 JSON with server timestamp proof.
- [x] Production Render backend service is now active: `https://ivx-holdings-platform.onrender.com/health` and `https://api.ivxholding.com/health` return HTTP `200` JSON with valid TLS from this shell.
- [x] Production backend route-table blocker is resolved: Render now serves the current `/tool/*`, developer-deploy, and variables-tool route set from the connected Git branch and live backend deploy.
- [x] Local/dev workaround completed: with `IVX_LOCAL_DEV_TOOLS=1`, `/room-status`, `/supabase-tables`, and `/storage-diagnostics` return local/dev JSON proof without requiring live Supabase env.
- [ ] Remaining blocker for production/live proof only: production/live Supabase env vars must still be configured before marking hosted Supabase commands live PASS.

**IVX Owner AI access-test failure remediation pass**
- [x] Added persisted owner backend command execution for `/room-status`, `/supabase-tables`, `/storage-diagnostics`, `/knowledge-reindex`, and `/inbox-diagnostics` with `command_log_id`, backend result JSON, and success/fail status.
- [x] Added SQL migration for `ivx_command_logs`, `ivx_knowledge_chunks`, `ivx_access_test_rows`, knowledge chunk indexes, request-id uniqueness, and explicit `ivx-owner-files` storage policies.
- [x] Changed Supabase table inspection to use a direct `information_schema.tables` read query before fallbacks.
- [x] Fixed inbox sync so `ensureInboxState` no longer resets unread counts to zero except through an explicit mark-read action.
- [x] Added runtime code-aware proof from local repo tree + `server.ts` source read + `startServer` function explanation when GitHub env is unavailable.
- [x] Validation passed: root TypeScript, Expo TypeScript, Expo lint, and Rork `runChecks` for `expo`.
- [x] Live production backend endpoint now returns HTTP `200` from this shell at `https://api.ivxholding.com/health`; TLS and Render activation are proven for backend liveness.
- [x] Live Supabase/AWS route reachability proof is now PASS for this deployment pass: `/tool/supabase-status` and `/tool/aws-status` return HTTP `200` from production with the new deployment marker.

**Expo Go end-to-end startup audit**
- [x] Reproduced local toolchain readiness by installing Expo workspace dependencies with `bun install`.
- [x] Verified TypeScript with `bunx tsc --noEmit --pretty false`.
- [x] Verified Android Metro/Hermes export with `bunx expo export --platform android --clear`.
- [x] Verified lint with `bun run lint`.
- [x] Verified Expo public config reports SDK `54.0.0`, matching Expo Go supported SDK 54 from the attached screenshot.
- [x] Removed `runtimeVersion` from `expo/app.config.ts` for Expo Go because the attached crash is Expo Go failing before JS while trying to download a remote update; public config now exposes SDK `54.0.0` without remote-update runtime targeting.
- [x] Explicitly disabled Expo updates in `expo/app.config.ts`; public Expo Go config now has `updates.enabled=false`, no `updates.url`, no `runtimeVersion`, no branch/channel headers, and no OTA startup path, so Expo Go should load the local Metro bundle.
- [x] Fixed web emulator static-render startup by preventing analytics auto-initialization when Expo Router renders without `window`.
- [x] Verified web export with `bunx expo export --platform web` after the analytics runtime guard.
- [x] Checked unsupported native module usage: `expo-device` and `expo-local-authentication` are guarded with runtime `require` fallbacks; no direct `expo-location` import usage remains.
- [x] Fixed Expo Go cold-start routing by setting Expo Router `initialRouteName` to `landing` and guarding unauthenticated `(tabs)` startup so Expo Go does not open the protected tab tree first.
- [x] Updated startup marker to `expo-go-latest-2026-04-28-expo-go-startup-route-guard`.
- [x] Removed remaining Expo Router `origin` entry pointing at `https://chat.ivxholding.com/` from `expo/app.config.ts`.
- [x] Restarted Metro with cleared cache and verified local bundle serving on `http://localhost:8082` with Android/iOS entry bundles returning HTTP 200.
- [x] Removed the stale EAS `updates.url` example from `expo/docs/DEVELOPER-SETUP-GUIDE.md` and replaced it with local-development-safe `updates.enabled=false` config.
- [x] Fixed the earlier Expo Go Portfolio render crash by mounting `WalletProvider` and `EarnProvider` around the app navigator in `expo/app/_layout.tsx`; no IVX AI chat, API, backend, prompt, or portfolio business-logic files were changed.
- [x] Verified the earlier post-fix Android Expo Router/Metro entry bundle returns HTTP 200 locally (`36241003` bytes) and `runChecks` passed for the Expo app.
- [x] Fixed the latest attached Expo Go Portfolio render crash (`Cannot read property 'available' of undefined`) with a targeted null-safe Portfolio context read in `expo/app/(tabs)/portfolio.tsx`; no IVX AI chat, API, backend, prompt, auth, investment flow, or styling files were changed.
- [x] Verified the latest fix with Expo TypeScript, Expo lint, Rork checks, Expo dependency alignment, Android export, web export, and local Metro HTTP 200 bundle proof for Android/iOS/web entry bundles.


**IVX Owner AI full Supabase owner/admin actions**
- [x] Added owner-only backend write route `POST /api/ivx/supabase/owner-action` guarded by the existing IVX owner session/auth path.
- [x] Added guarded write tools for create/insert, update, delete, and owner-approved actions using backend-only Supabase service-role auth.
- [x] Kept service-role keys backend-only and never returned secrets in responses.
- [x] Added destructive-action confirmation gate for deletes requiring `confirm=true` and `confirmText="CONFIRM_OWNER_SUPABASE_DELETE"`.
- [x] Added owner action audit logging to server logs and best-effort `public.audit_trail` insertion.
- [x] Kept read-only inspection tools and routes intact: `list_supabase_tables`, `inspect_supabase_schema`, `list_supabase_columns`, and `inspect_supabase_rls`.
- [x] Registered Owner AI chat routing for Supabase owner write/action requests so the Owner AI room advertises the guarded owner-action path instead of generic chat.
- [x] Fixed Owner AI mutation routing so create/insert/update/delete prompts bypass the audit-report fallback and reserve audit-report routing for audit/report prompts only.
- [x] Registered the owner action route in Hono health route list and route table.
- [x] Validation passed: root `bunx tsc --noEmit --pretty false`.
- [x] Live proof completed for safe `public.audit_trail` insert/read-back using owner-approved payload `{ event: "ivx_owner_proof", source: "owner_ai", status: "test_ok" }`; proof saved at `logs/deploy/ivx-owner-audit-trail-proof-2026-04-28T06-49-28-871Z.json` and `.md`.

**IVX Owner AI grounding repair**
- [x] Added live grounding context to `backend/api/ivx-owner-ai.ts` using server runtime time at request handling time.
- [x] Routed current-time prompts to `ivx_live_runtime_time` before stale context, audit-report, or generic chat paths.
- [x] Routed current IVX project/system state prompts to `ivx_live_project_state` with live backend/model/endpoint/tool-routing state.
- [x] Added grounding rules to ignore stale screenshots, old file lists, uploaded-file context, stale memory, and old proof artifacts unless explicitly requested.
- [x] Added fallback rule to say what live state is unavailable instead of guessing.
- [x] Validation passed: root `bunx tsc --noEmit --pretty false`.
- [x] Live deployed chat proof is no longer blocked by frontend 404 or backend route drift: `https://chat.ivxholding.com/` returns HTTP `200` HTML and backend proof routes return HTTP `200` JSON with the current deployment marker.

**Production domain/TLS reachability repair**
- [x] Verified `api.ivxholding.com` and `chat.ivxholding.com` currently resolve to `108.132.7.57` with no CNAME to the active Render backend.
- [x] Verified HTTPS to `api.ivxholding.com/health` and `chat.ivxholding.com` fails at TLS before backend routes can respond.
- [x] Initially patched `render.yaml` to declare `api.ivxholding.com` and `chat.ivxholding.com` as Render custom domains for the backend service, then re-audited and corrected the architecture to split API and chat onto separate Render services.
- [x] Patched production API environment URLs in `render.yaml` to use `https://api.ivxholding.com`.
- [x] Replaced Route53 `api.ivxholding.com` and `chat.ivxholding.com` dead `A 108.132.7.57` records with CNAME records to `ivx-holdings-platform.onrender.com`.
- [x] Added `render.yaml` to the connected GitHub repo so Render Blueprint/custom-domain deployment can discover the backend service config.
- [x] Confirmed DNS now resolves `api.ivxholding.com`, `chat.ivxholding.com`, and `ivx-holdings-platform.onrender.com` to Render edge IPs `216.24.57.251` and `216.24.57.7`.
- [x] Confirmed Render hostname is still inactive: `https://ivx-holdings-platform.onrender.com/health` returns Render `404` with `x-render-routing: no-server`.
- [x] Confirmed `https://api.ivxholding.com/health` still fails TLS handshake before reaching the backend.
- [x] Patched `render.yaml` to explicitly pin the main branch and valid `autoDeployTrigger: commit` for Render Blueprint activation.
- [x] Backend Render service/custom-domain activation is complete: `ivx-holdings-platform.onrender.com/health` and `https://api.ivxholding.com/health` now return HTTP `200` JSON.
- [x] Triggered latest Render deploy hook successfully for service `srv-d7plsnvavr4c73esj53g`; Render returned deploy id `dep-d7rvenjrjlhs738127u0` with HTTP 200.
- [x] Re-tested required production endpoints after deploy trigger: `/health`, `/tool/time-now`, `/tool/room-status`, `/tool/supabase-tables`, `/tool/storage-diagnostics`, `/tool/github-status`, and `/tool/aws-status` all still return HTTP 404 with `x-render-routing: no-server`, proving the blocker is Render service routing/activation rather than backend route code.
- [x] Corrected Render Docker Blueprint startup fields: `dockerContext: .`, `dockerCommand: node ./node_modules/tsx/dist/cli.mjs server.ts`, and valid `autoDeployTrigger: commit`.
- [x] Updated deployment docs and environment checklist with exact Render Docker build/start settings and production API/chat URL variables.
- [x] Corrected `render.yaml` so `api.ivxholding.com` belongs only to backend Docker service `ivx-holdings-platform`, while `chat.ivxholding.com` belongs to frontend Static Site `ivx-holdings-chat-frontend`.
- [x] Updated `README_IVX_DEPLOYMENT.md` and `ENVIRONMENT_VARIABLES.md` with the exact split-service Render setup, domain assignment, frontend publish path, and backend-only secret separation.
- [x] Added Render Blueprint runtime bindings for `MINIO_HOST` from private service `minio` and `DATABASE_URL` from Render Postgres database `mydatabase`.
- [x] Added the missing `minio` private service definition and `mydatabase` Render Postgres definition to `render.yaml`, completing the Blueprint references the owner provided.
- [x] Revalidated after routing/config changes: `bun install`, root `bunx tsc --noEmit --pretty false`, and Rork `runChecks` for `expo` passed.
- [x] Revalidated after the Render resource-definition patch with Rork `runChecks` for `expo`; checks passed.
- [x] Re-tested Render/public endpoints after the resource-definition patch; Render still returns `404 x-render-routing: no-server` for both `ivx-holdings-platform.onrender.com/health` and `ivx-holdings-chat-frontend.onrender.com/`, while custom domains still fail TLS handshake.
- [x] Added the latest requested Render Blueprint env var patterns for the backend service: `API_BASE_URL`, generated `APP_SECRET`, manual `STRIPE_API_KEY`, `DATABASE_URL` from `mydatabase`, `MINIO_PASSWORD` from private `minio` service env `MINIO_ROOT_PASSWORD`, and `fromGroup: my-env-group`.
- [x] Rork Expo checks passed after the latest env binding/documentation update.
- [x] Latest live endpoint proof still shows Render/custom-domain activation is incomplete: backend and frontend Render hostnames return HTTP `404`, and custom domains still fail TLS handshake before app routes respond.
- [x] Added optional Cloudflare Worker origin bridge and Wrangler route config for `api.ivxholding.com/*` and `chat.ivxholding.com/*`; direct Render-origin proxying is the default, with `IVX_WORKER_USE_RESOLVE_OVERRIDE=true` documented only for Cloudflare DNS setups that explicitly require resolve override.
- [x] Updated the Cloudflare Worker to use the provided hostname-to-origin routing pattern with IVX production hosts: `api.ivxholding.com` -> `ivx-holdings-platform.onrender.com` and `chat.ivxholding.com` -> `ivx-holdings-chat-frontend.onrender.com`, while preserving headers, CORS preflight, and optional Cloudflare `resolveOverride` support.
- [x] Revalidated after the Worker routing update with Rork `runChecks` for `expo`; checks passed.
- [x] Re-tested live endpoints after the Worker routing update: Render default hostnames still return HTTP `404`; `api.ivxholding.com` and `chat.ivxholding.com` still fail TLS handshake before app routes respond, so the remaining blocker is still Render service/custom-domain activation, not route code.
- [x] Applied the owner-provided `renderSubdomainPolicy` fix to `render.yaml` for both Render services and added an owner-approved backend action that performs the equivalent Render API PATCH when `RENDER_API_KEY` and `RENDER_SERVICE_ID` are loaded.
- [x] Documented that `renderSubdomainPolicy: disabled` intentionally makes `*.onrender.com` return 404 after activation, so final production proof must use verified custom domains directly unless the Render subdomain is temporarily re-enabled for default-origin/Worker testing.
- [x] Re-tested production endpoints after the subdomain-policy update: `api.ivxholding.com/health` and `chat.ivxholding.com/` still fail TLS handshake; `ivx-holdings-platform.onrender.com/health` and `ivx-holdings-chat-frontend.onrender.com/` still return HTTP `404` with `x-render-routing: no-server`.
- [x] Re-checked live Render API PATCH readiness through the secure Expo env loader; `RENDER_API_KEY` is available there, the live Render service settings were patched by API, and no secret values were printed.
- [x] Production routing/code blocker is resolved: Render redeployed the current repository source, and `/tool/*`, developer-deploy, and variables-tool proof routes are reachable in production.
- [x] Frontend blocker is resolved: the static site deploy is live and `chat.ivxholding.com` returns HTTP `200` HTML.

**IVX Owner AI tool/function calling**
- [x] Added real `executeTool(command)` runtime executor for `/time-now`, `/supabase-tables`, `/room-status`, and `/storage-diagnostics` in `backend/api/ivx-owner-ai.ts`.
- [x] Added direct proof endpoint `POST /api/ivx/owner-ai/tools` and Hono route registration for command execution.
- [x] Added exact public Render proof aliases `GET /tool/time-now`, `GET /tool/room-status`, `GET /tool/supabase-tables`, `GET /tool/storage-diagnostics`, `GET /tool/github-status`, and `GET /tool/aws-status` so the requested production test URLs are implemented in backend code.
- [x] Added final public proof aliases `GET /tool/render-status` and `GET /tool/supabase-status` for Render API/env group/runtime env proof and Supabase readiness proof without printing secrets.
- [x] Routed “What time is it now?” prompts through `/time-now` before Supabase/auth startup so the answer uses a server runtime timestamp instead of fake device-check text.
- [x] Updated command responses to return structured JSON with `selectedTool`, `toolInput`, `toolOutput`, `toolOutputs`, `fallbackUsed`, `executionLog`, and proof payloads.
- [x] Verified local proof: `/time-now` direct PASS, `/time-now` AI auto-route PASS, `/supabase-tables` returned 28 real table names with columns/RLS samples, `/room-status` returned live room status, `/storage-diagnostics` honestly FAILS on storage RLS (`new row violates row-level security policy`).
- [x] Validation passed after executeTool pass: root `bunx tsc --noEmit --pretty false` and Rork `runChecks` for `expo`.
- [x] Validation passed after exact GET proof alias pass: root `bunx tsc --noEmit --pretty false` and Rork `runChecks` for `expo`.
- [x] Local/dev proof completed: local command logs now return non-null `command_log_id`, schema inspection uses checked-in SQL fallback when live DB is unavailable, and storage diagnostics use local filesystem upload/read/delete proof.
- [ ] Remaining blocker for production/live proof only: hosted `ivx_command_logs`, direct live Postgres inspection, and Supabase storage RLS still require production Supabase configuration/policy validation.
- [x] Added first-pass Owner AI runtime tool dispatcher in `backend/api/ivx-owner-ai.ts`.
- [x] Added structured tool outputs for `get_current_time(timezone?: string)`, `read_database_schema()`, `query_database(sql: string)`, `read_logs(service?: string)`, and `search_code(query: string)`.
- [x] Routed relevant prompts through tools before generic AI/audit fallback so answers use tool results instead of assumptions.
- [x] Kept `query_database` read-only for SELECT statements and directs writes to existing owner-approved Supabase action tools.
- [x] Added top-level response proof fields for tool-routed calls: `selectedTool`, `toolInput`, `toolOutput`, `fallbackUsed`, and `toolOutputs`.
- [x] Validation passed: root `bun install && bunx tsc --noEmit --pretty false`.
- [x] Added visible Owner AI chat badge text for tool-routed replies: `Tool used: get_current_time`; response normalization now preserves `selectedTool`, `toolInput`, `toolOutput`, `fallbackUsed`, and `toolOutputs` for the app UI/runtime dashboard.
- [x] Removed hardcoded Owner AI health capability flags and replaced them with executable runtime probes returning `success`, `executable`, `functionName`, and proof payloads for AI chat, knowledge answers, owner commands, code-aware support, file upload, inbox sync, backend access, and Supabase inspection capabilities.
- [x] Validation passed after capability-probe pass: root `bunx tsc --noEmit --pretty false`, Expo `bunx tsc --noEmit --pretty false`, Expo lint, and Rork `runChecks` for `expo`.

**IVX AI Brain development TODO completion**
- [x] Completed owner chat intent routing so developer/status prompts call the AI Brain tool executor before generic chat.
- [x] Completed and expanded `backend/services/ivx-ai-brain-tool-executor.ts` with read-only tool execution, safe missing-env reporting, and secret redaction.
- [x] Added expanded AWS tooling for ACM, EC2, ECS, ELB/ALB, SSM parameter metadata, Organizations, and aggregate AWS deployment inventory.
- [x] Added `supabase_readiness_check` covering REST, auth admin read path, storage bucket read path, and DB inspection credential readiness.
- [x] Added AI Brain logs status summary, fix queue, setup export, and verification-test bundle tools.
- [x] Updated developer setup docs and AI Brain docs with the expanded executor, owner-chat routing, examples, and security rules.
- [x] Validation passed after implementation with root `bunx tsc --noEmit --pretty false`.

**GitHub deployment package readiness**
- [x] Added `README_IVX_DEPLOYMENT.md` with Render/AWS manual deployment steps and health checks.
- [x] Added `ENVIRONMENT_VARIABLES.md` with required env names only and no secret values.
- [x] Added `IVX_AI_BRAIN_TOOLS.md` with owner-only backend tool endpoint usage.
- [x] Added owner-only IVX AI Brain tool executor routes for GitHub, Supabase, AWS/IAM, S3, CloudFront, Route53, DNS/TLS, deployment health, and environment checklist.
- [x] Added `POST /api/ivx/ai-brain/tools` alias for the existing `POST /api/ivx/ai-brain/tools/execute` route requested by deployment activation tests.
- [x] Fixed Docker runtime packaging so `expo/deploy/scripts/aws-runtime.mjs` is copied into the production image for `server.ts` startup.
- [x] Replaced backend public chat `node:sqlite` dependency with portable JSON-backed storage so Bun/Node Docker runtimes can start without the unavailable `node:sqlite` module.
- [x] Removed `server.ts` default export to prevent Bun from double-starting the server after manual `Bun.serve` startup.
- [x] Verified local backend health after startup fixes: `GET http://127.0.0.1:3111/health` returned HTTP 200.

**IVX Owner AI owner/developer control room**
- [x] Added owner-only `GET /api/ivx/control-room/status` backend route returning real read-only status rows for Supabase, auth, storage, RLS, persistence, backend health, DNS/TLS, GitHub, deployment, AWS/IAM, environment variables, missing secrets, logs, verification tests, fix queue, and setup export readiness.
- [x] Wired the route into Hono CORS/options, route table, and health route list.
- [x] Added app-side `ivxControlRoomService` to fetch the owner-only status endpoint through the active Owner AI backend using the owner auth token.
- [x] Exposed the IVX Owner AI control-room dashboard in `/ivx/chat`, defaulting visible for owner sessions and showing “not connected” / “not verified” / missing credential names instead of fake active states.
- [x] Added a Run tests/refresh action that re-runs the read-only control-room status checks.
- [x] Fixed direct limit-question routing so “Do you have limits? enumerate all limits” returns an enumerated IVX limits answer instead of a generic greeting.
- [x] Removed forced “active” UI state for Owner AI health so unavailable runtime stays not verified/inactive instead of fake healthy.
- [x] Tightened IVX chat UI capability signals so knowledge answers, owner commands, and code-aware support only show active from executable backend health capability booleans, not from generic AI/local fallback success.
- [x] Tightened IVX chat file-upload capability status so Files only shows active from executable backend health `file_upload` proof, not room storage mode alone.
- [x] Fixed unauthenticated Owner AI probe responses to return HTTP 401 instead of generic HTTP 500 for missing bearer tokens.
- [x] Validation passed: root `bunx tsc --noEmit --pretty false`, Expo `bunx tsc --noEmit --pretty false`, Expo lint, and Rork `runChecks` for `expo`.

**IVX Owner AI owner-level production readiness**
- [x] Audited existing owner-control backend/tooling and docs for missing production-readiness coverage.
- [x] Added multi-app/project registry coverage for the ivxholding landing page, ivxholding app, backend API, and future app surfaces.
- [x] Added read-only owner tools for project registry, surface health, code/repo control readiness, deployment readiness matrix, owner-control audit, and owner-control readiness report.
- [x] Expanded owner chat routing so prompts about full owner control, multi-app control, landing/app health, repo control, deployment readiness, completion percentage, and remaining work call the AI Brain executor before generic chat.
- [x] Expanded the owner/developer control-room status route with multi-app, surface health, code/repo control, and owner-control readiness rows.
- [x] Added final checklist document `IVX_OWNER_CONTROL_READINESS.md` with completion percentage and remaining blockers before 100%.
- [x] Updated deployment, environment, AI Brain, and developer setup docs for owner-control readiness.
- [x] Validation passed after this pass: root `bun install`, root `bunx tsc --noEmit --pretty false`, and smoke test `executeIVXAIBrainTool({ tool: 'project_registry' })` returning 4 project surfaces.

**IVX AI least-privilege minimum access pass**
- [x] Added `IVX_MINIMUM_ACCESS_PLAN.md` with minimum credentials for GitHub, Supabase, and AWS/Amazon.
- [x] Marked credentials as read-only, public/frontend-safe, backend-only, or write-capable.
- [x] Added `minimum_access_plan` to the AI Brain tool executor.
- [x] Updated AI Brain result shape to report `accessMode: read_only_verification`, `writeActionsEnabled: false`, and `ownerApprovalRequiredForWrites: true`.
- [x] Changed GitHub tooling to prefer `IVX_GITHUB_READONLY_TOKEN` and require only `GITHUB_REPO_URL` for minimum repo checks.
- [x] Changed AWS tooling to prefer `IVX_AWS_READONLY_ACCESS_KEY_ID`, `IVX_AWS_READONLY_SECRET_ACCESS_KEY`, and `IVX_AWS_READONLY_SESSION_TOKEN` before legacy AWS credentials.
- [x] Changed Supabase readiness checks to use anon/read-only REST readiness first and treat service-role/admin reads as optional.
- [x] Changed Owner AI chat Supabase insert routing to prepare writes and require owner confirmation instead of executing writes automatically.
- [x] Changed owner-only Supabase write route so all writes require explicit confirmation; non-delete writes require `CONFIRM_OWNER_SUPABASE_WRITE`, deletes require `CONFIRM_OWNER_SUPABASE_DELETE`.
- [x] Updated `ENVIRONMENT_VARIABLES.md`, `IVX_AI_BRAIN_TOOLS.md`, and `IVX_OWNER_CONTROL_READINESS.md` for least-privilege defaults and 96% code readiness.
- [x] Added `IVX_FINAL_COMPLETION_PLAN.md` with already-complete items, remaining 100% blockers, development completion %, production completion %, and blocked-by-AWS %.
- [x] Added `final_completion_report` to the AI Brain executor and owner chat routing.
- [x] Validation passed after this pass: root `bun install && bunx tsc --noEmit --pretty false`, then root `bunx tsc --noEmit --pretty false` after final code/doc updates.
- [x] Remaining deployment-live blockers for this pass are resolved: backend `/health`, current `/tool/*` route set, frontend static site, and live GitHub/Supabase/AWS proof routes are verified; optional/minimum credential hardening can continue separately where routes report missing names by name only.

**IVX ownership/branding cleanup**
- [x] Removed the custom Expo Metro wrapper and package dependency tied to the previous builder tooling.
- [x] Removed the workspace descriptor file for the previous builder platform.
- [x] Renamed the Expo app display name and native identifiers to IVX Holdings ownership naming.
- [x] Removed the hardcoded previous-builder AI gateway fallback and defaulted backend AI runtime to Vercel AI Gateway.
- [x] Removed previous-builder wording from active backend status text and deployment docs.
- [x] Renamed Render-facing service/disk identifiers to IVX Holdings ownership naming.
- [x] Updated Render deployment docs with Docker Web Service settings and no-command Docker startup guidance.
- [x] Replaced leftover generated workspace app descriptors with IVX Holdings-owned app/backend descriptors.
- [x] Rewrote the Expo README and developer setup guide around IVX Holdings ownership and Render Docker deployment.
- [x] Deleted a local secret backup file and added `.env.bak` / `.env*.bak` patterns to source-control and Docker excludes.
- [x] Excluded local proof/history artifacts and hidden workspace tooling from deployment and source-control scope.

**React Native text-node crash fix**
- [x] Added safe primitive-child rendering for reusable View wrappers so stray punctuation/string children render inside Text instead of directly under View.
- [x] Patched admin wrapper, collapsible section, screen mockup phone frame, and shared analytics ring wrappers.
- [x] Verified with Expo TypeScript check: `bunx tsc --noEmit --pretty false`.
- [x] Verified with Expo lint: `bun run lint`.

**Fastest-path app stability pass**
- [x] Audited the last-24-hour crash surface across package config, Expo config, routing, startup guards, web static export, and native/web API usage.
- [x] Removed unused/risky Expo workspace dependencies from the app bundle surface: `ai`, `buffer`, `@stardazed/streams-text-encoding`, `@ungap/structured-clone`, and unused `expo-location`.
- [x] Verified no remaining Expo app imports for `ai`, `buffer`, `@stardazed/streams-text-encoding`, `@ungap/structured-clone`, or `expo-location`.
- [x] Re-verified Expo package alignment with `bunx expo install --check`.
- [x] Re-verified Expo TypeScript with `bunx tsc --noEmit --pretty false`.
- [x] Re-verified root/backend TypeScript with `bunx tsc --noEmit --pretty false`.
- [x] Re-verified Expo lint with `bun run lint`.
- [x] Re-verified Android/Expo Go export with `bunx expo export --platform android`.
- [x] Re-verified web export with `bunx expo export --platform web`.
- [x] Switched Expo web output to `single` in `expo/app.config.ts` so web export validates as a fast SPA export instead of prerendering 167 routes and timing out during development checks.
- [x] Re-ran the requested Expo validation sequence: `bun install`, `bunx tsc --noEmit --pretty false`, `bunx expo-doctor --verbose || true`, `bunx expo export --platform web`, `bunx expo export --platform android`, and a clean Metro start smoke check.
- [x] Created `IVX_MASTER_APP_FINISH_CHECKLIST.md` with the shortest finish-first execution plan and final checklist before clone/new-app work.
- [x] Confirmed `bunx expo-doctor --verbose` still only fails checks that require unavailable sandbox `npm explain`; Expo dependency/version checks pass.
- [x] Started clean Expo Go tunnel with `bunx expo start --clear --tunnel` and verified Metro status plus Android native entry bundle HTTP 200 (`34926960` bytes, `4061` modules bundled).
- [x] Fixed rebuild archive timeout risk by expanding `.rorkignore` to exclude tar-style `./` and nested forms of `node_modules`, `.expo`, `.rork`, `.git`, and `logs`.
- [x] Verified reduced archive proof: previous tar-compatible archive was `398.29 MiB`; after ignore hardening it is `4.829 MiB` with `0` blocked-path hits for `node_modules`, `.rork`, `.git`, `logs`, or `.expo`.
- [x] Re-ran Rork checks after the archive ignore fix; `runChecks` passed for `expo`.
- [ ] Manual Expo Go QR/device smoke test remains required outside this shell.
- [x] Latest Expo Go crash-screen fix proof completed locally: patched remaining null-unsafe wallet `.available` reads in `expo/app/buy-shares.tsx` and `expo/app/property/[id].tsx`; TypeScript passed, lint exited 0, `expo install --check` passed, Android export passed, web export passed, Rork checks passed, and local Metro dev bundles returned Android HTTP 200 (`34935960` bytes), iOS HTTP 200 (`34934882` bytes), and web HTTP 200 (`30696800` bytes).
- [x] Fixed the `Cannot find single active touch` crash source by replacing the admin system-map `PanResponder` path with `react-native-gesture-handler` single-pointer pan handling and adding the required flex root style to `GestureHandlerRootView`; Rork Expo checks passed.
