import {createServer} from 'node:http';import {randomBytes} from 'node:crypto';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {readFile} from 'node:fs/promises';
import bolt from '@slack/bolt';import {writeSecret} from './security/keychain.js';import {saveConfig} from './config.js';
const exec=promisify(execFile);
export async function setup(codexBin:string){
 if(process.platform!=='darwin')throw new Error('Automatic secure setup currently supports macOS only.');
 const nonce=randomBytes(24).toString('hex');const path='/'+nonce;
 const manifest=await readFile(new URL('../slack-manifest.json',import.meta.url),'utf8');
 // Local first: no developer configuration token or OAuth client secret is collected.
 const server=createServer(async(req,res)=>{
  const address=server.address();if(!address||typeof address==='string')return res.end();
  const origin=`http://127.0.0.1:${address.port}`;
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
  if(req.headers.host!==`127.0.0.1:${address.port}`||req.url!==path){res.writeHead(404);return res.end();}
  if(req.method==='GET'){
   res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><title>Pigeon setup</title><style>body{font:17px system-ui;max-width:680px;margin:60px auto;padding:24px;color:#183b30}input,textarea{display:block;width:100%;padding:12px;margin:12px 0;box-sizing:border-box}button{padding:12px 24px}textarea{height:160px}</style><h1>Pigeon</h1><p>Your coding agent is one message away.</p><ol><li><a href="https://api.slack.com/apps" target="_blank" rel="noreferrer">Create a Slack app</a> using “Paste a manifest”. Use the manifest below and choose your workspace.</li><li>Install the app in that workspace. Copy its Bot User OAuth Token.</li><li>Under Basic Information, generate an App-Level Token with only <code>connections:write</code>.</li></ol><textarea readonly>${manifest.replaceAll('&','&amp;').replaceAll('<','&lt;')}</textarea><form method="post" autocomplete="off"><label>Bot token<input name="bot" type="password" autocomplete="off" required></label><label>App-level token<input name="app" type="password" autocomplete="off" required></label><button>Save to Keychain</button></form><p>Tokens go directly to this local process and macOS Keychain. Slack’s developer authorization is required once. No hosted service or public webhook is used.</p>`);return;
  }
  if(req.method!=='POST'||req.headers.origin!==origin||req.headers['content-type']!=='application/x-www-form-urlencoded'){res.writeHead(403);return res.end();}
  let body='';for await(const part of req){body+=part;if(body.length>8000){res.writeHead(413);return res.end();}}
  try{
   const p=new URLSearchParams(body),bot=p.get('bot')||'',app=p.get('app')||'';
   if(!bot.startsWith('xoxb-')||!app.startsWith('xapp-'))throw Error();
   const client=new bolt.App({token:bot,appToken:app,socketMode:true,logLevel:bolt.LogLevel.ERROR});
   const auth=await client.client.auth.test();if(!auth.team_id)throw Error();
   // Validate Socket Mode token independently without printing its temporary connection URL.
   const check=await client.client.apiCall('apps.connections.open',{token:app});if(!check.ok)throw Error();
   await writeSecret('bot',bot);await writeSecret('app',app);saveConfig({teamId:auth.team_id,codexBin});
   res.end('Pigeon credentials saved in macOS Keychain. Return to the terminal to pair your Slack user. You can close this tab.');
   server.close();resolveSetup();
  }catch{res.writeHead(400);res.end('Could not validate or securely store these tokens. Check the app installation, token scopes, and Keychain access. No token values were logged.');}
 });
 let resolveSetup:()=>void=()=>{};const completed=new Promise<void>(r=>{resolveSetup=r;});
 server.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address() as any;const url=`http://127.0.0.1:${address.port}${path}`;
 console.log(`Open local setup: ${url}`);await exec('/usr/bin/open',[url]);
 const timeout=setTimeout(()=>server.close(),20*60*1000);timeout.unref();
 await completed;clearTimeout(timeout);
}
