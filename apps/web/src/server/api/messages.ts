import {
  createConversationInputSchema,
  paginationQuerySchema,
  sendMessageInputSchema,
  type Conversation,
  type MediaAttachment,
  type Message,
} from '@twitter2020/contracts';
import type { NextRequest } from 'next/server';
import { decodeCursor, encodeCursor } from '../cursor';
import { query, queryOne, transaction } from '../database';
import { ApiError, forbidden, notFound } from '../errors';
import { created, ok, parseJson, parseQuery, type RouteContext } from '../http';
import { getUsersByIds } from '../models';
import { assertRateLimit } from '../rate-limit';
import { requireSession } from '../session';
import { getPrivateMediaUrl, publicMediaUrl } from '../storage';
import { insertNotification, insertOutbox } from './users';

type ConversationRow = {
  id: string;
  type: 'direct' | 'group';
  title: string | null;
  avatar_key: string | null;
  created_at: Date;
  updated_at: Date;
  sort_at: Date;
  last_message_id: string | null;
  unread_count: number;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  sent_at: Date;
  deleted_at: Date | null;
  media_id: string | null;
  media_type: 'image' | 'gif' | 'video' | null;
  media_status: 'pending' | 'processing' | 'ready' | 'failed' | null;
  media_key: string | null;
  media_width: number | null;
  media_height: number | null;
  media_duration_ms: number | null;
  read_by: string[];
};

