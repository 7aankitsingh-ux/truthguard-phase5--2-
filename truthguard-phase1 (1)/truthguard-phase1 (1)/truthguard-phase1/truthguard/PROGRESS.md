# Progress

## Phase 5: VERIFIED (2026-10-31)

### Phase 5 Testing, Integration, Deployment & Final Delivery Implemented

#### 1. Frontend Testing
- Implemented automated testing suite in `frontend/tests/frontend.test.js` (**10 / 10 tests passing, 100%**).
- Added `"test": "node --test tests/*.test.js"` script to `frontend/package.json`.
- Tested and verified:
  - Navigation & Route mapping (public routes, protected app routes, catch-all redirects, shared report links).
  - Login & registration client-side form validation (email RFC regex, password checklist requirements).
  - Verification workspace tabs (text, image, video, url mode configurations, hints, and active state persistence).
  - File upload restrictions (25MB image limit, 50MB video limit, allowed extensions `.jpg .png .webp .mp4 .webm .mov .mkv .avi`).
  - Results page formatting (verdict badges, 6-dimension qualitative confidence tiers, source authority tiers 1-4, wire syndication banners, strict AI detection separation disclaimer).
  - Dashboard statistics model (breakdown percentage calculations, in-progress pulse indicator).
  - Verification history search & filter query parameter serialization and pagination calculations.
  - Report management (public share URL builder, PDF download link generation, clipboard Markdown export formatting).
  - Profile & settings preferences schema validation and password match checks.
  - Mobile responsive layouts & CSS media queries (`@media (max-width: 860px)` and `@media (max-width: 720px)` drawer transform, hamburger menu toggle, backdrop scrim).
- Verified production build: `npm run build` succeeds cleanly (**42 modules transformed, 0 errors**).

#### 2. Backend Testing & Robustness
- Expanded backend test suite from 65 to **79 tests (100% passing)**.
- Enhanced central error handler in `middleware/error.js`:
  - Added native mapping for body-parser `entity.too.large` (HTTP 413 Payload Too Large).
  - Added clean handling for `multer.MulterError` (HTTP 400 upload error).
  - Refactored `ImageVerificationService` and `VideoVerificationService` to throw structured `AppError(400)` on invalid/corrupted files.

#### 3. Security Testing Suite (`tests/security.test.js`)
Dedicated security test suite with 10 comprehensive tests verifying:
- Unauthorized API access: protected routes return 401 `unauthenticated` across all endpoints.
- Cross-user data isolation: users cannot view, modify, delete, download PDF, or access another user's private reports or verification history (strict 404 response).
- Invalid authentication tokens: forged tokens, empty cookies, and revoked session tokens are rejected.
- Rate limiting protection: auth and verification rate limits prevent brute force and token enumeration.
- SQL injection prevention: verified safety across search queries, verdict filters, type filters, profile updates, report titles, and claim texts with zero data leakage or errors.
- Cross-Site Scripting (XSS): script injection payloads safely stored and escaped; Helmet CSP, `X-Content-Type-Options: nosniff`, and `X-Frame-Options: SAMEORIGIN` headers enforced.
- CSRF / Origin enforcement: mutating requests (POST, PATCH, DELETE) with unauthorized or spoofed origins are blocked with 403 `forbidden_origin`.
- Malicious file uploads: executable files (`.exe`, `.sh`), double extensions (`.php.png`), and mismatched magic bytes are rejected with 400 errors.
- SSRF attempts: strict blocking against RFC1918 private IPs, loopback (`127.0.0.1`, `[::1]`), cloud metadata (`169.254.169.254`), and non-HTTP protocols (`file://`, `ftp://`, `gopher://`).
- DoS & oversized requests: JSON bodies > 100KB return 413 Payload Too Large.
- Information disclosure prevention: internal Argon2 password hashes, session token hashes, and stack traces are never exposed in user profiles, dashboard payloads, or error responses.

