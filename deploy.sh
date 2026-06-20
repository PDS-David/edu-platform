#!/usr/bin/env bash
# deploy.sh — Full deploy for AISchoolonair on Hetzner CX23

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

echo "═══════════════════════════════════════════════════"
echo "  AISchoolonair — Production Deploy"
echo "  Repo: $REPO_DIR"
echo "═══════════════════════════════════════════════════"

# 1. Sync code (force clean state)
echo "▶ 1/5  Syncing code..."
git fetch origin
git reset --hard origin/main

# 2. Ensure safe directories exist
echo ""
echo "▶ 2/5  Preparing safe directories..."
mkdir -p server/keys_secure
mkdir -p hls_secure

# Avoid failing if permissions are restricted (e.g., mounted volumes)
chmod 755 server/keys_secure 2>/dev/null || true
chmod 755 hls_secure 2>/dev/null || true

# 3. Clean Docker cache (ensures .dockerignore is respected)
echo ""
echo "▶ 3/5  Cleaning Docker cache..."
docker builder prune -af || true

# 4. Stop and remove old containers (FIXES your error)
echo ""
echo "▶ 4/5  Stopping old containers..."
docker compose down --remove-orphans || true

# 5. Build and start fresh containers
echo ""
echo "▶ 5/5  Building and starting services..."
docker compose up -d --build api web

echo ""
echo "  Waiting 15s for containers..."
sleep 15

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Deploy complete!"
echo "═══════════════════════════════════════════════════"

# Health check
echo ""
echo "▶ Running health check..."
sleep 5

if curl -sf https://www.aischoolonair.ng/api/health > /dev/null; then
  echo "  🟢 API is healthy"
else
  echo "  🔴 API failed — check logs:"
  echo "     docker compose logs api"
fi

echo ""
