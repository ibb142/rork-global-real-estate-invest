#!/bin/bash
set -euo pipefail

SERVICE_USER="${SERVICE_USER:-ec2-user}"
NODE_PACKAGE="${NODE_PACKAGE:-nodejs22}"
NPM_PACKAGE="${NPM_PACKAGE:-nodejs22-npm}"
PACKAGE_MANAGER=""

install_packages() {
  if command -v dnf >/dev/null 2>&1; then
    PACKAGE_MANAGER="dnf"
    sudo dnf update -y
    sudo dnf install -y nginx rsync git tar gzip unzip curl ca-certificates shadow-utils procps-ng "$NODE_PACKAGE" "$NPM_PACKAGE"
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    PACKAGE_MANAGER="yum"
    sudo yum update -y
    sudo yum install -y nginx rsync git tar gzip unzip curl ca-certificates shadow-utils procps-ng "$NODE_PACKAGE" "$NPM_PACKAGE"
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    PACKAGE_MANAGER="apt-get"
    export DEBIAN_FRONTEND=noninteractive
    sudo apt-get update -y
    sudo apt-get install -y nginx rsync git tar gzip unzip curl ca-certificates passwd procps

    if ! command -v node >/dev/null 2>&1 || [ "$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)" -lt 22 ]; then
      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
      sudo apt-get install -y nodejs
    fi
    return
  fi

  echo "Unsupported package manager. Expected dnf, yum, or apt-get."
  exit 1
}

install_packages

if command -v node-22 >/dev/null 2>&1; then
  sudo alternatives --set node /usr/bin/node-22 || true
fi

if command -v npm-22 >/dev/null 2>&1; then
  sudo alternatives --set npm /usr/bin/npm-22 || true
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node 22 or newer is required. Installed version: $(node --version)"
  exit 1
fi

if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
fi

BUN_BIN="$HOME/.bun/bin"
if ! grep -q 'BUN_INSTALL' "$HOME/.bashrc" 2>/dev/null; then
  {
    echo 'export BUN_INSTALL="$HOME/.bun"'
    echo 'export PATH="$BUN_INSTALL/bin:$PATH"'
  } >> "$HOME/.bashrc"
fi

export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is not installed after bootstrap"
  exit 1
fi

(
  cd "$HOME"
  bun install -g pm2
)

NGINX_BIN="$(command -v nginx || true)"
if [ -z "$NGINX_BIN" ] && [ -x "/usr/sbin/nginx" ]; then
  NGINX_BIN="/usr/sbin/nginx"
fi

sudo mkdir -p /etc/nginx/conf.d /var/www/ivx-chat /var/www/certbot
if id "$SERVICE_USER" >/dev/null 2>&1; then
  sudo chown -R "$SERVICE_USER":"$SERVICE_USER" /var/www/ivx-chat
fi
sudo systemctl enable nginx
sudo systemctl restart nginx

node --version
bun --version
pm2 -v
if [ -n "$NGINX_BIN" ]; then
  "$NGINX_BIN" -v
else
  echo "nginx binary not found after bootstrap"
  exit 1
fi
