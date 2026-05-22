#!/bin/bash
# fix-db-url.sh — Run once on Hetzner to fix the DATABASE_URL in api.env
# Usage: cd /opt/aischoolonair && bash fix-db-url.sh

ENV_FILE="/opt/aischoolonair/api.env"

# Remove any existing (possibly corrupted) DATABASE_URL lines
sed -i '/^DATABASE_URL/d' "$ENV_FILE"

# Write the correct value using Python to avoid shell @ symbol issues
python3 - <<'PYEOF'
line = "DATABASE_URL=postgresql://postgres.jrimlapumxrnpasgjpus:aischoolonairDB1@aws-0-eu-west-1.pooler.supabase.com:6543/postgres\n"
with open("/opt/aischoolonair/api.env", "a") as f:
    f.write(line)
print("DATABASE_URL written successfully.")
PYEOF

# Verify
echo "--- Verifying DATABASE_URL ---"
grep "DATABASE_URL" "$ENV_FILE"
echo "--- Done. Now run: docker compose up -d --no-deps api ---"
