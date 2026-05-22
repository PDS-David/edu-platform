#!/bin/bash
set -e
echo "=== AISchoolonair: Deploying my-assignments fix ==="

# Step 1: Download the fixed file from GitHub
echo "[1/3] Downloading fixed resourceRoutes.js..."
wget -q \
  --header="Authorization: token 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" \
  "https://raw.githubusercontent.com/PDS-David/edu-platform/main/server/routes/resourceRoutes.js" \
  -O /opt/aischoolonair/server/routes/resourceRoutes.js

echo "      Done. File size: $(wc -c < /opt/aischoolonair/server/routes/resourceRoutes.js) bytes"

# Step 2: Rebuild and restart API
echo "[2/3] Rebuilding and restarting API container..."
docker compose -f /opt/aischoolonair/docker-compose.yml up -d --build api

# Step 3: Wait and show logs
echo "[3/3] Waiting 8s then showing logs..."
sleep 8
docker compose -f /opt/aischoolonair/docker-compose.yml logs api --tail=30

echo "=== Done. Check above logs for migration messages ==="
