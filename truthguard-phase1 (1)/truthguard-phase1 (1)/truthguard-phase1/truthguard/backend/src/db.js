import pg from 'pg';
import { config } from './config.js';

let poolInstance;

if (process.env.USE_MEMORY_DB === 'true' || config.DATABASE_URL?.startsWith('memory://')) {
  const { newDb } = await import('pg-mem');
  const crypto = await import('crypto');
  const db = newDb();
  db.public.registerFunction({
    name: 'gen_random_uuid',
    impure: true,
    implementation: () => crypto.randomUUID(),
  });
  const pgMem = db.adapters.createPg();
  poolInstance = new pgMem.Pool();
} else {
  poolInstance = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });
}

export const pool = poolInstance;
export const query = (text, params) => pool.query(text, params);
