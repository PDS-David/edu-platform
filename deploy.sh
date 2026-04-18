#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh  —  Run on the Hetzner server to deploy / update AISchoolonair
#
# Usage:
#   chmod +x deploy.sh     (first time only)
#   ./deploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e  # Exit immediately if any command fails

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   AISchoolonair — Deploy Script          ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── 1. Pull latest code from GitHub ─────────────────────────────────────────
echo "▶  Pulling latest code..."
git pull origin main

# ── 2. Check .env.production exists ──────────────────────────────────────────
if [ ! -f ".env.production" ]; then
  echo ""
  echo "❌  ERROR: .env.production not found!"
  echo "    Run:  cp .env.production.example .env.production"
  echo "    Then: nano .env.production   (fill in all values)"
  exit 1
fi

# ── 3. Build Docker images ────────────────────────────────────────────────────
echo "▶  Building Docker images (this takes 2–5 minutes on first run)..."
docker compose build --no-cache

# ── 4. Start / restart all containers ────────────────────────────────────────
echo "▶  Starting containers..."
docker compose up -d --remove-orphans

# ── 5. Wait for postgres to be healthy ───────────────────────────────────────
echo "▶  Waiting for database to be ready..."
sleep 5
for i in {1..12}; do
  if docker exec edu_postgres pg_isready -U eduuser >/dev/null 2>&1; then
    echo "   ✅  Database is ready."
    break
  fi
  echo "   ⏳  Waiting... ($i/12)"
  sleep 5
done

# ── 6. Print status ───────────────────────────────────────────────────────────
echo ""
echo "▶  Container status:"
docker compose ps

echo ""
echo "▶  Recent server logs:"
docker compose logs --tail=20 server

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   ✅  Deploy complete!                   ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Useful commands:"
echo "    docker compose logs -f server     ← live server logs"
echo "    docker compose logs -f nginx      ← live nginx logs"
echo "    docker compose ps                 ← container status"
echo "    docker stats                      ← CPU + RAM usage"
echo ""
