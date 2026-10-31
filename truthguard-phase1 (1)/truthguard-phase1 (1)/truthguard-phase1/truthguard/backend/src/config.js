import 'dotenv/config';
import path from 'node:path';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(168),
  STORAGE_DIR: z.string().default(path.resolve(process.cwd(), 'uploads')),
  MAX_FILE_SIZE_MB: z.coerce.number().positive().default(50),
  EXTERNAL_SEARCH_API_KEY: z.string().optional().default(''),
  GOOGLE_FACTCHECK_API_KEY: z.string().optional().default(''),
  REVERSE_IMAGE_API_KEY: z.string().optional().default(''),
  EXTERNAL_AI_DETECTOR_API_KEY: z.string().optional().default(''),
  FETCH_TIMEOUT_MS: z.coerce.number().positive().default(10000),
  MAX_WEBPAGE_BYTES: z.coerce.number().positive().default(5 * 1024 * 1024),
});

export const config = schema.parse(process.env);
export const isProd = config.NODE_ENV === 'production';
