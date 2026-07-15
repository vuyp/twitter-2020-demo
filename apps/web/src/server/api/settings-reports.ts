import {
  createReportInputSchema,
  paginationQuerySchema,
  reportReasonSchema,
  updateReportInputSchema,
  updateUserSettingsInputSchema,
  type Report,
  type UserSettings,
} from '@twitter2020/contracts';
import type { NextRequest } from 'next/server';
import type { PoolClient, QueryResultRow } from 'pg';
import { z } from 'zod';

import { decodeCursor, encodeCursor } from '../cursor';
import { query, queryOne, transaction } from '../database';
import { ApiError, badRequest, conflict, forbidden, notFound } from '../errors';
import { created, ok, parseJson, parseQuery, type RouteContext } from '../http';
import { asId, toIso } from '../ids';
import { requireSession } from '../session';
import { getPrivateDownloadUrl } from '../storage';

type SettingsRow = QueryResultRow & {
  color_scheme: 'light' | 'dim' | 'lights_out';
  accent_color: 'blue' | 'yellow' | 'pink' | 'purple' | 'orange' | 'green';
  font_size: 'extra_small' | 'small' | 'default' | 'large' | 'extra_large';
  reduce_motion: boolean;
  autoplay_video: boolean;
  show_sensitive_media: boolean;
  protected_account: boolean;
  discoverable_by_email: boolean;
  allow_photo_tagging: boolean;
  show_read_receipts: boolean;
  direct_message_permission: 'everyone' | 'following' | 'nobody';
  default_timeline: 'top' | 'latest';
  notification_push_enabled: boolean;
  notification_email_enabled: boolean;
  notification_likes: boolean;
  notification_retweets: boolean;
  notification_follows: boolean;
  notification_mentions: boolean;
  notification_direct_messages: boolean;
};

const SETTINGS_SELECT = `
  color_scheme, accent_color, font_size, reduce_motion, autoplay_video,
  show_sensitive_media, protected_account, discoverable_by_email, allow_photo_tagging,
  show_read_receipts, direct_message_permission,
  default_timeline, notification_push_enabled, notification_email_enabled,
  notification_likes, notification_retweets, notification_follows,
  notification_mentions, notification_direct_messages
`;

const revokeSessionInputSchema = z.object({ sessionId: z.string().min(1).max(255) }).strict();

type AccountSessionRow = QueryResultRow & {
  id: string;
  user_agent: string | null;
  ip_address: string | null;
  created_at: Date;
  expires_at: Date;
};

export async function getAccountSessions(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const rows = await query<AccountSessionRow>(
    `SELECT id, "userAgent" AS user_agent, "ipAddress" AS ip_address,
            "createdAt" AS created_at, "expiresAt" AS expires_at
     FROM sessions
     WHERE "userId" = $1 AND "expiresAt" > now()
     ORDER BY "updatedAt" DESC, id DESC`,
    [session.user.id],
  );
  return ok({
    items: rows.map((row) => ({
      id: row.id,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      createdAt: toIso(row.created_at),
      expiresAt: toIso(row.expires_at),
      current: row.id === session.session.id,
    })),
  });
}

export async function revokeAccountSession(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = await parseJson(request, revokeSessionInputSchema);
  if (input.sessionId === session.session.id) {
    badRequest('Use Log out to end your current session', 'current_session');
  }
  const deleted = await queryOne<{ id: string }>(
    `DELETE FROM sessions WHERE id = $1 AND "userId" = $2 AND id <> $3 RETURNING id`,
    [input.sessionId, session.user.id, session.session.id],
  );
  if (!deleted) notFound('Session');
  return ok({ sessionId: deleted.id, revoked: true });
}

export async function getSettings(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  await ensureSettings(session.user.id);
  const row = await queryOne<SettingsRow>(
    `SELECT ${SETTINGS_SELECT} FROM user_settings WHERE user_id = $1`,
    [session.user.id],
  );
  if (!row) throw new ApiError(500, 'settings_unavailable', 'Account settings could not be loaded');
  return ok(mapSettings(row));
}

