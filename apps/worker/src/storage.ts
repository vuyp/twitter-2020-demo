import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { WorkerConfig } from './config.js';

export function createStorage(config: WorkerConfig) {
  const client = new S3Client({
    endpoint: config.s3Endpoint,
    region: config.s3Region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.s3AccessKey,
      secretAccessKey: config.s3SecretKey,
    },
  });

  return {
    async get(key: string, privateObject = false) {
      const result = await client.send(
        new GetObjectCommand({
          Bucket: privateObject ? config.s3PrivateBucket : config.s3Bucket,
          Key: key,
        }),
      );
      if (!result.Body) throw new Error(`Object ${key} has no body`);
      return Buffer.from(await result.Body.transformToByteArray());
    },
    async put(key: string, body: Buffer, contentType: string) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.s3Bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
      return `${config.s3PublicUrl}/${key}`;
    },
    async putPrivate(key: string, body: Buffer, contentType: string) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.s3PrivateBucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'private, no-store',
        }),
      );
    },
    async remove(key: string, privateObject = false) {
      await client.send(
        new DeleteObjectCommand({
          Bucket: privateObject ? config.s3PrivateBucket : config.s3Bucket,
          Key: key,
        }),
      );
    },
  };
}
