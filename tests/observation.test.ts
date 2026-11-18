import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CodexAdapter } from '../src/runtimes/codex/adapter.js';
test('history observation capability fallback never starts or steers work', async () => {
  const calls: string[] = [];
  const rpc = {
    async call(method: string, p: any) {
      calls.push(method);
      if (method === 'thread/loaded/list') return { data: ['main'] };
      if (method === 'thread/read')
        return {
          thread: {
            id: 'main',
            cwd: '/app',
            source: 'cli',
            status: { type: 'idle' },
            turns: p.includeTurns ? [{ id: 'completed', items: [] }] : [],
          },
        };
      throw Object.assign(Error('not supported'), { code: -32601 });
    },
  };
  const result = await new CodexAdapter(rpc as any).snapshot('main');
  assert.equal(result.turns[0].id, 'completed');
  assert.ok(!calls.some((c) => /turn\/(start|steer|interrupt)|thread\/resume/.test(c)));
});
