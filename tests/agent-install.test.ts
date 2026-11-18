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
const codex = execFileSync('/usr/bin/which', ['codex'], { encoding: 'utf8' }).trim();
async function paths() {
  const root = await mkdtemp(join(tmpdir(), 'pigeon-register-'));
  return {
    root,
    userHome: join(root, 'user'),
    codexHome: join(root, 'codex'),
    pigeonHome: join(root, 'pigeon'),
  };
}
test('real Codex registration is idempotent and uninstall preserves unrelated config and instructions', async () => {
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
});
test('nonempty global override is used and edited skill files are preserved', async () => {
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
});
test('an existing unrelated pigeon MCP server is never overwritten', async () => {
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
