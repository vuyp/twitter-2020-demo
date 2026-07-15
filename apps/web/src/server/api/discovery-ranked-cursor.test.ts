import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOptionalSession: vi.fn(),
  getUsersByIds: vi.fn(),
  loadTweets: vi.fn(),
  query: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('../database', () => ({
  query: mocks.query,
  transaction: mocks.transaction,
}));

vi.mock('../models', () => ({
  getUsersByIds: mocks.getUsersByIds,
  loadTweets: mocks.loadTweets,
}));

vi.mock('../session', () => ({
  getOptionalSession: mocks.getOptionalSession,
  requireSession: vi.fn(),
}));

vi.mock('./users', () => ({ insertOutbox: vi.fn() }));

import { decodeCursor, encodeCursor } from '../cursor';
import { search } from './discovery';

const viewerId = 'viewer-id';
const publishedAt = new Date('2020-11-30T12:34:56.000Z');
const rankExpression =
  "ts_rank_cd(to_tsvector('english', t.body), websearch_to_tsquery('english', $1))::double precision";

function searchRequest(cursor?: string): NextRequest {
  const nextUrl = new URL('http://twitter.test/api/v1/search');
  nextUrl.searchParams.set('q', 'birds');
  nextUrl.searchParams.set('type', 'top');
  nextUrl.searchParams.set('limit', '1');
  if (cursor) nextUrl.searchParams.set('cursor', cursor);
  return {
    nextUrl,
    headers: new Headers(),
    method: 'GET',
    url: nextUrl.toString(),
  } as NextRequest;
}

describe('ranked search pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOptionalSession.mockResolvedValue({ user: { id: viewerId } });
    mocks.getUsersByIds.mockResolvedValue(new Map());
    mocks.loadTweets.mockResolvedValue(new Map([['101', { id: '101' }]]));
  });

  it('orders and filters on score, publication time, and id and carries all three in its cursor', async () => {
    mocks.query.mockResolvedValueOnce([
      { id: '101', published_at: publishedAt, score: 0.8125 },
      { id: '100', published_at: new Date('2020-11-30T12:30:00.000Z'), score: 0.8 },
    ]);

    const response = await search(searchRequest());
    const payload = (await response.json()) as { data: { nextCursor: string | null } };
    expect(payload.data.nextCursor).not.toBeNull();

    const cursor = decodeCursor(payload.data.nextCursor!);
    expect(cursor).toEqual({
      id: '101',
      at: publishedAt.toISOString(),
      score: 0.8125,
    });

    const [sql] = mocks.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('AND ($2::double precision IS NULL OR');
    expect(sql).toContain(`${rankExpression} < $2 OR`);
    expect(sql).toContain(
      `(${rankExpression} = $2 AND (t.published_at, t.id) < ($3::timestamptz, $4::bigint))`,
    );
    expect(sql).toContain(`ORDER BY ${rankExpression} DESC, t.published_at DESC, t.id DESC`);

    mocks.query.mockResolvedValueOnce([]);
    await search(searchRequest(payload.data.nextCursor!));
    const [, values] = mocks.query.mock.calls[1] as [string, unknown[]];
    expect(values.slice(0, 4)).toEqual(['birds', 0.8125, publishedAt.toISOString(), '101']);
  });

  it('rejects a legacy ranked cursor that has no score before running SQL', async () => {
    const cursorWithoutScore = encodeCursor({
      id: '101',
      at: publishedAt.toISOString(),
    });

    await expect(search(searchRequest(cursorWithoutScore))).rejects.toMatchObject({
      status: 400,
      code: 'invalid_cursor',
    });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
