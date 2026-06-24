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
echo ""
echo "▶ 1/6  Syncing code..."
git fetch origin
git reset --hard origin/main

# 2. Ensure safe directories exist on the host (NOT inside Docker)
echo ""
echo "▶ 2/6  Preparing runtime directories on host..."
mkdir -p server/keys_secure
mkdir -p hls_secure
# Fix permissions only if we own the directory — never fail if we don't
chmod 755 server/keys_secure 2>/dev/null || true
chmod 755 hls_secure        2>/dev/null || true

# 3. Show what is currently running before we touch anything
echo ""
echo "▶ 3/6  Current container state:"
docker compose ps || true

# 4. Build new images
echo ""
echo "▶ 4/6  Building api and web images..."
docker compose build --no-cache --progress=plain api web

# ── Verify the new images were actually built ─────────────────────────────
# Get the image ID that was just built. If docker compose build failed
# silently (OOM, layer error, etc.) the old image stays and the old
# container keeps running — we'd never know. Fail loudly instead.
NEW_WEB_IMAGE=$(docker inspect aischool_web:latest --format '{{.Id}}' 2>/dev/null || true)
NEW_API_IMAGE=$(docker inspect aischool_api:latest --format '{{.Id}}' 2>/dev/null || true)
echo "  web image: ${NEW_WEB_IMAGE:0:20}..."
echo "  api image: ${NEW_API_IMAGE:0:20}..."

# 5. Force-recreate web and api containers (don't rely on image-ID comparison)
echo ""
echo "▶ 5/6  Bringing up all services..."
docker compose up -d caddy redis
# --force-recreate guarantees the container is replaced even if Docker thinks
# the image ID hasn't changed (which can happen with layer caching quirks).
docker compose up -d --no-deps --force-recreate api web

echo ""
echo "  Waiting 25s for containers to become healthy..."
sleep 25

# 6. Run DB migrations (now that the container is healthy and scripts/ ships in the image)
echo ""
echo "▶ 6/7  Running DB migrations..."
docker exec aischool_api node /app/scripts/run_complete_migration.js
echo "  ✅ Migrations complete"

# 7. Health check
echo ""
echo "▶ 7/7  Container state after deploy:"
docker compose ps || true

echo ""
if curl -sf --max-time 10 https://www.aischoolonair.ng/api/health > /dev/null; then
  echo "  🟢 API is healthy — deploy complete"
else
  echo "  🔴 API health check failed. Showing logs:"
  echo ""
  echo "--- api logs (last 30 lines) ---"
  docker compose logs --tail=30 api || true
  echo ""
  echo "--- caddy logs (last 15 lines) ---"
  docker compose logs --tail=15 caddy || true
  exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Deploy complete!"
echo "═══════════════════════════════════════════════════"
