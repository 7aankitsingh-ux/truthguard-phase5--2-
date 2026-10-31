# TruthGuard AI — Local Installation & Setup Guide

## 1. Prerequisites

Ensure the following tools are installed on your workstation:

- **Node.js**: Version 20.x or newer (check with `node -v`)
- **npm**: Version 10.x or newer (check with `npm -v`)
- **PostgreSQL**: Version 13 or newer (or Docker Desktop)
- **FFmpeg & FFprobe**: (Bundled automatically via `ffmpeg-static` and `ffprobe-static` npm packages)
- **Git**

---

## 2. Quick Start with Docker (Recommended)

The easiest way to spin up the complete environment is using Docker Compose:

### Step 1: Clone or Navigate to the Repository
```bash
cd truthguard
```

### Step 2: Start PostgreSQL Database
```bash
docker compose up -d db
```

### Step 3: Install Backend Dependencies & Apply Database Schema
```bash
cd backend
cp .env.example .env
npm install
npm run migrate
```

### Step 4: Run Backend Tests
```bash
npm test
```

### Step 5: Start Backend Development Server
```bash
npm run dev
# API will start on http://localhost:4000
```

### Step 6: Start Frontend Development Server
In a separate terminal:
```bash
cd ../frontend
npm install
npm test
npm run dev
# Frontend will start on http://localhost:5173
```

---

## 3. Manual Local PostgreSQL Setup (Without Docker)

If you have PostgreSQL installed directly on your machine:

1. Create a database user and database:
```sql
CREATE USER truthguard WITH PASSWORD 'truthguard';
CREATE DATABASE truthguard OWNER truthguard;
```

2. Configure `backend/.env`:
```env
DATABASE_URL=postgresql://truthguard:truthguard@localhost:5432/truthguard
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
NODE_ENV=development
```

3. Run migrations:
```bash
cd backend
npm run migrate
```

4. Verify database connectivity:
```bash
npm test
```

---

## 4. Default Credentials (Seeded Demo Account)

On first launch, if the database has zero registered users, the application automatically provisions a local demo account:

- **Email**: `demo@truthguard.ai`
- **Password**: `correct-horse-9`

You may also create fresh user accounts directly through the registration form (`/signup`).
