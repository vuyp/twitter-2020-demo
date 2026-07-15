import {
  createTweetInputSchema,
  handleSchema,
  paginationQuerySchema,
  timelineQuerySchema,
  votePollInputSchema,
  type CreateTweetInput,
  type TimelineEntry,
} from '@twitter2020/contracts';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { decodeCursor, encodeCursor } from '../cursor';
import { query, queryOne, transaction } from '../database';
import { ApiError, badRequest, forbidden, notFound } from '../errors';
import { created, noContent, ok, parseJson, parseQuery, type RouteContext } from '../http';
import { getUserByHandle, loadTweet, loadTweets, getUsersByIds } from '../models';
import { assertRateLimit } from '../rate-limit';
import { getOptionalSession, requireSession } from '../session';
import { insertNotification, insertOutbox } from './users';

const idSchema = z.string().regex(/^\d+$/);
const profileTimelineQuerySchema = paginationQuerySchema.extend({
  tab: z.enum(['tweets', 'replies', 'media', 'likes']).default('tweets'),
  filter: z.enum(['tweets', 'replies', 'media', 'likes']).optional(),
});

export async function createTweet(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  assertRateLimit(`tweet:${session.user.id}`, 100, 60 * 60 * 1000);
  const input = await parseJson(request, createTweetInputSchema);
  const prepared = await prepareComposition(session.user.id, input);

  if (input.draft) {
    const row = await queryOne<{ id: string; updated_at: Date }>(
      `INSERT INTO tweet_drafts (author_id, payload) VALUES ($1, $2::jsonb) RETURNING id, updated_at`,
      [session.user.id, JSON.stringify(prepared.payload)],
    );
    return created({
      kind: 'draft' as const,
      id: String(row!.id),
      updatedAt: row!.updated_at.toISOString(),
    });
  }

  if (input.scheduledAt) {
    const scheduledFor = new Date(input.scheduledAt);
    if (scheduledFor.getTime() < Date.now() + 60_000) {
      badRequest('Scheduled Tweets must be at least one minute in the future', 'invalid_schedule');
    }
    const row = await queryOne<{ id: string }>(
      `INSERT INTO scheduled_tweets (author_id, payload, scheduled_for) VALUES ($1, $2::jsonb, $3) RETURNING id`,
      [session.user.id, JSON.stringify(prepared.payload), scheduledFor],
    );
    return created({
      kind: 'scheduled' as const,
      id: String(row!.id),
      scheduledAt: scheduledFor.toISOString(),
    });
  }

  const tweetId = await publishTweet(session.user.id, input, prepared);
  const tweet = await loadTweet(tweetId, session.user.id);
  return created(tweet);
}

type PreparedComposition = {
  payload: Record<string, unknown>;
  reply: Awaited<ReturnType<typeof loadTweet>>;
  quote: Awaited<ReturnType<typeof loadTweet>>;
  media: Array<{ id: string; type: string; purpose: string | null }>;
};

export async function prepareComposition(
  userId: string,
  input: CreateTweetInput,
): Promise<PreparedComposition> {
  const [reply, quote, media] = await Promise.all([
    input.replyToId ? loadTweet(input.replyToId, userId) : Promise.resolve(null),
    input.quoteTweetId ? loadTweet(input.quoteTweetId, userId) : Promise.resolve(null),
    input.mediaIds.length
      ? query<{
          id: string;
          type: string;
          owner_id: string;
          status: string;
          purpose: string | null;
        }>(
          "SELECT id, type, owner_id, status, variants->>'purpose' AS purpose FROM media WHERE id = ANY($1::bigint[])",
          [input.mediaIds],
        )
      : [],
  ]);
  if (input.replyToId && !reply) notFound('Tweet being replied to');
  if (reply && !reply.viewerState.canReply) forbidden('You cannot reply to this Tweet');
  if (input.quoteTweetId && !quote) notFound('Quoted Tweet');
  if (
    media.length !== input.mediaIds.length ||
    media.some(
      (item) => item.owner_id !== userId || item.status !== 'ready' || item.purpose !== 'tweet',
    )
  ) {
    throw new ApiError(
      422,
      'invalid_media',
      'Every media attachment must be ready and owned by you',
    );
  }
  if (media.length > 1 && media.some((item) => item.type !== 'image')) {
    throw new ApiError(422, 'invalid_media_mix', 'Multiple attachments must all be images');
  }
  return {
    payload: {
      body: input.text,
      mediaIds: input.mediaIds,
      ...(input.poll ? { poll: input.poll } : {}),
      ...(input.replyToId ? { replyToTweetId: input.replyToId } : {}),
      ...(input.quoteTweetId ? { quotedTweetId: input.quoteTweetId } : {}),
      replyAudience: input.replyAudience,
      isSensitive: input.sensitive,
    },
    reply,
    quote,
    media,
  };
}

