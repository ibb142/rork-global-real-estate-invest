#!/bin/bash
set -euo pipefail

API_DOMAIN="${API_DOMAIN:-api.ivxholding.com}"
CHAT_DOMAIN="${CHAT_DOMAIN:-chat.ivxholding.com}"
EMAIL="${LETSENCRYPT_EMAIL:-}"
LETSENCRYPT_CERT_NAME="${LETSENCRYPT_CERT_NAME:-ivx-chat-api}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
EXPO_ROOT="${PROJECT_ROOT}/expo"
BOOTSTRAP_NGINX_SOURCE="${EXPO_ROOT}/deploy/nginx/ec2-node-bootstrap.conf"
HTTP_NGINX_SOURCE="${EXPO_ROOT}/deploy/nginx/ec2-node-http.conf"
HTTPS_NGINX_SOURCE="${EXPO_ROOT}/deploy/nginx/ec2-node.conf"
NGINX_CONF_DEST="${NGINX_CONF_DEST:-/etc/nginx/conf.d/ivx-chat.conf}"
CERTBOT_WEBROOT="${CERTBOT_WEBROOT:-/var/www/certbot}"

if [ -z "$EMAIL" ]; then
  echo "LETSENCRYPT_EMAIL is required"
  exit 1
fi

sudo dnf install -y snapd
sudo systemctl enable --now snapd.socket
sudo ln -sf /var/lib/snapd/snap /snap
sudo snap install core
sudo snap refresh core
sudo snap install --classic certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot

sudo mkdir -p "$CERTBOT_WEBROOT"
sudo cp "$BOOTSTRAP_NGINX_SOURCE" "$NGINX_CONF_DEST"
sudo nginx -t
sudo systemctl reload nginx

sudo certbot certonly --nginx \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  --cert-name "$LETSENCRYPT_CERT_NAME" \
  -d "$API_DOMAIN" \
  -d "$CHAT_DOMAIN"

sudo cp "$HTTPS_NGINX_SOURCE" "$NGINX_CONF_DEST"
sudo nginx -t
sudo systemctl reload nginx

sudo systemctl enable snap.certbot.renew.timer || true
sudo systemctl start snap.certbot.renew.timer || true
sudo certbot renew --dry-run
