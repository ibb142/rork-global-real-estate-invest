#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RECOVER_SCRIPT="${SCRIPT_DIR}/ec2-recover-chat-stack.sh"
REMOTE_GIT_BRANCH="${REMOTE_GIT_BRANCH:-main}"
REMOTE_SHELL="${REMOTE_SHELL:-bash}"
SSH_BIN="${SSH_BIN:-$(command -v ssh 2>/dev/null || true)}"
CURL_BIN="${CURL_BIN:-$(command -v curl 2>/dev/null || true)}"
SSH_OPTS="${SSH_OPTS:--o StrictHostKeyChecking=accept-new}"
API_DOMAIN="${API_DOMAIN:-api.ivxholding.com}"
CHAT_DOMAIN="${CHAT_DOMAIN:-chat.ivxholding.com}"
SERVICE_NAME="${SERVICE_NAME:-ivx-chat-api}"
SERVICE_USER="${SERVICE_USER:-ec2-user}"
RUN_MODE="${RUN_MODE:-local}"
RUN_TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DEPLOY_LOG_DIR="${DEPLOY_LOG_DIR:-$PROJECT_ROOT/logs/deploy}"
DEPLOY_LOG_PATH="${DEPLOY_LOG_PATH:-$DEPLOY_LOG_DIR/ec2-auto-${RUN_TIMESTAMP}.log}"
DEFAULT_REMOTE_DIR="${DEFAULT_REMOTE_DIR:-/home/ec2-user/ivx-app}"
FALLBACK_REMOTE_DIR="${FALLBACK_REMOTE_DIR:-$HOME/ivx-app}"
REMOTE_APP_DIR="${REMOTE_APP_DIR:-}"
REMOTE_HOST="${EC2_HOST:-${REMOTE_HOST:-}}"
REMOTE_USER="${REMOTE_USER:-}"
REMOTE_USER_CANDIDATES="${REMOTE_USER_CANDIDATES:-ec2-user ubuntu admin root}"
GITHUB_REPO_URL="${GITHUB_REPO_URL:-}"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

mkdir -p "$DEPLOY_LOG_DIR"
exec > >(tee -a "$DEPLOY_LOG_PATH") 2>&1

print_header() {
  printf '\n========== %s ==========' "$1"
  printf '\n'
}

normalize_host_candidate() {
  local candidate="$1"

  if [ -z "$candidate" ]; then
    printf '%s\n' ""
    return
  fi

  python3 - <<'PY' "$candidate"
import sys
from urllib.parse import urlparse

value = sys.argv[1].strip()
if not value:
    print("")
    raise SystemExit(0)

if "://" in value:
    parsed = urlparse(value)
    host = parsed.hostname or ""
else:
    host = value
    if "@" in host and host.count("@") == 1:
        host = host.split("@", 1)[1]
    if host.startswith("[") and "]" in host:
        host = host[1:host.index("]")]
    elif ":" in host and host.count(":") == 1:
        host = host.rsplit(":", 1)[0]

print(host)
PY
}

resolve_host_ipv4() {
  local candidate="$1"

  if [ -z "$candidate" ]; then
    printf '%s\n' ""
    return
  fi

  python3 - <<'PY' "$candidate"
import socket
import sys

host = sys.argv[1]
try:
    print(socket.gethostbyname(host))
except Exception:
    print("")
PY
}

get_ec2_metadata_value() {
  local path="$1"
  local token=""

  if [ -z "$CURL_BIN" ]; then
    printf '%s\n' ""
    return
  fi

  token="$("$CURL_BIN" -fsS --max-time 2 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null || true)"

  if [ -n "$token" ]; then
    "$CURL_BIN" -fsS --max-time 2 -H "X-aws-ec2-metadata-token: $token" "http://169.254.169.254/latest/meta-data/${path}" 2>/dev/null || printf '%s\n' ""
    return
  fi

  "$CURL_BIN" -fsS --max-time 2 "http://169.254.169.254/latest/meta-data/${path}" 2>/dev/null || printf '%s\n' ""
}

collect_local_host_markers() {
  printf '%s\n' "localhost" "127.0.0.1" "::1"
  hostname 2>/dev/null || true
  hostname -f 2>/dev/null || true
  hostname -I 2>/dev/null | tr ' ' '\n' || true
  get_ec2_metadata_value "local-ipv4"
  get_ec2_metadata_value "public-ipv4"
  get_ec2_metadata_value "local-hostname"
  get_ec2_metadata_value "public-hostname"
}

