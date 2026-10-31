import { createHash, randomBytes } from 'node:crypto';
import { query } from '../db.js';
import { config, isProd } from '../config.js';

export const COOKIE = 'tg_session';
export const sha256 = (v) => createHash('sha256').update(v).digest('hex');

const cookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
  maxAge: config.SESSION_TTL_HOURS * 3600 * 1000,
});

export async function createSession(res, userId, req) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_HOURS * 3600 * 1000);
  await query(
    `INSERT INTO user_sessions (user_id, token_hash, ip, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, sha256(token), req.ip, (req.get('user-agent') || '').slice(0, 255), expiresAt],
  );
  res.cookie(COOKIE, token, cookieOptions());
}

export async function revokeSession(token) {
  await query('UPDATE user_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(token)]);
}

export const clearSessionCookie = (res) => res.clearCookie(COOKIE, { ...cookieOptions(), maxAge: undefined });

export async function createResetToken(userId) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 3600 * 1000);
  await query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [userId, sha256(token), expiresAt],
  );
  return token;
}
