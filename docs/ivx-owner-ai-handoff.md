# IVX Owner AI Ownership Handoff

Generated: 2026-04-12

## 1. Current status

### Development blockers
- Open-access development mode is enabled in `expo/lib/open-access.ts`.
- Dev dead-end inbox fallback is removed in `expo/src/modules/chat/screens/ChatModule.tsx`.
- Missing owner session is promoted to a dev owner context in `expo/lib/ivx-supabase-client.ts`.
- Assistant replies are persisted through the normal chat storage path in `expo/src/modules/chat/screens/ChatScreen.tsx`.

### What this proves in the codebase
- No sign-in wall for the current development build: `expo/lib/open-access.ts`
- No owner-room dead-end in dev: `expo/src/modules/chat/screens/ChatModule.tsx`
- Messages send through the shared chat provider: `expo/src/modules/chat/services/chatService.ts`, `expo/src/modules/chat/services/supabaseChatProvider.ts`
- Assistant replies persist via `chatService.sendMessage(...)` after AI generation: `expo/src/modules/chat/screens/ChatScreen.tsx`
- Backend AI route exists in both Expo API and Hono backend: `expo/app/api/ivx/owner-ai+api.ts`, `backend/api/ivx-owner-ai.ts`, `backend/hono.ts`

## 2. AI path architecture

### Frontend path
1. User opens inbox / room UI
2. `ChatModule` resolves room status and opens the owner room
3. `ChatScreen` sends owner messages through `chatService`
4. `supabaseChatProvider` routes writes through the active room backend
5. After owner send succeeds, `requestAIReply(...)` is called
6. AI reply is written back through `chatService.sendMessage(...)`
7. Query invalidation reloads persisted messages from storage

### Backend path
1. Client calls `/api/ivx/owner-ai` or `/ivx/owner-ai`
2. Backend verifies bearer token and owner role
3. Backend ensures the owner room exists
4. Backend loads recent messages and builds the prompt
5. Backend calls `generateText(...)` from `@rork-ai/toolkit-sdk`
6. Backend persists owner/assistant messages and AI request logs into Supabase
7. Response returns `{ requestId, conversationId, answer, model, status }`

### Realtime / fallback behavior
- Primary mode: IVX tables + Supabase realtime
- Alternate mode: generic conversations/messages tables
- Snapshot fallback: shared fallback path
- Local fallback: device-only persistence when shared writes are unavailable

Resolution logic lives in:
- `expo/src/modules/chat/services/ivxChat.ts`
- `expo/src/modules/chat/services/supabaseChatProvider.ts`
- `expo/src/modules/ivx-owner-ai/services/ivxTableResolver.ts`
- `expo/src/modules/chat/services/roomStateManager.ts`

## 3. Files involved in the AI flow

### Core constants and shared types
- `expo/constants/ivx-owner-ai.ts`
- `expo/shared/ivx/types.ts`
- `expo/shared/ivx/index.ts`

### Frontend AI chat experience
- `expo/app/chat-room.tsx`
- `expo/app/ivx/chat.tsx`
- `expo/app/ivx/inbox.tsx`
- `expo/src/modules/chat/screens/ChatModule.tsx`
- `expo/src/modules/chat/screens/ChatScreen.tsx`
- `expo/src/modules/chat/components/RoomHeader.tsx`
- `expo/src/modules/chat/components/Composer.tsx`
- `expo/src/modules/chat/components/MessageBubble.tsx`
- `expo/src/modules/chat/components/RoomConnectionBanner.tsx`
- `expo/src/modules/chat/components/PresenceBar.tsx`
- `expo/src/modules/chat/components/TypingIndicator.tsx`
- `expo/src/modules/chat/hooks/useChatMessages.ts`
- `expo/src/modules/chat/hooks/useRoomCapabilities.ts`
- `expo/src/modules/chat/hooks/useRoomSync.ts`

