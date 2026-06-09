# IVX IA — Rork Exit / Independent Repo Migration

Block 20 freeze package. Goal: run IVX IA outside Rork without losing any current production behavior.

## 1. Frozen production state (2026-05-16)

- **GitHub repo**: `ibb142/rork-global-real-estate-invest`
- **Frozen commit**: `da7c3c5ac79fec1bb8d31fc0b5912a196e55c179` (`main`)
  - Last full bootstrap sync: 2026-05-16 23:08 UTC.
  - Verified via `GET https://api.github.com/repos/ibb142/rork-global-real-estate-invest/commits/main`.
- **Render service**: `ivx-holdings-platform` (id `srv-d7t9ivreo5us73ftose0`).
- **Last verified live deploy**: `dep-d84env57vvec73b7s16g` (commit `5aead5b…`, finished `2026-05-16T22:15:04Z`).
  Auto-deploy of `da7c3c5` triggered by Render commit hook.
- **Production proof (re-run 2026-05-16 23:08 UTC against `https://ivx-holdings-platform.onrender.com`)**:
  - `GET /health` → **HTTP 200**.
  - `POST /api/public/chat` (`exactToken: "IVX_POST_BOOTSTRAP_DA7C3C5"`) → **HTTP 200**, `source: "chatgpt"`, `model: "openai/gpt-4o-mini"`, `persistence: "supabase"`.
  - `GET /api/public/chat/sessions?limit=3` → **HTTP 200**.
  - `GET /api/public/chat/history?sessionId=public-session-block20-freeze&limit=20` → **HTTP 200**.
  - `POST /api/upload` (no bearer) → **HTTP 401** (owner-auth guard intact).
  - `GET /api/ivx/owner-ai/proxy-status` → **HTTP 200**.
  - Developer workspace (`/admin/ivx-developer-workspace`) deployed in production phone bundle (Block 18G).

This is the snapshot the migration must reproduce on the independent host.

## 2. Migration package contents

| File | Purpose |
|---|---|
| `MIGRATION.md` | This file — exit checklist + frozen-state proof. |
| `ARCHITECTURE.md` | Frontend + backend + storage + AI gateway map. |
| `ENVIRONMENT_VARIABLES.md` | Names-only env contract with public/private split. |
| `API_ROUTES.md` | All HTTP routes (public, owner, IA, audio, multimodal). |
| `SUPABASE_SCHEMA.md` | Tables, RLS, storage buckets, policies, realtime. |
| `DEPLOYMENT.md` | Independent deploy on Render / Docker / bare host. |
| `LOCAL_SETUP.md` | Clone → install → run locally without Rork. |

## 3. Migration order (do not skip)

1. Read `ARCHITECTURE.md` — understand the 3 surfaces (Expo phone, Hono backend, Supabase).
2. Provision Supabase + run `expo/deploy/supabase/ivx-platform-persistence-phase1.sql`.
3. Provision env vars per `ENVIRONMENT_VARIABLES.md`. Use a fresh `AI_GATEWAY_API_KEY` (`vck_*`).
4. Deploy backend per `DEPLOYMENT.md` (Render Docker is the proven path; Docker / Fly / Railway documented as drop-in).
5. Build Expo web/static + native bundles per `LOCAL_SETUP.md`.
6. Re-run the production proof commands listed in section 1 against the new host.

## 4. Rork-specific surfaces (must be removed/replaced before exit)

| Surface | Where it lives | Independent replacement |
|---|---|---|
| Rork project ID `jh1qrutuhy6vu1bkysoln` | `rork.json`, `.rorkignore`, `EXPO_PUBLIC_PROJECT_ID` | Drop `rork.json`. Free-form project id is unused outside Rork. |
| Rork-managed git remote (`origin = https://***@backend.rork.com/git/...`) | local clone only | Replace with GitHub remote: `git remote set-url origin https://github.com/<org>/<repo>.git`. |
| Rork **Sync workspace to GitHub** action (`expo/sync-github.mjs`) | Rork UI | Use plain `git push origin main`. The script remains usable as a CI helper but is not required. |
| Rork toolkit SDK (`@rork-ai/toolkit-sdk`, `withRorkMetro`) | already removed Phase 4e/4f, regression-guarded by `expo/scripts/verify-expo-sdk.mjs` | Keep the regression guard; do not reintroduce. |
| `EXPO_PUBLIC_RORK_*` envs | already removed Phase 4f | Stay removed. Public envs use `EXPO_PUBLIC_*` only. |
| Rork live preview (WebRTC simulators / iframe) | Rork hosted UI | Use Expo Go / EAS dev builds / `expo start --web` for local previews. |
| `.rork/` history + skills directory | only used by Rork agent | Add to `.gitignore`; safe to delete on the independent host. |

There is **no** Rork runtime dependency in the deployed app or backend at commit `da7c3c5`. Audit proof: `expo/scripts/verify-expo-sdk.mjs` exits non-zero if `@rork-ai/toolkit-sdk` reappears; `metro.config.js` uses default Expo config.

## 5. Independent setup (one-page version)

```bash
# 1. Clone and install
git clone https://github.com/<org>/<repo>.git ivx-ia && cd ivx-ia
bun install
cd expo && bun install && cd ..

# 2. Configure env
cp .env.example .env       # backend
cp expo/.env.example expo/.env  # client (public envs only)
# Fill values per ENVIRONMENT_VARIABLES.md

# 3. Apply Supabase schema
psql "$SUPABASE_DB_URL" -f expo/deploy/supabase/ivx-platform-persistence-phase1.sql

# 4. Run backend locally
bun --bun run server.ts        # serves on :3000

# 5. Run Expo client
cd expo && bunx expo start --tunnel

# 6. Deploy backend (Render example — see DEPLOYMENT.md for alternatives)
git push origin main           # Render auto-deploys via render.yaml
```

## 6. Final independence statement

At commit `da7c3c5`:

- The deployed backend (`server.ts` → `backend/hono.ts`) has zero Rork imports.
- The Expo client has zero `@rork-ai/toolkit-sdk` and zero `EXPO_PUBLIC_RORK_*` references.
- The only Rork-specific artifacts are workflow conveniences (`rork.json`, `.rorkignore`, `expo/sync-github.mjs`, `expo/bootstrap.sh`). All are optional and removable.

**No new features were added in Block 20. This is documentation only.**
