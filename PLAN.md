# IVX Holdings — AWS Deployment Pipeline (COMPLETE)

All infrastructure-as-code and deployment automation is 100% built and ready.

## What's Built

- [x] **Dockerfile** — Multi-stage Bun build, health checks, graceful shutdown
- [x] **CloudFormation** — VPC, ECS Fargate, ALB, DynamoDB, S3, ECR, Auto Scaling, CloudWatch
- [x] **GitHub Actions** — `deploy.yml` (auto-deploy on push to main) + `infrastructure.yml` (manual)
- [x] **DNS + SSL Script** — `aws-full-setup.mjs` (Route53 hosted zone, ACM wildcard cert, DNS records)
- [x] **Deploy Scripts** — setup-aws.sh, deploy.sh, master-deploy.sh, validate-deploy.sh
- [x] **Ops Scripts** — status.sh, rollback.sh, health-check.sh, logs.sh, monitor.sh, cleanup.sh, secrets.sh
- [x] **Nginx Config** — Reverse proxy with rate limiting, SSL, WebSocket support
- [x] **Docker Compose** — Dev + production configs
- [x] **ECS Task Definition** — Secrets Manager integration for all env vars
- [x] **CodeBuild Spec** — buildspec.yml for CI/CD pipeline

## How to Deploy (3 Steps)

### Step 1: Sync Code to GitHub
Push your code to `ibb142/rork-global-real-estate-invest` on the `main` branch.
The sync script does this automatically — just make sure `GITHUB_TOKEN` is set.

### Step 2: Set GitHub Secrets
Go to **GitHub repo → Settings → Secrets and variables → Actions** and add:
- `AWS_ACCESS_KEY_ID` — Your AWS access key
- `AWS_SECRET_ACCESS_KEY` — Your AWS secret key

### Step 3: Run GitHub Actions (in order)
1. Go to **Actions → AWS Infrastructure Setup → Run workflow**
   - Select action: `setup-dns` → Run (creates Route53 zone + ACM certificate)
   - Wait 5-30 min for certificate validation
   - Select action: `validate` → Run (confirms everything is ready)
   - Select action: `deploy-stack` → Run (creates the full infrastructure)

2. Go to **Actions → Deploy IVX Holdings API → Run workflow**
   - This builds Docker image, pushes to ECR, and deploys to ECS
   - Future pushes to `main` branch auto-deploy

### After Deployment
- Health check: `curl https://api.ivxholding.com/health`
- View logs: `aws logs tail /ecs/ivx-holdings-api --follow`
- Check status: `./deploy/scripts/status.sh`
- Monitor: `./deploy/scripts/monitor.sh`
- Rollback: `./deploy/scripts/rollback.sh`