### Frontend services and auth / room resolution
- `expo/lib/open-access.ts`
- `expo/lib/ivx-supabase-client.ts`
- `expo/lib/supabase.ts`
- `expo/src/modules/chat/services/chatService.ts`
- `expo/src/modules/chat/services/chatProvider.ts`
- `expo/src/modules/chat/services/supabaseChatProvider.ts`
- `expo/src/modules/chat/services/chatRooms.ts`
- `expo/src/modules/chat/services/chatUploadConfig.ts`
- `expo/src/modules/chat/services/roomCapabilityResolver.ts`
- `expo/src/modules/chat/services/roomStateManager.ts`
- `expo/src/modules/chat/services/aiReplyService.ts`
- `expo/src/modules/chat/services/ivxChat.ts`

### Dedicated IVX owner AI services
- `expo/src/modules/ivx-owner-ai/services/ivxAIRequestService.ts`
- `expo/src/modules/ivx-owner-ai/services/ivxChatService.ts`
- `expo/src/modules/ivx-owner-ai/services/ivxFileUploadService.ts`
- `expo/src/modules/ivx-owner-ai/services/ivxInboxService.ts`
- `expo/src/modules/ivx-owner-ai/services/ivxTableResolver.ts`
- `expo/src/modules/ivx-owner-ai/services/index.ts`

### Backend API and server
- `expo/app/api/ivx/owner-ai+api.ts`
- `backend/api/ivx-owner-ai.ts`
- `backend/api/owner-only.ts`
- `backend/api/route53-dns.ts`
- `backend/api/index.ts`
- `backend/hono.ts`
- `server.ts`
- `.github/workflows/deploy.yml`
- `Dockerfile`

### Database / schema / storage
- `expo/supabase/ivx-owner-ai-phase1.sql`
- `expo/scripts/supabase-fix-everything.sql`
- `expo/scripts/supabase-full-schema.sql`
- `expo/constants/ivx-owner-ai-schema-sql.ts`
- `expo/constants/ivx-owner-admin-module-sql.ts`

## 4. Routes and endpoints involved

### User-facing app routes
- `/chat-room`
- `/ivx/chat`
- `/ivx/inbox`
- `/admin/chat-room`

### API routes
- `POST /api/ivx/owner-ai`
- `POST /ivx/owner-ai`
- `OPTIONS /api/ivx/owner-ai`
- `OPTIONS /ivx/owner-ai`
- `GET /health`
- `POST /api/aws/route53/audit`
- `POST /api/aws/route53/upsert`

## 5. Database tables involved in the AI path

### Primary IVX tables
- `ivx_conversations`
- `ivx_messages`
- `ivx_inbox_state`
- `ivx_ai_requests`
- `ivx_knowledge_documents`

### Alternate shared chat tables
- `conversations`
- `messages`
- `conversation_participants`
- `chat_rooms`
- `room_messages`
- `room_participants`
- `realtime_snapshots`

### Storage buckets
- `ivx-owner-files`
- `shared-chat-uploads`

## 6. Environment variables involved

### Required for AI path runtime
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EXPO_PUBLIC_RORK_API_BASE_URL`
- `EXPO_PUBLIC_TOOLKIT_URL`
- `EXPO_PUBLIC_PROJECT_ID`
- `EXPO_PUBLIC_TEAM_ID`
- `EXPO_PUBLIC_RORK_AUTH_URL`

### Backend / infrastructure / deployment
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET_NAME`
- `CLOUDFRONT_DISTRIBUTION_ID`
- `GITHUB_TOKEN`
- `GITHUB_REPO_URL`

### Optional / code-supported
- `IVX_OWNER_AI_MODEL`

### What each one does
- `EXPO_PUBLIC_SUPABASE_URL`: Supabase project URL for auth, DB, storage, realtime
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`: public client key for app auth and client data access
- `SUPABASE_SERVICE_ROLE_KEY`: backend admin key for owner-only verification and server-side writes
- `EXPO_PUBLIC_RORK_API_BASE_URL`: frontend base URL used to reach deployed backend APIs
- `EXPO_PUBLIC_TOOLKIT_URL`: toolkit base URL for AI requests
- `EXPO_PUBLIC_PROJECT_ID`: project-scoped dev URL resolution
- `EXPO_PUBLIC_TEAM_ID`: team-scoped project metadata
- `EXPO_PUBLIC_RORK_AUTH_URL`: auth origin used by project flows
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION`: AWS access for Route53 / deploy pipeline / infra checks
- `S3_BUCKET_NAME`: storage bucket configured elsewhere in the product infra
- `CLOUDFRONT_DISTRIBUTION_ID`: CDN invalidation target where used by deploy flows
- `GITHUB_TOKEN`: GitHub API access for repository automation where configured
- `GITHUB_REPO_URL`: repository reference for deployment / handoff visibility
- `IVX_OWNER_AI_MODEL`: model override for backend AI generation

