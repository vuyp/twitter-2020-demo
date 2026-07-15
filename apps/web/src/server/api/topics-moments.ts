import {
  createMomentInputSchema,
  momentTweetInputSchema,
  paginationQuerySchema,
  updateMomentInputSchema,
} from '@twitter2020/contracts';
import type { NextRequest } from 'next/server';
import { decodeCursor, encodeCursor } from '../cursor';
import { query, queryOne, transaction } from '../database';
import { forbidden, notFound } from '../errors';
import { created, noContent, ok, parseJson, parseQuery, type RouteContext } from '../http';
import { getUsersByIds, loadTweet, loadTweets } from '../models';
import { getOptionalSession, requireSession } from '../session';
import { publicMediaUrl } from '../storage';
import { insertOutbox } from './users';

export async function getTopics(request: NextRequest): Promise<Response> {
  const session = await getOptionalSession(request);
  const input = parseQuery(request, paginationQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const rows = await query<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    created_at: Date;
    following: boolean;
    tweet_count: number;
  }>(
    `SELECT t.id, t.slug, t.name, t.description, t.created_at,
       CASE WHEN $1::text IS NULL THEN false ELSE EXISTS(
         SELECT 1 FROM user_topics ut WHERE ut.topic_id = t.id AND ut.user_id = $1
       ) END AS following,
       (SELECT count(*)::int FROM topic_tweets tt JOIN tweets tw ON tw.id = tt.tweet_id
        JOIN users topic_user ON topic_user.id = tw.author_id
        LEFT JOIN user_settings topic_settings ON topic_settings.user_id = tw.author_id
        WHERE tt.topic_id = t.id AND tw.deleted_at IS NULL AND topic_user.status = 'active'
          AND COALESCE(topic_settings.protected_account, false) = false) AS tweet_count
     FROM topics t WHERE t.active = true
       AND EXISTS (
         SELECT 1 FROM topic_tweets visible_topic_tweet
         JOIN tweets visible_tweet ON visible_tweet.id = visible_topic_tweet.tweet_id
         JOIN users visible_author ON visible_author.id = visible_tweet.author_id
         LEFT JOIN user_settings visible_settings ON visible_settings.user_id = visible_tweet.author_id
         WHERE visible_topic_tweet.topic_id = t.id AND visible_tweet.deleted_at IS NULL
           AND visible_author.status = 'active'
           AND COALESCE(visible_settings.protected_account, false) = false
       )
       AND ($2::timestamptz IS NULL OR (t.created_at, t.id) < ($2, $3::bigint))
     ORDER BY t.created_at DESC, t.id DESC LIMIT $4`,
    [session?.user.id ?? null, cursor?.at ?? null, cursor?.id ?? '0', input.limit + 1],
  );
  const page = rows.slice(0, input.limit);
  const last = page.at(-1);
  return ok({
    items: page.map((row) => ({
      id: String(row.id),
      slug: row.slug,
      name: row.name,
      description: row.description,
      following: row.following,
      tweetCount: row.tweet_count,
    })),
    nextCursor:
      rows.length > input.limit && last
        ? encodeCursor({ id: String(last.id), at: last.created_at.toISOString() })
        : null,
  });
}

export async function followTopic(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  const rows = await query(
    `INSERT INTO user_topics (user_id, topic_id)
     SELECT $1, id FROM topics WHERE id = $2 AND active = true ON CONFLICT DO NOTHING RETURNING topic_id`,
    [session.user.id, id],
  );
  if (!rows.length) {
    const exists = await queryOne('SELECT id FROM topics WHERE id = $1', [id]);
    if (!exists) notFound('Topic');
  }
  return ok({ topicId: id, following: true });
}

export async function unfollowTopic(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  await query('DELETE FROM user_topics WHERE user_id = $1 AND topic_id = $2', [
    session.user.id,
    id,
  ]);
  return ok({ topicId: id, following: false });
}

