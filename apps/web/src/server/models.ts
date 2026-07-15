import type {
  MediaAttachment,
  Poll,
  Tweet,
  UserProfile,
  UserSummary,
} from '@twitter2020/contracts';
import type { QueryResultRow } from 'pg';
import { query, queryOne } from './database';
import { asId, toIso } from './ids';
import { publicMediaUrl } from './storage';

type UserRow = QueryResultRow & {
  id: string;
  auth_name: string;
  image: string | null;
  status: 'active' | 'deactivated' | 'suspended';
  created_at: Date;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  birth_date: Date | null;
  avatar_key: string | null;
  banner_key: string | null;
  pinned_tweet_id: string | null;
  follower_count: number | null;
  following_count: number | null;
  tweet_count: number | null;
  listed_count: number | null;
  verified: boolean | null;
  protected_account: boolean | null;
  viewer_following: boolean;
  followed_by: boolean;
  follow_requested: boolean;
  blocking: boolean;
  muting: boolean;
  can_dm: boolean;
};

const USER_SELECT = `
  u.id,
  u.name AS auth_name,
  u.image,
  u.status,
  u."createdAt" AS created_at,
  p.handle,
  p.display_name,
  p.bio,
  p.location,
  p.website,
  p.birth_date,
  p.pinned_tweet_id,
  p.follower_count,
  p.following_count,
  p.tweet_count,
  p.listed_count,
  p.verified,
  avatar.storage_key AS avatar_key,
  banner.storage_key AS banner_key,
  COALESCE(us.protected_account, false) AS protected_account,
  CASE WHEN $1::text IS NULL THEN false ELSE EXISTS(
    SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = u.id
  ) END AS viewer_following,
  CASE WHEN $1::text IS NULL THEN false ELSE EXISTS(
    SELECT 1 FROM follows f WHERE f.follower_id = u.id AND f.following_id = $1
  ) END AS followed_by,
  CASE WHEN $1::text IS NULL THEN false ELSE EXISTS(
    SELECT 1 FROM follow_requests fr WHERE fr.requester_id = $1 AND fr.target_id = u.id
  ) END AS follow_requested,
  CASE WHEN $1::text IS NULL THEN false ELSE EXISTS(
    SELECT 1 FROM blocks b WHERE b.blocker_id = $1 AND b.blocked_id = u.id
  ) END AS blocking,
  CASE WHEN $1::text IS NULL THEN false ELSE EXISTS(
    SELECT 1 FROM mutes m WHERE m.muter_id = $1 AND m.muted_id = u.id AND (m.expires_at IS NULL OR m.expires_at > now())
  ) END AS muting,
  CASE
    WHEN $1::text IS NULL THEN false
    WHEN u.id = $1 THEN true
    WHEN COALESCE(us.direct_message_permission, 'following') = 'everyone' THEN true
    WHEN COALESCE(us.direct_message_permission, 'following') = 'following' THEN EXISTS(
      SELECT 1 FROM follows f WHERE f.follower_id = u.id AND f.following_id = $1
    )
    ELSE false
  END AS can_dm
`;

const USER_JOINS = `
  LEFT JOIN profiles p ON p.user_id = u.id
  LEFT JOIN user_settings us ON us.user_id = u.id
  LEFT JOIN media avatar ON avatar.id = p.avatar_media_id AND avatar.status = 'ready'
  LEFT JOIN media banner ON banner.id = p.banner_media_id AND banner.status = 'ready'
`;

export async function getUserByHandle(
  handle: string,
  viewerId: string | null,
): Promise<UserProfile | null> {
  const row = await queryOne<UserRow>(
    `SELECT ${USER_SELECT} FROM users u ${USER_JOINS}
     WHERE lower(p.handle) = lower($2) AND u.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE $1::text IS NOT NULL AND b.blocker_id = u.id AND b.blocked_id = $1
       )
     LIMIT 1`,
    [viewerId, handle],
  );
  return row ? userProfile(row, viewerId) : null;
}

export async function getUserById(
  userId: string,
  viewerId: string | null,
): Promise<UserProfile | null> {
  const row = await queryOne<UserRow>(
    `SELECT ${USER_SELECT} FROM users u ${USER_JOINS} WHERE u.id = $2 LIMIT 1`,
    [viewerId, userId],
  );
  return row ? userProfile(row, viewerId) : null;
}

