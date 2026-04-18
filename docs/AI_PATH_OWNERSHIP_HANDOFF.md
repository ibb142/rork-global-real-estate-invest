# AI Path Ownership Handoff

## Current repo remote

- Remote name: `origin`
- Exact current remote URL shape from `.git/config`: `https://backend.rork.com/git/jh1qrutuhy6vu1bkysoln`
- Current configured remote includes an embedded auth token in `.git/config`; do not share or reuse that token directly.
- Current branch tracked: `main`

## What is already in this codebase

This repo already contains both the app-side AI flow and a backend implementation for IVX Owner AI.

### Frontend AI path

Primary files:
- `expo/app/ivx/chat.tsx`
- `expo/app/ivx/inbox.tsx`
- `expo/app/chat-room.tsx`
- `expo/src/modules/chat/screens/ChatModule.tsx`
- `expo/src/modules/chat/screens/ChatScreen.tsx`
- `expo/src/modules/chat/services/aiReplyService.ts`
- `expo/src/modules/chat/services/chatRooms.ts`
- `expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts`
- `expo/src/modules/ivx-owner-ai/services/ivxChatService.ts`
- `expo/src/modules/ivx-owner-ai/services/ivxInboxService.ts`
- `expo/src/modules/ivx-owner-ai/services/ivxFileUploadService.ts`
- `expo/src/modules/ivx-owner-ai/services/ivxTableResolver.ts`
- `expo/lib/ivx-supabase-client.ts`
- `expo/lib/open-access.ts`
- `expo/constants/ivx-owner-ai.ts`
- `expo/shared/ivx/types.ts`

### Backend AI path

Primary files:
- `backend/hono.ts`
- `backend/api/index.ts`
- `backend/api/ivx-owner-ai.ts`
- `backend/api/owner-only.ts`
- `backend/api/route53-dns.ts`
- `server.ts`

### Database and storage assets tied to the AI path

Primary files:
- `expo/supabase/ivx-owner-ai-phase1.sql`
- `expo/scripts/supabase-full-schema.sql`
- `expo/scripts/supabase-owner-room-access-fix.sql`
- `expo/scripts/supabase-security-hotfix.sql`
- `expo/scripts/supabase-fix-everything.sql`

## AI flow architecture

### Request path

1. App opens IVX Owner AI inbox and room via:
   - `expo/src/modules/chat/screens/ChatModule.tsx`
   - `expo/app/ivx/chat.tsx`
2. Dev unblock logic is handled by:
   - `expo/lib/open-access.ts`
   - `expo/lib/ivx-supabase-client.ts`
3. Message send / room persistence is handled by:
   - `expo/src/modules/ivx-owner-ai/services/ivxChatService.ts`
4. AI request dispatch is handled by:
   - `expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts`
5. Primary backend endpoint is:
   - `POST /api/ivx/owner-ai`
6. Backend owner auth enforcement is handled by:
   - `backend/api/owner-only.ts`
7. Backend prompt build + AI generation + persistence is handled by:
   - `backend/api/ivx-owner-ai.ts`
8. Fallback AI generation exists in-app through toolkit when remote API is unavailable:
   - `expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts`
   - `expo/src/modules/chat/services/aiReplyService.ts`

### Development unblock status in code

The dev unblock path is already implemented in code:
- Open-access mode can promote a missing or non-owner session into a dev owner context in `expo/lib/ivx-supabase-client.ts`
- Empty inbox / inbox error now opens the IVX owner room directly in `expo/src/modules/chat/screens/ChatModule.tsx`
- Assistant replies are persisted through the storage path instead of only transient UI state

### Production protection status in code

Production owner protection is still enforced server-side:
- `backend/api/owner-only.ts` verifies bearer token via Supabase and checks owner role
- Non-owner requests are rejected for the backend AI route

## Exact AI routes and endpoints

### App/backend routes present in repo

- `GET /health`
- `POST /ivx/owner-ai`
- `POST /api/ivx/owner-ai`
- `OPTIONS /ivx/owner-ai`
- `OPTIONS /api/ivx/owner-ai`
- `POST /api/aws/route53/audit`
- `POST /api/aws/route53/upsert`
- `OPTIONS /api/aws/route53/audit`
- `OPTIONS /api/aws/route53/upsert`