async function publishTweet(
  userId: string,
  input: CreateTweetInput,
  prepared: PreparedComposition,
): Promise<string> {
  return transaction(async (client) => {
    let threadRootId: string | null = null;
    if (input.replyToId) {
      const parent = await client.query<{
        id: string;
        thread_root_id: string | null;
        author_id: string;
      }>(
        'SELECT id, thread_root_id, author_id FROM tweets WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [input.replyToId],
      );
      if (!parent.rows[0]) notFound('Tweet being replied to');
      threadRootId = parent.rows[0].thread_root_id ?? parent.rows[0].id;
    }

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO tweets
        (author_id, body, reply_to_tweet_id, quoted_tweet_id, thread_root_id, reply_audience, is_sensitive)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        userId,
        input.text,
        input.replyToId ?? null,
        input.quoteTweetId ?? null,
        threadRootId,
        input.replyAudience,
        input.sensitive,
      ],
    );
    const tweetId = String(inserted.rows[0]!.id);

    for (const [position, mediaId] of input.mediaIds.entries()) {
      await client.query(
        `INSERT INTO tweet_media (tweet_id, media_id, position, alt_text)
         SELECT $1, id, $3, NULLIF(variants->>'altText', '') FROM media WHERE id = $2`,
        [tweetId, mediaId, position],
      );
    }
    if (input.poll) {
      const endsAt = new Date(Date.now() + input.poll.durationMinutes * 60_000);
      const poll = await client.query<{ id: string }>(
        'INSERT INTO polls (tweet_id, ends_at) VALUES ($1, $2) RETURNING id',
        [tweetId, endsAt],
      );
      for (const [position, label] of input.poll.options.entries()) {
        await client.query(
          'INSERT INTO poll_options (poll_id, position, label) VALUES ($1, $2, $3)',
          [poll.rows[0]!.id, position, label],
        );
      }
    }

    await indexTweetEntities(client, tweetId, input.text, userId);
    await client.query('UPDATE profiles SET tweet_count = tweet_count + 1 WHERE user_id = $1', [
      userId,
    ]);
    if (input.replyToId && prepared.reply) {
      await client.query(
        'UPDATE tweets SET reply_count = reply_count + 1, last_activity_at = now() WHERE id = $1',
        [input.replyToId],
      );
      await insertNotification(
        client,
        prepared.reply.author.id,
        userId,
        'reply',
        tweetId,
        `reply:${tweetId}`,
      );
      if (prepared.reply.author.id !== userId) {
        await insertOutbox(client, 'notification', tweetId, 'notification.created', {
          recipientId: prepared.reply.author.id,
          actorId: userId,
          tweetId,
          type: 'reply',
        });
      }
    }
    if (input.quoteTweetId && prepared.quote) {
      await client.query(
        'UPDATE tweets SET quote_count = quote_count + 1, last_activity_at = now() WHERE id = $1',
        [input.quoteTweetId],
      );
      await insertNotification(
        client,
        prepared.quote.author.id,
        userId,
        'quote',
        tweetId,
        `quote:${tweetId}`,
      );
      if (prepared.quote.author.id !== userId) {
        await insertOutbox(client, 'notification', tweetId, 'notification.created', {
          recipientId: prepared.quote.author.id,
          actorId: userId,
          tweetId,
          type: 'quote',
        });
      }
    }
    await insertOutbox(client, 'tweet', tweetId, 'tweet.published', { tweetId, authorId: userId });
    return tweetId;
  });
}

type SqlClient = Parameters<Parameters<typeof transaction>[0]>[0];