export async function getUsersByIds(
  userIds: readonly string[],
  viewerId: string | null,
): Promise<Map<string, UserSummary>> {
  if (userIds.length === 0) return new Map();
  const rows = await query<UserRow>(
    `SELECT ${USER_SELECT} FROM users u ${USER_JOINS}
     WHERE u.id = ANY($2::text[]) AND u.status = 'active'`,
    [viewerId, [...userIds]],
  );
  return new Map(rows.map((row) => [row.id, userSummary(row)]));
}

export function userSummary(row: UserRow): UserSummary {
  return {
    id: row.id,
    handle: row.handle ?? `user_${row.id.replace(/-/g, '').slice(0, 8)}`,
    name: row.display_name ?? row.auth_name,
    bio: row.bio ?? '',
    avatarUrl: row.avatar_key ? publicMediaUrl(row.avatar_key) : row.image,
    protected: row.protected_account ?? false,
    verified: row.verified ?? false,
    deactivated: row.status === 'deactivated',
    relationship: {
      following: row.viewer_following,
      followedBy: row.followed_by,
      followRequested: row.follow_requested,
      blocking: row.blocking,
      muting: row.muting,
      canDirectMessage: row.can_dm,
    },
  };
}

function userProfile(row: UserRow, viewerId: string | null): UserProfile {
  return {
    ...userSummary(row),
    bannerUrl: row.banner_key ? publicMediaUrl(row.banner_key) : null,
    location: row.location ?? '',
    websiteUrl: row.website,
    joinedAt: toIso(row.created_at),
    birthDate:
      viewerId === row.id && row.birth_date ? row.birth_date.toISOString().slice(0, 10) : null,
    followersCount: row.follower_count ?? 0,
    followingCount: row.following_count ?? 0,
    tweetsCount: row.tweet_count ?? 0,
    likesCount: 0,
    listedCount: row.listed_count ?? 0,
    pinnedTweetId: row.pinned_tweet_id ? asId(row.pinned_tweet_id) : null,
  };
}

type TweetRow = QueryResultRow & {
  id: string;
  author_id: string;
  body: string;
  reply_to_tweet_id: string | null;
  quoted_tweet_id: string | null;
  thread_root_id: string | null;
  reply_audience: 'everyone' | 'following' | 'mentioned';
  language: string | null;
  source: string;
  is_sensitive: boolean;
  reply_count: number;
  retweet_count: number;
  quote_count: number;
  like_count: number;
  published_at: Date;
  deleted_at: Date | null;
  pinned: boolean;
  viewer_liked: boolean;
  viewer_retweeted: boolean;
  viewer_bookmarked: boolean;
  can_reply: boolean;
  auth_name: string;
  image: string | null;
  user_status: 'active' | 'deactivated' | 'suspended';
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_key: string | null;
  verified: boolean | null;
  protected_account: boolean | null;
  viewer_following: boolean;
  followed_by: boolean;
  follow_requested: boolean;
  blocking: boolean;
  muting: boolean;
  can_dm: boolean;
};

const TWEET_SELECT = `
  t.id, t.author_id, t.body, t.reply_to_tweet_id, t.quoted_tweet_id, t.thread_root_id,
  t.reply_audience, t.language, t.source, t.is_sensitive, t.reply_count, t.retweet_count,
  t.quote_count, t.like_count, t.published_at, t.deleted_at,
  (p.pinned_tweet_id = t.id) AS pinned,
  CASE WHEN $2::text IS NULL THEN false ELSE EXISTS(SELECT 1 FROM likes l WHERE l.user_id = $2 AND l.tweet_id = t.id) END AS viewer_liked,
  CASE WHEN $2::text IS NULL THEN false ELSE EXISTS(SELECT 1 FROM retweets r WHERE r.user_id = $2 AND r.tweet_id = t.id) END AS viewer_retweeted,
  CASE WHEN $2::text IS NULL THEN false ELSE EXISTS(SELECT 1 FROM bookmarks b WHERE b.user_id = $2 AND b.tweet_id = t.id) END AS viewer_bookmarked,
  CASE
    WHEN $2::text IS NULL THEN false
    WHEN t.author_id = $2 THEN true
    WHEN t.reply_audience = 'everyone' THEN true
    WHEN t.reply_audience = 'following' THEN EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = t.author_id AND f.following_id = $2)
    WHEN t.reply_audience = 'mentioned' THEN EXISTS(SELECT 1 FROM tweet_mentions tm WHERE tm.tweet_id = t.id AND tm.user_id = $2)
    ELSE false
  END AS can_reply,
  u.name AS auth_name, u.image, u.status AS user_status,
  p.handle, p.display_name, p.bio, avatar.storage_key AS avatar_key,
  p.verified, COALESCE(us.protected_account, false) AS protected_account,
  CASE WHEN $2::text IS NULL THEN false ELSE EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.following_id = u.id) END AS viewer_following,
  CASE WHEN $2::text IS NULL THEN false ELSE EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = u.id AND f.following_id = $2) END AS followed_by,
  CASE WHEN $2::text IS NULL THEN false ELSE EXISTS(SELECT 1 FROM follow_requests fr WHERE fr.requester_id = $2 AND fr.target_id = u.id) END AS follow_requested,
  CASE WHEN $2::text IS NULL THEN false ELSE EXISTS(SELECT 1 FROM blocks b WHERE b.blocker_id = $2 AND b.blocked_id = u.id) END AS blocking,
  CASE WHEN $2::text IS NULL THEN false ELSE EXISTS(SELECT 1 FROM mutes m WHERE m.muter_id = $2 AND m.muted_id = u.id AND (m.expires_at IS NULL OR m.expires_at > now())) END AS muting,
  CASE WHEN $2::text IS NULL THEN false ELSE COALESCE(us.direct_message_permission = 'everyone', false) END AS can_dm
`;

