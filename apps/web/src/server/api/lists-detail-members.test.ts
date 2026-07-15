import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOptionalSession: vi.fn(),
  getUsersByIds: vi.fn(),
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock('../database', () => ({
  query: mocks.query,
  queryOne: mocks.queryOne,
  transaction: vi.fn(),
}));

vi.mock('../models', () => ({
  getUsersByIds: mocks.getUsersByIds,
  loadTweets: vi.fn(),
}));

vi.mock('../session', () => ({
  getOptionalSession: mocks.getOptionalSession,
  requireSession: vi.fn(),
}));

vi.mock('../storage', () => ({
  publicMediaUrl: vi.fn((key: string) => `https://media.test/${key}`),
}));

import { getList } from './lists';

const owner = {
  id: 'owner-id',
  handle: 'owner',
  name: 'List Owner',
  bio: '',
  avatarUrl: null,
  protected: false,
  verified: false,
  deactivated: false,
};

const firstMember = {
  ...owner,
  id: 'member-1',
  handle: 'first_member',
  name: 'First Member',
};

const secondMember = {
  ...owner,
  id: 'member-2',
  handle: 'second_member',
  name: 'Second Member',
};

const listRow = {
  id: '42',
  owner_id: owner.id,
  name: 'News',
  description: 'Accounts worth reading',
  visibility: 'public' as const,
  member_count: 2,
  follower_count: 3,
  created_at: new Date('2020-11-01T10:00:00.000Z'),
  updated_at: new Date('2020-11-02T10:00:00.000Z'),
  banner_key: null,
  following: false,
};

function request(): NextRequest {
  return new Request('http://twitter.test/api/v1/lists/42') as NextRequest;
}

const context = { params: Promise.resolve({ id: '42' }) };

describe('List detail members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryOne.mockResolvedValue(listRow);
  });

  it('returns every active member in stable membership order to the List owner', async () => {
    mocks.getOptionalSession.mockResolvedValue({ user: { id: owner.id } });
    mocks.getUsersByIds.mockResolvedValueOnce(new Map([[owner.id, owner]])).mockResolvedValueOnce(
      new Map([
        [firstMember.id, firstMember],
        [secondMember.id, secondMember],
      ]),
    );
    mocks.query.mockResolvedValue([{ user_id: secondMember.id }, { user_id: firstMember.id }]);

    const response = await getList(request(), context);
    const payload = (await response.json()) as { data: { members: (typeof firstMember)[] } };

    expect(payload.data.members).toEqual([secondMember, firstMember]);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining('FROM list_members lm'), [
      '42',
    ]);
    expect(mocks.getUsersByIds).toHaveBeenNthCalledWith(
      2,
      [secondMember.id, firstMember.id],
      owner.id,
    );
  });

  it('does not expose the member-management payload to another public viewer', async () => {
    mocks.getOptionalSession.mockResolvedValue({ user: { id: 'viewer-id' } });
    mocks.getUsersByIds.mockResolvedValueOnce(new Map([[owner.id, owner]]));

    const response = await getList(request(), context);
    const payload = (await response.json()) as { data: Record<string, unknown> };

    expect(payload.data).not.toHaveProperty('members');
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.getUsersByIds).toHaveBeenCalledTimes(1);
  });
});
