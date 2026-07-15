import { z } from 'zod';
import { cursorPageSchema, entityIdSchema, isoDateSchema } from './common';

export const reportReasonSchema = z.enum([
  'spam',
  'abuse',
  'self_harm',
  'sensitive_media',
  'impersonation',
  'copyright',
  'other',
]);

export const createReportInputSchema = z.object({
  targetType: z.enum(['user', 'tweet', 'message']),
  targetId: entityIdSchema,
  reason: reportReasonSchema,
  details: z.string().max(1000).optional(),
});

export const reportSchema = createReportInputSchema.extend({
  id: entityIdSchema,
  reporterId: entityIdSchema,
  status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']),
  createdAt: isoDateSchema,
  reviewedAt: isoDateSchema.nullable(),
});

export const reportPageSchema = cursorPageSchema(reportSchema);

export const updateReportInputSchema = z.object({
  status: z.enum(['reviewing', 'resolved', 'dismissed']),
  resolution: z.string().trim().min(1).max(2000).optional(),
});

export type CreateReportInput = z.infer<typeof createReportInputSchema>;
export type Report = z.infer<typeof reportSchema>;
