#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# hetzner-bootstrap.sh — Run ONCE as root on a fresh Hetzner Ubuntu 24.04 box
#
# What it does:
#   1. Updates OS, installs Docker, UFW, fail2ban
#   2. Creates a non-root deploy user (deploy) with Docker access
#   3. Hardens SSH (disable root login, disable password auth)
#   4. Creates /opt/aischoolonair with correct ownership
#   5. Prints next steps
#
# Usage:
#   scp hetzner-bootstrap.sh root@<HETZNER_IP>:/root/
#   ssh root@<HETZNER_IP> bash /root/hetzner-bootstrap.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DEPLOY_USER="deploy"
APP_DIR="/opt/aischoolonair"

echo "=== [1/6] System update ==="
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

echo "=== [2/6] Install packages ==="
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  docker.io docker-compose-plugin \
  ufw fail2ban curl wget git

echo "=== [3/6] Firewall ==="
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp   # HTTP/3 QUIC
ufw --force enable

echo "=== [4/6] Docker ==="
systemctl enable --now docker

echo "=== [5/6] Deploy user ==="
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
mkdir -p /home/"$DEPLOY_USER"/.ssh
# Copy root's authorized_keys so deploy user can SSH in with the same key
cp /root/.ssh/authorized_keys /home/"$DEPLOY_USER"/.ssh/authorized_keys 2>/dev/null || true
chown -R "$DEPLOY_USER":"$DEPLOY_USER" /home/"$DEPLOY_USER"/.ssh
chmod 700 /home/"$DEPLOY_USER"/.ssh
chmod 600 /home/"$DEPLOY_USER"/.ssh/authorized_keys 2>/dev/null || true

echo "=== [6/6] App directory ==="
mkdir -p "$APP_DIR"
chown "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"

echo "=== [7/7] Harden SSH ==="
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload sshd

cat << EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Bootstrap complete.  Next steps:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Add GitHub Secrets (repo → Settings → Secrets → Actions):
     HETZNER_HOST     = $(curl -s ifconfig.me)
     HETZNER_USER     = deploy
     HETZNER_SSH_KEY  = <your private SSH key PEM>

2. SSH in as deploy user and set up the app:
     ssh deploy@$(curl -s ifconfig.me)
     cd /opt/aischoolonair
     cp /path/to/api.env.example api.env
     # Edit api.env with real values (DATABASE_URL, JWT_SECRET, R2 keys, etc.)
     nano api.env

3. Copy docker-compose.yml and Caddyfile to the server:
     scp docker-compose.yml Caddyfile deploy@$(curl -s ifconfig.me):/opt/aischoolonair/

4. Log in to GHCR so Docker can pull images:
     echo <GITHUB_PAT> | docker login ghcr.io -u pds-david --password-stdin

5. Pull images and start:
     cd /opt/aischoolonair
     docker compose pull
     docker compose up -d
     docker compose logs -f

6. Add DNS in Cloudflare (after confirming server is running):
     A  @    $(curl -s ifconfig.me)  Proxied
     A  www  $(curl -s ifconfig.me)  Proxied
     A  api  $(curl -s ifconfig.me)  DNS only (grey — Caddy needs direct access)

7. Connect cdn.aischoolonair.ng to R2:
     Cloudflare → R2 → aischoolonair-uploads → Settings → Custom Domains → cdn.aischoolonair.ng

Root SSH is now disabled. Use deploy user from here.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
