import { apiRoute, ok } from '@/server/http';
import { issueRealtimeToken } from '@/server/realtime-token';
import { requireSession } from '@/server/session';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const GET = apiRoute(async (request: NextRequest) => {
  const session = await requireSession(request);
  return ok(issueRealtimeToken(session.user.id));
});