#### 4. End-to-End Integration Workflows (`tests/integration_workflows.test.js`)
Dedicated integration test suite verifying the 4 complete workflows:
- **Text Workflow**: Submit claims -> extraction -> evidence retrieval -> evaluation -> verdict generation -> report save -> share link generation -> anonymous public viewer access -> dispute submission -> on-demand explanation request.
- **Image Workflow**: Upload PNG -> magic bytes validation -> EXIF & metadata extraction -> manipulation & AI analysis -> findings evaluation -> report generation -> publication-grade PDF download.
- **Video Workflow**: Upload MP4 -> container header validation -> async job submission (202 Accepted) -> background worker keyframe extraction with timestamps (`mm:ss.ms`) -> status transition to `completed` -> dashboard counter increment.
- **URL Workflow**: Submit URL -> SSRF pre-flight validation -> article retrieval & Cheerio parsing -> claim extraction -> evidence comparison -> verdict generation -> report library persistence.

#### 5. Production Deployment Preparation
- **Backend Dockerfile**: Multi-stage, Node 20 alpine, non-root user (`node`), FFmpeg system binaries, healthcheck probe.
- **Frontend Dockerfile**: Multi-stage build (Vite compilation -> Nginx 1.27 Alpine edge serving).
- **Production Reverse Proxy (`frontend/nginx.conf`)**:
  - Reverse proxy `/api/` to backend with connection pooling and rate limiting (`limit_req_zone`).
  - SPA routing fallback (`try_files $uri $uri/ /index.html`).
  - Gzip compression on all text, JSON, and SVG assets.
  - 1-year immutable caching for hashed assets (`/assets/*`); `no-cache` for `index.html`.
  - Strict security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options).
- **`docker-compose.prod.yml`**: Production container orchestration for PostgreSQL 16 (with healthcheck and persistent volume), backend API service, and frontend Nginx proxy.
- **`.env.production.example`**: Complete production environment template with security guidelines.
- **Database Backup & Recovery**:
  - `scripts/backup.sh` and `scripts/backup.ps1` for automated compressed PostgreSQL dumps with SHA-256 checksums and 14-day retention pruning.
  - `scripts/restore.sh` for safe restore with checksum verification and interactive overwrite confirmation.

#### 6. Complete Documentation Suite (`docs/` & `README.md`)
- Overhauled `README.md` to publication-grade standard.
- `docs/ARCHITECTURE.md`: 4-tier architectural overview, pipeline flowcharts, multi-tier evidentiary model.
- `docs/INSTALLATION.md`: Prerequisites, quick start with Docker, manual setup, and default demo credentials.
- `docs/ENV_SETUP.md`: Comprehensive dictionary of core, storage, network, and third-party API environment variables.
- `docs/API_DOCUMENTATION.md`: Complete REST API reference with request/response schemas, error codes, and headers.
- `docs/DATABASE_SCHEMA.md`: PostgreSQL 16 ER diagram, full schema data dictionary, indexes, constraints.
- `docs/TESTING.md`: Test suite inventory, command reference, coverage scope.
- `docs/DEPLOYMENT.md`: Production deployment guide, Nginx reverse proxy, SSL/TLS Let's Encrypt setup, backup cron schedule.
- `docs/EXTERNAL_APIS.md`: Catalog of third-party integrations, non-fabrication principle, honest fallback behaviors.
- `docs/SECURITY_REPORT.md`: Comprehensive security audit report covering OWASP Top 10 mitigations and certification.

---

## Phase 4: VERIFIED (2026-10-31)

### Phase 4 Dashboard, History, UX & Security Hardening Implemented

#### 1. Dashboard (Live Database Statistics)
- **Real-time stats from DB**: total verifications, supported, contradicted, unverified, mixed results — zero hardcoded values.
- **Verification type breakdown** (`byType`): text / URL / image / video counts via `GROUP BY type` query.
- **Status breakdown** (`byStatus`): completed / processing / pending / failed counts.
- **Recent activity**: last 8 verifications with verdict, type, timestamp, and `errorMessage` for failed items.
- **Saved report count**: live count from `saved_reports` table.
- **Frontend**: interactive stat cards linking to filtered history, type breakdown pills, confidence ratio bar, in-progress banner with pulse-dot animation, recent activity with failed/processing state rendering; `reloadKey` pattern to refresh on mount.

