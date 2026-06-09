# IVX IA — Local Setup (Independent of Rork)

Run the entire IVX IA stack on your own machine without Rork.

## Prerequisites

- **Bun** ≥ 1.3.9 — https://bun.sh
- **Node** ≥ 20 (Bun ships its own, but Expo CLI uses Node)
- **Git**
- **Supabase project** (cloud or self-hosted)
- **Vercel AI Gateway API key** starting with `vck_` (length 60)
- iOS sim (Xcode) and/or Android emulator if testing native

## 1. Clone

```bash
git clone https://github.com/<your-org>/<your-repo>.git ivx-ia
cd ivx-ia
```

If you forked from Rork, also reset the remote:

```bash
git remote set-url origin https://github.com/<your-org>/<your-repo>.git
```

## 2. Install

```bash
# Backend deps (root)
bun install

# Expo deps
cd expo
bun install
cd ..
```

## 3. Configure environment

```bash
cp .env.example .env
cp expo/.env.example expo/.env
```

Fill values per `ENVIRONMENT_VARIABLES.md`. Minimum to boot:

**`.env`** (server):
```
AI_GATEWAY_API_KEY=vck_...                  # Vercel AI Gateway, must be vck_*, len 60
JWT_SECRET=$(openssl rand -hex 32)
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_DB_URL=postgresql://...
DATABASE_URL=postgresql://...
POSTGRES_URL=postgresql://...
IVX_OWNER_REGISTRATION_EMAILS=you@example.com
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_APP_URL=http://localhost:8081
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_OWNER_EMAIL=you@example.com
```

**`expo/.env`** (client, public only):
```
EXPO_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_IVX_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_PRODUCTION_API_URL=http://localhost:3000
EXPO_PUBLIC_CHAT_API_URL=http://localhost:3000
EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL=http://localhost:3000
EXPO_PUBLIC_APP_URL=http://localhost:8081
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_OWNER_EMAIL=you@example.com
EXPO_PUBLIC_CHAT_DEFAULT_ROOM_ID=main-room
EXPO_PUBLIC_CHAT_SOCKET_PATH=/socket.io
```

## 4. Apply Supabase schema

```bash
psql "$SUPABASE_DB_URL" -f expo/deploy/supabase/ivx-platform-persistence-phase1.sql
```

Or paste the file into Supabase Dashboard → SQL Editor and run.

Verify per `SUPABASE_SCHEMA.md` (9 tables, `ivx-chat-uploads` bucket, 2 storage policies).

## 5. Run backend

```bash
bun --bun run server.ts
# or for hot reload:
bun --hot run server.ts
```

Probe:

```bash
curl -s http://localhost:3000/health | jq
```

Expect `aiProvider: "chatgpt"`, `openAIModel: "openai/gpt-4o-mini"`.

## 6. Run Expo client

```bash
cd expo
bunx expo start --tunnel    # Expo Go
# or
bunx expo start --web       # web build at http://localhost:8081
# or
bunx expo run:ios           # native iOS sim
bunx expo run:android       # native Android emulator
```

The `bun start` script in `package.json` runs `verify-expo-sdk.mjs` first; this guards against `@rork-ai/toolkit-sdk` regression.

## 7. Smoke test end-to-end

```bash
# Public chat
curl -s -X POST http://localhost:3000/api/public/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"hello","sessionId":"local-1"}' | jq '.source'
# → "chatgpt"

# Owner login: open Expo client → /(auth)/login → enter your registered email + password.
# After login, /admin/ivx-developer-workspace should be reachable from Profile → Admin Panel.
```

## 8. Sync to GitHub (no Rork)

Plain git. The Rork sync helpers are not needed.

```bash
git add -A
git commit -m "feat: ..."
git push origin main
```

If you keep `expo/sync-github.mjs` as a CI helper, ensure `.rork`, `logs`, and `.github/workflows` stay in `IGNORE_DIRS` (already patched in commit `13a339fc`).

## 9. Deploy

See `DEPLOYMENT.md`. Render Blueprint is the proven path; Docker / Fly / Railway are drop-in.

## Common pitfalls

- **`Invalid state: ReadableStream is locked` from `POST /api/ivx/owner-ai`** — known issue from Block 18G. Fix queued; not blocking public chat or upload.
- **`Bucket not found` on first run** — Phase 1 migration not yet applied. Re-run `psql -f expo/deploy/supabase/ivx-platform-persistence-phase1.sql`.
- **`source: "fallback"` on `/api/public/chat`** — `AI_GATEWAY_API_KEY` is not `vck_*` or has expired. Replace and restart.
- **iOS native build fails on `expo-audio`** — confirm microphone usage description in `app.config.ts` extras.
- **Rork project ID warnings** — drop `rork.json` and `EXPO_PUBLIC_PROJECT_ID` if undesired; they are unused outside Rork.

## Useful commands

```bash
# Type check
bun run typecheck                # root + backend
cd expo && bunx tsc --noEmit     # client

# Lint
cd expo && bun run lint

# Tests
cd expo && bun test

# Verify Rork-free build
cd expo && bun scripts/verify-expo-sdk.mjs
```
