# IVX Holdings — Operations Runbook

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Client (Expo App)                      │
│  iOS / Android / Web (React Native + Expo Router)        │
│  Supabase JS Client → Auth, Realtime, Storage, REST     │
└────────────────┬────────────────────────────────────────┘
                 │
    ┌────────────▼────────────────┐
    │      Supabase (Primary)     │
    │  Auth · Postgres · Realtime │
    │  Storage · Edge Functions    │
    │  (source of truth for app)  │
    └────────────┬────────────────┘
                 │
    ┌────────────▼────────────────┐
    │      AWS (Supporting)       │
    │  S3 · CloudFront · ECS     │
    │  CloudWatch · Secrets Mgr  │
    │  Route53 · ACM · SSM       │
    └─────────────────────────────┘
```

**Supabase** is the primary backend for auth, database, realtime, and storage.
**AWS** provides supporting infrastructure: CDN, file storage, monitoring, secrets, and the containerized API backend.

---

## Environment Separation

| Environment | Supabase | AWS Secrets Path | Log Group Prefix | Purpose |
|-------------|----------|------------------|-------------------|---------|
| development | dev project or local | `ivx-holdings/development/` | `/ivx/development/` | Local dev, Expo Go |
| staging | staging project | `ivx-holdings/staging/` | `/ivx/staging/` | Pre-production testing |
| production | production project | `ivx-holdings/production/` | `/ivx/production/` | Live users |

### Environment Config (App-Side)
- `expo/lib/env-config.ts` — auto-detects environment from `__DEV__` and Supabase URL
- `expo/lib/env-validation.ts` — validates required env vars and flags production blockers

---

## AWS Configuration

### Services Used

| Service | Purpose | Config Location |
|---------|---------|-----------------|
| S3 | File storage (assets, uploads, backups) | `deploy/aws/s3-config.ts` |
| CloudFront | CDN for static assets and landing | `deploy/aws/cloudfront-config.json` |
| ECS Fargate | Containerized API backend | `deploy/aws/cloudformation.yml` |
| ALB | Load balancer for ECS | CloudFormation stack |
| Secrets Manager | Production secrets | `deploy/scripts/secrets.sh` |
| SSM Parameter Store | Non-secret config | `deploy/scripts/provision-aws.sh` |
| CloudWatch | Logs, metrics, alarms, dashboards | `deploy/scripts/provision-aws.sh` |
| Route 53 | DNS management | `deploy/scripts/setup-route53-ssl.mjs` |
| ACM | SSL certificates | `deploy/scripts/setup-route53-ssl.mjs` |
| ECR | Docker image registry | CloudFormation stack |
| IAM | Least-privilege access policies | `deploy/scripts/provision-aws.sh` |

### S3 Buckets

| Bucket | Purpose | Encryption | Versioning |
|--------|---------|------------|------------|
| `ivx-holdings-prod` | Production assets, documents, KYC | AES-256 | Enabled |
| `ivx-holdings-chat-uploads` | Chat attachments | AES-256 | Enabled |
| `ivx-holdings-backups` | Database backups | AES-256 | Enabled |
| `ivxholding.com` | Landing page static site | AES-256 | Optional |

### CloudWatch Log Groups

| Log Group | Retention | Purpose |
|-----------|-----------|---------|
| `/ivx/production/api` | 30 days | API request logs |
| `/ivx/production/chat` | 14 days | Chat system logs |
| `/ivx/production/auth` | 90 days | Authentication events |
| `/ivx/production/errors` | 90 days | Application errors |
| `/ivx/production/deployments` | 365 days | Deployment history |

---

## Supabase Configuration

### Required Tables (Core)
`profiles`, `wallets`, `transactions`, `holdings`, `notifications`, `properties`, `market_data`, `analytics_events`, `image_registry`, `push_tokens`, `jv_deals`, `landing_analytics`, `waitlist`

### Chat Tables
`conversations`, `conversation_participants`, `messages`

### IVX Owner AI Tables
`ivx_owner_ai_conversations`, `ivx_owner_ai_messages`, `ivx_owner_ai_inbox`, `ivx_owner_ai_files`

### Required Database Functions
`is_admin()`, `is_owner_of()`, `get_user_role()`, `verify_admin_access()`

### Storage Buckets
`chat-uploads`, `deal-photos`, `avatars`

### RLS Requirements
- `profiles`, `wallets`, `transactions`, `holdings` — must have RLS enabled
- `conversations`, `messages` — must have RLS enabled
- IVX owner tables — owner-only RLS policies
- The canonical `ivx-owner-room` UUID is fenced behind `ivx_is_owner()` in legacy chat tables

### Realtime
- Chat uses Supabase Realtime channels for message delivery
- Presence is used for typing indicators and online status
- Events per second: 2 (production), 5 (development)

---

## Secret Management

### Where Secrets Are Stored

| Secret | Location | Access |
|--------|----------|--------|
| `EXPO_PUBLIC_SUPABASE_URL` | Rork project env vars | Client-side (public) |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Rork project env vars | Client-side (public) |
| `SUPABASE_SERVICE_ROLE_KEY` | AWS Secrets Manager + Rork env | Server-side only |
| `SUPABASE_DB_PASSWORD` | AWS Secrets Manager + Rork env | Server-side only |
| `JWT_SECRET` | AWS Secrets Manager | Server-side only |
| `AWS_ACCESS_KEY_ID` | Rork env + AWS IAM | Server-side only |
| `AWS_SECRET_ACCESS_KEY` | Rork env + AWS IAM | Server-side only |
| `GITHUB_TOKEN` | AWS Secrets Manager + Rork env | CI/CD only |

### Rotating Secrets

1. **Supabase anon key**: Rotate in Supabase Dashboard > Settings > API, then update `EXPO_PUBLIC_SUPABASE_ANON_KEY` in Rork env and AWS Secrets Manager
2. **Supabase service role key**: Same process, update `SUPABASE_SERVICE_ROLE_KEY`
3. **JWT_SECRET**: Update in AWS Secrets Manager, redeploy ECS tasks
4. **AWS credentials**: Rotate in IAM console, update Rork env vars

### Verifying Secrets Are Not Exposed
- Run `expo/lib/env-config.ts` → `auditSecretExposure()` to check for misconfigurations
- Service role key must never equal anon key
- No secrets should appear in client-side JavaScript bundles

---

## Deployment Steps

### First-Time Setup
```bash
# 1. Provision AWS infrastructure
cd expo
bash deploy/scripts/provision-aws.sh production

