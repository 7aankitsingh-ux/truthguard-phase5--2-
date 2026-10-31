# TruthGuard AI

> **Institutional-Grade Multimodal Evidence Verification and Fact-Checking Platform**

TruthGuard AI is a full-stack, enterprise-ready software platform designed to evaluate claims, news articles, digital images, and video media against primary institutional publications, peer-reviewed research, and accredited wire services.

Built upon the core **Non-Forcing Rule**, TruthGuard never allows subjective AI heuristics or statistical guesses to force a verdict when documentary evidence is insufficient.

---

## 🌟 Key Features

### 1. Multimodal Verification Engines
- **Text & Claim Verification**: Bilingual claim extraction (English and Hindi), factuality scoring, Devanagari punctuation support, opinion filtering, and evidence stance comparison.
- **Image Authentication**: Magic bytes inspection, EXIF/IPTC/XMP metadata extraction, editing suite traces (Photoshop, Canva, GIMP), generative AI markers (Stable Diffusion, Midjourney), and aspect ratio anomaly checks.
- **Video Verification & Keyframe Extraction**: Asynchronous processing pipeline utilizing FFprobe and FFmpeg to sample timestamped keyframes, evaluate stream encoder deepfake indicators, and compute frame continuity.
- **Safe URL & Article Verification**: Complete SSRF protection (blocking loopback, RFC1918, link-local, and cloud metadata IPs like `169.254.169.254`), metadata extraction, clickbait headline indicators, and claim verification.

### 2. Multi-Tier Evidentiary Intelligence
- **Tier 1**: Primary Official Publications (NASA, WHO, ISRO, CDC, statutory authorities).
- **Tier 2**: Research Papers & Peer-Reviewed Literature (Nature, Science, NEJM, PubMed).
- **Tier 3**: Established News & Accredited Fact-Checkers (Reuters, AP, AFP, BBC, FactCheck.org). Circular reporting and wire syndication clones are automatically detected to avoid false corroboration.
- **Tier 4**: General Media & Secondary Periodicals.

### 3. Verdict & Confidence Framework
- Standard 4-verdict model: **`SUPPORTED`**, **`CONTRADICTED`**, **`UNVERIFIED`**, **`MIXED`**.
- Multi-dimensional qualitative confidence assessment across 6 dimensions: Source Quality, Relevance, Independence, Consistency, Freshness, and Information Depth.
- Strict isolation of AI-detection metrics: synthetic scores are presented with explicit warnings and never independently dictate factual truth.

### 4. Report Management & Publishing
- Full CRUD report library with search and filters.
- Cryptographically secure 32-character base64url public sharing tokens with one-click revocation.
- Server-side publication-grade PDF generation via PDFKit with evidentiary tables and limitations notes.
- Community dispute filing and on-demand deep dive explanation audit trails.

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL 13+ (or Docker Desktop)
- npm 10+

### Option A: Complete Docker Compose Setup (Recommended)
```bash
# 1. Start all production containers (Database, Backend API, Frontend Nginx)
docker compose -f docker-compose.prod.yml --env-file .env.production.example up -d --build

# 2. Access the Application
# Web Client: http://localhost:80
# API Health: http://localhost:4000/api/health
```

### Option B: Local Development Setup
```bash
# 1. Start PostgreSQL
docker compose up -d db

# 2. Setup and run Backend
cd backend
cp .env.example .env
npm install
npm run migrate
npm test
npm run dev

# 3. Setup and run Frontend (in a separate terminal)
cd ../frontend
npm install
npm test
npm run dev
# Frontend will be live at http://localhost:5173
```

### Default Demo Account
When launched on a clean database, a demo account is pre-seeded:
- **Email**: `demo@truthguard.ai`
- **Password**: `correct-horse-9`

---

## 🧪 Testing

TruthGuard maintains complete automated test coverage:

```bash
# Run Backend Tests (79 test suites covering Unit, Integration, and Security)
cd backend && npm test

# Run Frontend Tests (10 validation suites)
cd frontend && npm test

# Run Frontend Production Build
cd frontend && npm run build
```

---

## 📚 Complete Documentation

Comprehensive technical documentation is available in the [`docs/`](./docs) directory:

- [**System Architecture**](./docs/ARCHITECTURE.md): Multi-tier pipelines, component design, data flow diagrams.
- [**Installation Guide**](./docs/INSTALLATION.md): Step-by-step local setup for macOS, Linux, and Windows.
- [**Environment Setup**](./docs/ENV_SETUP.md): Configuration variables, production settings, and security guardrails.
- [**REST API Documentation**](./docs/API_DOCUMENTATION.md): Complete OpenAPI-style reference for all endpoints.
- [**Database Schema & ERD**](./docs/DATABASE_SCHEMA.md): Entity relationships, table definitions, constraints, indexes.
- [**Testing Guide**](./docs/TESTING.md): QA methodology, test suite breakdown, hermetic execution.
- [**Production Deployment**](./docs/DEPLOYMENT.md): Production Docker, Nginx reverse proxy, SSL/TLS, backups.
- [**External API Dependencies**](./docs/EXTERNAL_APIS.md): Third-party services, honest unconfigured reporting.
- [**Security Audit Report**](./docs/SECURITY_REPORT.md): Threat modeling, OWASP Top 10 mitigations, audit sign-off.

---

## 🔒 Security & Data Privacy

- Argon2id password hashing.
- HttpOnly, SameSite=Lax, Secure session cookies with remote revocation.
- Same-Origin mutation guards mitigating CSRF attacks.
- Positional parameterized queries (`$1`, `$2`) preventing SQL injection.
- Pre-flight DNS and IP validation mitigating SSRF.
- Strict multi-tenant row-level user data isolation (`WHERE user_id = $N`).

---

## 📄 License

Proprietary — Developed for Hackathon Institutional Evidence Verification.