#### 2. Verification History
- **Filters**: status (`completed`/`processing`/`pending`/`failed`), verification type (`text`/`url`/`image`/`video`), verdict (`SUPPORTED`/`CONTRADICTED`/`UNVERIFIED`/`MIXED`), date range quick presets (Today / 7 days / 30 days).
- **Search**: full-text search on claim/content stored in result.
- **Sorting**: newest first, oldest first, confidence descending/ascending.
- **Pagination**: page-based with numbered page buttons, page size = 20.
- **Report viewing**: modal with full `VerificationResult` component for completed verifications; `FailedVerificationCard` for failed items with error message.
- **Deletion**: per-row delete with confirmation; user data isolation enforced (users can only delete their own records).
- **URL-synced state**: all filters/page/sort reflected in `useSearchParams` for bookmarkable URLs.
- **Server-side**: `GET /api/verifications` supports `search`, `type`, `verdict`, `status`, `dateFrom`, `dateTo`, `sort`, `page`, `limit`; parameterised SQL, no injection surface.

#### 3. Saved Reports Management
- **Full CRUD**: list, view, edit (PATCH title/notes), delete with ownership enforcement.
- **Search & filters**: title search, verdict filter, date range.
- **PDF download**: `GET /api/reports/:id/pdf` — PDFKit-generated document with header, verdict box, evidence tables, limitations, and recommendations.
- **Secure sharing**: cryptographically random 32-char base64url share tokens; share link revocation (`DELETE /api/reports/:id/share`); public viewer accessible without authentication.
- **Rate limiting**: `shareLimiter` (60 req / 15 min) applied to `GET /api/reports/shared/:token` to prevent token enumeration.
- **Edit modal**: inline title/notes editing with PATCH; audit-logged.
- **URL-synced state**: search/filter/page in `useSearchParams`.

#### 4. Profile & Settings
- **Profile editing**: display name, email update (persisted server-side).
- **Language preferences**: `defaultMode` (text/url/image/video), `autoSaveReports`, `emailAlerts` preferences stored per user.
- **Password management**: interactive strength checklist (length ≥ 8, letters, numbers, passwords match) with real-time validation; server-side argon2id re-hashing.
- **Session management**: list all active sessions with device/browser UA parsing; revoke individual sessions or all-other-sessions.
- **Account deletion**: cascading deletion of all user data with re-authentication confirmation.

#### 5. Application States
All pages implement the full state matrix:
- **Loading**: spinner with contextual label while data fetches.
- **Processing**: progress bar + pulse dot for in-flight verifications; polling with attempt counter.
- **Success**: toast notification + result render on completion.
- **Empty**: illustrated empty state with icon and call-to-action.
- **Validation error**: inline field errors with recovery hints.
- **Server error**: `ServerErrorState` component with retry button.
- **Unauthorized**: `UnauthorizedState` with login redirect.
- **Unsupported file**: `UnsupportedFileState` with accepted format list shown on extension mismatch before upload.
- **Failed verification**: `FailedVerificationCard` displaying error message and suggested next steps.

New reusable UI components added to `ui.jsx`:
`LoadingState`, `ProcessingState`, `ServerErrorState`, `ValidationErrorState`, `UnauthorizedState`, `UnsupportedFileState`, `FailedVerificationCard`.

#### 6. Security Hardening
- **Rate limiting**: `verifyLimiter` (60 req / 15 min) on all `/api/verify/*` endpoints; `shareLimiter` on public share token lookups; existing `authLimiter` and `passwordResetLimiter` retained.
- **File upload validation**: strict extension `fileFilter` (images: `.jpg .jpeg .png .webp`; video: `.mp4 .webm .mov .mkv .avi`); magic bytes server-side verification (unchanged from Phase 2); multer errors mapped to structured `AppError` responses (`file_too_large`, `unsupported_file`).
- **SQL injection prevention**: all new query parameters in `data.js` and `reports.js` use `$N` positional placeholders — no string interpolation.
- **XSS protection**: Helmet CSP retained; all user-input rendered via React (escaped by default); PDF output is binary download with `Content-Disposition: attachment`.
- **SSRF protection**: `safeFetch` DNS/IP checks remain intact; `shareLimiter` prevents automated token enumeration.
- **Path traversal prevention**: file IDs are UUIDs validated by the DB; no filesystem path is constructed from user input.
- **CORS**: same-origin check middleware on all mutating requests retained.
- **Audit logging**: `PATCH /api/reports/:id` edit calls `audit(userId, 'report_update', {reportId, title})`; existing auth audit events retained.
- **User data isolation**: all queries filter by `userId` extracted from the verified session; cross-user access returns 404/403.
- **Secure error handling**: production error responses omit stack traces; `AppError` codes are human-readable slugs without internal details.
- **Session security**: HttpOnly + SameSite=Lax + Secure-in-production cookies; session hashes stored (never raw tokens); individual and bulk session revocation.

