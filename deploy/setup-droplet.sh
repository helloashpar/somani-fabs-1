#!/usr/bin/env bash
# Run this ONCE on a fresh Ubuntu droplet, as root:
#   bash setup-droplet.sh
set -euo pipefail

echo "==> Updating system"
apt-get update -y && apt-get upgrade -y

echo "==> Installing Docker, nginx, certbot, git"
apt-get install -y ca-certificates curl gnupg git nginx
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list
apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
apt-get install -y certbot python3-certbot-nginx

echo "==> Enabling firewall (SSH + web only)"
ufw allow OpenSSH
ufw allow "Nginx Full"
ufw --force enable

echo "==> Adding 2GB swap (protects small droplets during image builds)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Docker version:"; docker --version; docker compose version
echo "==> Setup complete. Next: clone your repo into /opt/somanifabs"
