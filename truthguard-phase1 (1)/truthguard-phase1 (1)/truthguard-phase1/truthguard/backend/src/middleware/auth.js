import { query } from '../db.js';
import { AppError } from '../errors.js';
import { COOKIE, sha256 } from '../services/sessions.js';

export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) throw new AppError(401, 'unauthenticated', 'Authentication required');
    const { rows } = await query(
      `SELECT u.id, u.email, u.name, u.role, u.created_at
       FROM user_sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
      [sha256(token)],
    );
    if (!rows[0]) throw new AppError(401, 'unauthenticated', 'Session expired or invalid');
    req.user = rows[0];
    req.sessionToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

export const requireRole = (role) => (req, res, next) =>
  req.user?.role === role ? next() : next(new AppError(403, 'forbidden', 'Insufficient permissions'));
