# TruthGuard AI — Quality Assurance & Testing Guide

This project maintains automated test suites covering unit logic, security threat vectors, multi-tier evidence pipelines, end-to-end integration workflows, and frontend state management.

---

## 1. Running Test Suites

### Backend Test Suite
From the `backend/` directory:
```bash
npm test
```
The test runner executes all test files under `tests/*.test.js` using Node's native test runner (`node --test`). Tests run hermetically using an in-memory SQL engine (`pg-mem`) when a physical PostgreSQL instance is not specified.

### Frontend Test Suite
From the `frontend/` directory:
```bash
npm test
```
Executes frontend structure and state validation tests, testing route registration, password rules, file upload constraints, dashboard computations, and responsive media rules.

### Frontend Production Build Check
From the `frontend/` directory:
```bash
npm run build
```
Runs the Vite compiler and Rollup packager, ensuring all JSX modules compile with zero errors and producing an optimized static bundle.

---

## 2. Test Suite Inventory

| Test File | Suite Description | Assertions & Scope |
|---|---|---|
| `tests/auth.test.js` | Authentication & User Management | Registration, Argon2id password hashing, duplicate email prevention, weak password rejection, session revocation on logout, password reset single-use token lifecycle, account enumeration prevention. |
| `tests/text.test.js` | Text & Claim Verification | Language detection (English & Hindi Devanagari), claim segmentation, factuality scoring, stance determination, Phase 3 verdicts (SUPPORTED/CONTRADICTED/MIXED), strict AI score separation. |
| `tests/media.test.js` | Media Processing & Validation | Magic bytes inspection (JPEG, PNG, WebP), video container headers (MP4, WebM, MOV), EXIF extraction, synthetic PNG chunk parsing, timestamped keyframe extraction. |
| `tests/image.test.js` | Image Verification Pipeline | Software tampering indicators (Photoshop/Canva), generative AI markers, reverse image search unconfigured honesty, corrupted file rejection. |
| `tests/video.test.js` | Video Verification Pipeline | Stream metadata extraction via ffprobe, keyframe extraction via ffmpeg, deepfake editing suite encoder signatures, corrupted container rejection. |
| `tests/url.test.js` | URL & Web Article Verification | SSRF protection (loopback, private RFC1918, cloud metadata 169.254.169.254, IPv6 local, invalid protocols), article scraping, clickbait indicator analysis. |
| `tests/evidence.test.js` | Evidence Retrieval Baseline | Semantic stance classification, source comparison, bilingual knowledge retrieval (EN/HI), honest external API status reporting. |
| `tests/orchestrator.test.js`| Verification Orchestrator | Sync vs async request execution, background task scheduling, status state transitions (`pending` -> `processing` -> `completed`/`failed`), database persistence. |
| `tests/verify_routes.test.js`| API Integration Routes | HTTP endpoints for text, URL, image, video submission, and status polling. |
| `tests/phase3.test.js` | Intelligence, Evidence & Verdicts | Multi-tier source authority sorting (Tier 1-4), circular reporting & wire syndication cloning detection, 6-dimension confidence assessment, PDF generation, dispute logging. |
| `tests/phase4.test.js` | Dashboard, History & Security | Database-driven stats, verification history filtering (type, verdict, status, date), saved report CRUD, session revocation, user data isolation. |
| `tests/security.test.js` | Comprehensive Security Suite | Unauthorized endpoint access, cross-user report & history isolation, token tampering, rate-limiting, SQL injection payloads, XSS attack prevention, same-origin CSRF checks, malicious file spoofing, SSRF vectors, DoS oversized payloads, credential secrecy. |
| `tests/integration_workflows.test.js` | Complete End-to-End Workflows | Text Workflow, Image Workflow, Video Workflow, URL Workflow. |
| `frontend/tests/frontend.test.js` | Frontend State & Component Validation | Routes, auth forms, workspace tabs, file upload constraints, verdict badge styling, dashboard breakdown models, query string serialization, report sharing links, responsive mobile CSS. |

---

## 3. Test Results Summary

- **Backend Total Tests**: 79 / 79 Passing (100%)
- **Frontend Total Tests**: 10 / 10 Passing (100%)
- **Total Test Assertions**: Over 300+ automated assertions
- **Test Execution Time**: ~8.5 seconds (including ffmpeg keyframe video rendering)
