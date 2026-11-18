import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const exec = promisify(execFile);
const tar = resolve(process.argv[2] || '/tmp/pigeon-release/pigeon-dev-cli-0.1.0.tgz');
const dir = await mkdtemp(join(tmpdir(), 'pigeon-install-'));
const installed = join(dir, 'install'),
  state = join(dir, 'state');
const started = performance.now();
try {
  await exec(
    'npm',
    [
      'install',
      '--prefix',
      installed,
      '--ignore-scripts',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      tar,
    ],
    { timeout: 120000 },
  );
  const cli = join(installed, 'node_modules/@pigeon-dev/cli/dist/cli.js');
  const help = await exec(process.execPath, [cli, 'help']);
  assert.match(help.stdout, /Pigeon/);
  const source = join(installed, 'node_modules/@pigeon-dev/cli/dist/daemon/runtime.js');
  const stage = await exec(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const {stageRuntime}=await import(${JSON.stringify(source)});console.log(await stageRuntime(${JSON.stringify(cli)}));`,
    ],
    { env: { ...process.env, PIGEON_HOME: state }, timeout: 120000 },
  );
  const stableCli = stage.stdout.trim().split('\n').at(-1);
  assert.ok(stableCli.startsWith(state));
  await rm(installed, { recursive: true, force: true });
  const survives = await exec(process.execPath, [stableCli, 'help'], {
    env: { ...process.env, PIGEON_HOME: state },
  });
  assert.match(survives.stdout, /Pigeon/);
  const result = {
    date: new Date().toISOString(),
    node: process.version,
    cleanPrefixInstall: true,
    cliHelp: true,
    immutableRuntimeSurvivedSourceDeletion: true,
    totalInstallAndStageMs: Math.round(performance.now() - started),
    tarballBytes: (await stat(tar)).size,
  };
  await writeFile('docs/package-proof.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally {
  await rm(dir, { recursive: true, force: true });
}
