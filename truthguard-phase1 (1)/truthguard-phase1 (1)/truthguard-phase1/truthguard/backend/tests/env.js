process.env.NODE_ENV = 'test';
if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost:5432')) {
  process.env.USE_MEMORY_DB = 'true';
}
