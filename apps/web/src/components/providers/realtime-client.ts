export const REALTIME_TOKEN_REFRESH_LEAD_MS = 30_000;
export const REALTIME_RETRY_DELAY_MS = 15_000;

export function realtimeTokenRefreshDelay(
  expiresAt: string,
  now = Date.now(),
  leadTime = REALTIME_TOKEN_REFRESH_LEAD_MS,
): number {
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry)) return REALTIME_RETRY_DELAY_MS;
  return Math.max(1_000, expiry - now - leadTime);
}
