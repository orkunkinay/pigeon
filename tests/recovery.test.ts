import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
test('a crash during command delivery never replays the command and notifies its exact conversation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pigeon-recovery-')),
    path = join(dir, 'state.sqlite');
  try {
    const first = new Store(path);
    first.enqueue('id', 'D1', 'thread', 'potentially consequential instruction');
    first.state('id', 'sending');
    first.bind('D1', 'thread', 'original-session');
    first.close();
    const recovered = new Store(path);
    assert.equal(recovered.queued().length, 0);
    assert.equal(recovered.binding('D1', 'thread'), 'original-session');
    assert.equal(
      (recovered.db.prepare('SELECT status,text FROM inbox').get() as any).status,
      'uncertain',
    );
    assert.equal((recovered.db.prepare('SELECT text FROM inbox').get() as any).text, null);
    assert.equal(recovered.outgoing()[0].channel, 'D1');
    assert.equal(recovered.outgoing()[0].root, 'thread');
    recovered.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
