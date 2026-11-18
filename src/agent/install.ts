import { mkdir, readFile, writeFile, rm, rmdir, lstat, rename } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { home } from '../config.js';
import { skill, awareness } from './skill.js';
const exec = promisify(execFile);
type Registration = { command: string; args: string[]; env: Record<string, string> };
type Receipt = {
  skillPath: string;
  instructionPath: string;
  insertion: string;
  skill: string;
  registration: Registration;
  priorRegistration?: Registration;
  priorSkill?: string;
  launcher?: { path: string; content: string };
  configSnapshot?: string;
};
export type InstallPaths = { userHome: string; codexHome: string; pigeonHome: string };
const defaults = (): InstallPaths => ({
  userHome: homedir(),
  codexHome: process.env.CODEX_HOME || join(homedir(), '.codex'),
  pigeonHome: home,
});
async function contents(path: string) {
  try {
    return await readFile(path, 'utf8');
  } catch (e: any) {
    if (e.code === 'ENOENT') return '';
    throw e;
  }
}
async function regular(path: string) {
  try {
    if ((await lstat(path)).isSymbolicLink()) throw Error(`Refusing to edit symlink: ${path}`);
  } catch (e: any) {
    if (e.code !== 'ENOENT') throw e;
  }
}
export async function registration(codex: string, paths = defaults()): Promise<any | undefined> {
  try {
    return JSON.parse(
      (
        await exec(codex, ['mcp', 'get', 'pigeon', '--json'], {
          env: { ...process.env, CODEX_HOME: paths.codexHome },
        })
      ).stdout,
    );
  } catch (e: any) {
    if (/No MCP server named 'pigeon' found/.test(e.stderr || '')) return undefined;
    throw Error('Could not inspect Codex MCP registration');
  }
}
function matches(current: any, expected: Registration) {
  return (
    current?.transport?.command === expected.command &&
    JSON.stringify(current.transport.args) === JSON.stringify(expected.args) &&
    JSON.stringify(current.transport.env || {}) === JSON.stringify(expected.env)
  );
}
async function serverConfig(paths: InstallPaths) {
  // Compare, never edit, Codex's own TOML. Include nested Pigeon tables; exclude unrelated sections.
  const text = await contents(join(paths.codexHome, 'config.toml'));
  let own = false;
  return text
    .split('\n')
    .filter((line) => {
      if (/^\s*\[/.test(line)) own = /^\s*\[mcp_servers\.pigeon(?:\]|\.)/.test(line);
      return own;
    })
    .join('\n')
    .trim();
}
/** Codex's CLI edits only its MCP configuration; global prose gets a delimited owned insertion. */
export async function installAgentIntegration(
  codex: string,
  stableCli: string,
  paths = defaults(),
) {
  const receiptPath = join(paths.pigeonHome, 'agent-integration.json');
  await mkdir(paths.codexHome, { recursive: true });
  const receiptText = await contents(receiptPath);
  const previous: Receipt | undefined = receiptText ? JSON.parse(receiptText) : undefined;
  const skillPath = join(paths.userHome, '.agents/skills/pigeon/SKILL.md');
  await regular(dirname(skillPath));
  await regular(skillPath);
  const existingSkill = await contents(skillPath);
  if (
    existingSkill &&
    (!previous ||
      previous.skillPath !== skillPath ||
      ![previous.skill, previous.priorSkill].includes(existingSkill))
  )
    throw Error('An existing pigeon skill is not owned by this installation; it was preserved.');
  const current = await registration(codex, paths);
  if (
    current &&
    (!previous ||
      !(
        matches(current, previous.registration) ||
        (previous.priorRegistration && matches(current, previous.priorRegistration))
      ))
  )
    throw Error(
      'An existing pigeon MCP configuration was preserved. Choose another name or remove it explicitly before installation.',
    );
  const override = join(paths.codexHome, 'AGENTS.override.md');
  const instructionPath = (await contents(override)).trim()
    ? override
    : join(paths.codexHome, 'AGENTS.md');
  await regular(instructionPath);
  const block = `<!-- pigeon:begin -->\n${awareness}\n<!-- pigeon:end -->`;
  let before = await contents(instructionPath);
  let insertion: string;
  if (previous?.instructionPath === instructionPath && before.includes(previous.insertion)) {
    insertion = previous.insertion;
  } else {
    if (before.includes('<!-- pigeon:begin -->'))
      throw Error('Pigeon instruction block was edited; preserving it for review.');
    insertion = `${before && !before.endsWith('\n') ? '\n' : ''}\n${block}\n`;
  }
  const expected: Registration = {
    command: process.execPath,
    args: [join(paths.pigeonHome, 'agent-mcp.mjs')],
    env: { PIGEON_HOME: paths.pigeonHome },
  };
  const launcher = {
    path: expected.args[0],
    content: `process.argv[2] = 'mcp';\nawait import(${JSON.stringify(pathToFileURL(stableCli).href)});\n`,
  };
  await regular(launcher.path);
  const oldLauncher = await contents(launcher.path);
  if (oldLauncher && oldLauncher !== previous?.launcher?.content)
    throw Error('Pigeon MCP launcher was edited; preserving it.');
  if (
    current &&
    !matches(current, expected) &&
    previous?.configSnapshot &&
    (await serverConfig(paths)) !== previous.configSnapshot
  )
    throw Error(
      'Pigeon MCP settings were customized; preserving them instead of replacing registration.',
    );
  // Write the ownership receipt before mutation so interrupted setup remains reversible.
  const receipt: Receipt = {
    skillPath,
    instructionPath,
    insertion,
    skill,
    registration: expected,
    priorRegistration:
      previous && matches(current, previous.registration)
        ? previous.registration
        : previous?.priorRegistration,
    priorSkill: existingSkill || undefined,
    launcher,
    configSnapshot: previous?.configSnapshot,
  };
  await mkdir(paths.pigeonHome, { recursive: true, mode: 0o700 });
  await writeFile(receiptPath + '.tmp', JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  await rename(receiptPath + '.tmp', receiptPath);
  await writeFile(launcher.path + '.tmp', launcher.content, { mode: 0o600 });
  await rename(launcher.path + '.tmp', launcher.path);
  if (previous && previous.instructionPath !== instructionPath) {
    await regular(previous.instructionPath);
    const old = await contents(previous.instructionPath);
    if (old.includes(previous.insertion))
      await writeFile(previous.instructionPath, old.replace(previous.insertion, ''));
  }
  await mkdir(dirname(skillPath), { recursive: true });
  await writeFile(skillPath, skill);
  await mkdir(dirname(instructionPath), { recursive: true });
  if (!before.includes(insertion)) await writeFile(instructionPath, before + insertion);
  if (!matches(current, expected))
    await exec(
      codex,
      [
        'mcp',
        'add',
        'pigeon',
        '--env',
        `PIGEON_HOME=${paths.pigeonHome}`,
        '--',
        process.execPath,
        launcher.path,
      ],
      { env: { ...process.env, CODEX_HOME: paths.codexHome } },
    );
  if (!matches(await registration(codex, paths), expected))
    throw Error('MCP registration verification failed');
  // Retain the original snapshot if the user customized this registration between installs.
  if (!matches(current, expected) || !receipt.configSnapshot)
    receipt.configSnapshot = await serverConfig(paths);
  delete receipt.priorRegistration;
  delete receipt.priorSkill;
  await writeFile(receiptPath + '.tmp', JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
  await rename(receiptPath + '.tmp', receiptPath);
  return { skillPath, instructionPath, mcpRegistered: true };
}
export async function removeAgentIntegration(codex: string, paths = defaults()) {
  const receiptPath = join(paths.pigeonHome, 'agent-integration.json');
  const text = await contents(receiptPath);
  if (!text) return [];
  const receipt: Receipt = JSON.parse(text);
  const preserved: string[] = [];
  await regular(receipt.skillPath);
  await regular(receipt.instructionPath);
  const installedSkill = await contents(receipt.skillPath);
  if (!installedSkill || [receipt.skill, receipt.priorSkill].includes(installedSkill)) {
    await rm(receipt.skillPath, { force: true });
    await rmdir(dirname(receipt.skillPath)).catch(() => {});
  } else preserved.push(receipt.skillPath);
  const instructions = await contents(receipt.instructionPath);
  if (instructions.includes(receipt.insertion))
    await writeFile(receipt.instructionPath, instructions.replace(receipt.insertion, ''));
  else if (instructions.includes('<!-- pigeon:begin -->')) preserved.push(receipt.instructionPath);
  const current = await registration(codex, paths);
  if (current && receipt.configSnapshot && (await serverConfig(paths)) !== receipt.configSnapshot)
    preserved.push('customized pigeon MCP configuration');
  else if (
    matches(current, receipt.registration) ||
    (receipt.priorRegistration && matches(current, receipt.priorRegistration))
  )
    await exec(codex, ['mcp', 'remove', 'pigeon'], {
      env: { ...process.env, CODEX_HOME: paths.codexHome },
    });
  else if (current) preserved.push('pigeon MCP configuration');
  if (receipt.launcher && !preserved.some((p) => p.includes('MCP configuration'))) {
    await regular(receipt.launcher.path);
    if ((await contents(receipt.launcher.path)) === receipt.launcher.content)
      await rm(receipt.launcher.path, { force: true });
    else if (await contents(receipt.launcher.path)) preserved.push(receipt.launcher.path);
  }
  if (!preserved.length) await rm(receiptPath, { force: true });
  return preserved;
}
