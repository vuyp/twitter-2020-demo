export function isAuthenticatedSignupResult(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;

  const result = value as Record<string, unknown>;
  if (typeof result.token === 'string' && result.token.length > 0) return true;

  return result.session !== null && typeof result.session === 'object';
}
