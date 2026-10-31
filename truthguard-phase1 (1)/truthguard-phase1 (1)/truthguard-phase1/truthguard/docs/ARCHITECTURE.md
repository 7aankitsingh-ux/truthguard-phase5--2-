# TruthGuard AI — System Architecture Documentation

## 1. System Overview

**TruthGuard AI** is an institutional-grade multimodal evidence verification and fact-checking platform. It accepts factual assertions, viral articles, digital images, and video media, evaluating them against primary institutional publications, research databases, and accredited wire services to determine factual authenticity.

The system is architected around the **Non-Forcing Rule**: *subjective AI tokens or statistical models never force an authoritative factual verdict when available documentary corroboration is insufficient.*

---

## 2. Architectural Layers

The application follows a clean 4-tier separation of concerns:

```
+-------------------------------------------------------------------------+
|                           CLIENT LAYER                                  |
|  React 18 + Vite SPA, CSS Design System, Responsive Mobile Drawer      |
+-------------------------------------------------------------------------+
                                    |  (HTTPS, JSON, Cookies, Multipart)
                                    v
+-------------------------------------------------------------------------+
|                       GATEWAY & SECURITY LAYER                          |
|  Nginx Reverse Proxy, Helmet CSP, Origin Guard, Rate Limiter, Auth Check|
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                         APPLICATION SERVICES                            |
|  Verification Orchestrator | Text Engine | Media Engine | URL Engine    |
|  Evidence Retrieval Engine | Evaluation Engine | Verdict Generator      |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                          PERSISTENCE LAYER                              |
|  PostgreSQL 16 (Relational Tables, JSONB Documents, B-Tree Indexes)     |
|  Encrypted Local / S3-Compatible Media Keyframe Storage                 |
+-------------------------------------------------------------------------+
```

---

## 3. Core Verification Pipelines

### 3.1. Text & Claim Verification Pipeline

```
[ User Text Input ] 
       │
       ▼
[ Language Detection (EN / HI) ]
       │
       ▼
[ Claim Extraction & Factuality Filter ] (Extracts empirical claims; filters opinions)
       │
       ▼
[ Evidence Retrieval Engine ] (Queries Tier 1-4 indexed sources + Google Fact Check API)
       │
       ▼
[ Evidence Evaluation Engine ] (Analyzes stance, topical relevance, syndication clones)
       │
       ▼
[ Verdict Generation Engine ] (SUPPORTED | CONTRADICTED | UNVERIFIED | MIXED)
       │
       ▼
[ 6-Dimension Confidence Assessment ] (Source Quality, Relevance, Independence, etc.)
       │
       ▼
[ Database Persistence & Audit Log ]
```

### 3.2. Image Verification Pipeline

```
[ Uploaded Image Buffer ]
       │
       ▼
[ Magic Bytes & Format Verification ] (Strict JPEG/PNG/WebP validation)
       │
       ▼
[ Metadata Extraction ] (EXIF, IPTC, XMP, Camera Make, Timestamps, GPS)
       │
       ▼
[ Manipulation & Integrity Analysis ] (Editing signatures: Photoshop, Canva, GIMP)
       │
       ▼
[ Synthetic / AI Generator Detection ] (Stable Diffusion PNG chunks, Midjourney tags)
       │
       ▼
[ Reverse Image Search Integration ] (Honest reporting if unconfigured)
       │
       ▼
[ Result Synthesis with Explicit Caveats & Limitations ]
```

### 3.3. Video Verification Pipeline (Asynchronous Background Job)

```
[ Uploaded Video File ]
       │
       ▼
[ Container Header Validation ] (MP4, WebM, MOV, MKV, AVI)
       │
       ▼
[ Status: 'processing' / 202 Accepted Returned to Client ]
       │
       ▼
[ Background Worker Extraction via FFprobe & FFmpeg ]
  ├── Video Stream Metadata (Resolution, FPS, Codec, Bitrate)
  └── Timestamped Keyframe Extraction (Max 10 representative frames)
       │
       ▼
[ Keyframe Visual Inconsistency & Deepfake Artifact Detection ]
       │
       ▼
[ Status Updated to 'completed' / 'failed' in PostgreSQL ]
       │
       ▼
[ Client Polls GET /api/verify/:id -> Receives Completed Gallery ]
```

### 3.4. URL Verification Pipeline

```
[ Target URL Input ]
       │
       ▼
[ Strict SSRF Protection Guard ]
  ├── Syntactic Validation (http/https only)
  ├── Hostname Resolution Check
  └── Outbound IP Blocking (RFC1918, Loopback, Cloud Metadata 169.254.169.254)
       │
       ▼
[ Safe Fetch with Timeout (10s) and Body Cap (5MB) ]
       │
       ▼
[ Article Content & Metadata Extraction via Cheerio ]
       │
       ▼
[ Domain Reputation & Clickbait Characteristic Analysis ]
       │
       ▼
[ Text Claim Verification Pipeline on Extracted Article Body ]
```

---

## 4. Multi-Tier Source Authority Model

TruthGuard categorizes all retrieved references according to a 4-tier evidentiary hierarchy:

1. **Tier 1 — Primary Official Publications**: Statutory authorities, official gazettes, NASA, WHO, ISRO, CDC, national meteorological departments.
2. **Tier 2 — Research & Academic Literature**: Peer-reviewed journals (Nature, Science, NEJM, PubMed) and accredited university repositories.
3. **Tier 3 — Established News & Accredited Fact-Checkers**: Reuters, AP, AFP, BBC, FactCheck.org, Snopes, PolitiFact. Reprints are automatically de-duplicated and checked for circular wire syndication.
4. **Tier 4 — General Media & Secondary Sources**: Independent blogs, regional periodicals, secondary commentaries.

---

## 5. Security Architecture

- **Session Security**: Cryptographically random 32-byte tokens hashed via SHA-256 before database insertion; stored in HttpOnly, SameSite=Lax, Secure cookies.
- **Password Protection**: Argon2id hashing with unique salts (memory cost: 64MB, iterations: 3, parallelism: 1).
- **Origin Validation**: Strict same-origin verification on all state-mutating requests (POST, PATCH, DELETE), mitigating CSRF.
- **SQL Injection Prevention**: All queries use parameterized SQL (`$1`, `$2`, ...) with zero string concatenation.
- **XSS & Content Security**: Helmet HTTP security headers, Content Security Policy, automatic React escaping, safe binary PDF output.
- **Data Isolation**: Strict multi-tenant query isolation enforcing `WHERE user_id = $N` across all data queries.