resolve_remote_host() {
  if [ -n "$REMOTE_HOST" ]; then
    printf '%s\n' "$REMOTE_HOST"
    return
  fi

  local resolved_host=""
  resolved_host="$(resolve_host_ipv4 "$API_DOMAIN")"

  if [ -n "$resolved_host" ]; then
    printf '%s\n' "$resolved_host"
    return
  fi

  printf '%s\n' ""
}

is_local_host() {
  local candidate="$1"
  local normalized_candidate=""
  local candidate_ip=""
  local local_marker=""

  if [ -z "$candidate" ]; then
    return 1
  fi

  normalized_candidate="$(normalize_host_candidate "$candidate")"
  if [ -z "$normalized_candidate" ]; then
    return 1
  fi

  candidate_ip="$(resolve_host_ipv4 "$normalized_candidate")"

  while IFS= read -r local_marker; do
    if [ -z "$local_marker" ]; then
      continue
    fi

    if [ "$normalized_candidate" = "$local_marker" ]; then
      return 0
    fi

    if [ -n "$candidate_ip" ] && [ "$candidate_ip" = "$local_marker" ]; then
      return 0
    fi
  done < <(collect_local_host_markers)

  return 1
}

resolve_remote_target() {
  local host="$1"
  local candidate=""
  local last_error=""

  if [ -n "$REMOTE_USER" ]; then
    printf '%s@%s\n' "$REMOTE_USER" "$host"
    return
  fi

  for candidate in $REMOTE_USER_CANDIDATES; do
    if "$SSH_BIN" $SSH_OPTS -o BatchMode=yes -o ConnectTimeout=8 "$candidate@$host" "exit 0" >/dev/null 2>&1; then
      REMOTE_USER="$candidate"
      printf '%s@%s\n' "$candidate" "$host"
      return
    fi
    last_error="SSH probe failed for ${candidate}@${host}"
    printf 'SSH probe failed for %s@%s\n' "$candidate" "$host" >&2
  done

  printf 'Unable to auto-resolve SSH user for host %s. Set REMOTE_USER or EC2_HOST explicitly.\n' "$host" >&2
  if [ -n "$last_error" ]; then
    printf 'Last probe result: %s\n' "$last_error" >&2
  fi
  return 1
}

run_local() {
  print_header "Local EC2 recovery"
  API_DOMAIN="$API_DOMAIN" \
  CHAT_DOMAIN="$CHAT_DOMAIN" \
  SERVICE_NAME="$SERVICE_NAME" \
  SERVICE_USER="$SERVICE_USER" \
  CHAT_APP_ROOT="$PROJECT_ROOT" \
  bash "$RECOVER_SCRIPT"
}

