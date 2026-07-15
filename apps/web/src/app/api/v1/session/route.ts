import { apiRoute, ok } from '@/server/http';
import { getOptionalSession } from '@/server/session';
import { queryOne } from '@/server/database';
import { getUserById } from '@/server/models';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

export const GET = apiRoute(async (request: NextRequest) => {
  const session = await getOptionalSession(request);
  if (!session) return ok(null);
  const onboarding = await queryOne<{ handle: string | null }>(
    'SELECT handle FROM profiles WHERE user_id = $1',
    [session.user.id],
  );
  const profile = onboarding?.handle ? await getUserById(session.user.id, session.user.id) : null;
  return ok({
    session: session.session,
    user: {
      ...session.user,
      ...(profile ?? {}),
      handle: onboarding?.handle ?? '',
      onboardingComplete: Boolean(onboarding?.handle),
    },
  });
});
