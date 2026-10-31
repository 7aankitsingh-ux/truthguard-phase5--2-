import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { query } from '../db.js';
import { AppError } from '../errors.js';
import { logger } from '../logger.js';
import { config, isProd } from '../config.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/security.js';
import { audit } from '../services/audit.js';
import { COOKIE, clearSessionCookie, createResetToken, createSession, revokeSession, sha256 } from '../services/sessions.js';

const router = Router();
const hashOptions = { type: argon2.argon2id };
const dummyHash = await argon2.hash('timing-equalizer', hashOptions);

const email = z.string().trim().toLowerCase().email().max(254);
const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Include at least one letter and one number');
const name = z.string().trim().min(1, 'Name is required').max(100);

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  preferredLanguage: u.preferred_language || 'en',
  preferences: u.preferences || {},
  createdAt: u.created_at,
});
const emailTaken = () => new AppError(409, 'email_taken', 'An account with this email already exists', { email: 'Email already registered' });

router.post('/register', authLimiter, validate(z.object({ email, name, password })), async (req, res, next) => {
  try {
    const exists = await query('SELECT 1 FROM users WHERE lower(email) = $1', [req.body.email]);
    if (exists.rowCount) throw emailTaken();
    const hash = await argon2.hash(req.body.password, hashOptions);
    const { rows } = await query(
      'INSERT INTO users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING id, email, name, role, created_at',
      [req.body.email, req.body.name, hash],
    );
    await createSession(res, rows[0].id, req);
    await audit(rows[0].id, 'auth.register', req);
    res.status(201).json({ user: publicUser(rows[0]) });
  } catch (err) {
    next(err.code === '23505' ? emailTaken() : err);
  }
});

router.post('/login', authLimiter, validate(z.object({ email, password: z.string().min(1).max(128) })), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM users WHERE lower(email) = $1', [req.body.email]);
    const user = rows[0];
    const ok = await argon2.verify(user?.password_hash ?? dummyHash, req.body.password);
    if (!user || !ok) {
      await audit(user?.id ?? null, 'auth.login_failed', req);
      throw new AppError(401, 'invalid_credentials', 'Incorrect email or password');
    }
    await createSession(res, user.id, req);
    await audit(user.id, 'auth.login', req);
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.[COOKIE];
    if (token) await revokeSession(token);
    clearSessionCookie(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch(
  '/me',
  requireAuth,
  validate(
    z.object({
      name: name.optional(),
      preferredLanguage: z.enum(['en', 'hi']).optional(),
      preferences: z.record(z.any()).optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const updates = [];
      const values = [];
      let idx = 1;

      if (req.body.name !== undefined) {
        updates.push(`name = $${idx++}`);
        values.push(req.body.name);
      }
      if (req.body.preferredLanguage !== undefined) {
        updates.push(`preferred_language = $${idx++}`);
        values.push(req.body.preferredLanguage);
      }
      if (req.body.preferences !== undefined) {
        updates.push(`preferences = $${idx++}`);
        values.push(JSON.stringify(req.body.preferences));
      }

      if (updates.length === 0) {
        return res.json({ user: publicUser(req.user) });
      }

      updates.push(`updated_at = now()`);
      values.push(req.user.id);

      const { rows } = await query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}
         RETURNING id, email, name, role, preferred_language, preferences, created_at`,
        values
      );
      await audit(req.user.id, 'auth.profile_update', req, { updatedFields: Object.keys(req.body) });
      res.json({ user: publicUser(rows[0]) });
    } catch (err) {
      next(err);
    }
  }
);

router.get('/sessions', requireAuth, async (req, res, next) => {
  try {
    const currentTokenHash = sha256(req.sessionToken);
    const { rows } = await query(
      `SELECT id, ip, user_agent, created_at, expires_at,
              (token_hash = $1) AS is_current
       FROM user_sessions
       WHERE user_id = $2 AND revoked_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC`,
      [currentTokenHash, req.user.id]
    );
    res.json({
      sessions: rows.map((r) => ({
        id: r.id,
        ip: r.ip,
        userAgent: r.user_agent,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        isCurrent: Boolean(r.is_current),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/sessions/:id', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE user_sessions SET revoked_at = now()
       WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
       RETURNING id, (token_hash = $3) AS is_current`,
      [req.params.id, req.user.id, sha256(req.sessionToken)]
    );
    if (rows.length === 0) {
      throw new AppError(404, 'not_found', 'Session not found');
    }
    await audit(req.user.id, 'auth.session_revoked', req, { sessionId: req.params.id });
    if (rows[0].is_current) {
      clearSessionCookie(res);
    }
    res.json({ revoked: true, id: req.params.id });
  } catch (err) {
    next(err);
  }
});

router.delete('/sessions', requireAuth, async (req, res, next) => {
  try {
    const currentTokenHash = sha256(req.sessionToken);
    const { rowCount } = await query(
      `UPDATE user_sessions SET revoked_at = now()
       WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL`,
      [req.user.id, currentTokenHash]
    );
    await audit(req.user.id, 'auth.other_sessions_revoked', req, { count: rowCount });
    res.json({ revokedCount: rowCount });
  } catch (err) {
    next(err);
  }
});

router.delete(
  '/me',
  requireAuth,
  validate(z.object({ password: z.string().min(1, 'Password confirmation is required') })),
  async (req, res, next) => {
    try {
      const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      if (!rows[0] || !(await argon2.verify(rows[0].password_hash, req.body.password))) {
        throw new AppError(400, 'wrong_password', 'Password is required to confirm account deletion', {
          password: 'Password is incorrect',
        });
      }
      await audit(req.user.id, 'auth.account_deleted', req);
      clearSessionCookie(res);
      await query('DELETE FROM users WHERE id = $1', [req.user.id]);
      res.json({ deleted: true });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/change-password',
  requireAuth,
  validate(z.object({ currentPassword: z.string().min(1).max(128), newPassword: password })),
  async (req, res, next) => {
    try {
      const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
      if (!(await argon2.verify(rows[0].password_hash, req.body.currentPassword))) {
        throw new AppError(400, 'wrong_password', 'Current password is incorrect', { currentPassword: 'Incorrect password' });
      }
      await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
        await argon2.hash(req.body.newPassword, hashOptions), req.user.id,
      ]);
      await query('UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL', [
        req.user.id, sha256(req.sessionToken),
      ]);
      await audit(req.user.id, 'auth.password_change', req);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  },
);

router.post('/password-reset/request', authLimiter, validate(z.object({ email })), async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id FROM users WHERE lower(email) = $1', [req.body.email]);
    if (rows[0]) {
      const token = await createResetToken(rows[0].id);
      await audit(rows[0].id, 'auth.password_reset_requested', req);
      if (!isProd) logger.warn(`Password reset link (dev only, no mail transport configured): ${config.CLIENT_ORIGIN}/reset-password?token=${token}`);
    }
    res.json({ message: 'If an account exists for that email, a reset link has been issued.' });
  } catch (err) {
    next(err);
  }
});

router.post('/password-reset/confirm', authLimiter, validate(z.object({ token: z.string().min(20).max(200), password })), async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE password_reset_tokens SET used_at = now()
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now() RETURNING user_id`,
      [sha256(req.body.token)],
    );
    if (!rows[0]) throw new AppError(400, 'invalid_token', 'This reset link is invalid or has expired');
    await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [
      await argon2.hash(req.body.password, hashOptions), rows[0].user_id,
    ]);
    await query('UPDATE user_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [rows[0].user_id]);
    await audit(rows[0].user_id, 'auth.password_reset_completed', req);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
