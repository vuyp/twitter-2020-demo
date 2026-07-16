import { describe, expect, it } from 'vitest';
import { assessWebRequestOrigin, getTrustedOriginsForRequest } from './request-origin';

function proxiedRequest(origin: string): Request {
  return new Request('http://web:3000/api/auth/sign-in/email', {
    method: 'POST',
    headers: {
      host: 'web:3000',
      origin,
      'x-forwarded-host': 'preview-80.app.github.dev',
      'x-forwarded-proto': 'https',
    },
  });
}

describe('web request origin policy', () => {
  it('adds the exact effective proxy origin to Better Auth trust for that request', () => {
    const request = proxiedRequest('https://preview-80.app.github.dev');
    expect(getTrustedOriginsForRequest(request)).toContain('https://preview-80.app.github.dev');
    expect(assessWebRequestOrigin(request)).toMatchObject({
      origin: 'https://preview-80.app.github.dev',
      effectiveOrigin: 'https://preview-80.app.github.dev',
      trusted: true,
    });
  });

  it('does not accept a hostname that merely prefixes the effective proxy host', () => {
    const request = proxiedRequest('https://preview-80.app.github.dev.evil.test');
    expect(assessWebRequestOrigin(request).trusted).toBe(false);
  });
});
