# IVX Ownership Handoff Package

## Current hard proof available from this repo

- Repo remote: `https://backend.rork.com/git/jh1qrutuhy6vu1bkysoln`
- Current repo access level visible in the remote token payload: `editor`
- Main branch tracked in `.git/config`
- CI/CD workflows present in `.github/workflows/`:
  - `ci.yml`
  - `deploy.yml`
  - `deploy-landing.yml`
  - `infrastructure.yml`
  - `master-pipeline.yml`
  - `scheduled-sync.yml`
  - `sync-check.yml`
- Deployment scripts present in `deploy/scripts/`:
  - `setup-aws.sh`
  - `provision-aws.sh`
  - `deploy.sh`
  - `rollback.sh`
  - `status.sh`
  - `logs.sh`
  - `secrets.sh`
  - `validate-aws.sh`
  - `validate-deploy.sh`
  - `verify-api-domain.sh`
  - `setup-route53-ssl.mjs`
  - `setup-cloudfront-landing.mjs`
  - `fix-cloudfront-api-routing.mjs`

## What was changed now for development control

### IVX Owner AI dev unblock

Code updated to remove app-side dev blockers for the owner room flow:

- `lib/ivx-supabase-client.ts`
  - Open-access mode now creates a development owner context when no live owner session is present
  - Non-owner sessions in open-access mode are promoted to a dev-owner context for the IVX owner workspace
- `src/modules/ivx-owner-ai/services/ivxChatService.ts`
  - Owner conversation now opens even when live owner auth is unavailable
  - Owner messages now fall back to local persisted storage when shared tables or auth are unavailable
  - This prevents the room from becoming a dead-end in development

### Effect of this change

In development/open-access mode:

- owner room can open without a sign-in wall
- text messages can send without requiring a working owner auth session
- assistant replies can still work via the existing toolkit fallback path
- the room no longer hard-fails if the backend auth path is unavailable

## Architecture overview

### Frontend

- Expo Router app in `app/`
- Shared UI/components in `components/`
- Business logic and services in `lib/` and `src/modules/`
- IVX owner AI route: `app/ivx/chat.tsx`
- Generic chat module: `src/modules/chat/`
- IVX owner AI services: `src/modules/ivx-owner-ai/services/`

### Backend and service topology described by the repo

From `docs/DEPLOYMENT.md` and workflow files:

- DNS: Route53
- TLS: ACM certificate in `us-east-1`
- Entry: ALB on HTTPS
- Compute: ECS Fargate service
- Images: ECR
- Storage: S3
- Secrets: AWS Secrets Manager
- Data: Supabase for app data and IVX chat tables
- Optional toolkit-backed AI fallback through `EXPO_PUBLIC_TOOLKIT_URL`

## Frontend structure

Key app routes and modules:

- `app/_layout.tsx` root navigation/bootstrap
- `app/(tabs)/` main tab shell
- `app/login.tsx` sign-in screen
- `app/owner-access.tsx` owner recovery/open-access hub
- `app/chat-room.tsx` generic chat route
- `app/ivx/chat.tsx` IVX Owner AI room
- `src/modules/chat/` shared room UI, sync state, capability logic
- `src/modules/ivx-owner-ai/` owner-specific chat, AI request, room status, file upload services

## Backend structure

Repo-visible backend/deploy pieces:

- `app/api/ivx/owner-ai+api.ts` owner AI API route
- `deploy/aws/cloudformation.yml` infrastructure template
- `deploy/aws/ecs-task-definition.json` ECS task definition
- `Dockerfile` container build
- `docker-compose.yml` local runtime
- `docker-compose.prod.yml` production-style compose runtime
- `deploy/scripts/*.sh` operational scripts

## Deployment flow

### Backend deployment

Primary documented path:

1. Build Docker image
2. Push image to ECR
3. Register a new ECS task definition
4. Update ECS service
5. Wait for service stability
6. Hit API health check

This is automated in:

- `.github/workflows/deploy.yml`
- `.github/workflows/infrastructure.yml`

### Commands present in repo

Run from `expo/` unless noted otherwise:

```bash
bun install
bun run start
bun run start-web
bun run lint

./deploy/scripts/deploy.sh
./deploy/scripts/status.sh
./deploy/scripts/logs.sh --follow
./deploy/scripts/rollback.sh
./deploy/scripts/health-check.sh https://api.ivxholding.com
./deploy/scripts/secrets.sh list
./deploy/scripts/setup-aws.sh
./deploy/scripts/validate-aws.sh
./deploy/scripts/verify-api-domain.sh
```

## AWS resource map inferred from repo

Documented or referenced resources:

- Route53 hosted zone for `ivxholding.com`
- ACM certificate for `ivxholding.com` and subdomains
- ALB for `api.ivxholding.com`
- ECS cluster: `ivx-holdings-cluster`
- ECS service: `ivx-holdings-api-service`
- ECR repo for `ivx-holdings-api`
- S3 bucket referenced by env and scripts
- CloudFront distribution for landing/assets
- Secrets Manager namespace for application secrets
- CloudWatch logs used by `logs.sh`

## GitHub workflow map