export async function getTopicTimeline(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await getOptionalSession(request);
  const { id } = await context.params;
  const input = parseQuery(request, paginationQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const rows = await query<{ id: string; published_at: Date }>(
    `SELECT tw.id, tw.published_at FROM topic_tweets tt JOIN tweets tw ON tw.id = tt.tweet_id
     JOIN users topic_user ON topic_user.id = tw.author_id
     LEFT JOIN user_settings topic_settings ON topic_settings.user_id = tw.author_id
     WHERE tt.topic_id = $1 AND tw.deleted_at IS NULL AND topic_user.status = 'active'
       AND (COALESCE(topic_settings.protected_account, false) = false OR tw.author_id = $5 OR EXISTS(
         SELECT 1 FROM follows f WHERE f.follower_id = $5 AND f.following_id = tw.author_id
       ))
       AND ($2::timestamptz IS NULL OR (tw.published_at, tw.id) < ($2, $3::bigint))
     ORDER BY tw.published_at DESC, tw.id DESC LIMIT $4`,
    [id, cursor?.at ?? null, cursor?.id ?? '0', input.limit + 1, session?.user.id ?? null],
  );
  const page = rows.slice(0, input.limit);
  const tweets = await loadTweets(
    page.map((row) => String(row.id)),
    session?.user.id ?? null,
  );
  const last = page.at(-1);
  return ok({
    items: page.flatMap((row) => {
      const tweet = tweets.get(String(row.id));
      return tweet ? [{ tweet, context: { type: 'topic' as const, label: 'Topic' } }] : [];
    }),
    nextCursor:
      rows.length > input.limit && last
        ? encodeCursor({ id: String(last.id), at: last.published_at.toISOString() })
        : null,
  });
}

type MomentRow = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  status: 'draft' | 'published' | 'unlisted';
  cover_key: string | null;
  created_at: Date;
};

