import { authPool } from '@/server/auth';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  try {
    await authPool.query('select 1 as ready');
    return NextResponse.json({
      status: 'ready',
      checks: { database: 'ok' },
      now: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Readiness check failed', error);
    return NextResponse.json(
      { status: 'not-ready', checks: { database: 'failed' }, now: new Date().toISOString() },
      { status: 503 },
    );
  }
}
