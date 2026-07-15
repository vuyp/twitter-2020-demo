import { z } from 'zod';
import { cursorPageSchema, entityIdSchema, isoDateSchema } from './common';
import { mediaAttachmentSchema } from './tweets';
import { userSummarySchema } from './users';

export const messageSchema = z.object({
  id: entityIdSchema,
  conversationId: entityIdSchema,
  sender: userSummarySchema,
  text: z.string().max(10_000),
  media: z.array(mediaAttachmentSchema).max(1),
  createdAt: isoDateSchema,
  deletedAt: isoDateSchema.nullable(),
  readBy: z.array(entityIdSchema),
});

export const conversationSchema = z.object({
  id: entityIdSchema,
  participants: z.array(userSummarySchema).min(1),
  name: z.string().max(50).nullable(),
  avatarUrl: z.string().url().nullable(),
  lastMessage: messageSchema.nullable(),
  unreadCount: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const createConversationInputSchema = z.object({
  participantIds: z.array(entityIdSchema).min(1).max(49),
  name: z.string().trim().min(1).max(50).optional(),
  message: z.string().trim().max(10_000).optional(),
});

export const sendMessageInputSchema = z
  .object({
    text: z.string().max(10_000).default(''),
    mediaId: entityIdSchema.optional(),
  })
  .refine((value) => value.text.trim().length > 0 || Boolean(value.mediaId), {
    message: 'A message must contain text or media',
  });

export const conversationPageSchema = cursorPageSchema(conversationSchema);
export const messagePageSchema = cursorPageSchema(messageSchema);

export type Conversation = z.infer<typeof conversationSchema>;
export type Message = z.infer<typeof messageSchema>;
export type SendMessageInput = z.infer<typeof sendMessageInputSchema>;
