import { z } from 'zod';

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1).default('postgresql://twitter:twitter@localhost:5432/twitter'),
  BETTER_AUTH_SECRET: z.string().min(32).default('development-only-secret-change-me-now'),
  BETTER_AUTH_TRUSTED_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().url())),
  AUTH_REQUIRE_EMAIL_VERIFICATION: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  REALTIME_SHARED_SECRET: z.string().min(32).default('development-realtime-secret-change-me'),
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_PUBLIC_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('twitter-media'),
  S3_PRIVATE_BUCKET: z.string().default('twitter-private'),
  S3_ACCESS_KEY: z.string().default('twitter'),
  S3_SECRET_KEY: z.string().default('twitter-dev-secret'),
  S3_PUBLIC_URL: z.string().url().default('http://localhost:9000/twitter-media'),
  MEDIA_MAX_IMAGE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(15 * 1024 * 1024),
  MEDIA_MAX_VIDEO_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(512 * 1024 * 1024),
  MEDIA_PRESIGN_LIMIT: z.coerce.number().int().positive().default(120),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_FROM: z.string().default('Twitter <no-reply@twitter.local>'),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional().or(z.literal('')),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getTrustedOrigins(
  env: Pick<ServerEnv, 'APP_URL' | 'BETTER_AUTH_TRUSTED_ORIGINS'>,
): string[] {
  return [...new Set([env.APP_URL, ...env.BETTER_AUTH_TRUSTED_ORIGINS].map(toHttpOrigin))];
}

export function isTrustedOrigin(
  value: string,
  env: Pick<ServerEnv, 'APP_URL' | 'BETTER_AUTH_TRUSTED_ORIGINS'>,
): boolean {
  try {
    const parsed = new URL(value);
    return parsed.origin === value && getTrustedOrigins(env).includes(value);
  } catch {
    return false;
  }
}

function toHttpOrigin(value: string): string {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('Trusted origins must be HTTP(S) URLs without credentials');
  }
  return parsed.origin;
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(source);
}

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cached) cached = parseServerEnv(process.env);
  return cached;
}
