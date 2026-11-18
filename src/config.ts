import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
export const home = process.env.PIGEON_HOME || join(homedir(), '.pigeon');
if (
  [
    resolve(homedir()),
    resolve('/'),
    resolve(process.env.CODEX_HOME || join(homedir(), '.codex')),
  ].includes(resolve(home))
)
  throw new Error('PIGEON_HOME must be a separate Pigeon data directory.');
export const configPath = join(home, 'config.json');
export interface Config {
  teamId: string;
  userId?: string;
  dmChannel?: string;
  codexBin: string;
}
export function readConfig(): Config {
  return JSON.parse(readFileSync(configPath, 'utf8'));
}
export function saveConfig(c: Config) {
  mkdirSync(home, { recursive: true, mode: 0o700 });
  writeFileSync(configPath, JSON.stringify(c, null, 2) + '\n', { mode: 0o600 });
}
