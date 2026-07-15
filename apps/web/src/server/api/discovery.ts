import {
  paginationQuerySchema,
  searchQuerySchema,
  type Notification,
  type SearchResult,
  type Trend,
} from '@twitter2020/contracts';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { decodeCursor, encodeCursor } from '../cursor';
import { query } from '../database';
import { ApiError } from '../errors';
import { ok, parseJson, parseQuery } from '../http';
import { getUsersByIds, loadTweets } from '../models';
import { getOptionalSession, requireSession } from '../session';
import { transaction } from '../database';
import { insertOutbox } from './users';

export async function search(request: NextRequest): Promise<Response> {
  const session = await getOptionalSession(request);
  const input = parseQuery(request, searchQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const results: SearchResult[] = [];
  let nextCursor: string | null = null;

  if (input.type === 'people') {
    const rows = await query<{ user_id: string; updated_at: Date; score: number }>(
      `SELECT p.user_id, p.updated_at,
         (CASE WHEN lower(u.email) = lower($1) AND COALESCE(us.discoverable_by_email, true)
           THEN 2.0 ELSE similarity(p.handle, $1) END)::double precision AS score
       FROM profiles p JOIN users u ON u.id = p.user_id
       LEFT JOIN user_settings us ON us.user_id = p.user_id
       WHERE u.status = 'active' AND p.handle IS NOT NULL
         AND (p.handle ILIKE '%' || $1 || '%' OR p.display_name ILIKE '%' || $1 || '%' OR
           (lower(u.email) = lower($1) AND COALESCE(us.discoverable_by_email, true)))
         AND ($2::double precision IS NULL OR
           (CASE WHEN lower(u.email) = lower($1) AND COALESCE(us.discoverable_by_email, true)
             THEN 2.0 ELSE similarity(p.handle, $1) END) < $2 OR
           ((CASE WHEN lower(u.email) = lower($1) AND COALESCE(us.discoverable_by_email, true)
             THEN 2.0 ELSE similarity(p.handle, $1) END) = $2 AND
             (p.updated_at, p.user_id) < ($3::timestamptz, $4::text)))
         AND NOT EXISTS (
           SELECT 1 FROM blocks b WHERE $5::text IS NOT NULL AND
           ((b.blocker_id = p.user_id AND b.blocked_id = $5) OR (b.blocker_id = $5 AND b.blocked_id = p.user_id))
         )
       ORDER BY score DESC, p.updated_at DESC, p.user_id DESC LIMIT $6`,
      [
        input.q,
        cursor?.score ?? null,
        cursor?.at ?? null,
        cursor?.id ?? '',
        session?.user.id ?? null,
        input.limit + 1,
      ],
    );
    const page = rows.slice(0, input.limit);
    const users = await getUsersByIds(
      page.map((row) => row.user_id),
      session?.user.id ?? null,
    );
    for (const row of page) {
      const user = users.get(row.user_id);
      if (user) results.push({ kind: 'user', user });
    }
    const last = page.at(-1);
    if (rows.length > input.limit && last) {
      nextCursor = encodeCursor({
        id: last.user_id,
        at: last.updated_at.toISOString(),
        score: last.score,
      });
    }
  } else {
    const ranked = input.type !== 'latest';
    if (ranked && cursor && cursor.score === undefined) {
      throw new ApiError(400, 'invalid_cursor', 'The pagination cursor is invalid or expired');
    }
    const rankExpression =
      "ts_rank_cd(to_tsvector('english', t.body), websearch_to_tsquery('english', $1))::double precision";
    const rankOrder = !ranked
      ? 't.published_at DESC, t.id DESC'
      : `${rankExpression} DESC, t.published_at DESC, t.id DESC`;
    const positions = ranked
      ? { from: 5, since: 6, until: 7, viewer: 8, limit: 9 }
      : { from: 4, since: 5, until: 6, viewer: 7, limit: 8 };
    const cursorFilter = ranked
      ? `AND ($2::double precision IS NULL OR ${rankExpression} < $2 OR
          (${rankExpression} = $2 AND (t.published_at, t.id) < ($3::timestamptz, $4::bigint)))`
      : 'AND ($2::timestamptz IS NULL OR (t.published_at, t.id) < ($2, $3::bigint))';
    const rows = await query<{ id: string; published_at: Date; score: number }>(
      `SELECT t.id, t.published_at, ${ranked ? rankExpression : '0::double precision'} AS score
       FROM tweets t
       JOIN users u ON u.id = t.author_id
       JOIN profiles p ON p.user_id = t.author_id
       LEFT JOIN user_settings us ON us.user_id = t.author_id
       WHERE t.deleted_at IS NULL AND u.status = 'active'
         AND (to_tsvector('english', t.body) @@ websearch_to_tsquery('english', $1) OR t.body ILIKE '%' || $1 || '%')
         ${input.type === 'media' ? 'AND EXISTS(SELECT 1 FROM tweet_media tm WHERE tm.tweet_id = t.id)' : ''}
         ${
           input.type === 'media' && input.media
             ? `AND EXISTS(
                  SELECT 1 FROM tweet_media filtered_media
                  JOIN media filtered_asset ON filtered_asset.id = filtered_media.media_id
                  WHERE filtered_media.tweet_id = t.id AND ${
                    input.media === 'video'
                      ? "filtered_asset.type = 'video'"
                      : "filtered_asset.type IN ('image', 'gif')"
                  }
                )`
             : ''
         }
         AND ($${positions.from}::text IS NULL OR lower(p.handle) = lower($${positions.from}))
         AND ($${positions.since}::date IS NULL OR t.published_at >= $${positions.since}::date)
         AND ($${positions.until}::date IS NULL OR t.published_at < ($${positions.until}::date + interval '1 day'))
         AND (
           COALESCE(us.protected_account, false) = false OR
           t.author_id = $${positions.viewer}::text OR
           EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $${positions.viewer} AND f.following_id = t.author_id)
         )
         AND (
           t.is_sensitive = false OR t.author_id = $${positions.viewer} OR
           COALESCE((SELECT viewer_settings.show_sensitive_media FROM user_settings viewer_settings
             WHERE viewer_settings.user_id = $${positions.viewer}), false)
         )
         AND NOT EXISTS(
           SELECT 1 FROM blocks b WHERE $${positions.viewer}::text IS NOT NULL AND
           ((b.blocker_id = t.author_id AND b.blocked_id = $${positions.viewer}) OR
            (b.blocker_id = $${positions.viewer} AND b.blocked_id = t.author_id))
         )
         ${cursorFilter}
       ORDER BY ${rankOrder} LIMIT $${positions.limit}`,
      ranked
        ? [
            input.q,
            cursor?.score ?? null,
            cursor?.at ?? null,
            cursor?.id ?? '0',
            input.from ?? null,
            input.since ?? null,
            input.until ?? null,
            session?.user.id ?? null,
            input.limit + 1,
          ]
        : [
            input.q,
            cursor?.at ?? null,
            cursor?.id ?? '0',
            input.from ?? null,
            input.since ?? null,
            input.until ?? null,
            session?.user.id ?? null,
            input.limit + 1,
          ],
    );
    const page = rows.slice(0, input.limit);
    const tweets = await loadTweets(
      page.map((row) => String(row.id)),
      session?.user.id ?? null,
    );
    for (const row of page) {
      const tweet = tweets.get(String(row.id));
      if (tweet) results.push({ kind: 'tweet', tweet });
    }
    const last = page.at(-1);
    if (rows.length > input.limit && last) {
      nextCursor = encodeCursor({
        id: String(last.id),
        at: last.published_at.toISOString(),
        ...(ranked ? { score: Number(last.score) } : {}),
      });
    }
  }
  return ok({ items: results, nextCursor });
}

export async function getTrends(): Promise<Response> {
  const rows = await query<{ id: string; tag: string; tweet_count: number; rank: number }>(
    `WITH active AS (
       SELECT h.id, h.tag, count(DISTINCT th.tweet_id)::int AS tweet_count,
              count(DISTINCT t.author_id)::int AS author_count,
              max(t.published_at) AS latest
       FROM hashtags h JOIN tweet_hashtags th ON th.hashtag_id = h.id
       JOIN tweets t ON t.id = th.tweet_id
       JOIN users trend_user ON trend_user.id = t.author_id
       LEFT JOIN user_settings trend_settings ON trend_settings.user_id = t.author_id
       WHERE t.deleted_at IS NULL AND trend_user.status = 'active'
         AND COALESCE(trend_settings.protected_account, false) = false
         AND t.published_at > now() - interval '24 hours'
       GROUP BY h.id, h.tag
     )
     SELECT id, tag, tweet_count,
       (row_number() OVER (ORDER BY (tweet_count * greatest(author_count, 1)) /
         power(extract(epoch FROM (now() - latest)) / 3600 + 1, 0.8) DESC))::int AS rank
     FROM active WHERE author_count >= 1 ORDER BY rank LIMIT 20`,
  );
  const trends: Trend[] = rows.map((row) => ({
    id: String(row.id),
    name: `#${row.tag}`,
    query: `#${row.tag}`,
    category: trendCategory(row.tag, row.rank),
    tweetCount: row.tweet_count,
    rank: row.rank,
  }));
  return ok(trends);
}

function trendCategory(tag: string, rank: number): 'News' | 'Sports' | 'Entertainment' {
  const normalized = tag.toLowerCase();
  if (
    /(?:sport|football|soccer|cricket|tennis|rugby|nba|nfl|nhl|mlb|f1|olympic|match|game)/.test(
      normalized,
    )
  ) {
    return 'Sports';
  }
  if (
    /(?:film|movie|music|tv|show|actor|artist|album|song|gaming|stream|celebrity|award)/.test(
      normalized,
    )
  ) {
    return 'Entertainment';
  }
  if (
    /(?:news|breaking|politic|election|world|tech|business|health|science|weather)/.test(normalized)
  ) {
    return 'News';
  }
  return (['News', 'Sports', 'Entertainment'] as const)[Math.abs(rank - 1) % 3]!;
}

export async function getSuggestions(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = parseQuery(request, paginationQuerySchema);
  const rows = await query<{ user_id: string; score: number }>(
    `SELECT candidate.id AS user_id,
       count(DISTINCT mutual.follower_id)::int * 10 + COALESCE(candidate_profile.tweet_count, 0) AS score
     FROM users candidate
     JOIN profiles candidate_profile ON candidate_profile.user_id = candidate.id AND candidate_profile.handle IS NOT NULL
     LEFT JOIN follows mutual ON mutual.following_id = candidate.id AND mutual.follower_id IN (
       SELECT following_id FROM follows WHERE follower_id = $1
     )
     WHERE candidate.id <> $1 AND candidate.status = 'active'
       AND NOT EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = candidate.id)
       AND NOT EXISTS(SELECT 1 FROM blocks b WHERE
         (b.blocker_id = $1 AND b.blocked_id = candidate.id) OR (b.blocker_id = candidate.id AND b.blocked_id = $1))
     GROUP BY candidate.id, candidate_profile.tweet_count
     ORDER BY score DESC, candidate.id LIMIT $2`,
    [session.user.id, input.limit],
  );
  const users = await getUsersByIds(
    rows.map((row) => row.user_id),
    session.user.id,
  );
  return ok({ items: rows.flatMap((row) => users.get(row.user_id) ?? []), nextCursor: null });
}

const notificationQuerySchema = paginationQuerySchema.extend({
  filter: z.enum(['all', 'mentions']).default('all'),
});

export async function getNotifications(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = parseQuery(request, notificationQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const rows = await query<{
    id: string;
    actor_id: string | null;
    tweet_id: string | null;
    type: string;
    message: string | null;
    read_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, actor_id, tweet_id, type, message, read_at, created_at FROM notifications
     WHERE recipient_id = $1 ${input.filter === 'mentions' ? "AND type IN ('mention', 'reply')" : ''}
       AND ($2::timestamptz IS NULL OR (created_at, id) < ($2, $3::bigint))
     ORDER BY created_at DESC, id DESC LIMIT $4`,
    [session.user.id, cursor?.at ?? null, cursor?.id ?? '0', input.limit + 1],
  );
  const page = rows.slice(0, input.limit);
  const [actors, tweets] = await Promise.all([
    getUsersByIds(
      page.flatMap((row) => (row.actor_id ? [row.actor_id] : [])),
      session.user.id,
    ),
    loadTweets(
      page.flatMap((row) => (row.tweet_id ? [String(row.tweet_id)] : [])),
      session.user.id,
    ),
  ]);
  const items: Notification[] = page.map((row) => ({
    id: String(row.id),
    type: mapNotificationType(row.type),
    actor: row.actor_id ? (actors.get(row.actor_id) ?? null) : null,
    tweet: row.tweet_id ? (tweets.get(String(row.tweet_id)) ?? null) : null,
    text: row.message,
    read: Boolean(row.read_at),
    createdAt: row.created_at.toISOString(),
  }));
  const last = page.at(-1);
  return ok({
    items,
    nextCursor:
      rows.length > input.limit && last
        ? encodeCursor({ id: String(last.id), at: last.created_at.toISOString() })
        : null,
  });
}

const markReadSchema = z.object({ ids: z.array(z.string().regex(/^\d+$/)).max(100).optional() });

export async function markNotificationsRead(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = await parseJson(request, markReadSchema);
  await transaction(async (client) => {
    if (input.ids?.length) {
      await client.query(
        'UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE recipient_id = $1 AND id = ANY($2::bigint[])',
        [session.user.id, input.ids],
      );
    } else {
      await client.query(
        'UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE recipient_id = $1',
        [session.user.id],
      );
    }
    await insertOutbox(client, 'notification', session.user.id, 'notification.read', {
      recipientId: session.user.id,
      ids: input.ids ?? null,
    });
  });
  return ok({ read: true });
}

function mapNotificationType(type: string): Notification['type'] {
  if (type === 'poll_vote') return 'poll_result';
  if (type === 'dm') return 'system';
  if (
    ['like', 'retweet', 'follow', 'follow_request', 'mention', 'reply', 'quote', 'system'].includes(
      type,
    )
  ) {
    return type as Notification['type'];
  }
  return 'system';
}