run_remote() {
  local remote_target="$1"

  if [ -z "$SSH_BIN" ]; then
    echo "ssh binary not found. Install ssh or run locally on the EC2 host."
    exit 1
  fi

  print_header "Remote EC2 recovery"
  printf 'Remote target: %s\n' "$remote_target"
  printf 'Remote branch: %s\n' "$REMOTE_GIT_BRANCH"
  printf 'Remote app dir hint: %s\n' "${REMOTE_APP_DIR:-auto}"

  local repo_url="$GITHUB_REPO_URL"
  if [ -n "$repo_url" ] && [ -n "$GITHUB_TOKEN" ] && printf '%s' "$repo_url" | grep -Eq '^https://'; then
    repo_url="$(printf '%s' "$repo_url" | sed "s#^https://#https://${GITHUB_TOKEN}@#")"
  fi

  "$SSH_BIN" $SSH_OPTS "$remote_target" \
    env \
      API_DOMAIN="$API_DOMAIN" \
      CHAT_DOMAIN="$CHAT_DOMAIN" \
      SERVICE_NAME="$SERVICE_NAME" \
      SERVICE_USER="$SERVICE_USER" \
      REMOTE_APP_DIR="$REMOTE_APP_DIR" \
      DEFAULT_REMOTE_DIR="$DEFAULT_REMOTE_DIR" \
      FALLBACK_REMOTE_DIR="$FALLBACK_REMOTE_DIR" \
      REMOTE_GIT_BRANCH="$REMOTE_GIT_BRANCH" \
      GITHUB_REPO_URL="$repo_url" \
      REMOTE_SHELL="$REMOTE_SHELL" \
      'bash -s' <<'REMOTE_SCRIPT'
set -euo pipefail

choose_app_dir() {
  local configured="${REMOTE_APP_DIR:-}"
  local default_dir="${DEFAULT_REMOTE_DIR:-/home/ec2-user/ivx-app}"
  local fallback_dir="${FALLBACK_REMOTE_DIR:-$HOME/ivx-app}"
  local candidate=""

  for candidate in "$configured" "$default_dir" "$fallback_dir"; do
    if [ -n "$candidate" ]; then
      printf '%s\n' "$candidate"
      return
    fi
  done

  printf '%s\n' "$HOME/ivx-app"
}

REMOTE_APP_DIR="$(choose_app_dir)"
echo "Remote deploy directory: $REMOTE_APP_DIR"
mkdir -p "$(dirname "$REMOTE_APP_DIR")"

if [ ! -d "$REMOTE_APP_DIR/.git" ]; then
  if [ -z "${GITHUB_REPO_URL:-}" ]; then
    echo "Remote repository is missing and GITHUB_REPO_URL is not configured."
    exit 1
  fi
  rm -rf "$REMOTE_APP_DIR"
  git clone "$GITHUB_REPO_URL" "$REMOTE_APP_DIR"
fi

cd "$REMOTE_APP_DIR"
if command -v git >/dev/null 2>&1; then
  git fetch --all --prune
  git checkout "$REMOTE_GIT_BRANCH"
  git pull --ff-only origin "$REMOTE_GIT_BRANCH"
fi

API_DOMAIN="$API_DOMAIN" \
CHAT_DOMAIN="$CHAT_DOMAIN" \
SERVICE_NAME="$SERVICE_NAME" \
SERVICE_USER="$SERVICE_USER" \
CHAT_APP_ROOT="$REMOTE_APP_DIR" \
"${REMOTE_SHELL:-bash}" "$REMOTE_APP_DIR/expo/deploy/scripts/ec2-recover-chat-stack.sh"
REMOTE_SCRIPT
}

print_header "IVX automatic deployment"
printf 'Started: %s\n' "$(date -Iseconds)"
printf 'Log: %s\n' "$DEPLOY_LOG_PATH"

case "$RUN_MODE" in
  on-host)
    RUN_MODE="local"
    ;;
esac

EXPLICIT_HOST="${EC2_HOST:-${REMOTE_HOST:-}}"
if [ "$RUN_MODE" != "remote" ] && [ -n "$EXPLICIT_HOST" ]; then
  if is_local_host "$EXPLICIT_HOST"; then
    printf 'Explicit host %s matches this machine. Staying in local mode.\n' "$EXPLICIT_HOST"
  else
    REMOTE_HOST="$EXPLICIT_HOST"
    RUN_MODE="remote"
  fi
fi

AUTO_HOST="$(resolve_remote_host)"
if [ -n "$AUTO_HOST" ]; then
  printf 'Auto-resolved API host: %s\n' "$AUTO_HOST"
fi

if [ "$RUN_MODE" != "remote" ] && [ -n "$AUTO_HOST" ]; then
  if is_local_host "$AUTO_HOST"; then
    printf 'Auto-resolved host %s matches this machine. Staying in local mode.\n' "$AUTO_HOST"
  else
    REMOTE_HOST="$AUTO_HOST"
    RUN_MODE="remote"
  fi
fi

printf 'Mode: %s\n' "$RUN_MODE"

if [ "$RUN_MODE" = "remote" ]; then
  if [ -z "$REMOTE_HOST" ]; then
    echo "Unable to resolve a remote EC2 host automatically. Set EC2_HOST to your server IP or DNS name."
    exit 1
  fi
  printf 'Remote host: %s\n' "$REMOTE_HOST"
  printf 'SSH user candidates: %s\n' "$REMOTE_USER_CANDIDATES"
  if ! RESOLVED_REMOTE_TARGET="$(resolve_remote_target "$REMOTE_HOST")"; then
    echo "Remote deployment could not continue because SSH auto-login failed."
    exit 1
  fi
  printf 'Resolved SSH target: %s\n' "$RESOLVED_REMOTE_TARGET"
  run_remote "$RESOLVED_REMOTE_TARGET"
else
  run_local
fi

print_header "Completed"
printf 'Finished: %s\n' "$(date -Iseconds)"
printf 'Log: %s\n' "$DEPLOY_LOG_PATH"
