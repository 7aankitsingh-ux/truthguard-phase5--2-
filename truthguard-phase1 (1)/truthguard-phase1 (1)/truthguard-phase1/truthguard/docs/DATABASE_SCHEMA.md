# TruthGuard AI — Database Schema & Data Dictionary

TruthGuard utilizes **PostgreSQL 16** with strict foreign keys, cascade constraints, check constraints, and performance indexes.

---

## 1. Entity-Relationship Diagram (ERD)

```
       +-----------------------+
       |         users         |
       +-----------------------+
       | id (PK, UUID)         |<------------+
       | email (UQ, CI)        |             |
       | password_hash         |             |
       | preferred_language    |             |
       | preferences (JSONB)   |             |
       +-----------------------+             |
           |             |                   |
    1:N    |         1:N |               1:N |
           v             v                   v
+-------------------+ +------------------+ +-----------------------+
|   user_sessions   | | password_resets  | | verification_requests |
+-------------------+ +------------------+ +-----------------------+
| id (PK, UUID)     | | id (PK, UUID)    | | id (PK, UUID)         |
| user_id (FK)      | | user_id (FK)     | | user_id (FK)          |
| token_hash (UQ)   | | token_hash (UQ)  | | type (text/img/vid/url|
| expires_at        | | expires_at       | | status (pending/...   |
+-------------------+ +------------------+ +-----------------------+
                                                     |
                                                 1:1 |
                                                     v
+------------------+                       +-----------------------+
|  uploaded_files  |                       |  verification_results |
+------------------+                       +-----------------------+
| id (PK, UUID)    |                       | id (PK, UUID)         |
| request_id (FK)  |                       | request_id (FK, UQ)   |
| storage_key (UQ) |                       | verdict (SUPPORTED... |
| sha256 (Hash)    |                       | confidence (numeric)  |
+------------------+                       | model_info (JSONB)    |
                                           +-----------------------+
                                               |               |
                                           1:N |           1:N |
                                               v               v
                                    +------------------+ +----------------+
                                    | evidence_sources | | saved_reports  |
                                    +------------------+ +----------------+
                                    | id (PK, UUID)    | | id (PK, UUID)  |
                                    | result_id (FK)   | | user_id (FK)   |
                                    | url              | | result_id (FK) |
                                    | stance           | | share_token(UQ)|
                                    +------------------+ +----------------+
```

---

## 2. Table Definitions

### `users`
Stores user identity, role, and encrypted credentials.
- `id`: UUID (Primary Key, default `gen_random_uuid()`)
- `email`: TEXT (Case-insensitive unique index on `lower(email)`)
- `name`: TEXT (User display name)
- `password_hash`: TEXT (Argon2id password hash)
- `role`: TEXT (CHECK: `user` or `admin`, default `user`)
- `preferred_language`: TEXT (Default `en`)
- `preferences`: JSONB (Stores client preferences such as `defaultMode`, `autoSaveReports`)
- `created_at`, `updated_at`: TIMESTAMPTZ

### `user_sessions`
Active and historical authenticated sessions.
- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key -> `users(id)` ON DELETE CASCADE)
- `token_hash`: TEXT (SHA-256 hash of session token, UNIQUE)
- `ip`: TEXT (Client IP address)
- `user_agent`: TEXT (User Agent string)
- `expires_at`: TIMESTAMPTZ
- `revoked_at`: TIMESTAMPTZ (Populated on logout or remote session revocation)

### `verification_requests`
Primary record of all verification inquiries submitted by users.
- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key -> `users(id)` ON DELETE CASCADE)
- `type`: TEXT (CHECK: `text`, `image`, `video`, `url`)
- `input_text`: TEXT (Submitted claim or paragraph text)
- `input_url`: TEXT (Submitted article URL)
- `status`: TEXT (CHECK: `pending`, `processing`, `completed`, `failed`)
- `error_message`: TEXT (Failure reason if processing halted)
- `created_at`, `updated_at`: TIMESTAMPTZ

