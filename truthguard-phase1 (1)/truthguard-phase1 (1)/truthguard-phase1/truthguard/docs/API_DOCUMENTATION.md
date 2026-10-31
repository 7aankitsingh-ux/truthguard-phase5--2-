# TruthGuard AI — REST API Documentation

Base URL: `/api`

All mutating endpoints (`POST`, `PATCH`, `DELETE`) require a valid `Origin` header matching `CLIENT_ORIGIN` to prevent Cross-Site Request Forgery (CSRF).

Authentication is handled via HttpOnly session cookies set upon login or registration.

---

## 1. System & Health

### `GET /api/health`
Checks database connectivity and server readiness.

- **Auth Required**: No
- **Response `200 OK`**:
```json
{
  "status": "ok"
}
```

---

## 2. Authentication (`/api/auth`)

### `POST /api/auth/register`
Creates a new user account and sets a session cookie.

- **Auth Required**: No
- **Request Body**:
```json
{
  "email": "user@example.com",
  "name": "Jane Doe",
  "password": "SecurePassword123!"
}
```
- **Response `201 Created`**:
```json
{
  "user": {
    "id": "c7a8b9e0-1234-4567-89ab-cdef01234567",
    "email": "user@example.com",
    "name": "Jane Doe",
    "role": "user"
  }
}
```

### `POST /api/auth/login`
Authenticates existing user and generates a session.

- **Auth Required**: No
- **Request Body**:
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```
- **Response `200 OK`**: User profile object and `Set-Cookie` header.

### `POST /api/auth/logout`
Revokes active session and clears the cookie.

- **Auth Required**: Yes
- **Response `204 No Content`**

### `GET /api/auth/me`
Returns current authenticated user profile.

- **Auth Required**: Yes
- **Response `200 OK`**: User object.

### `PATCH /api/auth/me`
Updates user profile settings (name, email, language preference).

- **Auth Required**: Yes
- **Request Body**:
```json
{
  "name": "Updated Name",
  "preferred_language": "hi",
  "preferences": {
    "defaultMode": "text",
    "autoSaveReports": true
  }
}
```

### `POST /api/auth/change-password`
Updates password after verifying the old password.

- **Auth Required**: Yes
- **Request Body**:
```json
{
  "oldPassword": "CurrentPassword123!",
  "newPassword": "NewStrongPassword456!"
}
```

---

## 3. Verification Services (`/api/verify`)

### `POST /api/verify/text`
Submits text or claims for fact-checking and evidence evaluation.

- **Auth Required**: Yes
- **Request Body**:
```json
{
  "text": "Water boils at 100 degrees Celsius under standard atmospheric pressure."
}
```
- **Response `200 OK`**:
```json
{
  "id": "req-uuid",
  "userId": "user-uuid",
  "type": "text",
  "status": "completed",
  "resultId": "res-uuid",
  "result": {
    "verdict": "SUPPORTED",
    "confidence": 0.95,
    "shortExplanation": "Reliable scientific publications confirm that pure water boils at 100°C under 1 atm.",
    "detailedReasoning": [ ... ],
    "claims": [ ... ],
    "evidenceSources": [
      {
        "url": "https://physics.nist.gov/constants",
        "title": "NIST Reference Constants",
        "publisher": "NIST",
        "tier": 1,
        "stance": "supports"
      }
    ],
    "confidenceAssessment": {
      "overallTier": "HIGH",
      "compositeScore": 0.95,
      "dimensions": { ... }
    },
    "aiDetection": { ... }
  }
}
```

### `POST /api/verify/url`
Retrieves and fact-checks an online news article with strict SSRF protection.

- **Auth Required**: Yes
- **Request Body**:
```json
{
  "url": "https://reputable-news.com/article/scientific-breakthrough"
}
```

### `POST /api/verify/image`
Uploads image for EXIF inspection, manipulation detection, and synthetic AI markers.

- **Auth Required**: Yes
- **Content-Type**: `multipart/form-data`
- **Field**: `image` (JPEG, PNG, WebP — max 25MB)

### `POST /api/verify/video`
Submits video for asynchronous frame extraction and deepfake analysis.

- **Auth Required**: Yes
- **Content-Type**: `multipart/form-data`
- **Field**: `video` (MP4, WebM, MOV, MKV, AVI — max 50MB)
- **Response `202 Accepted`**:
```json
{
  "id": "video-req-uuid",
  "status": "processing",
  "isAsync": true,
  "message": "Verification task submitted and is running in the background."
}
```

### `GET /api/verify/:id`
Retrieves real-time status and full results of a verification request.

- **Auth Required**: Yes (enforces user data isolation)
- **Response `200 OK`**: Full request and result object.

### `POST /api/verify/:id/explain`
Requests deeper methodology breakdown and reasoning steps on demand.

- **Auth Required**: Yes

### `POST /api/verify/:id/dispute`
Submits user dispute or correction request for a verification verdict.

- **Auth Required**: Yes
- **Request Body**:
```json
{
  "rating": 2,
  "comment": "New peer-reviewed study published yesterday updates this finding.",
  "disputedClaim": "Boiling point at high altitudes"
}
```

---

## 4. Reports & History (`/api/reports` & `/api/verifications`)

### `GET /api/dashboard`
Returns live database-driven statistics and recent activity for the user.

- **Auth Required**: Yes

### `GET /api/verifications`
Returns paginated, searchable history of verifications with filters (`type`, `verdict`, `status`, `sort`, `page`).

- **Auth Required**: Yes

### `DELETE /api/verifications/:id`
Deletes a verification request and cascades deletion of its result.

- **Auth Required**: Yes

### `POST /api/reports`
Saves a verification report to the user's permanent library.

- **Auth Required**: Yes
- **Request Body**:
```json
{
  "resultId": "res-uuid",
  "title": "Investigation Report #104",
  "notes": "Verified against NIST and WHO archives."
}
```

### `GET /api/reports`
Lists user's saved reports with search and pagination.

- **Auth Required**: Yes

### `PATCH /api/reports/:id`
Updates title or private notes of a saved report.

- **Auth Required**: Yes

### `DELETE /api/reports/:id`
Deletes a saved report.

- **Auth Required**: Yes

### `POST /api/reports/:id/share`
Generates a cryptographically unguessable public share token for the report.

- **Auth Required**: Yes
- **Response `200 OK`**:
```json
{
  "shareToken": "random-base64url-token-string",
  "shareUrl": "/report/random-base64url-token-string",
  "isPublic": true
}
```

### `DELETE /api/reports/:id/share`
Revokes public sharing access immediately.

- **Auth Required**: Yes

### `GET /api/reports/shared/:shareToken`
Public viewer endpoint for shared reports. Rate-limited to prevent token scanning.

- **Auth Required**: No

### `GET /api/reports/:id/pdf`
Generates and downloads a clean, publication-ready PDF report document.

- **Auth Required**: Yes
- **Response `200 OK`**: `Content-Type: application/pdf` with binary download.
