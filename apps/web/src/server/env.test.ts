import { describe, expect, it } from 'vitest';
import { getTrustedOrigins, isTrustedOrigin, parseServerEnv } from './env';

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

  it('normalizes additional trusted origins for proxied demo requests', () => {
    const env = parseServerEnv({
      APP_URL: 'https://demo.example.test/app',
      BETTER_AUTH_TRUSTED_ORIGINS:
        'https://localhost:80, https://demo.example.test,https://localhost:80',
    });

    expect(getTrustedOrigins(env)).toEqual(['https://demo.example.test', 'https://localhost:80']);
    expect(isTrustedOrigin('https://demo.example.test', env)).toBe(true);
    expect(isTrustedOrigin('https://localhost:80', env)).toBe(true);
    expect(isTrustedOrigin('https://localhost', env)).toBe(false);
    expect(isTrustedOrigin('https://localhost:80.evil.test', env)).toBe(false);
    expect(isTrustedOrigin('https://localhost:80/path', env)).toBe(false);
  });

  it('rejects invalid additional trusted origins', () => {
    expect(() =>
      parseServerEnv({ BETTER_AUTH_TRUSTED_ORIGINS: 'https://localhost:80,not-a-url' }),
    ).toThrow();
    expect(() =>
      getTrustedOrigins(parseServerEnv({ BETTER_AUTH_TRUSTED_ORIGINS: 'ftp://localhost:80' })),
    ).toThrow();
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
