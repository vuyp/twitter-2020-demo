import { describe, expect, it, vi } from 'vitest';
import { isMaintenanceMode } from './maintenance';

describe('realtime maintenance state', () => {
  it('honors the environment override before the runtime file', () => {
    const readState = vi.fn();
    expect(
      isMaintenanceMode({ MAINTENANCE_MODE: 'true', MAINTENANCE_STATE_FILE: 'ignored' }, readState),
    ).toBe(true);
    expect(readState).not.toHaveBeenCalled();
  });

  it('reads hot on/off changes for each check', () => {
    const environment = { MAINTENANCE_MODE: 'false', MAINTENANCE_STATE_FILE: 'state' };
    expect(isMaintenanceMode(environment, () => 'on')).toBe(true);
    expect(isMaintenanceMode(environment, () => 'off')).toBe(false);
  });
});
