# IVX Environment Variables

Do not commit secret values. Store all values in Render, AWS, Supabase, GitHub Actions, or another secure secret manager.

## Minimum required backend runtime variables

Set these first. They support read-only verification/reporting mode and keep write-capable credentials out of the default setup.

| Name | Secret | Access | Purpose |
| --- | --- | --- | --- |
| `JWT_SECRET` | Yes | Backend session/signing | Backend/session signing secret where applicable. |
| `EXPO_PUBLIC_SUPABASE_URL` | No | Public/read-only endpoint | Supabase project URL used by app and backend. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | No | Public RLS-limited key | Supabase anon key used by client session flows and minimum REST readiness. |
| `AI_GATEWAY_API_KEY` | Yes | Backend AI requests | Vercel AI Gateway key used by IVX Owner AI backend. |
| `GITHUB_REPO_URL` | No | Read-only target metadata | GitHub repository URL for deployment diagnostics. |
| `EXPO_PUBLIC_API_BASE_URL` | No | Public URL | Public API base URL, expected `https://api.ivxholding.com` in production. |
| `EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL` | No | Public URL | Owner AI API base URL, expected `https://api.ivxholding.com` in production. |
| `EXPO_PUBLIC_APP_URL` | No | Public URL | Public web app URL, expected `https://chat.ivxholding.com` in production. |

## Optional read-only integration variables

| Name | Secret | Access | Purpose |
| --- | --- | --- | --- |
| `IVX_GITHUB_READONLY_TOKEN` | Yes | GitHub read-only | Preferred token for private repo metadata/content checks. |
| `IVX_AWS_READONLY_ACCESS_KEY_ID` | Yes | AWS read-only | Preferred AWS identity for inventory/status checks. |
| `IVX_AWS_READONLY_SECRET_ACCESS_KEY` | Yes | AWS read-only | Preferred AWS secret for inventory/status checks. |
| `IVX_AWS_READONLY_SESSION_TOKEN` | Yes | AWS read-only temporary session | Optional temporary session token. |
| `AWS_REGION` | No | Config | AWS region for regional checks. |
| `S3_BUCKET_NAME` | No | Config/read target | Optional bucket name for read-only S3 readiness. |
| `MINIO_HOST` | No | Internal service host | Render Blueprint-provided internal host for the private `minio` service. |
| `CLOUDFRONT_DISTRIBUTION_ID` | No | Config/read target | Optional distribution ID for read-only CloudFront readiness. |
| `SUPABASE_READONLY_DATABASE_URL` | Yes | Supabase read-only DB | Preferred direct DB inspection connection string. |
| `SUPABASE_INSPECTION_DATABASE_URL` | Yes | Supabase read-only DB | Optional dedicated inspection connection string. |

## Optional write-capable backend-only variables

Only add these when owner-approved write automation is truly needed.

| Name | Secret | Access | Purpose |
| --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase write/admin capable | Backend-only Supabase service-role key for owner-approved row/admin actions. |
| `SUPABASE_DB_URL` | Yes | Supabase DB owner/admin capable | Supabase Postgres connection string for owner-approved schema migrations and SQL changes. |
| `SUPABASE_DB_PASSWORD` | Yes | Supabase DB owner/admin capable | Supabase Postgres password when deriving a direct DB connection is needed. |
| `GITHUB_TOKEN` | Yes | GitHub write-capable | Fine-grained GitHub token for owner-approved commits, pull requests, and workflow dispatches. Required permissions: contents read/write, pull requests write, actions/workflows write. |
| `RENDER_API_KEY` | Yes | Render write-capable | Render API key for owner-approved deploy triggers, service restarts, and environment variable updates. |
| `RENDER_SERVICE_ID` | No | Render target identifier | Render Web Service ID that IVX Owner AI is allowed to manage. Example format: `srv-...`. |
| `AWS_ACCESS_KEY_ID` | Yes | AWS fallback, potentially write-capable | Legacy fallback for AWS checks/changes if no read-only identity is available. |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS fallback, potentially write-capable | Legacy fallback for AWS checks/changes if no read-only identity is available. |

## Required Render variables

