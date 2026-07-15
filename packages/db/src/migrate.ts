import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

import { createPool } from './client.js';

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const pool = createPool();

try {
  await migrate(drizzle(pool), { migrationsFolder });
  console.info('Database migrations completed');
} finally {
  await pool.end();
}
