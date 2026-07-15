import type { NextRequest } from 'next/server';
import { auth, type AuthSession } from './auth';
import { forbidden, unauthorized } from './errors';

export async function getOptionalSession(request: NextRequest): Promise<AuthSession | null> {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  if ('status' in session.user && session.user.status !== 'active') return null;
  return session;
}

export async function requireSession(request: NextRequest): Promise<AuthSession> {
  const session = await getOptionalSession(request);
  if (!session) unauthorized();
  return session;
}

export async function requireRole(
  request: NextRequest,
  roles: ReadonlyArray<'moderator' | 'admin'>,
): Promise<AuthSession> {
  const session = await requireSession(request);
  const role =
    'role' in session.user && typeof session.user.role === 'string' ? session.user.role : 'user';
  if (!roles.includes(role as 'moderator' | 'admin')) forbidden('Moderator access is required');
  return session;
}
