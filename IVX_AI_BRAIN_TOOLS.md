# IVX AI Brain Tools

The IVX backend includes owner-only read-only tool endpoints so IVX AI Brain can inspect deployment, GitHub, Supabase, AWS, DNS, TLS, and runtime health after the backend is deployed.

## Endpoints

- `GET /api/ivx/ai-brain/tools`
- `POST /api/ivx/ai-brain/tools/execute`

Both endpoints require a valid IVX owner session in the `Authorization` header.

## Tool executor files

- `backend/services/ivx-ai-brain-tool-executor.ts`
- `backend/api/ivx-ai-brain-tools.ts`
- `backend/hono.ts`

## Supported tools

| Tool | Purpose | Writes? |
| --- | --- | --- |
| `environment_checklist` | Lists required env var names and reports missing names only. | No |
| `github_repo_status` | Verifies GitHub repo API access, default branch, branches, and push metadata. | No |
| `supabase_runtime_check` | Verifies Supabase URL/key presence and REST OpenAPI reachability. | No |
| `aws_identity_check` | Calls STS `GetCallerIdentity` to confirm AWS runtime identity. | No |
| `iam_readiness_check` | Lists IAM users/local policies and optional user policy attachments for readiness planning. | No |
| `s3_readiness_check` | Checks configured S3 bucket or lists available buckets. | No |
| `cloudfront_readiness_check` | Checks configured CloudFront distribution or lists distributions. | No |
| `route53_dns_check` | Inspects Route53 hosted zone records and public DNS for a domain. | No |
| `dns_tls_check` | Probes public DNS and TLS certificate metadata for a domain. | No |
| `deployment_health_check` | Calls the configured `/health` URL and returns HTTP status/body. | No |

## Example requests

List tools:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN"
```

Environment checklist:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"environment_checklist"}'
```

Deployment health:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"deployment_health_check","input":{"url":"https://api.ivxholding.com/health"}}'
```

DNS/TLS check:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"dns_tls_check","input":{"domain":"api.ivxholding.com"}}'
```

Route53 check:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"route53_dns_check","input":{"domain":"api.ivxholding.com","rootDomain":"ivxholding.com"}}'
```

GitHub status:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"github_repo_status"}'
```

## Security rules

- Tool responses never include secret values.
- Missing credentials are reported by environment variable name only.
- All current tools are read-only.
- DNS writes remain isolated to the existing Route53 upsert endpoint and require explicit owner confirmation.
- Supabase writes remain isolated to `POST /api/ivx/supabase/owner-action` and destructive deletes require explicit confirmation.

## Required IAM capability plan

For full future automation, the AWS identity should have least-privilege access for:

- `sts:GetCallerIdentity`
- `route53:ListHostedZonesByName`
- `route53:ListResourceRecordSets`
- `route53:ChangeResourceRecordSets`
- `s3:ListBucket`
- `s3:HeadBucket`
- `s3:GetObject`
- `s3:PutObject`
- `cloudfront:GetDistribution`
- `cloudfront:ListDistributions`
- `cloudfront:CreateInvalidation`
- Read-only EC2/ECS/ELB/ACM diagnostics if AWS deployment is used.

## Deployment dependency

These tools become usable only after the backend service is deployed and reachable. The first required public proof remains:

```bash
curl -i https://api.ivxholding.com/health
```

Expected result: HTTP 200.
