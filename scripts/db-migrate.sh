#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/db-migrate.sh
#
# Copies the database from Render (current host) to the local Postgres
# container running on this Hetzner server.
#
# Run this ONCE after the Docker stack is up for the first time.
# Running it again will DROP and re-create the local database from Render.
#
# Prerequisites:
#   - Docker stack is running (docker compose up -d)
#   - pg_dump is available on this server (apt install postgresql-client)
#   - You can reach the Render database from this server
#
# Usage:
#   chmod +x scripts/db-migrate.sh
#   ./scripts/db-migrate.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

# ── Source (Render) ───────────────────────────────────────────────────────────
# IMPORTANT: never hardcode database credentials in this repo.
# Provide it at runtime:
#   RENDER_DB_URL="postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require" ./scripts/db-migrate.sh
RENDER_DB_URL="${RENDER_DB_URL:-}"
if [[ -z "$RENDER_DB_URL" ]]; then
  echo ""
  echo "ERROR: RENDER_DB_URL is not set."
  echo "Set it like:"
  echo "  RENDER_DB_URL=\"postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require\" ./scripts/db-migrate.sh"
  echo ""
  exit 1
fi

# ── Target (local Docker Postgres) ───────────────────────────────────────────
LOCAL_DB_USER="eduuser"
LOCAL_DB_NAME="edu_platform"
LOCAL_CONTAINER="edu_postgres"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Database Migration: Render → Hetzner           ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Source : Render (Frankfurt)"
echo "  Target : $LOCAL_CONTAINER ($LOCAL_DB_NAME)"
echo ""
read -p "  ⚠️  This will OVERWRITE the local database. Continue? [y/N] " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
  echo "  Aborted."
  exit 0
fi

echo ""
echo "▶  Dumping from Render (this may take a few minutes)..."
pg_dump \
  --no-owner \
  --no-acl \
  --format=plain \
  "$RENDER_DB_URL" \
  > /tmp/render_backup.sql

DUMP_SIZE=$(du -sh /tmp/render_backup.sql | cut -f1)
echo "   ✅  Dump complete — $DUMP_SIZE"

echo ""
echo "▶  Restoring into local Docker Postgres..."
# Drop and recreate the database cleanly
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" -c "DROP DATABASE IF EXISTS $LOCAL_DB_NAME;" postgres
docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" -c "CREATE DATABASE $LOCAL_DB_NAME;" postgres

# Pipe the dump into the container
docker exec -i "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" < /tmp/render_backup.sql

echo "   ✅  Restore complete."

# Clean up
rm /tmp/render_backup.sql

echo ""
echo "▶  Verifying table count..."
TABLE_COUNT=$(docker exec "$LOCAL_CONTAINER" psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")
echo "   ✅  $TABLE_COUNT tables found in local database."

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   ✅  Migration complete!                        ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Next: Update DATABASE_URL in .env.production to point to local Postgres."
echo "  It should already be set correctly if you used .env.production.example."
echo ""
