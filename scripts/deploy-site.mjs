#!/usr/bin/env node
// Publish website/ directly to the gh-pages branch (no CI needed). Usage: npm run deploy:site
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();

const remote = run('git', ['remote', 'get-url', 'origin']);
const name = run('git', ['config', 'user.name']);
const email = run('git', ['config', 'user.email']);
console.log(`Publishing as ${name} <${email}> to ${remote} (gh-pages)`);

run('node', ['website/build.mjs']);
if (run('git', ['status', '--porcelain', '--', 'website'])) {
  console.error(
    'website/ has uncommitted changes. Commit them first so main matches what is published.',
  );
  process.exit(1);
}

const out = mkdtempSync(join(tmpdir(), 'pigeon-site-'));
try {
  cpSync(join(root, 'website'), out, {
    recursive: true,
    filter: (p) => !/\/website\/(build\.mjs|src)(\/|$)/.test(p),
  });
  writeFileSync(join(out, '.nojekyll'), '');
  run('git', ['init', '-q', '-b', 'gh-pages'], out);
  run('git', ['config', 'user.name', name], out);
  run('git', ['config', 'user.email', email], out);
  run('git', ['add', '-A'], out);
  run(
    'git',
    [
      'commit',
      '-qm',
      `Publish the Pigeon website (${run('git', ['rev-parse', '--short', 'HEAD'])})`,
    ],
    out,
  );
  run('git', ['push', '-q', '-f', remote, 'gh-pages'], out);
} finally {
  rmSync(out, { recursive: true, force: true });
}

// Legacy Pages normally rebuilds on push; request one explicitly when gh is available.
try {
  const repo = remote.replace(/^.*github\.com[:/]/, '').replace(/\.git$/, '');
  run('gh', ['api', '-X', 'POST', `repos/${repo}/pages/builds`]);
  console.log(
    `Build requested. Site: https://${repo.split('/')[0]}.github.io/${repo.split('/')[1]}/`,
  );
} catch {
  console.log(
    'Pushed. Pages will rebuild on its own; check the repository settings if it does not.',
  );
}
