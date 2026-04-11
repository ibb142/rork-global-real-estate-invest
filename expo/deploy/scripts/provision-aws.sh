#!/bin/bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()   { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }
step()  { echo -e "\n${BOLD}${CYAN}━━━ $1 ━━━${NC}"; }

APP_NAME="${APP_NAME:-ivx-holdings}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ENVIRONMENT="${1:-production}"
DOMAIN_NAME="${DOMAIN_NAME:-ivxholding.com}"
API_DOMAIN="${API_DOMAIN:-api.ivxholding.com}"
CDN_DOMAIN="${CDN_DOMAIN:-cdn.ivxholding.com}"

echo ""
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${BLUE}  IVX Holdings — AWS Production Provisioning${NC}"
echo -e "${BOLD}${BLUE}  Environment: ${ENVIRONMENT}${NC}"
echo -e "${BOLD}${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

command -v aws >/dev/null 2>&1 || error "aws CLI not found. Install: https://aws.amazon.com/cli/"
aws sts get-caller-identity >/dev/null 2>&1 || error "AWS credentials not configured. Run: aws configure"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ok "Authenticated — Account: $ACCOUNT_ID | Region: $AWS_REGION"

# ─── STEP 1: S3 BUCKETS ────────────────────────────────────────────
step "Step 1: S3 Buckets"

create_bucket() {
  local bucket="$1"
  local purpose="$2"

  if aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
    ok "Bucket exists: $bucket ($purpose)"
  else
    log "Creating bucket: $bucket ($purpose)..."
    if [ "$AWS_REGION" = "us-east-1" ]; then
      aws s3api create-bucket --bucket "$bucket" --region "$AWS_REGION"
    else
      aws s3api create-bucket --bucket "$bucket" --region "$AWS_REGION" \
        --create-bucket-configuration LocationConstraint="$AWS_REGION"
    fi

    aws s3api put-bucket-versioning --bucket "$bucket" \
      --versioning-configuration Status=Enabled

    aws s3api put-bucket-encryption --bucket "$bucket" \
      --server-side-encryption-configuration '{
        "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}, "BucketKeyEnabled": true}]
      }'

    aws s3api put-public-access-block --bucket "$bucket" \
      --public-access-block-configuration '{
        "BlockPublicAcls": true,
        "IgnorePublicAcls": true,
        "BlockPublicPolicy": true,
        "RestrictPublicBuckets": true
      }'

    ok "Created bucket: $bucket"
  fi
}

PROD_BUCKET="${APP_NAME}-prod"
STAGING_BUCKET="${APP_NAME}-staging"
LANDING_BUCKET="${DOMAIN_NAME}"
CHAT_UPLOADS_BUCKET="${APP_NAME}-chat-uploads"
BACKUPS_BUCKET="${APP_NAME}-backups"

create_bucket "$PROD_BUCKET" "production assets"
create_bucket "$CHAT_UPLOADS_BUCKET" "chat attachments"
create_bucket "$BACKUPS_BUCKET" "database backups"

if [ "$ENVIRONMENT" = "staging" ] || [ "$ENVIRONMENT" = "all" ]; then
  create_bucket "$STAGING_BUCKET" "staging assets"
fi

aws s3api put-bucket-cors --bucket "$PROD_BUCKET" --cors-configuration '{
  "CORSRules": [{
    "AllowedHeaders": ["Authorization", "Content-Type", "x-amz-date", "x-amz-security-token"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
    "AllowedOrigins": ["https://ivxholding.com", "https://www.ivxholding.com", "https://app.ivxholding.com"],
    "MaxAgeSeconds": 3600
  }]
}'

aws s3api put-bucket-cors --bucket "$CHAT_UPLOADS_BUCKET" --cors-configuration '{
  "CORSRules": [{
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": ["https://ivxholding.com", "https://app.ivxholding.com", "exp://localhost:8081"],
    "MaxAgeSeconds": 3600
  }]
}'

