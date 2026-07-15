import {
  createListInputSchema,
  paginationQuerySchema,
  updateListInputSchema,
  type TwitterList,
  type TwitterListDetail,
  type UserSummary,
} from '@twitter2020/contracts';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { decodeCursor, encodeCursor } from '../cursor';
import { query, queryOne, transaction } from '../database';
import { forbidden, notFound } from '../errors';
import { created, noContent, ok, parseJson, parseQuery, type RouteContext } from '../http';
import { getUsersByIds, loadTweets } from '../models';
import { getOptionalSession, requireSession } from '../session';
import { publicMediaUrl } from '../storage';

type ListRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  visibility: 'public' | 'private';
  member_count: number;
  follower_count: number;
  created_at: Date;
  updated_at: Date;
  banner_key: string | null;
  following: boolean;
};

const listQuerySchema = paginationQuerySchema.extend({
  filter: z.enum(['all', 'owned', 'subscribed', 'member']).default('all'),
});

export async function getLists(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = parseQuery(request, listQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const rows = await query<ListRow>(
    `${listSelect('$1')}
     WHERE ${
       input.filter === 'owned'
         ? 'l.owner_id = $1'
         : input.filter === 'subscribed'
           ? 'EXISTS(SELECT 1 FROM list_followers lf WHERE lf.list_id = l.id AND lf.user_id = $1)'
           : input.filter === 'member'
             ? 'EXISTS(SELECT 1 FROM list_members lm WHERE lm.list_id = l.id AND lm.user_id = $1)'
             : '(l.owner_id = $1 OR EXISTS(SELECT 1 FROM list_followers lf WHERE lf.list_id = l.id AND lf.user_id = $1) OR EXISTS(SELECT 1 FROM list_members lm WHERE lm.list_id = l.id AND lm.user_id = $1))'
     }
       AND (l.visibility = 'public' OR l.owner_id = $1)
       AND ($2::timestamptz IS NULL OR (l.updated_at, l.id) < ($2, $3::bigint))
     ORDER BY l.updated_at DESC, l.id DESC LIMIT $4`,
    [session.user.id, cursor?.at ?? null, cursor?.id ?? '0', input.limit + 1],
  );
  const page = rows.slice(0, input.limit);
  const items = await hydrateLists(page, session.user.id);
  const last = page.at(-1);
  return ok({
    items,
    nextCursor:
      rows.length > input.limit && last
        ? encodeCursor({ id: String(last.id), at: last.updated_at.toISOString() })
        : null,
  });
}

export async function createList(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = await parseJson(request, createListInputSchema);
  if (input.bannerMediaId) await assertBanner(input.bannerMediaId, session.user.id);
  const row = await queryOne<ListRow>(`${listInsertReturning()}`, [
    session.user.id,
    input.name,
    input.description,
    input.private ? 'private' : 'public',
    input.bannerMediaId ?? null,
  ]);
  return created((await hydrateLists([row!], session.user.id))[0]);
}

export async function getList(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await getOptionalSession(request);
  const { id } = await context.params;
  const row = await queryOne<ListRow>(
    `${listSelect('$1')}
     WHERE l.id = $2 AND (l.visibility = 'public' OR l.owner_id = $1) LIMIT 1`,
    [session?.user.id ?? null, id],
  );
  if (!row) notFound('List');
  const list = (await hydrateLists([row], session?.user.id ?? null))[0];
  if (!list) notFound('List');

  if (row.owner_id !== session?.user.id) return ok(list);

  const members = await getListMembers(String(row.id), session.user.id);
  return ok({ ...list, members } satisfies TwitterListDetail);
}

export async function updateList(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  const input = await parseJson(request, updateListInputSchema);
  if (input.bannerMediaId) await assertBanner(input.bannerMediaId, session.user.id);
  const row = await queryOne<ListRow>(
    `UPDATE lists SET
       name = COALESCE($3, name), description = COALESCE($4, description),
       visibility = COALESCE($5, visibility), banner_media_id = CASE WHEN $7 THEN $6 ELSE banner_media_id END,
       updated_at = now()
     WHERE id = $1 AND owner_id = $2
     RETURNING id, owner_id, name, description, visibility, member_count, follower_count, created_at, updated_at,
       NULL::text AS banner_key, false AS following`,
    [
      id,
      session.user.id,
      input.name ?? null,
      input.description ?? null,
      input.private === undefined ? null : input.private ? 'private' : 'public',
      input.bannerMediaId ?? null,
      Object.hasOwn(input, 'bannerMediaId'),
    ],
  );
  if (!row) notFound('List');
  const current = await queryOne<ListRow>(`${listSelect('$1')} WHERE l.id = $2`, [
    session.user.id,
    id,
  ]);
  return ok((await hydrateLists([current!], session.user.id))[0]);
}

export async function deleteList(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  const removed = await query('DELETE FROM lists WHERE id = $1 AND owner_id = $2 RETURNING id', [
    id,
    session.user.id,
  ]);
  if (!removed.length) notFound('List');
  return noContent();
}

export async function addListMember(
  request: NextRequest,
  context: RouteContext<{ id: string; userId: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id, userId } = await context.params;
  await transaction(async (client) => {
    const owner = await client.query(
      'SELECT 1 FROM lists WHERE id = $1 AND owner_id = $2 FOR UPDATE',
      [id, session.user.id],
    );
    if (!owner.rowCount) notFound('List');
    const inserted = await client.query(
      `INSERT INTO list_members (list_id, user_id, added_by_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING user_id`,
      [id, userId, session.user.id],
    );
    if (inserted.rowCount) {
      await client.query(
        'UPDATE lists SET member_count = member_count + 1, updated_at = now() WHERE id = $1',
        [id],
      );
      await client.query('UPDATE profiles SET listed_count = listed_count + 1 WHERE user_id = $1', [
        userId,
      ]);
    }
  });
  return ok({ listId: id, userId, member: true });
}

export async function removeListMember(
  request: NextRequest,
  context: RouteContext<{ id: string; userId: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id, userId } = await context.params;
  await transaction(async (client) => {
    const owner = await client.query(
      'SELECT 1 FROM lists WHERE id = $1 AND owner_id = $2 FOR UPDATE',
      [id, session.user.id],
    );
    if (!owner.rowCount) notFound('List');
    const removed = await client.query(
      'DELETE FROM list_members WHERE list_id = $1 AND user_id = $2 RETURNING user_id',
      [id, userId],
    );
    if (removed.rowCount) {
      await client.query(
        'UPDATE lists SET member_count = GREATEST(0, member_count - 1), updated_at = now() WHERE id = $1',
        [id],
      );
      await client.query(
        'UPDATE profiles SET listed_count = GREATEST(0, listed_count - 1) WHERE user_id = $1',
        [userId],
      );
    }
  });
  return ok({ listId: id, userId, member: false });
}

export async function followList(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  return changeListFollow(request, context, true);
}

export async function unfollowList(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  return changeListFollow(request, context, false);
}

async function changeListFollow(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
  follow: boolean,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  await transaction(async (client) => {
    const target = await client.query<{ owner_id: string; visibility: string }>(
      'SELECT owner_id, visibility FROM lists WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (
      !target.rows[0] ||
      (target.rows[0].visibility === 'private' && target.rows[0].owner_id !== session.user.id)
    )
      notFound('List');
    if (follow) {
      const inserted = await client.query(
        'INSERT INTO list_followers (list_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING user_id',
        [id, session.user.id],
      );
      if (inserted.rowCount)
        await client.query('UPDATE lists SET follower_count = follower_count + 1 WHERE id = $1', [
          id,
        ]);
    } else {
      const removed = await client.query(
        'DELETE FROM list_followers WHERE list_id = $1 AND user_id = $2 RETURNING user_id',
        [id, session.user.id],
      );
      if (removed.rowCount)
        await client.query(
          'UPDATE lists SET follower_count = GREATEST(0, follower_count - 1) WHERE id = $1',
          [id],
        );
    }
  });
  return ok({ listId: id, following: follow });
}

export async function getListTimeline(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await getOptionalSession(request);
  const { id } = await context.params;
  const input = parseQuery(request, paginationQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const allowed = await queryOne<{ id: string }>(
    `SELECT id FROM lists WHERE id = $1 AND (visibility = 'public' OR owner_id = $2)`,
    [id, session?.user.id ?? null],
  );
  if (!allowed) notFound('List');
  const rows = await query<{ id: string; published_at: Date }>(
    `SELECT t.id, t.published_at FROM tweets t JOIN list_members lm ON lm.user_id = t.author_id
     WHERE lm.list_id = $1 AND t.deleted_at IS NULL
       AND ($2::timestamptz IS NULL OR (t.published_at, t.id) < ($2, $3::bigint))
     ORDER BY t.published_at DESC, t.id DESC LIMIT $4`,
    [id, cursor?.at ?? null, cursor?.id ?? '0', input.limit + 1],
  );
  const page = rows.slice(0, input.limit);
  const tweets = await loadTweets(
    page.map((row) => String(row.id)),
    session?.user.id ?? null,
  );
  const items = page.flatMap((row) => {
    const tweet = tweets.get(String(row.id));
    return tweet ? [{ tweet, context: null }] : [];
  });
  const last = page.at(-1);
  return ok({
    items,
    nextCursor:
      rows.length > input.limit && last
        ? encodeCursor({ id: String(last.id), at: last.published_at.toISOString() })
        : null,
  });
}

function listSelect(viewerPlaceholder: string): string {
  return `SELECT l.id, l.owner_id, l.name, l.description, l.visibility, l.member_count, l.follower_count,
    l.created_at, l.updated_at, banner.storage_key AS banner_key,
    CASE WHEN ${viewerPlaceholder}::text IS NULL THEN false ELSE EXISTS(
      SELECT 1 FROM list_followers lf WHERE lf.list_id = l.id AND lf.user_id = ${viewerPlaceholder}
    ) END AS following
    FROM lists l LEFT JOIN media banner ON banner.id = l.banner_media_id AND banner.status = 'ready'`;
}

function listInsertReturning(): string {
  return `INSERT INTO lists (owner_id, name, description, visibility, banner_media_id)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, owner_id, name, description, visibility, member_count, follower_count, created_at, updated_at,
      NULL::text AS banner_key, false AS following`;
}

async function hydrateLists(rows: ListRow[], viewerId: string | null): Promise<TwitterList[]> {
  const owners = await getUsersByIds(
    rows.map((row) => row.owner_id),
    viewerId,
  );
  return rows.flatMap((row) => {
    const owner = owners.get(row.owner_id);
    if (!owner) return [];
    return [
      {
        id: String(row.id),
        name: row.name,
        description: row.description,
        private: row.visibility === 'private',
        owner,
        membersCount: row.member_count,
        followersCount: row.follower_count,
        following: row.following,
        createdAt: row.created_at.toISOString(),
        bannerUrl: row.banner_key ? publicMediaUrl(row.banner_key) : null,
      },
    ];
  });
}

async function getListMembers(listId: string, viewerId: string): Promise<UserSummary[]> {
  const rows = await query<{ user_id: string }>(
    `SELECT lm.user_id FROM list_members lm
     JOIN users u ON u.id = lm.user_id
     WHERE lm.list_id = $1 AND u.status = 'active'
     ORDER BY lm.created_at DESC, lm.user_id ASC`,
    [listId],
  );
  const users = await getUsersByIds(
    rows.map((row) => row.user_id),
    viewerId,
  );
  return rows.flatMap((row) => {
    const user = users.get(row.user_id);
    return user ? [user] : [];
  });
}

async function assertBanner(mediaId: string, ownerId: string): Promise<void> {
  const media = await queryOne<{ id: string }>(
    `SELECT id FROM media WHERE id = $1 AND owner_id = $2 AND type = 'image' AND status = 'ready'
       AND variants->>'purpose' = 'banner'`,
    [mediaId, ownerId],
  );
  if (!media) forbidden('That banner image is not ready or does not belong to you');
}
