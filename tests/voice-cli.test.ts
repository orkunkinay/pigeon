import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
test('voice CLI changes only preferences, rejects unsupported settings, and needs no credentials', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'pigeon-voice-'));
  const file = join(dir, 'config.json');
  const config = { teamId: 'T-test', userId: 'U-paired', codexBin: '/test/codex' };
  try {
    await writeFile(file, JSON.stringify(config));
    const run = (...args: string[]) =>
      exec(process.execPath, ['--import', 'tsx', resolve('src/cli.ts'), 'voice', ...args], {
        env: { ...process.env, PIGEON_HOME: dir },
      });
    await run('set', 'formality', 'formal');
    let saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.personality.formality, 'formal');
    assert.equal(saved.userId, config.userId);
    assert.equal(saved.codexBin, config.codexBin);
    await assert.rejects(run('set', 'language', 'unsupported'));
    saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.personality.formality, 'formal');
    await run('reset');
    saved = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(saved.personality.voice, 'colleague');
    assert.equal(saved.personality.formality, 'casual');
    assert.equal(saved.userId, config.userId);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
