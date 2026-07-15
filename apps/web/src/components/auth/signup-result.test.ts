import { describe, expect, it } from 'vitest';
import { isAuthenticatedSignupResult } from './signup-result';

describe('isAuthenticatedSignupResult', () => {
  it('recognizes Better Auth token and session responses', () => {
    expect(isAuthenticatedSignupResult({ token: 'session-token', user: { id: 'user-1' } })).toBe(
      true,
    );
    expect(isAuthenticatedSignupResult({ session: { token: 'session-token' } })).toBe(true);
  });

  it('keeps the verification screen for unauthenticated signup responses', () => {
    expect(isAuthenticatedSignupResult({ token: null, user: { id: 'user-1' } })).toBe(false);
    expect(isAuthenticatedSignupResult({ session: null })).toBe(false);
    expect(isAuthenticatedSignupResult(null)).toBe(false);
  });
});
