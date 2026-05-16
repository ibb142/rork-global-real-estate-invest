#!/bin/bash
set -euo pipefail

DOMAIN="${1:-api.ivxholding.com}"
HEALTH_PATH="${HEALTH_PATH:-/health}"
CHAT_PATH="${CHAT_PATH:-/chat}"
OWNER_AI_PATH="${OWNER_AI_PATH:-/api/ivx/owner-ai}"
POST_BODY="${POST_BODY:-{"conversationId":"route53-audit","message":"health_probe","senderLabel":"Route53 Audit","mode":"chat"}}"
AUTH_TOKEN="${AUTH_TOKEN:-}"
CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-5}"
CURL_MAX_TIME="${CURL_MAX_TIME:-15}"
TOTAL_FAIL=0

blue() { printf '\033[0;34m%s\033[0m\n' "$1"; }
green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$1"; }
red() { printf '\033[0;31m%s\033[0m\n' "$1"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    red "Missing required command: $1"
    exit 1
  fi
}

record_failure() {
  red "$1"
  TOTAL_FAIL=$((TOTAL_FAIL + 1))
}

record_success() {
  green "$1"
}

print_section() {
  printf '\n'
  blue "━━━ $1 ━━━"
}

read_status_code() {
  python3 - "$1" <<'PY'
import re
import sys

path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8', errors='ignore') as handle:
        for line in handle:
            match = re.match(r'^HTTP/\S+\s+(\d+)', line.strip())
            if match:
                print(match.group(1))
                raise SystemExit(0)
except FileNotFoundError:
    pass
PY
}

status_allowed() {
  local status="$1"
  shift
  for allowed in "$@"; do
    if [ "$status" = "$allowed" ]; then
      return 0
    fi
  done
  return 1
}

print_response() {
  local headers_path="$1"
  local body_path="$2"
  printf '\n[headers]\n'
  cat "$headers_path"
  printf '\n[body]\n'
  cat "$body_path"
  printf '\n'
}

require_cmd curl
require_cmd python3

if command -v nslookup >/dev/null 2>&1; then
  DNS_CMD="nslookup"
elif command -v dig >/dev/null 2>&1; then
  DNS_CMD="dig"
else
  DNS_CMD="python"
fi

print_section "DNS"
if [ "$DNS_CMD" = "nslookup" ]; then
  nslookup "$DOMAIN" || true
elif [ "$DNS_CMD" = "dig" ]; then
  dig +short "$DOMAIN" || true
else
  python3 - <<PY
import json
import socket
import urllib.request

domain = ${DOMAIN@Q}

print(f'[socket] {domain}')
try:
    infos = socket.getaddrinfo(domain, 443, proto=socket.IPPROTO_TCP)
    addrs = sorted({info[4][0] for info in infos})
    if addrs:
        for addr in addrs:
            print(addr)
    else:
        print('NO_ADDRESSES')
except Exception as exc:
    print(f'ERROR: {exc}')

print(f'\n[dns.google] {domain}')
try:
    with urllib.request.urlopen(f'https://dns.google/resolve?name={domain}&type=A', timeout=20) as response:
        payload = json.load(response)
    for answer in payload.get('Answer', []):
        print(answer.get('data', ''))
    if 'Answer' not in payload:
        print(json.dumps(payload, indent=2))
except Exception as exc:
    print(f'ERROR: {exc}')
PY
fi

if python3 - "$DOMAIN" <<'PY'
import socket
import sys

socket.getaddrinfo(sys.argv[1], 443, proto=socket.IPPROTO_TCP)
PY
then
  record_success "DNS resolution succeeded for ${DOMAIN}"
else
  record_failure "DNS resolution failed for ${DOMAIN}"
fi

CURL_ARGS=(--connect-timeout "$CURL_CONNECT_TIMEOUT" --max-time "$CURL_MAX_TIME")

print_section "TLS + HEALTH"
set +e
curl "${CURL_ARGS[@]}" -sS -D /tmp/ivx_health_headers.txt -o /tmp/ivx_health_body.txt "https://${DOMAIN}${HEALTH_PATH}"
HEALTH_EXIT=$?
set -e
if [ "$HEALTH_EXIT" -ne 0 ]; then
  record_failure "Health request failed for https://${DOMAIN}${HEALTH_PATH}"
else
  print_response /tmp/ivx_health_headers.txt /tmp/ivx_health_body.txt
  HEALTH_STATUS="$(read_status_code /tmp/ivx_health_headers.txt)"
  if [ "$HEALTH_STATUS" = "200" ]; then
    record_success "Health endpoint returned HTTP 200"
  else
    record_failure "Health endpoint returned HTTP ${HEALTH_STATUS:-unknown}"
  fi
fi

print_section "POST ${CHAT_PATH}"
POST_HEADERS=(-H "Content-Type: application/json")
if [ -n "$AUTH_TOKEN" ]; then
  POST_HEADERS+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
