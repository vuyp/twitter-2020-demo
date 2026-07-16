import { describe, expect, it, vi } from 'vitest';
import { isMaintenanceMode, maintenanceHtml } from './maintenance';

describe('maintenance mode state', () => {
  it('accepts the deploy-time override without reading the state file', () => {
    const readState = vi.fn();
    expect(
      isMaintenanceMode({ MAINTENANCE_MODE: 'true', MAINTENANCE_STATE_FILE: 'ignored' }, readState),
    ).toBe(true);
    expect(readState).not.toHaveBeenCalled();
  });

  it('hot-reloads the on/off state file', () => {
    const environment = { MAINTENANCE_MODE: 'false', MAINTENANCE_STATE_FILE: 'state' };
    expect(isMaintenanceMode(environment, () => 'on')).toBe(true);
    expect(isMaintenanceMode(environment, () => 'off')).toBe(false);
  });

  it('fails open when the optional state file is absent', () => {
    expect(
      isMaintenanceMode({ MAINTENANCE_MODE: 'false', MAINTENANCE_STATE_FILE: 'missing' }, () => {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }),
    ).toBe(false);
  });

  it('renders the captured 2020 fail-robot copy without app scripts', () => {
    const html = maintenanceHtml();
    expect(html).toContain('Something is technically wrong.');
    expect(html).toContain("Thanks for noticing—we're going to fix it up");
    expect(html).toContain('/maintenance-robot.png');
    expect(html).not.toContain('/_next/');
  });
});