#### 7. Performance & Responsiveness
- **Database indexes** (added to `schema.sql`):
  - `verification_requests_user_status_idx` on `(user_id, status)`
  - `verification_requests_user_type_idx` on `(user_id, type)`
  - `verification_results_req_verdict_idx` on `(request_id, verdict)`
  - `saved_reports_user_result_idx` on `(user_id, result_id)`
- **Efficient queries**: dashboard uses a single `GROUP BY` aggregate; history uses server-side filtering, sorting, and `LIMIT/OFFSET` pagination — no full table scans in JS.
- **Pagination**: all list endpoints cap at 20 records per page; page metadata (`total`, `page`, `totalPages`) returned in JSON.
- **Lazy loading**: frontend loads report PDFs and shared report details only on demand.
- **Responsive UI**: Phase 4 styles added — `.stat-card.clickable`, `.type-pills`, `.type-pill`, `.badge-processing`, `.badge-pending`, `.badge-failed`, `.pulse-dot`, `.pwd-checklist`, `.pwd-item`, `.drop-zone`, `.in-progress-banner` — all mobile-first.
- **Background job monitoring**: `byStatus.processing` count surfaced in dashboard in-progress banner.

### Test Verification Results
- Backend: **65 / 65 tests passing (100%)** via `npm test`:
  - `auth.test.js` (11/11): Authentication, sessions, argon2id, rate limiting, password reset.
  - `evidence.test.js` (6/6): Stance detection, source comparison, knowledge retrieval (EN/HI), integration status.
  - `media.test.js` (6/6): Image/video validation, magic bytes, EXIF, AI chunks, keyframes with timestamps.
  - `text.test.js` (9/9): Language detection, claim extraction, factuality scoring, Phase 3 verdicts (SUPPORTED/CONTRADICTED/MIXED), AI score separation.
  - `image.test.js` (5/5): Image verification, software signatures, AI generation tags, limitations, invalid file rejection.
  - `video.test.js` (3/3): Video verification, keyframe timestamps, editing encoder detection, corrupted video rejection.
  - `url.test.js` (5/5): SSRF protection, article extraction, clickbait detection, end-to-end verification.
  - `orchestrator.test.js` (4/4): Request lifecycle, sync/async modes, DB persistence, background jobs, failure handling.
  - `verify_routes.test.js` (5/5): HTTP API integration for text, url, image, video, and request status retrieval.
  - `phase3.test.js` (6/6): Evidence retrieval, wire syndication, evaluation engine, verdict categories, confidence assessment, report management, privacy, sharing, PDF, dispute, explanation.
  - **`phase4.test.js` (5/5 suites, 65 total tests)**:
    - Dashboard: real DB stats, `byType`, `byStatus`, recent activity with error messages.
    - Verification History: search, type/verdict/status/date filters, confidence sort, pagination, user isolation, deletion.
    - Saved Reports: CRUD + PATCH update, verdict/date filters, PDF, secure share token, revocation, deletion.
    - Profile & Settings: preferences persistence, session listing/revocation, password change, account deletion.
    - Security Hardening: same-origin enforcement, unsupported file rejection (extension + multer error), SSRF guard.
- Frontend: `npm run build` succeeds cleanly (**42 modules transformed, 0 errors**).

---

## Phase 3: VERIFIED (2026-10-31)

