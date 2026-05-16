# IVX Owner Control Readiness

## Scope

IVX Owner AI is now structured to control and inspect these owner/business surfaces without deploying changes automatically:

1. `ivxholding` landing page
2. `ivxholding` app / React Native Web surface
3. Future IVX apps and business surfaces
4. GitHub repository state
5. Supabase project readiness
6. Amazon/AWS deployment and infrastructure readiness

## New owner-control structure

The backend AI Brain executor now includes a multi-app/project registry. By default it tracks:

| Surface | Type | Default URL | Purpose |
| --- | --- | --- | --- |
| `ivxholding-landing-page` | Landing page | `https://ivxholding.com` | Public business website readiness |
| `ivxholding-app` | Mobile/web app | `https://chat.ivxholding.com` | App/web export readiness |
| `ivxholding-backend-api` | Backend API | `https://api.ivxholding.com` | Owner AI and tool executor backend |
| `future-app-template` | Future app | Not connected yet | Expansion slot for future businesses/apps |

Future apps can be added with the optional `IVX_PROJECT_REGISTRY_JSON` environment variable. Use this shape:

```json
{
  "projects": [
    {
      "id": "new-business-app",
      "name": "New Business App",
      "type": "future_app",
      "url": "https://app.example.com",
      "healthUrl": "https://app.example.com/health",
      "repoUrl": "https://github.com/owner/repo",
      "branch": "main",
      "domains": ["app.example.com"],
      "requiredEnvNames": ["GITHUB_REPO_URL", "EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"],
      "deploymentTargets": ["Render", "AWS"],
      "notes": ["Owner-controlled IVX app surface"]
    }
  ]
}
```

Do not put secret values in `IVX_PROJECT_REGISTRY_JSON`; list environment variable names only.

## Added owner-level tools

The owner-only AI Brain executor now includes these additional read-only tools and minimum-access reporting:

| Tool | Purpose | Status behavior |
| --- | --- | --- |
| `project_registry` | Lists landing page, app, backend, and future-app control surfaces. | Shows configured/not connected surfaces honestly. |
| `project_surface_health` | Checks each surface URL, health URL, domains, required env names, and deployment target metadata. | Returns `verified`, `not_verified`, `not_connected`, or `missing_access`. |
| `code_repo_control_status` | Verifies GitHub repo API access, branch, and required deployment/control files. | Does not claim uncommitted local file visibility from deployed backend. |
| `deployment_readiness_matrix` | Aggregates project, repo, env, Supabase, deployment, DNS/TLS, AWS, logs, and setup readiness. | Shows blockers instead of fake readiness. |
| `owner_control_audit` | Audits the full owner-control scope and calculates live runtime readiness. | Lists missing/not connected/not verified items. |
| `owner_control_readiness_report` | Returns final owner-control readiness summary, completion percentage, and remaining work. | Reports code readiness and live runtime readiness separately. |
| `minimum_access_plan` | Reports least-privilege credentials, read-only defaults, and write-capable credential categories. | Shows missing access by environment variable name only. |

Existing tools remain available for GitHub, Supabase, AWS/IAM, S3, CloudFront, Route53, DNS/TLS, deployment health, logs, fix queue, setup export, and verification tests.

## Owner chat prompts now routed to tools

These prompt categories now route to the AI Brain executor before generic chat:

- “show owner control readiness”
- “audit full owner control”
- “show production readiness”
- “show multi-app/project registry”
- “check landing page health”
- “check app health”
- “verify repo/code control”
- “show deployment readiness matrix”
- “what remains before 100%?”

Tool answers include structured proof fields: `selectedTool`, `toolInput`, `toolOutput`, `fallbackUsed`, and `toolOutputs`.

## Current completion estimate after this pass

Code readiness after this pass: **96%**.

This means the repository now contains the main owner-control backend structure, read-only-by-default tool behavior, least-privilege credential plan, and docs, but live production cannot be called 100% complete until the external production services are connected and verified.

Live runtime readiness is intentionally calculated separately by `owner_control_audit` because it depends on deployed Render/AWS service state, DNS/TLS, environment variables, GitHub read-only token access, Supabase readiness, and AWS read-only IAM permissions.

## What is ready now

- Owner-only AI Brain tool executor structure
- Multi-app/project registry with future-app support
- Landing page/app/backend surface health checks
- GitHub repo/branch/required-file readiness checks
- Supabase runtime and readiness checks that use anon/read-only access first
- AWS deployment inventory checks that prefer `IVX_AWS_READONLY_*` credentials
- Minimum access plan tool and checklist
- Deployment readiness matrix
- Fix queue/status blocker reporting
- Setup export/reporting
- Control-room dashboard status rows for multi-app, surface health, repo control, and owner readiness
- Final readiness docs, including `IVX_MINIMUM_ACCESS_PLAN.md` and `IVX_FINAL_COMPLETION_PLAN.md`
- Render Docker Web Service configuration remains present
- Final completion report tool, routed from owner chat, with development completion %, production completion %, and blocked-by-AWS %

## What remains before 100%

1. Deploy or connect the backend through Render or AWS.
2. Verify `https://api.ivxholding.com/health` returns HTTP 200.
3. Verify `https://chat.ivxholding.com` resolves and has valid TLS.
4. Verify `https://ivxholding.com` landing page resolves and has valid TLS.
5. Configure only minimum production environment variables first.
6. Replace any broad GitHub/AWS credentials with fine-grained read-only credentials where possible.
7. Add `SUPABASE_READONLY_DATABASE_URL` if direct schema inspection is needed.
8. Keep `SUPABASE_SERVICE_ROLE_KEY`, broad GitHub tokens, and AWS write credentials backend-only and add them only for owner-approved write actions.
9. Verify live GitHub, Supabase, and AWS read-only checks from the deployed backend.
10. Connect hosted provider logs if in-app live log viewing is required.
11. Register each future app in `IVX_PROJECT_REGISTRY_JSON` once it exists.
12. Add separate owner-approved write credentials only if true automation is needed later.

## Validation commands

From repository root:

```bash
bun install
bunx tsc --noEmit --pretty false
bun server.ts
```

After the backend is running locally:

```bash
curl -i http://localhost:3000/health
curl -i http://localhost:3000/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"owner_control_readiness_report"}'

curl -i http://localhost:3000/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"minimum_access_plan"}'
```

Production verification after deployment:

```bash
curl -i https://api.ivxholding.com/health
curl -i https://api.ivxholding.com/api/ivx/ai-brain/tools/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer OWNER_SESSION_TOKEN" \
  -d '{"tool":"deployment_readiness_matrix"}'
```

## Security rules

- No secrets are committed.
- Missing secrets are listed by environment variable name only.
- Backend-only secrets must not use `EXPO_PUBLIC_` prefixes.
- Current AI Brain executor tools are read-only by default.
- Tool results include read-only/default access fields.
- Non-delete Supabase writes require `confirmText="CONFIRM_OWNER_SUPABASE_WRITE"`.
- Destructive database actions require `confirmText="CONFIRM_OWNER_SUPABASE_DELETE"`.
- Frontend values stay limited to `EXPO_PUBLIC_` values; backend-only secrets must never be bundled into the app.