### Frontend endpoint resolution order

`expo/lib/ivx-supabase-client.ts` builds candidate endpoints in this order:
1. `EXPO_PUBLIC_RORK_API_BASE_URL`
2. current web origin
3. `https://dev-jh1qrutuhy6vu1bkysoln.rorktest.dev`
4. `https://api.ivxholding.com`

Path appended:
- `/api/ivx/owner-ai`
- legacy fallback `/ivx/owner-ai`

## Exact env vars involved in the AI path

### Required for frontend app path

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_RORK_API_BASE_URL`
- `EXPO_PUBLIC_PROJECT_ID`
- `EXPO_PUBLIC_RORK_AUTH_URL`
- `EXPO_PUBLIC_TOOLKIT_URL`
- `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY`

### Required for backend AI path

- `EXPO_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `IVX_OWNER_AI_MODEL` if you want to override the default model; current code defaults to `gpt-4.1-mini`

### Required for AWS/DNS path used by this repo

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET_NAME`
- `CLOUDFRONT_DISTRIBUTION_ID`

### Repo/deployment metadata vars referenced by codebase

- `GITHUB_REPO_URL`
- `JWT_SECRET`
- `SUPABASE_DB_PASSWORD`
- `EXPO_PUBLIC_GOOGLE_ADS_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Exact database tables involved in the AI path

From `expo/shared/ivx/types.ts` and SQL scripts:
- `public.ivx_conversations`
- `public.ivx_messages`
- `public.ivx_inbox_state`
- `public.ivx_ai_requests`
- `public.ivx_knowledge_documents`

Also directly referenced by auth enforcement / owner access flow:
- `public.profiles`

## Exact storage bucket involved in the AI path

- `storage.buckets.id = 'ivx-owner-files'`

## Realtime / persistence path

- Message persistence is handled through Supabase-backed IVX tables
- Realtime publication is added in SQL scripts for IVX conversation/message tables
- Backend writes owner message, generates assistant response, stores assistant reply, updates conversation summary, and updates inbox state
- Local-device fallback exists when shared backend access is unavailable

## Exact deploy steps you can run yourself

### Frontend app

From `expo/package.json`:
- `bun install`
- `bun run start`
- `bun run start-web`
- `bun run start-clear`

### Backend

This repo has root-level Hono dependencies and `server.ts` / `backend/hono.ts`.
Use the project runtime that serves `server.ts` and the Hono app.

Minimum backend requirements before deploy:
- `EXPO_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- if using Route53 endpoints: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`

### Database / SQL

Apply, in order, the SQL needed for your environment:
1. `expo/supabase/ivx-owner-ai-phase1.sql` for IVX owner AI base schema
2. `expo/scripts/supabase-owner-room-access-fix.sql` for owner room access/RLS repair
3. `expo/scripts/supabase-security-hotfix.sql` for tightened RLS/storage if needed

If the environment is incomplete and you need the broad bootstrap path instead, review:
- `expo/scripts/supabase-full-schema.sql`
- `expo/scripts/supabase-fix-everything.sql`

## Exact rollback steps

### App rollback

- Repoint the deployed frontend to the previous build artifact or previous source revision in your deployment system
- If you need to stop remote AI usage quickly, remove `EXPO_PUBLIC_RORK_API_BASE_URL` or point it to the prior healthy backend
- The app will still retain local/toolkit fallback paths, but production owner enforcement stays on the backend path

### Backend rollback

- Restore the previous deployed Hono service revision for `backend/hono.ts`
- Repoint DNS for the AI/API host to the prior healthy target if the broken deploy changed routing
- Confirm `/health` and `POST /api/ivx/owner-ai` recover before switching traffic back

### Database rollback

- Restore from Supabase backup / PITR if schema or policy changes broke owner access
- If only owner-room policies broke, re-run the last known good owner-room policy script
- If only IVX tables broke, restore `ivx_*` tables and storage policies from a backup or a known-good migration set

