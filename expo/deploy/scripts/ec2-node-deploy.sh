#!/bin/bash
set -euo pipefail

WEB_ROOT="${WEB_ROOT:-/var/www/ivx-chat}"
NGINX_CONF_DEST="${NGINX_CONF_DEST:-/etc/nginx/conf.d/ivx-chat.conf}"
SERVICE_NAME="${SERVICE_NAME:-ivx-chat-api}"
SERVICE_USER="${SERVICE_USER:-ec2-user}"
LETSENCRYPT_CERT_NAME="${LETSENCRYPT_CERT_NAME:-ivx-chat-api}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
EXPO_ROOT="${PROJECT_ROOT}/expo"
HTTP_NGINX_SOURCE="${EXPO_ROOT}/deploy/nginx/ec2-node-http.conf"
HTTPS_NGINX_SOURCE="${EXPO_ROOT}/deploy/nginx/ec2-node.conf"
BOOTSTRAP_SCRIPT="${EXPO_ROOT}/deploy/scripts/ec2-bootstrap-amzn2023.sh"
INSTALL_SERVICE_SCRIPT="${EXPO_ROOT}/deploy/scripts/ec2-install-service.sh"
CERT_DIR="/etc/letsencrypt/live/${LETSENCRYPT_CERT_NAME}"

ensure_runtime_prerequisites() {
  local needs_bootstrap="false"

  if ! command -v node >/dev/null 2>&1; then
    needs_bootstrap="true"
  elif [ "$(node -p "process.versions.node.split('.')[0]")" -lt 22 ]; then
    needs_bootstrap="true"
  fi

  if ! command -v pm2 >/dev/null 2>&1; then
    needs_bootstrap="true"
  fi

  if ! command -v nginx >/dev/null 2>&1; then
    needs_bootstrap="true"
  fi

  if [ "$needs_bootstrap" = "true" ]; then
    bash "$BOOTSTRAP_SCRIPT"
  fi
}

ensure_runtime_prerequisites

export CHAT_APP_ROOT="${CHAT_APP_ROOT:-$PROJECT_ROOT}"
export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
export PATH="$BUN_INSTALL/bin:$PATH"

cd "$PROJECT_ROOT"
bun install --frozen-lockfile

cd "$EXPO_ROOT"
bunx expo export --platform web

sudo mkdir -p "$WEB_ROOT" "$(dirname "$NGINX_CONF_DEST")"
sudo rsync -a --delete "$EXPO_ROOT/dist/" "$WEB_ROOT/"

if [ -f "$CERT_DIR/fullchain.pem" ] && [ -f "$CERT_DIR/privkey.pem" ]; then
  sudo cp "$HTTPS_NGINX_SOURCE" "$NGINX_CONF_DEST"
else
  sudo cp "$HTTP_NGINX_SOURCE" "$NGINX_CONF_DEST"
fi

sudo systemctl enable nginx
sudo nginx -t
sudo systemctl restart nginx

if [ -f "$INSTALL_SERVICE_SCRIPT" ]; then
  SERVICE_NAME="$SERVICE_NAME" SERVICE_USER="$SERVICE_USER" CHAT_APP_ROOT="$CHAT_APP_ROOT" bash "$INSTALL_SERVICE_SCRIPT"
fi

curl -sS --max-time 10 http://127.0.0.1:3000/health || true

if [ -f "$CERT_DIR/fullchain.pem" ] && [ -f "$CERT_DIR/privkey.pem" ]; then
  curl -sS --max-time 15 https://api.ivxholding.com/health || true
  curl -sS --max-time 15 https://chat.ivxholding.com || true
else
  curl -sS --max-time 15 http://api.ivxholding.com/health || true
  curl -sS --max-time 15 http://chat.ivxholding.com || true
fi
