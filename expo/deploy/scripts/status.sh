#!/bin/bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

APP_NAME="${APP_NAME:-ivx-holdings}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ECS_CLUSTER="${ECS_CLUSTER:-ivx-holdings-cluster}"
ECS_SERVICE="${ECS_SERVICE:-ivx-holdings-api-service}"
STACK_NAME="${APP_NAME}-stack"
API_URL="${API_URL:-}"

command -v aws >/dev/null 2>&1 || { echo -e "${RED}aws CLI not found${NC}"; exit 1; }
aws sts get-caller-identity >/dev/null 2>&1 || { echo -e "${RED}AWS not authenticated${NC}"; exit 1; }

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  IVX Holdings — Infrastructure Status"
echo "  Account: $ACCOUNT_ID | Region: $AWS_REGION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

echo -e "${CYAN}[CloudFormation]${NC}"
STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$STACK_STATUS" = "NOT_FOUND" ]; then
  echo -e "  Stack: ${RED}Not deployed${NC}"
else
  COLOR=$GREEN
  [[ "$STACK_STATUS" == *"ROLLBACK"* ]] && COLOR=$RED
  [[ "$STACK_STATUS" == *"IN_PROGRESS"* ]] && COLOR=$YELLOW
  echo -e "  Stack: ${COLOR}${STACK_STATUS}${NC}"
fi
echo ""

echo -e "${CYAN}[ECS Service]${NC}"
SERVICE_INFO=$(aws ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION" \
  --query 'services[0]' \
  --output json 2>/dev/null || echo "{}")

if [ "$SERVICE_INFO" = "{}" ] || [ "$SERVICE_INFO" = "null" ]; then
  echo -e "  Service: ${RED}Not found${NC}"
else
  STATUS=$(echo "$SERVICE_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")
  RUNNING=$(echo "$SERVICE_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('runningCount',0))" 2>/dev/null || echo "0")
  DESIRED=$(echo "$SERVICE_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('desiredCount',0))" 2>/dev/null || echo "0")
  TASK_DEF=$(echo "$SERVICE_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); td=d.get('taskDefinition',''); print(td.split('/')[-1] if '/' in td else td)" 2>/dev/null || echo "unknown")

  COLOR=$GREEN
  [ "$RUNNING" != "$DESIRED" ] && COLOR=$YELLOW
  [ "$STATUS" != "ACTIVE" ] && COLOR=$RED

  echo -e "  Status:     ${COLOR}${STATUS}${NC}"
  echo -e "  Tasks:      ${COLOR}${RUNNING}/${DESIRED} running${NC}"
  echo -e "  Task Def:   $TASK_DEF"

  DEPLOYMENTS=$(echo "$SERVICE_INFO" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for dep in d.get('deployments', []):
  status = dep.get('status','')
  running = dep.get('runningCount',0)
  desired = dep.get('desiredCount',0)
  rollout = dep.get('rolloutState','')
  print(f'  Deployment: {status} ({running}/{desired}) rollout={rollout}')
" 2>/dev/null || echo "  No deployment info")
  echo "$DEPLOYMENTS"
fi
echo ""

echo -e "${CYAN}[ECR Repository]${NC}"
ECR_URI="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$APP_NAME-api"
LATEST_IMAGE=$(aws ecr describe-images \
  --repository-name "$APP_NAME-api" \
  --region "$AWS_REGION" \
  --query 'sort_by(imageDetails, &imagePushedAt)[-1]' \
  --output json 2>/dev/null || echo "{}")

if [ "$LATEST_IMAGE" = "{}" ] || [ "$LATEST_IMAGE" = "null" ]; then
  echo -e "  Repository: ${RED}No images${NC}"
else
  PUSHED=$(echo "$LATEST_IMAGE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('imagePushedAt','unknown'))" 2>/dev/null || echo "unknown")
  TAGS=$(echo "$LATEST_IMAGE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(', '.join(d.get('imageTags',['untagged'])))" 2>/dev/null || echo "untagged")
  SIZE=$(echo "$LATEST_IMAGE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"{d.get('imageSizeInBytes',0)/1024/1024:.1f}MB\")" 2>/dev/null || echo "unknown")
  echo "  URI:        $ECR_URI"
  echo "  Latest:     $TAGS"
  echo "  Pushed:     $PUSHED"
  echo "  Size:       $SIZE"
fi
echo ""

echo -e "${CYAN}[ALB]${NC}"
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query "Stacks[0].Outputs[?OutputKey=='ALBDNS'].OutputValue" \
  --output text \
  --region "$AWS_REGION" 2>/dev/null || echo "N/A")
echo "  DNS: $ALB_DNS"
echo ""

echo -e "${CYAN}[DynamoDB]${NC}"
TABLE_NAME="${APP_NAME}-production"
TABLE_STATUS=$(aws dynamodb describe-table \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --query 'Table.TableStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")
ITEM_COUNT=$(aws dynamodb describe-table \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --query 'Table.ItemCount' \
  --output text 2>/dev/null || echo "0")
echo -e "  Table:  $TABLE_NAME"
echo -e "  Status: $TABLE_STATUS"
echo -e "  Items:  $ITEM_COUNT"
echo ""

echo -e "${CYAN}[S3 Bucket]${NC}"
BUCKET="${APP_NAME}-prod"
BUCKET_EXISTS=$(aws s3api head-bucket --bucket "$BUCKET" --region "$AWS_REGION" 2>&1 && echo "yes" || echo "no")
if [ "$BUCKET_EXISTS" = "yes" ]; then
  echo -e "  Bucket:  ${GREEN}${BUCKET} (exists)${NC}"
else
  echo -e "  Bucket:  ${RED}${BUCKET} (not found)${NC}"
fi
echo ""

if [ -n "$API_URL" ]; then
  echo -e "${CYAN}[Health Check]${NC}"
  HEALTH=$(curl -sf --max-time 10 "$API_URL/health" 2>/dev/null || echo '{"status":"unreachable"}')
  STATUS=$(echo "$HEALTH" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status','unknown'))" 2>/dev/null || echo "parse_error")
  if [ "$STATUS" = "healthy" ]; then
    echo -e "  API: ${GREEN}healthy${NC} ($API_URL)"
  else
    echo -e "  API: ${RED}${STATUS}${NC} ($API_URL)"
  fi
  echo ""
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Checked at $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
