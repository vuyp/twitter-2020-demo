import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENABLED_VALUES = new Set(['1', 'true', 'on', 'enabled', 'yes']);
const mode = process.argv[2]?.trim().toLowerCase();
if (!['on', 'off', 'status'].includes(mode)) {
  console.error('Usage: pnpm maintenance:on | pnpm maintenance:off | pnpm maintenance:status');
  process.exitCode = 1;
} else {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const stateFile = process.env.MAINTENANCE_STATE_FILE
    ? resolve(repositoryRoot, process.env.MAINTENANCE_STATE_FILE)
    : resolve(repositoryRoot, '.runtime', 'maintenance');
  const runtimeDirectory = dirname(stateFile);
  await mkdir(runtimeDirectory, { recursive: true });

  if (mode === 'on' || mode === 'off') {
    const temporaryFile = `${stateFile}.${process.pid}.tmp`;
    await writeFile(temporaryFile, `${mode}\n`, 'utf8');
    await rename(temporaryFile, stateFile);
    const forcedOn = ENABLED_VALUES.has((process.env.MAINTENANCE_MODE || '').trim().toLowerCase());
    const effectiveMode = forcedOn || mode === 'on' ? 'ON' : 'OFF';
    console.log(`Maintenance switch is ${mode.toUpperCase()}; effective mode is ${effectiveMode}.`);
    if (forcedOn && mode === 'off') {
      console.log(
        'MAINTENANCE_MODE keeps the service ON until that environment override is removed.',
      );
    }
    console.log('The change is picked up on the next request; no container restart is needed.');
  } else {
    if (ENABLED_VALUES.has((process.env.MAINTENANCE_MODE || '').trim().toLowerCase())) {
      console.log('Maintenance mode is ON (forced by MAINTENANCE_MODE).');
    } else {
      try {
        const current = (await readFile(stateFile, 'utf8')).trim().toLowerCase();
        console.log(`Maintenance mode is ${ENABLED_VALUES.has(current) ? 'ON' : 'OFF'}.`);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        console.log('Maintenance mode is OFF.');
      }
    }
  }
}
