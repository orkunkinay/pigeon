import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { home } from '../config.js';
const exec = promisify(execFile);
/** Keep the service alive after an npx cache or source checkout is removed. */
export async function stageRuntime(cli: string): Promise<string> {
  const root = resolve(dirname(cli), '..');
  const runtimeRoot = join(home, 'runtimes');
  if (root.startsWith(runtimeRoot + sep)) return resolve(cli);
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const hash = createHash('sha256');
  // Include the entire build, not just version, so local fixes receive a distinct immutable install.
  const { readdir } = await import('node:fs/promises');
  async function digest(dir: string) {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) await digest(p);
      else hash.update(await readFile(p));
    }
  }
  await digest(join(root, 'dist'));
  hash.update(await readFile(join(root, 'package-lock.json')));
  const destination = join(runtimeRoot, `${manifest.version}-${hash.digest('hex').slice(0, 12)}`);
  try {
    await stat(join(destination, 'ready'));
    return join(destination, 'dist/cli.js');
  } catch {}
  await mkdir(runtimeRoot, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(runtimeRoot, '.install-'));
  try {
    await cp(join(root, 'dist'), join(staging, 'dist'), { recursive: true });
    for (const name of ['package-lock.json', 'slack-manifest.json'])
      await cp(join(root, name), join(staging, name));
    delete manifest.scripts;
    await writeFile(join(staging, 'package.json'), JSON.stringify(manifest));
    await exec('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], {
      cwd: staging,
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });
    await writeFile(join(staging, 'ready'), 'pigeon\n');
    await rename(staging, destination);
    return join(destination, 'dist/cli.js');
  } catch (e) {
    await rm(staging, { recursive: true, force: true });
    throw e;
  }
}