const TWEET_JOINS = `
  JOIN users u ON u.id = t.author_id
  LEFT JOIN profiles p ON p.user_id = u.id
  LEFT JOIN user_settings us ON us.user_id = u.id
  LEFT JOIN media avatar ON avatar.id = p.avatar_media_id AND avatar.status = 'ready'
`;

async function fetchTweetRows(
  ids: readonly string[],
  viewerId: string | null,
): Promise<TweetRow[]> {
  if (ids.length === 0) return [];
  return query<TweetRow>(
    `SELECT ${TWEET_SELECT} FROM tweets t ${TWEET_JOINS}
     WHERE t.id = ANY($1::bigint[])
       AND u.status = 'active'
       AND (t.deleted_at IS NULL OR t.author_id = $2)
       AND (
         COALESCE(us.protected_account, false) = false OR t.author_id = $2 OR
         EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.following_id = t.author_id)
       )
       AND NOT EXISTS (
         SELECT 1 FROM blocks b WHERE $2::text IS NOT NULL AND
         ((b.blocker_id = t.author_id AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = t.author_id))
       )`,
    [[...ids], viewerId],
  );
}

type MediaRow = QueryResultRow & {
  tweet_id: string;
  id: string;
  type: 'image' | 'gif' | 'video';
  status: 'pending' | 'processing' | 'ready' | 'failed';
  storage_key: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  position: number;
  alt_text: string | null;
};

type PollRow = QueryResultRow & {
  tweet_id: string;
  poll_id: string;
  ends_at: Date;
  total_votes: number;
  option_id: string;
  label: string;
  option_votes: number;
  position: number;
  selected: boolean;
};