export async function updateSettings(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = await parseJson(request, updateUserSettingsInputSchema);

  const row = await transaction(async (client) => {
    await ensureSettings(session.user.id, client);
    const values: unknown[] = [session.user.id];
    const assignments: string[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };

    if (input.theme !== undefined)
      set('color_scheme', input.theme === 'lights-out' ? 'lights_out' : input.theme);
    if (input.accentColor !== undefined) set('accent_color', input.accentColor);
    if (input.fontSize !== undefined) set('font_size', fontSizeToDatabase(input.fontSize));
    if (input.reduceMotion !== undefined) set('reduce_motion', input.reduceMotion);
    if (input.autoplayVideo !== undefined) set('autoplay_video', input.autoplayVideo);
    if (input.showSensitiveMedia !== undefined)
      set('show_sensitive_media', input.showSensitiveMedia);
    if (input.protectedAccount !== undefined) set('protected_account', input.protectedAccount);
    if (input.discoverableByEmail !== undefined)
      set('discoverable_by_email', input.discoverableByEmail);
    if (input.allowPhotoTagging !== undefined) set('allow_photo_tagging', input.allowPhotoTagging);
    if (input.showReadReceipts !== undefined) set('show_read_receipts', input.showReadReceipts);
    if (input.allowDirectMessagesFrom !== undefined) {
      set('direct_message_permission', input.allowDirectMessagesFrom);
    }
    if (input.defaultTimeline !== undefined) set('default_timeline', input.defaultTimeline);
    if (input.notifications?.pushEnabled !== undefined) {
      set('notification_push_enabled', input.notifications.pushEnabled);
    }
    if (input.notifications?.emailEnabled !== undefined) {
      set('notification_email_enabled', input.notifications.emailEnabled);
    }
    if (input.notifications?.likes !== undefined)
      set('notification_likes', input.notifications.likes);
    if (input.notifications?.retweets !== undefined)
      set('notification_retweets', input.notifications.retweets);
    if (input.notifications?.follows !== undefined)
      set('notification_follows', input.notifications.follows);
    if (input.notifications?.mentions !== undefined)
      set('notification_mentions', input.notifications.mentions);
    if (input.notifications?.directMessages !== undefined) {
      set('notification_direct_messages', input.notifications.directMessages);
    }

    if (assignments.length > 0) {
      await client.query(
        `UPDATE user_settings SET ${assignments.join(', ')}, updated_at = now() WHERE user_id = $1`,
        values,
      );
    }

    const result = await client.query<SettingsRow>(
      `SELECT ${SETTINGS_SELECT} FROM user_settings WHERE user_id = $1`,
      [session.user.id],
    );
    return result.rows[0];
  });

  if (!row) throw new ApiError(500, 'settings_unavailable', 'Account settings could not be loaded');
  return ok(mapSettings(row));
}

async function ensureSettings(userId: string, client?: PoolClient): Promise<void> {
  const statement =
    'INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING';
  if (client) {
    await client.query(statement, [userId]);
  } else {
    await query(statement, [userId]);
  }
}

function mapSettings(row: SettingsRow): UserSettings {
  return {
    theme: row.color_scheme === 'lights_out' ? 'lights-out' : row.color_scheme,
    accentColor: row.accent_color,
    fontSize: fontSizeFromDatabase(row.font_size),
    reduceMotion: row.reduce_motion,
    autoplayVideo: row.autoplay_video,
    showSensitiveMedia: row.show_sensitive_media,
    protectedAccount: row.protected_account,
    discoverableByEmail: row.discoverable_by_email,
    allowPhotoTagging: row.allow_photo_tagging,
    showReadReceipts: row.show_read_receipts,
    allowDirectMessagesFrom:
      row.direct_message_permission === 'everyone' ? 'everyone' : 'following',
    defaultTimeline: row.default_timeline,
    notifications: {
      pushEnabled: row.notification_push_enabled,
      emailEnabled: row.notification_email_enabled,
      likes: row.notification_likes,
      retweets: row.notification_retweets,
      follows: row.notification_follows,
      mentions: row.notification_mentions,
      directMessages: row.notification_direct_messages,
    },
  };
}

function fontSizeToDatabase(value: UserSettings['fontSize']): SettingsRow['font_size'] {
  return { xs: 'extra_small', sm: 'small', md: 'default', lg: 'large', xl: 'extra_large' }[
    value
  ] as SettingsRow['font_size'];
}

function fontSizeFromDatabase(value: SettingsRow['font_size']): UserSettings['fontSize'] {
  return { extra_small: 'xs', small: 'sm', default: 'md', large: 'lg', extra_large: 'xl' }[
    value
  ] as UserSettings['fontSize'];
}

