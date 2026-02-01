import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const migrationsDir = path.resolve(__dirname, '../../../migrations');
  const files = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const f of files) {
    const sql = await fs.readFile(path.join(migrationsDir, f), 'utf8');
    console.log('Applying migration', f);
    await pool.query(sql);
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
