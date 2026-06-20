#!/usr/bin/env bash
# deploy.sh — Full deploy for AISchoolonair on Hetzner CX23
# Run as root from anywhere:  bash /opt/aischoolonair/deploy.sh

set -euo pipefail

# Always run from the repo root so docker compose finds docker-compose.yml
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

echo "═══════════════════════════════════════════════════"
echo "  AISchoolonair — Production Deploy"
echo "  Repo: $REPO_DIR"
echo "═══════════════════════════════════════════════════"

# 1. Pull latest code
echo "▶ 1/4  Pulling latest code..."
git pull origin main

# 🔥 CRITICAL FIX: Ensure Docker can read directory metadata (prevents permission crash)
echo ""
echo "▶ Fixing permissions for restricted directories..."
chmod -R 755 server/keys_secure 2>/dev/null || true
chmod -R 755 hls_secure 2>/dev/null || true

# 2. Rebuild API + Web images (NO CACHE to force .dockerignore usage)
echo ""
echo "▶ 2/4  Building images (no cache)..."
docker compose build --no-cache --progress=plain api web

# 3. Restart with zero downtime (Caddy stays up)
echo ""
echo "▶ 3/4  Restarting services..."
docker compose up -d --no-deps api web

# Give the new container time to start and connect to the DB
echo "  Waiting 15s for containers to be ready..."
sleep 15

# 4. Run DB migrations (currently skipped)
echo ""
echo "▶ 4/4  Running DB migrations..."
echo "⚠ Migration runner not present in Docker image. Skipping."

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅  Deploy complete!"
echo "  Checking health..."
echo "═══════════════════════════════════════════════════"

sleep 4

# Health check
if curl -sf https://www.aischoolonair.ng/api/health > /dev/null; then
  echo "  🟢  API is healthy"
else
  echo "  🔴  API health check failed — run: docker compose logs api"
fi

echo ""