type DatabaseReportReason =
  'spam' | 'abusive' | 'self_harm' | 'sensitive_media' | 'impersonation' | 'copyright' | 'other';
type DatabaseReportStatus = 'open' | 'reviewing' | 'actioned' | 'dismissed';

type ReportRow = QueryResultRow & {
  id: string;
  reporter_id: string;
  target_type: 'user' | 'tweet' | 'message';
  target_id: string;
  reason: DatabaseReportReason;
  details: string | null;
  status: DatabaseReportStatus;
  created_at: Date;
  resolved_at: Date | null;
};

const reportListQuerySchema = paginationQuerySchema.extend({
  targetType: z.enum(['user', 'tweet', 'message']).optional(),
  reason: reportReasonSchema.optional(),
  status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']).optional(),
});

const REPORT_SELECT = `
  r.id::text,
  r.reporter_id,
  CASE
    WHEN r.target_user_id IS NOT NULL THEN 'user'
    WHEN r.target_tweet_id IS NOT NULL THEN 'tweet'
    ELSE 'message'
  END AS target_type,
  CASE
    WHEN r.target_user_id IS NOT NULL THEN r.target_user_id
    WHEN r.target_tweet_id IS NOT NULL THEN r.target_tweet_id::text
    ELSE r.target_message_id::text
  END AS target_id,
  r.reason,
  r.details,
  r.status,
  r.created_at,
  r.resolved_at
`;

export async function createReport(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = await parseJson(request, createReportInputSchema);
  const report = await transaction(async (client) => {
    const target = await authorizeReportTarget(
      client,
      session.user.id,
      input.targetType,
      input.targetId,
    );
    const duplicate = await client.query<{ id: string }>(
      `SELECT id::text FROM reports
       WHERE reporter_id = $1
         AND target_user_id IS NOT DISTINCT FROM $2::text
         AND target_tweet_id IS NOT DISTINCT FROM $3::bigint
         AND target_message_id IS NOT DISTINCT FROM $4::bigint
         AND status IN ('open', 'reviewing')
       LIMIT 1`,
      [session.user.id, target.userId, target.tweetId, target.messageId],
    );
    if (duplicate.rowCount) conflict('You have already reported this item', 'duplicate_report');

    const targetColumn = {
      user: 'target_user_id',
      tweet: 'target_tweet_id',
      message: 'target_message_id',
    }[input.targetType];
    const inserted = await client.query<ReportRow>(
      `INSERT INTO reports (reporter_id, ${targetColumn}, reason, details)
       VALUES ($1, $2, $3, NULLIF($4, ''))
       RETURNING ${REPORT_SELECT.replaceAll('r.', '')}`,
      [
        session.user.id,
        input.targetId,
        reasonToDatabase(input.reason),
        input.details?.trim() ?? null,
      ],
    );
    const row = inserted.rows[0];
    if (!row) throw new ApiError(500, 'report_failed', 'The report could not be created');

    await client.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
       VALUES ('report', $1, 'moderation.report.created', $2::jsonb)`,
      [row.id, JSON.stringify({ reportId: row.id })],
    );
    return mapReport(row);
  });
  return created(report);
}

export async function listReports(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const actor = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [
    session.user.id,
  ]);
  if (!actor || !['moderator', 'admin'].includes(actor.role))
    forbidden('Moderator access is required');

  const input = parseQuery(request, reportListQuerySchema);
  const cursor = decodeCursor(input.cursor);
  if (cursor && !/^\d+$/.test(cursor.id)) {
    throw new ApiError(400, 'invalid_cursor', 'The pagination cursor is invalid or expired');
  }
  const values: unknown[] = [];
  const conditions: string[] = [];
  const parameter = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };

  if (input.targetType) {
    conditions.push(
      {
        user: 'r.target_user_id IS NOT NULL',
        tweet: 'r.target_tweet_id IS NOT NULL',
        message: 'r.target_message_id IS NOT NULL',
      }[input.targetType],
    );
  }
  if (input.reason)
    conditions.push(`r.reason = ${parameter(reasonToDatabase(input.reason))}::report_reason`);
  if (input.status)
    conditions.push(`r.status = ${parameter(statusToDatabase(input.status))}::report_status`);
  if (cursor) {
    const at = parameter(cursor.at);
    const id = parameter(cursor.id);
    conditions.push(`(r.created_at, r.id) < (${at}::timestamptz, ${id}::bigint)`);
  }
  const limit = parameter(input.limit + 1);
  const rows = await query<ReportRow>(
    `SELECT ${REPORT_SELECT} FROM reports r
     ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ${limit}`,
    values,
  );

  const hasMore = rows.length > input.limit;
  const pageRows = rows.slice(0, input.limit);
  const last = pageRows.at(-1);
  return ok({
    items: pageRows.map(mapReport),
    nextCursor: hasMore && last ? encodeCursor({ id: last.id, at: toIso(last.created_at) }) : null,
  });
}

export async function updateReport(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const actor = await queryOne<{ role: string }>('SELECT role FROM users WHERE id = $1', [
    session.user.id,
  ]);
  if (!actor || !['moderator', 'admin'].includes(actor.role)) {
    forbidden('Moderator access is required');
  }
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) badRequest('Invalid report identifier', 'invalid_identifier');
  const input = await parseJson(request, updateReportInputSchema);
  const report = await transaction(async (client) => {
    const updated = await client.query<ReportRow>(
      `UPDATE reports r SET status = $2::report_status, assigned_to_id = $3,
         resolution = COALESCE($4, resolution),
         resolved_at = CASE WHEN $2::report_status IN ('actioned', 'dismissed') THEN now() ELSE NULL END,
         updated_at = now()
       WHERE r.id = $1
       RETURNING ${REPORT_SELECT.replaceAll('r.', '')}`,
      [id, statusToDatabase(input.status), session.user.id, input.resolution ?? null],
    );
    const row = updated.rows[0];
    if (!row) notFound('Report');
    await client.query(
      `INSERT INTO report_actions (report_id, actor_id, action, notes)
       VALUES ($1, $2, $3, $4)`,
      [id, session.user.id, input.status, input.resolution ?? null],
    );
    await client.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
       VALUES ('report', $1, 'moderation.report.updated', $2::jsonb)`,
      [id, JSON.stringify({ reportId: id, status: input.status })],
    );
    return mapReport(row);
  });
  return ok(report);
}

