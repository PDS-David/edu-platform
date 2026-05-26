#!/usr/bin/env bash
# fix_and_deploy.sh — One-shot fix for AISchoolonair on Hetzner
# Handles: stale local git changes, Docker cache, missing migrations, aiChatRoute
# Run as root from repo dir:  bash fix_and_deploy.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

# ── Self-update guard ─────────────────────────────────────────────────────────
# If ALREADY_UPDATED is not set, pull latest code first then re-exec this
# script from the freshly pulled version so we always run the newest logic.
if [[ -z "${ALREADY_UPDATED:-}" ]]; then
  echo "════════════════════════════════════════════════════"
  echo "  AISchoolonair — Updating deploy script..."
  echo "════════════════════════════════════════════════════"
  # Discard any local changes (e.g. server-side edits)
  git stash push -m "auto-stash $(date -u +%Y%m%dT%H%M%S)" 2>/dev/null || true
  git fetch origin main
  git reset --hard origin/main
  echo "  ✅  Code at $(git rev-parse --short HEAD)"
  echo "  Re-running updated deploy script..."
  echo ""
  exec env ALREADY_UPDATED=1 bash "${BASH_SOURCE[0]}"
fi

echo "════════════════════════════════════════════════════"
echo "  AISchoolonair — Fix & Deploy"
echo "  $(date -u)"
echo "════════════════════════════════════════════════════"

# ── STEP 1: Already done by self-update guard above ───────────────────────────
echo ""
echo "▶ 1/5  Code synced to $(git rev-parse --short HEAD) ($(git log -1 --format='%s'))"

# ── STEP 2: Run DB migrations in current container (if running) ───────────────
echo ""
echo "▶ 2/5  Running DB migrations..."

if docker ps --format '{{.Names}}' | grep -q "aischool_api"; then
  docker exec -i aischool_api node - < server/scripts/run_complete_migration.js \
    && echo "  ✅  Migrations complete" \
    || echo "  ⚠️  Migration had warnings (check above) — continuing deploy"
else
  echo "  ⚠️  aischool_api not running — migrations will run after restart"
fi

# ── STEP 3: Rebuild API with --no-cache (forces fresh npm ci → picks up @google/genai) ──
echo ""
echo "▶ 3/5  Rebuilding API image (no-cache to pick up new npm deps)..."
docker compose build --no-cache api
echo "  ✅  API image rebuilt"

# ── STEP 4: Rebuild Web (normal, uses cache since no npm changes) ─────────────
echo ""
echo "▶ 4/5  Rebuilding Web image..."
docker compose build web
echo "  ✅  Web image rebuilt"

# ── STEP 5: Restart services ──────────────────────────────────────────────────
echo ""
echo "▶ 5/5  Restarting containers..."
docker compose up -d --no-deps --force-recreate api web
echo "  Waiting 20s for containers to be ready..."
sleep 20

# ── Post-deploy: run migration in NEW container ───────────────────────────────
echo ""
echo "▶ Post-deploy: Running migrations in new container..."
docker exec -i aischool_api node - < server/scripts/run_complete_migration.js \
  && echo "  ✅  Migrations applied to new container" \
  || echo "  ⚠️  Migration warnings — check logs"

# ── Health check ──────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════"
echo "  Checking health..."
echo "════════════════════════════════════════════════════"
sleep 3
if curl -sf https://www.aischoolonair.ng/api/health > /dev/null 2>&1; then
  echo "  🟢  API is healthy"
else
  echo "  🔴  Health check failed — showing last 20 log lines:"
  docker logs aischool_api --tail=20
fi

echo ""
echo "  📋  Last 5 API log lines:"
docker logs aischool_api --tail=8

echo ""
# Check specifically for the aiChatRoute warning
if docker logs aischool_api 2>&1 | grep -q "aiChatRoute"; then
  echo "  ⚠️  aiChatRoute still not loading — check: docker logs aischool_api 2>&1 | grep -i 'chat\|personality\|orchestr'"
else
  echo "  ✅  aiChatRoute loaded successfully — no warnings"
fi

# Check web container health
WEB_HEALTH=$(docker inspect aischool_web --format='{{.State.Health.Status}}' 2>/dev/null || echo "unknown")
echo "  📋  Web container health: $WEB_HEALTH"
echo ""
echo "  ✅  Done! https://www.aischoolonair.ng"
echo ""