aws s3api put-bucket-lifecycle-configuration --bucket "$CHAT_UPLOADS_BUCKET" \
  --lifecycle-configuration '{
    "Rules": [
      {"ID": "expire-temp", "Status": "Enabled", "Filter": {"Prefix": "temp/"}, "Expiration": {"Days": 1}},
      {"ID": "transition-old", "Status": "Enabled", "Filter": {"Prefix": ""}, "Transitions": [{"Days": 90, "StorageClass": "STANDARD_IA"}]}
    ]
  }'

aws s3api put-bucket-lifecycle-configuration --bucket "$BACKUPS_BUCKET" \
  --lifecycle-configuration '{
    "Rules": [
      {"ID": "transition-glacier", "Status": "Enabled", "Filter": {"Prefix": ""}, "Transitions": [{"Days": 30, "StorageClass": "GLACIER"}]},
      {"ID": "expire-old", "Status": "Enabled", "Filter": {"Prefix": ""}, "Expiration": {"Days": 365}}
    ]
  }'

ok "S3 buckets configured with versioning, encryption, CORS, and lifecycle rules"

# ─── STEP 2: SECRETS MANAGER ──────────────────────────────────────
step "Step 2: Secrets Manager"

store_secret() {
  local name="$1"
  local description="$2"
  local value="$3"
  local secret_id="${APP_NAME}/${ENVIRONMENT}/${name}"

  if aws secretsmanager describe-secret --secret-id "$secret_id" --region "$AWS_REGION" >/dev/null 2>&1; then
    if [ -n "$value" ] && [ "$value" != "PLACEHOLDER" ]; then
      aws secretsmanager update-secret --secret-id "$secret_id" \
        --secret-string "$value" --region "$AWS_REGION" >/dev/null
      ok "Updated: $secret_id"
    else
      warn "Exists (placeholder): $secret_id"
    fi
  else
    local actual_value="${value:-PLACEHOLDER_REPLACE_ME}"
    aws secretsmanager create-secret \
      --name "$secret_id" \
      --description "$description" \
      --secret-string "$actual_value" \
      --tags "[{\"Key\":\"Project\",\"Value\":\"IVX-Holdings\"},{\"Key\":\"Environment\",\"Value\":\"${ENVIRONMENT}\"}]" \
      --region "$AWS_REGION" >/dev/null
    if [ "$actual_value" = "PLACEHOLDER_REPLACE_ME" ]; then
      warn "Created with placeholder: $secret_id — update via AWS console"
    else
      ok "Created: $secret_id"
    fi
  fi
}

store_secret "supabase-url" "Supabase project URL" "${EXPO_PUBLIC_SUPABASE_URL:-PLACEHOLDER}"
store_secret "supabase-anon-key" "Supabase anon key" "${EXPO_PUBLIC_SUPABASE_ANON_KEY:-PLACEHOLDER}"
store_secret "supabase-service-role-key" "Supabase service role key (server-only)" "${SUPABASE_SERVICE_ROLE_KEY:-PLACEHOLDER}"
store_secret "supabase-db-password" "Supabase database password" "${SUPABASE_DB_PASSWORD:-PLACEHOLDER}"
store_secret "jwt-secret" "JWT signing secret" "$(openssl rand -hex 32)"
store_secret "github-token" "GitHub access token" "${GITHUB_TOKEN:-PLACEHOLDER}"

ok "Secrets stored in ${APP_NAME}/${ENVIRONMENT}/"

# ─── STEP 3: CLOUDWATCH LOG GROUPS ───────────────────────────────
step "Step 3: CloudWatch Monitoring"

create_log_group() {
  local name="$1"
  local retention="$2"

  if aws logs describe-log-groups --log-group-name-prefix "$name" --region "$AWS_REGION" \
    --query "logGroups[?logGroupName=='$name']" --output text 2>/dev/null | grep -q "$name"; then
    ok "Log group exists: $name"
  else
    aws logs create-log-group --log-group-name "$name" --region "$AWS_REGION"
    aws logs put-retention-policy --log-group-name "$name" \
      --retention-in-days "$retention" --region "$AWS_REGION"
    ok "Created log group: $name (${retention}d retention)"
  fi
}

