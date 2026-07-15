import { createHmac, timingSafeEqual } from 'node:crypto';
import { getServerEnv } from './env';

const TOKEN_TTL_SECONDS = 5 * 60;

export function issueRealtimeToken(
  userId: string,
  now = Date.now(),
): { token: string; expiresAt: string } {
  const expiry = Math.floor(now / 1000) + TOKEN_TTL_SECONDS;
  const encodedUserId = Buffer.from(userId, 'utf8').toString('base64url');
  const payload = `${encodedUserId}.${expiry}`;
  const signature = sign(payload);
  return { token: `${payload}.${signature}`, expiresAt: new Date(expiry * 1000).toISOString() };
}

export function verifyRealtimeToken(token: string, now = Date.now()): string | null {
  const [encodedUserId, expiryValue, providedSignature, ...rest] = token.split('.');
  if (!encodedUserId || !expiryValue || !providedSignature || rest.length > 0) return null;
  const expiry = Number(expiryValue);
  if (!Number.isSafeInteger(expiry) || expiry <= Math.floor(now / 1000)) return null;
  const expected = sign(`${encodedUserId}.${expiryValue}`);
  const actualBytes = Buffer.from(providedSignature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes))
    return null;
  try {
    return Buffer.from(encodedUserId, 'base64url').toString('utf8') || null;
  } catch {
    return null;
  }
}

function sign(payload: string): string {
  return createHmac('sha256', getServerEnv().REALTIME_SHARED_SECRET)
    .update(payload)
    .digest('base64url');
}
