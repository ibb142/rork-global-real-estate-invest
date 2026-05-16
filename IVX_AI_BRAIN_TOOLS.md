# IVX AI Brain Tools

The IVX backend includes owner-only read-only tool endpoints so IVX AI Brain can inspect deployment, GitHub, Supabase, AWS, DNS, TLS, and runtime health after the backend is deployed.

## Endpoints

- `GET /api/ivx/ai-brain/tools`
- `POST /api/ivx/ai-brain/tools`
- `POST /api/ivx/ai-brain/tools/execute`
- `GET /api/ivx/developer-deploy/status`
- `POST /api/ivx/developer-deploy/action`

The AI Brain tool routes are read-only by default. The developer/deploy action route is write-capable but owner-only and confirmation-gated. All endpoints require a valid IVX owner session in the `Authorization` header.

## Tool executor files

- `backend/services/ivx-ai-brain-tool-executor.ts`
- `backend/api/ivx-ai-brain-tools.ts`
- `backend/api/ivx-developer-deploy-control.ts`
- `backend/hono.ts`

## Owner chat routing

`POST /api/ivx/owner-ai` now routes owner/developer status prompts to the AI Brain executor before generic chat. Prompts about environment variables, GitHub, Supabase readiness, AWS, DNS/TLS, deployment health, logs, fix queue, setup export, final completion, or verification tests execute read-only tools and return structured proof fields: `selectedTool`, `toolInput`, `toolOutput`, `fallbackUsed`, and `toolOutputs`.

## Supported tools

| Tool | Purpose | Writes? |
| --- | --- | --- |
| `environment_checklist` | Lists minimum runtime env var names, optional read-only env names, write-capable optional env names, reports missing names only, and embeds the secure credential request manifest snapshot. | No |
| `credential_request_manifest` | Returns the active variable file, registered credential names, future credential request fields, and the guarded Render env-var intake action without returning secret values. | No |
| `minimum_access_plan` | Reports the least-privilege access plan, read-only default mode, and read-only vs write-capable credential categories. | No |
| `github_repo_status` | Verifies GitHub repo API access, default branch, branches, latest commit metadata, and notes that uncommitted files are not verified from GitHub API. | No |
| `supabase_runtime_check` | Verifies Supabase URL/key presence and REST OpenAPI reachability. | No |
| `supabase_readiness_check` | Verifies Supabase REST, auth admin read path, storage bucket read path, and DB inspection credential readiness. | No |
| `aws_identity_check` | Calls STS `GetCallerIdentity` to confirm AWS runtime identity. | No |
| `iam_readiness_check` | Lists IAM users/local policies and optional user policy attachments for readiness planning. | No |
| `s3_readiness_check` | Checks configured S3 bucket or lists available buckets. | No |
| `cloudfront_readiness_check` | Checks configured CloudFront distribution or lists distributions. | No |
| `route53_dns_check` | Inspects Route53 hosted zone records and public DNS for a domain. | No |
| `dns_tls_check` | Probes public DNS and TLS certificate metadata for a domain. | No |
| `deployment_health_check` | Calls the configured `/health` URL and returns status/body. | No |
| `aws_acm_certificate_check` | Lists ACM certificates and matches by domain/SAN. | No |
| `aws_ec2_readiness_check` | Reads EC2 regions, VPCs, and instance previews. | No |
| `aws_ecs_readiness_check` | Reads ECS clusters and service previews. | No |
| `aws_elb_readiness_check` | Reads ALB/NLB load balancers and target groups. | No |
| `aws_ssm_readiness_check` | Reads SSM Parameter Store metadata without values. | No |
| `aws_organizations_check` | Reads AWS Organizations/account metadata when allowed. | No |
| `aws_deployment_inventory` | Runs an AWS read-only inventory across identity, IAM, S3, CloudFront, Route53, ACM, EC2, ECS, ELB, SSM, and Organizations. | No |
| `logs_status_summary` | Reports current backend log availability and whether an external hosted log viewer is connected. | No |
| `fix_queue_status` | Builds a blocker queue from environment, Supabase, deployment, DNS/TLS, GitHub, code/repo control, and AWS checks. | No |
| `setup_export` | Exports independent IVX setup instructions, required docs, routes, Render settings, project registry, and validation commands. | No |
| `run_verification_tests` | Runs a read-only verification bundle and returns checks plus blockers. | No |
| `project_registry` | Lists the multi-app/project control structure for the landing page, app, backend, and future apps. | No |
| `project_surface_health` | Checks landing/app/backend/future-app URLs, health URLs, domains, required env names, and deployment metadata. | No |
| `code_repo_control_status` | Verifies GitHub branch and required repo files for independent deployment/control readiness. | No |
| `deployment_readiness_matrix` | Aggregates project, repo, env, Supabase, deployment, DNS/TLS, AWS, logs, and setup readiness. | No |
| `owner_control_audit` | Audits full owner-control scope and calculates live runtime readiness. | No |
| `owner_control_readiness_report` | Returns completion percentage after this pass and remaining items before 100%. | No |
| `final_completion_report` | Returns the final completion report with already-complete items, remaining 100% blockers, development completion %, production completion %, and blocked-by-AWS %. | No |
| `developer_deploy_control_status` | Reports whether GitHub write, Render deploy/service, and Supabase migration credentials are configured by name only, plus required owner confirmation strings. | No |

## Example requests

List tools:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN"
```

Environment checklist:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"environment_checklist"}'
```

Secure credential request manifest:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"credential_request_manifest","input":{"includeOptional":true}}'
```

This proves the IVX AI variable file is active at `backend/config/ivx-credential-request-manifest.ts`, future credential intake is enabled through `render_upsert_env_var`, and `secretValuesReturned=false`.

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

Supabase readiness:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"supabase_readiness_check"}'
```

