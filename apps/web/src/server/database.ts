import type { PoolClient, QueryResultRow } from 'pg';
import { authPool } from './auth';

export async function query<T extends QueryResultRow>(
  text: string,
  values: ReadonlyArray<unknown> = [],
): Promise<T[]> {
  const result = await authPool.query<T>(text, [...values]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow>(
  text: string,
  values: ReadonlyArray<unknown> = [],
): Promise<T | null> {
  const rows = await query<T>(text, values);
  return rows[0] ?? null;
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await authPool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