### Phase 3 Intelligence, Evidence Engine & Verdict System Implemented
- **Evidence Retrieval Engine (`EvidenceRetrievalEngine`)**:
  - Multi-tier source classification system:
    - Tier 1: Primary Official Publications (Statutory authorities, official gazettes, NASA, ISRO, WHO, CDC, IPCC).
    - Tier 2: Research Papers & Peer-Reviewed Literature (NEJM, Nature, Science, PubMed, academic universities).
    - Tier 3: Established News & Accredited Fact-Checkers (Reuters, AP, AFP, BBC, FactCheck.org, Snopes, The Hindu).
    - Tier 4: General Media & Secondary Sources.
  - Primary source prioritization: dynamically sorts Tier 1 and Tier 2 sources above secondary sources.
  - Source metadata extraction: title, URL, publisher, author, publication date, retrieval timestamp, authority score, quote/snippet, isPrimary, wireService.
  - URL de-duplication: normalizes URLs by stripping tracking queries (`utm_*`, `ref`, `fbclid`) to eliminate duplicate links.
  - Circular reporting & wire agency syndication identification: detects reprints from wire services (`Reuters`, `Associated Press`, `AFP`, `PTI`, `ANI`, `Bloomberg`). Flags clones with `isSyndicated: true` and `isIndependentConfirmation: false`, ensuring multiple sites repeating a single wire dispatch are never counted as separate independent confirmations.
  - External search integrations: Google Fact Check Tools API (`GOOGLE_FACTCHECK_API_KEY`) and open knowledge retrieval fallback with honest unconfigured / offline indicators.
  - Expanded curated knowledge base with bilingual English/Hindi empirical facts and debunked claims.

- **Evidence Evaluation Engine (`EvidenceEvaluationEngine`)**:
  - Strict architectural separation: kept independent from evidence retrieval and verdict generation.
  - Evidence partitioning: partitions collected evidence into `supporting`, `contradicting`, and `neutral` subsets.
  - Topical relevance evaluation: analyzes vocabulary overlap, cross-lingual entity matching (Devanagari <-> Latin terms), and morphological stemming.
  - Source independence examination: tallies unique independent publishers, tracks syndicated wire groups, and flags `isCircularReportingRisk` when multiple outlets only echo a single source.
  - Temporal analysis: extracts oldest and newest publication dates, computes temporal span, and evaluates evidence freshness.
  - Missing context extraction: identifies crucial context omitted in the claim (e.g. altitude boiling point physics, retracted study methodology, sample size).
  - Conflict identification: directly identifies factual contradictions between supporting and contradicting sources with detailed descriptions.
  - Limitations recording: transparently logs evidentiary caveats (e.g., absence of primary statutory docs, lack of publication timestamps, single-source reliance).
  - Sufficiency guard: preserves `hasSufficientEvidence: false` whenever independent corroboration does not meet institutional thresholds.

- **Verdict Generation Engine (`VerdictGenerationEngine`)**:
  - Implements four standard Phase 3 verdict categories:
    - **SUPPORTED**: Reliable available evidence supports the claim.
    - **CONTRADICTED**: Reliable available evidence conflicts with the claim.
    - **UNVERIFIED**: Available evidence is insufficient to establish the claim.
    - **MIXED**: Significant supporting and contradicting evidence exists.
  - Strict non-forcing rule: NEVER forces a verdict when evidence is insufficient; preserves `UNVERIFIED`.
  - Traceable evidentiary grounding: links every verdict directly to traceable sources with step-by-step reasoning and actionable recommended next steps.
  - Bilingual verdict generation in English and Hindi.

- **Confidence Assessment Service (`ConfidenceAssessmentService`)**:
  - Multi-dimensional evidence-based assessment across 6 distinct dimensions:
    1. Source Quality (Tier 1 official / Tier 2 academic vs Tier 3 news vs Tier 4 media).
    2. Evidence Relevance (Direct vs substantial vs partial topical correlation).
    3. Source Independence (Unique independent publishers vs circular wire reporting).
    4. Evidence Consistency (Unanimous consensus vs divergent conflict).
    5. Evidence Freshness (Temporal proximity of source publication dates).
    6. Information Availability (Depth and quantity of independent evidence corpus).
  - Qualitative confidence tiers: HIGH, MODERATE, LOW, INSUFFICIENT.
  - Explicit methodology notice: strictly enforces the rule that subjective AI tokens are never presented as statistically validated probabilities.