Set these in Render for the backend Docker Web Service `ivx-holdings-platform`:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=3000`
- `CHAT_DATABASE_PATH=/app/data/chat-room.sqlite`
- `CHAT_ALLOWED_ORIGINS=https://chat.ivxholding.com,https://api.ivxholding.com,https://ivx-holdings-platform.onrender.com,https://ivx-holdings-chat-frontend.onrender.com`
- `EXPO_PUBLIC_CHAT_SOCKET_PATH=/socket.io`
- `EXPO_PUBLIC_APP_ENV=production`
- `API_BASE_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_API_BASE_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_IVX_API_BASE_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_API_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_PRODUCTION_API_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_APP_URL=https://chat.ivxholding.com`
- `EXPO_PUBLIC_CHAT_API_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL=https://api.ivxholding.com`
- `CHAT_ROOM_ID=main-room`
- `EXPO_PUBLIC_CHAT_DEFAULT_ROOM_ID=main-room`
- `APP_SECRET` generated by Render with `generateValue: true`
- `STRIPE_API_KEY` set manually in Render with `sync: false`
- `MINIO_HOST` from Render private service reference: `fromService.name=minio`, `type=pserv`, `property=host`
- `MINIO_PASSWORD` from Render private service env reference: `fromService.name=minio`, `type=pserv`, `envVarKey=MINIO_ROOT_PASSWORD`
- `DATABASE_URL` from Render Postgres reference: `fromDatabase.name=mydatabase`, `property=connectionString`
- `fromGroup: my-env-group` linked to the backend service if that Render Environment Group exists in the workspace
- `renderSubdomainPolicy=disabled` in the Blueprint after the custom domain is attached/verified. Use `enabled` temporarily if direct `*.onrender.com` testing or the optional Cloudflare Worker origin bridge must fetch the Render default hostname.

Set these public build variables in the frontend Static Site `ivx-holdings-chat-frontend`:

- `EXPO_PUBLIC_APP_ENV=production`
- `EXPO_PUBLIC_API_BASE_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_IVX_API_BASE_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_API_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_PRODUCTION_API_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_CHAT_API_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_APP_URL=https://chat.ivxholding.com`
- `EXPO_PUBLIC_CHAT_DEFAULT_ROOM_ID=main-room`
- `EXPO_PUBLIC_CHAT_SOCKET_PATH=/socket.io`

Also add every minimum required backend runtime variable from the table above to `ivx-holdings-platform`. Add optional read-only integration variables only for the integrations you want IVX to verify first. Add write-capable variables only in the backend Render Environment when owner-approved automation is needed; never place their values in chat, source files, or the frontend static bundle.

For IVX Owner AI full developer/deploy control, add these backend-only Render environment variables by name:

- `GITHUB_TOKEN` with fine-grained access to the target repo: contents read/write, pull requests write, actions/workflows write.
- `RENDER_API_KEY` for the Render account/workspace.
- `RENDER_SERVICE_ID` for the exact Render Web Service IVX Owner AI may manage.
- `SUPABASE_SERVICE_ROLE_KEY` for backend-only owner-approved Supabase row/admin actions.
- `SUPABASE_DB_URL` or `DATABASE_URL` or `POSTGRES_URL` for owner-approved migrations/schema SQL.
- Optional AWS/DNS/storage: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_REGION`, `S3_BUCKET_NAME`, `MINIO_HOST`, `MINIO_PASSWORD`, `CLOUDFRONT_DISTRIBUTION_ID`.

All write/deploy actions are gated by owner confirmation through `POST /api/ivx/developer-deploy/action`, including the Render service-setting action `render_update_subdomain_policy` for applying `serviceDetails.renderSubdomainPolicy` as `disabled` or `enabled`.

### IVX AI secure variable/request file

IVX AI now has a names/metadata-only credential request manifest at:

- `backend/config/ivx-credential-request-manifest.ts`

This file is the safe variable file for current and future credentials. It lists env var names, public-vs-secret classification, Render target, purpose, placeholders, and whether a future credential can be requested through guarded intake. It does **not** store credential values.

Owner-only proof route:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"credential_request_manifest","input":{"includeOptional":true}}'
```

