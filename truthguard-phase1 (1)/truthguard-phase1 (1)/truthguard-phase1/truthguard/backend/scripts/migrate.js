import { readFileSync } from 'node:fs';
import { pool } from '../src/db.js';

const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
await pool.query(sql);
console.log('Schema applied');
await pool.end();
