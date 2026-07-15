import {
  handleSchema,
  onboardingInputSchema,
  updateProfileInputSchema,
} from '@twitter2020/contracts';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { query, queryOne, transaction } from '../database';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../errors';
import { getServerEnv } from '../env';
import { created, noContent, ok, parseJson, type RouteContext } from '../http';
import { getUserByHandle, getUserById } from '../models';
import { getUsersByIds } from '../models';
import { requireSession, getOptionalSession } from '../session';
import { decodeCursor, encodeCursor } from '../cursor';
import { paginationQuerySchema } from '@twitter2020/contracts';
import { parseQuery } from '../http';

const handleParamSchema = handleSchema;

export async function getProfile(
  request: NextRequest,
  context: RouteContext<{ handle: string }>,
): Promise<Response> {
  const { handle: rawHandle } = await context.params;
  const handle = handleParamSchema.parse(rawHandle);
  const session = await getOptionalSession(request);
  const profile = await getUserByHandle(handle, session?.user.id ?? null);
  if (!profile) notFound('Account');
  return ok(profile);
}

export async function updateMyProfile(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = await parseJson(request, updateProfileInputSchema);
  await validateProfileMedia(session.user.id, input.avatarMediaId, input.bannerMediaId);

  if (input.handle) {
    const duplicate = await queryOne<{ user_id: string }>(
      'SELECT user_id FROM profiles WHERE lower(handle) = lower($1) AND user_id <> $2',
      [input.handle, session.user.id],
    );
    if (duplicate) conflict('That username is already taken', 'handle_taken');
  }

  const current = await queryOne<{ display_name: string }>(
    'SELECT display_name FROM profiles WHERE user_id = $1',
    [session.user.id],
  );
  const displayName = input.name ?? current?.display_name ?? session.user.name;
  await transaction(async (client) => {
    await client.query(
      `INSERT INTO profiles (user_id, display_name, bio, location, website, birth_date, avatar_media_id, banner_media_id)
       VALUES ($1, $2, COALESCE($3, ''), COALESCE($4, ''), NULLIF($5, ''), $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         bio = COALESCE($3, profiles.bio),
         location = COALESCE($4, profiles.location),
         website = CASE WHEN $9 THEN NULLIF($5, '') ELSE profiles.website END,
         birth_date = CASE WHEN $10 THEN $6 ELSE profiles.birth_date END,
         avatar_media_id = CASE WHEN $11 THEN $7 ELSE profiles.avatar_media_id END,
         banner_media_id = CASE WHEN $12 THEN $8 ELSE profiles.banner_media_id END,
         updated_at = now()`,
      [
        session.user.id,
        displayName,
        input.bio ?? null,
        input.location ?? null,
        input.websiteUrl ?? null,
        input.birthDate ?? null,
        input.avatarMediaId ?? null,
        input.bannerMediaId ?? null,
        Object.hasOwn(input, 'websiteUrl'),
        Object.hasOwn(input, 'birthDate'),
        Object.hasOwn(input, 'avatarMediaId'),
        Object.hasOwn(input, 'bannerMediaId'),
      ],
    );
    if (input.name) {
      await client.query('UPDATE users SET name = $2, "updatedAt" = now() WHERE id = $1', [
        session.user.id,
        input.name,
      ]);
    }
    if (input.handle) {
      await client.query('UPDATE profiles SET handle = $2, updated_at = now() WHERE user_id = $1', [
        session.user.id,
        input.handle,
      ]);
    }
  });

  const profile = await getUserById(session.user.id, session.user.id);
  return ok(profile);
}

