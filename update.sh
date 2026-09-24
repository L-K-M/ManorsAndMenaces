#!/usr/bin/env bash
# Deploys/updates the self-hosted server: pulls the branch, rebuilds and
# restarts the compose stack, prunes old images, and shows status.
#
# Usage: ./update.sh [branch]   (default: main)
# Requires: git, docker with the compose plugin; gh optional.
set -euo pipefail
cd "$(dirname "$0")"
BRANCH="${1:-main}"

echo "==> Updating to origin/$BRANCH"
git checkout "$BRANCH"
if command -v gh >/dev/null 2>&1 && gh repo sync --branch "$BRANCH" >/dev/null 2>&1; then
  echo "-- synced with gh"
else
  git pull --ff-only
fi

echo "==> Rebuilding and restarting"
docker compose up -d --build --remove-orphans

echo "==> Pruning old images"
docker image prune -f

docker compose ps
