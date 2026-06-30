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
echo "▶ 1/8  Syncing code..."
git fetch origin
git reset --hard origin/main

# 2. Ensure safe directories exist on the host (NOT inside Docker)
echo ""
echo "▶ 2/8  Preparing runtime directories on host..."
mkdir -p server/keys_secure
mkdir -p hls_secure
# Fix permissions only if we own the directory — never fail if we don't
chmod 755 server/keys_secure 2>/dev/null || true
chmod 755 hls_secure        2>/dev/null || true

# 3. Show what is currently running before we touch anything
echo ""
echo "▶ 3/8  Current container state:"
docker compose ps || true

# 4. Build new images
echo ""
echo "▶ 4/8  Building api and web images..."
docker compose build --progress=plain api web

# ── Log image freshness (informational only — NOT a pass/fail gate) ───────
# An earlier version of this script treated "image is older than 5 minutes"
# as a hard failure, on the theory that an old image means the build was
# silently killed mid-way. That produced a false positive: web's build
# context is ./client only (see docker-compose.yml). A commit that touches
# nothing under client/ (e.g. this very deploy-pipeline fix, which only
# touches deploy.sh and .github/workflows/) is byte-identical input to that
# build, so BuildKit correctly reuses the cached result image — including
# its original Created timestamp — rather than fabricating a new one. An
# old timestamp here can mean either "build was killed" or "nothing in this
# service's context changed," and there is no way to tell those apart from
# the timestamp alone. Logging it is still useful context if something
# looks wrong later, but it must not fail the deploy on its own. The
# frontend smoke test at the end of this script (step 8/8) is the real
# safety net — it checks whether the LIVE site actually works, which is
# what we care about, independent of whether the image was freshly built
# or correctly served from cache.
echo ""
echo "▶ 5/8  Image freshness (informational)..."
for svc in web api; do
  CREATED=$(docker inspect "aischool_${svc}:latest" --format '{{.Created}}' 2>/dev/null || echo "")
  if [ -z "$CREATED" ]; then
    echo "  🔴 No aischool_${svc}:latest image found at all — build failed."
    exit 1
  fi
  CREATED_EPOCH=$(date -d "$CREATED" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  AGE=$(( NOW_EPOCH - CREATED_EPOCH ))
  echo "  ${svc} image age: ${AGE}s$( [ "$AGE" -gt 300 ] && echo ' (cache hit — context unchanged, this is fine)' )"
done

NEW_WEB_IMAGE=$(docker inspect aischool_web:latest --format '{{.Id}}' 2>/dev/null || true)
NEW_API_IMAGE=$(docker inspect aischool_api:latest --format '{{.Id}}' 2>/dev/null || true)
echo "  web image: ${NEW_WEB_IMAGE:0:20}..."
echo "  api image: ${NEW_API_IMAGE:0:20}..."

# 5. Force-recreate web and api containers (don't rely on image-ID comparison)
echo ""
echo "▶ 6/8  Bringing up all services..."
docker compose up -d --force-recreate caddy redis
# --force-recreate guarantees the container is replaced even if Docker thinks
# the image ID hasn't changed (which can happen with layer caching quirks).
docker compose up -d --no-deps --force-recreate api web

echo ""
echo "  Waiting 25s for containers to become healthy..."
sleep 25

# 6. Run DB migrations (now that the container is healthy and scripts/ ships in the image)
echo ""
echo "▶ 7/8  Running DB migrations..."
docker exec aischool_api node /app/scripts/run_complete_migration.js
echo "  ✅ Migrations complete"

# 7. Health check
echo ""
echo "▶ 7b/8  Container state after deploy:"
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

# 8. Frontend smoke test — confirm the homepage serves a real, loadable JS bundle
echo ""
echo "▶ 8/8  Verifying frontend serves a working JS bundle..."
HOMEPAGE_HTML=$(curl -sf --max-time 10 https://www.aischoolonair.ng/ || true)
JS_PATH=$(echo "$HOMEPAGE_HTML" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
if [ -z "$JS_PATH" ]; then
  echo "  🔴 Could not find a JS bundle reference in the served homepage HTML."
  echo "  --- homepage HTML (first 500 chars) ---"
  echo "${HOMEPAGE_HTML:0:500}"
  exit 1
fi
JS_SIZE=$(curl -sf --max-time 15 -o /dev/null -w '%{size_download}' "https://www.aischoolonair.ng${JS_PATH}" || echo 0)
echo "  Served bundle: ${JS_PATH} (${JS_SIZE} bytes)"
if [ "$JS_SIZE" -lt 100000 ]; then
  echo "  🔴 JS bundle is suspiciously small (${JS_SIZE} bytes) — likely a 404"
  echo "     page or a broken/truncated build, not the real app bundle."
  exit 1
fi
echo "  ✅ Frontend bundle is being served and looks like a real build."

echo ""
echo "═══════════════════════════════════════════════════"
echo "  ✅ Deploy complete!"
echo "═══════════════════════════════════════════════════"
