# TruthGuard AI — Production Deployment Guide

This document outlines the standard production deployment procedure for TruthGuard AI across containerized environments (Docker Compose, Kubernetes, and Linux Virtual Machines).

---

## 1. Production Architecture Overview

In production, TruthGuard operates behind a reverse proxy (Nginx or Cloudflare) which terminates TLS/HTTPS and routes requests:
- Static frontend assets are served directly by Nginx with aggressive caching for hashed Vite chunks.
- API requests (`/api/*`) are proxied to the Node.js backend.
- Background tasks (video processing) execute asynchronously within the backend process or dedicated worker containers.

```
                    Internet (HTTPS :443)
                             │
                             ▼
                  [ Nginx Reverse Proxy ]
                   ├── Static Assets (/assets/*) -> Cached
                   ├── SPA Fallback (/*) -> /index.html
                   └── API Proxy (/api/*) ─┐
                                           │
                             ┌─────────────┘
                             ▼
                [ Node.js Backend API :4000 ]
                 ├── Verification Orchestrator
                 ├── FFmpeg Keyframe Pipeline
                 └── Express Endpoints
                             │
                             ▼
             [ PostgreSQL 16 Database :5432 ]
```

---

## 2. Docker Compose Production Deployment

### Step 1: Clone Repository and Configure Production Environment
```bash
git clone https://github.com/your-org/truthguard.git
cd truthguard
cp .env.production.example .env.production
```
Edit `.env.production` to provide:
- A strong, random `POSTGRES_PASSWORD` (minimum 32 characters)
- The production domain for `CLIENT_ORIGIN` (e.g. `https://truthguard.ai`)
- Optional third-party API keys

### Step 2: Build and Launch Containers
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

### Step 3: Verify Container Health
```bash
docker compose -f docker-compose.prod.yml ps
```
All three services (`truthguard-db`, `truthguard-backend`, and `truthguard-frontend`) should report `Up (healthy)`.

### Step 4: Verify Live Endpoints
```bash
# Check Backend Health
curl -f http://localhost:4000/api/health
# {"status":"ok"}

# Check Frontend Nginx Edge
curl -I http://localhost:80
# HTTP/1.1 200 OK
```

---

## 3. TLS / HTTPS Configuration (Let's Encrypt / Certbot)

For a public Linux server, configure Certbot with Nginx:

1. Install Certbot:
```bash
sudo apt-get update && sudo apt-get install -y certbot python3-certbot-nginx
```

2. Request an SSL/TLS Certificate:
```bash
sudo certbot --nginx -d truthguard.ai -d www.truthguard.ai
```

3. Update `frontend/nginx.conf` or your host Nginx to enforce HTTPS redirection and HSTS:
```nginx
server {
    listen 80;
    server_name truthguard.ai;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name truthguard.ai;

    ssl_certificate /etc/letsencrypt/live/truthguard.ai/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/truthguard.ai/privkey.pem;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    # ... remaining configuration ...
}
```

---

## 4. Automated Database Backups & Cron Schedule

Schedule the automated backup script (`scripts/backup.sh`) using a daily cron job:

```bash
# Open crontab
crontab -e

# Add daily backup at 02:00 AM UTC with 14-day retention
0 2 * * * DOCKER_CONTAINER=truthguard-db /path/to/truthguard/scripts/backup.sh >> /var/log/truthguard_backup.log 2>&1
```

To restore from a backup:
```bash
./scripts/restore.sh ./backups/truthguard_backup_20261031_020000.sql.gz
```

---

## 5. Logging, Monitoring & Healthchecks

1. **Structured Logging**: The backend uses Pino for JSON structured logging. Logs can be ingested directly by Datadog, Grafana Loki, or AWS CloudWatch.
2. **Process Monitoring**: Docker restarts containers automatically via `restart: unless-stopped`.
3. **Health Check Probes**:
   - Backend Liveness & Readiness: `GET /api/health`
   - Frontend Liveness: `GET /`