else
  yellow "AUTH_TOKEN not set; POST may return 401/403 if auth is required"
fi

set +e
curl "${CURL_ARGS[@]}" -sS -X POST \
  "https://${DOMAIN}${CHAT_PATH}" \
  "${POST_HEADERS[@]}" \
  --data "$POST_BODY" \
  -D /tmp/ivx_chat_headers.txt \
  -o /tmp/ivx_chat_body.txt
CHAT_EXIT=$?
set -e
if [ "$CHAT_EXIT" -ne 0 ]; then
  record_failure "POST failed for https://${DOMAIN}${CHAT_PATH}"
else
  print_response /tmp/ivx_chat_headers.txt /tmp/ivx_chat_body.txt
  CHAT_STATUS="$(read_status_code /tmp/ivx_chat_headers.txt)"
  if status_allowed "$CHAT_STATUS" 200 201 202 204 400 401 403 405 409 422 429; then
    record_success "POST ${CHAT_PATH} returned HTTP ${CHAT_STATUS}"
  else
    record_failure "POST ${CHAT_PATH} returned unexpected HTTP ${CHAT_STATUS:-unknown}"
  fi
fi

print_section "OPTIONS ${OWNER_AI_PATH}"
set +e
curl "${CURL_ARGS[@]}" -sS -X OPTIONS -D /tmp/ivx_options_headers.txt -o /tmp/ivx_options_body.txt "https://${DOMAIN}${OWNER_AI_PATH}"
OPTIONS_EXIT=$?
set -e
if [ "$OPTIONS_EXIT" -ne 0 ]; then
  record_failure "OPTIONS failed for https://${DOMAIN}${OWNER_AI_PATH}"
else
  print_response /tmp/ivx_options_headers.txt /tmp/ivx_options_body.txt
  OPTIONS_STATUS="$(read_status_code /tmp/ivx_options_headers.txt)"
  if status_allowed "$OPTIONS_STATUS" 200 204 401 403 405; then
    record_success "OPTIONS ${OWNER_AI_PATH} returned HTTP ${OPTIONS_STATUS}"
  else
    record_failure "OPTIONS ${OWNER_AI_PATH} returned unexpected HTTP ${OPTIONS_STATUS:-unknown}"
  fi
fi

print_section "POST ${OWNER_AI_PATH}"
POST_HEADERS=(-H "Content-Type: application/json")
if [ -n "$AUTH_TOKEN" ]; then
  POST_HEADERS+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
else
  yellow "AUTH_TOKEN not set; POST may return 401/403 if auth is required"
fi

set +e
curl "${CURL_ARGS[@]}" -sS -X POST \
  "https://${DOMAIN}${OWNER_AI_PATH}" \
  "${POST_HEADERS[@]}" \
  --data "$POST_BODY" \
  -D /tmp/ivx_post_headers.txt \
  -o /tmp/ivx_post_body.txt
POST_EXIT=$?
set -e
if [ "$POST_EXIT" -ne 0 ]; then
  record_failure "POST failed for https://${DOMAIN}${OWNER_AI_PATH}"
else
  print_response /tmp/ivx_post_headers.txt /tmp/ivx_post_body.txt
  POST_STATUS="$(read_status_code /tmp/ivx_post_headers.txt)"
  if status_allowed "$POST_STATUS" 200 201 202 204 400 401 403 405 409 422 429; then
    record_success "POST ${OWNER_AI_PATH} returned HTTP ${POST_STATUS}"
  else
    record_failure "POST ${OWNER_AI_PATH} returned unexpected HTTP ${POST_STATUS:-unknown}"
  fi
fi

print_section "Route53 / AWS checks to run"
printf '%s\n' \
  "1. aws route53 list-hosted-zones-by-name --dns-name ivxholding.com" \
  "2. aws route53 list-resource-record-sets --hosted-zone-id <ZONE_ID>" \
  "3. Verify api.ivxholding.com record exists" \
  "4. If the target is an ALB, create Route53 A (Alias) using the ALB DNS name + ALBCanonicalHostedZoneID" \
  "   - Preferred: A/ALIAS api.ivxholding.com -> dualstack.<ALB_DNS>" \
  "   - Use CNAME only when you intentionally point at a non-ALB backend hostname" \
  "5. If using ALB, verify target health:" \
  "   aws elbv2 describe-target-health --target-group-arn <TARGET_GROUP_ARN>" \
  "6. If using ACM, verify certificate covers api.ivxholding.com" \
  "7. Tail logs after POST:" \
  "   aws logs tail /ivx/production/api --follow --region ${AWS_REGION:-us-east-1}"

print_section "Final result"
if [ "$TOTAL_FAIL" -eq 0 ]; then
  green "Public API domain verification passed"
else
  red "Public API domain verification found ${TOTAL_FAIL} blocking check(s)"
fi

exit "$TOTAL_FAIL"