create_log_group "/ivx/${ENVIRONMENT}/api" 30
create_log_group "/ivx/${ENVIRONMENT}/chat" 14
create_log_group "/ivx/${ENVIRONMENT}/auth" 90
create_log_group "/ivx/${ENVIRONMENT}/errors" 90
create_log_group "/ivx/${ENVIRONMENT}/deployments" 365

aws cloudwatch put-metric-alarm \
  --alarm-name "${APP_NAME}-${ENVIRONMENT}-api-5xx" \
  --alarm-description "API 5xx error rate alarm" \
  --metric-name "5XXError" \
  --namespace "AWS/ApiGateway" \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2 \
  --treat-missing-data notBreaching \
  --region "$AWS_REGION" 2>/dev/null || warn "API Gateway alarm skipped (no API Gateway yet)"

aws cloudwatch put-dashboard \
  --dashboard-name "${APP_NAME}-${ENVIRONMENT}" \
  --dashboard-body "{
    \"widgets\": [
      {
        \"type\": \"metric\",
        \"x\": 0, \"y\": 0, \"width\": 12, \"height\": 6,
        \"properties\": {
          \"title\": \"S3 Bucket Size\",
          \"metrics\": [
            [\"AWS/S3\", \"BucketSizeBytes\", \"BucketName\", \"${PROD_BUCKET}\", \"StorageType\", \"StandardStorage\"]
          ],
          \"period\": 86400,
          \"stat\": \"Average\",
          \"region\": \"${AWS_REGION}\"
        }
      },
      {
        \"type\": \"log\",
        \"x\": 0, \"y\": 6, \"width\": 24, \"height\": 6,
        \"properties\": {
          \"title\": \"Recent Errors\",
          \"query\": \"SOURCE '/ivx/${ENVIRONMENT}/errors' | fields @timestamp, @message | sort @timestamp desc | limit 20\",
          \"region\": \"${AWS_REGION}\",
          \"view\": \"table\"
        }
      }
    ]
  }" --region "$AWS_REGION" >/dev/null 2>&1

ok "CloudWatch log groups, alarms, and dashboard configured"

# ─── STEP 4: IAM POLICY ──────────────────────────────────────────
step "Step 4: IAM Least-Privilege Policy"

