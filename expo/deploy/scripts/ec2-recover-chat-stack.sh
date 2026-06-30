#!/bin/bash
set -euo pipefail

API_DOMAIN="${API_DOMAIN:-api.ivxholding.com}"
CHAT_DOMAIN="${CHAT_DOMAIN:-chat.ivxholding.com}"
SERVICE_NAME="${SERVICE_NAME:-ivx-chat-api}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
EXPO_ROOT="${PROJECT_ROOT}/expo"
BOOTSTRAP_SCRIPT="${EXPO_ROOT}/deploy/scripts/ec2-bootstrap-amzn2023.sh"
DEPLOY_SCRIPT="${EXPO_ROOT}/deploy/scripts/ec2-node-deploy.sh"
VERIFY_SCRIPT="${EXPO_ROOT}/deploy/scripts/ec2-verify-checklist.sh"
RUN_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DEPLOY_LOG_DIR="${DEPLOY_LOG_DIR:-$PROJECT_ROOT/logs/deploy}"
DEPLOY_LOG_PATH="${DEPLOY_LOG_PATH:-$DEPLOY_LOG_DIR/ec2-recover-${RUN_TIMESTAMP}.log}"

mkdir -p "$DEPLOY_LOG_DIR"
exec > >(tee -a "$DEPLOY_LOG_PATH") 2>&1

printf 'IVX recovery started at %s\n' "$(date -Iseconds)"
printf 'Project root: %s\n' "$PROJECT_ROOT"
printf 'Deploy log: %s\n' "$DEPLOY_LOG_PATH"

export CHAT_APP_ROOT="${CHAT_APP_ROOT:-$PROJECT_ROOT}"

bash "$BOOTSTRAP_SCRIPT"
bash "$DEPLOY_SCRIPT"

if [ -f "$VERIFY_SCRIPT" ]; then
  API_DOMAIN="$API_DOMAIN" CHAT_DOMAIN="$CHAT_DOMAIN" SERVICE_NAME="$SERVICE_NAME" bash "$VERIFY_SCRIPT" || true
else
  if command -v pm2 >/dev/null 2>&1; then
    pm2 status "$SERVICE_NAME" || true
  fi

  curl -sS --max-time 10 http://127.0.0.1:3000/health || true
  curl -sS --max-time 10 -H "Host: ${API_DOMAIN}" http://127.0.0.1/health || true
  curl -sS --max-time 10 -H "Host: ${CHAT_DOMAIN}" http://127.0.0.1/ || true
  curl -sS --max-time 10 "http://${API_DOMAIN}/health" || true
  curl -sS --max-time 10 "http://${CHAT_DOMAIN}/" || true
fi

printf 'IVX recovery finished at %s\n' "$(date -Iseconds)"
printf 'Recovery log saved to %s\n' "$DEPLOY_LOG_PATH"
