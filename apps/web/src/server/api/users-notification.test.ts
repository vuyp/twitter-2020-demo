import { Pool, type PoolClient } from 'pg';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { insertNotification } from './users';

describe('insertNotification', () => {
  it('does not create notifications for actions on your own account or Tweet', async () => {
    const query = vi.fn();
    const client = { query } as unknown as PoolClient;

    await insertNotification(client, 'user-1', 'user-1', 'like', '1', 'like:1:user-1');

    expect(query).not.toHaveBeenCalled();
  });
});

const databaseUrl = process.env.DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('insertNotification PostgreSQL integration', () => {
  const pool = new Pool({ connectionString: databaseUrl });

  afterAll(async () => {
    await pool.end();
  });

  it('stores typed events and applies the recipient notification preference', async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const client = await pool.connect();
    const recipientId = `notification-recipient-${suffix}`;
    const actorId = `notification-actor-${suffix}`;

    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (id, name, email) VALUES ($1, 'Recipient', $2), ($3, 'Actor', $4)`,
        [recipientId, `${recipientId}@example.test`, actorId, `${actorId}@example.test`],
      );
      await client.query(
        `INSERT INTO user_settings (user_id, notification_likes, notification_follows)
         VALUES ($1, false, true)`,
        [recipientId],
      );

      await insertNotification(client, recipientId, actorId, 'like', null, `like:${suffix}`);
      await insertNotification(client, recipientId, actorId, 'follow', null, `follow:${suffix}`);

      const result = await client.query<{ type: string }>(
        'SELECT type::text AS type FROM notifications WHERE recipient_id = $1 ORDER BY id',
        [recipientId],
      );
      expect(result.rows).toEqual([{ type: 'follow' }]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
