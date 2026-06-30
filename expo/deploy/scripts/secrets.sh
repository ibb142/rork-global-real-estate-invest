#!/bin/bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_NAME="${APP_NAME:-ivx-holdings}"
AWS_REGION="${AWS_REGION:-us-east-1}"
ACTION="${1:-list}"

command -v aws >/dev/null 2>&1 || { echo -e "${RED}aws CLI not found${NC}"; exit 1; }

create_or_update_secret() {
  local name="$1"
  local value="$2"
  local description="${3:-}"
  local secret_id="${APP_NAME}/${name}"

  if aws secretsmanager describe-secret --secret-id "$secret_id" --region "$AWS_REGION" >/dev/null 2>&1; then
    aws secretsmanager update-secret \
      --secret-id "$secret_id" \
      --secret-string "$value" \
      --region "$AWS_REGION" >/dev/null
    echo -e "${GREEN}[UPDATED]${NC} $secret_id"
  else
    aws secretsmanager create-secret \
      --name "$secret_id" \
      --description "$description" \
      --secret-string "$value" \
      --region "$AWS_REGION" >/dev/null
    echo -e "${GREEN}[CREATED]${NC} $secret_id"
  fi
}

case "$ACTION" in
  list)
    echo ""
    echo "━━━ IVX Holdings Secrets ━━━"
    echo ""
    SECRETS=$(aws secretsmanager list-secrets \
      --filter "Key=name,Values=${APP_NAME}/" \
      --region "$AWS_REGION" \
      --query 'SecretList[].{Name:Name,Updated:LastChangedDate,Created:CreatedDate}' \
      --output json 2>/dev/null || echo "[]")

    echo "$SECRETS" | python3 -c "
import sys, json
secrets = json.load(sys.stdin)
if not secrets:
    print('  No secrets found')
else:
    for s in sorted(secrets, key=lambda x: x['Name']):
        name = s['Name']
        updated = str(s.get('Updated') or s.get('Created') or 'unknown')[:19]
        print(f'  {name:50s} (updated: {updated})')
"
    echo ""
    ;;

  set)
    SECRET_NAME="${2:-}"
    SECRET_VALUE="${3:-}"

    if [ -z "$SECRET_NAME" ] || [ -z "$SECRET_VALUE" ]; then
      echo "Usage: $0 set <secret-name> <secret-value>"
      echo "Example: $0 set stripe-secret-key sk_live_xxx"
      exit 1
    fi

    create_or_update_secret "$SECRET_NAME" "$SECRET_VALUE" "IVX Holdings secret"
    ;;

  import)
    ENV_FILE="${2:-.env}"
    if [ ! -f "$ENV_FILE" ]; then
      echo -e "${RED}File not found: $ENV_FILE${NC}"
      exit 1
    fi

    echo "Importing secrets from $ENV_FILE..."
    while IFS= read -r line || [ -n "$line" ]; do
      line=$(echo "$line" | sed 's/^[[:space:]]*//' | sed 's/[[:space:]]*$//')
      [[ -z "$line" || "$line" == \#* ]] && continue
      KEY=$(echo "$line" | cut -d= -f1)
      VALUE=$(echo "$line" | cut -d= -f2-)

      [[ "$KEY" == "NODE_ENV" || "$KEY" == "PORT" || "$KEY" == "HOST" ]] && continue
      [[ "$KEY" == EXPO_PUBLIC_* ]] && continue
      [[ "$VALUE" == "REPLACE_"* || "$VALUE" == "PLACEHOLDER"* || -z "$VALUE" ]] && continue

      SECRET_NAME=$(echo "$KEY" | tr '[:upper:]' '[:lower:]' | tr '_' '-')
      create_or_update_secret "$SECRET_NAME" "$VALUE" "Imported from $ENV_FILE: $KEY"
    done < "$ENV_FILE"
    echo -e "${GREEN}Import complete${NC}"
    ;;

  delete)
    SECRET_NAME="${2:-}"
    if [ -z "$SECRET_NAME" ]; then
      echo "Usage: $0 delete <secret-name>"
      exit 1
    fi

    SECRET_ID="${APP_NAME}/${SECRET_NAME}"
    read -p "Delete secret $SECRET_ID? (y/N) " CONFIRM
    if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
      aws secretsmanager delete-secret \
        --secret-id "$SECRET_ID" \
        --force-delete-without-recovery \
        --region "$AWS_REGION" >/dev/null
      echo -e "${GREEN}[DELETED]${NC} $SECRET_ID"
    fi
    ;;

  *)
    echo "Usage: $0 {list|set|import|delete}"
    echo ""
    echo "Commands:"
    echo "  list                        List all secrets"
    echo "  set <name> <value>          Create or update a secret"
    echo "  import [.env file]          Import secrets from .env file"
    echo "  delete <name>               Delete a secret"
    ;;
esac