POLICY_NAME="${APP_NAME}-${ENVIRONMENT}-app-policy"
POLICY_DOC=$(cat <<POLICYEOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "S3ReadWrite",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetObjectVersion"
      ],
      "Resource": [
        "arn:aws:s3:::${PROD_BUCKET}",
        "arn:aws:s3:::${PROD_BUCKET}/*",
        "arn:aws:s3:::${CHAT_UPLOADS_BUCKET}",
        "arn:aws:s3:::${CHAT_UPLOADS_BUCKET}/*"
      ]
    },
    {
      "Sid": "SecretsRead",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:${AWS_REGION}:${ACCOUNT_ID}:secret:${APP_NAME}/${ENVIRONMENT}/*"
    },
    {
      "Sid": "CloudWatchLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents",
        "logs:DescribeLogStreams"
      ],
      "Resource": "arn:aws:logs:${AWS_REGION}:${ACCOUNT_ID}:log-group:/ivx/${ENVIRONMENT}/*"
    },
    {
      "Sid": "CloudWatchMetrics",
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "cloudwatch:namespace": "IVX/${ENVIRONMENT}"
        }
      }
    }
  ]
}
POLICYEOF
)

EXISTING_POLICY=$(aws iam list-policies --scope Local \
  --query "Policies[?PolicyName=='${POLICY_NAME}'].Arn" \
  --output text --region "$AWS_REGION" 2>/dev/null || echo "")

if [ -n "$EXISTING_POLICY" ] && [ "$EXISTING_POLICY" != "None" ]; then
  aws iam create-policy-version \
    --policy-arn "$EXISTING_POLICY" \
    --policy-document "$POLICY_DOC" \
    --set-as-default >/dev/null 2>&1 || warn "Policy version limit reached — delete old versions in IAM console"
  ok "Updated IAM policy: $POLICY_NAME"
else
  aws iam create-policy \
    --policy-name "$POLICY_NAME" \
    --policy-document "$POLICY_DOC" \
    --tags "[{\"Key\":\"Project\",\"Value\":\"IVX-Holdings\"},{\"Key\":\"Environment\",\"Value\":\"${ENVIRONMENT}\"}]" \
    --region "$AWS_REGION" >/dev/null 2>&1
  ok "Created IAM policy: $POLICY_NAME"
fi

# ─── STEP 5: SSM PARAMETER STORE (non-secret config) ─────────────
step "Step 5: SSM Parameter Store (config)"

store_param() {
  local name="$1"
  local value="$2"
  aws ssm put-parameter \
    --name "/${APP_NAME}/${ENVIRONMENT}/${name}" \
    --value "$value" \
    --type String \
    --overwrite \
    --region "$AWS_REGION" >/dev/null 2>&1
}

store_param "aws-region" "$AWS_REGION"
store_param "s3-bucket-prod" "$PROD_BUCKET"
store_param "s3-bucket-chat" "$CHAT_UPLOADS_BUCKET"
store_param "s3-bucket-backups" "$BACKUPS_BUCKET"
store_param "domain" "$DOMAIN_NAME"
store_param "api-domain" "$API_DOMAIN"
store_param "cdn-domain" "$CDN_DOMAIN"
store_param "cloudfront-distribution-id" "${CLOUDFRONT_DISTRIBUTION_ID:-pending}"

ok "SSM parameters stored"

# ─── SUMMARY ──────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${GREEN}  AWS Provisioning Complete${NC}"
echo -e "${BOLD}${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  Account:      ${CYAN}$ACCOUNT_ID${NC}"
echo -e "  Region:       ${CYAN}$AWS_REGION${NC}"
echo -e "  Environment:  ${CYAN}$ENVIRONMENT${NC}"
echo ""
echo -e "  ${BOLD}S3 Buckets:${NC}"
echo -e "    ${CYAN}$PROD_BUCKET${NC}          — production assets"
echo -e "    ${CYAN}$CHAT_UPLOADS_BUCKET${NC}  — chat attachments"
echo -e "    ${CYAN}$BACKUPS_BUCKET${NC}       — database backups"
echo ""
echo -e "  ${BOLD}Secrets:${NC}  ${CYAN}${APP_NAME}/${ENVIRONMENT}/*${NC} in Secrets Manager"
echo -e "  ${BOLD}Logs:${NC}     ${CYAN}/ivx/${ENVIRONMENT}/*${NC} in CloudWatch"
echo -e "  ${BOLD}Config:${NC}   ${CYAN}/${APP_NAME}/${ENVIRONMENT}/*${NC} in SSM"
echo -e "  ${BOLD}Policy:${NC}   ${CYAN}${POLICY_NAME}${NC}"
echo -e "  ${BOLD}Dashboard:${NC} ${CYAN}${APP_NAME}-${ENVIRONMENT}${NC}"
echo ""
echo -e "  ${YELLOW}Next steps:${NC}"
echo -e "  1. Replace PLACEHOLDER secrets in AWS Secrets Manager console"
echo -e "  2. Attach ${POLICY_NAME} to your ECS task role or app user"
echo -e "  3. Deploy CloudFormation stack: ./deploy/scripts/setup-aws.sh"
echo -e "  4. Set up CloudFront: node ./deploy/scripts/setup-cloudfront-landing.mjs"
echo -e "  5. Verify: ./deploy/scripts/validate-aws.sh"
echo ""
