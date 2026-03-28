# IVX Holdings — AWS Deployment Guide

## Architecture Overview

```
                    ┌─────────────┐
                    │   Route 53  │
                    │ api.ivxholding.com
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │     ALB     │
                    │  (HTTPS)    │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐┌────▼─────┐┌────▼─────┐
        │ ECS Task  ││ ECS Task ││ ECS Task │
        │ (Fargate) ││ (Fargate)││ (Fargate)│
        └─────┬─────┘└────┬─────┘└────┬─────┘
              │            │            │
    ┌─────────▼────────────▼────────────▼─────────┐
    │              Private Subnets                 │
    │  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
    │  │ DynamoDB  │  │    S3    │  │ Secrets   │  │
    │  │          │  │          │  │ Manager   │  │
    │  └──────────┘  └──────────┘  └───────────┘  │
    └──────────────────────────────────────────────┘
```

## Prerequisites

- AWS CLI v2 installed and configured
- Docker installed
- AWS account with admin access
- Domain name with Route 53 hosted zone
- ACM certificate for your domain

---

## Quick Start (First-Time Setup)

### 1. Configure AWS CLI

```bash
aws configure
# Enter: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, region (us-east-1)
```

### 2. Request ACM Certificate

```bash
aws acm request-certificate \
  --domain-name api.ivxholding.com \
  --subject-alternative-names "*.ivxholding.com" \
  --validation-method DNS \
  --region us-east-1
```

Validate the certificate via DNS (add the CNAME records shown in ACM console).

### 3. Run Initial Setup

```bash
export CERTIFICATE_ARN="arn:aws:acm:us-east-1:ACCOUNT_ID:certificate/YOUR_CERT_ID"
chmod +x deploy/scripts/setup-aws.sh
./deploy/scripts/setup-aws.sh
```

This script will:
- Store secrets in AWS Secrets Manager
- Build and push Docker image to ECR
- Deploy CloudFormation stack (VPC, ECS, ALB, DynamoDB, S3)
- Output the ALB DNS name

### 4. Point DNS

Create a CNAME record:
```
api.ivxholding.com → ALB_DNS_NAME (from setup output)
```

### 5. Verify

```bash
curl https://api.ivxholding.com/health
```

---

## Deployment Commands

### Deploy New Version

```bash
# Deploy with git commit hash as tag
./deploy/scripts/deploy.sh

# Deploy with custom tag
./deploy/scripts/deploy.sh v1.2.3
```

### Check Status

```bash
./deploy/scripts/status.sh

# With health check
API_URL=https://api.ivxholding.com ./deploy/scripts/status.sh
```

### View Logs

```bash
# Last 1 hour
./deploy/scripts/logs.sh

# Follow live
./deploy/scripts/logs.sh --follow

# Last 3 hours
SINCE=3h ./deploy/scripts/logs.sh
```

### Rollback

```bash
# Rollback to previous version
./deploy/scripts/rollback.sh

# Rollback to specific revision
./deploy/scripts/rollback.sh 5
```

### Health Check

```bash
./deploy/scripts/health-check.sh https://api.ivxholding.com
```

### Manage Secrets

```bash
# List all secrets
./deploy/scripts/secrets.sh list

# Set a secret
./deploy/scripts/secrets.sh set stripe-secret-key sk_live_xxx

# Import from .env file
./deploy/scripts/secrets.sh import .env

# Delete a secret
./deploy/scripts/secrets.sh delete old-secret-name
```

### Cleanup Old Resources

```bash
# Remove old ECR images and task definitions (keeps last 5)
./deploy/scripts/cleanup.sh

# Keep last 10
KEEP_IMAGES=10 ./deploy/scripts/cleanup.sh
```

---

## CI/CD (GitHub Actions)

Deployments auto-trigger on push to `main` when backend files change.

### Setup GitHub Secrets

In your repo: Settings > Secrets and variables > Actions:

| Secret | Value |
|--------|-------|
| `AWS_ACCESS_KEY_ID` | Your AWS access key |
| `AWS_SECRET_ACCESS_KEY` | Your AWS secret key |

