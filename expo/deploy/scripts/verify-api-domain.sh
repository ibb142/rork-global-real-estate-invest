#!/bin/bash
set -euo pipefail

DOMAIN="${1:-api.ivxholding.com}"
HEALTH_PATH="${HEALTH_PATH:-/health}"
OWNER_AI_PATH="${OWNER_AI_PATH:-/api/ivx/owner-ai}"
POST_BODY="${POST_BODY:-{\"conversationId\":\"route53-audit\",\"message\":\"health_probe\",\"senderLabel\":\"Route53 Audit\",\"mode\":\"chat\"}}"
AUTH_TOKEN="${AUTH_TOKEN:-}"

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

require_cmd curl
require_cmd python3

if command -v nslookup >/dev/null 2>&1; then
  DNS_CMD="nslookup"
elif command -v dig >/dev/null 2>&1; then
  DNS_CMD="dig"
else
  red "Neither nslookup nor dig is installed"
  exit 1
fi

print_section() {
  printf '\n'
  blue "━━━ $1 ━━━"
}

print_section "DNS"
if [ "$DNS_CMD" = "nslookup" ]; then
  nslookup "$DOMAIN" || true
else
  dig +short "$DOMAIN" || true
fi

print_section "TLS + HEALTH"
set +e
curl -sS -D /tmp/ivx_health_headers.txt -o /tmp/ivx_health_body.txt "https://${DOMAIN}${HEALTH_PATH}"
HEALTH_EXIT=$?
set -e
if [ "$HEALTH_EXIT" -ne 0 ]; then
  red "Health request failed for https://${DOMAIN}${HEALTH_PATH}"
else
  green "Health request succeeded"
  printf '\n[headers]\n'
  cat /tmp/ivx_health_headers.txt
  printf '\n[body]\n'
  cat /tmp/ivx_health_body.txt
  printf '\n'
fi

print_section "OPTIONS ${OWNER_AI_PATH}"
set +e
curl -sS -X OPTIONS -D /tmp/ivx_options_headers.txt -o /tmp/ivx_options_body.txt "https://${DOMAIN}${OWNER_AI_PATH}"
OPTIONS_EXIT=$?
set -e
if [ "$OPTIONS_EXIT" -ne 0 ]; then
  red "OPTIONS failed for https://${DOMAIN}${OWNER_AI_PATH}"
else
  green "OPTIONS succeeded"
  printf '\n[headers]\n'
  cat /tmp/ivx_options_headers.txt
  printf '\n[body]\n'
  cat /tmp/ivx_options_body.txt
  printf '\n'
fi

print_section "POST ${OWNER_AI_PATH}"
POST_HEADERS=(-H "Content-Type: application/json")
if [ -n "$AUTH_TOKEN" ]; then
  POST_HEADERS+=(-H "Authorization: Bearer ${AUTH_TOKEN}")
else
  yellow "AUTH_TOKEN not set; POST may return 401/403 if auth is required"
fi

set +e
curl -sS -X POST \
  "https://${DOMAIN}${OWNER_AI_PATH}" \
  "${POST_HEADERS[@]}" \
  --data "$POST_BODY" \
  -D /tmp/ivx_post_headers.txt \
  -o /tmp/ivx_post_body.txt
POST_EXIT=$?
set -e
if [ "$POST_EXIT" -ne 0 ]; then
  red "POST failed for https://${DOMAIN}${OWNER_AI_PATH}"
else
  green "POST completed"
  printf '\n[headers]\n'
  cat /tmp/ivx_post_headers.txt
  printf '\n[body]\n'
  cat /tmp/ivx_post_body.txt
  printf '\n'
fi

print_section "Route53 / AWS checks to run"
printf '%s\n' \
  "1. aws route53 list-hosted-zones-by-name --dns-name ivxholding.com" \
  "2. aws route53 list-resource-record-sets --hosted-zone-id <ZONE_ID>" \
  "3. Verify api.ivxholding.com record exists" \
  "4. If missing, create either:" \
  "   - CNAME api.ivxholding.com -> <backend-hostname>" \
  "   - A/ALIAS api.ivxholding.com -> <ALB/API Gateway/CloudFront target>" \
  "5. If using ALB, verify target health:" \
  "   aws elbv2 describe-target-health --target-group-arn <TARGET_GROUP_ARN>" \
  "6. If using ACM, verify certificate covers api.ivxholding.com" \
  "7. Tail logs after POST:" \
  "   aws logs tail /ivx/production/api --follow --region ${AWS_REGION:-us-east-1}"
