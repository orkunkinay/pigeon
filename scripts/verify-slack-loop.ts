/** Read only the explicitly mapped disposable Pigeon test conversation. No user token. */
import {WebClient} from '@slack/web-api';import {DatabaseSync} from 'node:sqlite';import {join} from 'node:path';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
import {readSecret} from '../src/security/keychain.js';import {readConfig,home} from '../src/config.js';import {CodexRpc} from '../src/runtimes/codex/rpc.js';import {CodexAdapter} from '../src/runtimes/codex/adapter.js';
const config=readConfig(),rpc=new CodexRpc();await rpc.connect();
try{
 const adapter=new CodexAdapter(rpc);const sessions=await adapter.sessions();const session=sessions.find(s=>s.cwd==='/private/tmp/pigeon-session-proof');assert.ok(session);
 const db=new DatabaseSync(join(home,'pigeon.sqlite'),{readOnly:true});
 const target=db.prepare('SELECT channel,root FROM bindings WHERE session=? LIMIT 1').get(session.id) as any;assert.ok(target);assert.equal(target.channel,config.dmChannel);
 const client=new WebClient(await readSecret('bot'),{timeout:10000,retryConfig:{retries:0}});
 const replies=await client.conversations.replies({channel:target.channel,ts:target.root,limit:100});
 const answer=replies.messages?.find(m=>m.bot_id&&['PIGEON-ORIGINAL-7319','PIGEON-STEER-8426','PIGEON-SLACK-LOOP-9537'].every(s=>m.text?.includes(s)));assert.ok(answer,'Actual Slack response must include original context');
 const samples:number[]=[];for(let i=0;i<10;i++){const t=performance.now();await adapter.sessions();samples.push(performance.now()-t);}
 const evidence={date:new Date().toISOString(),codexCli:'0.169.0',codexDaemon:'0.169.1',threadId:session.id,slackLoopVerified:true,originalContextRecalled:true,slackAnswer:answer.text,discoveryMs:{min:Math.min(...samples),mean:samples.reduce((a,b)=>a+b,0)/samples.length,max:Math.max(...samples)},sampleCount:samples.length};
 await writeFile('docs/slack-proof.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));db.close();
}finally{await rpc.close();}
