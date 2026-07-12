# IVX Holdings — Developer Setup Guide

## Ownership

This codebase is owned and operated by IVX Holdings LLC.

Active app identity is configured in `expo/app.config.ts`:

```json
{
  "name": "IVX Holdings",
  "slug": "ivx-holdings",
  "scheme": "ivx-app",
  "ios": {
    "bundleIdentifier": "com.ivxholdings.app"
  },
  "android": {
    "package": "com.ivxholdings.app"
  }
}
```

## Local development

From the repository root:

```bash
bun install
bunx tsc --noEmit --pretty false
bun server.ts
```

From the Expo app directory:

```bash
bun install
bunx tsc --noEmit --pretty false
bun run lint
bun run start-web
bun run start
```

For local development and Expo Go testing, remote updates stay disabled in `expo/app.config.ts`:

```json
{
  "updates": {
    "enabled": false,
    "checkAutomatically": "NEVER",
    "fallbackToCacheTimeout": 0
  }
}
```

## Environment variables

Do not commit secret values. Store production values in Render, AWS, Supabase, GitHub Actions, or another secure secrets manager.

Primary backend runtime variables are documented in the repository root file:

```text
ENVIRONMENT_VARIABLES.md
```

Minimum production API values:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
EXPO_PUBLIC_API_BASE_URL=https://api.ivxholding.com
EXPO_PUBLIC_CHAT_API_URL=https://api.ivxholding.com
EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL=https://api.ivxholding.com
```

Backend-only secrets must never use an `EXPO_PUBLIC_` prefix.

## Render deployment

The correct Render deployment type is:

```text
Docker Web Service
```

Use the root `render.yaml` Blueprint when possible. If creating the service manually, use:

- Service type: `Web Service`
- Runtime: `Docker`
- Branch: `main`
- Root directory: blank / repository root
- Dockerfile path: `./Dockerfile`
- Docker build context: repository root / `.`
- Build command: leave blank
- Start command: leave blank
- Health check path: `/health`

Render will use the Dockerfile command:

```bash
node ./node_modules/tsx/dist/cli.mjs server.ts
```

Do not set a separate Render build command or start command for the Docker service.

## IVX AI Brain owner/developer tools

The owner chat backend now routes developer/status prompts through the read-only AI Brain executor before generic chat. The same executor is available directly through owner-only endpoints:

```text
GET /api/ivx/ai-brain/tools
POST /api/ivx/ai-brain/tools
POST /api/ivx/ai-brain/tools/execute
```

Useful local checks after starting `bun server.ts`:

```bash
curl -i http://localhost:3000/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"environment_checklist"}'

curl -i http://localhost:3000/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"supabase_readiness_check"}'

curl -i http://localhost:3000/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"run_verification_tests"}'
```

Available executor coverage includes GitHub repo status, code/repo control readiness, multi-app/project registry, landing/app/backend surface health, Supabase runtime/readiness, AWS identity/IAM/S3/CloudFront/Route53/ACM/EC2/ECS/ELB/SSM/Organizations diagnostics, DNS/TLS, deployment health, deployment readiness matrix, owner-control readiness report, logs status summary, fix queue, and setup export. All AI Brain executor tools are read-only and report missing secrets by environment variable name only.

## DNS and domains

Attach these custom domains to the Render Web Service:

```text
api.ivxholding.com
chat.ivxholding.com
```

Recommended DNS records:

| Type | Name | Value/Target | Proxy |
| --- | --- | --- | --- |
| CNAME | api | Render-provided hostname, usually `ivx-holdings-platform.onrender.com` | DNS only if Cloudflare is used |
| CNAME | chat | Render-provided hostname, usually `ivx-holdings-platform.onrender.com` | DNS only if Cloudflare is used |

After Render verifies the domains and provisions TLS, verify:

```bash
curl -i https://api.ivxholding.com/health
curl -i https://api.ivxholding.com/readiness
```

Expected health result: HTTP 200.

## Production files involved

- `render.yaml`
- `Dockerfile`
- `server.ts`
- `backend/`
- `package.json`
- `bun.lock`
- `ENVIRONMENT_VARIABLES.md`
- `README_IVX_DEPLOYMENT.md`
- `IVX_AI_BRAIN_TOOLS.md`
- `IVX_OWNER_CONTROL_READINESS.md`
- `backend/services/ivx-ai-brain-tool-executor.ts`
- `backend/api/ivx-ai-brain-tools.ts`
- `expo/app.config.ts`
- `expo/supabase/`

## Security checklist

- Do not commit `.env`, `.env.bak`, `.env.local`, or secret backup files.
- Do not hardcode Supabase service-role keys.
- Do not hardcode GitHub tokens.
- Do not hardcode AWS access keys.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`, `AI_GATEWAY_API_KEY`, `GITHUB_TOKEN`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `JWT_SECRET` backend-only.