export async function getMoments(request: NextRequest): Promise<Response> {
  const session = await getOptionalSession(request);
  const input = parseQuery(request, paginationQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const rows = await query<MomentRow>(
    `${momentSelect()} WHERE (m.status = 'published' OR m.owner_id = $1)
       AND ($2::timestamptz IS NULL OR (m.created_at, m.id) < ($2, $3::bigint))
     ORDER BY m.created_at DESC, m.id DESC LIMIT $4`,
    [session?.user.id ?? null, cursor?.at ?? null, cursor?.id ?? '0', input.limit + 1],
  );
  const page = rows.slice(0, input.limit);
  const items = await hydrateMoments(page, session?.user.id ?? null);
  const last = page.at(-1);
  return ok({
    items,
    nextCursor:
      rows.length > input.limit && last
        ? encodeCursor({ id: String(last.id), at: last.created_at.toISOString() })
        : null,
  });
}

export async function createMoment(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = await parseJson(request, createMomentInputSchema);
  if (input.coverMediaId) await assertCover(input.coverMediaId, session.user.id);
  const row = await queryOne<MomentRow>(`${momentInsertReturning()}`, [
    session.user.id,
    input.title,
    input.description,
    input.coverMediaId ?? null,
  ]);
  return created((await hydrateMoments([row!], session.user.id))[0]);
}

export async function getMoment(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await getOptionalSession(request);
  const { id } = await context.params;
  const row = await queryOne<MomentRow>(
    `${momentSelect()} WHERE m.id = $2 AND (m.status IN ('published','unlisted') OR m.owner_id = $1)`,
    [session?.user.id ?? null, id],
  );
  if (!row) notFound('Moment');
  const moment = (await hydrateMoments([row], session?.user.id ?? null))[0];
  const tweetRows = await query<{ tweet_id: string }>(
    'SELECT tweet_id FROM moment_tweets WHERE moment_id = $1 ORDER BY position',
    [id],
  );
  const tweets = await loadTweets(
    tweetRows.map((item) => String(item.tweet_id)),
    session?.user.id ?? null,
  );
  return ok({
    ...moment,
    tweets: tweetRows.flatMap((item) => tweets.get(String(item.tweet_id)) ?? []),
  });
}

export async function updateMoment(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  const input = await parseJson(request, updateMomentInputSchema);
  if (input.coverMediaId) await assertCover(input.coverMediaId, session.user.id);
  const row = await queryOne<MomentRow>(
    `UPDATE moments SET title = COALESCE($3, title), description = COALESCE($4, description),
       cover_media_id = CASE WHEN $6 THEN $5 ELSE cover_media_id END, updated_at = now()
     WHERE id = $1 AND owner_id = $2
     RETURNING id, owner_id, title, description, status, NULL::text AS cover_key, created_at`,
    [
      id,
      session.user.id,
      input.title ?? null,
      input.description ?? null,
      input.coverMediaId ?? null,
      Object.hasOwn(input, 'coverMediaId'),
    ],
  );
  if (!row) notFound('Moment');
  const current = await queryOne<MomentRow>(`${momentSelect()} WHERE m.id = $1`, [id]);
  return ok((await hydrateMoments([current!], session.user.id))[0]);
}

export async function deleteMoment(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  const rows = await query('DELETE FROM moments WHERE id = $1 AND owner_id = $2 RETURNING id', [
    id,
    session.user.id,
  ]);
  if (!rows.length) notFound('Moment');
  return noContent();
}

export async function publishMoment(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  const row = await queryOne<MomentRow>(
    `UPDATE moments SET status = 'published', published_at = COALESCE(published_at, now()), updated_at = now()
     WHERE id = $1 AND owner_id = $2
       AND EXISTS(SELECT 1 FROM moment_tweets mt WHERE mt.moment_id = moments.id)
     RETURNING id, owner_id, title, description, status, NULL::text AS cover_key, created_at`,
    [id, session.user.id],
  );
  if (!row) notFound('Moment with at least one Tweet');
  return ok((await hydrateMoments([row], session.user.id))[0]);
}

export async function addMomentTweet(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  const input = await parseJson(request, momentTweetInputSchema);
  const tweet = await loadTweet(input.tweetId, session.user.id);
  if (!tweet) notFound('Tweet');
  await transaction(async (client) => {
    const owner = await client.query(
      'SELECT 1 FROM moments WHERE id = $1 AND owner_id = $2 FOR UPDATE',
      [id, session.user.id],
    );
    if (!owner.rowCount) notFound('Moment');
    await client.query(
      `INSERT INTO moment_tweets (moment_id, tweet_id, position)
       VALUES ($1, $2, COALESCE((SELECT max(position) + 1 FROM moment_tweets WHERE moment_id = $1), 0))
       ON CONFLICT DO NOTHING`,
      [id, input.tweetId],
    );
    await insertOutbox(client, 'moment', id, 'moment.updated', { momentId: id });
  });
  return ok({ momentId: id, tweetId: input.tweetId, added: true });
}

export async function removeMomentTweet(
  request: NextRequest,
  context: RouteContext<{ id: string; tweetId: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id, tweetId } = await context.params;
  const rows = await query(
    `DELETE FROM moment_tweets mt USING moments m
     WHERE mt.moment_id = m.id AND mt.moment_id = $1 AND mt.tweet_id = $2 AND m.owner_id = $3
     RETURNING mt.tweet_id`,
    [id, tweetId, session.user.id],
  );
  if (!rows.length) notFound('Moment Tweet');
  return noContent();
}

function momentSelect(): string {
  return `SELECT m.id, m.owner_id, m.title, m.description, m.status,
    cover.storage_key AS cover_key, m.created_at FROM moments m
    LEFT JOIN media cover ON cover.id = m.cover_media_id AND cover.status = 'ready'`;
}

function momentInsertReturning(): string {
  return `INSERT INTO moments (owner_id, title, description, cover_media_id)
    VALUES ($1, $2, $3, $4)
    RETURNING id, owner_id, title, description, status, NULL::text AS cover_key, created_at`;
}

async function hydrateMoments(rows: MomentRow[], viewerId: string | null) {
  const owners = await getUsersByIds(
    rows.map((row) => row.owner_id),
    viewerId,
  );
  return rows.flatMap((row) => {
    const owner = owners.get(row.owner_id);
    return owner
      ? [
          {
            id: String(row.id),
            title: row.title,
            description: row.description,
            coverMediaUrl: row.cover_key ? publicMediaUrl(row.cover_key) : null,
            owner,
            published: row.status === 'published',
            createdAt: row.created_at.toISOString(),
          },
        ]
      : [];
  });
}

async function assertCover(mediaId: string, ownerId: string): Promise<void> {
  const media = await queryOne<{ id: string }>(
    `SELECT id FROM media WHERE id = $1 AND owner_id = $2 AND type = 'image' AND status = 'ready'
       AND variants->>'purpose' = 'banner'`,
    [mediaId, ownerId],
  );
  if (!media) forbidden('That cover image is not ready or does not belong to you');
}
