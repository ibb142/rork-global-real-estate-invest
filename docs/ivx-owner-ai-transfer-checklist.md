# IVX Owner AI Strict Transfer Checklist

Generated: 2026-04-12

## Transfer record

### Repository
- Repo URL: `GITHUB_REPO_URL`
- Required final owner/admin account: `________________`
- Current transfer status: `pending confirmation`
- Branches transferred:
  - `main`
  - `________________`
- Branch protection access transferred: `yes / no`
- GitHub Actions admin access transferred: `yes / no`
- GitHub secrets admin access transferred: `yes / no`

### AI path ownership scope
- Frontend AI chat experience: `repo-controlled`
- Backend AI routes: `repo-controlled`
- Prompt logic: `repo-controlled`
- Conversation storage: `Supabase-controlled`
- Assistant reply persistence: `repo-controlled + Supabase-controlled`
- Realtime delivery: `Supabase-controlled`
- Fallback behavior: `repo-controlled`
- Logs and monitoring: `GitHub + AWS + Supabase`
- DNS and AWS infrastructure: `AWS-controlled`

## Files to hand over

### Frontend
- `expo/app/chat-room.tsx`
- `expo/app/ivx/chat.tsx`
- `expo/app/ivx/inbox.tsx`
- `expo/src/modules/chat/screens/ChatModule.tsx`
- `expo/src/modules/chat/screens/ChatScreen.tsx`
- `expo/src/modules/chat/services/chatService.ts`
- `expo/src/modules/chat/services/supabaseChatProvider.ts`
- `expo/src/modules/chat/services/aiReplyService.ts`
- `expo/lib/open-access.ts`
- `expo/lib/ivx-supabase-client.ts`

### Backend
- `backend/api/ivx-owner-ai.ts`
- `backend/api/owner-only.ts`
- `backend/api/route53-dns.ts`
- `backend/hono.ts`
- `server.ts`
- `.github/workflows/deploy.yml`
- `Dockerfile`

### Database and storage
- `expo/supabase/ivx-owner-ai-phase1.sql`
- `expo/scripts/supabase-full-schema.sql`
- `expo/scripts/supabase-fix-everything.sql`

## Environment variable inventory

### Required runtime variables
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `EXPO_PUBLIC_RORK_API_BASE_URL`
- `EXPO_PUBLIC_TOOLKIT_URL`
- `EXPO_PUBLIC_PROJECT_ID`
- `EXPO_PUBLIC_TEAM_ID`
- `EXPO_PUBLIC_RORK_AUTH_URL`

### Infrastructure variables
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET_NAME`
- `CLOUDFRONT_DISTRIBUTION_ID`
- `GITHUB_TOKEN`
- `GITHUB_REPO_URL`

## AWS and DNS checklist
- AWS account ID verified: `yes / no`
- IAM principal verified: `yes / no`
- ECS cluster access: `yes / no`
- ECS service access: `yes / no`
- ECR access: `yes / no`
- S3 access: `yes / no`
- CloudFront access: `yes / no`
- Route53 hosted zone access: `yes / no`
- Required Route53 actions present:
  - `route53:ListHostedZonesByName`
  - `route53:ListResourceRecordSets`
  - `route53:ChangeResourceRecordSets`
- Domain registrar ownership/admin access: `yes / no`

## Database checklist
- `ivx_conversations` present: `yes / no`
- `ivx_messages` present: `yes / no`
- `ivx_inbox_state` present: `yes / no`
- `ivx_ai_requests` present: `yes / no`
- `ivx_knowledge_documents` present: `yes / no`
- Storage bucket `ivx-owner-files` present: `yes / no`
- Realtime publication enabled for IVX tables: `yes / no`

## Deploy steps

### Frontend dev
From `expo/`:
- `bun install`
- `bun run start`

### Backend dev
From repo root:
- `bun install`
- `bun run server.ts`

### Backend production
- Push to `main`, or run GitHub Action `Deploy IVX Owner AI Backend`
- Verify `GET https://api.ivxholding.com/health`
- Verify `POST /api/ivx/owner-ai`

## Rollback steps
- Revert to last healthy ECS task definition
- Re-run health check
- Verify owner AI room open, send, and reply flow
- Revert GitHub commit if frontend regression exists
- Prefer forward-fix for additive SQL changes

## Secret rotation steps
- Rotate `SUPABASE_SERVICE_ROLE_KEY`, update backend secret store, redeploy
- Rotate `EXPO_PUBLIC_SUPABASE_ANON_KEY`, update frontend runtime config, restart app
- Rotate AWS keys, update GitHub secrets/runtime env, verify deploy and Route53 audit, disable old keys
- Rotate `GITHUB_TOKEN`, update secret, rerun workflow, revoke old token

## Hard proof pack
- Repo URL screenshot
- GitHub admin access screenshot
- GitHub Actions secrets access screenshot
- AWS account/IAM identity screenshot
- Route53 hosted zone screenshot
- ECS service screenshot
- `/health` response screenshot
- IVX Owner AI room open screenshot
- Message send screenshot
- Assistant reply screenshot

## Done criteria
- Dev room opens without dead-end fallback
- Owner message sends successfully
- Assistant reply persists successfully
- Backend health check passes
- AI route responds successfully
- GitHub admin control transferred
- AWS and DNS admin control transferred
- Secret rotation authority transferred

## Remaining external blockers
- Repository ownership/admin must be granted outside the repo
- GitHub Actions secrets ownership must be granted outside the repo
- AWS IAM and account-level ownership must be granted outside the repo
- Route53 and domain registrar ownership must be granted outside the repo
- Live screenshots must be captured from the transferred runtime environment