- **Results Interface (`VerificationResult.jsx`)**:
  - Original submitted content card displaying input text/media, submission type, submission timestamp, and clickable Verification ID pill.
  - Distinct verdict banner with standard Phase 3 styling for SUPPORTED, CONTRADICTED, UNVERIFIED, and MIXED.
  - Short explanation card with border accent.
  - Detailed step-by-step reasoning bullet points.
  - Dedicated partitioned sections for Supporting Evidence and Contradicting Evidence.
  - Rich evidence cards displaying source title, publisher, clickable external link, publication date, retrieval date, Source Tier badge, and syndication warning banner for wire reprints.
  - Multi-dimensional confidence grid visualizing all 6 dimensions with ratings and explanatory notes.
  - AI-generated content panel with burstiness and lexical diversity metrics, accompanied by a strict separation disclaimer.
  - Formatted limitations and actionable recommended next steps.

- **Report Management & Secure Sharing**:
  - Save reports: stores verification reports in `saved_reports` database table.
  - Copy report summaries: one-click plain-text and Markdown clipboard export.
  - Download reports as PDF: server-side PDFKit generation producing complete reports with headers, verdict boxes, confidence tables, evidence sources, limitations, and recommendations.
  - Secure report sharing: generates cryptographically secure unguessable 32-character tokens for public sharing without leaking private user accounts or other records. Includes instant share link revocation.
  - Public report viewer: `/report/:token` and `/shared/report/:token` routes accessible to unauthenticated users.
  - Delete reports: owners can delete saved reports with confirmation and instant library update.
  - Report incorrect results / Dispute system: `/api/verify/:id/dispute` records disputes with ratings, comments, and disputed claims in `user_feedback`.
  - Request additional explanations: `/api/verify/:id/explain` provides on-demand deep-dive methodology explanations and audit trails.
  - Privacy enforcement: strict ownership verification ensuring users can only access and manage their own private reports.

### Test Verification Results
- Backend: **60 / 60 tests passing (100%)** via `npm test`:
  - `auth.test.js` (11/11): Authentication, sessions, argon2id, rate limiting, password reset.
  - `evidence.test.js` (6/6): Stance detection, source comparison, knowledge retrieval (EN/HI), integration status.
  - `media.test.js` (6/6): Image/video validation, magic bytes, EXIF, AI chunks, keyframes with timestamps.
  - `text.test.js` (9/9): Language detection, claim extraction, factuality scoring, Phase 3 verdicts (SUPPORTED/CONTRADICTED/MIXED), AI score separation.
  - `image.test.js` (5/5): Image verification, software signatures, AI generation tags, limitations, invalid file rejection.
  - `video.test.js` (3/3): Video verification, keyframe timestamps, editing encoder detection, corrupted video rejection.
  - `url.test.js` (5/5): SSRF protection, article extraction, clickbait detection, end-to-end verification.
  - `orchestrator.test.js` (4/4): Request lifecycle, sync/async modes, DB persistence, background jobs, failure handling.
  - `verify_routes.test.js` (5/5): HTTP API integration for text, url, image, video, and request status retrieval.
  - `phase3.test.js` (6/6): Evidence retrieval prioritization, duplicate/wire syndication detection, evaluation engine, verdict generation (SUPPORTED/CONTRADICTED/UNVERIFIED/MIXED), 6-dimension confidence assessment, end-to-end report management, privacy enforcement, secure sharing, PDF generation, dispute submission, and deep explanation requests.
- Frontend: `npm run build` succeeds cleanly (**42 modules transformed, 0 errors**).

---

## Phase 2: VERIFIED (2026-10-31)

### Phase 2 Architecture & Services Implemented
- **Common Verification Architecture**:
  - `VerificationOrchestrator`: Coordinates text, image, video, and URL verification requests.
  - Uniform request structure: unique UUID request ID, user ID, submission type, processing status (`pending` -> `processing` -> `completed` / `failed`), timestamps, structured result, error details.
  - Background asynchronous task execution engine for resource-intensive media processing (e.g. video), with polling support via `GET /api/verify/:id`.
  - Database persistence: `verification_requests`, `verification_results`, `evidence_sources`, and `uploaded_files`.
