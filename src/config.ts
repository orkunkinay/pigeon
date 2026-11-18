import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
export const home = process.env.PIGEON_HOME || join(homedir(), '.pigeon');
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
