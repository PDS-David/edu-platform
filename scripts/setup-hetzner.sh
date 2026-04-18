#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# scripts/setup-hetzner.sh
#
# Run ONCE on a fresh Hetzner Ubuntu 24.04 server as root.
# Installs: Docker, Docker Compose, Git, Certbot, postgresql-client, fail2ban
#
# Usage (as root on the server):
#   curl -fsSL https://raw.githubusercontent.com/PDS-David/edu-platform/main/scripts/setup-hetzner.sh | bash
#
# Or if you've cloned the repo:
#   chmod +x scripts/setup-hetzner.sh
#   ./scripts/setup-hetzner.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   Hetzner Server — Initial Setup                 ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Must be root
if [ "$EUID" -ne 0 ]; then
  echo "❌  Please run as root: sudo bash scripts/setup-hetzner.sh"
  exit 1
fi

# ── 1. System updates ─────────────────────────────────────────────────────────
echo "▶  Updating system packages..."
apt-get update -qq
apt-get upgrade -y -qq

# ── 2. Install prerequisites ──────────────────────────────────────────────────
echo "▶  Installing prerequisites..."
apt-get install -y -qq \
  git \
  curl \
  wget \
  ca-certificates \
  gnupg \
  lsb-release \
  postgresql-client \
  fail2ban \
  ufw

# ── 3. Install Docker ──────────────────────────────────────────────────────────
echo "▶  Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
  echo "   ✅  Docker installed."
else
  echo "   ✅  Docker already installed."
fi

# ── 4. Install Certbot (for SSL) ──────────────────────────────────────────────
echo "▶  Installing Certbot..."
apt-get install -y -qq certbot
echo "   ✅  Certbot installed."

# ── 5. Configure UFW firewall ─────────────────────────────────────────────────
echo "▶  Configuring firewall (UFW)..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   comment 'SSH'
ufw allow 80/tcp   comment 'HTTP'
ufw allow 443/tcp  comment 'HTTPS'
ufw --force enable
echo "   ✅  Firewall configured. Allowed ports: 22, 80, 443."

# ── 6. Harden SSH (disable root password login) ───────────────────────────────
echo "▶  Hardening SSH..."
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/'  /etc/ssh/sshd_config
systemctl reload sshd
echo "   ✅  SSH password login disabled (key-only)."

# ── 7. Enable fail2ban ────────────────────────────────────────────────────────
echo "▶  Enabling fail2ban..."
systemctl enable fail2ban
systemctl start fail2ban
echo "   ✅  fail2ban running."

# ── 8. Create a deploy user (optional but recommended) ────────────────────────
echo "▶  Creating 'deploy' user..."
if ! id -u deploy &>/dev/null; then
  useradd -m -s /bin/bash deploy
  usermod -aG docker deploy
  mkdir -p /home/deploy/.ssh
  # Copy root's authorized_keys so you can SSH as deploy too
  if [ -f /root/.ssh/authorized_keys ]; then
    cp /root/.ssh/authorized_keys /home/deploy/.ssh/
    chown -R deploy:deploy /home/deploy/.ssh
    chmod 700 /home/deploy/.ssh
    chmod 600 /home/deploy/.ssh/authorized_keys
  fi
  echo "   ✅  deploy user created and added to docker group."
else
  echo "   ✅  deploy user already exists."
fi

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   ✅  Server setup complete!                     ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  NEXT STEPS:"
echo "  1. Switch to deploy user:  su - deploy"
echo "  2. Clone the repo:         git clone https://github.com/PDS-David/edu-platform.git"
echo "  3. Enter repo:             cd edu-platform"
echo "  4. Create env file:        cp .env.production.example .env.production && nano .env.production"
echo "  5. Start the stack:        ./deploy.sh"
echo "  6. Get SSL certificate:    (see DEPLOYMENT.md — Step 9)"
echo ""
