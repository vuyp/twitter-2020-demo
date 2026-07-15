import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';

import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;

export function createPool(
  connectionString = process.env.DATABASE_URL,
  options: Omit<PoolConfig, 'connectionString'> = {},
) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to connect to PostgreSQL');
  }

  return new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...options,
  });
}

export function createDb(connection: string | Pool = requireDatabaseUrl()): Database {
  const pool = typeof connection === 'string' ? createPool(connection) : connection;
  return drizzle(pool, { schema });
}

let defaultPool: Pool | undefined;
let defaultDb: Database | undefined;

function requireDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to connect to PostgreSQL');
  }
  return connectionString;
}

export function getPool(): Pool {
  defaultPool ??= createPool();
  return defaultPool;
}

export function getDb(): Database {
  defaultDb ??= drizzle(getPool(), { schema });
  return defaultDb;
}

/**
 * Lazily resolves the default database so importing schema-backed modules during
 * builds does not require a live DATABASE_URL.
 */
export const db = new Proxy({} as Database, {
  get(_target, property) {
    const target = getDb();
    const value: unknown = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

export async function closeDb() {
  const pool = defaultPool;
  defaultDb = undefined;
  defaultPool = undefined;
  if (pool) {
    await pool.end();
  }
}