### `verification_results`
Evaluated factual verdicts and quantitative confidence ratings.
- `id`: UUID (Primary Key)
- `request_id`: UUID (Foreign Key -> `verification_requests(id)` ON DELETE CASCADE, UNIQUE)
- `verdict`: TEXT (`SUPPORTED`, `CONTRADICTED`, `UNVERIFIED`, `MIXED`, etc.)
- `confidence`: NUMERIC(5,4) (CHECK: `confidence >= 0 AND confidence <= 1`)
- `summary`: TEXT (Brief synthesis explanation)
- `model_info`: JSONB (Complete structured result, including keyframes, AI heuristics, claims)
- `created_at`: TIMESTAMPTZ

### `evidence_sources`
Traceable external documentary evidence associated with results.
- `id`: UUID (Primary Key)
- `result_id`: UUID (Foreign Key -> `verification_results(id)` ON DELETE CASCADE)
- `url`: TEXT (Canonical URL stripped of tracking parameters)
- `title`: TEXT (Document or article title)
- `publisher`: TEXT (Publishing authority or institution)
- `stance`: TEXT (CHECK: `supports`, `contradicts`, `neutral`)
- `retrieved_at`: TIMESTAMPTZ

### `saved_reports`
User library of saved and shared reports.
- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key -> `users(id)` ON DELETE CASCADE)
- `result_id`: UUID (Foreign Key -> `verification_results(id)` ON DELETE CASCADE)
- `title`: TEXT (Report title, editable by owner)
- `share_token`: TEXT (Cryptographic 32-character random token, UNIQUE)
- `is_public`: BOOLEAN (Toggle for public web sharing)
- `notes`: TEXT (User research annotations)
- `created_at`: TIMESTAMPTZ
- *Constraint*: `UNIQUE (user_id, result_id)` prevents duplicate bookmarks

### `uploaded_files`
Media file tracking for images and videos.
- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key -> `users(id)` ON DELETE CASCADE)
- `request_id`: UUID (Foreign Key -> `verification_requests(id)` ON DELETE SET NULL)
- `original_name`: TEXT
- `mime_type`: TEXT
- `size_bytes`: BIGINT (CHECK: `>= 0`)
- `storage_key`: TEXT (UUID storage path, UNIQUE)
- `sha256`: TEXT (SHA-256 file checksum)
- `created_at`: TIMESTAMPTZ

### `user_feedback`
Disputes, corrections, and satisfaction ratings.
- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key -> `users(id)` ON DELETE CASCADE)
- `result_id`: UUID (Foreign Key -> `verification_results(id)` ON DELETE CASCADE)
- `rating`: SMALLINT (CHECK: `BETWEEN 1 AND 5`)
- `comment`: TEXT
- `disputed_claim`: TEXT
- `status`: TEXT (Default `submitted`)
- `created_at`: TIMESTAMPTZ

### `audit_logs`
Security and administrative event tracking.
- `id`: UUID (Primary Key)
- `user_id`: UUID (Foreign Key -> `users(id)` ON DELETE SET NULL)
- `action`: TEXT (Event type: `auth.login`, `verification.submit`, `report.update`, etc.)
- `ip`: TEXT
- `details`: JSONB
- `created_at`: TIMESTAMPTZ

---

## 3. Database Indexes

- `users_email_lower_uq`: `UNIQUE (lower(email))`
- `verification_requests_user_created_idx`: `(user_id, created_at DESC)`
- `verification_requests_status_idx`: `(status)`
- `verification_requests_type_idx`: `(type)`
- `saved_reports_share_token_idx`: `(share_token)`
- `saved_reports_user_created_idx`: `(user_id, created_at DESC)`
- `evidence_sources_result_idx`: `(result_id)`
- `uploaded_files_sha_idx`: `(sha256)`
