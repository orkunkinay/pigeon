import {test} from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {Store} from '../src/store.js';import {Approvals} from '../src/approvals.js';import {authorized} from '../src/transports/slack/bridge.js';
function fixture(){const store=new Store(':memory:');store.bind('D1','root','session');const sent:any[]=[];const rpc=Object.assign(new EventEmitter(),{connected:true,respond:(id:any,result:any)=>sent.push({id,result})});return {store,sent,approvals:new Approvals(store,rpc as any)};}
const req={id:9,method:'item/commandExecution/requestApproval',params:{threadId:'session',turnId:'turn',itemId:'item',command:'echo pigeon',cwd:'/proof',availableDecisions:['accept','decline']}};
test('rejects wrong team, user, and public-channel commands',()=>{
 const c={teamId:'T1',userId:'U1',codexBin:'codex'};
 assert.ok(authorized(c,'T1','U1','D1'));for(const a of [['T2','U1','D1'],['T1','U2','D1'],['T1','U1','C1']])assert.ok(!authorized(c,...a as [string,string,string]));
});
test('approval token is bound to conversation, one-use, and connection generation',()=>{
 const {store,sent,approvals}=fixture();approvals.receive(req);const token=(store.outgoing()[0].blocks&&JSON.parse(store.outgoing()[0].blocks))[1].elements[0].value;
 assert.throws(()=>approvals.resolve(token,'D2','root','accept'));assert.throws(()=>approvals.resolve(token,'D1','other','accept'));
 approvals.resolve(token,'D1','root','accept');assert.deepEqual(sent,[{id:9,result:{decision:'accept'}}]);assert.throws(()=>approvals.resolve(token,'D1','root','accept'));
 approvals.receive({...req,id:10});const token2=(store.db.prepare("SELECT token FROM approvals WHERE status='pending'").get() as any).token;approvals.disconnect();assert.throws(()=>approvals.resolve(token2,'D1','root','accept'));store.close();
});
test('native resolution invalidates a Slack approval and unknown requests do not grant access',()=>{
 const {store,sent,approvals}=fixture();approvals.receive(req);const token=(store.db.prepare('SELECT token FROM approvals').get() as any).token;approvals.resolved(9);assert.throws(()=>approvals.resolve(token,'D1','root','accept'));
 approvals.receive({...req,id:11,method:'item/permissions/requestApproval'});assert.equal(sent.length,0);store.close();
});
test('additional permission grants cannot be approved remotely',()=>{
 const {store,approvals}=fixture();approvals.receive({...req,params:{...req.params,additionalPermissions:{network:{enabled:true}}}});const token=(store.db.prepare('SELECT token FROM approvals').get() as any).token;assert.throws(()=>approvals.resolve(token,'D1','root','accept'));approvals.resolve(token,'D1','root','decline');store.close();
});
