#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# hetzner-bootstrap.sh — Run ONCE as root on a fresh Hetzner Ubuntu 24.04 CX23
#
# What it does:
#   1. OS update + install Docker, UFW, fail2ban, git
#   2. UFW firewall: allow 22/80/443 only
#   3. Creates non-root 'deploy' user with Docker access
#   4. Hardens SSH (no root login, no password auth)
#   5. Creates /opt/aischoolonair with correct ownership
#   6. Installs Docker Compose plugin
#   7. Configures fail2ban for SSH brute-force protection
#
# Usage (Windows PowerShell / WSL):
#   scp hetzner-bootstrap.sh root@<HETZNER_IP>:/root/
#   ssh root@<HETZNER_IP> "bash /root/hetzner-bootstrap.sh"
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

DEPLOY_USER="deploy"
APP_DIR="/opt/aischoolonair"

echo "=== [1/7] System update ==="
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

echo "=== [2/7] Install packages ==="
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release \
  ufw fail2ban git wget htop

# Docker official repo (more up to date than docker.io package)
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

echo "=== [3/7] Firewall ==="
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment "SSH"
ufw allow 80/tcp   comment "HTTP (ACME challenge + redirect)"
ufw allow 443/tcp  comment "HTTPS"
ufw allow 443/udp  comment "HTTP/3 QUIC"
ufw --force enable
echo "UFW status:"
ufw status verbose

echo "=== [4/7] Docker service ==="
systemctl enable --now docker

echo "=== [5/7] Deploy user ==="
if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"

# Copy root's SSH authorized_keys so the deploy user can log in with your key
mkdir -p /home/"$DEPLOY_USER"/.ssh
if [ -f /root/.ssh/authorized_keys ]; then
  cp /root/.ssh/authorized_keys /home/"$DEPLOY_USER"/.ssh/authorized_keys
fi
chown -R "$DEPLOY_USER":"$DEPLOY_USER" /home/"$DEPLOY_USER"/.ssh
chmod 700 /home/"$DEPLOY_USER"/.ssh
chmod 600 /home/"$DEPLOY_USER"/.ssh/authorized_keys 2>/dev/null || true

echo "=== [6/7] App directory ==="
mkdir -p "$APP_DIR"
chown "$DEPLOY_USER":"$DEPLOY_USER" "$APP_DIR"

echo "=== [7/7] Harden SSH + start fail2ban ==="
sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/'           /etc/ssh/sshd_config
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl reload sshd

# fail2ban — default config protects SSH; can add custom jails for the app later
systemctl enable --now fail2ban

HETZNER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')

cat << SUMMARY

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Bootstrap complete!  Server IP: ${HETZNER_IP}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NEXT STEPS (from your Windows machine):

1. SSH in as deploy user:
   ssh deploy@${HETZNER_IP}

2. Clone the repo:
   cd /opt/aischoolonair
   git clone https://github.com/PDS-David/edu-platform.git .

3. Create env files (NEVER commit these):
   cp api.env.example api.env && nano api.env
   cp api.env.example api.staging.env && nano api.staging.env

4. Point DNS A records to: ${HETZNER_IP}
   (see DEPLOYMENT.md → DNS section)

5. Build and start:
   ./deploy.sh

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY
