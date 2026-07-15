import { z } from 'zod';
import { countSchema, cursorPageSchema, entityIdSchema, isoDateSchema } from './common';
import { isValidTweetText, weightedTweetLength } from './text';
import { userSummarySchema } from './users';

export const mediaTypeSchema = z.enum(['image', 'gif', 'video']);

export const mediaAttachmentSchema = z.object({
  id: entityIdSchema,
  type: mediaTypeSchema,
  url: z.string().url(),
  previewUrl: z.string().url().nullable(),
  altText: z.string().max(1000).nullable(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  processingStatus: z.enum(['pending', 'processing', 'ready', 'failed']),
});

export const pollOptionSchema = z.object({
  id: entityIdSchema,
  label: z.string().min(1).max(25),
  votes: countSchema,
  selected: z.boolean(),
});

export const pollSchema = z.object({
  id: entityIdSchema,
  options: z.array(pollOptionSchema).min(2).max(4),
  endsAt: isoDateSchema,
  votingStatus: z.enum(['open', 'closed']),
  totalVotes: countSchema,
});

export const tweetCountsSchema = z.object({
  replies: countSchema,
  retweets: countSchema,
  quotes: countSchema,
  likes: countSchema,
});

export const tweetViewerStateSchema = z.object({
  liked: z.boolean(),
  retweeted: z.boolean(),
  bookmarked: z.boolean(),
  canReply: z.boolean(),
  canDelete: z.boolean(),
});

export const quotedTweetSchema = z.object({
  id: entityIdSchema,
  text: z.string(),
  author: userSummarySchema,
  createdAt: isoDateSchema,
  media: z.array(mediaAttachmentSchema).max(1),
  unavailable: z.boolean().default(false),
});

export const tweetSchema = z.object({
  id: entityIdSchema,
  author: userSummarySchema,
  text: z.string(),
  createdAt: isoDateSchema,
  editedAt: z.null(),
  language: z.string().max(10).nullable(),
  source: z.string().max(100).default('Twitter Web App'),
  sensitive: z.boolean(),
  replyToId: entityIdSchema.nullable(),
  replyToUser: userSummarySchema.nullable().optional(),
  conversationId: entityIdSchema,
  quoteTweet: quotedTweetSchema.nullable(),
  media: z.array(mediaAttachmentSchema).max(4),
  poll: pollSchema.nullable(),
  counts: tweetCountsSchema,
  viewerState: tweetViewerStateSchema,
  replyAudience: z.enum(['everyone', 'following', 'mentioned']),
  deleted: z.boolean().default(false),
  pinned: z.boolean().default(false),
});

export const pollInputSchema = z.object({
  options: z.array(z.string().trim().min(1).max(25)).min(2).max(4),
  durationMinutes: z.number().int().min(5).max(10_080),
});

export const createTweetInputSchema = z
  .object({
    text: z.string().max(10_000).default(''),
    mediaIds: z.array(entityIdSchema).max(4).default([]),
    poll: pollInputSchema.optional(),
    replyToId: entityIdSchema.optional(),
    quoteTweetId: entityIdSchema.optional(),
    replyAudience: z.enum(['everyone', 'following', 'mentioned']).default('everyone'),
    sensitive: z.boolean().default(false),
    scheduledAt: isoDateSchema.optional(),
    draft: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (!isValidTweetText(value.text) && value.mediaIds.length === 0 && !value.poll) {
      context.addIssue({
        code: 'custom',
        path: ['text'],
        message: 'A Tweet must contain text, media, or a poll',
      });
    }
    if (weightedTweetLength(value.text) > 280) {
      context.addIssue({
        code: 'custom',
        path: ['text'],
        message: 'Tweet exceeds the 280-character weighted limit',
      });
    }
    if (value.poll && value.mediaIds.length > 0) {
      context.addIssue({
        code: 'custom',
        path: ['poll'],
        message: 'A poll cannot be combined with media',
      });
    }
  });

export const updateDraftInputSchema = createTweetInputSchema;

export const votePollInputSchema = z.object({ optionId: entityIdSchema });

export const timelineEntrySchema = z.object({
  tweet: tweetSchema,
  context: z
    .object({
      type: z.enum(['retweet', 'liked', 'follow', 'topic', 'recommended']),
      user: userSummarySchema.optional(),
      label: z.string().optional(),
    })
    .nullable(),
});

export const timelinePageSchema = cursorPageSchema(timelineEntrySchema);

export const tweetActionResultSchema = z.object({
  tweetId: entityIdSchema,
  active: z.boolean(),
  counts: tweetCountsSchema,
});

export const timelineQuerySchema = z.object({
  mode: z.enum(['top', 'latest']).default('top'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type MediaAttachment = z.infer<typeof mediaAttachmentSchema>;
export type Poll = z.infer<typeof pollSchema>;
export type Tweet = z.infer<typeof tweetSchema>;
export type CreateTweetInput = z.infer<typeof createTweetInputSchema>;
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;
