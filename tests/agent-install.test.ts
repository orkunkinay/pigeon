import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  installAgentIntegration,
  removeAgentIntegration,
  registration,
} from '../src/agent/install.js';
import { awareness } from '../src/agent/skill.js';
let codex = '';
try {
  codex = execFileSync('/usr/bin/which', ['codex'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
} catch {}
async function paths() {
  const root = await mkdtemp(join(tmpdir(), 'pigeon-register-'));
  return {
    root,
    userHome: join(root, 'user'),
    codexHome: join(root, 'codex'),
    pigeonHome: join(root, 'pigeon'),
  };
}
test(
  'real Codex registration is idempotent and uninstall preserves unrelated config and instructions',
  { skip: !codex },
  async () => {
    const p = await paths();
    try {
      await mkdir(p.codexHome, { recursive: true });
      await writeFile(join(p.codexHome, 'config.toml'), 'model = "example-preserve-me"\n');
      await writeFile(join(p.codexHome, 'AGENTS.md'), 'Keep this user guidance.');
      const installed = await installAgentIntegration(codex, '/stable/cli.js', p);
      await installAgentIntegration(codex, '/stable/cli.js', p);
      const instructions = await readFile(installed.instructionPath, 'utf8');
      assert.equal(instructions.split('<!-- pigeon:begin -->').length - 1, 1);
      assert.equal(
        (await registration(codex, p)).transport.args[0],
        join(p.pigeonHome, 'agent-mcp.mjs'),
      );
      await installAgentIntegration(codex, '/new-stable/cli.js', p);
      assert.match(await readFile(join(p.pigeonHome, 'agent-mcp.mjs'), 'utf8'), /new-stable/);
      assert.deepEqual(await removeAgentIntegration(codex, p), []);
      assert.equal(await readFile(installed.instructionPath, 'utf8'), 'Keep this user guidance.');
      assert.match(
        await readFile(join(p.codexHome, 'config.toml'), 'utf8'),
        /model = "example-preserve-me"/,
      );
      assert.equal(await registration(codex, p), undefined);
      assert.deepEqual(await removeAgentIntegration(codex, p), []);
    } finally {
      await rm(p.root, { recursive: true, force: true });
    }
  },
);

test(
  'upgrades replace only the owned awareness paragraph and include supporting skill files',
  { skip: !codex },
  async () => {
    const p = await paths();
    try {
      const installed = await installAgentIntegration(codex, '/stable/cli.js', p);
      const receiptPath = join(p.pigeonHome, 'agent-integration.json');
      const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
      const legacy = receipt.insertion.replace(awareness, 'Legacy Pigeon instructions.');
      receipt.insertion = legacy;
      await writeFile(receiptPath, JSON.stringify(receipt));
      await writeFile(installed.instructionPath, 'User before\n' + legacy + 'User after\n');
      await installAgentIntegration(codex, '/new-stable/cli.js', p);
      const updated = await readFile(installed.instructionPath, 'utf8');
      assert.match(updated, /Talk to the fork\. Direct the main/);
      assert.ok(!updated.includes('Legacy Pigeon'));
      assert.ok(updated.startsWith('User before\n'));
      assert.ok(updated.endsWith('User after\n'));
      assert.match(
        await readFile(join(p.userHome, '.agents/skills/pigeon/references/routing.md'), 'utf8'),
        /process checkpoint/,
      );
      assert.deepEqual(await removeAgentIntegration(codex, p), []);
      assert.equal(await readFile(installed.instructionPath, 'utf8'), 'User before\nUser after\n');
    } finally {
      await rm(p.root, { recursive: true, force: true });
    }
  },
);
test(
  'nonempty global override is used and edited skill files are preserved',
  { skip: !codex },
  async () => {
    const p = await paths();
    try {
      await mkdir(p.codexHome, { recursive: true });
      await writeFile(join(p.codexHome, 'AGENTS.md'), 'Untouched base');
      await writeFile(join(p.codexHome, 'AGENTS.override.md'), 'Active override\n');
      const installed = await installAgentIntegration(codex, '/stable/cli.js', p);
      assert.equal(installed.instructionPath, join(p.codexHome, 'AGENTS.override.md'));
      assert.equal(await readFile(join(p.codexHome, 'AGENTS.md'), 'utf8'), 'Untouched base');
      await writeFile(installed.skillPath, 'My edited skill');
      await assert.rejects(installAgentIntegration(codex, '/stable/cli.js', p), /preserved/);
      assert.deepEqual(await removeAgentIntegration(codex, p), [installed.skillPath]);
      assert.equal(await readFile(installed.skillPath, 'utf8'), 'My edited skill');
      assert.equal(await readFile(installed.instructionPath, 'utf8'), 'Active override\n');
    } finally {
      await rm(p.root, { recursive: true, force: true });
    }
  },
);
test('an existing unrelated pigeon MCP server is never overwritten', { skip: !codex }, async () => {
  const p = await paths();
  try {
    await mkdir(p.codexHome, { recursive: true });
    const original = '[mcp_servers.pigeon]\ncommand = "/someone-else/server"\n';
    await writeFile(join(p.codexHome, 'config.toml'), original);
    await assert.rejects(
      installAgentIntegration(codex, '/stable/cli.js', p),
      /configuration was preserved/,
    );
    assert.equal(await readFile(join(p.codexHome, 'config.toml'), 'utf8'), original);
  } finally {
    await rm(p.root, { recursive: true, force: true });
  }
});

test(
  'upgrades preserve customized MCP options and uninstall leaves their launcher intact',
  { skip: !codex },
  async () => {
    const p = await paths();
    try {
      await installAgentIntegration(codex, '/stable/cli.js', p);
      const config = join(p.codexHome, 'config.toml');
      const customized =
        (await readFile(config, 'utf8')) +
        '\n[mcp_servers.pigeon.tools.pigeon_notify_human]\napproval_mode = "prompt"\n';
      await writeFile(config, customized);
      await installAgentIntegration(codex, '/new/cli.js', p);
      assert.equal(await readFile(config, 'utf8'), customized);
      assert.deepEqual(await removeAgentIntegration(codex, p), [
        'customized pigeon MCP configuration',
      ]);
      assert.match(await readFile(join(p.pigeonHome, 'agent-mcp.mjs'), 'utf8'), /new/);
      assert.equal(await readFile(config, 'utf8'), customized);
    } finally {
      await rm(p.root, { recursive: true, force: true });
    }
  },
);
