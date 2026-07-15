import { z } from 'zod';

export const entityIdSchema = z.string().min(1).max(128);
export const snowflakeIdSchema = z.string().regex(/^\d+$/, 'Expected a decimal identifier');
export const cursorSchema = z.string().min(1).max(2048);
export const isoDateSchema = z.iso.datetime({ offset: true });

export const paginationQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const problemSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string().optional(),
  code: z.string().optional(),
  instance: z.string().optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
});

export type Problem = z.infer<typeof problemSchema>;

export const dataEnvelope = <T extends z.ZodType>(schema: T) => z.object({ data: schema });

export const cursorPageSchema = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: cursorSchema.nullable(),
  });

export type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

export const countSchema = z.number().int().nonnegative();

export const themeSchema = z.enum(['light', 'dim', 'lights-out']);
export const accentColorSchema = z.enum(['blue', 'yellow', 'pink', 'purple', 'orange', 'green']);
export const fontSizeSchema = z.enum(['xs', 'sm', 'md', 'lg', 'xl']);
