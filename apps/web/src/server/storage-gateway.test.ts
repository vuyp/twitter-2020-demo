import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({
  NODE_ENV: 'production' as 'development' | 'test' | 'production',
  S3_ENDPOINT: 'http://minio:9000',
  S3_PUBLIC_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'twitter-media',
  S3_PRIVATE_BUCKET: 'twitter-private',
  S3_ACCESS_KEY: 'twitter',
  S3_SECRET_KEY: 'twitter-dev-secret',
  S3_PUBLIC_URL: 'http://localhost:9000/twitter-media',
  MEDIA_MAX_IMAGE_BYTES: 15 * 1024 * 1024,
  MEDIA_MAX_VIDEO_BYTES: 50 * 1024 * 1024,
}));

vi.mock('./env', () => ({ getServerEnv: () => env }));

import {
  assertMediaSize,
  createPresignedUpload,
  getPrivateDownloadUrl,
  getPrivateMediaUrl,
  publicMediaUrl,
} from './storage';

describe('same-origin object storage gateway', () => {
  beforeEach(() => {
    env.NODE_ENV = 'production';
  });

  it('keeps public object URLs on the application /media path in production', () => {
    expect(publicMediaUrl('originals/2020/profile photo#1.png')).toBe(
      '/media/originals/2020/profile%20photo%231.png',
    );
  });

  it('preserves direct MinIO URLs for the standalone development server', () => {
    env.NODE_ENV = 'development';
    expect(publicMediaUrl('originals/avatar.png')).toBe(
      'http://localhost:9000/twitter-media/originals/avatar.png',
    );
  });

  it('enforces the environment-specific public demo upload cap', () => {
    expect(() => assertMediaSize('video/mp4', 50 * 1024 * 1024)).not.toThrow();
    expect(() => assertMediaSize('video/mp4', 50 * 1024 * 1024 + 1)).toThrow(
      'The file exceeds the 50 MB limit',
    );
  });

  it('returns a same-origin public-bucket PUT URL without changing its signed URI', async () => {
    const signed = await createPresignedUpload({
      key: 'originals/2020/test image.png',
      contentType: 'image/png',
      sizeBytes: 123,
    });

    expect(signed.uploadUrl.startsWith('/twitter-media/originals/2020/test%20image.png?')).toBe(
      true,
    );
    expect(signed.uploadUrl).not.toContain('localhost:9000');
    const url = new URL(signed.uploadUrl, 'https://codespace.example');
    expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;host');
    expect(url.searchParams.get('x-amz-meta-upload-state')).toBe('pending');
  });

  it('uses only the private bucket path for signed message and archive downloads', async () => {
    const [media, archive] = await Promise.all([
      getPrivateMediaUrl('originals/private image.png'),
      getPrivateDownloadUrl('archives/account.json.gz'),
    ]);

    for (const signed of [media.url, archive.url]) {
      expect(signed.startsWith('/twitter-private/')).toBe(true);
      expect(signed).not.toContain('localhost:9000');
      const url = new URL(signed, 'https://codespace.example');
      expect(url.searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
      expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('host');
    }
    expect(
      new URL(archive.url, 'https://codespace.example').searchParams.get(
        'response-content-disposition',
      ),
    ).toContain('twitter-archive.json.gz');
  });

  it('keeps Caddy aligned with the signer and blocks raw bucket access', () => {
    const caddyfile = readFileSync(resolve(process.cwd(), '../../Caddyfile'), 'utf8');
    const signedHost = new URL(env.S3_PUBLIC_ENDPOINT).host;

    expect(caddyfile).toContain(`header_up Host ${signedHost}`);
    expect(caddyfile).toContain('uri replace /media/ /twitter-media/ 1');
    expect(caddyfile).not.toContain('rewrite * /twitter-media{path}');
    expect(caddyfile).toContain('query X-Amz-Algorithm=AWS4-HMAC-SHA256 X-Amz-Signature=*');
    expect(caddyfile).toMatch(/path \/twitter-media\/\*[\s\S]*?method PUT/);
    expect(caddyfile).toMatch(/path \/twitter-private\/\*[\s\S]*?method GET PUT/);
    expect(caddyfile).toMatch(
      /@unsignedStoragePath path \/twitter-media\/\* \/twitter-private\/\*[\s\S]*?respond "" 404/,
    );
  });
});
