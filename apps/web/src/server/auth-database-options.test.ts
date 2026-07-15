import { describe, expect, it } from 'vitest';
import { authDatabaseOptions } from './auth-database-options';

describe('auth database IDs', () => {
  it('generates distinct UUIDs for auth records before insertion', () => {
    const first = authDatabaseOptions.generateId();
    const second = authDatabaseOptions.generateId();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(second).not.toBe(first);
  });
});