# 2. Deploy CloudFormation stack (VPC, ECS, ALB, etc.)
bash deploy/scripts/setup-aws.sh

# 3. Set up DNS and SSL
node deploy/scripts/setup-route53-ssl.mjs

# 4. Set up CloudFront for landing page
node deploy/scripts/setup-cloudfront-landing.mjs

# 5. Validate everything
bash deploy/scripts/full-validate.sh production
```

### Subsequent Deployments
```bash
# Full deployment
bash deploy/scripts/master-deploy.sh production

# Or manual steps:
# 1. Validate pre-deploy
bash deploy/scripts/validate-deploy.sh production

# 2. Build and push Docker image
bash deploy/scripts/deploy.sh <image-tag>

# 3. Verify
bash deploy/scripts/health-check.sh https://api.ivxholding.com
```

### Rollback
```bash
bash deploy/scripts/rollback.sh
```

---

## Monitoring & Logs

### Viewing Logs
```bash
# Live API logs
aws logs tail /ivx/production/api --follow --region us-east-1

# Recent errors
aws logs tail /ivx/production/errors --follow --region us-east-1

# Chat system logs
aws logs tail /ivx/production/chat --follow --region us-east-1

# ECS task logs
aws logs tail /ecs/ivx-holdings-api --follow --region us-east-1
```

### CloudWatch Dashboard
Open the AWS Console > CloudWatch > Dashboards > `ivx-holdings-production`

### CloudWatch Alarms
- `ivx-holdings-high-error-rate` — ALB 5xx > 50 in 60s
- `ivx-holdings-high-latency` — p99 latency > 2s
- `ivx-holdings-high-concurrency` — Active connections > 15000

### App-Level Health Checks
- `expo/lib/startup-health.ts` — runs on every app launch (cached 2 min)
- `expo/lib/system-health-checker.ts` — detailed on-demand checks from admin UI
- `expo/lib/production-readiness.ts` — production readiness report

---

## Troubleshooting

### Chat not connecting to shared mode
1. Check Supabase Realtime is enabled in project settings
2. Verify `conversations`, `messages` tables exist: `node deploy/scripts/validate-supabase.mjs`
3. Check RLS policies allow authenticated users to read/write their rooms
4. Check browser console for `[RoomSyncManager]` log lines

### Auth failures
1. Verify `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set
2. Check Supabase Auth settings: email auth must be enabled
3. Verify `SUPABASE_SERVICE_ROLE_KEY` is a real service key (not matching anon key)
4. Check `expo/lib/auth-context.tsx` logs for role resolution

