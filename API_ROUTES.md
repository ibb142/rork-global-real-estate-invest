# IVX IA — API Routes

Backend: Hono on Bun, entry `server.ts` → `backend/hono.ts`. All routes are mounted both at `/api/*` and unprefixed `/*` for legacy compatibility unless noted.

Frozen at commit `da7c3c5ac79f`.

## Health & status (public)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness, AI provider/model marker. |
| GET | `/readiness` | Backend readiness probe. |
| GET | `/api/ivx/owner-access-repair/status` | Owner V7 repair backend marker. |
| GET | `/api/ivx/owner-ai/proxy-status` | AI proxy + audit logging counts. |
| GET | `/api/ivx/supabase/owner-action-health` | Service-role + Supabase REST verified. |
| GET | `/api/ivx/independence/status` | Rork-independence + brain-free score. |
| GET | `/api/ivx-owner-variables/status` | Owner variable proxy registration (no values). |
| GET | `/api/multimodal/status` | Multimodal route registry. |

## Public chat (no auth, rate-limited per hashed client)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/public/chat`, `/public/chat` | Send public chat message → ChatGPT reply, persisted to `public_chat_messages`. |
| POST | `/api/public/send-message`, `/public/send-message` | Legacy alias. |
| GET | `/api/public/chat/history`, `/public/chat/history` | `?sessionId=&limit=` — current-session history (Supabase). |
| GET | `/api/public/chat/sessions`, `/public/chat/sessions` | `?limit=` — recent sessions for hashed client identity. |
| GET | `/api/public/messages` | Public room message reload (legacy). |

Response shape (success): `{ ok: true, source: "chatgpt", model, endpoint, persistence: "supabase", block17Marker, deploymentMarker, rateLimitRemaining, rateLimitResetAt, answer }`.

## Owner AI proxy (Supabase bearer required)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/ivx/owner-ai` | Prompt-based owner AI request, retried via reliability layer client-side. Inserts row into `public.ai_usage_logs`. |

## Owner uploads (Supabase bearer required)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/upload` | Returns `{ bucket, path, signedUploadUrl, publicUrl, readUrl }` for `ivx-chat-uploads`. Default bucket: `ivx-chat-uploads`. |

## Owner transcription (Supabase bearer required)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/audio/transcribe`, `/audio/transcribe` | Multipart audio → ElevenLabs Scribe primary, Whisper fallback. |

## Owner multimodal (Supabase bearer required)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/multimodal/analyze` | Image/PDF/text analysis. Accepts `ivx-chat-uploads` and legacy `ivx-owner-files` storage paths. |

## Owner deploy / variables (Supabase bearer + confirmText required)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/ivx/developer-deploy/status` | Deploy capability snapshot (no secrets). |
| POST | `/api/ivx/developer-deploy/action` | Owner-confirmed deploy actions: `render_trigger_deploy`, `supabase_execute_sql`, `github_push`. Requires `confirmText` per action. |
| GET | `/api/ivx/owner-variables/status` | Owner-only env presence (names only, redacted values). |
| POST | `/api/ivx-owner-variables/self-sync` | Owner-confirmed env sync to Render. |
| GET | `/api/ivx-owner-variables/status` | Public-safe registration proof (no secrets). |

## IVX search (Supabase bearer required)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/ivx/search`, `/ivx/search` | Cross-conversation search across owner messages. |

## Search & misc

- WebSocket / Socket.IO mounted at `/socket.io` for live chat fanout.
- All write routes call `recordIVXOwnerChatAuditEvent` server-side and append to `public.audit_events` when applicable.

## Auth model

- Owner auth: Supabase JWT in `Authorization: Bearer <jwt>`. Verified against `SUPABASE_SERVICE_ROLE_KEY`.
- Public chat: hashed client identity (IP + UA hash) → rate-limit; no JWT.
- No tRPC. No GraphQL.

## Removed / unused routes (do not reintroduce)

- `/api/ivx/login` (validator-only alias).
- `/api/ivx/supabase/health` (validator-only alias).