Expected safe proof fields include `variableFile="backend/config/ivx-credential-request-manifest.ts"`, `secureCredentialIntakeEnabled=true`, `secretValuesReturned=false`, `futureCredentialAction="render_upsert_env_var"`, and `ownerConfirmationRequired="CONFIRM_IVX_RENDER_SERVICE_UPDATE"`.

Future credentials must still be entered only in secure backend/Render environment storage. IVX AI can request the missing variable by name/metadata, and when `RENDER_API_KEY` plus `RENDER_SERVICE_ID` are loaded in the backend runtime it can add the variable through the owner-approved `render_upsert_env_var` action without returning the secret value.

### Pre-live access clarification

IVX Owner AI does **not** need the public app or production custom domains to be live before it can receive developer/deploy access. It needs a reachable backend runtime with the backend-only credentials loaded there. That runtime can be local dev, staging, a Render preview/service URL, or production.

Status proof is separated into two different questions:

- **Access before live:** `GET /api/ivx/developer-deploy/status` reports `preLiveAccessSupported=true`, `productionLiveRequiredForAccess=false`, `renderLiveBlocksIVXAccess=false`, and credential presence by name only.
- **Public production proof:** `https://api.ivxholding.com/health` and the custom domains must return HTTP 200/TLS-valid before production-live proof can be marked complete.

If `currentRuntimeCanExecuteCoreOwnerApprovedActions=false`, the credentials are not loaded in the runtime receiving the request yet, even if they exist somewhere else such as another dashboard, device, or account. Render being not-live is not the access blocker; missing backend-only credentials in the reachable runtime is the blocker.

## Other optional backend variables

| Name | Secret | Purpose |
| --- | --- | --- |
| `AWS_SESSION_TOKEN` | Yes | Legacy fallback temporary AWS credentials when using STS sessions. |
| `RENDER_API_KEY` | Yes | Render API key for owner-approved deploy/restart/env actions. |
| `RENDER_SERVICE_ID` | No | Exact Render Web Service ID allowed for owner-approved management. |
| `RENDER_SERVICE_NAME` | No | Optional display name for status output, default `ivx-holdings-platform`. |
| `SUPABASE_SERVICE_KEY` | Yes | Alternate name accepted for service role key. |
| `SUPABASE_DB_URL` | Yes | Explicit Supabase Postgres connection string. |
| `DATABASE_URL` | Yes | Generic Postgres connection string fallback. |
| `POSTGRES_URL` | Yes | Generic Postgres connection string fallback. |
| `SUPABASE_READONLY_DATABASE_URL` | Yes | Read-only inspection connection string. |
| `SUPABASE_INSPECTION_DATABASE_URL` | Yes | Dedicated inspection connection string. |
| `MINIO_HOST` | No | Render private MinIO service host injected by Blueprint. |
| `MINIO_PASSWORD` | Yes | Render private MinIO root password copied from the private MinIO service env with `envVarKey=MINIO_ROOT_PASSWORD`. |
| `SUPABASE_DB_HOST` | No | Supabase database host override. |
| `SUPABASE_DB_PORT` | No | Supabase database port override. |
| `SUPABASE_DB_NAME` | No | Supabase database name override. |
| `SUPABASE_DB_USER` | No | Supabase database user override. |
| `DOMAIN_NAME` | No | Root domain used by AWS audit tooling, default `ivxholding.com`. |
| `IVX_OWNER_AI_MODEL` | No | Optional model override for Owner AI. |
| `EXPO_PUBLIC_IVX_AI_GATEWAY_URL` | No | Optional AI gateway root URL override. |
| `IVX_AI_GATEWAY_URL` | No | Backend-only AI gateway root URL override. |
| `IVX_PROJECT_REGISTRY_JSON` | No | Optional JSON registry for additional IVX-owned apps/business surfaces. List names, URLs, domains, and env var names only; do not include secret values. |
| `GITHUB_DEFAULT_BRANCH` | No | Optional branch override for GitHub readiness checks. |
| `IVX_LANDING_URL` | No | Optional landing page URL override, default `https://ivxholding.com`. |
| `IVX_LANDING_HEALTH_URL` | No | Optional landing page health/check URL override. |
| `IVX_APP_URL` | No | Optional app/web surface URL override, default `https://chat.ivxholding.com`. |
| `IVX_APP_HEALTH_URL` | No | Optional app/web surface health/check URL override. |

