import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '../auth';
import { transaction } from '../database';
import { ApiError, forbidden } from '../errors';
import { ok, parseJson } from '../http';
import { requireSession } from '../session';
import { insertOutbox } from './users';

const deactivateInputSchema = z.object({
  password: z.string().min(1).max(128),
  confirmation: z.literal('DEACTIVATE'),
});

export async function deactivateAccount(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = await parseJson(request, deactivateInputSchema);
  try {
    await auth.api.verifyPassword({ body: { password: input.password }, headers: request.headers });
  } catch {
    throw new ApiError(401, 'invalid_password', 'The password you entered is incorrect');
  }
  const changed = await transaction(async (client) => {
    const row = await client.query(
      `UPDATE users SET status = 'deactivated', "deactivatedAt" = now(),
         "deletionScheduledAt" = now() + interval '30 days', "updatedAt" = now()
       WHERE id = $1 AND status = 'active' RETURNING id`,
      [session.user.id],
    );
    if (!row.rowCount) return false;
    await insertOutbox(client, 'user', session.user.id, 'account.deactivated', {
      userId: session.user.id,
      deleteAfterDays: 30,
    });
    await client.query('DELETE FROM sessions WHERE "userId" = $1', [session.user.id]);
    return true;
  });
  if (!changed) forbidden('This account is not active');
  return ok({ deactivated: true, deletionScheduledInDays: 30 });
}
