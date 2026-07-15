import { randomUUID } from 'node:crypto';

/**
 * Better Auth's `"uuid"` mode delegates UUID generation to PostgreSQL. Our auth
 * primary keys are text columns, so generate the UUID in the application and
 * pass it to the adapter explicitly.
 */
export const authDatabaseOptions = {
  generateId: () => randomUUID(),
};
