#!/usr/bin/env node
import {execFile,spawn} from 'node:child_process';import {promisify} from 'node:util';import {readFile,rm,mkdir,open,stat,rename} from 'node:fs/promises';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import {randomBytes} from 'node:crypto';
import {home,readConfig} from './config.js';import {readSecret,deleteSecrets} from './security/keychain.js';import {CodexRpc} from './runtimes/codex/rpc.js';import {CodexAdapter} from './runtimes/codex/adapter.js';import {Store} from './store.js';import {SlackBridge} from './transports/slack/bridge.js';import {setup} from './setup.js';import {installService,removeService} from './daemon/service.js';
const exec=promisify(execFile);const command=process.argv[2]||'help';
async function sessionList(){const rpc=new CodexRpc();try{await rpc.connect();return await new CodexAdapter(rpc).sessions();}finally{rpc.close();}}
async function run(){
 if(command==='sessions'){console.log(JSON.stringify(await sessionList(),null,2));return;}
 if(command==='setup'){
  const {stdout}=await exec('/usr/bin/which',['codex']);await setup(stdout.trim());
  console.log('Credentials saved. Pairing starts now.');await daemon(true);return;
 }
 if(command==='install-service'){readConfig();await installService(fileURLToPath(import.meta.url));console.log('Pigeon LaunchAgent installed.');return;}
 if(command==='pair'){await daemon(true);return;}
 if(command==='daemon'){await daemon(false);return;}
 if(command==='status'||command==='doctor'){
  let config;try{config=readConfig();console.log(`Slack: configured for ${config.teamId}; ${config.userId?'paired':'not paired — run pigeon pair'}`);}catch{console.log('Slack: not configured — run pigeon setup');}
  for(const k of ['bot','app'] as const)try{await readSecret(k);console.log(`Keychain ${k} credential: available`);}catch{console.log(`Keychain ${k} credential: unavailable`);}
  try{const health=JSON.parse(await readFile(join(home,'health.json'),'utf8'));try{process.kill(health.pid,0);}catch{health.time=0;}console.log(`Background service: ${Date.now()-health.time<30000?'running':'stale or stopped'}; Codex: ${health.codex?'connected':'disconnected'}`);}catch{console.log('Background service: not running');}
  try{const s=await sessionList();console.log(`Codex shared runtime: connected; ${s.length} live sessions`);console.log('Only sessions loaded in this daemon are controllable. Embedded/private app servers are unsupported.');}catch{console.log('Codex control unavailable. Open Codex normally; check codex app-server daemon version. Pigeon never resumes history as a substitute.');}
  if(command==='doctor'&&config){try{const r=await exec(config.codexBin,['app-server','daemon','version']);console.log(r.stdout.trim());}catch{console.log('Codex executable unavailable. Run setup again.');}}
  return;
 }
 if(command==='logs'){const p=spawn('/usr/bin/tail',['-n','80','-f',join(home,'pigeon.log')],{stdio:'inherit'});await new Promise(r=>p.on('exit',r));return;}
 if(command==='uninstall'){
  await removeService();await deleteSecrets();await rm(home,{recursive:true,force:true});console.log('Pigeon service, credentials and local state removed. Codex and the Slack application were left intact.');return;
 }
 console.log('Pigeon — your coding agent is one message away.\n\npigeon setup           Connect Slack and pair your user\npigeon status          Check connection and service state\npigeon doctor          Diagnose runtime and credentials\npigeon sessions        List live shared-daemon sessions\npigeon pair            Pair after a previously saved setup\npigeon install-service Install the macOS background service\npigeon logs            Follow redacted service logs\npigeon uninstall       Remove local Pigeon installation');
}
async function daemon(pair:boolean){
 await mkdir(home,{recursive:true,mode:0o700});
 // Atomic directory claim with stale-owner detection prevents competing Socket Mode consumers.
 const lock=join(home,'daemon.lock');
 try{await mkdir(lock);}catch{
  let pid=0;try{pid=Number(await readFile(join(lock,'pid'),'utf8'));process.kill(pid,0);throw Error('Pigeon is already running. Stop its service before pairing.');}catch(e:any){if(e.code!=='ESRCH'&&e.code!=='ENOENT')throw e;}
  const info=await stat(lock);if(!pid&&Date.now()-info.mtimeMs<30000)throw Error('Pigeon is starting in another process.');
  await rm(lock,{recursive:true,force:true});await mkdir(lock);
 }
 const {writeFile}=await import('node:fs/promises');await writeFile(join(lock,'pid'),String(process.pid));
 const config=readConfig();
 // Do not auto-start or restart Codex: its owning UI controls its lifecycle.
 const store=new Store(join(home,'pigeon.sqlite'));let bridge:SlackBridge|undefined;
 try{
  const code=pair&&!config.userId?randomBytes(12).toString('hex'):undefined;
  if(!config.userId&&!code)throw Error('Slack user not paired. Run pigeon pair.');
  if(code)console.log(`In a direct message to Pigeon, send: pair ${code}`);
  bridge=new SlackBridge(config,store,await readSecret('bot'),await readSecret('app'),code);await bridge.start();
  let stopping=false;
  const stop=async()=>{if(stopping)return;stopping=true;await bridge!.stop();store.close();await rm(lock,{recursive:true,force:true});process.exit(0);};
  process.on('SIGTERM',()=>void stop());process.on('SIGINT',()=>void stop());
  if(pair){
   const check=setInterval(async()=>{if(!config.userId)return;clearInterval(check);await bridge!.stop();store.close();await rm(lock,{recursive:true,force:true});await installService(fileURLToPath(import.meta.url));console.log('Paired. Pigeon will start automatically when you log in.');process.exit(0);},1000);
  }
 }catch(e){await bridge?.stop().catch(()=>{});store.close();await rm(lock,{recursive:true,force:true});throw e;}
}
run().catch(e=>{console.error(command==='setup'?'Setup failed. Check Slack installation and Keychain access.':e.message);process.exitCode=1;});