- **Text & Claim Verification (`TextVerificationService`)**:
  - Text and long paragraph input support.
  - Language detection: supports English and Hindi (`en` and `hi`), Devanagari script tokenization.
  - Claim extraction: segments sentences, filters out subjective opinions, rhetorical questions, and conversational filler.
  - Factuality identification: detects factual assertion verbs, scientific/historical terms, dates, and quantitative entities.
  - Evidence search & retrieval: queries `EvidenceRetrievalService` for supporting and contradicting evidence sources.
  - Source comparison & verification reasoning: evaluates source authority, stance ratio, and generates step-by-step reasoning.
  - Verdicts: `verified_true`, `verified_false`, `partially_true`, `misleading`, `unverified`.
- **Image Verification (`ImageVerificationService`)**:
  - Supported formats: JPG, JPEG, PNG, WebP. Magic bytes verification and file corruption checks.
  - Metadata extraction using `exifr` (EXIF, IPTC, XMP, camera make/model, timestamps, GPS).
  - Manipulation detection: editing software signatures (Photoshop, GIMP, Canva, etc.), timestamp discrepancies, missing EXIF flags.
  - AI generation markers: detects Stable Diffusion generation parameters in PNG text chunks, Midjourney, and DALL-E tags.
  - Visual inconsistency analysis and aspect ratio checks.
  - Reverse image search integration: clearly reports unconfigured API status (`GOOGLE_VISION_API_KEY` / `REVERSE_IMAGE_API_KEY`) without simulating results.
  - Displays explicit limitations disclaimer when manipulation cannot be definitively established.
- **Video Verification (`VideoVerificationService`)**:
  - Supported formats: MP4, WebM, MOV, MKV, AVI. Container header and magic bytes validation.
  - Video stream metadata extraction using `ffprobe-static` (duration, container, codec, resolution, fps, bitrate).
  - Keyframe extraction using `ffmpeg-static` with exact timestamps in seconds and formatted time (`mm:ss.ms`).
  - Frame-by-frame visual inconsistency and scene continuity analysis.
  - Background processing: asynchronously processes video keyframes, updates DB status.
  - Deepfake / editing suite detection in stream encoder metadata.
- **Website & URL Verification (`URLVerificationService`)**:
  - URL submission and syntactic validation.
  - Robust SSRF protection: DNS resolution check, blocks all private/loopback/link-local/multicast/cloud metadata IPs (127.0.0.0/8, 10.0.0.0/8, 192.168.0.0/16, 172.16.0.0/12, 169.254.169.254, ::1, fe80::/10, fc00::/7, IPv4-mapped IPv6).
  - Redirect validation: enforces SSRF re-check on every hop, maximum 5 hops.
  - Safe outbound network restrictions: strict 10s timeout, 5MB body size streaming limit.
  - Article content extraction via `cheerio`: title, description, publisher, author, publication date, body text.
  - Website characteristic analysis: HTTPS, TLD reputation, clickbait headline indicators, word count.
  - Independent evidence comparison via claim verification.
- **AI-Generated Content Detection**:
  - Local statistical heuristics: sentence length variance (burstiness), vocabulary richness (TTR), repetitive n-grams.
  - Generative AI metadata tag checks (PNG chunks, container tags).
  - Strict architectural separation: AI detection scores are kept distinct and **never** independently determine factual accuracy.
- **Evidence Retrieval Integration (`EvidenceRetrievalService`)**:
  - Stance classification: `supports`, `contradicts`, `neutral`.
  - Authoritative reference baseline in English and Hindi for repeatable verification.
  - Google Fact Check Tools API integration slot (`GOOGLE_FACTCHECK_API_KEY`).
  - Transparently identifies unavailable external integrations without fabricating fake results.
- **Frontend Workspace & Results**:
  - Interactive verification workspace across all 4 modes (`/app/verify/text`, `/app/verify/image`, `/app/verify/video`, `/app/verify/url`).
  - Rich `VerificationResult` component: verdict badge, confidence meter, claims list, evidence cards with stances, keyframes gallery with timestamps, AI analysis panel with disclaimer, and limitations note.
  - History viewer with modal result inspection.
  - Saved reports integration.

