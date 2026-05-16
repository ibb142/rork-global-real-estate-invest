# IVX IA — Architecture

Frozen at commit `da7c3c5ac79fec1bb8d31fc0b5912a196e55c179` (Block 19).

## High-level diagram

```
┌─────────────────────┐         ┌────────────────────────────┐
│  Expo / RN client   │  HTTPS  │  Hono backend (server.ts)  │
│  expo/* (iOS/Web)   │ ──────▶ │  Render: ivx-holdings-     │
│                     │         │  platform / api.ivxholding │
└─────────┬───────────┘         └──────┬─────────────────────┘
          │ Supabase JS (anon)         │ service-role key
          │                            │
          ▼                            ▼
   ┌────────────────────┐      ┌──────────────────────────┐
   │ Supabase Auth +    │      │ Supabase Postgres + REST │
   │ Realtime + Storage │      │ Phase 1 owner tables     │
   │ (ivx-chat-uploads) │      │ + audit_events           │
   └────────────────────┘      └──────────────────────────┘
                                       │
                                       ▼
                          ┌──────────────────────────────┐
                          │ Vercel AI Gateway (vck_*)    │
                          │ → openai/gpt-4o-mini         │
                          │ + ElevenLabs Scribe / Whisper│
                          └──────────────────────────────┘
```

## Surfaces

### 1. Expo client (`expo/`)

- React Native + Expo Router (`expo/app/`).
- Entry: `expo/app/_layout.tsx` (wraps app in React Query + `PublicChatSessionProvider`).
- Public chat UI: `expo/app/chat-hub.tsx` (Block 17).
- Owner admin: `expo/app/admin/*` (guarded by `useAdminGuard`).
- Owner Code Workspace: `expo/app/admin/ivx-developer-workspace.tsx` (Block 18).
- IVX IA owner chat: `expo/app/ivx/chat.tsx` + `expo/src/modules/ivx-owner-ai/`.
- Reliability layer: `expo/src/modules/chat/services/aiReliability.ts` + `aiReplyService.ts` + `offlineQueueService.ts`.
- Public-chat client: `expo/lib/public-chat.ts` + `expo/lib/public-chat-session-context.tsx`.
- Persistence hooks: `expo/lib/platform-persistence.ts` (Phase 1 tables).

### 2. Backend (`backend/` + `server.ts`)

- Hono app entry: `server.ts` → `backend/hono.ts`.
- Public chat: `backend/api/public-chat.ts` + `backend/public-chat-ai.ts` + `backend/public-chat-supabase-store.ts`.
- Owner AI proxy: `backend/api/ivx-owner-ai.ts` (`/api/ivx/owner-ai`, `/proxy-status`).
- Owner uploads (signed URLs): `backend/api/owner-routes.ts` (`POST /api/upload`).
- Owner transcription: `backend/api/owner-transcription.ts` (`POST /api/audio/transcribe`).
- Owner multimodal: `backend/api/owner-multimodal.ts`.
- Owner variables / self-sync: `backend/api/ivx-owner-variables.ts`.
- Owner action health: `backend/hono.ts` `/api/ivx/supabase/owner-action-health`.
- Owner deploy actions: `backend/api/ivx-owner-deploy.ts` (`/api/ivx/developer-deploy/*`).
- Auth guard: bearer token validated against Supabase Auth using `SUPABASE_SERVICE_ROLE_KEY`.

### 3. Supabase

- Project ref: `kvclcdjmjghndxsngfzb` (replace on independent migration).
- Auth: email+password owner login, Supabase Auth user metadata holds owner role.
- Realtime: enabled on Phase 1 owner tables (see `SUPABASE_SCHEMA.md`).
- Storage: bucket `ivx-chat-uploads`, public read, 50 MB limit, MIME allowlist.
- DB: Phase 1 schema (`expo/deploy/supabase/ivx-platform-persistence-phase1.sql`) — 7 owner tables + storage bucket + helpers.

### 4. AI providers

- **Text**: Vercel AI Gateway (`https://ai-gateway.vercel.sh/v3/ai/openai/gpt-4o-mini`).
  Auth: `AI_GATEWAY_API_KEY` (`vck_*`, length 60).
- **Transcription**: ElevenLabs Scribe primary (`ELEVENLABS_API_KEY`), OpenAI Whisper fallback (`OPENAI_API_KEY` / `WHISPER_API_KEY`).
- **Vision/multimodal**: same gateway + model.

## Key data flows

### Public chat (`POST /api/public/chat`)

1. Client posts `{ message, sessionId, exactToken? }` with hashed-IP rate limit.
2. Backend persists user message → calls `generatePublicChatAnswer` → AI Gateway → persists assistant reply.
3. Returns `{ source: "chatgpt", model, persistence: "supabase", rateLimitRemaining, ... }`.
4. History/sessions: `GET /api/public/chat/history?sessionId=...`, `GET /api/public/chat/sessions`.

### Owner AI (`POST /api/ivx/owner-ai`)

1. Client sends owner bearer token + prompt.
2. Backend validates owner via Supabase service-role.
3. Calls AI Gateway. Inserts row in `public.ai_usage_logs`.
4. Audit trail in `public.audit_events`.

### Owner file upload

1. Client → owner-bearer `POST /api/upload` with `{ bucket: "ivx-chat-uploads", fileName, contentType }`.
2. Backend mints signed upload URL via Supabase service-role storage API.
3. Client `PUT`s bytes directly to signed URL.
4. Returns public read URL for chat persistence.

### IVX IA owner chat reliability

- `executeReliably` → owner AI proxy with abort, retry classifier, exponential backoff with jitter.
- Per-conversation in-flight cancellation.
- Offline queue persists failed sends in AsyncStorage; auto-flushes on `AppState=active` + connectivity probe.

## Module ownership map

| Concern | Source of truth |
|---|---|
| Routing (client) | `expo/app/_layout.tsx` + Expo Router file system |
| Routing (server) | `backend/hono.ts` |
| AI text generation | `backend/services/ivxAITextRuntime.ts` |
| AI brain tools | `backend/services/ivx-ai-brain-tool-executor.ts` |
| Supabase access (server) | `backend/lib/supabase-admin.ts` |
| Supabase access (client) | `expo/lib/supabase.ts` |
| Public chat persistence | `backend/public-chat-supabase-store.ts` |
| Memory / retrieval | `expo/src/modules/ivx-owner-ai/services/ivxOwnerMemoryService.ts` |
| Audit logging | `expo/src/modules/ivx-owner-ai/services/ivxOwnerChatActionAuditService.ts` + Supabase `audit_events` |

## Out-of-band: Rork artifacts

- `rork.json`, `.rork/`, `.rorkignore`, `expo/sync-github.mjs`, `expo/bootstrap.sh`, `expo/auto-sync.mjs`, `expo/verify-sync.mjs` — all optional, all removable on independent host.
- See `MIGRATION.md` § 4 for replacement table.