### Setup GitHub Variables

Settings > Secrets and variables > Actions > Variables:

| Variable | Value |
|----------|-------|
| `API_URL` | `https://api.ivxholding.com` |

### Manual Deploy

Go to Actions > "Deploy IVX Holdings API" > Run workflow > Select environment.

---

## Docker Compose (Alternative to ECS)

### Local Development

```bash
docker-compose up --build
```

### Production (EC2/VPS)

```bash
# Copy files to server
scp .env.production docker-compose.prod.yml Dockerfile user@server:~/ivx/

# On server
docker-compose -f docker-compose.prod.yml up -d
```

---

## File Structure

```
deploy/
  aws/
    cloudformation.yml      # Full AWS infrastructure (VPC, ECS, ALB, DynamoDB)
    ecs-task-definition.json # ECS task definition template
    buildspec.yml           # AWS CodeBuild specification
  nginx/
    nginx.conf              # Nginx reverse proxy config (for docker-compose)
  scripts/
    setup-aws.sh            # One-time AWS infrastructure setup
    deploy.sh               # Build, push, and deploy new version
    rollback.sh             # Rollback to previous version
    status.sh               # Check infrastructure status
    logs.sh                 # View CloudWatch logs
    secrets.sh              # Manage AWS Secrets Manager
    health-check.sh         # Run health checks
    cleanup.sh              # Clean old images and task definitions

.github/
  workflows/
    deploy.yml              # GitHub Actions CI/CD pipeline

Dockerfile                  # Multi-stage Docker build
docker-compose.yml          # Local development
docker-compose.prod.yml     # Production with Nginx
.dockerignore               # Docker build exclusions
.env.example                # Full environment variable reference
.env.production             # Production env template (git-ignored)
```

---

## Infrastructure Details

### CloudFormation Resources

| Resource | Type | Purpose |
|----------|------|---------|
| VPC | 10.0.0.0/16 | Isolated network |
| Public Subnets (2) | Multi-AZ | ALB placement |
| Private Subnets (2) | Multi-AZ | ECS tasks |
| NAT Gateway | Single | Outbound internet for private subnets |
| ALB | Internet-facing | HTTPS termination, load balancing |
| ECS Cluster | Fargate | Container orchestration |
| ECS Service | 2 tasks (auto-scaling 2-10) | API service |
| DynamoDB | PAY_PER_REQUEST | Database |
| S3 Bucket | Versioned, encrypted | File storage |
| ECR | Scan on push | Docker image registry |
| Secrets Manager | Auto-generated JWT | Secret storage |
| CloudWatch Logs | 30-day retention | Logging |
| Auto Scaling | CPU 70% / Memory 80% | Scaling policies |

### Auto Scaling

- **Min tasks**: 2 (production), 1 (staging)
- **Max tasks**: 10 (production), 3 (staging)
- **Scale out**: CPU > 70% or Memory > 80%
- **Scale in cooldown**: 5 minutes

### Security

- All traffic via HTTPS (HTTP redirects to HTTPS)
- TLS 1.2+ only
- ECS tasks in private subnets
- Secrets stored in AWS Secrets Manager
- S3 bucket: public access blocked, AES-256 encryption, versioning enabled
- Rate limiting: 100 req/min per IP on tRPC endpoints

---

## Estimated Monthly Cost (Production)

| Service | Estimate |
|---------|----------|
| ECS Fargate (2 tasks, 0.5 vCPU, 1GB) | ~$30 |
| ALB | ~$18 |
| NAT Gateway | ~$32 |
| DynamoDB (on-demand) | ~$5-25 |
| S3 | ~$1-5 |
| ECR | ~$1 |
| CloudWatch Logs | ~$5 |
| Secrets Manager | ~$3 |
| **Total** | **~$95-120/mo** |

To reduce costs:
- Use 1 NAT Gateway instead of 2
- Use FARGATE_SPOT for non-critical tasks
- Reduce min task count to 1 if low traffic
