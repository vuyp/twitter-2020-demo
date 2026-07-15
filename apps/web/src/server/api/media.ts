import {
  mediaFinalizeInputSchema,
  mediaPresignInputSchema,
  type MediaAttachment,
} from '@twitter2020/contracts';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { query, queryOne, transaction } from '../database';
import { getServerEnv } from '../env';
import { forbidden, notFound } from '../errors';
import { created, ok, parseJson, type RouteContext } from '../http';
import { assertRateLimit } from '../rate-limit';
import { requireSession } from '../session';
import {
  assertMediaSize,
  createObjectKey,
  createPresignedUpload,
  publicMediaUrl,
  getPrivateMediaUrl,
  verifyUploadedObject,
} from '../storage';
import { insertOutbox } from './users';

type MediaRow = {
  id: string;
  owner_id: string;
  type: 'image' | 'gif' | 'video';
  status: 'pending' | 'processing' | 'ready' | 'failed';
  storage_key: string;
  mime_type: string;
  byte_size: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  variants: Record<string, unknown>;
};

export async function presignMedia(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  assertRateLimit(
    `media-presign:${session.user.id}`,
    getServerEnv().MEDIA_PRESIGN_LIMIT,
    60 * 60 * 1000,
  );
  const input = await parseJson(request, mediaPresignInputSchema);
  assertMediaSize(input.contentType, input.sizeBytes);
  if (
    (input.purpose === 'avatar' || input.purpose === 'banner') &&
    !input.contentType.startsWith('image/')
  ) {
    forbidden('Profile images must be an image format');
  }
  const type =
    input.contentType === 'image/gif'
      ? 'gif'
      : input.contentType.startsWith('video/')
        ? 'video'
        : 'image';
  const key = createObjectKey(session.user.id, input.contentType);
  const row = await queryOne<{ id: string }>(
    `INSERT INTO media
      (owner_id, type, status, storage_key, original_filename, mime_type, byte_size, checksum, variants)
     VALUES ($1, $2, 'pending', $3, $4, $5, $6, $7, $8::jsonb) RETURNING id`,
    [
      session.user.id,
      type,
      key,
      input.fileName,
      input.contentType,
      input.sizeBytes,
      `pending:${randomUUID()}`,
      JSON.stringify({ purpose: input.purpose }),
    ],
  );
  try {
    const signed = await createPresignedUpload({
      key,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      privateObject: input.purpose === 'message',
    });
    return created({
      mediaId: String(row!.id),
      uploadUrl: signed.uploadUrl,
      method: 'PUT' as const,
      headers: signed.headers,
      expiresAt: signed.expiresAt.toISOString(),
    });
  } catch (error) {
    await query("DELETE FROM media WHERE id = $1 AND owner_id = $2 AND status = 'pending'", [
      row!.id,
      session.user.id,
    ]);
    throw error;
  }
}

export async function finalizeMedia(request: NextRequest): Promise<Response> {
  const session = await requireSession(request);
  const input = await parseJson(request, mediaFinalizeInputSchema);
  const row = await queryOne<MediaRow>(
    `SELECT id, owner_id, type, status, storage_key, mime_type, byte_size, width, height, duration_ms, variants
     FROM media WHERE id = $1`,
    [input.mediaId],
  );
  if (!row) notFound('Media');
  if (row.owner_id !== session.user.id) forbidden('You do not own this media');
  if (row.status === 'failed') forbidden('This media upload failed');
  if (row.status === 'pending') {
    const purpose = typeof row.variants.purpose === 'string' ? row.variants.purpose : 'tweet';
    await verifyUploadedObject({
      key: row.storage_key,
      contentType: row.mime_type,
      sizeBytes: Number(row.byte_size),
      privateObject: purpose === 'message',
    });
    await transaction(async (client) => {
      const updated = await client.query(
        `UPDATE media SET status = 'processing', variants = variants || $3::jsonb, updated_at = now()
         WHERE id = $1 AND owner_id = $2 AND status = 'pending' RETURNING id`,
        [input.mediaId, session.user.id, JSON.stringify({ altText: input.altText ?? '' })],
      );
      if (updated.rowCount) {
        await insertOutbox(client, 'media', input.mediaId, 'media.created', {
          mediaId: input.mediaId,
          ownerId: session.user.id,
          purpose,
        });
      }
    });
    row.status = 'processing';
    row.variants = { ...row.variants, altText: input.altText ?? '' };
  }
  return ok(await toMediaAttachment(row));
}

export async function getMediaStatus(
  request: NextRequest,
  context: RouteContext<{ id: string }>,
): Promise<Response> {
  const session = await requireSession(request);
  const { id } = await context.params;
  const row = await queryOne<MediaRow>(
    `SELECT id, owner_id, type, status, storage_key, mime_type, byte_size, width, height, duration_ms, variants
     FROM media WHERE id = $1`,
    [id],
  );
  if (!row) notFound('Media');
  if (row.owner_id !== session.user.id) forbidden('You do not own this media');
  return ok(await toMediaAttachment(row));
}

async function toMediaAttachment(row: MediaRow): Promise<MediaAttachment> {
  const purpose = typeof row.variants.purpose === 'string' ? row.variants.purpose : 'tweet';
  const url =
    purpose === 'message'
      ? (await getPrivateMediaUrl(row.storage_key)).url
      : publicMediaUrl(row.storage_key);
  return {
    id: String(row.id),
    type: row.type,
    url,
    previewUrl: row.status === 'ready' ? url : null,
    altText:
      typeof row.variants.altText === 'string' && row.variants.altText
        ? row.variants.altText
        : null,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    processingStatus: row.status,
  };
}