export async function getConversations(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = parseQuery(request, paginationQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const rows = await query<ConversationRow>(
    `${conversationSelect()}
     WHERE cm.user_id = $1 AND cm.left_at IS NULL
       AND ($2::timestamptz IS NULL OR (COALESCE(c.last_message_at, c.created_at), c.id) < ($2, $3::bigint))
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC LIMIT $4`,
    [session.user.id, cursor?.at ?? null, cursor?.id ?? '0', input.limit + 1],
  );
  const page = rows.slice(0, input.limit);
  const items = await hydrateConversations(page, session.user.id);
  const last = page.at(-1);
  return ok({
    items,
    nextCursor:
      rows.length > input.limit && last
        ? encodeCursor({ id: String(last.id), at: last.sort_at.toISOString() })
        : null,
  });
}

export async function createConversation(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  assertRateLimit(`conversation:${session.user.id}`, 30, 60 * 60 * 1000);
  const input = await parseJson(request, createConversationInputSchema);
  const participantIds = [...new Set(input.participantIds)].filter((id) => id !== session.user.id);
  await assertCanMessageUsers(session.user.id, participantIds);

  const conversationId = await transaction(async (client) => {
    if (participantIds.length === 1) {
      const existing = await client.query<{ id: string }>(
        `SELECT c.id FROM conversations c
         WHERE c.type = 'direct'
           AND (SELECT count(*) FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.left_at IS NULL) = 2
           AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $1 AND cm.left_at IS NULL)
           AND EXISTS(SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $2 AND cm.left_at IS NULL)
         LIMIT 1`,
        [session.user.id, participantIds[0]],
      );
      if (existing.rows[0]) {
        if (input.message)
          await insertMessage(client, existing.rows[0].id, session.user.id, input.message, null);
        return existing.rows[0].id;
      }
    }
    const createdConversation = await client.query<{ id: string }>(
      `INSERT INTO conversations (type, title, created_by_id) VALUES ($1, $2, $3) RETURNING id`,
      [participantIds.length === 1 ? 'direct' : 'group', input.name ?? null, session.user.id],
    );
    const id = createdConversation.rows[0]!.id;
    for (const participantId of [session.user.id, ...participantIds]) {
      await client.query(
        'INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)',
        [id, participantId],
      );
    }
    if (input.message) await insertMessage(client, id, session.user.id, input.message, null);
    return id;
  });

  const conversation = await loadConversation(conversationId, session.user.id);
  return created(conversation);
}

export async function getConversation(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  const conversation = await loadConversation(id, session.user.id);
  if (!conversation) notFound('Conversation');
  return ok(conversation);
}

export async function getMessages(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  await assertConversationMember(id, session.user.id);
  const input = parseQuery(request, paginationQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const rows = await queryMessageRows(
    `m.conversation_id = $1 AND ($2::timestamptz IS NULL OR (m.sent_at, m.id) < ($2, $3::bigint))`,
    [id, cursor?.at ?? null, cursor?.id ?? '0'],
    input.limit + 1,
  );
  const page = rows.slice(0, input.limit);
  const items = (await hydrateMessages(page, session.user.id)).reverse();
  const last = page.at(-1);
  return ok({
    items,
    nextCursor:
      rows.length > input.limit && last
        ? encodeCursor({ id: String(last.id), at: last.sent_at.toISOString() })
        : null,
  });
}

export async function sendMessage(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  assertRateLimit(`dm:${session.user.id}`, 500, 60 * 60 * 1000);
  const { id } = await context.params;
  await assertConversationMember(id, session.user.id);
  const blocked = await queryOne<{ blocked: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM conversation_members cm JOIN blocks b ON
         ((b.blocker_id = cm.user_id AND b.blocked_id = $2) OR (b.blocker_id = $2 AND b.blocked_id = cm.user_id))
       WHERE cm.conversation_id = $1 AND cm.user_id <> $2 AND cm.left_at IS NULL
     ) AS blocked`,
    [id, session.user.id],
  );
  if (blocked?.blocked) forbidden('You cannot send a message in this conversation');
  const input = await parseJson(request, sendMessageInputSchema);
  if (input.mediaId) {
    const validMedia = await queryOne<{ id: string }>(
      `SELECT id FROM media WHERE id = $1 AND owner_id = $2 AND status = 'ready'
         AND variants->>'purpose' = 'message'`,
      [input.mediaId, session.user.id],
    );
    if (!validMedia)
      throw new ApiError(422, 'invalid_media', 'That media is not ready or does not belong to you');
  }
  const messageId = await transaction((client) =>
    insertMessage(client, id, session.user.id, input.text, input.mediaId ?? null),
  );
  const messages = await queryMessageRows('m.id = $1', [messageId]);
  return created((await hydrateMessages(messages, session.user.id))[0]);
}

export async function markConversationRead(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  await assertConversationMember(id, session.user.id);
  const receiptSetting = await queryOne<{ show_read_receipts: boolean }>(
    'SELECT show_read_receipts FROM user_settings WHERE user_id = $1',
    [session.user.id],
  );
  const shareReadReceipt = receiptSetting?.show_read_receipts ?? true;
  const latest = await queryOne<{ id: string }>(
    'SELECT id FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL ORDER BY sent_at DESC, id DESC LIMIT 1',
    [id],
  );
  if (latest) {
    await transaction(async (client) => {
      await client.query(
        'UPDATE conversation_members SET last_read_message_id = $3 WHERE conversation_id = $1 AND user_id = $2',
        [id, session.user.id, latest.id],
      );
      if (shareReadReceipt) {
        await client.query(
          `INSERT INTO message_reads (message_id, user_id)
           SELECT id, $2 FROM messages WHERE conversation_id = $1 AND id <= $3
           ON CONFLICT DO NOTHING`,
          [id, session.user.id, latest.id],
        );
        await insertOutbox(client, 'conversation', id, 'dm.read', {
          conversationId: id,
          messageId: latest.id,
          userId: session.user.id,
          recipientIds: (
            await client.query<{ user_id: string }>(
              'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2 AND left_at IS NULL',
              [id, session.user.id],
            )
          ).rows.map((row) => row.user_id),
        });
      }
    });
  }
  return ok({ conversationId: id, lastReadMessageId: latest?.id ?? null });
}

type SqlClient = Parameters<Parameters<typeof transaction>[0]>[0];

async function insertMessage(
  client: SqlClient,
  conversationId: string,
  senderId: string,
  body: string,
  mediaId: string | null,
): Promise<string> {
  const inserted = await client.query<{ id: string }>(
    'INSERT INTO messages (conversation_id, sender_id, type, body) VALUES ($1, $2, $3, $4) RETURNING id',
    [conversationId, senderId, mediaId ? 'media' : 'text', body],
  );
  const messageId = inserted.rows[0]!.id;
  if (mediaId) {
    await client.query(
      'INSERT INTO message_media (message_id, media_id, position) VALUES ($1, $2, 0)',
      [messageId, mediaId],
    );
  }
  await client.query(
    'UPDATE conversations SET last_message_at = now(), updated_at = now() WHERE id = $1',
    [conversationId],
  );
  const recipients = await client.query<{ user_id: string }>(
    'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id <> $2 AND left_at IS NULL',
    [conversationId, senderId],
  );
  for (const recipient of recipients.rows) {
    await insertNotification(
      client,
      recipient.user_id,
      senderId,
      'dm',
      null,
      `dm:${messageId}:${recipient.user_id}`,
    );
    await insertOutbox(client, 'conversation', conversationId, 'dm.created', {
      conversationId,
      messageId,
      recipientId: recipient.user_id,
      senderId,
    });
  }
  return String(messageId);
}

async function assertCanMessageUsers(senderId: string, targets: string[]): Promise<void> {
  if (targets.length === 0)
    throw new ApiError(422, 'missing_participant', 'Choose at least one person to message');
  const rows = await query<{ id: string; allowed: boolean; blocked: boolean }>(
    `SELECT u.id,
       CASE
         WHEN COALESCE(s.direct_message_permission, 'following') = 'everyone' THEN true
         WHEN COALESCE(s.direct_message_permission, 'following') = 'following' THEN EXISTS(
           SELECT 1 FROM follows f WHERE f.follower_id = u.id AND f.following_id = $1
         )
         ELSE false
       END AS allowed,
       EXISTS(SELECT 1 FROM blocks b WHERE
         (b.blocker_id = u.id AND b.blocked_id = $1) OR (b.blocker_id = $1 AND b.blocked_id = u.id)) AS blocked
     FROM users u LEFT JOIN user_settings s ON s.user_id = u.id
     WHERE u.id = ANY($2::text[]) AND u.status = 'active'`,
    [senderId, targets],
  );
  if (rows.length !== targets.length || rows.some((row) => !row.allowed || row.blocked)) {
    forbidden('One or more people cannot receive messages from you');
  }
}

async function assertConversationMember(conversationId: string, userId: string): Promise<void> {
  const member = await queryOne<{ conversation_id: string }>(
    'SELECT conversation_id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL',
    [conversationId, userId],
  );
  if (!member) notFound('Conversation');
}

async function loadConversation(id: string, userId: string): Promise<Conversation | null> {
  const row = await queryOne<ConversationRow>(
    `${conversationSelect()} WHERE cm.user_id = $1 AND cm.left_at IS NULL AND c.id = $2`,
    [userId, id],
  );
  return row ? ((await hydrateConversations([row], userId))[0] ?? null) : null;
}

function conversationSelect(): string {
  return `SELECT c.id, c.type, c.title, avatar.storage_key AS avatar_key, c.created_at, c.updated_at,
      COALESCE(c.last_message_at, c.created_at) AS sort_at,
      (SELECT m.id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.sent_at DESC, m.id DESC LIMIT 1) AS last_message_id,
      (SELECT count(*)::int FROM messages unread WHERE unread.conversation_id = c.id
        AND unread.sender_id <> cm.user_id AND unread.deleted_at IS NULL
        AND (cm.last_read_message_id IS NULL OR unread.id > cm.last_read_message_id)) AS unread_count
    FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id
    LEFT JOIN media avatar ON avatar.id = c.avatar_media_id AND avatar.status = 'ready'`;
}

async function hydrateConversations(
  rows: ConversationRow[],
  viewerId: string,
): Promise<Conversation[]> {
  if (!rows.length) return [];
  const ids = rows.map((row) => String(row.id));
  const participantRows = await query<{ conversation_id: string; user_id: string }>(
    'SELECT conversation_id, user_id FROM conversation_members WHERE conversation_id = ANY($1::bigint[]) AND left_at IS NULL',
    [ids],
  );
  const users = await getUsersByIds(
    participantRows.map((row) => row.user_id),
    viewerId,
  );
  const lastIds = rows.flatMap((row) => (row.last_message_id ? [String(row.last_message_id)] : []));
  const lastMessages = await hydrateMessages(
    await queryMessageRows('m.id = ANY($1::bigint[])', [lastIds]),
    viewerId,
  );
  const messages = new Map(lastMessages.map((message) => [message.id, message]));
  return rows.map((row) => ({
    id: String(row.id),
    participants: participantRows
      .filter((participant) => String(participant.conversation_id) === String(row.id))
      .flatMap((participant) => users.get(participant.user_id) ?? []),
    name: row.title,
    avatarUrl: row.avatar_key ? publicMediaUrl(row.avatar_key) : null,
    lastMessage: row.last_message_id ? (messages.get(String(row.last_message_id)) ?? null) : null,
    unreadCount: row.unread_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }));
}

async function queryMessageRows(
  where: string,
  values: unknown[],
  limit?: number,
): Promise<MessageRow[]> {
  const parameters = limit === undefined ? values : [...values, limit];
  return query<MessageRow>(
    `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.sent_at, m.deleted_at,
       media.id AS media_id, media.type AS media_type, media.status AS media_status,
       media.storage_key AS media_key, media.width AS media_width, media.height AS media_height,
       media.duration_ms AS media_duration_ms,
       COALESCE((SELECT array_agg(mr.user_id) FROM message_reads mr
         LEFT JOIN user_settings receipt_settings ON receipt_settings.user_id = mr.user_id
         WHERE mr.message_id = m.id AND COALESCE(receipt_settings.show_read_receipts, true)), ARRAY[]::text[]) AS read_by
     FROM messages m
     LEFT JOIN message_media mm ON mm.message_id = m.id AND mm.position = 0
     LEFT JOIN media ON media.id = mm.media_id
     WHERE ${where} ORDER BY m.sent_at DESC, m.id DESC${
       limit === undefined ? '' : ` LIMIT $${parameters.length}`
     }`,
    parameters,
  );
}

async function hydrateMessages(rows: MessageRow[], viewerId: string): Promise<Message[]> {
  const [senders, viewerSettings] = await Promise.all([
    getUsersByIds(
      rows.map((row) => row.sender_id),
      viewerId,
    ),
    queryOne<{ show_read_receipts: boolean }>(
      'SELECT show_read_receipts FROM user_settings WHERE user_id = $1',
      [viewerId],
    ),
  ]);
  const canViewReadReceipts = viewerSettings?.show_read_receipts ?? true;
  const hydrated = await Promise.all(
    rows.map(async (row): Promise<Message | null> => {
      const sender = senders.get(row.sender_id);
      if (!sender) return null;
      const signedMediaUrl = row.media_key ? (await getPrivateMediaUrl(row.media_key)).url : null;
      const media: MediaAttachment[] =
        row.media_id && row.media_key && row.media_type && row.media_status
          ? [
              {
                id: String(row.media_id),
                type: row.media_type,
                url: signedMediaUrl!,
                previewUrl: signedMediaUrl,
                altText: null,
                width: row.media_width,
                height: row.media_height,
                durationMs: row.media_duration_ms,
                processingStatus: row.media_status,
              },
            ]
          : [];
      return {
        id: String(row.id),
        conversationId: String(row.conversation_id),
        sender,
        text: row.deleted_at ? '' : row.body,
        media,
        createdAt: row.sent_at.toISOString(),
        deletedAt: row.deleted_at?.toISOString() ?? null,
        readBy: canViewReadReceipts ? row.read_by : [],
      };
    }),
  );
  return hydrated.filter((message): message is Message => message !== null);
}
