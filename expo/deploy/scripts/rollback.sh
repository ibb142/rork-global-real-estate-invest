#!/bin/bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()   { echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

APP_NAME="${APP_NAME:-ivx-holdings}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ECS_CLUSTER="${ECS_CLUSTER:-ivx-holdings-cluster}"
ECS_SERVICE="${ECS_SERVICE:-ivx-holdings-api-service}"
TASK_FAMILY="${APP_NAME}-api"
ROLLBACK_REVISION="${1:-}"

command -v aws >/dev/null 2>&1 || error "aws CLI not found"
aws sts get-caller-identity >/dev/null 2>&1 || error "AWS not authenticated"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  IVX Holdings — Rollback"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log "Fetching current task definition..."
CURRENT_TD=$(aws ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION" \
  --query 'services[0].taskDefinition' \
  --output text)

CURRENT_REVISION=$(echo "$CURRENT_TD" | grep -o '[0-9]*$')
log "Current revision: $CURRENT_REVISION"

if [ -z "$ROLLBACK_REVISION" ]; then
  log "Listing recent task definition revisions..."
  REVISIONS=$(aws ecs list-task-definitions \
    --family-prefix "$TASK_FAMILY" \
    --sort DESC \
    --max-items 10 \
    --region "$AWS_REGION" \
    --query 'taskDefinitionArns' \
    --output json)

  echo ""
  echo "Recent revisions:"
  echo "$REVISIONS" | python3 -c "
import sys, json
arns = json.load(sys.stdin)
for i, arn in enumerate(arns):
  rev = arn.split(':')[-1]
  marker = ' <-- CURRENT' if '${CURRENT_TD}' in arn else ''
  print(f'  {i+1}. {rev}{marker}')
"
  echo ""

  PREVIOUS_REVISION=$((CURRENT_REVISION - 1))
  if [ "$PREVIOUS_REVISION" -lt 1 ]; then
    error "No previous revision available"
  fi
  ROLLBACK_REVISION="$PREVIOUS_REVISION"
  warn "No revision specified — rolling back to revision $ROLLBACK_REVISION"
fi

TARGET_TD="${TASK_FAMILY}:${ROLLBACK_REVISION}"
log "Rolling back to: $TARGET_TD"

aws ecs describe-task-definition \
  --task-definition "$TARGET_TD" \
  --region "$AWS_REGION" \
  --query 'taskDefinition.containerDefinitions[0].image' \
  --output text | while read -r img; do
  log "Target image: $img"
done

read -p "Proceed with rollback to revision $ROLLBACK_REVISION? (y/N) " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Rollback cancelled."
  exit 0
fi

log "Updating ECS service..."
aws ecs update-service \
  --cluster "$ECS_CLUSTER" \
  --service "$ECS_SERVICE" \
  --task-definition "$TARGET_TD" \
  --force-new-deployment \
  --region "$AWS_REGION" \
  --output text >/dev/null
ok "Service updated to revision $ROLLBACK_REVISION"

log "Waiting for service to stabilize..."
aws ecs wait services-stable \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --region "$AWS_REGION"
ok "Service is stable"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Rollback complete!"
echo "  From: revision $CURRENT_REVISION"
echo "  To:   revision $ROLLBACK_REVISION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
