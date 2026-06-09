#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DOMAIN="${API_DOMAIN:-api.ivxholding.com}"
TOTAL_FAIL=0

blue() { printf '\033[0;34m%s\033[0m\n' "$1"; }
green() { printf '\033[0;32m%s\033[0m\n' "$1"; }
red() { printf '\033[0;31m%s\033[0m\n' "$1"; }

print_section() {
  printf '\n'
  blue "━━━ $1 ━━━"
}

run_check() {
  local label="$1"
  shift

  print_section "$label"
  if "$@"; then
    green "$label passed"
  else
    red "$label failed"
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
  fi
}

run_check "IVX deploy IAM live verification" node "$SCRIPT_DIR/verify-ivx-deploy-iam.mjs"
run_check "IVX deploy IAM inline-policy attach diagnostics" node "$SCRIPT_DIR/grant-ivx-deploy-cutover-policy.mjs"
run_check "EC2 access audit" node "$SCRIPT_DIR/ec2-access-audit.mjs"
if [ -n "${EC2_RUN_INSTANCES_COMMAND:-}" ]; then
  run_check "EC2 run-instances command audit" node "$SCRIPT_DIR/ec2-launch-command-audit.mjs"
else
  print_section "EC2 run-instances command audit"
  blue "Skipped because EC2_RUN_INSTANCES_COMMAND is not set"
fi
run_check "Public API domain verification" bash "$SCRIPT_DIR/verify-api-domain.sh" "$API_DOMAIN"
run_check "IVX infra audit" node "$SCRIPT_DIR/ivx-infra-audit.mjs"

print_section "Final result"
if [ "$TOTAL_FAIL" -eq 0 ]; then
  green "IVX cutover validation passed"
else
  red "IVX cutover validation found ${TOTAL_FAIL} blocking check(s)"
fi

exit "$TOTAL_FAIL"