## 7. Prompt logic ownership

### Backend prompt builder
- `backend/api/ivx-owner-ai.ts` → `buildPromptText(...)`
- Concise owner-first guidance
- Includes owner email, conversation title, recent transcript, and mode

### Frontend fallback prompt builder
- `expo/src/modules/chat/services/aiReplyService.ts` → `buildToolkitPrompt(...)`
- Used when backend is unavailable or network fetch fails
- Explicitly avoids claiming server-side actions completed

## 8. Conversation storage and assistant persistence

### Owner messages
- Sent through `chatService.sendMessage(...)`
- Stored in the active room backend path

### Assistant replies
- Generated through `requestAIReply(...)`
- Persisted through `chatService.sendMessage(...)`
- Survive query invalidation and room refresh

### AI request logs
- Backend writes AI request audit rows to `ivx_ai_requests`

## 9. Deploy steps

### Local development
#### Frontend
From `/home/user/rork-app/expo`:
- `bun install`
- `bun run start`

#### Backend
From `/home/user/rork-app`:
- `bun install`
- `bun run server.ts`

### Production backend deployment in repo
GitHub Actions workflow: `.github/workflows/deploy.yml`

What it does:
1. Runs on push to `main` for backend-related paths
2. Installs with Bun
3. Runs `bunx tsc --noEmit`
4. Builds Docker image
5. Pushes to ECR
6. Registers a new ECS task definition
7. Updates ECS service `ivx-holdings-api-service`
8. Waits for stability
9. Runs health check at `https://api.ivxholding.com/health`

### Exact production deploy trigger
- Push backend changes to `main`, or
- Run the GitHub Action manually via `workflow_dispatch`

## 10. Rollback steps

### Backend rollback
1. Open ECS task definitions for `ivx-holdings-api`
2. Identify the last healthy task definition revision
3. Update ECS service `ivx-holdings-api-service` to that task definition
4. Wait for ECS stability
5. Verify `GET /health`
6. Verify owner AI chat path with `POST /api/ivx/owner-ai`

### Database rollback
- Revert the SQL changes manually in Supabase SQL editor
- If only policies or seed data changed, restore previous policy definitions and room rows
- If schema migrations were additive only, prefer forward-fix over destructive rollback

### Frontend rollback
- Revert the branch / commit in your GitHub repo
- redeploy the app web/mobile build from your own pipeline

## 11. Secret rotation steps

### Supabase anon key
1. Generate / rotate key in Supabase
2. Update `EXPO_PUBLIC_SUPABASE_ANON_KEY` in app runtime config
3. Restart frontend
4. Verify auth, chat load, send, and realtime

### Supabase service role key
1. Rotate in Supabase
2. Update backend secret store / GitHub environment secret / ECS task env
3. Redeploy backend
4. Verify owner-only auth and AI persistence

### AWS keys
1. Create replacement IAM access key
2. Update GitHub Action secrets and backend runtime env
3. Redeploy backend if runtime uses keys directly
4. Disable old key only after Route53 audit and deploy health succeed

### GitHub token
1. Create replacement token or GitHub App credential
2. Update configured secret
3. Re-run deployment workflow
4. Revoke old token

## 12. DNS / AWS resources in the codebase

### Explicitly referenced AWS resources
- Route53 hosted zone for `ivxholding.com`
- API hostname `api.ivxholding.com`
- ECS cluster `ivx-holdings-cluster`
- ECS service `ivx-holdings-api-service`
- ECS task family `ivx-holdings-api`
- ECR repository `${APP_NAME}-api` where `APP_NAME=ivx-holdings`
- CloudFront distribution referenced by `CLOUDFRONT_DISTRIBUTION_ID`
- S3 bucket referenced by `S3_BUCKET_NAME`

