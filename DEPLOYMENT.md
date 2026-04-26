# AISchoolonair — Hetzner CX23 Deployment Runbook

> **Audience:** Windows developer with basic terminal experience.  
> **Goal:** Migrate from Render (frontend + backend) → Hetzner CX23 Docker stack, keeping Render Postgres.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Pre-flight Checklist](#2-pre-flight-checklist)
3. [Provision Hetzner Server](#3-provision-hetzner-server)
4. [Bootstrap the Server](#4-bootstrap-the-server)
5. [Deploy the Application](#5-deploy-the-application)
6. [DNS & Caddy TLS](#6-dns--caddy-tls)
7. [Staging Validation](#7-staging-validation)
8. [Paystack Cutover Checklist](#8-paystack-cutover-checklist)
9. [Production Cutover](#9-production-cutover)
10. [Post-Cutover Checklist](#10-post-cutover-checklist)
11. [Operations Reference](#11-operations-reference)
12. [Rollback Plan](#12-rollback-plan)
13. [Storage Migration (R2 — Future)](#13-storage-migration-r2--future)

---

## 1. Architecture Overview

```
Browser
  │
  ▼
Caddy (port 80/443, TLS auto via Let's Encrypt)
  ├── www.aischoolonair.ng
  │     ├── /api/*         → api:5000       (Node/Express)
  │     ├── /uploads/*     → api:5000
  │     └── /*             → web:80         (nginx serving React SPA)
  │
  └── staging.aischoolonair.ng
        ├── /api/*         → api_staging:5000
        └── /*             → web_staging:80

api / api_staging → Redis (internal BullMQ + rate limit)
api / api_staging → Render Postgres (external, DATABASE_URL)
```

**CX23 specs:** 2 vCPU / 4 GB RAM / 40 GB SSD — sufficient for production.

---

## 2. Pre-flight Checklist

Complete these before touching the server:

- [ ] You have a Hetzner account and can create a server
- [ ] You have an SSH key pair (see §3 if not)
- [ ] You have the Render Postgres **External Connection String** (Render dashboard → database → Info tab → "External Database URL")
- [ ] You know your Gmail App Password (or other SMTP credentials) for transactional email
- [ ] You have your Gemini API key
- [ ] You have your Paystack **test** secret key and webhook secret (Dashboard → Settings → API Keys & Webhooks)
- [ ] Your domain registrar / DNS provider allows editing A records for `aischoolonair.ng`
- [ ] Git repo is clean and pushed to GitHub main branch

---

## 3. Provision Hetzner Server

### 3a. Create SSH key (Windows PowerShell — skip if you already have one)

```powershell
ssh-keygen -t ed25519 -C "aischoolonair-hetzner" -f "$env:USERPROFILE\.ssh\hetzner_aischool"
# Press Enter twice for no passphrase (or set one)
# Public key is at: C:\Users\<you>\.ssh\hetzner_aischool.pub
```

### 3b. Create server in Hetzner Cloud Console

1. Go to [console.hetzner.cloud](https://console.hetzner.cloud)
2. **New Server**
   - Location: **Nuremberg** or **Helsinki** (lowest latency to Nigeria: Frankfurt/Nuremberg)
   - Image: **Ubuntu 24.04**
   - Type: **CX23** (Shared vCPU, 4 GB RAM)
   - SSH Keys: paste the content of `hetzner_aischool.pub`
   - Name: `aischoolonair-prod`
3. Click **Create & Buy**
4. Note the server's **public IPv4** address (shown in dashboard)

---

## 4. Bootstrap the Server

### 4a. Upload and run bootstrap script (Windows PowerShell)

```powershell
# Replace 1.2.3.4 with your actual Hetzner IP
$IP = "1.2.3.4"

# Upload bootstrap script
scp -i "$env:USERPROFILE\.ssh\hetzner_aischool" hetzner-bootstrap.sh root@${IP}:/root/

# Run it (takes ~2-3 minutes)
ssh -i "$env:USERPROFILE\.ssh\hetzner_aischool" root@${IP} "bash /root/hetzner-bootstrap.sh"
```

The script:
- Updates Ubuntu packages
- Installs Docker CE (latest), UFW, fail2ban, git
- Opens firewall ports 22/80/443 only
- Creates `deploy` user with Docker access
- Copies your SSH key to deploy user
- Disables root SSH and password auth
- Creates `/opt/aischoolonair`

### 4b. Verify you can SSH as deploy user

```powershell
ssh -i "$env:USERPROFILE\.ssh\hetzner_aischool" deploy@${IP}
```

You should land at a bash prompt. Exit with `exit`.

---

## 5. Deploy the Application

### 5a. Clone the repo on the server

```bash
# On the Hetzner server (as deploy user):
cd /opt/aischoolonair
git clone https://github.com/PDS-David/edu-platform.git .
```

### 5b. Create environment files

**Production env:**

```bash
cp api.env.example api.env
nano api.env
```

Fill in every `REPLACE_ME` value. The critical ones:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Render dashboard → DB → Info → External Database URL |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `SESSION_SECRET` | Same command, run again |
| `PAYSTACK_SECRET_KEY` | Paystack Dashboard → Settings → API Keys → **Live** secret key |
| `PAYSTACK_WEBHOOK_SECRET` | Paystack Dashboard → Settings → Webhooks → Webhook secret |
| `EMAIL_USER` / `EMAIL_PASS` | Your Gmail + App Password |
| `GEMINI_API_KEY` | Google AI Studio |
| `CLIENT_URL` | `https://www.aischoolonair.ng` |
| `PROD_CLIENT_URL` | `https://aischoolonair.ng` |

**Staging env** (use test Paystack keys here):

```bash
cp api.env.example api.staging.env
nano api.staging.env
```

Change in `api.staging.env`:
- `PAYSTACK_SECRET_KEY=sk_test_...` ← your test key
- `CLIENT_URL=https://staging.aischoolonair.ng`
- `PROD_CLIENT_URL=https://staging.aischoolonair.ng`
- `SERVER_BASE_URL=https://staging.aischoolonair.ng`

### 5c. Build and start (first time — takes 5-10 minutes)

```bash
cd /opt/aischoolonair
./deploy.sh
```

> **Note:** Caddy will NOT issue TLS certs until DNS is pointed at this server (§6).
> The site runs fine internally; you can test with `curl http://localhost:3000` (not needed — see §6).

---

## 6. DNS & Caddy TLS

### 6a. Add DNS A records

In your DNS provider (Cloudflare, Namecheap, etc.), add:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` (or `aischoolonair.ng`) | `<HETZNER_IP>` | 300 |
| A | `www` | `<HETZNER_IP>` | 300 |
| A | `staging` | `<HETZNER_IP>` | 300 |

If using Cloudflare: **set proxy to DNS-only (grey cloud)** while testing, then enable proxy after TLS is verified.

### 6b. Wait for DNS propagation

```powershell
# Windows — check propagation
nslookup www.aischoolonair.ng
# Should return your Hetzner IP
```

DNS can take 1-60 minutes. When it resolves correctly, Caddy will automatically request Let's Encrypt certificates on the first HTTPS request.

### 6c. Verify TLS

```bash
# On the server:
docker compose logs -f caddy
# Look for: "certificate obtained successfully"
```

Or from your browser: `https://staging.aischoolonair.ng` — should show the app with a valid padlock.

---

## 7. Staging Validation

Before touching production DNS, validate everything on staging:

```bash
# Health check
curl -s https://staging.aischoolonair.ng/health | python3 -m json.tool
# Expected: {"status":"ok","timestamp":"..."}

# API
curl -s https://staging.aischoolonair.ng/api/auth/me
# Expected: 401 Unauthorized (correct — not logged in)
```

**Manual test checklist (do these in the browser):**

- [ ] Homepage loads, no console errors
- [ ] Register a new account → welcome email received
- [ ] Log in
- [ ] Navigate to a subject/quiz page
- [ ] WebSocket connection live (check browser DevTools → Network → WS tab)
- [ ] `/api/payments/plans` returns subscription plans
- [ ] Initiate a test payment using Paystack test card `4084 0840 8408 4081`, CVV 408, expiry any future date
- [ ] Payment success → subscription activated in DB
- [ ] Paystack test webhook fires correctly (check staging API logs)

---

## 8. Paystack Cutover Checklist

Paystack requires exact URL registration — payments will fail silently if URLs are wrong.

### 8a. While on staging (test mode)

In **Paystack Dashboard → Settings → API Keys & Webhooks**:

- [ ] Webhook URL set to: `https://staging.aischoolonair.ng/api/payments/webhook`
- [ ] Allowed callback domains include: `staging.aischoolonair.ng`
- [ ] Test a payment end-to-end (see §7 checklist above)

### 8b. Before production cutover (live mode)

- [ ] Update Paystack webhook URL to: `https://www.aischoolonair.ng/api/payments/webhook`
- [ ] Update allowed callback domains to include: `www.aischoolonair.ng`, `aischoolonair.ng`
- [ ] In `api.env` on the server, confirm `PAYSTACK_SECRET_KEY=sk_live_...` (live key, not test)
- [ ] Restart API to pick up live key: `docker compose up -d --no-deps api`

### 8c. After production cutover

- [ ] In Render dashboard, update `CLIENT_URL` and `SERVER_BASE_URL` env vars if Render backend still runs
- [ ] Make a real ₦100 test payment on production to confirm end-to-end
- [ ] Confirm webhook receipt in Paystack Dashboard → Logs

> **Payment downtime window:** Paystack webhook URL changes take effect immediately.  
> Change the webhook URL AFTER DNS switches to Hetzner, not before, to avoid a gap.

---

## 9. Production Cutover

### 9a. Final pre-cutover checks

```bash
# On staging, confirm no errors in the last hour:
docker compose logs --since 1h api | grep -i error | wc -l
# Aim for 0 (or investigate any errors)

# Confirm prod env is correct:
grep "PAYSTACK_SECRET_KEY" api.env   # should show sk_live_...
grep "CLIENT_URL" api.env            # should show www.aischoolonair.ng
```

### 9b. Change DNS A records

In your DNS provider, update:

| Type | Name | Old value | New value |
|---|---|---|---|
| A | `@` | Render IP | `<HETZNER_IP>` |
| A | `www` | Render IP | `<HETZNER_IP>` |

Set TTL to 60 seconds 5 minutes before cutover for faster propagation.

### 9c. Update Paystack webhook URL

Immediately after DNS update:

1. Paystack Dashboard → Settings → Webhooks
2. Change URL from old Render URL → `https://www.aischoolonair.ng/api/payments/webhook`

### 9d. Monitor the cutover

```bash
# Watch Caddy issue the production cert (happens within seconds of DNS resolving):
docker compose logs -f caddy

# Watch API traffic come in:
docker compose logs -f api
```

---

## 10. Post-Cutover Checklist

- [ ] `https://www.aischoolonair.ng` loads correctly (valid SSL cert)
- [ ] `https://aischoolonair.ng` redirects to `www.` (301)
- [ ] Login works on production
- [ ] `/health` returns `{"status":"ok"}`
- [ ] Paystack webhook URL updated to production domain
- [ ] DNS TTL restored to 3600 after confirming stability
- [ ] Old Render web service suspended (don't delete yet — keep for 7-day rollback)
- [ ] Render API service suspended (optional — DB stays up regardless)
- [ ] Set up monitoring (see §11)

---

## 11. Operations Reference

### Viewing logs

```bash
# All services, follow:
docker compose logs -f

# Specific service:
docker compose logs -f api
docker compose logs -f caddy

# Last 100 lines:
docker compose logs --tail=100 api

# Search for errors:
docker compose logs api 2>&1 | grep -i "error\|warn" | tail -50
```

### Container management

```bash
# Status:
docker compose ps

# Restart a single service (no downtime for others):
docker compose restart api

# Rebuild + redeploy single service:
docker compose build api && docker compose up -d --no-deps api

# Shell into API container:
docker compose exec api sh

# Resource usage:
docker stats
```

### Updating the app

```bash
cd /opt/aischoolonair
./deploy.sh   # pulls git, rebuilds, restarts
```

### Backups (uploads volume)

```bash
# Backup uploads to home directory:
docker run --rm -v aischoolonair_uploads_data:/data -v ~/:/backup \
  alpine tar czf /backup/uploads-$(date +%Y%m%d).tar.gz -C /data .

# List backups:
ls -lh ~/uploads-*.tar.gz
```

### Monitoring with Uptime Kuma (optional but recommended)

```bash
# Add to docker-compose.yml services section, or run standalone:
docker run -d \
  --name uptime-kuma \
  --restart unless-stopped \
  -p 3001:3001 \
  -v uptime-kuma:/app/data \
  louislam/uptime-kuma:1

# Access at http://<HETZNER_IP>:3001 (configure your own admin password)
# Add monitor: https://www.aischoolonair.ng/health  (expected: "ok")
```

### Disk usage

```bash
df -h                          # overall disk
docker system df               # Docker volumes/images
docker system prune -f         # remove stopped containers + dangling images
```

---

## 12. Rollback Plan

If something goes wrong after DNS cutover, you can be back on Render within ~5 minutes.

### DNS rollback (fastest — 5 minutes)

1. In your DNS provider, revert A records for `@` and `www` back to Render's IP
2. Set TTL 60 if possible
3. Re-enable the Render services (they should still be running / can be restarted in 1 click)
4. Update Paystack webhook URL back to the Render API URL
5. Monitor: DNS propagation takes 1-60 minutes; existing sessions on Hetzner will time out gracefully

### Where to find Render's IP

Render uses Cloudflare as a CDN, so they don't publish a stable IP.  
**Before cutover:** run `nslookup your-render-app.onrender.com` and note the IP, or keep the Render URL in a note.

Alternatively, **don't delete the Render services for 7 days** — just suspend them.  
To rollback: unsuspend → wait 1-2 min → revert DNS.

### Partial rollback (API only on Render, frontend on Hetzner)

Not recommended, but possible if the Render API is fine and only the Docker setup has issues:
- Revert DNS for `www` only (front-end) back to Render
- Keep Hetzner running for diagnosis

---

## 13. Storage Migration (R2 — Future)

Currently file uploads are stored in a Docker named volume (`uploads_data`).  
To migrate to Cloudflare R2:

1. Uncomment the R2 variables in `api.env`
2. The server already imports `@aws-sdk/client-s3` — wire upload endpoints to use the SDK
3. Migrate existing files: `rclone copy local:/opt/aischoolonair/uploads r2:aischoolonair-uploads`
4. Set `R2_PUBLIC_BASE_URL` so the frontend can access files via CDN URL

---

*Last updated: 2025 — maintained by PDS-David*