async function authorizeReportTarget(
  client: PoolClient,
  reporterId: string,
  targetType: 'user' | 'tweet' | 'message',
  targetId: string,
): Promise<{ userId: string | null; tweetId: string | null; messageId: string | null }> {
  if (targetType === 'user') {
    const result = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE id = $1 AND status = 'active' LIMIT 1",
      [targetId],
    );
    if (!result.rows[0]) notFound('Account');
    if (targetId === reporterId) badRequest('You cannot report your own account', 'self_report');
    return { userId: targetId, tweetId: null, messageId: null };
  }

  assertNumericTarget(targetId);
  if (targetType === 'tweet') {
    const result = await client.query<{ id: string; author_id: string }>(
      `SELECT t.id::text, t.author_id
       FROM tweets t
       JOIN users u ON u.id = t.author_id
       LEFT JOIN user_settings s ON s.user_id = t.author_id
       WHERE t.id = $1 AND t.deleted_at IS NULL AND u.status = 'active'
         AND (
           COALESCE(s.protected_account, false) = false OR t.author_id = $2 OR
           EXISTS (SELECT 1 FROM follows f WHERE f.follower_id = $2 AND f.following_id = t.author_id)
         )
       LIMIT 1`,
      [targetId, reporterId],
    );
    const tweet = result.rows[0];
    if (!tweet) notFound('Tweet');
    if (tweet.author_id === reporterId)
      badRequest('You cannot report your own Tweet', 'self_report');
    return { userId: null, tweetId: targetId, messageId: null };
  }

  const result = await client.query<{ id: string; sender_id: string }>(
    `SELECT m.id::text, m.sender_id
     FROM messages m
     JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
     WHERE m.id = $1 AND cm.user_id = $2 AND cm.left_at IS NULL AND m.deleted_at IS NULL
     LIMIT 1`,
    [targetId, reporterId],
  );
  const message = result.rows[0];
  if (!message) notFound('Message');
  if (message.sender_id === reporterId)
    badRequest('You cannot report your own message', 'self_report');
  return { userId: null, tweetId: null, messageId: targetId };
}

function assertNumericTarget(value: string): void {
  if (!/^\d+$/.test(value)) {
    throw new ApiError(
      422,
      'invalid_target',
      'Tweet and message identifiers must be decimal numbers',
    );
  }
}