### DNS tooling in repo
- Route53 audit and upsert handlers exist in `backend/api/route53-dns.ts`
- Required IAM actions for full DNS control:
  - `route53:ListHostedZonesByName`
  - `route53:ListResourceRecordSets`
  - `route53:ChangeResourceRecordSets`

## 13. GitHub workflow ownership surfaces

### Present in repo
- `.github/workflows/deploy.yml`

### Needed for true independent ownership
- Admin access to the GitHub repository
- Control over branches and branch protection
- Control over GitHub Actions secrets
- Control over environments and required reviewers

## 14. Monitoring and recovery

### Backend monitoring
- Health endpoint: `GET /health`
- ECS service stability in AWS
- GitHub Actions deploy logs
- Backend console logs from Bun / container runtime

### AI path monitoring
- Probe path in `aiReplyService.ts`
- `ivx_ai_requests` table for request audit trail
- Room status and storage mode resolution in chat provider services

### Recovery order
1. Verify `/health`
2. Verify `/api/ivx/owner-ai` auth and response
3. Verify owner room exists in `ivx_conversations`
4. Verify writes land in `ivx_messages`
5. Verify realtime / polling room updates
6. Verify frontend room open, send, assistant persistence

## 15. Hard proof available from the repository

### Development access proof
- `expo/lib/open-access.ts` hard-enables open access in this build
- `ChatModule.tsx` directly opens the owner room when inbox is empty or errored in dev
- `ivx-supabase-client.ts` returns a dev owner context if session is missing in open-access mode

### End-to-end AI persistence proof
- `ChatScreen.tsx` calls `requestAIReply(...)`
- On success it persists the reply via `chatService.sendMessage(...)`
- `supabaseChatProvider.ts` routes the write into the active storage backend

### Backend AI proof
- `backend/hono.ts` exposes `/api/ivx/owner-ai`
- `backend/api/ivx-owner-ai.ts` verifies owner access, persists messages, logs AI requests, and returns an AI answer
- `.github/workflows/deploy.yml` deploys the backend to ECS and health-checks the API

## 16. Ownership checklist

### Already in the repository
- Frontend source: yes
- Backend source: yes
- AI route code: yes
- Prompt logic: yes
- Database SQL: yes
- Deploy workflow file: yes
- DNS audit/upsert code: yes
- Env var inventory for AI path: yes
- Rollback and rotation instructions: yes

### Must still be transferred outside the repository for full independence
- GitHub repository admin ownership
- GitHub Actions secrets ownership
- AWS account ownership / IAM admin rights
- Route53 hosted zone admin rights
- ECS / ECR admin rights
- Domain registrar ownership or admin rights
- CloudFront admin rights
- S3 bucket admin rights
- Production log access
- Production secret manager / env store access

## 17. Definition-of-done gap report

### Completed in codebase
- Dev sign-in wall bypass for current development build
- Dev owner-room dead-end removed
- AI replies persist through chat storage
- Backend AI route exists and deploy pipeline exists
- Handoff documentation for the AI path is now present in the repo

### Remaining manual transfer items outside codebase
- Move repo ownership/admin to your GitHub account
- Move AWS production control to your AWS account or grant your account admin rights
- Move DNS/domain control to your account or grant your account admin rights
- Confirm production secret ownership and rotation authority under your control
- Capture live runtime screenshots from your own environment after logging into the transferred systems

## 18. Recommended final handoff proof pack to collect outside repo
- GitHub repo URL and your role screenshot
- GitHub Actions environment secrets access screenshot
- AWS account ID + IAM principal ARN + ECS/ECR/Route53 access screenshots
- Route53 hosted zone screenshot for `ivxholding.com`
- Domain registrar ownership screenshot
- ECS service health screenshot
- `/health` response screenshot
- IVX Owner AI room open + message send + assistant reply screenshot from dev build