export async function completeOnboarding(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = await parseJson(request, onboardingInputSchema);
  const duplicate = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM profiles WHERE lower(handle) = lower($1) AND user_id <> $2',
    [input.handle, session.user.id],
  );
  if (duplicate) conflict('That username is already taken', 'handle_taken');

  await transaction(async (client) => {
    await client.query(
      `INSERT INTO profiles (user_id, handle, display_name, bio, birth_date)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET handle = EXCLUDED.handle, display_name = EXCLUDED.display_name,
         bio = EXCLUDED.bio, birth_date = COALESCE(EXCLUDED.birth_date, profiles.birth_date), updated_at = now()`,
      [session.user.id, input.handle, input.name, input.bio ?? '', input.birthDate ?? null],
    );
    await client.query(
      `INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [session.user.id],
    );
    if (input.interests.length > 0) {
      await client.query(
        `INSERT INTO user_topics (user_id, topic_id)
         SELECT $1, id FROM topics WHERE id = ANY($2::bigint[]) AND active = true
         ON CONFLICT DO NOTHING`,
        [session.user.id, input.interests],
      );
    }
    await client.query('UPDATE users SET name = $2, "updatedAt" = now() WHERE id = $1', [
      session.user.id,
      input.name,
    ]);
    const bootstrapEmail = getServerEnv().BOOTSTRAP_ADMIN_EMAIL;
    if (
      bootstrapEmail &&
      session.user.emailVerified &&
      session.user.email.toLowerCase() === bootstrapEmail.toLowerCase()
    ) {
      await client.query("UPDATE users SET role = 'admin' WHERE id = $1 AND role = 'user'", [
        session.user.id,
      ]);
    }
  });
  const profile = await getUserById(session.user.id, session.user.id);
  return created(profile);
}

export async function followUser(
  request: NextRequest,
  context: RouteContext<{ handle: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { handle } = await context.params;
  handleParamSchema.parse(handle);

  const target = await queryOne<{ id: string; protected_account: boolean; follower_count: number }>(
    `SELECT u.id, COALESCE(s.protected_account, false) AS protected_account,
            COALESCE(p.follower_count, 0) AS follower_count
     FROM users u JOIN profiles p ON p.user_id = u.id
     LEFT JOIN user_settings s ON s.user_id = u.id
     WHERE lower(p.handle) = lower($1) AND u.status = 'active'`,
    [handle],
  );
  if (!target) notFound('Account');
  if (target.id === session.user.id) badRequest('You cannot follow yourself', 'self_follow');

  const state = await transaction(async (client) => {
    const blocked = await client.query(
      `SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
      [session.user.id, target.id],
    );
    if (blocked.rowCount) forbidden('You cannot follow this account');

    if (target.protected_account) {
      const alreadyFollowing = await client.query(
        'SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2',
        [session.user.id, target.id],
      );
      if (alreadyFollowing.rowCount) return 'following' as const;
      await client.query(
        'INSERT INTO follow_requests (requester_id, target_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [session.user.id, target.id],
      );
      await insertNotification(
        client,
        target.id,
        session.user.id,
        'follow_request',
        null,
        `follow-request:${session.user.id}`,
      );
      await insertOutbox(client, 'notification', target.id, 'notification.created', {
        recipientId: target.id,
        actorId: session.user.id,
        type: 'follow_request',
      });
      return 'requested' as const;
    }

    const inserted = await client.query(
      `INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING follower_id`,
      [session.user.id, target.id],
    );
    if (inserted.rowCount) {
      await client.query(
        'UPDATE profiles SET following_count = following_count + 1 WHERE user_id = $1',
        [session.user.id],
      );
      await client.query(
        'UPDATE profiles SET follower_count = follower_count + 1 WHERE user_id = $1',
        [target.id],
      );
      await insertNotification(
        client,
        target.id,
        session.user.id,
        'follow',
        null,
        `follow:${session.user.id}`,
      );
      await insertOutbox(client, 'notification', target.id, 'notification.created', {
        recipientId: target.id,
        actorId: session.user.id,
        type: 'follow',
      });
    }
    return 'following' as const;
  });

  const count = await queryOne<{ follower_count: number }>(
    'SELECT follower_count FROM profiles WHERE user_id = $1',
    [target.id],
  );
  return ok({
    targetUserId: target.id,
    state,
    followersCount: count?.follower_count ?? target.follower_count,
  });
}

