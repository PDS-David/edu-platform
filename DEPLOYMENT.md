# AISchoolonair — Migration to Hetzner CX22
## Complete step-by-step guide (written for Windows users)

---

## What we did / what this sets up

### Current state (Render)
| Service | URL |
|---------|-----|
| Frontend (React) | https://aischoolonair.onrender.com |
| Backend (Node.js API) | https://eacbuddy-api.onrender.com |
| Database | PostgreSQL on Render (Frankfurt) |

### Target state (Hetzner CX22)
Everything runs in Docker containers on **one Hetzner server**, behind a single domain.

```
Internet
   │
   ▼
 nginx (ports 80 + 443)          ← only container exposed to internet
   │
   ├── /api/*       → server (Node.js :5000)
   ├── /socket.io/* → server (WebSocket)
   ├── /uploads/*   → files served directly from disk (no Node overhead)
   └── /*           → client (React SPA)

 postgres  (internal — no internet access)
 redis     (internal — no internet access)
```

### Files added to the repo

| File | Purpose |
|------|---------|
| `server/Dockerfile` | Builds the Node.js API image (node:22, ffmpeg included) |
| `server/.dockerignore` | Excludes node_modules, .env, uploads from build |
| `client/Dockerfile` | Multi-stage: builds React with Vite, serves with nginx |
| `client/nginx-spa.conf` | SPA routing inside the client container |
| `client/.dockerignore` | Excludes dist, node_modules from build |
| `nginx/nginx.conf` | Main reverse proxy config |
| `docker-compose.yml` | Defines all 5 containers + volumes + networking |
| `.env.production.example` | Template for your secrets — copy and fill in |
| `deploy.sh` | One-command deploy/update script |
| `scripts/setup-hetzner.sh` | One-time server setup (Docker, firewall, SSL tools) |
| `scripts/db-migrate.sh` | Copies database from Render to local Postgres |

---

## Prerequisites on your Windows PC

You need these installed **once** on your PC:

