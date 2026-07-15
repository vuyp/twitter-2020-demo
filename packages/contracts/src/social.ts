import { z } from 'zod';
import { countSchema, cursorPageSchema, entityIdSchema, isoDateSchema } from './common';
import { tweetSchema } from './tweets';
import { userSummarySchema } from './users';

export const followResultSchema = z.object({
  targetUserId: entityIdSchema,
  state: z.enum(['following', 'requested', 'not-following']),
  followersCount: countSchema,
});

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(500),
  type: z.enum(['top', 'latest', 'people', 'media']).default('top'),
  media: z.enum(['photo', 'video']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  from: z.string().optional(),
  since: z.iso.date().optional(),
  until: z.iso.date().optional(),
});

export const searchResultSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tweet'), tweet: tweetSchema }),
  z.object({ kind: z.literal('user'), user: userSummarySchema }),
]);

export const searchPageSchema = cursorPageSchema(searchResultSchema);

export const trendSchema = z.object({
  id: entityIdSchema,
  name: z.string(),
  query: z.string(),
  category: z.string().nullable(),
  tweetCount: countSchema,
  rank: z.number().int().positive(),
});

export const notificationTypeSchema = z.enum([
  'like',
  'retweet',
  'follow',
  'follow_request',
  'mention',
  'reply',
  'quote',
  'poll_result',
  'system',
]);

export const notificationSchema = z.object({
  id: entityIdSchema,
  type: notificationTypeSchema,
  actor: userSummarySchema.nullable(),
  tweet: tweetSchema.nullable(),
  text: z.string().nullable(),
  read: z.boolean(),
  createdAt: isoDateSchema,
});

export const notificationPageSchema = cursorPageSchema(notificationSchema);
export const markNotificationsReadInputSchema = z.object({
  ids: z.array(entityIdSchema).max(100).optional(),
});

export type SearchResult = z.infer<typeof searchResultSchema>;
export type Trend = z.infer<typeof trendSchema>;
export type Notification = z.infer<typeof notificationSchema>;
