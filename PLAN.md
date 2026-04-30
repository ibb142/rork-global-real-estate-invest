# IVX access-control audit and remediation

**Expo Go end-to-end startup audit**
- [x] Reproduced local toolchain readiness by installing Expo workspace dependencies with `bun install`.
- [x] Verified TypeScript with `bunx tsc --noEmit --pretty false`.
- [x] Verified Android Metro/Hermes export with `bunx expo export --platform android --clear`.
- [x] Verified lint with `bun run lint`.
- [x] Verified Expo public config reports SDK `54.0.0`, matching Expo Go supported SDK 54 from the attached screenshot.
- [x] Removed `runtimeVersion` from `expo/app.config.ts` for Expo Go because the attached crash is Expo Go failing before JS while trying to download a remote update; public config now exposes SDK `54.0.0` without remote-update runtime targeting.
- [x] Disabled Expo remote update startup checks in `expo/app.config.ts` with `updates.enabled=false`, `checkAutomatically='NEVER'`, and `fallbackToCacheTimeout=0` so Expo Go loads the local Metro bundle instead of failing remote update download.
- [x] Fixed web emulator static-render startup by preventing analytics auto-initialization when Expo Router renders without `window`.
- [x] Verified web export with `bunx expo export --platform web` after the analytics runtime guard.
- [x] Checked unsupported native module usage: `expo-device` and `expo-local-authentication` are guarded with runtime `require` fallbacks; no direct `expo-location` import usage remains.
- [x] Fixed Expo Go cold-start routing by setting Expo Router `initialRouteName` to `landing` and guarding unauthenticated `(tabs)` startup so Expo Go does not open the protected tab tree first.
- [x] Updated startup marker to `expo-go-latest-2026-04-28-expo-go-startup-route-guard`.
- [x] Removed remaining Expo Router `origin` entry pointing at `https://chat.ivxholding.com/` from `expo/app.config.ts`.
- [x] Restarted Metro with cleared cache and verified local bundle serving on `http://localhost:8082` with Android/iOS entry bundles returning HTTP 200.
- [x] Removed the stale EAS `updates.url` example from `expo/docs/DEVELOPER-SETUP-GUIDE.md` and replaced it with local-development-safe `updates.enabled=false` config.


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
- [ ] Live deployed chat proof for time/state/audit_trail insert remains blocked from this shell because `https://api.ivxholding.com/health`, `https://chat.ivxholding.com`, and `https://api.ivxholding.com/api/ivx/owner-ai` fail TLS reachability; latest TLS proof saved at `logs/deploy/ivx-tls-failure-proof-2026-04-28T14-15-21-762Z.md`, with manual test URL `https://chat.ivxholding.com`.

**Production domain/TLS reachability repair**
- [x] Verified `api.ivxholding.com` and `chat.ivxholding.com` currently resolve to `108.132.7.57` with no CNAME to the active Render backend.
- [x] Verified HTTPS to `api.ivxholding.com/health` and `chat.ivxholding.com` fails at TLS before backend routes can respond.
- [x] Patched `render.yaml` to declare `api.ivxholding.com` and `chat.ivxholding.com` as Render custom domains for the backend service.
- [x] Patched production API environment URLs in `render.yaml` to use `https://api.ivxholding.com`.
- [x] Replaced Route53 `api.ivxholding.com` and `chat.ivxholding.com` dead `A 108.132.7.57` records with CNAME records to `ivx-chat-app.onrender.com`.
- [x] Added `render.yaml` to the connected GitHub repo so Render Blueprint/custom-domain deployment can discover the backend service config.
- [ ] Remaining blocker: Render service/custom-domain activation is not complete; `ivx-chat-app.onrender.com/health` currently returns Render `404 x-render-routing: no-server`, and `https://api.ivxholding.com/health` does not return HTTP 200 yet.

**IVX Owner AI tool/function calling**
- [x] Added first-pass Owner AI runtime tool dispatcher in `backend/api/ivx-owner-ai.ts`.
- [x] Added structured tool outputs for `get_current_time(timezone?: string)`, `read_database_schema()`, `query_database(sql: string)`, `read_logs(service?: string)`, and `search_code(query: string)`.
- [x] Routed relevant prompts through tools before generic AI/audit fallback so answers use tool results instead of assumptions.
- [x] Kept `query_database` read-only for SELECT statements and directs writes to existing owner-approved Supabase action tools.
- [x] Added top-level response proof fields for tool-routed calls: `selectedTool`, `toolInput`, `toolOutput`, `fallbackUsed`, and `toolOutputs`.
- [x] Validation passed: root `bun install && bunx tsc --noEmit --pretty false`.
- [x] Added visible Owner AI chat badge text for tool-routed replies: `Tool used: get_current_time`; response normalization now preserves `selectedTool`, `toolInput`, `toolOutput`, `fallbackUsed`, and `toolOutputs` for the app UI/runtime dashboard.

**GitHub deployment package readiness**
- [x] Added `README_IVX_DEPLOYMENT.md` with Render/AWS manual deployment steps and health checks.
- [x] Added `ENVIRONMENT_VARIABLES.md` with required env names only and no secret values.
- [x] Added `IVX_AI_BRAIN_TOOLS.md` with owner-only backend tool endpoint usage.
- [x] Added owner-only IVX AI Brain tool executor routes for GitHub, Supabase, AWS/IAM, S3, CloudFront, Route53, DNS/TLS, deployment health, and environment checklist.
- [x] Fixed Docker runtime packaging so `expo/deploy/scripts/aws-runtime.mjs` is copied into the production image for `server.ts` startup.
