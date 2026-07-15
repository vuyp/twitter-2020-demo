import { describe, expect, it } from 'vitest';
import { parseServerEnv } from './env';

describe('email verification environment policy', () => {
  it('requires email verification by default', () => {
    expect(parseServerEnv({}).AUTH_REQUIRE_EMAIL_VERIFICATION).toBe(true);
  });

  it('allows an explicit isolated-demo opt-out', () => {
    expect(
      parseServerEnv({ AUTH_REQUIRE_EMAIL_VERIFICATION: 'false' }).AUTH_REQUIRE_EMAIL_VERIFICATION,
    ).toBe(false);
  });

  it('rejects ambiguous values', () => {
    expect(() => parseServerEnv({ AUTH_REQUIRE_EMAIL_VERIFICATION: '0' })).toThrow();
  });

  it('supports lower isolated-demo media limits', () => {
    const env = parseServerEnv({
      MEDIA_MAX_IMAGE_BYTES: '10485760',
      MEDIA_MAX_VIDEO_BYTES: '52428800',
      MEDIA_PRESIGN_LIMIT: '30',
    });
    expect(env.MEDIA_MAX_IMAGE_BYTES).toBe(10 * 1024 * 1024);
    expect(env.MEDIA_MAX_VIDEO_BYTES).toBe(50 * 1024 * 1024);
    expect(env.MEDIA_PRESIGN_LIMIT).toBe(30);
  });
});