export async function loadTweets(
  ids: readonly string[],
  viewerId: string | null,
): Promise<Map<string, Tweet>> {
  const rows = await fetchTweetRows(ids, viewerId);
  const quoteIds = [
    ...new Set(rows.flatMap((row) => (row.quoted_tweet_id ? [row.quoted_tweet_id] : []))),
  ];
  const quoteRows = await fetchTweetRows(quoteIds, viewerId);
  const allRows = [...rows, ...quoteRows];
  const allIds = [...new Set(allRows.map((row) => row.id))];

  const [mediaRows, pollRows] = await Promise.all([
    allIds.length
      ? query<MediaRow>(
          `SELECT tm.tweet_id, m.id, m.type, m.status, m.storage_key, m.width, m.height, m.duration_ms, tm.position, tm.alt_text
           FROM tweet_media tm JOIN media m ON m.id = tm.media_id
           WHERE tm.tweet_id = ANY($1::bigint[]) ORDER BY tm.tweet_id, tm.position`,
          [allIds],
        )
      : [],
    allIds.length
      ? query<PollRow>(
          `SELECT p.tweet_id, p.id AS poll_id, p.ends_at, p.vote_count AS total_votes,
                  po.id AS option_id, po.label, po.vote_count AS option_votes, po.position,
                  CASE WHEN $2::text IS NULL THEN false ELSE EXISTS(
                    SELECT 1 FROM poll_votes pv WHERE pv.poll_id = p.id AND pv.option_id = po.id AND pv.voter_id = $2
                  ) END AS selected
           FROM polls p JOIN poll_options po ON po.poll_id = p.id
           WHERE p.tweet_id = ANY($1::bigint[]) ORDER BY p.tweet_id, po.position`,
          [allIds, viewerId],
        )
      : [],
  ]);

  const mediaByTweet = new Map<string, MediaAttachment[]>();
  for (const row of mediaRows) {
    const attachment: MediaAttachment = {
      id: asId(row.id),
      type: row.type,
      url: publicMediaUrl(row.storage_key),
      previewUrl: publicMediaUrl(row.storage_key),
      altText: row.alt_text,
      width: row.width,
      height: row.height,
      durationMs: row.duration_ms,
      processingStatus: row.status,
    };
    const key = asId(row.tweet_id);
    (mediaByTweet.get(key) ?? mediaByTweet.set(key, []).get(key)!).push(attachment);
  }

  const pollsByTweet = new Map<string, Poll>();
  for (const row of pollRows) {
    const key = asId(row.tweet_id);
    const existing = pollsByTweet.get(key);
    if (existing) {
      existing.options.push({
        id: asId(row.option_id),
        label: row.label,
        votes: row.option_votes,
        selected: row.selected,
      });
    } else {
      pollsByTweet.set(key, {
        id: asId(row.poll_id),
        options: [
          {
            id: asId(row.option_id),
            label: row.label,
            votes: row.option_votes,
            selected: row.selected,
          },
        ],
        endsAt: toIso(row.ends_at),
        votingStatus: row.ends_at.getTime() > Date.now() ? 'open' : 'closed',
        totalVotes: row.total_votes,
      });
    }
  }

  const quotes = new Map<string, TweetRow>(quoteRows.map((row) => [row.id, row]));
  const output = new Map<string, Tweet>();
  for (const row of rows) {
    const quote = row.quoted_tweet_id ? quotes.get(row.quoted_tweet_id) : undefined;
    output.set(asId(row.id), mapTweet(row, mediaByTweet, pollsByTweet, viewerId, quote));
  }
  return output;
}

function mapTweet(
  row: TweetRow,
  mediaByTweet: Map<string, MediaAttachment[]>,
  pollsByTweet: Map<string, Poll>,
  viewerId: string | null,
  quote?: TweetRow,
): Tweet {
  const id = asId(row.id);
  const authorRow: UserRow = {
    ...row,
    id: row.author_id,
    status: row.user_status,
    created_at: row.published_at,
    location: null,
    website: null,
    birth_date: null,
    banner_key: null,
    pinned_tweet_id: null,
    follower_count: null,
    following_count: null,
    tweet_count: null,
    listed_count: null,
  };
  return {
    id,
    author: userSummary(authorRow),
    text: row.deleted_at ? '' : row.body,
    createdAt: toIso(row.published_at),
    editedAt: null,
    language: row.language,
    source: row.source,
    sensitive: row.is_sensitive,
    replyToId: row.reply_to_tweet_id ? asId(row.reply_to_tweet_id) : null,
    conversationId: asId(row.thread_root_id ?? row.id),
    quoteTweet: quote
      ? {
          id: asId(quote.id),
          text: quote.deleted_at ? '' : quote.body,
          author: userSummary({
            ...authorRow,
            id: quote.author_id,
            auth_name: quote.auth_name,
            image: quote.image,
            handle: quote.handle,
            display_name: quote.display_name,
            bio: quote.bio,
            avatar_key: quote.avatar_key,
            verified: quote.verified,
            protected_account: quote.protected_account,
          }),
          createdAt: toIso(quote.published_at),
          media: (mediaByTweet.get(asId(quote.id)) ?? []).slice(0, 1),
          unavailable: false,
        }
      : null,
    media: mediaByTweet.get(id) ?? [],
    poll: pollsByTweet.get(id) ?? null,
    counts: {
      replies: row.reply_count,
      retweets: row.retweet_count,
      quotes: row.quote_count,
      likes: row.like_count,
    },
    viewerState: {
      liked: row.viewer_liked,
      retweeted: row.viewer_retweeted,
      bookmarked: row.viewer_bookmarked,
      canReply: row.can_reply,
      canDelete: viewerId === row.author_id,
    },
    replyAudience: row.reply_audience,
    deleted: Boolean(row.deleted_at),
    pinned: row.pinned,
  };
}

export async function loadTweet(id: string, viewerId: string | null): Promise<Tweet | null> {
  return (await loadTweets([id], viewerId)).get(id) ?? null;
}
