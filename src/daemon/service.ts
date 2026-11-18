import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { home } from '../config.js';
import { stageRuntime } from './runtime.js';
const exec = promisify(execFile);
export const label = 'dev.pigeon.companion';
export const plistPath = join(homedir(), 'Library/LaunchAgents', label + '.plist');
export function plist(node: string, cli: string, envPath: string) {
  const escape = (s: string) =>
    s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  return `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${escape(node)}</string><string>${escape(cli)}</string><string>daemon</string></array><key>EnvironmentVariables</key><dict><key>PATH</key><string>${escape(envPath)}</string><key>PIGEON_HOME</key><string>${escape(home)}</string>${process.env.CODEX_HOME ? `<key>CODEX_HOME</key><string>${escape(process.env.CODEX_HOME)}</string>` : ''}</dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer><key>StandardOutPath</key><string>${escape(join(home, 'pigeon.log'))}</string><key>StandardErrorPath</key><string>${escape(join(home, 'pigeon.log'))}</string></dict></plist>`;
}
export async function installService(cli: string) {
  if (process.platform !== 'darwin') throw Error('LaunchAgent installation requires macOS');
  await mkdir(home, { recursive: true, mode: 0o700 });
  await mkdir(join(homedir(), 'Library/LaunchAgents'), { recursive: true });
  await writeFile(join(home, 'pigeon.log'), '', { flag: 'a', mode: 0o600 });
  const stableCli = await stageRuntime(cli);
  await writeFile(
    plistPath,
    plist(process.execPath, stableCli, process.env.PATH || '/usr/bin:/bin'),
    { mode: 0o600 },
  );
  await exec('/bin/launchctl', ['bootout', `gui/${process.getuid!()}/${label}`]).catch(() => {});
  for (let attempt = 0; ; attempt++) {
    try {
      await exec('/bin/launchctl', ['bootstrap', `gui/${process.getuid!()}`, plistPath]);
      break;
    } catch (e) {
      if (attempt >= 10) throw e;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return stableCli;
}
export async function removeService() {
  await exec('/bin/launchctl', ['bootout', `gui/${process.getuid!()}/${label}`]).catch(() => {});
  await rm(plistPath, { force: true });
}
