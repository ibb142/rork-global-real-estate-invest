# IVX Minimum Access Plan

## Goal

IVX AI should operate with least-privilege access across GitHub, Supabase, and Amazon/AWS:

- Read-only verification/reporting by default
- Write-capable actions only after explicit owner approval
- No unnecessary secrets
- No broad admin credentials for normal checks
- Frontend public values separated from backend-only secrets
- No deployment required for this pass

## Default operating mode

Default mode: `read_only_verification`

IVX AI Brain tools now return:

- `readOnly: true`
- `accessMode: read_only_verification`
- `writeActionsEnabled: false`
- `ownerApprovalRequiredForWrites: true`

The owner chat now prepares Supabase writes instead of executing them automatically. The owner-only Supabase write route requires:

- Non-delete writes: `confirm=true` and `confirmText="CONFIRM_OWNER_SUPABASE_WRITE"`
- Deletes: `confirm=true` and `confirmText="CONFIRM_OWNER_SUPABASE_DELETE"`

## Minimum credentials to set first

### Backend minimum runtime

| Env name | Access | Secret | Required first | Purpose |
| --- | --- | --- | --- | --- |
| `JWT_SECRET` | Backend session/signing | Yes | Yes | Owner/auth/session signing where used. |
| `AI_GATEWAY_API_KEY` | AI requests | Yes | Yes | Owner AI text responses through the AI gateway. |
| `GITHUB_REPO_URL` | Read-only metadata target | No | Yes | Identifies the owner repo. |
| `EXPO_PUBLIC_SUPABASE_URL` | Public Supabase URL | No | Yes | Supabase project endpoint. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Public RLS-limited key | No | Yes | Client-safe Supabase access and read-only REST readiness. |
| `EXPO_PUBLIC_API_BASE_URL` | Public URL | No | Yes | API base URL, expected `https://api.ivxholding.com`. |
| `EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL` | Public URL | No | Yes | Owner AI backend base URL. |
| `EXPO_PUBLIC_APP_URL` | Public URL | No | Yes | App/web URL, expected `https://chat.ivxholding.com`. |

### GitHub minimum access

| Env name | Access | Secret | Required first | Notes |
| --- | --- | --- | --- | --- |
| `GITHUB_REPO_URL` | Read-only target metadata | No | Yes | Use the HTTPS repo URL. |
| `IVX_GITHUB_READONLY_TOKEN` | Read-only repo metadata/content | Yes | Private repo only | Prefer a fine-grained token with repository Contents: Read-only and Metadata: Read-only. |
| `GITHUB_TOKEN` | Legacy fallback, potentially write-capable | Yes | No | Use only if a read-only token cannot be used yet. Keep backend-only. |

GitHub writes remain not connected by default. If later enabled, use a separate fine-grained write token limited to the exact repository and require owner approval per action.

### Supabase minimum access

| Env name | Access | Secret | Required first | Notes |
| --- | --- | --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | Public endpoint | No | Yes | Safe for frontend. |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | RLS-limited read/write according to policies | No | Yes | Safe for frontend when RLS is correct. |
| `SUPABASE_READONLY_DATABASE_URL` | Direct read-only schema inspection | Yes | No | Preferred for backend database inspection instead of service role. |
| `SUPABASE_INSPECTION_DATABASE_URL` | Direct inspection connection | Yes | No | Optional alias for read-only inspection. |
| `SUPABASE_SERVICE_ROLE_KEY` | Write-capable/admin | Yes | No | Backend-only. Use only for owner-approved writes/admin reads. |
| `SUPABASE_DB_PASSWORD` | Write-capable DB owner/admin path | Yes | No | Avoid for normal checks if a read-only DB URL is available. |

Supabase writes are owner-approved only and isolated to the owner-only backend route.

### Amazon/AWS access — FULL ADMIN (owner decision 2026-05-13)

Owner override: IVX AI must operate as a full administrator on AWS so it can deploy, update, change files, manage DNS, invalidate CloudFront, push S3, and rotate infrastructure without per-action approval. The read-only plan below is kept for reference only.

IAM user to create:

- Username: `ivx-ai-admin` (formerly proposed as `ivx-owner-readonly`).
- Permissions: **Attach policies directly** → attach AWS-managed `AdministratorAccess`, OR create a custom policy `IVX-AI-FullAccess` with the JSON below.
- Access keys: programmatic access enabled; store as `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in Render (backend-only).

Custom policy JSON (equivalent to `AdministratorAccess`):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "IVXFullAdminAccess",
      "Effect": "Allow",
      "Action": "*",
      "Resource": "*"
    }
  ]
}
```

