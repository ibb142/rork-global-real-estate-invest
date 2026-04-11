#!/bin/bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

APP_NAME="${APP_NAME:-ivx-holdings}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${1:-production}"

PASS=0
FAIL=0
WARN=0

pass() { echo -e "  ${GREEN}[PASS]${NC} $1"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $1"; WARN=$((WARN + 1)); }
step() { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${NC}"; }

echo ""
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  IVX Holdings — AWS Validation (${ENVIRONMENT})${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

command -v aws >/dev/null 2>&1 || { fail "aws CLI not found"; exit 1; }
aws sts get-caller-identity >/dev/null 2>&1 || { fail "AWS credentials not configured"; exit 1; }
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
pass "Authenticated — Account: $ACCOUNT_ID"

# ─── S3 BUCKETS ──────────────────────────────────────────────────
step "S3 Buckets"

check_bucket() {
  local bucket="$1"
  local label="$2"
  if aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
    VERSIONING=$(aws s3api get-bucket-versioning --bucket "$bucket" --query 'Status' --output text 2>/dev/null || echo "Disabled")
    ENCRYPTION=$(aws s3api get-bucket-encryption --bucket "$bucket" --query 'ServerSideEncryptionConfiguration.Rules[0].ApplyServerSideEncryptionByDefault.SSEAlgorithm' --output text 2>/dev/null || echo "None")
    PUBLIC=$(aws s3api get-public-access-block --bucket "$bucket" --query 'PublicAccessBlockConfiguration.BlockPublicAcls' --output text 2>/dev/null || echo "false")

    if [ "$VERSIONING" = "Enabled" ] && [ "$ENCRYPTION" != "None" ] && [ "$PUBLIC" = "True" ]; then
      pass "$label ($bucket) — versioned, encrypted, public blocked"
    else
      warn "$label ($bucket) — versioning=$VERSIONING encryption=$ENCRYPTION publicBlocked=$PUBLIC"
    fi
  else
    fail "$label ($bucket) — does not exist"
  fi
}

check_bucket "${APP_NAME}-prod" "Production assets"
check_bucket "${APP_NAME}-chat-uploads" "Chat attachments"
check_bucket "${APP_NAME}-backups" "Database backups"

# ─── SECRETS MANAGER ────────────────────────────────────────────
step "Secrets Manager"

SECRETS=$(aws secretsmanager list-secrets \
  --filter "Key=name,Values=${APP_NAME}/${ENVIRONMENT}/" \
  --region "$AWS_REGION" \
  --query 'SecretList[].Name' \
  --output text 2>/dev/null || echo "")

if [ -n "$SECRETS" ]; then
  SECRET_COUNT=$(echo "$SECRETS" | wc -w)
  pass "Found $SECRET_COUNT secrets in ${APP_NAME}/${ENVIRONMENT}/"

  REQUIRED_SECRETS="supabase-url supabase-anon-key supabase-service-role-key jwt-secret"
  for sec in $REQUIRED_SECRETS; do
    FULL_NAME="${APP_NAME}/${ENVIRONMENT}/${sec}"
    if echo "$SECRETS" | grep -q "$sec"; then
      VALUE=$(aws secretsmanager get-secret-value --secret-id "$FULL_NAME" \
        --query 'SecretString' --output text --region "$AWS_REGION" 2>/dev/null || echo "")
      if [ -n "$VALUE" ] && [ "$VALUE" != "PLACEHOLDER_REPLACE_ME" ] && [ "$VALUE" != "PLACEHOLDER" ]; then
        pass "$sec — has real value"
      else
        fail "$sec — still has placeholder value"
      fi
    else
      fail "$sec — missing from Secrets Manager"
    fi
  done
else
  fail "No secrets found in ${APP_NAME}/${ENVIRONMENT}/"
fi

# ─── CLOUDWATCH ──────────────────────────────────────────────────
step "CloudWatch"

LOG_GROUPS="/ivx/${ENVIRONMENT}/api /ivx/${ENVIRONMENT}/chat /ivx/${ENVIRONMENT}/auth /ivx/${ENVIRONMENT}/errors /ivx/${ENVIRONMENT}/deployments"
for lg in $LOG_GROUPS; do
  EXISTS=$(aws logs describe-log-groups --log-group-name-prefix "$lg" --region "$AWS_REGION" \
    --query "logGroups[?logGroupName=='$lg'].logGroupName" --output text 2>/dev/null || echo "")
  if [ -n "$EXISTS" ]; then
    RETENTION=$(aws logs describe-log-groups --log-group-name-prefix "$lg" --region "$AWS_REGION" \
      --query "logGroups[?logGroupName=='$lg'].retentionInDays" --output text 2>/dev/null || echo "never")
    pass "Log group: $lg (retention: ${RETENTION}d)"
  else
    fail "Log group missing: $lg"
  fi
done

DASHBOARD=$(aws cloudwatch list-dashboards --region "$AWS_REGION" \
  --query "DashboardEntries[?DashboardName=='${APP_NAME}-${ENVIRONMENT}'].DashboardName" \
  --output text 2>/dev/null || echo "")
if [ -n "$DASHBOARD" ]; then
  pass "CloudWatch dashboard: ${APP_NAME}-${ENVIRONMENT}"
else
  warn "CloudWatch dashboard not found: ${APP_NAME}-${ENVIRONMENT}"
fi

# ─── SSM PARAMETERS ─────────────────────────────────────────────
step "SSM Parameter Store"

PARAMS=$(aws ssm describe-parameters \
  --parameter-filters "Key=Name,Option=BeginsWith,Values=/${APP_NAME}/${ENVIRONMENT}/" \
  --region "$AWS_REGION" \
  --query 'Parameters[].Name' \
  --output text 2>/dev/null || echo "")

if [ -n "$PARAMS" ]; then
  PARAM_COUNT=$(echo "$PARAMS" | wc -w)
  pass "Found $PARAM_COUNT SSM parameters in /${APP_NAME}/${ENVIRONMENT}/"
else
  warn "No SSM parameters in /${APP_NAME}/${ENVIRONMENT}/"
fi

# ─── IAM POLICY ──────────────────────────────────────────────────
step "IAM"

POLICY_ARN=$(aws iam list-policies --scope Local \
  --query "Policies[?PolicyName=='${APP_NAME}-${ENVIRONMENT}-app-policy'].Arn" \
  --output text 2>/dev/null || echo "")

if [ -n "$POLICY_ARN" ] && [ "$POLICY_ARN" != "None" ]; then
  pass "App IAM policy: ${APP_NAME}-${ENVIRONMENT}-app-policy"
else
  warn "App IAM policy not found: ${APP_NAME}-${ENVIRONMENT}-app-policy"
fi

# ─── CLOUDFORMATION STACK ───────────────────────────────────────
step "CloudFormation"

STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name "${APP_NAME}-stack" \
  --region "$AWS_REGION" \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$STACK_STATUS" = "NOT_FOUND" ]; then
  warn "CloudFormation stack not deployed yet"
elif [[ "$STACK_STATUS" == *"COMPLETE"* ]] && [[ "$STACK_STATUS" != *"ROLLBACK"* ]]; then
  pass "CloudFormation stack: $STACK_STATUS"

  ALB_DNS=$(aws cloudformation describe-stacks \
    --stack-name "${APP_NAME}-stack" \
    --query "Stacks[0].Outputs[?OutputKey=='ALBDNS'].OutputValue" \
    --output text --region "$AWS_REGION" 2>/dev/null || echo "")
  [ -n "$ALB_DNS" ] && pass "ALB DNS: $ALB_DNS" || warn "ALB DNS not available"

  ECR_URI=$(aws cloudformation describe-stacks \
    --stack-name "${APP_NAME}-stack" \
    --query "Stacks[0].Outputs[?OutputKey=='ECRRepositoryURI'].OutputValue" \
    --output text --region "$AWS_REGION" 2>/dev/null || echo "")
  [ -n "$ECR_URI" ] && pass "ECR URI: $ECR_URI" || warn "ECR URI not available"
else
  fail "CloudFormation stack in bad state: $STACK_STATUS"
fi

# ─── CLOUDFRONT ──────────────────────────────────────────────────
step "CloudFront"

CF_DIST_ID="${CLOUDFRONT_DISTRIBUTION_ID:-}"
if [ -n "$CF_DIST_ID" ]; then
  CF_STATUS=$(aws cloudfront get-distribution --id "$CF_DIST_ID" \
    --query 'Distribution.Status' --output text 2>/dev/null || echo "ERROR")
  CF_DOMAIN=$(aws cloudfront get-distribution --id "$CF_DIST_ID" \
    --query 'Distribution.DomainName' --output text 2>/dev/null || echo "")

  if [ "$CF_STATUS" = "Deployed" ]; then
    pass "CloudFront distribution: $CF_DIST_ID ($CF_DOMAIN)"
  else
    warn "CloudFront status: $CF_STATUS"
  fi
else
  warn "CLOUDFRONT_DISTRIBUTION_ID not set — CloudFront check skipped"
fi

# ─── SUMMARY ─────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}━━━ Summary ━━━${NC}"
echo -e "  ${GREEN}Pass: $PASS${NC}  ${YELLOW}Warn: $WARN${NC}  ${RED}Fail: $FAIL${NC}"

if [ "$FAIL" -eq 0 ]; then
  if [ "$WARN" -eq 0 ]; then
    echo -e "\n  ${BOLD}${GREEN}AWS infrastructure: FULLY CONFIGURED${NC}\n"
  else
    echo -e "\n  ${BOLD}${YELLOW}AWS infrastructure: CONFIGURED WITH WARNINGS${NC}\n"
  fi
else
  echo -e "\n  ${BOLD}${RED}AWS infrastructure: NOT READY — fix FAIL items above${NC}\n"
fi

exit $FAIL
