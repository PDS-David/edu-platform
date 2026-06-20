#!/usr/bin/env bash
# deploy.sh — Full deploy for AISchoolonair on Hetzner CX23

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

echo "═══════════════════════════════════════════════════"
echo "  AISchoolonair — Production Deploy"
echo "  Repo: $REPO_DIR"
echo "═══════════════════════════════════════════════════"

# 1. Sync code (NO pull conflicts ever)
echo "▶ 1/5  Syncing code..."
git fetch origin
git reset --hard origin/main

# 2. Ensure safe directories exist (prevents Docker permission crash)
echo ""
echo "▶ 2/5  Preparing safe directories..."
mkdir -p server/keys_secure
mkdir -p hls_secure
chmod 755 server/keys_secure || true
chmod 755 hls_secure || true

# 3. Clean Docker cache (ensures .dockerignore is respected)
echo ""
echo "▶ 3/5  Cleaning Docker cache..."
docker builder prune -af || true

# 4. Build images (NO CACHE)
echo ""
echo "▶ 4/5  Building images..."
docker compose build --no-cache --progress=plain api web

# 5. Restart services
echo ""
echo "▶ 5/5  Restarting services..."
docker compose up -d --no-deps api web

echo "  Waiting 15s for containers..."
sleep 15

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Deploy complete!"
echo "═══════════════════════════════════════════════════"

# Health check
sleep 4
if curl -sf https://www.aischoolonair.ng/api/health > /dev/null; then
  echo "  🟢 API is healthy"
else
  echo "  🔴 API failed — check logs:"
  echo "     docker compose logs api"
fi

echo ""