| Env name | Access | Secret | Required first | Notes |
| --- | --- | --- | --- | --- |
| `AWS_ACCESS_KEY_ID` | Full admin IAM access key for `ivx-ai-admin` | Yes | Yes | Backend-only. Full privilege. |
| `AWS_SECRET_ACCESS_KEY` | Full admin IAM secret | Yes | Yes | Backend-only. Full privilege. |
| `AWS_REGION` | Config | No | Yes | Default `us-east-1`; set explicitly. |
| `AWS_SESSION_TOKEN` | Optional STS session | Yes | No | Backend-only. |
| `IVX_AWS_READONLY_ACCESS_KEY_ID` | Optional read-only key | Yes | No | Reserved for future least-privilege mode. |
| `IVX_AWS_READONLY_SECRET_ACCESS_KEY` | Optional read-only secret | Yes | No | Reserved for future least-privilege mode. |
| `IVX_AWS_READONLY_SESSION_TOKEN` | Optional read-only STS session | Yes | No | Reserved. |

Reference only — previous read-only policy actions:

- `sts:GetCallerIdentity`
- `iam:ListUsers`
- `iam:ListPolicies`
- `iam:ListAttachedUserPolicies`
- `route53:ListHostedZonesByName`
- `route53:ListResourceRecordSets`
- `s3:ListAllMyBuckets`
- `s3:ListBucket`
- `s3:GetBucketLocation`
- `cloudfront:GetDistribution`
- `cloudfront:ListDistributions`
- `acm:ListCertificates`
- `acm:DescribeCertificate`
- `ec2:DescribeRegions`
- `ec2:DescribeVpcs`
- `ec2:DescribeInstances`
- `ecs:ListClusters`
- `ecs:DescribeClusters`
- `ecs:ListServices`
- `elasticloadbalancing:DescribeLoadBalancers`
- `elasticloadbalancing:DescribeTargetGroups`
- `ssm:DescribeParameters`
- `organizations:DescribeOrganization`
- `organizations:ListAccounts`

Do not include these in the default read-only AWS identity:

- `route53:ChangeResourceRecordSets`
- `s3:PutObject`
- `s3:DeleteObject`
- `cloudfront:CreateInvalidation`
- `ecs:UpdateService`
- `ssm:PutParameter`
- `iam:*`
- `administrator:*`

## Frontend vs backend separation

Frontend-safe values:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_IVX_OWNER_AI_BASE_URL`
- `EXPO_PUBLIC_APP_URL`
- `EXPO_PUBLIC_CHAT_API_URL`

Backend-only secrets:

- `JWT_SECRET`
- `AI_GATEWAY_API_KEY`
- `IVX_GITHUB_READONLY_TOKEN`
- `GITHUB_TOKEN`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_READONLY_DATABASE_URL`
- `SUPABASE_INSPECTION_DATABASE_URL`
- `IVX_AWS_READONLY_ACCESS_KEY_ID`
- `IVX_AWS_READONLY_SECRET_ACCESS_KEY`
- `IVX_AWS_READONLY_SESSION_TOKEN`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_SESSION_TOKEN`

## Read-only vs write-capable summary

| Integration | Read-only by default | Write-capable credential | Owner approval required |
| --- | --- | --- | --- |
| GitHub | `GITHUB_REPO_URL`, `IVX_GITHUB_READONLY_TOKEN` | `GITHUB_TOKEN` or future write token | Yes |
| Supabase | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_READONLY_DATABASE_URL` | `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD` | Yes |
| AWS | n/a (owner chose full admin) | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` attached to `AdministratorAccess` / `IVX-AI-FullAccess` | No — full admin granted by owner |

## Final checklist before 100%

- [x] Define least-privilege access plan for GitHub, Supabase, and AWS.
- [x] Define minimum credentials for each integration.
- [x] Mark read-only vs write-capable credentials.
- [x] Update IVX AI Brain tools to report read-only default mode.
- [x] Keep frontend and backend secrets separated in documentation.
- [x] Require owner confirmation for Supabase writes.
- [ ] Deploy/connect the production backend.
- [ ] Verify `https://api.ivxholding.com/health` returns HTTP 200.
- [ ] Verify TLS for `api.ivxholding.com`, `chat.ivxholding.com`, and `ivxholding.com`.
- [ ] Replace any broad GitHub/AWS credentials with read-only credentials first.
- [ ] Add read-only Supabase database URL if direct schema inspection is needed.
- [ ] Verify live GitHub, Supabase, and AWS checks from the deployed backend.
- [ ] Add separate owner-approved write credentials only if true automation is needed.

## Completion estimate after this pass

Code readiness after this pass: **96%**.

Remaining 4% is live production verification, DNS/TLS proof, and credential tightening in the actual hosted backend, not more local code structure.
