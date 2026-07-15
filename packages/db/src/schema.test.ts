import { readFileSync, readdirSync } from 'node:fs';

import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { profiles, tweets, twoFactors, users } from './schema';

describe('database schema', () => {
  it('keeps Better Auth model and field names stable', () => {
    expect(getTableName(users)).toBe('users');
    expect(getTableName(twoFactors)).toBe('two_factors');
    expect(Object.keys(getTableColumns(users))).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'email',
        'emailVerified',
        'twoFactorEnabled',
        'image',
        'createdAt',
        'updatedAt',
      ]),
    );
  });

  it('allows onboarding to claim a handle after the auth user is created', () => {
    expect(getTableColumns(profiles).handle.notNull).toBe(false);
    expect(getTableColumns(tweets).id.dataType).toBe('bigint');
  });

  it('ships a structure-only initial migration', () => {
    const migrationDirectory = new URL('../drizzle/', import.meta.url);
    const migrations = readdirSync(migrationDirectory).filter((name) => name.endsWith('.sql'));

    expect(migrations).toHaveLength(1);
    const migration = readFileSync(new URL(migrations[0]!, migrationDirectory), 'utf8');
    expect(migration.match(/CREATE TABLE/g)).toHaveLength(46);
    expect(migration).not.toMatch(/\b(?:INSERT\s+INTO|COPY)\b/i);
  });
});
