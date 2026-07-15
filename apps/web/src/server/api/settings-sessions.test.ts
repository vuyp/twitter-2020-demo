import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock('../database', () => ({
  query: mocks.query,
  queryOne: mocks.queryOne,
  transaction: vi.fn(),
}));

vi.mock('../session', () => ({ requireSession: mocks.requireSession }));

vi.mock('../storage', () => ({ getPrivateDownloadUrl: vi.fn() }));

import { getAccountSessions, revokeAccountSession } from './settings-reports';

const authSession = {
  session: { id: 'current-session' },
  user: { id: 'user-1' },
};

function request(method = 'GET', body?: unknown): NextRequest {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  return new Request('http://twitter.test/api/v1/settings/sessions', init) as NextRequest;
}

describe('account session management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue(authSession);
  });

  it('lists only the viewer sessions and identifies the current device', async () => {
    mocks.query.mockResolvedValue([
      {
        id: 'current-session',
        user_agent: 'Current browser',
        ip_address: '127.0.0.1',
        created_at: new Date('2020-11-01T12:00:00.000Z'),
        expires_at: new Date('2020-12-01T12:00:00.000Z'),
      },
      {
        id: 'other-session',
        user_agent: 'Other browser',
        ip_address: null,
        created_at: new Date('2020-11-02T12:00:00.000Z'),
        expires_at: new Date('2020-12-02T12:00:00.000Z'),
      },
    ]);

    const response = await getAccountSessions(request());
    const payload = (await response.json()) as {
      data: { items: Array<{ id: string; current: boolean }> };
    };

    expect(payload.data.items).toEqual([
      expect.objectContaining({ id: 'current-session', current: true }),
      expect.objectContaining({ id: 'other-session', current: false }),
    ]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('"userId" = $1'), ['user-1']);
  });

  it('revokes another session owned by the viewer', async () => {
    mocks.queryOne.mockResolvedValue({ id: 'other-session' });

    const response = await revokeAccountSession(request('DELETE', { sessionId: 'other-session' }));
    const payload = (await response.json()) as { data: { sessionId: string; revoked: boolean } };

    expect(payload.data).toEqual({ sessionId: 'other-session', revoked: true });
    expect(mocks.queryOne).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM sessions'), [
      'other-session',
      'user-1',
      'current-session',
    ]);
  });

  it('does not let the sessions screen revoke its own active cookie', async () => {
    await expect(
      revokeAccountSession(request('DELETE', { sessionId: 'current-session' })),
    ).rejects.toMatchObject({ code: 'current_session', status: 400 });
    expect(mocks.queryOne).not.toHaveBeenCalled();
  });
});
