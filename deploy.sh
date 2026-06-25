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

# ── Verify the new images were actually built (not silently skipped) ──────
# This has been the single point of failure behind a recurring "React is not
# defined" incident: if the SSH session gets cut mid-build for ANY reason
# (command timeout, network blip, OOM), bash continues past this point with
# `set -e` only catching a non-zero exit — it does NOT catch "the build step
# got killed by the SSH layer before this script could even see it fail."
# Checking that an image with this tag EXISTS is not enough, since the OLD
# image from a previous successful build already satisfies that check.
# The only thing that actually proves a NEW build happened just now is the
# image's creation timestamp. Fail loudly here rather than silently
# continuing to --force-recreate with a stale image.
echo ""
echo "▶ 5/8  Verifying images were actually rebuilt just now..."
for svc in web api; do
  CREATED=$(docker inspect "aischool_${svc}:latest" --format '{{.Created}}' 2>/dev/null || echo "")
  if [ -z "$CREATED" ]; then
    echo "  🔴 No aischool_${svc}:latest image found at all — build silently failed."
    exit 1
  fi
  CREATED_EPOCH=$(date -d "$CREATED" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  AGE=$(( NOW_EPOCH - CREATED_EPOCH ))
  echo "  ${svc} image age: ${AGE}s"
  if [ "$AGE" -gt 300 ]; then
    echo "  🔴 aischool_${svc}:latest is ${AGE}s old (>300s) — docker compose build"
    echo "     did not actually produce a fresh image. The build step was likely"
    echo "     killed mid-way (SSH command_timeout, OOM, or network drop) and we"
    echo "     are about to --force-recreate with a STALE image. Stopping here"
    echo "     instead of deploying old code under a green checkmark."
    exit 1
  fi
done
echo "  ✅ Both images were built within the last 5 minutes — proceeding."

NEW_WEB_IMAGE=$(docker inspect aischool_web:latest --format '{{.Id}}' 2>/dev/null || true)
NEW_API_IMAGE=$(docker inspect aischool_api:latest --format '{{.Id}}' 2>/dev/null || true)
echo "  web image: ${NEW_WEB_IMAGE:0:20}..."
echo "  api image: ${NEW_API_IMAGE:0:20}..."

# 5. Force-recreate web and api containers (don't rely on image-ID comparison)
echo ""
echo "▶ 6/8  Bringing up all services..."
docker compose up -d caddy redis
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
