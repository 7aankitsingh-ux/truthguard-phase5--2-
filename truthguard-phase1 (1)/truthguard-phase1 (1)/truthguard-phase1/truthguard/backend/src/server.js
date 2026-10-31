import fs from 'node:fs';
import argon2 from 'argon2';
import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { pool, query } from './db.js';

if (process.env.USE_MEMORY_DB === 'true' || config.DATABASE_URL?.startsWith('memory://')) {
  try {
    const schemaSql = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    await pool.query(schemaSql);
  } catch (err) {
    logger.debug({ err: err.message }, 'In-memory schema init');
  }
}

await pool.query('SELECT 1');

try {
  const { rows } = await query('SELECT count(*)::int as count FROM users');
  const count = Array.isArray(rows[0]?.count) ? Number(rows[0].count[0]) : Number(rows[0]?.count ?? 0);
  if (count === 0) {
    const hash = await argon2.hash('correct-horse-9');
    await query(
      `INSERT INTO users (email, name, password_hash)
       VALUES ('demo@truthguard.ai', 'Demo User', $1)
       ON CONFLICT DO NOTHING`,
      [hash]
    );
    logger.info('Demo user available: demo@truthguard.ai (password: correct-horse-9)');
  }
} catch (seedErr) {
  logger.debug({ err: seedErr.message }, 'Demo user seeding skipped');
}

const server = createApp().listen(config.PORT, () => logger.info(`API listening on :${config.PORT}`));

const shutdown = () => server.close(() => pool.end().then(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
