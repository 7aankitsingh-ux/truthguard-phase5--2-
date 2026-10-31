# TruthGuard AI — Environment Setup & Configuration Guide

This document describes all environment variables used by TruthGuard AI, their valid ranges, defaults, and security considerations.

---

## 1. Core Application Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `NODE_ENV` | String | `development` | Runtime mode: `development`, `test`, or `production`. In `production`, detailed stack traces are hidden from error responses, and cookies enforce the `Secure` flag. |
| `PORT` | Integer | `4000` | Port on which the Express REST API listens. |
| `DATABASE_URL` | String | *(Required)* | Full PostgreSQL connection string (`postgresql://user:pass@host:5432/dbname`). Supports `memory://` in test mode. |
| `CLIENT_ORIGIN` | String (URL) | `http://localhost:5173` | Allowed frontend origin for CORS and same-origin mutation checks. |
| `SESSION_TTL_HOURS` | Integer | `168` (7 days) | Session duration before requiring re-authentication. |

---

## 2. Storage & File Upload Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `STORAGE_DIR` | String | `<cwd>/uploads` | Absolute or relative filesystem path where uploaded videos, keyframe extractions, and temporary artifacts are stored. |
| `MAX_FILE_SIZE_MB` | Integer | `50` | Maximum allowable video file upload size in megabytes. (Images are limited to 25MB). |

---

## 3. Network & Outbound Guardrail Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `FETCH_TIMEOUT_MS` | Integer | `10000` (10s) | Outbound HTTP request timeout used by the safe URL retrieval engine. Prevents slowloris attacks. |
| `MAX_WEBPAGE_BYTES` | Integer | `5242880` (5MB) | Maximum streaming response size allowed when scraping articles for fact-checking. Prevents decompression bombs. |

---

## 4. External Fact-Checking & Search Integrations (Optional)

TruthGuard operates out of the box with built-in factual datasets and local AI heuristic models. To activate live third-party internet fact-checking and computer vision APIs, supply the following keys:

| Variable | Description | Fallback Behavior if Unconfigured |
|---|---|---|
| `GOOGLE_FACTCHECK_API_KEY` | Google Fact Check Tools API Key | Uses indexed institutional databases and indicates external service is not configured. |
| `EXTERNAL_SEARCH_API_KEY` | General Web Search API Key | Falls back to internal multi-tier primary knowledge base. |
| `REVERSE_IMAGE_API_KEY` | Reverse Image Search Provider Key | Clearly reports "API key not configured" in the UI without faking results. |
| `EXTERNAL_AI_DETECTOR_API_KEY` | Third-party AI Detection Service Key | Operates local statistical heuristics (burstiness, vocabulary richness, PNG chunks). |

---

## 5. Security Recommendations for Production

1. **Rotate Secrets Regularly**: Generate a minimum 32-character random string for database passwords.
2. **Reverse Proxy Configuration**: Ensure your Nginx / Cloudflare layer forwards `X-Forwarded-For` and `X-Forwarded-Proto` correctly so Express's `trust proxy` can inspect IP addresses accurately.
3. **Never Commit Secrets**: Ensure `.env` is listed in `.gitignore`. Use `.env.production.example` as a template for production environments.
