import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { proxy } from './proxy';

describe.sequential('maintenance proxy', () => {
  const originalMode = process.env.MAINTENANCE_MODE;

  beforeEach(() => {
    process.env.MAINTENANCE_MODE = 'true';
  });

  afterEach(() => {
    if (originalMode === undefined) delete process.env.MAINTENANCE_MODE;
    else process.env.MAINTENANCE_MODE = originalMode;
  });

  it('serves page requests as self-contained 503 responses', async () => {
    const response = proxy(new NextRequest('https://twitter.example/home'));
    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('retry-after')).toBe('300');
    expect(await response.text()).toContain('Something is technically wrong.');
  });

  it('returns a machine-readable 503 for APIs', async () => {
    const response = proxy(new NextRequest('https://twitter.example/api/v1/tweets'));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      status: 503,
      code: 'maintenance_mode',
    });
  });

  it.each(['/api/health/live', '/api/health/ready', '/maintenance-robot.png', '/_next/a.js'])(
    'keeps required infrastructure path %s reachable',
    (path) => {
      expect(proxy(new NextRequest(`https://twitter.example${path}`)).status).toBe(200);
    },
  );

  it('passes through normally when the switch is off', () => {
    process.env.MAINTENANCE_MODE = 'false';
    process.env.MAINTENANCE_STATE_FILE = 'missing-state';
    expect(proxy(new NextRequest('https://twitter.example/home')).status).toBe(200);
    delete process.env.MAINTENANCE_STATE_FILE;
  });
});
