import { describe, expect, it } from 'vitest';
import {
  assessRequestOrigin,
  createRequestTrustedOrigins,
  createTrustedOrigins,
  getEffectiveRequestOrigin,
  isTrustedOrigin,
  normalizeOriginHeader,
} from '../origins.mjs';

describe('trusted origin policy', () => {
  const trusted = createTrustedOrigins('https://demo.example.test/app', [
    'https://localhost:80',
    'https://demo.example.test',
  ]);

  it('normalizes and deduplicates configured HTTP origins', () => {
    expect(trusted).toEqual(['https://demo.example.test', 'https://localhost:80']);
    expect(() => createTrustedOrigins('ftp://demo.example.test')).toThrow();
    expect(() => createTrustedOrigins('https://user@example.test')).toThrow();
  });

  it('requires an exact serialized origin header', () => {
    expect(isTrustedOrigin('https://demo.example.test', trusted)).toBe(true);
    expect(isTrustedOrigin('https://localhost:80', trusted)).toBe(true);
    expect(isTrustedOrigin('https://demo.example.test/', trusted)).toBe(false);
    expect(isTrustedOrigin('https://localhost:80.evil.test', trusted)).toBe(false);
    expect(normalizeOriginHeader('HTTPS://demo.example.test')).toBeNull();
  });

  it('uses forwarded hosts only when the derived origin is already trusted', () => {
    expect(
      getEffectiveRequestOrigin(
        {
          requestUrl: 'http://web:3000/api/v1/tweets',
          host: 'web:3000',
          forwardedHost: 'demo.example.test',
          forwardedProto: 'https',
        },
        trusted,
      ),
    ).toBe('https://demo.example.test');

    expect(getEffectiveRequestOrigin({ host: 'demo.example.test' }, trusted)).toBe(
      'https://demo.example.test',
    );

    expect(
      getEffectiveRequestOrigin(
        {
          requestUrl: 'http://web:3000/api/v1/tweets',
          forwardedHost: 'attacker.example',
          forwardedProto: 'https',
        },
        trusted,
      ),
    ).toBeNull();
  });

  it('reports trusted, malformed, and untrusted request origins', () => {
    expect(
      assessRequestOrigin(
        {
          origin: 'https://demo.example.test',
          forwardedHost: 'demo.example.test',
          forwardedProto: 'https',
        },
        trusted,
      ),
    ).toEqual({
      origin: 'https://demo.example.test',
      effectiveOrigin: 'https://demo.example.test',
      trusted: true,
      reason: 'trusted',
    });
    expect(assessRequestOrigin({ origin: 'not a URL' }, trusted).reason).toBe('malformed');
    expect(assessRequestOrigin({ origin: 'https://evil.example' }, trusted).reason).toBe(
      'untrusted',
    );
  });

  it('accepts only an exact origin derived from the effective proxy destination', () => {
    const proxiedRequest = {
      origin: 'https://preview-80.app.github.dev',
      requestUrl: 'http://web:3000/api/v1/tweets',
      host: 'web:3000',
      forwardedHost: 'preview-80.app.github.dev',
      forwardedProto: 'https',
    };
    expect(assessRequestOrigin(proxiedRequest, trusted)).toMatchObject({
      origin: 'https://preview-80.app.github.dev',
      effectiveOrigin: 'https://preview-80.app.github.dev',
      trusted: true,
      reason: 'trusted',
    });
    expect(createRequestTrustedOrigins(proxiedRequest, trusted)).toContain(
      'https://preview-80.app.github.dev',
    );

    expect(
      assessRequestOrigin(
        { ...proxiedRequest, origin: 'https://preview-80.app.github.dev.evil.test' },
        trusted,
      ).trusted,
    ).toBe(false);
    expect(
      assessRequestOrigin(
        {
          ...proxiedRequest,
          origin: 'https://preview-80.app.github.dev.evil.test',
          forwardedHost: 'preview-80.app.github.dev,evil.test',
        },
        trusted,
      ).trusted,
    ).toBe(false);
  });

  it('accepts an exact request URL origin without trusting lookalike hosts', () => {
    const directRequest = {
      origin: 'https://alternate.example.test',
      requestUrl: 'https://alternate.example.test/api/v1/tweets',
      host: 'alternate.example.test',
    };
    expect(assessRequestOrigin(directRequest, trusted).trusted).toBe(true);
    expect(
      assessRequestOrigin(
        { ...directRequest, origin: 'https://alternate.example.test.evil.test' },
        trusted,
      ).trusted,
    ).toBe(false);
  });
});