## Exact secret rotation steps

### Supabase

1. Rotate `SUPABASE_SERVICE_ROLE_KEY` in Supabase
2. Update backend environment value everywhere the Hono service runs
3. Redeploy backend
4. Verify `POST /api/ivx/owner-ai` with an owner session

### Public anon/frontend keys

1. Rotate `EXPO_PUBLIC_SUPABASE_ANON_KEY` in Supabase
2. Update frontend environment values
3. Redeploy the app
4. Verify sign-in and IVX owner room access

### AWS

1. Create a new IAM access key for the deployment identity
2. Update `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in backend envs
3. Redeploy backend
4. Verify Route53 audit endpoint and any S3/CloudFront paths still work
5. Delete the old IAM key

### AI provider

This repo uses `@rork-ai/toolkit-sdk` in both frontend fallback and backend generation paths.
Rotate the toolkit/provider secret in the environment where the runtime is hosted, then redeploy both app/backend runtimes that consume it.

## DNS / AWS ownership details visible from code

### In code
- Route53 inspection and upsert endpoints exist in `backend/api/route53-dns.ts`
- Region defaults to `us-east-1` if `AWS_REGION` is missing
- Current hardcoded audit target defaults:
  - domain: `api.ivxholding.com`
  - root domain: `ivxholding.com`

### What this proves
- The repo contains code to inspect and change Route53 records
- The repo expects AWS credentials to exist at runtime
- The intended public AI/API hostname is `api.ivxholding.com`

### What is not proven from local repo inspection alone
- active AWS account ownership transfer
- active Route53 hosted zone admin rights for your user
- active CloudFront distribution ownership
- active S3 bucket ownership
- active registrar/domain ownership

## Hard proof available from this repo right now

### Proven directly by files in repo
- A working app-side IVX owner AI path exists
- A working backend-side IVX owner AI Hono path exists
- Owner-only production protection exists on the backend
- Dev open-access unblock exists in the frontend auth/session path
- Reply persistence exists in the storage-backed path
- SQL migrations for IVX AI tables, owner-room access, and storage policies exist
- Route53 audit/upsert backend endpoints exist
- The tracked remote currently points to project `jh1qrutuhy6vu1bkysoln`

### Not proven directly from local repo inspection alone
- your personal GitHub ownership/admin access
- your live AWS IAM/admin access
- your live DNS registrar access
- your live production deployment console access
- current production env values
- current production health of `api.ivxholding.com`

## Remaining external blockers to full handoff

These are outside the repo and must still be completed in the live accounts:
- move repo hosting to your GitHub org/user or grant you admin access there
- move deployment runtime ownership/admin access to your account
- grant or transfer Supabase project owner/admin access
- grant or transfer AWS IAM, Route53, S3, CloudFront, and certificate access
- grant or transfer domain registrar / DNS admin access
- confirm secret inventory in the live deployment platform
- verify live API hostname resolution and SSL in the target environment

## Definition-of-done status

### Done in codebase
- frontend AI chat experience present
- backend AI route present
- prompt logic present
- conversation storage present
- assistant reply persistence present
- fallback behavior present
- Route53 support endpoints present
- dev unblock path present in code

### Still requires live-account transfer outside codebase
- repo ownership transfer
- deployment admin transfer
- AWS account/resource transfer
- DNS/domain admin transfer
- production secret custody transfer
- production proof screenshots/logins from your accounts

## Final operator checklist

- [x] Repo remote identified
- [x] AI-path files inventoried
- [x] AI env vars inventoried
- [x] AI tables inventoried
- [x] AI routes inventoried
- [x] Deploy steps documented
- [x] Rollback steps documented
- [x] Secret rotation steps documented
- [x] Dev unblock path identified in code
- [ ] Live GitHub ownership transfer confirmed in your account
- [ ] Live AWS ownership/admin transfer confirmed in your account
- [ ] Live DNS/domain ownership/admin transfer confirmed in your account
- [ ] Live deployment console ownership/admin transfer confirmed in your account
- [ ] Live production API health verified from your account
