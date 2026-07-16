import { auth } from '@/server/auth';
import { logUntrustedAuthOrigin } from '@/server/request-origin';
import { toNextJsHandler } from 'better-auth/next-js';

export const runtime = 'nodejs';
const handlers = toNextJsHandler(auth);

export const GET = handlers.GET;

export function POST(request: Request): Promise<Response> {
  logUntrustedAuthOrigin(request);
  return handlers.POST(request);
}