### S3 upload failures
1. Verify AWS credentials: `aws sts get-caller-identity`
2. Check IAM policy allows S3 access to the correct bucket
3. Verify bucket CORS allows your app origin
4. Check `expo/lib/backend-service.ts` logs

### ECS tasks not starting
1. Check CloudWatch logs: `/ecs/ivx-holdings-api`
2. Verify secrets are accessible: `aws secretsmanager get-secret-value --secret-id ivx-holdings/production/jwt-secret`
3. Check security group allows ALB → ECS traffic on port 3000
4. Verify Docker image exists in ECR

### CloudFront not serving
1. Check distribution status: `aws cloudfront get-distribution --id $DISTRIBUTION_ID`
2. Verify SSL certificate is validated
3. Check origin is accessible
4. Invalidate cache: `aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"`

---

## Supabase ↔ AWS Coupling

### What depends on Supabase
- All app authentication (GoTrue / Supabase Auth)
- Database queries (Postgres via REST/Realtime)
- Chat message delivery (Realtime channels)
- Typing indicators and presence (Realtime Presence)
- File uploads via Supabase Storage (chat-uploads, deal-photos, avatars)
- RLS policies for data access control

### What depends on AWS
- Landing page hosting (S3 + CloudFront)
- CDN for static assets (CloudFront)
- API backend container (ECS Fargate)
- Production secret management (Secrets Manager)
- Monitoring and alerting (CloudWatch)
- DNS and SSL (Route 53 + ACM)
- Database backups storage (S3)

### Future migration path to full AWS
To replace Supabase with AWS-backed services:
1. **Auth**: Migrate to Amazon Cognito or custom JWT auth
2. **Database**: Migrate Postgres to RDS or Aurora
3. **Realtime**: Replace with API Gateway WebSocket or AppSync
4. **Storage**: Already have S3 buckets; redirect upload paths
5. **RLS**: Implement at API layer or use RDS Postgres RLS

The `expo/lib/backend-service.ts` abstraction layer is designed to make this transition possible without rewriting UI components.

---

## Validation Commands

```bash
# Validate AWS infrastructure
bash deploy/scripts/validate-aws.sh production

# Validate Supabase production
node deploy/scripts/validate-supabase.mjs

# Full validation (AWS + Supabase + TypeScript)
bash deploy/scripts/full-validate.sh production

# Check system status
bash deploy/scripts/status.sh

# Health check API endpoint
bash deploy/scripts/health-check.sh https://api.ivxholding.com

# List all secrets
bash deploy/scripts/secrets.sh list

# Monitor live
bash deploy/scripts/monitor.sh
```
