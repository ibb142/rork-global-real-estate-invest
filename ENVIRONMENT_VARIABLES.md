# IVX IA — Environment Variables

Names only. Never commit real values. Public envs are inlined in client bundles; private envs stay server-side.

## Public (client-safe, `EXPO_PUBLIC_*`)

| Name | Required | Purpose |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | yes | Supabase project URL. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key for client auth/realtime. |
| `EXPO_PUBLIC_API_BASE_URL` | yes | Backend base URL (e.g. `https://api.ivxholding.com`). |
| `EXPO_PUBLIC_IVX_API_BASE_URL` | yes | Same as `EXPO_PUBLIC_API_BASE_URL` (legacy alias). |
| `EXPO_PUBLIC_API_URL` | yes | Same as above (legacy alias). |
| `EXPO_PUBLIC_PRODUCTION_API_URL` | yes | Same as above. |
| `EXPO_PUBLIC_CHAT_API_URL` | yes | Same as above. |
| `EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL` | yes | Owner AI proxy base URL (= API base). |
| `EXPO_PUBLIC_APP_URL` | yes | Public site URL (e.g. `https://chat.ivxholding.com`). |
| `EXPO_PUBLIC_APP_ENV` | yes | `production` / `staging` / `development`. |
| `EXPO_PUBLIC_CHAT_DEFAULT_ROOM_ID` | yes | `main-room`. |
| `EXPO_PUBLIC_CHAT_SOCKET_PATH` | yes | `/socket.io`. |
| `EXPO_PUBLIC_OWNER_EMAIL` | yes | Owner email for first-run repair. |
| `EXPO_PUBLIC_PROJECT_ID` | optional | Used by analytics; unused outside Rork. Safe to drop. |
| `EXPO_PUBLIC_TEAM_ID` | optional | Same. Safe to drop. |
| `EXPO_PUBLIC_GOOGLE_ADS_API_KEY` | optional | Only if Google Ads is enabled. |
| `EXPO_PUBLIC_IVX_CLIENT_DIRECT_GATEWAY` | optional, off | Emergency rollback flag for direct AI Gateway from client. Leave unset. |
| `EXPO_PUBLIC_IVX_CHAT_BACKEND_MODE` | optional | `remote_first` (default), `local_first`, `local`, `offline`. |

### Removed / forbidden public envs (Phase 4f)

- `EXPO_PUBLIC_RORK_API_BASE_URL`
- `EXPO_PUBLIC_RORK_AUTH_URL`
- `EXPO_PUBLIC_RORK_FUNCTIONS_URL`
- `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY`
- `EXPO_PUBLIC_TOOLKIT_URL`

`expo/scripts/verify-expo-sdk.mjs` fails the build if `@rork-ai/toolkit-sdk` reappears. Do not add these envs back.

## Private (server-only)

| Name | Required | Purpose |
|---|---|---|
| `AI_GATEWAY_API_KEY` | yes | Vercel AI Gateway key, **must start with `vck_`**, length 60. |
| `JWT_SECRET` | yes | Backend JWT signing for non-Supabase tokens. |
| `APP_SECRET` | auto | Render auto-generated. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-side Supabase admin access. |
| `SUPABASE_DB_URL` | yes | Direct Postgres URL for migrations. |
| `DATABASE_URL` | yes | Same (alias). |
| `POSTGRES_URL` | yes | Same (alias). |
| `SUPABASE_DB_PASSWORD` | yes | Used by some scripts. |
| `SUPABASE_MANAGEMENT_API_TOKEN` | optional | Required only if calling Supabase Management API. |
| `OWNER_NEW_PASSWORD` | optional | First-run repair only. |
| `OWNER_REPAIR_EMAIL` | optional | First-run repair only. |
| `IVX_OWNER_REGISTRATION_EMAILS` | yes | CSV of allowed owner emails. |
| `GITHUB_TOKEN` | optional | Only for self-sync feature. Scope: `contents:write`. **Do not grant `workflow` scope** (sync tree creation rejects it). |
| `GITHUB_REPO_URL` | optional | Same. |
| `RENDER_API_KEY` | optional | Only if backend should trigger its own redeploys. |
| `RENDER_SERVICE_ID` | optional | Same. |
| `RENDER_SERVICE_NAME` | optional | Same. |
| `AWS_ACCESS_KEY_ID` | optional | Only if S3/CloudFront delivery is enabled. |
| `AWS_SECRET_ACCESS_KEY` | optional | Same. |
| `AWS_REGION` | optional | Same. |
| `S3_BUCKET_NAME` | optional | Same. |
| `CLOUDFRONT_DISTRIBUTION_ID` | optional | Same. |
| `MINIO_HOST` | optional | Render `minio` private service host. |
| `MINIO_PASSWORD` | optional | Same. |
| `STRIPE_API_KEY` | optional | Only if billing is enabled. |
| `OPENAI_API_KEY` / `WHISPER_API_KEY` | optional | Whisper transcription fallback. |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_SECRET_KEY` | optional | ElevenLabs Scribe primary transcription. |

## Read order in code

- Expo / React Native: `process.env.EXPO_PUBLIC_*` only.
- Backend (Node/Bun): `process.env.*` direct.
- Never read private envs from client code.

## Independent-host checklist

1. Provision Supabase project → fill `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`.
2. Provision Vercel AI Gateway key → fill `AI_GATEWAY_API_KEY` (must be `vck_*`).
3. Decide owner email(s) → fill `IVX_OWNER_REGISTRATION_EMAILS`, `EXPO_PUBLIC_OWNER_EMAIL`.
4. Set base URLs to your new domain → fill all 6 `EXPO_PUBLIC_*_URL` aliases.
5. Generate `JWT_SECRET` (`openssl rand -hex 32`).
6. Optional: AWS / Stripe / Whisper / ElevenLabs / GitHub-self-sync.
