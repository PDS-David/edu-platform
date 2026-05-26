#!/usr/bin/env bash
# deploy.sh — Full deploy for AISchoolonair on Hetzner CX23
# Run as root from anywhere:  bash /opt/aischoolonair/deploy.sh
set -euo pipefail

# Always run from the repo root so docker compose finds docker-compose.yml
# regardless of the shell's current working directory.
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

echo "═══════════════════════════════════════════════════"
echo "  AISchoolonair — Production Deploy"
echo "  Repo: $REPO_DIR"
echo "═══════════════════════════════════════════════════"

# 1. Sync code — stash any local server edits, then hard-reset to remote
echo ""
echo "▶ 1/4  Pulling latest code..."
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "  ⚠️  Local changes detected — stashing before pull..."
  git stash push -m "auto-stash before deploy $(date -u +%Y%m%dT%H%M%S)"
fi
git fetch origin main
git reset --hard origin/main
echo "  ✅  At $(git rev-parse --short HEAD)"

# 2. Rebuild API + Web images
#    NOTE: Migrations run AFTER the new container is up (step 3/4) so the
#    running container always has the code that matches the schema.
#    Running migrations against the *old* container before rebuild risks a
#    schema/code mismatch if the old container crashes mid-migration.
echo ""
echo "▶ 2/4  Building images..."
# --no-cache on api ensures npm ci always re-runs, picking up any new packages
# (e.g. @google/genai). Web can use cache — its deps change rarely.
docker compose build --no-cache api
docker compose build web

# 3. Restart with zero downtime (Caddy stays up)
echo ""
echo "▶ 3/4  Restarting services..."
docker compose up -d --no-deps api web

# Give the new container time to start and connect to the DB before running migrations
echo "  Waiting 15s for containers to be ready..."
sleep 15

# 4. Run DB migrations inside the NEW running API container
echo ""
echo "▶ 4/4  Running DB migrations..."
docker exec -i aischool_api node - < server/scripts/run_complete_migration.js

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅  Deploy complete!"
echo "  Checking health..."
echo "═══════════════════════════════════════════════════"
sleep 4
curl -sf https://www.aischoolonair.ng/api/health && echo "  🟢  API is healthy" || echo "  🔴  API health check failed — run: docker compose logs api"
echo ""
