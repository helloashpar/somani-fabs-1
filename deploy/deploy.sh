#!/usr/bin/env bash
# Pull latest code and restart the app. Run from the repo folder on the droplet:
#   cd /opt/somanifabs && bash deploy/deploy.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Pulling latest code"
git fetch --all
git reset --hard origin/main

echo "==> Building containers"
docker compose build

echo "==> Restarting app"
docker compose up -d

echo "==> Cleaning old images"
docker image prune -f

echo "==> Waiting for backend health"
for i in $(seq 1 30); do
  if curl -fs http://127.0.0.1:8001/health > /dev/null; then
    echo "Backend healthy."
    break
  fi
  sleep 2
done

curl -fs http://127.0.0.1:8001/health || { echo "Backend NOT healthy. Logs:"; docker compose logs --tail=50 backend; exit 1; }
echo "==> Deploy done."
