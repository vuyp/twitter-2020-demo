import { describe, expect, it } from 'vitest';
import { normalizeTimelineEntry, normalizeTweet, normalizeUser } from './types';

const backendUser = {
  id: '42',
  handle: 'birdwatcher',
  name: 'Bird Watcher',
  bio: 'Watching what happens.',
  avatarUrl: null,
  protected: false,
  verified: true,
  relationship: { following: true, followedBy: true },
  websiteUrl: 'https://example.test',
  joinedAt: '2020-01-02T00:00:00.000Z',
};

const backendTweet = {
  id: '99',
  author: backendUser,
  text: 'A real Tweet',
  createdAt: '2020-11-30T12:00:00.000Z',
  replyToId: null,
  replyToUser: null,
  quoteTweet: null,
  media: [],
  poll: null,
  counts: { replies: 2, retweets: 3, quotes: 1, likes: 4 },
  viewerState: { liked: true, retweeted: false, bookmarked: true },
};

describe('API DTO normalization', () => {
  it('maps profile relationship and renamed profile fields', () => {
    expect(normalizeUser(backendUser)).toMatchObject({
      handle: 'birdwatcher',
      following: true,
      followsYou: true,
      website: 'https://example.test',
      createdAt: '2020-01-02T00:00:00.000Z',
    });
  });

  it('maps backend counts and viewerState', () => {
    expect(normalizeTweet(backendTweet)).toMatchObject({
      id: '99',
      replyCount: 2,
      retweetCount: 3,
      likeCount: 4,
      liked: true,
      bookmarked: true,
    });
  });

  it('unwraps timeline entries and preserves context', () => {
    const result = normalizeTimelineEntry({
      tweet: backendTweet,
      context: { type: 'retweet', label: 'Retweeted', user: backendUser },
    });
    expect(result.id).toBe('99');
    expect(result.timelineContext).toMatchObject({
      type: 'retweet',
      label: 'Retweeted',
      user: { handle: 'birdwatcher' },
    });
  });
});
