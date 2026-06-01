# Infrastructure & Deployment Documentation

This document provides a detailed overview of the production infrastructure, deployment environments, process management, and automated maintenance routines for DancePerfect.

---

## 1. System Architecture Overview

DancePerfect operates on a decoupled architecture split between a serverless frontend edge network and a dedicated compute cloud instance to handle heavy media processing.

```text
[ Client Browser ] 
        │
        ├── (HTTPS) ──> [ Vercel Edge Network ] (Next.js Frontend)
        │
        ├── (Auth / Database Requests) ──> [ Supabase BaaS ] (PostgreSQL / Storage / Auth)
        │
        └── (API Requests) ──> [ Nginx Reverse Proxy ] ──> [ Gunicorn / Flask ] (Hetzner Cloud)

```

---

## 2. Deployment Environments

### Frontend (Vercel)

* **Hosting Platform**: Vercel.
* **Framework**: Next.js (App Router).
* **Deployment Pipeline**: Configured via GitHub Integration. Pushes to the `main` branch trigger automated production builds and edge distribution.

### Backend Pipeline (Hetzner Cloud)

* **Hosting Platform**: Hetzner Cloud (Dedicated CPU / High-Compute instance).
* **Purpose**: Dedicated resource allocation for CPU-intensive computer vision processing (OpenCV and MediaPipe Pose landmark extraction).
* **Application Server**: Python/Flask.

### Backend Database & Services (Supabase)

* **Database**: Managed PostgreSQL instance.
* **Authentication**: Supabase Auth handling Role-Based Access Control (RBAC) for standard users and administrative pathways.
* **Storage Buckets**:
* `videos/performance`: Stores user-submitted performance clips.
* `videos/reference`: Stores reference choreography files.
* `assets/branding`: Hosts dynamic system configuration assets (logos, look-and-feel parameters managed via the admin panel).



---

## 3. Server Configuration (Hetzner Instance)

To ensure stability, security, and performance under heavy load, the Flask backend utilizes a production-grade application delivery stack.

### Reverse Proxy (Nginx)

Nginx is positioned at the front door of the Hetzner instance to handle traffic routing and secure transport layers.

* **SSL/TLS Termination**: Managed via Let's Encrypt (`certbot`) to enforce HTTPS.
* **Payload Size Configuration**: Increased `client_max_body_size` (e.g., `client_max_body_size 100M;`) to accommodate high-resolution video uploads passing through the proxy.
* **Request Forwarding**: Proxies incoming requests from port `80`/`443` down to the local Gunicorn binding layer.

### Process Management (Gunicorn & systemd)

The Flask built-in development server is strictly disabled in production.

* **WSGI Server**: Gunicorn (Green Unicorn) handles concurrent processing workers.
* **Process Supervisor**: Managed as a Linux service via `systemd` to handle automatic recovery, system boot executions, and logging output.

Example service configuration (`/etc/systemd/system/danceperfect-backend.service`):

```ini
[Unit]
Description=DancePerfect Flask Backend WSGI Daemon
After=network.target

[Service]
User=deploy
Group=www-data
WorkingDirectory=/var/www/danceperfect-backend
Environment="PATH=/var/www/danceperfect-backend/venv/bin"
ExecStart=/var/www/danceperfect-backend/venv/bin/gunicorn --workers 3 --bind 127.0.0.1:5000 app:app

[Install]
WantedBy=multi-user.target

```

---

## 4. Automation & Scheduled Maintenance (Cron)

Processing high-volume video frames can quickly consume disk space and memory buffers. The system utilizes automated system tasks to clean temporary data.

### Video Cleanup Jobs

A local system `cron` job runs at low-traffic intervals to clear local temporary directories where raw video slices, extracted frames, or local computer vision logs are compiled during analysis runtime.

To view or edit these automation schedules on the server:

```bash
crontab -e

```

Example maintenance layout:

```text
# Clear temp processing cache daily at 2:00 AM
0 2 * * * find /var/www/danceperfect-backend/tmp/processed/ -type f -mtime +1 -delete

```

---

## 5. Security Protocols

1. **Environment Isolation**: Production API keys, Supabase credentials, and private connection strings are injected strictly through Vercel environment variables and a secured `.env` file on the Hetzner server.
2. **Firewall Settings (UFW)**: The Hetzner instance restricts all open ports except for `80` (HTTP), `443` (HTTPS), and secure custom SSH access ports.
3. **RBAC Verification**: API endpoints handling sensitive dynamic branding changes or administrative features explicitly validate incoming Supabase user JWT claims before initiating system operations.
