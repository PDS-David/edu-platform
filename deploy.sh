#!/usr/bin/env bash
# deploy.sh — Full deploy for AISchoolonair on Hetzner CX23
# Run as root from the repo directory:  bash deploy.sh
set -euo pipefail

echo "═══════════════════════════════════════════════════"
echo "  AISchoolonair — Production Deploy"
echo "═══════════════════════════════════════════════════"

# 1. Pull latest code
echo ""
echo "▶ 1/4  Pulling latest code..."
git pull origin main

# 2. Run DB migrations inside the running API container
echo ""
echo "▶ 2/4  Running DB migrations..."
docker cp server/scripts/run_complete_migration.js aischool_api:/tmp/run_complete_migration.js
docker exec aischool_api node /tmp/run_complete_migration.js

# 3. Rebuild API + Web images
echo ""
echo "▶ 3/4  Building images..."
docker compose build api web

# 4. Restart with zero downtime (Caddy stays up)
echo ""
echo "▶ 4/4  Restarting services..."
docker compose up -d --no-deps api web

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅  Deploy complete!"
echo "  Checking health..."
echo "═══════════════════════════════════════════════════"
sleep 4
curl -sf https://www.aischoolonair.ng/api/health && echo "  🟢  API is healthy" || echo "  🔴  API health check failed — run: docker compose logs api"
echo ""
