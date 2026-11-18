import {test} from 'node:test';import assert from 'node:assert/strict';
import {Store} from '../src/store.js';import {classify,selectSession} from '../src/router.js';
const a={id:'a',project:'app',name:'app',cwd:'/app',status:'active',updatedAt:0,source:'cli'};
test('never falls through a stale mapping or guesses between projects',()=>{
 assert.equal(selectSession([a], 'old'),undefined); assert.equal(selectSession([a,{...a,id:'b'}]),undefined);
 assert.equal(selectSession([a,{...a,id:'b'}],undefined,'app'),undefined);
});
test('status is observed, stop interrupts, approvals require explicit correlation',()=>{
 assert.equal(classify('Hey, what are you doing?'),'status'); assert.equal(classify('Pause.'),'interrupt');
 assert.equal(classify('Focus on latency instead.'),'instruction');assert.equal(classify('Done'),'ambiguous');
});
test('deduplicates incoming instructions and outgoing notifications durably',()=>{
 const s=new Store(':memory:');assert.ok(s.enqueue('e','d','t','hi'));assert.ok(!s.enqueue('e','d','t','hi'));
 s.state('e','sending');assert.equal(s.queued().length,0);s.bind('d','t','a');assert.equal(s.binding('d','t'),'a');
 s.post('o','d','t','hello');s.post('o','d','t','hello');assert.equal(s.outgoing().length,1);s.sent('o');assert.equal(s.outgoing().length,0);s.close();
});
