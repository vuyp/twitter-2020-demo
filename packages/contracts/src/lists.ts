import { z } from 'zod';
import { countSchema, cursorPageSchema, entityIdSchema, isoDateSchema } from './common';
import { userSummarySchema } from './users';

export const listSchema = z.object({
  id: entityIdSchema,
  name: z.string().trim().min(1).max(25),
  description: z.string().max(100),
  private: z.boolean(),
  owner: userSummarySchema,
  membersCount: countSchema,
  followersCount: countSchema,
  following: z.boolean(),
  createdAt: isoDateSchema,
  bannerUrl: z.string().url().nullable(),
});

export const listDetailSchema = listSchema.extend({
  members: z.array(userSummarySchema).optional(),
});

export const createListInputSchema = z.object({
  name: z.string().trim().min(1).max(25),
  description: z.string().max(100).default(''),
  private: z.boolean().default(false),
  bannerMediaId: entityIdSchema.optional(),
});

export const updateListInputSchema = createListInputSchema.partial();
export const listMemberInputSchema = z.object({ userId: entityIdSchema });
export const listPageSchema = cursorPageSchema(listSchema);

export const momentSchema = z.object({
  id: entityIdSchema,
  title: z.string().min(1).max(75),
  description: z.string().max(250),
  coverMediaUrl: z.string().url().nullable(),
  owner: userSummarySchema,
  published: z.boolean(),
  createdAt: isoDateSchema,
});

export const createMomentInputSchema = z.object({
  title: z.string().trim().min(1).max(75),
  description: z.string().max(250).default(''),
  coverMediaId: entityIdSchema.optional(),
});

export const updateMomentInputSchema = createMomentInputSchema.partial();
export const momentTweetInputSchema = z.object({ tweetId: entityIdSchema });

export const topicSchema = z.object({
  id: entityIdSchema,
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  following: z.boolean(),
  tweetCount: countSchema,
});

export const topicPageSchema = cursorPageSchema(topicSchema);

export type TwitterList = z.infer<typeof listSchema>;
export type TwitterListDetail = z.infer<typeof listDetailSchema>;
export type CreateListInput = z.infer<typeof createListInputSchema>;