- `ci.yml`: validation and checks
- `deploy.yml`: build and deploy app/API stack to AWS
- `deploy-landing.yml`: landing deployment path
- `infrastructure.yml`: infra validation, stack deploy, DNS setup, infra status
- `master-pipeline.yml`: orchestration pipeline
- `scheduled-sync.yml`: scheduled synchronization
- `sync-check.yml`: sync verification

## Environment variable inventory

### Present in the project/session

- `JWT_SECRET`
- `EXPO_PUBLIC_GOOGLE_ADS_API_KEY`
- `EXPO_PUBLIC_SUPABASE_URL`
- `SUPABASE_DB_PASSWORD`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `S3_BUCKET_NAME`
- `CLOUDFRONT_DISTRIBUTION_ID`
- `EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY`
- `GITHUB_TOKEN`
- `GITHUB_REPO_URL`
- `EXPO_PUBLIC_RORK_AUTH_URL`
- `EXPO_PUBLIC_RORK_API_BASE_URL`
- `EXPO_PUBLIC_TOOLKIT_URL`
- `EXPO_PUBLIC_PROJECT_ID`
- `EXPO_PUBLIC_TEAM_ID`

### System-provided public variables available to the app

- `EXPO_PUBLIC_RORK_DB_ENDPOINT`
- `EXPO_PUBLIC_RORK_DB_NAMESPACE`
- `EXPO_PUBLIC_RORK_DB_TOKEN`
- `EXPO_PUBLIC_RORK_API_BASE_URL`
- `EXPO_PUBLIC_TOOLKIT_URL`
- `EXPO_PUBLIC_PROJECT_ID`
- `EXPO_PUBLIC_TEAM_ID`
- `EXPO_PUBLIC_RORK_AUTH_URL`
- `EXPO_PUBLIC_RORK_APP_KEY`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Secret rotation guidance

### Supabase

- rotate anon key and service role key in Supabase
- update local `.env`
- update GitHub Actions secrets/variables
- redeploy API and client

### AWS

- create new IAM access key
- update GitHub Actions secrets
- update local `.env`
- verify S3/CloudFront/Route53 access before deleting old key

### JWT

- rotate `JWT_SECRET`
- restart all API instances
- expect existing signed sessions/tokens to become invalid unless a multi-key verify path exists

## DNS and TLS changes

Repo automation references:

- `deploy/scripts/setup-route53-ssl.mjs`
- `.github/workflows/infrastructure.yml`

Expected DNS/TLS flow:

1. Create or locate Route53 hosted zone
2. Request or locate ACM certificate in `us-east-1`
3. Create DNS validation records
4. Point `api.ivxholding.com` to ALB
5. Validate health with `verify-api-domain.sh` and `health-check.sh`

## Logs and monitoring

Available repo paths:

- `./deploy/scripts/logs.sh`
- `./deploy/scripts/status.sh`
- `./deploy/scripts/monitor.sh`
- `app/system-health.tsx`
- `app/backend-audit.tsx`
- `app/trust-center.tsx`

## Rollback and recovery

### App/API rollback

```bash
./deploy/scripts/rollback.sh
./deploy/scripts/rollback.sh <revision>
```

### Health verification after rollback

```bash
./deploy/scripts/status.sh
./deploy/scripts/health-check.sh https://api.ivxholding.com
```

### Local/dev recovery for IVX owner room

If shared auth or room tables fail in dev, the app now falls back to:

- synthetic dev-owner context in open-access mode
- local persisted owner messages
- toolkit-backed assistant replies when remote AI is unavailable

## Ownership status: what is actually transferred vs not yet transferred

### In your control from the repo itself

- frontend source code in this repository
- backend/deploy scripts stored in this repository
- infra templates stored in this repository
- workflow definitions stored in this repository
- env var names and integration map documented here

### Not proven transferred by this repo alone

These still require an external admin transfer or confirmation outside the codebase:

- GitHub admin/owner control over the repository
- ability to manage all branches and repo settings directly
- AWS account root/admin ownership
- Route53 hosted zone ownership/admin rights
- ACM certificate ownership/admin rights
- CloudFront admin rights
- S3 bucket admin rights
- Secrets Manager admin rights
- Supabase organization/project ownership
- domain registrar ownership
- live DNS zone admin rights
- live production logs/monitoring account access
- service-account and IAM-role inventory from the cloud account itself

## Hard-proof checklist still pending outside this environment

- [ ] GitHub repo owner/admin transfer confirmed in GitHub UI
- [ ] Branch protection/admin permissions confirmed
- [ ] AWS caller identity and account ownership confirmed from your account
- [ ] Route53 hosted zone permissions confirmed
- [ ] Domain registrar ownership confirmed
- [ ] ACM certificate admin access confirmed
- [ ] Supabase project/org ownership confirmed
- [ ] Production secret store ownership confirmed
- [ ] Live screenshot/proof captured from your own running dev session after testing

## Recommended final handoff steps

1. Move the repo to your GitHub org or grant yourself admin access
2. Rotate all secrets after transfer
3. Confirm AWS account access with IAM + billing visibility
4. Confirm Route53 + registrar ownership for `ivxholding.com`
5. Confirm Supabase organization/project ownership
6. Run the dev app and verify the IVX room opens, sends, and replies in your session
7. Run a deploy from your own GitHub/AWS credentials
8. Capture screenshots of successful dev room open and message roundtrip under your account
