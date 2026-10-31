CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  preferred_language text DEFAULT 'en',
  preferences jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'en';
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences jsonb DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));

CREATE TABLE IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_idx ON user_sessions (expires_at);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_user_idx ON password_reset_tokens (user_id);

CREATE TABLE IF NOT EXISTS verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('text','image','video','url')),
  input_text text,
  input_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE verification_requests ADD COLUMN IF NOT EXISTS error_message text;
CREATE INDEX IF NOT EXISTS verification_requests_user_created_idx ON verification_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS verification_requests_status_idx ON verification_requests (status);
CREATE INDEX IF NOT EXISTS verification_requests_type_idx ON verification_requests (type);

CREATE TABLE IF NOT EXISTS verification_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES verification_requests(id) ON DELETE CASCADE,
  verdict text NOT NULL,
  confidence numeric(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  summary text,
  model_info jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_results_verdict_idx ON verification_results (verdict);

CREATE TABLE IF NOT EXISTS uploaded_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id uuid REFERENCES verification_requests(id) ON DELETE SET NULL,
  original_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  storage_key text NOT NULL UNIQUE,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS uploaded_files_user_idx ON uploaded_files (user_id);
CREATE INDEX IF NOT EXISTS uploaded_files_request_idx ON uploaded_files (request_id);
CREATE INDEX IF NOT EXISTS uploaded_files_sha_idx ON uploaded_files (sha256);

CREATE TABLE IF NOT EXISTS evidence_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES verification_results(id) ON DELETE CASCADE,
  url text NOT NULL,
  title text,
  publisher text,
  stance text CHECK (stance IN ('supports','contradicts','neutral')),
  retrieved_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS evidence_sources_result_idx ON evidence_sources (result_id);
CREATE INDEX IF NOT EXISTS evidence_sources_stance_idx ON evidence_sources (stance);

CREATE TABLE IF NOT EXISTS saved_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  result_id uuid NOT NULL REFERENCES verification_results(id) ON DELETE CASCADE,
  title text NOT NULL,
  share_token text UNIQUE,
  is_public boolean DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, result_id)
);
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS share_token text UNIQUE;
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;
ALTER TABLE saved_reports ADD COLUMN IF NOT EXISTS notes text;
CREATE INDEX IF NOT EXISTS saved_reports_share_token_idx ON saved_reports (share_token);
CREATE INDEX IF NOT EXISTS saved_reports_user_created_idx ON saved_reports (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  result_id uuid NOT NULL REFERENCES verification_results(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  disputed_claim text,
  status text DEFAULT 'submitted',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE user_feedback ADD COLUMN IF NOT EXISTS disputed_claim text;
ALTER TABLE user_feedback ADD COLUMN IF NOT EXISTS status text DEFAULT 'submitted';
CREATE INDEX IF NOT EXISTS user_feedback_result_idx ON user_feedback (result_id);
CREATE INDEX IF NOT EXISTS user_feedback_user_idx ON user_feedback (user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  ip text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_user_idx ON audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action);

-- Phase 4 Performance Indexes
CREATE INDEX IF NOT EXISTS verification_requests_user_status_idx ON verification_requests (user_id, status);
CREATE INDEX IF NOT EXISTS verification_requests_user_type_idx ON verification_requests (user_id, type);
CREATE INDEX IF NOT EXISTS verification_results_req_verdict_idx ON verification_results (request_id, verdict);
CREATE INDEX IF NOT EXISTS saved_reports_user_result_idx ON saved_reports (user_id, result_id);

