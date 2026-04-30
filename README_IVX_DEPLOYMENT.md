# IVX Deployment Readiness

This repository contains the Expo app and the IVX backend required for independent deployment through Render or AWS.

## Runtime entrypoints

- Backend server: `server.ts`
- Hono app: `backend/hono.ts`
- Health endpoint: `GET /health`
- Readiness endpoint: `GET /readiness`
- Owner AI endpoint: `POST /api/ivx/owner-ai`
- Supabase owner write endpoint: `POST /api/ivx/supabase/owner-action`
- Supabase inspection endpoints:
  - `GET /api/ivx/supabase/tables`
  - `GET /api/ivx/supabase/schema`
  - `GET /api/ivx/supabase/columns`
  - `GET /api/ivx/supabase/rls`
- IVX AI Brain tool endpoints:
  - `GET /api/ivx/ai-brain/tools`
  - `POST /api/ivx/ai-brain/tools/execute`
- Route53 tooling endpoints:
  - `POST /api/aws/route53/audit`
  - `POST /api/aws/route53/upsert`

## Render deployment

The root `render.yaml` defines a Docker web service named `ivx-chat-app`.

Manual Render steps:

1. Connect the GitHub repository to Render.
2. Create a Blueprint or Docker web service from the repository root.
3. Use `render.yaml` as the deployment config.
4. Set all required environment variables listed in `ENVIRONMENT_VARIABLES.md`.
5. Deploy the service.
6. Add custom domains in Render:
   - `api.ivxholding.com`
   - `chat.ivxholding.com`
7. Wait for Render to verify domains and issue TLS certificates.
8. Verify:
   - `curl https://api.ivxholding.com/health`
   - Expected: HTTP 200 with JSON `{ "ok": true, "status": "healthy" }`.

If Render provides a target like `ivx-chat-app.onrender.com`, DNS should point the custom domains to that target unless Render displays a different target.

Recommended DNS records when using Render custom domains:

| Type | Name | Value/Target | Proxy |
| --- | --- | --- | --- |
| CNAME | api | Render-provided hostname, usually `ivx-chat-app.onrender.com` | DNS only if Cloudflare is used |
| CNAME | chat | Render-provided hostname, usually `ivx-chat-app.onrender.com` | DNS only if Cloudflare is used |

## AWS deployment option

The backend can also run on AWS using a container service such as ECS/Fargate or EC2 with Docker.

Minimum AWS path:

1. Build the Docker image from the repository root.
2. Run the container with `PORT=3000` and `HOST=0.0.0.0`.
3. Attach the service to an HTTPS load balancer or reverse proxy.
4. Point `api.ivxholding.com` to the active load balancer target.
5. Point `chat.ivxholding.com` to either the same backend web export or a separate static web host.
6. Configure TLS with ACM or the platform certificate manager.
7. Verify `/health` before testing Owner AI.

## Supabase setup

Apply the SQL files before relying on Owner AI persistence:

- `expo/supabase/ivx-owner-ai-phase1.sql`
- `expo/supabase/ivx-owner-room-dedupe.sql`
- Optional full schema baseline: `expo/scripts/supabase-full-schema.sql`
- Optional security hardening: `expo/scripts/supabase-security-hotfix.sql`

Required IVX tables include:

- `public.ivx_conversations`
- `public.ivx_messages`
- `public.ivx_inbox_state`
- `public.ivx_ai_requests`
- `public.ivx_knowledge_documents`
- `public.audit_trail`

## Verification commands

From repository root:

```bash
bun install
bunx tsc --noEmit --pretty false
bun server.ts
```

From another terminal:

```bash
curl -i http://localhost:3000/health
curl -i http://localhost:3000/readiness
curl -i https://api.ivxholding.com/health
```

Owner-only routes require a valid IVX/Supabase owner session token in the `Authorization` header.

## Production readiness checklist

- GitHub repository contains root backend files: `server.ts`, `backend/`, `Dockerfile`, `render.yaml`, `tsconfig.json`, `bun.lock`.
- Render/AWS runtime has the required environment variables.
- Supabase SQL has been applied.
- `https://api.ivxholding.com/health` returns HTTP 200.
- `POST /api/ivx/owner-ai` is reachable after health is green.
- DNS resolves to the active deployment target.
- TLS certificate covers `api.ivxholding.com` and `chat.ivxholding.com`.