### 1. Windows Terminal (or Git Bash)
- Windows 10/11 already has SSH built into PowerShell
- Download **Windows Terminal** from the Microsoft Store (recommended, it's free)
- Or install **Git for Windows** (https://git-scm.com) which includes Git Bash

### 2. SSH key (to log into the server securely)
Open **PowerShell** or **Windows Terminal** and run:
```powershell
ssh-keygen -t ed25519 -C "your_email@example.com"
```
- Press Enter at every prompt (or choose a passphrase)
- This creates two files:
  - `C:\Users\YourName\.ssh\id_ed25519`       ← your **private** key (never share)
  - `C:\Users\YourName\.ssh\id_ed25519.pub`   ← your **public** key (goes on server)

To see your public key (you'll need to paste it into Hetzner):
```powershell
cat $HOME\.ssh\id_ed25519.pub
```

---

## Step 1 — Create a Hetzner account and server

1. Go to **https://hetzner.com** → Sign up (requires credit card)
2. In the Hetzner Cloud console: **New Project** → name it `aischoolonair`
3. Click **Add Server**:
   - **Location**: Nuremberg (Germany) — good latency to Nigeria via undersea cables
   - **Image**: Ubuntu 24.04 LTS
   - **Type**: CX22 (2 vCPU, 4 GB RAM, 40 GB SSD) — ~€3.79/month
   - **SSH Keys**: Click "Add SSH Key" → paste your **public key** (from `id_ed25519.pub`)
   - **Firewall**: Create new → Allow TCP 22, 80, 443
   - Click **Create & Buy Now**

4. Note the **server IP address** (e.g., `95.217.100.123`)

---

## Step 2 — Point your domain to the server

> If you don't have a domain yet, you can use a free one from https://freedns.afraid.org
> or buy one from Namecheap/Cloudflare for ~$10/year.

In your domain registrar's DNS settings, add:
```
A   @              95.217.100.123    (replace with your server IP)
A   www            95.217.100.123
```

DNS changes take 5–30 minutes to propagate. You can check with:
```powershell
nslookup aischoolonair.com
```

---

## Step 3 — Connect to the server from Windows

Open **PowerShell** or **Windows Terminal** and run:
```powershell
ssh root@YOUR_SERVER_IP
```

Example:
```powershell
ssh root@95.217.100.123
```

Type `yes` when asked about the fingerprint. You are now inside the Hetzner server.

---

## Step 4 — Run the one-time server setup script

This installs Docker, configures the firewall, and creates a deploy user.
Run this on the server (you're still SSH'd in):

```bash
curl -fsSL https://raw.githubusercontent.com/PDS-David/edu-platform/main/scripts/setup-hetzner.sh | bash
```

This takes about 2 minutes. When done you'll see:
```
✅  Server setup complete!
```

---

## Step 5 — Switch to the deploy user and clone the repo

```bash
su - deploy
git clone https://github.com/PDS-David/edu-platform.git
cd edu-platform
```

---

## Step 6 — Create and fill in your production environment file

```bash
cp .env.production.example .env.production
nano .env.production
```

In the editor, fill in every line marked `[CHANGE ME]`:

| Variable | What to put |
|----------|-------------|
| `VITE_API_URL` | `https://aischoolonair.com` (your domain) |
| `DB_PASSWORD` | Run `openssl rand -hex 32` and paste the output |
| `JWT_SECRET` | Run `openssl rand -hex 64` and paste the output |
| `GEMINI_API_KEY` | Your Google AI key |
| `PAYSTACK_SECRET_KEY` | Your Paystack live key |
| `EMAIL_USER` | info@eac.edu.ng |
| `EMAIL_PASS` | Your Gmail App Password (see below) |
| `CLIENT_URL` | https://aischoolonair.com |
| `PROD_CLIENT_URL` | https://aischoolonair.com |
| `SERVER_BASE_URL` | https://aischoolonair.com |

**Gmail App Password**: Go to myaccount.google.com → Security → 2-Step Verification → App Passwords → Create one named "AISchoolonair". Use that 16-character password, not your real Gmail password.

Save and exit: `Ctrl+X`, then `Y`, then `Enter`

---

## Step 7 — Update nginx.conf with your real domain

```bash
nano nginx/nginx.conf
```

Find every line with `aischoolonair.com` and replace with your actual domain.
There are 4 places (2 in the `server_name` directives, 2 in SSL cert paths).

Save and exit.

---

## Step 8 — Deploy the stack (first time)

> **Important**: Before deploying, you need to temporarily disable the HTTPS
> redirect in nginx.conf because you don't have an SSL certificate yet.

Edit `nginx/nginx.conf`:
```bash
nano nginx/nginx.conf
```

Comment out the entire HTTPS server block (lines starting with `server {` for port 443)
by adding `#` to each line — and in the HTTP server block, **remove** the redirect
line and instead add:
```nginx
location / {
    proxy_pass http://frontend;
}
location /api/ {
    proxy_pass http://backend;
}
```

Then start everything:
```bash
./deploy.sh
```

This builds all Docker images and starts the containers. **First run takes 5–10 minutes.**

Check it's working:
```bash
docker compose ps
```
All containers should show `Up` or `healthy`.

---

## Step 9 — Get a free SSL certificate (HTTPS)

```bash
sudo certbot certonly --webroot \
  -w /var/www/certbot \
  -d aischoolonair.com \
  -d www.aischoolonair.com \
  --email your@email.com \
  --agree-tos \
  --non-interactive
```

When done:
1. Edit `nginx/nginx.conf` back to the full HTTPS version (undo Step 8 changes)
2. Restart nginx: `docker compose restart nginx`
3. Visit https://aischoolonair.com — you should see the app with a padlock 🔒

**SSL auto-renewal** (set this up once):
```bash
crontab -e
```
Add this line:
```
0 3 * * * certbot renew --quiet && docker compose -f /home/deploy/edu-platform/docker-compose.yml restart nginx
```
This checks for renewal every day at 3am and restarts nginx if the cert was renewed.

---

## Step 10 — Migrate the database from Render

Run this once to copy all your data from Render to the local Postgres:

```bash
# Install pg_dump if not already there (setup script should have done this)
sudo apt-get install -y postgresql-client

# Run the migration
chmod +x scripts/db-migrate.sh
./scripts/db-migrate.sh
```

This:
1. Dumps all data from the Render Postgres
2. Drops and recreates the local database
3. Restores all tables and data into local Postgres
4. Verifies table count

---

## Step 11 — Verify everything is working

```bash
# All containers running?
docker compose ps

# Check the API is responding:
curl https://aischoolonair.com/api/health

# Check the frontend loads:
curl -I https://aischoolonair.com
```

Visit the site in your browser. Log in, check admin dashboard, test AI generate, etc.

---

## Ongoing deployment (after code changes)

Whenever you push new code to GitHub, on the server run:

```bash
cd /home/deploy/edu-platform
./deploy.sh
```

That's it — pulls latest code, rebuilds changed images, restarts containers.

---

## Monitoring — how to watch the app

### From your Windows PC (remote SSH)
```powershell
# Connect to server
ssh root@YOUR_SERVER_IP

# Then on the server:
cd /home/deploy/edu-platform

# Live logs — all containers
docker compose logs -f

# Live logs — just the API server
docker compose logs -f server

# Live logs — just nginx (see incoming requests)
docker compose logs -f nginx

# CPU and RAM usage per container (press q to quit)
docker stats

# Container status
docker compose ps
```

### Built-in health checks
Each container has a health check. `docker compose ps` shows:
- `healthy` — container is up and responding
- `unhealthy` — something is wrong (check logs)
- `starting` — just launched, not ready yet

### Install Uptime Kuma (free, self-hosted monitoring dashboard)
This gives you a web dashboard that alerts you when the site goes down:

```bash
# On the server, add this to docker-compose.yml under services:
#   uptime-kuma:
#     image: louislam/uptime-kuma:1
#     volumes:
#       - uptime_data:/app/data
#     ports:
#       - "3001:3001"
#     restart: always

docker run -d --name uptime-kuma \
  -p 3001:3001 \
  -v uptime_kuma:/app/data \
  --restart always \
  louislam/uptime-kuma:1
```

Then visit `http://YOUR_SERVER_IP:3001` to set up monitors for:
- `https://aischoolonair.com` (frontend)
- `https://aischoolonair.com/api/health` (backend)

It can send alerts via email, Telegram, Slack, etc.

### Hetzner's built-in monitoring
In the Hetzner Cloud console → your server → **Graphs** tab:
- CPU usage over time
- Network bandwidth
- Disk I/O

You can also set **alerts** (email when CPU > 90% for 5 minutes, etc.) under **Alerts**.

---

## Disk space and backups

### Check disk usage
```bash
df -h          # overall disk
du -sh /home/deploy/edu-platform/  # repo + uploads
docker system df  # Docker images and volumes
```

### Backup database
```bash
# Run manually or add to cron
docker exec edu_postgres pg_dump -U eduuser edu_platform \
  | gzip > ~/backups/db_$(date +%Y%m%d).sql.gz
```

### Clean up old Docker images (to save disk space)
```bash
docker system prune -f
```

---

## Troubleshooting

| Problem | Command |
|---------|---------|
| App not loading | `docker compose ps` — check all are `healthy` |
| 502 Bad Gateway | `docker compose logs server` — Node crashed |
| SSL error | `sudo certbot certificates` — check expiry |
| Out of memory | `docker stats` — see which container is eating RAM |
| DB connection error | `docker compose logs postgres` |
| Rebuild just one service | `docker compose build server && docker compose up -d server` |

---

## Cost estimate (Hetzner CX22)

| Item | Monthly cost |
|------|-------------|
| Hetzner CX22 server | ~€3.79 |
| Domain (if needed) | ~€1/month |
| **Total** | **~€5/month** |

Compare: Render free tier goes to sleep after 15 minutes of inactivity.
Render paid (to avoid sleeping) starts at $7/service/month = $14+ for front+back.

---

## What's still on Render vs what moved to Hetzner

After migration:
- ✅ Render frontend → **Hetzner**
- ✅ Render backend API → **Hetzner**
- ✅ Render Postgres → **Hetzner** (after running db-migrate.sh)
- ⚠️  Upstash Redis → **Hetzner** (docker-compose.yml includes local Redis — just remove the `REDIS_URL` override in .env.production)
- ✅ Uploaded files (videos, resources) → **Hetzner** (Docker volume — persistent)