## Expo public variables

These can be exposed to the app bundle:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_IVX_API_BASE_URL`
- `EXPO_PUBLIC_API_URL`
- `EXPO_PUBLIC_PRODUCTION_API_URL`
- `EXPO_PUBLIC_APP_URL`
- `EXPO_PUBLIC_CHAT_API_URL`
- `EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL`
- `EXPO_PUBLIC_GOOGLE_ADS_API_KEY`
- `EXPO_PUBLIC_PROJECT_ID`
- `EXPO_PUBLIC_TEAM_ID`

Do not expose backend-only secrets with an `EXPO_PUBLIC_` prefix.

## Backend-only secrets

Never expose these to the Expo app bundle and never commit their values:

- `JWT_SECRET`
- `AI_GATEWAY_API_KEY`
- `IVX_GITHUB_READONLY_TOKEN`
- `GITHUB_TOKEN`
- `RENDER_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_DB_URL`
- `SUPABASE_READONLY_DATABASE_URL`
- `SUPABASE_INSPECTION_DATABASE_URL`
- `DATABASE_URL`
- `POSTGRES_URL`
- `SUPABASE_DB_URL`
- `IVX_AWS_READONLY_ACCESS_KEY_ID`
- `IVX_AWS_READONLY_SECRET_ACCESS_KEY`
- `IVX_AWS_READONLY_SESSION_TOKEN`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`

## Optional Cloudflare Worker variables

The optional Worker at `deploy/cloudflare/ivx-render-origin-worker.js` contains no secrets. If deployed through `deploy/cloudflare/wrangler.toml`, it routes:

- `api.ivxholding.com/*` to `https://ivx-holdings-platform.onrender.com`
- `chat.ivxholding.com/*` to `https://ivx-holdings-chat-frontend.onrender.com`

Optional Worker variable:

| Name | Secret | Purpose |
| --- | --- | --- |
| `IVX_WORKER_USE_RESOLVE_OVERRIDE` | No | Keep unset/`false` for normal direct Render-origin proxying. Set `true` only when Cloudflare DNS requires preserving the incoming host while overriding resolution to the Render origin. |

The Worker can bridge Cloudflare TLS/custom-domain routing, but it cannot activate a missing Render service. If `renderSubdomainPolicy` is `disabled`, Render intentionally returns 404 for default `*.onrender.com` hostnames, so production proof must use the verified custom domains directly or temporarily re-enable the Render default subdomains for Worker/default-origin testing.

## Minimum health verification

After deployment, verify the runtime has enough configuration by checking:

```bash
curl -i https://api.ivxholding.com/health
```

Then use the owner-only IVX AI Brain checklist route with a valid owner session token:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"environment_checklist"}'
```

Additional owner-only readiness checks:

```bash
curl -i https://api.ivxholding.com/api/ivx/developer-deploy/status \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN"

curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"developer_deploy_control_status"}'

curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"minimum_access_plan"}'

curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"credential_request_manifest","input":{"includeOptional":true}}'

curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"supabase_readiness_check"}'

curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"run_verification_tests"}'
```

Missing secrets are reported by variable name only. Tool responses must not include secret values.

## Owner approval confirmation strings

Do not run write/deploy actions without explicit owner approval. The guarded developer/deploy action route requires:

- GitHub commit/PR/workflow actions: `CONFIRM_IVX_GITHUB_WRITE`
- Render deploy trigger: `CONFIRM_IVX_RENDER_DEPLOY`
- Render restart/env/service update: `CONFIRM_IVX_RENDER_SERVICE_UPDATE`
- Supabase SQL migrations/schema changes: `CONFIRM_IVX_SUPABASE_MIGRATION`
- Supabase row writes through `/api/ivx/supabase/owner-action`: `CONFIRM_OWNER_SUPABASE_WRITE`
- Supabase row deletes through `/api/ivx/supabase/owner-action`: `CONFIRM_OWNER_SUPABASE_DELETE`
