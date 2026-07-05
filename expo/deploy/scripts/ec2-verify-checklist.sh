#!/bin/bash
set -euo pipefail

API_DOMAIN="${API_DOMAIN:-api.ivxholding.com}"
CHAT_DOMAIN="${CHAT_DOMAIN:-chat.ivxholding.com}"
SERVICE_NAME="${SERVICE_NAME:-ivx-chat-api}"
PORT="${PORT:-3000}"
NGINX_CONF_PATH="${NGINX_CONF_PATH:-/etc/nginx/conf.d/ivx-chat.conf}"

pass_count=0
warn_count=0
fail_count=0

print_section() {
  printf '\n===== %s =====\n' "$1"
}

mark_pass() {
  pass_count=$((pass_count + 1))
  printf '[PASS] %s\n' "$1"
}

mark_warn() {
  warn_count=$((warn_count + 1))
  printf '[WARN] %s\n' "$1"
}

mark_fail() {
  fail_count=$((fail_count + 1))
  printf '[FAIL] %s\n' "$1"
}

run_check() {
  local description="$1"
  local expected="$2"
  shift 2

  print_section "$description"
  printf 'Expected: %s\n' "$expected"

  local output
  local status
  set +e
  output="$($@ 2>&1)"
  status=$?
  set -e

  printf 'Command: '
  printf '%q ' "$@"
  printf '\n'
  printf 'Exit: %s\n' "$status"
  if [ -n "$output" ]; then
    printf '%s\n' "$output"
  else
    printf '(no output)\n'
  fi

  if [ "$status" -eq 0 ]; then
    mark_pass "$description"
  else
    mark_fail "$description"
  fi
}

run_contains_check() {
  local description="$1"
  local expected="$2"
  local needle="$3"
  shift 3

  print_section "$description"
  printf 'Expected: %s\n' "$expected"

  local output
  local status
  set +e
  output="$($@ 2>&1)"
  status=$?
  set -e

  printf 'Command: '
  printf '%q ' "$@"
  printf '\n'
  printf 'Exit: %s\n' "$status"
  if [ -n "$output" ]; then
    printf '%s\n' "$output"
  else
    printf '(no output)\n'
  fi

  if [ "$status" -eq 0 ] && printf '%s' "$output" | grep -Fq "$needle"; then
    mark_pass "$description"
  else
    mark_fail "$description"
  fi
}

run_warn_check() {
  local description="$1"
  local expected="$2"
  shift 2

  print_section "$description"
  printf 'Expected: %s\n' "$expected"

  local output
  local status
  set +e
  output="$($@ 2>&1)"
  status=$?
  set -e

  printf 'Command: '
  printf '%q ' "$@"
  printf '\n'
  printf 'Exit: %s\n' "$status"
  if [ -n "$output" ]; then
    printf '%s\n' "$output"
  else
    printf '(no output)\n'
  fi

  if [ "$status" -eq 0 ]; then
    mark_pass "$description"
  else
    mark_warn "$description"
  fi
}

run_pm2_status() {
  if command -v pm2 >/dev/null 2>&1; then
    pm2 status "$SERVICE_NAME"
    return
  fi
  return 127
}

run_systemctl_nginx() {
  sudo systemctl status nginx --no-pager
}

run_nginx_test() {
  sudo nginx -t
}

run_port_probe() {
  bash -lc "ss -ltnp | grep -E '[:.]${PORT}\\b'"
}

run_local_health() {
  curl -sS --max-time 10 "http://127.0.0.1:${PORT}/health"
}

run_local_api_vhost() {
  curl -sS --max-time 10 -H "Host: ${API_DOMAIN}" http://127.0.0.1/health
}

run_local_chat_vhost() {
  curl -sS --max-time 10 -H "Host: ${CHAT_DOMAIN}" http://127.0.0.1/
}

run_public_api_http() {
  curl -sS --max-time 10 "http://${API_DOMAIN}/health"
}

run_public_chat_http() {
  curl -sS --max-time 10 "http://${CHAT_DOMAIN}/"
}

run_nginx_conf_presence() {
  test -f "$NGINX_CONF_PATH"
}

run_contains_check \
  "PM2 service status" \
  "PM2 output includes the service name ${SERVICE_NAME} and shows it online." \
  "$SERVICE_NAME" \
  run_pm2_status

run_check \
  "Nginx service status" \
  "systemctl exits 0 and shows nginx loaded/active." \
  run_systemctl_nginx

run_check \
  "Nginx config syntax" \
  "nginx -t exits 0 with syntax is ok and test is successful." \
  run_nginx_test

run_check \
  "Nginx vhost file present" \
  "${NGINX_CONF_PATH} exists on the host." \
  run_nginx_conf_presence

run_contains_check \
  "Port ${PORT} listener" \
  "ss output contains :${PORT}, proving the Node chat API is listening." \
  ":${PORT}" \
  run_port_probe

run_contains_check \
  "Local API health JSON" \
  "curl returns JSON containing \"ok\":true and deployment metadata from the local Node server." \
  '"ok":true' \
  run_local_health

run_contains_check \
  "Local API vhost through Nginx" \
  "Host-header probe returns JSON containing \"ok\":true through nginx on localhost." \
  '"ok":true' \
  run_local_api_vhost

run_contains_check \
  "Local chat vhost through Nginx" \
  "Host-header probe returns the exported chat HTML containing <!DOCTYPE html> or <html." \
  '<!DOCTYPE html>' \
  run_local_chat_vhost

run_warn_check \
  "Public API probe" \
  "Public HTTP probe should return JSON containing \"ok\":true. If this warns or fails, the live host or public DNS/proxy is still blocked." \
  run_public_api_http

run_warn_check \
  "Public chat probe" \
  "Public HTTP probe should return the chat HTML. If this warns or fails, the public listener is still not serving the frontend." \
  run_public_chat_http

print_section "Summary"
printf 'PASS=%s WARN=%s FAIL=%s\n' "$pass_count" "$warn_count" "$fail_count"

if [ "$fail_count" -gt 0 ]; then
  exit 1
fi
