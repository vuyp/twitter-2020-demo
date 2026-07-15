import { createTweetInputSchema, paginationQuerySchema } from '@twitter2020/contracts';
import type { NextRequest } from 'next/server';
import { decodeCursor, encodeCursor } from '../cursor';
import { query, queryOne } from '../database';
import { badRequest, notFound } from '../errors';
import { ok, parseJson, parseQuery, type RouteContext } from '../http';
import { requireSession } from '../session';
import { prepareComposition } from './tweets';

type CompositionRow = {
  id: string;
  payload: Record<string, unknown>;
  at: Date;
  scheduled_for?: Date;
  status?: string;
};

export async function getDrafts(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = parseQuery(request, paginationQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const rows = await query<CompositionRow>(
    `SELECT id, payload, updated_at AS at FROM tweet_drafts
     WHERE author_id = $1 AND ($2::timestamptz IS NULL OR (updated_at, id) < ($2, $3::bigint))
     ORDER BY updated_at DESC, id DESC LIMIT $4`,
    [session.user.id, cursor?.at ?? null, cursor?.id ?? '0', input.limit + 1],
  );
  return compositionPage(rows, input.limit, false);
}

export async function updateDraft(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  const input = await parseJson(request, createTweetInputSchema);
  const prepared = await prepareComposition(session.user.id, input);
  const row = await queryOne<CompositionRow>(
    `UPDATE tweet_drafts SET payload = $3::jsonb, updated_at = now()
     WHERE id = $1 AND author_id = $2 RETURNING id, payload, updated_at AS at`,
    [id, session.user.id, JSON.stringify(prepared.payload)],
  );
  if (!row) notFound('Draft');
  return ok(mapComposition(row, false));
}

export async function deleteDraft(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  const removed = await query(
    'DELETE FROM tweet_drafts WHERE id = $1 AND author_id = $2 RETURNING id',
    [id, session.user.id],
  );
  if (!removed.length) notFound('Draft');
  return new Response(null, { status: 204 });
}

export async function getScheduledTweets(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = parseQuery(request, paginationQuerySchema);
  const cursor = decodeCursor(input.cursor);
  const rows = await query<CompositionRow>(
    `SELECT id, payload, updated_at AS at, scheduled_for, status FROM scheduled_tweets
     WHERE author_id = $1 AND status IN ('scheduled', 'publishing', 'failed')
       AND ($2::timestamptz IS NULL OR (updated_at, id) < ($2, $3::bigint))
     ORDER BY updated_at DESC, id DESC LIMIT $4`,
    [session.user.id, cursor?.at ?? null, cursor?.id ?? '0', input.limit + 1],
  );
  return compositionPage(rows, input.limit, true);
}

export async function updateScheduledTweet(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  const input = await parseJson(request, createTweetInputSchema);
  if (!input.scheduledAt || new Date(input.scheduledAt).getTime() < Date.now() + 60_000) {
    badRequest('A future scheduledAt value is required', 'invalid_schedule');
  }
  const prepared = await prepareComposition(session.user.id, input);
  const row = await queryOne<CompositionRow>(
    `UPDATE scheduled_tweets SET payload = $3::jsonb, scheduled_for = $4, status = 'scheduled',
       attempts = 0, last_error = NULL, updated_at = now()
     WHERE id = $1 AND author_id = $2 AND status IN ('scheduled', 'failed')
     RETURNING id, payload, updated_at AS at, scheduled_for, status`,
    [id, session.user.id, JSON.stringify(prepared.payload), input.scheduledAt],
  );
  if (!row) notFound('Scheduled Tweet');
  return ok(mapComposition(row, true));
}

export async function deleteScheduledTweet(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  const rows = await query(
    `UPDATE scheduled_tweets SET status = 'cancelled', updated_at = now()
     WHERE id = $1 AND author_id = $2 AND status IN ('scheduled', 'failed') RETURNING id`,
    [id, session.user.id],
  );
  if (!rows.length) notFound('Scheduled Tweet');
  return new Response(null, { status: 204 });
}

function compositionPage(rows: CompositionRow[], limit: number, scheduled: boolean): Response {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return ok({
    items: page.map((row) => mapComposition(row, scheduled)),
    nextCursor:
      rows.length > limit && last
        ? encodeCursor({ id: String(last.id), at: last.at.toISOString() })
        : null,
  });
}

function mapComposition(row: CompositionRow, scheduled: boolean): Record<string, unknown> {
  const payload = row.payload;
  return {
    id: String(row.id),
    text: payload.body ?? '',
    mediaIds: payload.mediaIds ?? [],
    poll: payload.poll ?? null,
    replyToId: payload.replyToTweetId ?? null,
    quoteTweetId: payload.quotedTweetId ?? null,
    replyAudience: payload.replyAudience ?? 'everyone',
    sensitive: payload.isSensitive ?? false,
    updatedAt: row.at.toISOString(),
    ...(scheduled
      ? { scheduledAt: row.scheduled_for?.toISOString() ?? null, status: row.status ?? 'scheduled' }
      : {}),
  };
}
