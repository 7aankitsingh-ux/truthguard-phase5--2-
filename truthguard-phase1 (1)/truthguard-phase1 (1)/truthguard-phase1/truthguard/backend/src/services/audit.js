import { query } from '../db.js';
import { logger } from '../logger.js';

export async function audit(userId, action, req, metadata = null) {
  try {
    await query('INSERT INTO audit_logs (user_id, action, ip, metadata) VALUES ($1, $2, $3, $4)', [
      userId, action, req.ip, metadata,
    ]);
  } catch (err) {
    logger.error({ err, action }, 'Audit log write failed');
  }
}
