import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOptionalSession: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../database', () => ({
  query: mocks.query,
  queryOne: mocks.queryOne,
  transaction: mocks.transaction,
}));

vi.mock('../session', () => ({
  getOptionalSession: mocks.getOptionalSession,
  requireSession: vi.fn(),
}));

vi.mock('./users', () => ({
  insertNotification: vi.fn(),
  insertOutbox: vi.fn(),
}));

import { getProfileTimeline } from './tweets';

const viewerId = 'viewer-id';
const handle = 'private_owner';

function profileRequest(tab = 'likes'): NextRequest {
  const nextUrl = new URL(`http://twitter.test/api/v1/users/${handle}/tweets`);
  nextUrl.searchParams.set('tab', tab);
  nextUrl.searchParams.set('limit', '20');
  return {
    nextUrl,
    headers: new Headers(),
    method: 'GET',
    url: nextUrl.toString(),
  } as NextRequest;
}

function ownerRow(viewerFollowing: boolean) {
  return {
    id: 'owner-id',
    auth_name: 'Private Owner',
    image: null,
    status: 'active',
    created_at: new Date('2020-01-01T00:00:00.000Z'),
    handle,
    display_name: 'Private Owner',
    bio: null,
    location: null,
    website: null,
    birth_date: null,
    avatar_key: null,
    banner_key: null,
    pinned_tweet_id: null,
    follower_count: 0,
    following_count: 0,
    tweet_count: 0,
    listed_count: 0,
    verified: false,
    protected_account: true,
    viewer_following: viewerFollowing,
    followed_by: false,
    follow_requested: false,
    blocking: false,
    muting: false,
    can_dm: false,
  };
}

describe('profile timeline visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOptionalSession.mockResolvedValue({ user: { id: viewerId } });
    mocks.query.mockResolvedValue([]);
  });

  it('hides blocked or deactivated profiles through the canonical handle lookup before querying likes', async () => {
    mocks.queryOne.mockResolvedValue(null);

    await expect(
      getProfileTimeline(profileRequest(), { params: Promise.resolve({ handle }) }),
    ).rejects.toMatchObject({ status: 404, code: 'not_found' });

    expect(mocks.queryOne).toHaveBeenCalledOnce();
    const [lookupSql, lookupValues] = mocks.queryOne.mock.calls[0] as [string, unknown[]];
    expect(lookupValues).toEqual([viewerId, handle]);
    expect(lookupSql).toContain("u.status = 'active'");
    expect(lookupSql).toContain('b.blocker_id = u.id AND b.blocked_id = $1');
    expect(lookupSql).toContain('b.blocker_id = $1 AND b.blocked_id = u.id');
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('does not expose likes from a protected profile to a non-follower', async () => {
    mocks.queryOne.mockResolvedValue(ownerRow(false));

    await expect(
      getProfileTimeline(profileRequest(), { params: Promise.resolve({ handle }) }),
    ).rejects.toMatchObject({ status: 403, code: 'forbidden' });

    expect(mocks.query).not.toHaveBeenCalled();
  });

  it('allows an accepted follower through the same protected-profile gate', async () => {
    mocks.queryOne.mockResolvedValue(ownerRow(true));

    const response = await getProfileTimeline(profileRequest(), {
      params: Promise.resolve({ handle }),
    });
    const payload = (await response.json()) as {
      data: { items: unknown[]; nextCursor: string | null };
    };

    expect(response.status).toBe(200);
    expect(payload.data).toEqual({ items: [], nextCursor: null });
    expect(mocks.query).toHaveBeenCalledOnce();
    const [timelineSql, timelineValues] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(timelineSql).toContain(
      'JOIN likes activity ON activity.tweet_id = t.id AND activity.user_id = $1',
    );
    expect(timelineValues).toEqual(['owner-id', null, '0', 21]);
  });
});
