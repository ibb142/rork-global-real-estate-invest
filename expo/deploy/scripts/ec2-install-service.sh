#!/bin/bash
set -euo pipefail

SERVICE_NAME="${SERVICE_NAME:-ivx-chat-api}"
SERVICE_USER="${SERVICE_USER:-ec2-user}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PM2_ECOSYSTEM_PATH="${PM2_ECOSYSTEM_PATH:-$PROJECT_ROOT/expo/deploy/pm2/ecosystem.config.cjs}"
PM2_BIN="${PM2_BIN:-$(command -v pm2 2>/dev/null || true)}"
NODE_BIN="${NODE_BIN:-$(command -v node 2>/dev/null || true)}"

resolve_service_user() {
  if getent passwd "$SERVICE_USER" >/dev/null 2>&1; then
    printf '%s\n' "$SERVICE_USER"
    return
  fi

  local candidate=""
  for candidate in "${SUDO_USER:-}" "${USER:-}"; do
    if [ -n "$candidate" ] && getent passwd "$candidate" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return
    fi
  done

  candidate="$(stat -c '%U' "$PROJECT_ROOT" 2>/dev/null || true)"
  if [ -n "$candidate" ] && [ "$candidate" != "UNKNOWN" ] && getent passwd "$candidate" >/dev/null 2>&1; then
    printf '%s\n' "$candidate"
    return
  fi

  candidate="$(id -un 2>/dev/null || true)"
  if [ -n "$candidate" ] && getent passwd "$candidate" >/dev/null 2>&1; then
    printf '%s\n' "$candidate"
    return
  fi

  echo "Unable to resolve a valid service user. Checked SERVICE_USER=$SERVICE_USER, SUDO_USER, USER, project owner, and current user."
  exit 1
}

SERVICE_USER="$(resolve_service_user)"
echo "Using service user: $SERVICE_USER"

if [ -z "$PM2_BIN" ]; then
  echo "pm2 is not installed. Run expo/deploy/scripts/ec2-bootstrap-amzn2023.sh first."
  exit 1
fi

if [ -z "$NODE_BIN" ]; then
  echo "node is not installed. Run expo/deploy/scripts/ec2-bootstrap-amzn2023.sh first."
  exit 1
fi

NODE_MAJOR="$($NODE_BIN -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node 22 or newer is required for backend/express-chat-server.ts. Installed version: $($NODE_BIN --version)"
  exit 1
fi

SERVICE_HOME="$(getent passwd "$SERVICE_USER" | cut -d: -f6)"
SERVICE_HOME="${SERVICE_HOME:-/home/$SERVICE_USER}"

if [ ! -f "$PM2_ECOSYSTEM_PATH" ]; then
  echo "PM2 ecosystem file not found: $PM2_ECOSYSTEM_PATH"
  exit 1
fi

mkdir -p "$PROJECT_ROOT/logs" "$PROJECT_ROOT/data"
sudo chown -R "$SERVICE_USER":"$SERVICE_USER" "$PROJECT_ROOT/logs" "$PROJECT_ROOT/data"

if sudo -u "$SERVICE_USER" env PATH="$PATH" "$PM2_BIN" describe "$SERVICE_NAME" >/dev/null 2>&1; then
  sudo -u "$SERVICE_USER" env PATH="$PATH" CHAT_APP_ROOT="$PROJECT_ROOT" "$PM2_BIN" restart "$SERVICE_NAME" --update-env
else
  sudo -u "$SERVICE_USER" env PATH="$PATH" CHAT_APP_ROOT="$PROJECT_ROOT" "$PM2_BIN" start "$PM2_ECOSYSTEM_PATH" --only "$SERVICE_NAME" --update-env
fi

sudo env PATH="$PATH" "$PM2_BIN" startup systemd -u "$SERVICE_USER" --hp "$SERVICE_HOME"
sudo -u "$SERVICE_USER" env PATH="$PATH" "$PM2_BIN" save --force
sudo -u "$SERVICE_USER" env PATH="$PATH" "$PM2_BIN" status "$SERVICE_NAME"
