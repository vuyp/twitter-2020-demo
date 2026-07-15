import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { ApiError } from './errors';
import { getServerEnv } from './env';

const CONTENT_LIMITS: Record<string, number> = {
  'image/jpeg': 15 * 1024 * 1024,
  'image/png': 15 * 1024 * 1024,
  'image/webp': 15 * 1024 * 1024,
  'image/gif': 15 * 1024 * 1024,
  'video/mp4': 512 * 1024 * 1024,
  'video/webm': 512 * 1024 * 1024,
};

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
};

let client: S3Client | undefined;
let publicClient: S3Client | undefined;

const STORAGE_GATEWAY_SIGNATURE_HOST = 'localhost:9000';
const PUBLIC_MEDIA_GATEWAY_PREFIX = '/media';

export function getS3Client(): S3Client {
  if (!client) {
    const env = getServerEnv();
    client = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }
  return client;
}

export function getPublicS3Client(): S3Client {
  if (!publicClient) {
    const env = getServerEnv();
    publicClient = new S3Client({
      endpoint: env.S3_PUBLIC_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
    });
  }
  return publicClient;
}

export function assertMediaSize(contentType: string, sizeBytes: number): void {
  const defaultMaximum = CONTENT_LIMITS[contentType];
  if (!defaultMaximum)
    throw new ApiError(415, 'unsupported_media_type', 'That media format is not supported');
  const env = getServerEnv();
  const maximum =
    (contentType.startsWith('video/') ? env.MEDIA_MAX_VIDEO_BYTES : env.MEDIA_MAX_IMAGE_BYTES) ??
    defaultMaximum;
  if (sizeBytes > maximum) {
    throw new ApiError(
      413,
      'media_too_large',
      `The file exceeds the ${Math.floor(maximum / 1024 / 1024)} MB limit`,
    );
  }
}

export function createObjectKey(userId: string, contentType: string): string {
  const extension = EXTENSIONS[contentType];
  if (!extension)
    throw new ApiError(415, 'unsupported_media_type', 'That media format is not supported');
  const date = new Date();
  return `originals/${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${userId}/${randomUUID()}.${extension}`;
}

export async function createPresignedUpload(input: {
  key: string;
  contentType: string;
  sizeBytes: number;
  privateObject?: boolean;
}): Promise<{ uploadUrl: string; expiresAt: Date; headers: Record<string, string> }> {
  assertMediaSize(input.contentType, input.sizeBytes);
  const env = getServerEnv();
  const expiresIn = 15 * 60;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  const command = new PutObjectCommand({
    Bucket: input.privateObject ? env.S3_PRIVATE_BUCKET : env.S3_BUCKET,
    Key: input.key,
    ContentType: input.contentType,
    ContentLength: input.sizeBytes,
    Metadata: { 'upload-state': 'pending' },
  });
  const uploadUrl = await getSignedUrl(getPublicS3Client(), command, { expiresIn });
  return {
    uploadUrl: browserPresignedUrl(uploadUrl),
    expiresAt,
    // Browsers set Content-Length themselves; it is a forbidden request header in fetch.
    headers: { 'content-type': input.contentType },
  };
}

export async function verifyUploadedObject(input: {
  key: string;
  contentType: string;
  sizeBytes: number;
  privateObject?: boolean;
}): Promise<void> {
  const env = getServerEnv();
  let response;
  try {
    response = await getS3Client().send(
      new HeadObjectCommand({
        Bucket: input.privateObject ? env.S3_PRIVATE_BUCKET : env.S3_BUCKET,
        Key: input.key,
      }),
    );
  } catch {
    throw new ApiError(409, 'upload_missing', 'The uploaded media object could not be found');
  }
  if (response.ContentType !== input.contentType || response.ContentLength !== input.sizeBytes) {
    throw new ApiError(
      409,
      'upload_mismatch',
      'The uploaded media does not match the presigned request',
    );
  }
}

export function publicMediaUrl(key: string): string {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  if (usesSameOriginStorageGateway()) {
    return `${PUBLIC_MEDIA_GATEWAY_PREFIX}/${encodedKey}`;
  }
  return `${getServerEnv().S3_PUBLIC_URL.replace(/\/$/, '')}/${encodedKey}`;
}

export async function getPrivateDownloadUrl(
  key: string,
): Promise<{ url: string; expiresAt: string }> {
  const env = getServerEnv();
  const expiresIn = 10 * 60;
  const url = await getSignedUrl(
    getPublicS3Client(),
    new GetObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      Key: key,
      ResponseContentDisposition: 'attachment; filename="twitter-archive.json.gz"',
    }),
    { expiresIn },
  );
  return {
    url: browserPresignedUrl(url),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

export async function getPrivateMediaUrl(key: string): Promise<{ url: string; expiresAt: string }> {
  const env = getServerEnv();
  const expiresIn = 10 * 60;
  const url = await getSignedUrl(
    getPublicS3Client(),
    new GetObjectCommand({ Bucket: env.S3_PRIVATE_BUCKET, Key: key }),
    { expiresIn },
  );
  return {
    url: browserPresignedUrl(url),
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

/**
 * The production Docker topology exposes object storage through Caddy on the
 * application origin. Development keeps using MinIO's configured direct URL.
 *
 * SigV4 signs the Host header. The public endpoint used by the signer is
 * therefore deliberately paired with Caddy's fixed upstream Host override.
 */
function usesSameOriginStorageGateway(): boolean {
  const env = getServerEnv();
  if (env.NODE_ENV !== 'production') return false;
  const endpoint = new URL(env.S3_PUBLIC_ENDPOINT);
  return endpoint.host === STORAGE_GATEWAY_SIGNATURE_HOST && endpoint.pathname === '/';
}

function browserPresignedUrl(signedUrl: string): string {
  if (!usesSameOriginStorageGateway()) return signedUrl;

  const env = getServerEnv();
  const signed = new URL(signedUrl);
  const configuredEndpoint = new URL(env.S3_PUBLIC_ENDPOINT);
  if (signed.origin !== configuredEndpoint.origin) {
    throw new Error('The presigned media URL does not match the configured public S3 endpoint');
  }

  const allowedBucketPrefixes = [env.S3_BUCKET, env.S3_PRIVATE_BUCKET].map(
    (bucket) => `/${encodeURIComponent(bucket)}/`,
  );
  if (!allowedBucketPrefixes.some((prefix) => signed.pathname.startsWith(prefix))) {
    throw new Error('The presigned media URL does not target an allowed media bucket');
  }

  // Keep the canonical path and query intact; Caddy only restores the signed
  // Host header before forwarding this URI to MinIO.
  return `${signed.pathname}${signed.search}`;
}