async function indexTweetEntities(
  client: SqlClient,
  tweetId: string,
  body: string,
  authorId: string,
): Promise<void> {
  const mentionPattern = /@([A-Za-z0-9_]{1,15})/g;
  for (const match of body.matchAll(mentionPattern)) {
    const mentioned = await client.query<{ user_id: string }>(
      `SELECT p.user_id FROM profiles p JOIN users u ON u.id = p.user_id
       WHERE lower(p.handle) = lower($1) AND u.status = 'active'
         AND NOT EXISTS(SELECT 1 FROM blocks b WHERE
           (b.blocker_id = p.user_id AND b.blocked_id = $2) OR
           (b.blocker_id = $2 AND b.blocked_id = p.user_id))
       LIMIT 1`,
      [match[1], authorId],
    );
    const mentionedId = mentioned.rows[0]?.user_id;
    if (!mentionedId) continue;
    await client.query(
      `INSERT INTO tweet_mentions (tweet_id, user_id, start_offset, end_offset)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [tweetId, mentionedId, match.index, match.index + match[0].length],
    );
    await insertNotification(
      client,
      mentionedId,
      authorId,
      'mention',
      tweetId,
      `mention:${tweetId}:${mentionedId}`,
    );
    if (mentionedId !== authorId) {
      await insertOutbox(client, 'notification', tweetId, 'notification.created', {
        recipientId: mentionedId,
        actorId: authorId,
        tweetId,
        type: 'mention',
      });
    }
  }

  const tags = [
    ...new Set(
      [...body.matchAll(/#([\p{L}\p{N}_]{1,100})/gu)].map((match) => match[1]!.toLowerCase()),
    ),
  ];
  for (const tag of tags) {
    const hashtag = await client.query<{ id: string }>(
      `INSERT INTO hashtags (tag, use_count, last_used_at) VALUES ($1, 1, now())
       ON CONFLICT ((lower(tag))) DO UPDATE SET use_count = hashtags.use_count + 1, last_used_at = now()
       RETURNING id`,
      [tag],
    );
    await client.query(
      'INSERT INTO tweet_hashtags (tweet_id, hashtag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [tweetId, hashtag.rows[0]!.id],
    );
    const topic = await client.query<{ id: string }>(
      `INSERT INTO topics (slug, name, description)
       VALUES ($1, left(initcap(replace($1, '_', ' ')), 100), $2)
       ON CONFLICT (slug) DO UPDATE SET active = true
       RETURNING id`,
      [tag, `Tweets about #${tag}.`],
    );
    await client.query(
      `INSERT INTO topic_tweets (topic_id, tweet_id, confidence)
       VALUES ($1, $2, 100) ON CONFLICT DO NOTHING`,
      [topic.rows[0]!.id, tweetId],
    );
  }
}

export async function getTweet(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const { id } = await context.params;
  idSchema.parse(id);
  const session = await getOptionalSession(request);
  const tweet = await loadTweet(id, session?.user.id ?? null);
  if (!tweet) notFound('Tweet');
  return ok(tweet);
}

export async function deleteTweet(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  idSchema.parse(id);
  await transaction(async (client) => {
    const target = await client.query<{
      author_id: string;
      reply_to_tweet_id: string | null;
      quoted_tweet_id: string | null;
    }>(
      'SELECT author_id, reply_to_tweet_id, quoted_tweet_id FROM tweets WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [id],
    );
    const tweet = target.rows[0];
    if (!tweet) notFound('Tweet');
    if (tweet.author_id !== session.user.id) forbidden('Only the author can delete this Tweet');
    await client.query(
      "UPDATE tweets SET deleted_at = now(), body = '', updated_at = now() WHERE id = $1",
      [id],
    );
    await client.query(
      'UPDATE profiles SET tweet_count = GREATEST(0, tweet_count - 1) WHERE user_id = $1',
      [session.user.id],
    );
    if (tweet.reply_to_tweet_id) {
      await client.query(
        'UPDATE tweets SET reply_count = GREATEST(0, reply_count - 1) WHERE id = $1',
        [tweet.reply_to_tweet_id],
      );
    }
    if (tweet.quoted_tweet_id) {
      await client.query(
        'UPDATE tweets SET quote_count = GREATEST(0, quote_count - 1) WHERE id = $1',
        [tweet.quoted_tweet_id],
      );
    }
    await insertOutbox(client, 'tweet', id, 'tweet.deleted', {
      tweetId: id,
      authorId: session.user.id,
    });
  });
  return noContent();
}

