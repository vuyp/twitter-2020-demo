import { describe, expect, it } from 'vitest';
import { REALTIME_RETRY_DELAY_MS, realtimeTokenRefreshDelay } from './realtime-client';

describe('realtime token renewal', () => {
  it('renews thirty seconds before token expiry', () => {
    const now = Date.parse('2020-11-30T12:00:00.000Z');
    expect(realtimeTokenRefreshDelay('2020-11-30T12:05:00.000Z', now)).toBe(270_000);
  });

  it('renews promptly when a timer wakes close to expiry', () => {
    const now = Date.parse('2020-11-30T12:04:59.500Z');
    expect(realtimeTokenRefreshDelay('2020-11-30T12:05:00.000Z', now)).toBe(1_000);
  });

  it('uses a bounded retry for an invalid expiry value', () => {
    expect(realtimeTokenRefreshDelay('invalid')).toBe(REALTIME_RETRY_DELAY_MS);
  });
});
