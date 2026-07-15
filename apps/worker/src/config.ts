export type WorkerConfig = ReturnType<typeof loadConfig>;

export function loadConfig() {
  const databaseUrl = required('DATABASE_URL');
  const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const s3Endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:9000';
  const s3Region = process.env.S3_REGION ?? 'us-east-1';
  const s3Bucket = process.env.S3_BUCKET ?? 'twitter-media';
  const s3PrivateBucket = process.env.S3_PRIVATE_BUCKET ?? 'twitter-private';
  const s3AccessKey = process.env.S3_ACCESS_KEY ?? 'twitter';
  const s3SecretKey = process.env.S3_SECRET_KEY ?? 'twitter-dev-secret';
  const s3PublicUrl = process.env.S3_PUBLIC_URL ?? `${s3Endpoint}/${s3Bucket}`;

  return {
    appUrl: (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, ''),
    databaseUrl,
    redisUrl,
    s3Endpoint,
    s3Region,
    s3Bucket,
    s3PrivateBucket,
    s3AccessKey,
    s3SecretKey,
    s3PublicUrl: s3PublicUrl.replace(/\/$/, ''),
    smtpHost: process.env.SMTP_HOST ?? 'localhost',
    smtpPort: Number(process.env.SMTP_PORT ?? 1025),
    smtpFrom: process.env.SMTP_FROM ?? 'Twitter <no-reply@twitter.local>',
  };
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
