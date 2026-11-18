import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CodexAdapter } from '../src/runtimes/codex/adapter.js';
function fixture(active = true) {
 const calls: any[] = [];
 const rpc = { async call(method: string, params: any) {
  calls.push({ method, params });
  if (method === 'thread/loaded/list') return { data: ['original'], nextCursor: null };
  if (method === 'thread/read') return { thread: { id:'original',cwd:'/project',source:'cli',status:{type:active?'active':'idle'},turns:active?[{id:'turn-1',status:'inProgress'}]:[] } };
  if (method === 'turn/steer') return { turnId:'turn-1' };
  return {};
 } };
 return { adapter: new CodexAdapter(rpc as any), calls };
}
test('steers original active turn with a turn precondition and no policy overrides', async () => {
 const { adapter,calls }=fixture();
 assert.equal((await adapter.deliver('original','prioritize latency','event-1')).mode,'steered');
 const steer=calls.find(c=>c.method==='turn/steer');
 assert.equal(steer.params.expectedTurnId,'turn-1');
 assert.equal(steer.params.threadId,'original');
 assert.deepEqual(calls.find(c=>c.method==='thread/resume').params,{threadId:'original'});
 assert.ok(!calls.some(c=>c.method==='thread/start'||c.method==='turn/start'));
});
test('does not resume or control an unloaded historical session',async()=>{
 const {adapter,calls}=fixture(); await assert.rejects(adapter.deliver('historical','change work','e'),/no longer loaded/);
 assert.ok(!calls.some(c=>c.method==='thread/resume'));
});
test('starts a turn in the existing idle thread',async()=>{
 const {adapter,calls}=fixture(false);assert.equal((await adapter.deliver('original','continue','e')).mode,'started');
 assert.equal(calls.find(c=>c.method==='turn/start').params.threadId,'original');
});
