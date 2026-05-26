#!/bin/bash
# ============================================================
# AISchoolonair — Complete Fix and Deploy Script
# Run this via SSH: bash /opt/aischoolonair/fix_and_deploy.sh
# ============================================================
set -e

# Ensure we're in the right directory
cd /opt/aischoolonair
echo "✅ Working directory: $(pwd)"

# Step 1: Pull latest fixes from GitHub
echo ""
echo "▶ [1/5] Pulling latest code from GitHub..."
git pull origin main
echo "✅ Code updated"

# Step 2: Check api.env has correct settings
echo ""
echo "▶ [2/5] Checking environment config..."

# The upload logic defaults to allowing local uploads unless ALLOW_LOCAL_UPLOADS=false
# So we just need to make sure it's NOT set to false
if grep -q "^ALLOW_LOCAL_UPLOADS=false" api.env 2>/dev/null; then
    sed -i 's/^ALLOW_LOCAL_UPLOADS=false/ALLOW_LOCAL_UPLOADS=true/' api.env
    echo "✅ Fixed ALLOW_LOCAL_UPLOADS (was false, now true)"
elif grep -q "^ALLOW_LOCAL_UPLOADS=" api.env 2>/dev/null; then
    echo "✅ ALLOW_LOCAL_UPLOADS is already set correctly"
else
    echo "ALLOW_LOCAL_UPLOADS=true" >> api.env
    echo "✅ Added ALLOW_LOCAL_UPLOADS=true to api.env"
fi

# Fix staging DATABASE_URL if it still points to Render
PROD_DB=$(grep "^DATABASE_URL=" api.env | cut -d= -f2-)
STAGING_DB=$(grep "^DATABASE_URL=" api.staging.env 2>/dev/null | cut -d= -f2- || echo "")
if echo "$STAGING_DB" | grep -q "render.com"; then
    sed -i "s|^DATABASE_URL=.*|DATABASE_URL=${PROD_DB}|" api.staging.env
    echo "✅ Fixed staging DATABASE_URL (was pointing to Render, now Supabase)"
else
    echo "✅ Staging DATABASE_URL looks OK"
fi

# Step 3: Run DB migrations on the currently running container
echo ""
echo "▶ [3/5] Running database migrations..."
docker cp server/scripts/run_complete_migration.js aischool_api:/tmp/run_complete_migration.js
docker exec aischool_api node /tmp/run_complete_migration.js
echo "✅ Migrations complete"

# Step 4: Build and restart (from correct directory)
echo ""
echo "▶ [4/5] Building and restarting containers..."
docker compose build api web api_staging
docker compose up -d --no-deps api web api_staging
echo "✅ Containers restarted"

# Step 5: Health check
echo ""
echo "▶ [5/5] Waiting 20s then checking health..."
sleep 20

echo ""
echo "Container status:"
docker ps --format "table {{.Names}}\t{{.Status}}" | grep aischool

echo ""
echo "API logs (last 5):"
docker logs aischool_api --tail=5

echo ""
HEALTH=$(curl -sf https://www.aischoolonair.ng/api/health 2>/dev/null || echo "FAILED")
if echo "$HEALTH" | grep -q "ok"; then
    echo "🟢 Production API is healthy: $HEALTH"
else
    echo "🔴 Health check failed. Check logs: docker logs aischool_api --tail=30"
fi

echo ""
echo "============================================================"
echo " ✅ Fix and deploy complete!"
echo " Test bulk upload at: https://www.aischoolonair.ng/admin/dashboard"
echo "============================================================"
