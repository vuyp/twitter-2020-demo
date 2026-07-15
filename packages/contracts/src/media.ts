import { z } from 'zod';
import { entityIdSchema } from './common';
import { mediaAttachmentSchema, mediaTypeSchema } from './tweets';

export const mediaPresignInputSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
  ]),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(512 * 1024 * 1024),
  purpose: z.enum(['tweet', 'message', 'avatar', 'banner']),
});

export const mediaPresignResultSchema = z.object({
  mediaId: entityIdSchema,
  uploadUrl: z.string().url(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expiresAt: z.string(),
});

export const mediaFinalizeInputSchema = z.object({
  mediaId: entityIdSchema,
  altText: z.string().max(1000).optional(),
});

export const mediaFinalizeResultSchema = mediaAttachmentSchema.extend({ type: mediaTypeSchema });

export type MediaPresignInput = z.infer<typeof mediaPresignInputSchema>;
export type MediaPresignResult = z.infer<typeof mediaPresignResultSchema>;