export async function unfollowUser(
  request: NextRequest,
  context: RouteContext<{ handle: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { handle } = await context.params;
  handleParamSchema.parse(handle);
  const target = await queryOne<{ id: string }>(
    'SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id WHERE lower(p.handle) = lower($1)',
    [handle],
  );
  if (!target) notFound('Account');

  await transaction(async (client) => {
    await client.query('DELETE FROM follow_requests WHERE requester_id = $1 AND target_id = $2', [
      session.user.id,
      target.id,
    ]);
    const deleted = await client.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING follower_id',
      [session.user.id, target.id],
    );
    if (deleted.rowCount) {
      await client.query(
        'UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE user_id = $1',
        [session.user.id],
      );
      await client.query(
        'UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE user_id = $1',
        [target.id],
      );
    }
  });
  const count = await queryOne<{ follower_count: number }>(
    'SELECT follower_count FROM profiles WHERE user_id = $1',
    [target.id],
  );
  return ok({
    targetUserId: target.id,
    state: 'not-following' as const,
    followersCount: count?.follower_count ?? 0,
  });
}

const relationshipActionSchema = z.object({ action: z.enum(['accept', 'decline']) });

export async function resolveFollowRequest(
  request: NextRequest,
  context: RouteContext<{ userId: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const input = await parseJson(request, relationshipActionSchema);
  const { userId } = await context.params;
  const result = await transaction(async (client) => {
    const removed = await client.query(
      'DELETE FROM follow_requests WHERE requester_id = $1 AND target_id = $2 RETURNING requester_id',
      [userId, session.user.id],
    );
    if (!removed.rowCount) return false;
    if (input.action === 'accept') {
      const inserted = await client.query(
        'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING follower_id',
        [userId, session.user.id],
      );
      if (inserted.rowCount) {
        await client.query(
          'UPDATE profiles SET following_count = following_count + 1 WHERE user_id = $1',
          [userId],
        );
        await client.query(
          'UPDATE profiles SET follower_count = follower_count + 1 WHERE user_id = $1',
          [session.user.id],
        );
        await insertNotification(
          client,
          userId,
          session.user.id,
          'follow',
          null,
          `follow-accepted:${session.user.id}`,
        );
        await insertOutbox(client, 'notification', userId, 'notification.created', {
          recipientId: userId,
          actorId: session.user.id,
          type: 'follow',
        });
      }
    }
    return true;
  });
  if (!result) notFound('Follow request');
  return noContent();
}

export async function getFollowers(
  request: NextRequest,
  context: RouteContext<{ handle: string }>,
): Promise<Response> {
  return getConnections(request, context, 'followers');
}

export async function getFollowing(
  request: NextRequest,
  context: RouteContext<{ handle: string }>,
): Promise<Response> {
  return getConnections(request, context, 'following');
}

async function getConnections(
  request: NextRequest,
  context: RouteContext<{ handle: string }>,
  direction: 'followers' | 'following',
): Promise<Response> {
  const session = await getOptionalSession(request);
  const { handle } = await context.params;
  handleSchema.parse(handle);
  const target = await queryOne<{ user_id: string; protected_account: boolean; allowed: boolean }>(
    `SELECT p.user_id, COALESCE(s.protected_account, false) AS protected_account,
       CASE WHEN p.user_id = $2 THEN true WHEN COALESCE(s.protected_account, false) = false THEN true ELSE EXISTS(
         SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.following_id = p.user_id
       ) END AS allowed
     FROM profiles p JOIN users target_user ON target_user.id = p.user_id
     LEFT JOIN user_settings s ON s.user_id = p.user_id
     WHERE lower(p.handle) = lower($1) AND target_user.status = 'active'
       AND NOT EXISTS(SELECT 1 FROM blocks b WHERE $2::text IS NOT NULL AND
         ((b.blocker_id = p.user_id AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = p.user_id)))`,
    [handle, session?.user.id ?? null],
  );
  if (!target) notFound('Account');
  if (!target.allowed) forbidden('These accounts are protected');
  const input = parseQuery(request, paginationQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const candidateColumn = direction === 'followers' ? 'f.follower_id' : 'f.following_id';
  const targetColumn = direction === 'followers' ? 'f.following_id' : 'f.follower_id';
  const rows = await query<{ user_id: string; created_at: Date }>(
    `SELECT ${candidateColumn} AS user_id, f.created_at FROM follows f
     JOIN users candidate_user ON candidate_user.id = ${candidateColumn}
     WHERE ${targetColumn} = $1 AND candidate_user.status = 'active'
       AND ($2::timestamptz IS NULL OR (f.created_at, ${candidateColumn}) < ($2, $3::text))
       AND NOT EXISTS(SELECT 1 FROM blocks b WHERE $4::text IS NOT NULL AND
         ((b.blocker_id = ${candidateColumn} AND b.blocked_id = $4) OR (b.blocker_id = $4 AND b.blocked_id = ${candidateColumn})))
     ORDER BY f.created_at DESC, ${candidateColumn} DESC LIMIT $5`,
    [
      target.user_id,
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
  const last = page.at(-1);
  return ok({
    items: page.flatMap((row) => users.get(row.user_id) ?? []),
    nextCursor:
      rows.length > input.limit && last
        ? encodeCursor({ id: last.user_id, at: last.created_at.toISOString() })
        : null,
  });
}

export async function blockUser(
  request: NextRequest,
  context: RouteContext<{ handle: string }>,
): Promise<Response> {
  return changeBlock(request, context, true);
}

export async function unblockUser(
  request: NextRequest,
  context: RouteContext<{ handle: string }>,
): Promise<Response> {
  return changeBlock(request, context, false);
}

export async function muteUser(
  request: NextRequest,
  context: RouteContext<{ handle: string }>,
): Promise<Response> {
  return changeMute(request, context, true);
}

export async function unmuteUser(
  request: NextRequest,
  context: RouteContext<{ handle: string }>,
): Promise<Response> {
  return changeMute(request, context, false);
}

async function changeMute(
  request: NextRequest,
  context: RouteContext<{ handle: string }>,
  muting: boolean,
): Promise<Response> {
  const session = await requireSession(request);
  const { handle } = await context.params;
  handleSchema.parse(handle);
  const target = await queryOne<{ id: string }>(
    `SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id
     WHERE lower(p.handle) = lower($1) AND u.status = 'active'`,
    [handle],
  );
  if (!target) notFound('Account');
  if (target.id === session.user.id) badRequest('You cannot mute yourself', 'self_mute');
  if (muting) {
    await query(
      `INSERT INTO mutes (muter_id, muted_id, expires_at) VALUES ($1, $2, NULL)
       ON CONFLICT (muter_id, muted_id) DO UPDATE SET expires_at = NULL`,
      [session.user.id, target.id],
    );
  } else {
    await query('DELETE FROM mutes WHERE muter_id = $1 AND muted_id = $2', [
      session.user.id,
      target.id,
    ]);
  }
  return ok({ targetUserId: target.id, muting });
}

export async function getBlockedAccounts(request: NextRequest): Promise<Response> {
  return getModeratedAccounts(request, 'blocked');
}

export async function getMutedAccounts(request: NextRequest): Promise<Response> {
  return getModeratedAccounts(request, 'muted');
}

async function getModeratedAccounts(
  request: NextRequest,
  kind: 'blocked' | 'muted',
): Promise<Response> {
  const session = await requireSession(request);
  const rows = await query<{ user_id: string }>(
    kind === 'blocked'
      ? `SELECT b.blocked_id AS user_id FROM blocks b JOIN users u ON u.id = b.blocked_id
         WHERE b.blocker_id = $1 AND u.status = 'active' ORDER BY b.created_at DESC LIMIT 200`
      : `SELECT m.muted_id AS user_id FROM mutes m JOIN users u ON u.id = m.muted_id
         WHERE m.muter_id = $1 AND u.status = 'active'
           AND (m.expires_at IS NULL OR m.expires_at > now())
         ORDER BY m.created_at DESC LIMIT 200`,
    [session.user.id],
  );
  const users = await getUsersByIds(
    rows.map((row) => row.user_id),
    session.user.id,
  );
  return ok({ items: rows.flatMap((row) => users.get(row.user_id) ?? []) });
}

async function changeBlock(
  request: NextRequest,
  context: RouteContext<{ handle: string }>,
  blocking: boolean,
): Promise<Response> {
  const session = await requireSession(request);
  const { handle } = await context.params;
  handleSchema.parse(handle);
  const target = await queryOne<{ id: string }>(
    'SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id WHERE lower(p.handle) = lower($1)',
    [handle],
  );
  if (!target) notFound('Account');
  if (target.id === session.user.id) badRequest('You cannot block yourself', 'self_block');
  await transaction(async (client) => {
    if (!blocking) {
      await client.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [
        session.user.id,
        target.id,
      ]);
      return;
    }
    await client.query(
      'INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [session.user.id, target.id],
    );
    await client.query(
      `DELETE FROM follow_requests WHERE (requester_id = $1 AND target_id = $2) OR (requester_id = $2 AND target_id = $1)`,
      [session.user.id, target.id],
    );
    const outbound = await client.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING follower_id',
      [session.user.id, target.id],
    );
    if (outbound.rowCount) {
      await client.query(
        'UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE user_id = $1',
        [session.user.id],
      );
      await client.query(
        'UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE user_id = $1',
        [target.id],
      );
    }
    const inbound = await client.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 RETURNING follower_id',
      [target.id, session.user.id],
    );
    if (inbound.rowCount) {
      await client.query(
        'UPDATE profiles SET following_count = GREATEST(0, following_count - 1) WHERE user_id = $1',
        [target.id],
      );
      await client.query(
        'UPDATE profiles SET follower_count = GREATEST(0, follower_count - 1) WHERE user_id = $1',
        [session.user.id],
      );
    }
    await insertOutbox(
      client,
      'relationship',
      `${session.user.id}:${target.id}`,
      'relationship.blocked',
      {
        blockerId: session.user.id,
        blockedId: target.id,
      },
    );
  });
  return ok({ targetUserId: target.id, blocking });
}

async function validateProfileMedia(
  userId: string,
  avatarId: string | null | undefined,
  bannerId: string | null | undefined,
): Promise<void> {
  for (const [kind, value] of [
    ['avatar', avatarId],
    ['banner', bannerId],
  ] as const) {
    if (!value) continue;
    const media = await queryOne<{
      owner_id: string;
      type: string;
      status: string;
      purpose: string | null;
    }>("SELECT owner_id, type, status, variants->>'purpose' AS purpose FROM media WHERE id = $1", [
      value,
    ]);
    if (
      !media ||
      media.owner_id !== userId ||
      media.type !== 'image' ||
      media.status !== 'ready' ||
      media.purpose !== kind
    ) {
      throw new ApiError(
        422,
        'invalid_media',
        `The selected ${kind} image is not ready or does not belong to you`,
      );
    }
  }
}

type SqlClient = Parameters<Parameters<typeof transaction>[0]>[0];

type NotificationType =
  | 'follow'
  | 'follow_request'
  | 'like'
  | 'retweet'
  | 'quote'
  | 'reply'
  | 'mention'
  | 'poll_vote'
  | 'dm'
  | 'system';

export async function insertNotification(
  client: SqlClient,
  recipientId: string,
  actorId: string | null,
  type: NotificationType,
  tweetId: string | null,
  dedupeKey: string,
  message: string | null = null,
): Promise<void> {
  if (recipientId === actorId) return;
  await client.query(
    `INSERT INTO notifications (recipient_id, actor_id, type, tweet_id, message, dedupe_key)
     SELECT $1, $2, $3::notification_type, $4, $5, $6
     WHERE COALESCE((
       SELECT CASE $3::notification_type
         WHEN 'like' THEN notification_likes
         WHEN 'retweet' THEN notification_retweets
         WHEN 'quote' THEN notification_retweets
         WHEN 'follow' THEN notification_follows
         WHEN 'follow_request' THEN notification_follows
         WHEN 'mention' THEN notification_mentions
         WHEN 'reply' THEN notification_mentions
         WHEN 'dm' THEN notification_direct_messages
         ELSE true
       END
       FROM user_settings WHERE user_id = $1
     ), true)
     ON CONFLICT (recipient_id, dedupe_key) DO NOTHING`,
    [recipientId, actorId, type, tweetId, message, dedupeKey],
  );
}

export async function insertOutbox(
  client: SqlClient,
  aggregateType: string,
  aggregateId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [aggregateType, aggregateId, eventType, JSON.stringify(payload)],
  );
}
