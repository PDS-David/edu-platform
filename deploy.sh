#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# deploy.sh — Run on the Hetzner server to deploy / update AISchoolonair
#
# Usage (first time):
#   chmod +x deploy.sh
#   ./deploy.sh
#
# Routine update after a git push:
#   ./deploy.sh
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

step() { echo -e "\n${BOLD}▶  $1${NC}"; }
ok()   { echo -e "   ${GREEN}✅  $1${NC}"; }
warn() { echo -e "   ${YELLOW}⚠️   $1${NC}"; }
fail() { echo -e "   ${RED}❌  $1${NC}"; exit 1; }

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   AISchoolonair — Deploy Script          ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── 1. Pull latest code ───────────────────────────────────────────────────────
step "Pulling latest code from GitHub"
git pull origin main
ok "Code up to date"

# ── 2. Check env files ────────────────────────────────────────────────────────
step "Checking environment files"

if [ ! -f "api.env" ]; then
  fail "api.env not found!\n    Run: cp api.env.example api.env && nano api.env"
fi

if [ ! -f "api.staging.env" ]; then
  warn "api.staging.env not found — staging services will not start"
  warn "Run: cp api.env.example api.staging.env && nano api.staging.env"
fi

ok "Environment files present"

# ── 3. Build images ───────────────────────────────────────────────────────────
step "Building Docker images (2-5 min on first run)"
docker compose build api web api_staging web_staging
ok "Images built"

# ── 4. Start / restart services ──────────────────────────────────────────────
step "Starting containers"
docker compose up -d --remove-orphans
ok "Containers started"

# ── 5. Wait for API health ────────────────────────────────────────────────────
step "Waiting for API to be healthy"
for i in $(seq 1 20); do
  if docker compose exec -T api wget -qO- http://localhost:5000/health >/dev/null 2>&1; then
    ok "API is healthy"
    break
  fi
  if [ "$i" -eq 20 ]; then
    fail "API did not become healthy after 60 seconds — check logs: docker compose logs api"
  fi
  echo "   ⏳  Waiting... ($i/20)"
  sleep 3
done

# ── 6. Status ─────────────────────────────────────────────────────────────────
echo ""
step "Container status"
docker compose ps

echo ""
step "Recent API logs"
docker compose logs --tail=15 api

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   ✅  Deploy complete!                   ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""
echo "  Useful commands:"
echo "    docker compose logs -f api          ← live API logs"
echo "    docker compose logs -f caddy        ← live proxy/TLS logs"
echo "    docker compose ps                   ← container status"
echo "    docker stats                        ← CPU + RAM usage"
echo "    docker compose exec api sh          ← shell into API container"
echo ""
