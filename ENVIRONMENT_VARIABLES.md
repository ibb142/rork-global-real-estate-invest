# IVX Environment Variables

Do not commit secret values. Store all values in Render, AWS, Supabase, GitHub Actions, or another secure secret manager.

## Required backend runtime variables

| Name | Secret | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | Yes | Backend/session signing secret where applicable. |
| `EXPO_PUBLIC_SUPABASE_URL` | No | Supabase project URL used by app and backend. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | No | Supabase anon key used by client session flows. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Backend-only Supabase service-role key for owner tools and server persistence. |
| `SUPABASE_DB_PASSWORD` | Yes | Supabase Postgres password used for server-side schema inspection when direct DB access is needed. |
| `AI_GATEWAY_API_KEY` | Yes | Vercel AI Gateway/Rork toolkit AI key used by IVX Owner AI backend. |
| `GITHUB_TOKEN` | Yes | GitHub API token for backend read/deployment diagnostics and future tool execution. |
| `GITHUB_REPO_URL` | No | GitHub repository URL for deployment diagnostics. |
| `AWS_ACCESS_KEY_ID` | Yes | AWS IAM access key for Route53/S3/CloudFront/deployment checks. |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS IAM secret key for Route53/S3/CloudFront/deployment checks. |
| `AWS_REGION` | No | AWS region for regional services. |
| `S3_BUCKET_NAME` | No | S3 bucket for web/static deployment checks. |
| `CLOUDFRONT_DISTRIBUTION_ID` | No | CloudFront distribution for CDN/deployment checks. |
| `EXPO_PUBLIC_API_BASE_URL` | No | Public API base URL, expected `https://api.ivxholding.com` in production. |
| `EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL` | No | Owner AI API base URL, expected `https://api.ivxholding.com` in production. |

## Required Render variables

Set these in Render for the backend service:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT=3000`
- `CHAT_DATABASE_PATH=/app/data/chat-room.sqlite`
- `CHAT_ALLOWED_ORIGINS=https://chat.ivxholding.com,https://api.ivxholding.com,https://ivx-chat-app.onrender.com`
- `EXPO_PUBLIC_CHAT_SOCKET_PATH=/socket.io`
- `EXPO_PUBLIC_APP_ENV=production`
- `EXPO_PUBLIC_API_BASE_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_CHAT_API_URL=https://api.ivxholding.com`
- `EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL=https://api.ivxholding.com`

Also add every required backend runtime variable from the table above.

## Optional backend variables

| Name | Secret | Purpose |
| --- | --- | --- |
| `AWS_SESSION_TOKEN` | Yes | Temporary AWS credentials when using STS sessions. |
| `SUPABASE_SERVICE_KEY` | Yes | Alternate name accepted for service role key. |
| `SUPABASE_DB_URL` | Yes | Explicit Supabase Postgres connection string. |
| `DATABASE_URL` | Yes | Generic Postgres connection string fallback. |
| `POSTGRES_URL` | Yes | Generic Postgres connection string fallback. |
| `SUPABASE_READONLY_DATABASE_URL` | Yes | Read-only inspection connection string. |
| `SUPABASE_INSPECTION_DATABASE_URL` | Yes | Dedicated inspection connection string. |
| `SUPABASE_DB_HOST` | No | Supabase database host override. |
| `SUPABASE_DB_PORT` | No | Supabase database port override. |
| `SUPABASE_DB_NAME` | No | Supabase database name override. |
| `SUPABASE_DB_USER` | No | Supabase database user override. |
| `DOMAIN_NAME` | No | Root domain used by AWS audit tooling, default `ivxholding.com`. |
| `IVX_OWNER_AI_MODEL` | No | Optional model override for Owner AI. |
| `EXPO_PUBLIC_IVX_AI_GATEWAY_URL` | No | Optional AI gateway root URL override. |
| `IVX_AI_GATEWAY_URL` | No | Backend-only AI gateway root URL override. |

## Expo public variables

These can be exposed to the app bundle:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_CHAT_API_URL`
- `EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL`
- `EXPO_PUBLIC_GOOGLE_ADS_API_KEY`
- `EXPO_PUBLIC_PROJECT_ID`
- `EXPO_PUBLIC_TEAM_ID`

Do not expose backend-only secrets with an `EXPO_PUBLIC_` prefix.

## Backend-only secrets

Never expose these to the Expo app bundle and never commit their values:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_DB_URL`
- `DATABASE_URL`
- `POSTGRES_URL`
- `AI_GATEWAY_API_KEY`
- `GITHUB_TOKEN`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`
- `JWT_SECRET`

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
