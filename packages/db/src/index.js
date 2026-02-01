import pg from 'pg';
const { Pool } = pg;

export function getPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set');
  }
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export const pool = getPool();

pool.on('error', (err) => {
  console.error('pg pool error:', err);
});