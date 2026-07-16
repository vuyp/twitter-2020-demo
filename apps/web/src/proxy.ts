import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { isMaintenanceMode, maintenanceHtml } from '@/server/maintenance';

const PASSTHROUGH_PATHS = new Set([
  '/api/health/live',
  '/api/health/ready',
  '/maintenance-robot.png',
  '/icon.svg',
  '/favicon.ico',
]);

export function proxy(request: NextRequest): NextResponse {
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/_next/') || PASSTHROUGH_PATHS.has(pathname)) {
    return NextResponse.next();
  }
  if (!isMaintenanceMode()) {
    return NextResponse.next();
  }

  const headers = {
    'cache-control': 'no-store, max-age=0',
    'retry-after': '300',
    'x-robots-tag': 'noindex, nofollow, noarchive',
  };
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      {
        type: 'https://twitter.local/problems/maintenance_mode',
        title: 'Service Unavailable',
        status: 503,
        detail: 'Twitter is temporarily down for maintenance.',
        code: 'maintenance_mode',
      },
      { status: 503, headers },
    );
  }

  return new NextResponse(request.method === 'HEAD' ? null : maintenanceHtml(), {
    status: 503,
    headers: { ...headers, 'content-type': 'text/html; charset=utf-8' },
  });
}

export const config = { matcher: '/:path*' };