AWS deployment inventory:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"aws_deployment_inventory"}'
```

Final completion report:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"final_completion_report"}'
```

Fix queue and setup export:

```bash
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"fix_queue_status"}'

curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"setup_export"}'
```

## Developer/deploy control actions

`POST /api/ivx/developer-deploy/action` supports these owner-approved actions:

| Action | Capability | Required env | Confirmation text |
| --- | --- | --- | --- |
| `github_commit_file` | Commit/create/update a repo file through GitHub Contents API. | `GITHUB_TOKEN`, `GITHUB_REPO_URL` | `CONFIRM_IVX_GITHUB_WRITE` |
| `github_create_pull_request` | Create a pull request. | `GITHUB_TOKEN`, `GITHUB_REPO_URL` | `CONFIRM_IVX_GITHUB_WRITE` |
| `github_dispatch_workflow` | Trigger a GitHub Actions workflow dispatch. | `GITHUB_TOKEN`, `GITHUB_REPO_URL` | `CONFIRM_IVX_GITHUB_WRITE` |
| `render_trigger_deploy` | Trigger a Render deploy for the configured service. | `RENDER_API_KEY`, `RENDER_SERVICE_ID` | `CONFIRM_IVX_RENDER_DEPLOY` |
| `render_restart_service` | Restart the configured Render service. | `RENDER_API_KEY`, `RENDER_SERVICE_ID` | `CONFIRM_IVX_RENDER_SERVICE_UPDATE` |
| `render_upsert_env_var` | Add/update a Render environment variable without returning its value. | `RENDER_API_KEY`, `RENDER_SERVICE_ID` | `CONFIRM_IVX_RENDER_SERVICE_UPDATE` |
| `render_update_subdomain_policy` | Apply Render `serviceDetails.renderSubdomainPolicy` as `disabled` or `enabled` through the Render Update Service API. | `RENDER_API_KEY`, `RENDER_SERVICE_ID` | `CONFIRM_IVX_RENDER_SERVICE_UPDATE` |
| `supabase_execute_sql` | Run owner-approved SQL/schema migrations. | `SUPABASE_DB_URL` or `DATABASE_URL` or `POSTGRES_URL` | `CONFIRM_IVX_SUPABASE_MIGRATION` |

Example status proof:

```bash
curl -i https://api.ivxholding.com/api/ivx/developer-deploy/status \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN"
```

### Pre-live developer access proof

IVX Owner AI does **not** need the public app/custom domains to be live before developer access can be configured. It needs a reachable backend runtime with backend-only credentials loaded in that same runtime.

The developer/deploy status response now separates these two states:

- `preLiveAccessSupported=true`: local dev, staging, Render preview, or production can hold the credentials before public launch.
- `productionLiveRequiredForAccess=false`: public production is not required just to give IVX Owner AI access.
- `renderLiveBlocksIVXAccess=false`: Render public routing/custom-domain live status does not block IVX Owner AI developer access.
- `productionLiveRequiredForPublicProof=true`: public production proof still requires reachable custom domains and `/health` HTTP 200.
- `currentRuntimeCanExecuteCoreOwnerApprovedActions`: true only when the runtime receiving the request has `GITHUB_TOKEN`, `RENDER_API_KEY`, `RENDER_SERVICE_ID`, `SUPABASE_SERVICE_ROLE_KEY`, and one SQL URL fallback loaded.

Secret values are never returned; proof is by credential name/status only. If developer access is still false, the blocker is missing backend-only credentials in that reachable runtime, not Render being not-live.

## Security rules

- Tool responses never include secret values.
- Missing credentials are reported by environment variable name only.
- The credential request manifest is a names/metadata-only variable file; it is not a secret vault and does not store credential values.
- Future backend credentials are added only through secure host environment variables or the owner-approved `render_upsert_env_var` action when Render API credentials are loaded in the backend runtime.
- Render service settings such as `renderSubdomainPolicy` are changed only through the owner-approved `render_update_subdomain_policy` action or Render Blueprint sync; secret values are never returned.
- All AI Brain executor tools are read-only by default and return `accessMode: read_only_verification`.
- Write-capable actions are disabled by default and require explicit owner approval.
- Developer/deploy actions never execute unless `confirm=true` and the exact action-specific `confirmText` are provided.
- SSM tooling returns parameter metadata only, never parameter values.
- DNS writes remain isolated to the existing Route53 upsert endpoint and require explicit owner confirmation.
- Supabase row writes remain isolated to `POST /api/ivx/supabase/owner-action`; non-delete writes require `confirmText="CONFIRM_OWNER_SUPABASE_WRITE"`, and deletes require `confirmText="CONFIRM_OWNER_SUPABASE_DELETE"`.
- Supabase schema/SQL migrations remain isolated to `POST /api/ivx/developer-deploy/action` with `action="supabase_execute_sql"` and `confirmText="CONFIRM_IVX_SUPABASE_MIGRATION"`.

## Required IAM capability plan

For read-only verification, the AWS identity should have least-privilege access for:

- `sts:GetCallerIdentity`
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

Do not include write actions such as `route53:ChangeResourceRecordSets`, `s3:PutObject`, `s3:DeleteObject`, `cloudfront:CreateInvalidation`, `ecs:UpdateService`, `ssm:PutParameter`, or broad `iam:*`/administrator permissions in the default read-only identity.

## Runtime dependency

These tools become usable when an IVX backend runtime is reachable. That runtime can be local dev, staging, a Render preview/service URL, or production.

Public production proof is a separate requirement. The first required production-live proof remains:

```bash
curl -i https://api.ivxholding.com/health
```

Expected production-live result: HTTP 200. If this fails, IVX can still have pre-live access in another reachable backend runtime, but public production proof cannot be marked complete yet.
