import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENABLED_VALUES = new Set(['1', 'true', 'on', 'enabled', 'yes']);
let warnedStateFile = '';

export function isMaintenanceMode(
  environment: Record<string, string | undefined> = process.env,
  readState: (path: string, encoding: BufferEncoding) => string = readFileSync,
): boolean {
  if (ENABLED_VALUES.has((environment.MAINTENANCE_MODE || '').trim().toLowerCase())) return true;
  const stateFile =
    environment.MAINTENANCE_STATE_FILE || resolve(process.cwd(), '../../.runtime/maintenance');
  try {
    return ENABLED_VALUES.has(readState(stateFile, 'utf8').trim().toLowerCase());
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT' && warnedStateFile !== stateFile) {
      warnedStateFile = stateFile;
      console.warn(
        JSON.stringify({
          level: 'warn',
          service: 'realtime',
          event: 'maintenance.state_unreadable',
          stateFile,
          code,
        }),
      );
    }
    return false;
  }
}