### Test Verification Results
- Backend: **53 / 53 tests passing (100%)** via `npm test`:
  - `auth.test.js` (11/11): Authentication, sessions, argon2id, rate limiting, password reset.
  - `evidence.test.js` (6/6): Stance detection, source comparison, knowledge retrieval (EN/HI), integration status.
  - `media.test.js` (6/6): Image/video validation, magic bytes, EXIF, AI chunks, keyframes with timestamps.
  - `text.test.js` (9/9): Language detection (EN/HI), claim extraction, factuality scoring, reasoning, AI score separation.
  - `image.test.js` (5/5): Image verification, software signatures, AI generation tags, limitations, invalid file rejection.
  - `video.test.js` (3/3): Video verification, keyframe timestamps, editing encoder detection, corrupted video rejection.
  - `url.test.js` (5/5): SSRF protection (loopback, private, cloud metadata, protocols), article extraction, clickbait detection.
  - `orchestrator.test.js` (4/4): Request lifecycle, sync/async modes, DB persistence, background jobs, failure handling.
  - `verify_routes.test.js` (5/5): HTTP API integration for text, url, image, video, and request status retrieval.
- Frontend: `npm run build` succeeds cleanly (42 modules transformed, 0 errors).

---

## Phase 1: VERIFIED (2026-10-31)

### Verified on this machine
- `docker compose up -d` — PostgreSQL 16 up; `npm run migrate` — schema applied.
- `npm test` (backend) — **11/11 passing** against a disposable database:
  DB connectivity, registration, argon2id storage, duplicate email, weak password,
  protected routes, login/logout/session revocation, expired session, cross-origin block,
  password reset single-use + session revocation, no account enumeration,
  empty data for new accounts.
- `npm run build` (frontend) — production build succeeds (41 modules).
- Browser end-to-end at http://localhost:5173 with the API on :4000:
  - Registration → lands on protected `/app` dashboard with real zero counts from the database.
  - Login, logout (POST 204), and protected-route redirect to `/login` when signed out.
  - Session cookie verified: `GET /api/auth/me` returns the user after reload.
  - Verification workspace: all four tabs load (`text`, `image`, `video`, `url`), Verify is
    disabled and the page states the engine is not connected — no fabricated results.
  - History and Saved reports show empty states; Profile and Settings render.
  - Password reset end-to-end: request → dev log link → confirm → login with the new password.
  - Profile name change persisted server-side.
  - Public pages render: landing, About, How It Works, FAQ, Privacy, Terms.
  - Responsive drawer navigation works at a 439px viewport.

### Fixed during verification
- `backend/package.json` `test` script used `NODE_ENV=test …` and a bare directory argument,
  which fail under Windows cmd. Now `node --test "tests/*.test.js"` with `tests/env.js`
  setting `NODE_ENV=test` before config loads. Works via plain `npm test`.

### Environment notes
- The agent shell exports `PORT=0`; dotenv does not override pre-set variables, so the API
  bound to a random port until started with `PORT=4000`. Start the backend with `PORT=4000`
  if `PORT` is set in your shell; otherwise the `.env` default of 4000 applies.
- `backend/.env` was created from `.env.example`.

### Remaining for Phase 1
- Email delivery for password reset (external dependency: SMTP/email provider, to be wired
  into `routes/auth.js`; development writes the reset link to the server log).
- Frontend component tests.
- Account deletion / data export.
- Legal review of Privacy Policy and Terms (marked as drafts).

### Later phases
Verification engine, evidence retrieval, file upload handling, reports, feedback UI:
not started. The workspace shows an explicit "not connected" notice and produces no results.

---

## Original Phase 1 checklist

### Written
- Backend: Express API, env validation, pino logging, zod validation, central error handler,
  auth middleware, rate limiting, same-origin check on mutating requests, helmet.
- Auth: register, login, logout, session cookie (HttpOnly, SameSite=Lax, Secure in production),
  server-side sessions (hashed tokens), argon2id, password reset (hashed single-use tokens,
  revokes sessions), change password, profile update, audit logging.
- Schema: users, user_sessions, verification_requests, verification_results, uploaded_files,
  evidence_sources, saved_reports, user_feedback, audit_logs, plus password_reset_tokens.
- Frontend: all public pages, auth pages, dashboard, 4-tab verification workspace, history,
  saved reports, profile, settings; reusable button, field, modal, table, toast, spinner,
  error, empty and success components; responsive layouts; protected and guest routes.