function reasonToDatabase(reason: z.infer<typeof reportReasonSchema>): DatabaseReportReason {
  return reason === 'abuse' ? 'abusive' : reason;
}

function statusToDatabase(
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed',
): DatabaseReportStatus {
  return status === 'resolved' ? 'actioned' : status;
}

function mapReport(row: ReportRow): Report {
  return {
    id: asId(row.id),
    reporterId: row.reporter_id,
    targetType: row.target_type,
    targetId: row.target_id,
    reason: row.reason === 'abusive' ? 'abuse' : row.reason,
    ...(row.details ? { details: row.details } : {}),
    status: row.status === 'actioned' ? 'resolved' : row.status,
    createdAt: toIso(row.created_at),
    reviewedAt: row.resolved_at ? toIso(row.resolved_at) : null,
  };
}

type ArchiveRow = QueryResultRow & {
  id: string;
  status: 'pending' | 'processing' | 'ready' | 'expired' | 'failed';
  storage_key: string | null;
  requested_at: Date;
  completed_at: Date | null;
  expires_at: Date | null;
  last_error: string | null;
};

const ARCHIVE_SELECT = `
  id::text, status, storage_key, requested_at, completed_at, expires_at, last_error
`;

export async function requestArchiveExport(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const result = await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `archive:${session.user.id}`,
    ]);
    const existing = await client.query<ArchiveRow>(
      `SELECT ${ARCHIVE_SELECT} FROM archive_exports
       WHERE user_id = $1 AND (
         status IN ('pending', 'processing') OR
         (status = 'ready' AND (expires_at IS NULL OR expires_at > now()))
       )
       ORDER BY requested_at DESC LIMIT 1`,
      [session.user.id],
    );
    if (existing.rows[0]) return { row: existing.rows[0], isNew: false };

    const inserted = await client.query<ArchiveRow>(
      `INSERT INTO archive_exports (user_id) VALUES ($1) RETURNING ${ARCHIVE_SELECT}`,
      [session.user.id],
    );
    const row = inserted.rows[0];
    if (!row)
      throw new ApiError(500, 'archive_request_failed', 'The archive request could not be created');
    await client.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
       VALUES ('archive', $1, 'archive.requested', $2::jsonb)`,
      [row.id, JSON.stringify({ exportId: row.id })],
    );
    return { row, isNew: true };
  });
  const body = await mapArchive(result.row);
  return result.isNew ? created(body) : ok(body);
}

export async function getLatestArchiveExport(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const row = await queryOne<ArchiveRow>(
    `SELECT ${ARCHIVE_SELECT} FROM archive_exports WHERE user_id = $1 ORDER BY requested_at DESC LIMIT 1`,
    [session.user.id],
  );
  return ok(row ? await mapArchive(row) : null);
}

export async function getArchiveExport(
  request: NextRequest,
  context: RouteContext<{ exportId: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { exportId } = await context.params;
  if (!/^\d+$/.test(exportId)) {
    throw new ApiError(400, 'invalid_id', 'Archive export identifiers must be decimal numbers');
  }
  const row = await queryOne<ArchiveRow>(
    `SELECT ${ARCHIVE_SELECT} FROM archive_exports WHERE id = $1 AND user_id = $2 LIMIT 1`,
    [exportId, session.user.id],
  );
  if (!row) notFound('Archive export');
  return ok(await mapArchive(row));
}

async function mapArchive(row: ArchiveRow) {
  const expired =
    row.status === 'ready' && Boolean(row.expires_at && row.expires_at.getTime() <= Date.now());
  const usable =
    row.status === 'ready' &&
    !expired &&
    row.storage_key &&
    (!row.expires_at || row.expires_at.getTime() > Date.now());
  const download = usable ? await getPrivateDownloadUrl(row.storage_key!) : null;
  return {
    id: asId(row.id),
    status: expired ? ('expired' as const) : row.status,
    requestedAt: toIso(row.requested_at),
    completedAt: row.completed_at ? toIso(row.completed_at) : null,
    expiresAt: row.expires_at ? toIso(row.expires_at) : null,
    downloadUrl: download?.url ?? null,
    downloadUrlExpiresAt: download?.expiresAt ?? null,
    error:
      row.status === 'failed' ? 'Archive generation failed. Please request a new archive.' : null,
  };
}