export async function getReplies(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const { id } = await context.params;
  idSchema.parse(id);
  const session = await getOptionalSession(request);
  const parent = await loadTweet(id, session?.user.id ?? null);
  if (!parent) notFound('Tweet');
  const pagination = parseQuery(request, paginationQuerySchema);
  const cursor = decodeCursor(pagination.cursor);
  const rows = await query<{ id: string; published_at: Date }>(
    `SELECT id, published_at FROM tweets
     WHERE reply_to_tweet_id = $1 AND deleted_at IS NULL
       AND ($2::timestamptz IS NULL OR (published_at, id) < ($2, $3::bigint))
     ORDER BY published_at DESC, id DESC LIMIT $4`,
    [id, cursor?.at ?? null, cursor?.id ?? '0', pagination.limit + 1],
  );
  return timelineResponse(rows, session?.user.id ?? null, pagination.limit);
}

export async function replyToTweet(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const { id } = await context.params;
  idSchema.parse(id);
  const body = (await request.json()) as Record<string, unknown>;
  const forwarded = new Request(request.url, {
    method: 'POST',
    headers: request.headers,
    body: JSON.stringify({ ...body, replyToId: id }),
  });
  return createTweet(forwarded as NextRequest);
}

export async function getHomeTimeline(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = parseQuery(request, timelineQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const ordering = input.mode === 'top' ? 'score DESC, id DESC' : 'event_at DESC, id DESC';
  const cursorFilter =
    input.mode === 'top'
      ? 'AND ($2::double precision IS NULL OR score < $2 OR (score = $2 AND id < $3::bigint))'
      : 'AND ($2::timestamptz IS NULL OR (event_at, id) < ($2, $3::bigint))';
  const rows = await query<{
    id: string;
    event_at: Date;
    score: number;
    context_user_id: string | null;
  }>(
    `WITH candidate_events AS (
       SELECT t.id, t.published_at AS event_at, NULL::text AS context_user_id,
         ((t.like_count * 1.0 + t.retweet_count * 2.0 + t.reply_count * 1.5 + t.quote_count * 2.0 + 1.0) /
           power((extract(epoch FROM (now() - t.published_at)) / 3600.0) + 2.0, 1.25))::double precision AS score
       FROM tweets t
       WHERE t.deleted_at IS NULL AND (t.author_id = $1 OR EXISTS(
         SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = t.author_id
       ))
       UNION ALL
       SELECT t.id, r.created_at AS event_at, r.user_id AS context_user_id,
         ((t.like_count * 1.0 + t.retweet_count * 2.0 + t.reply_count * 1.5 + t.quote_count * 2.0 + 2.0) /
           power((extract(epoch FROM (now() - r.created_at)) / 3600.0) + 2.0, 1.25))::double precision AS score
       FROM retweets r JOIN tweets t ON t.id = r.tweet_id
       WHERE t.deleted_at IS NULL AND EXISTS(
         SELECT 1 FROM follows f WHERE f.follower_id = $1 AND f.following_id = r.user_id
       )
       UNION ALL
       SELECT t.id, t.published_at AS event_at, NULL::text AS context_user_id,
         ((t.like_count * 1.0 + t.retweet_count * 2.0 + t.reply_count * 1.5 + t.quote_count * 2.0 + 1.5) /
           power((extract(epoch FROM (now() - t.published_at)) / 3600.0) + 2.0, 1.25))::double precision AS score
       FROM user_topics ut
       JOIN topic_tweets tt ON tt.topic_id = ut.topic_id
       JOIN tweets t ON t.id = tt.tweet_id
       WHERE ut.user_id = $1 AND t.deleted_at IS NULL
     ), deduplicated AS (
       SELECT DISTINCT ON (id) id, event_at, context_user_id, score
       FROM candidate_events ORDER BY id, event_at DESC
     )
     SELECT d.* FROM deduplicated d
     WHERE NOT EXISTS (
       SELECT 1 FROM tweets t JOIN mutes m
         ON m.muted_id = t.author_id OR m.muted_id = d.context_user_id
       WHERE t.id = d.id AND m.muter_id = $1 AND (m.expires_at IS NULL OR m.expires_at > now())
     ) ${cursorFilter}
     ORDER BY ${ordering} LIMIT $4`,
    input.mode === 'top'
      ? [session.user.id, cursor?.score ?? null, cursor?.id ?? '0', input.limit + 1]
      : [session.user.id, cursor?.at ?? null, cursor?.id ?? '0', input.limit + 1],
  );
  return timelineResponse(rows, session.user.id, input.limit, input.mode);
}

export async function getProfileTimeline(
  request: NextRequest,
  context: RouteContext<{ handle: string }>,
): Promise<Response> {
  const { handle } = await context.params;
  handleSchema.parse(handle);
  const session = await getOptionalSession(request);
  const input = parseQuery(request, profileTimelineQuerySchema);
  const profileTab = input.filter ?? input.tab;
  const cursor = decodeCursor(input.cursor);
  const owner = await getUserByHandle(handle, session?.user.id ?? null);
  if (!owner) notFound('Account');
  const isOwner = owner.id === session?.user.id;
  if (owner.protected && !isOwner && !owner.relationship?.following) {
    forbidden('These Tweets are protected');
  }

  const tabJoin =
    profileTab === 'likes'
      ? 'JOIN likes activity ON activity.tweet_id = t.id AND activity.user_id = $1'
      : '';
  const tabFilter =
    profileTab === 'replies'
      ? 'AND t.reply_to_tweet_id IS NOT NULL'
      : profileTab === 'media'
        ? 'AND EXISTS(SELECT 1 FROM tweet_media tm WHERE tm.tweet_id = t.id)'
        : profileTab === 'tweets'
          ? 'AND t.reply_to_tweet_id IS NULL'
          : '';
  const rows = await query<{ id: string; published_at: Date }>(
    `SELECT t.id, t.published_at FROM tweets t ${tabJoin}
     WHERE ${profileTab === 'likes' ? 'true' : 't.author_id = $1'} AND t.deleted_at IS NULL ${tabFilter}
       AND ($2::timestamptz IS NULL OR (t.published_at, t.id) < ($2, $3::bigint))
     ORDER BY t.published_at DESC, t.id DESC LIMIT $4`,
    [owner.id, cursor?.at ?? null, cursor?.id ?? '0', input.limit + 1],
  );
  return timelineResponse(rows, session?.user.id ?? null, input.limit);
}

export async function getBookmarks(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = parseQuery(request, paginationQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const rows = await query<{ id: string; published_at: Date; event_at: Date }>(
    `SELECT t.id, t.published_at, b.created_at AS event_at FROM bookmarks b JOIN tweets t ON t.id = b.tweet_id
     WHERE b.user_id = $1 AND t.deleted_at IS NULL
       AND ($2::timestamptz IS NULL OR (b.created_at, t.id) < ($2, $3::bigint))
     ORDER BY b.created_at DESC, t.id DESC LIMIT $4`,
    [session.user.id, cursor?.at ?? null, cursor?.id ?? '0', input.limit + 1],
  );
  return timelineResponse(rows, session.user.id, input.limit);
}

async function timelineResponse(
  rows: Array<{
    id: string;
    published_at?: Date;
    event_at?: Date;
    score?: number;
    context_user_id?: string | null;
  }>,
  viewerId: string | null,
  limit: number,
  mode: 'top' | 'latest' = 'latest',
): Promise<Response> {
  const page = rows.slice(0, limit);
  const tweets = await loadTweets(
    page.map((row) => String(row.id)),
    viewerId,
  );
  const contextUsers = await getUsersByIds(
    page.flatMap((row) => (row.context_user_id ? [row.context_user_id] : [])),
    viewerId,
  );
  const items: TimelineEntry[] = page.flatMap((row) => {
    const tweet = tweets.get(String(row.id));
    if (!tweet) return [];
    return [
      {
        tweet,
        context: row.context_user_id
          ? {
              type: 'retweet' as const,
              user: contextUsers.get(row.context_user_id),
              label: 'Retweeted',
            }
          : null,
      },
    ];
  });
  const last = page.at(-1);
  const eventAt = last?.event_at ?? last?.published_at;
  const nextCursor =
    rows.length > limit && last && eventAt
      ? encodeCursor({
          id: String(last.id),
          at: eventAt.toISOString(),
          ...(mode === 'top' && last.score !== undefined ? { score: Number(last.score) } : {}),
        })
      : null;
  return ok({ items, nextCursor });
}

type Interaction = 'like' | 'retweet' | 'bookmark';
const interactionConfig = {
  like: { table: 'likes', counter: 'like_count', notification: 'like' },
  retweet: { table: 'retweets', counter: 'retweet_count', notification: 'retweet' },
  bookmark: { table: 'bookmarks', counter: 'bookmark_count', notification: null },
} as const;

export async function addInteraction(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
  interaction: Interaction,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  idSchema.parse(id);
  const target = await loadTweet(id, session.user.id);
  if (!target || target.deleted) notFound('Tweet');
  const config = interactionConfig[interaction];
  await transaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO ${config.table} (user_id, tweet_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING user_id`,
      [session.user.id, id],
    );
    if (!inserted.rowCount) return;
    await client.query(
      `UPDATE tweets SET ${config.counter} = ${config.counter} + 1, last_activity_at = now() WHERE id = $1`,
      [id],
    );
    if (config.notification) {
      await insertNotification(
        client,
        target.author.id,
        session.user.id,
        config.notification,
        id,
        `${interaction}:${id}:${session.user.id}`,
      );
    }
    if (config.notification && target.author.id !== session.user.id) {
      await insertOutbox(client, 'notification', id, 'notification.created', {
        recipientId: target.author.id,
        actorId: session.user.id,
        tweetId: id,
        type: config.notification,
      });
    }
  });
  const updated = await loadTweet(id, session.user.id);
  return ok({ tweetId: id, active: true, counts: updated!.counts });
}

export async function removeInteraction(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
  interaction: Interaction,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  idSchema.parse(id);
  const config = interactionConfig[interaction];
  await transaction(async (client) => {
    const removed = await client.query(
      `DELETE FROM ${config.table} WHERE user_id = $1 AND tweet_id = $2 RETURNING user_id`,
      [session.user.id, id],
    );
    if (!removed.rowCount) return;
    await client.query(
      `UPDATE tweets SET ${config.counter} = GREATEST(0, ${config.counter} - 1) WHERE id = $1`,
      [id],
    );
    if (config.notification) {
      await client.query('DELETE FROM notifications WHERE recipient_id <> $1 AND dedupe_key = $2', [
        session.user.id,
        `${interaction}:${id}:${session.user.id}`,
      ]);
    }
  });
  const updated = await loadTweet(id, session.user.id);
  if (!updated) notFound('Tweet');
  return ok({ tweetId: id, active: false, counts: updated.counts });
}

export async function votePoll(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  idSchema.parse(id);
  const visibleTweet = await loadTweet(id, session.user.id);
  if (!visibleTweet || visibleTweet.deleted || !visibleTweet.poll) notFound('Poll');
  const input = await parseJson(request, votePollInputSchema);
  await transaction(async (client) => {
    const poll = await client.query<{ poll_id: string; option_id: string }>(
      `SELECT p.id AS poll_id, po.id AS option_id FROM polls p JOIN poll_options po ON po.poll_id = p.id
       WHERE p.tweet_id = $1 AND po.id = $2 AND p.ends_at > now() FOR UPDATE OF p`,
      [id, input.optionId],
    );
    if (!poll.rows[0])
      throw new ApiError(409, 'poll_closed', 'This poll is closed or the option does not exist');
    const inserted = await client.query(
      `INSERT INTO poll_votes (poll_id, option_id, voter_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING voter_id`,
      [poll.rows[0].poll_id, poll.rows[0].option_id, session.user.id],
    );
    if (!inserted.rowCount)
      throw new ApiError(409, 'already_voted', 'You have already voted in this poll');
    await client.query('UPDATE polls SET vote_count = vote_count + 1 WHERE id = $1', [
      poll.rows[0].poll_id,
    ]);
    await client.query('UPDATE poll_options SET vote_count = vote_count + 1 WHERE id = $1', [
      poll.rows[0].option_id,
    ]);
  });
  const tweet = await loadTweet(id, session.user.id);
  return ok(tweet?.poll ?? null);
}
