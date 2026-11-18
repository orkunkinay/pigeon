import { execFile, spawn } from 'node:child_process';import { promisify } from 'node:util';
const exec=promisify(execFile);
function service(kind:string){if(!/^(bot|app)$/.test(kind))throw new Error('Invalid credential kind');return `dev.pigeon.slack.${kind}`;}
export async function readSecret(kind:'bot'|'app'):Promise<string> {
 if(process.platform!=='darwin')throw new Error('Keychain credentials currently require macOS');
 const {stdout}=await exec('/usr/bin/security',['find-generic-password','-a','pigeon','-s',service(kind),'-w']);return stdout.trim();
}
export async function writeSecret(kind:'bot'|'app',secret:string){
 if(process.platform!=='darwin')throw new Error('Keychain credentials currently require macOS');
 if(!/^xox[bp]-[A-Za-z0-9-]+$/.test(secret)&&!/^xapp-[A-Za-z0-9-]+$/.test(secret))throw new Error('Invalid Slack token format');
 // Interactive stdin keeps the secret out of argv, shell expansion, and logs.
 const quote=(s:string)=>'"'+s.replaceAll('\\','\\\\').replaceAll('"','\\"')+'"';
 await new Promise<void>((resolve,reject)=>{
  const p=spawn('/usr/bin/security',['-i'],{stdio:['pipe','pipe','pipe']});let error='';
  p.stdout.resume();p.stderr.on('data',d=>{error+=String(d);});p.on('error',()=>reject(new Error('Keychain unavailable')));
  p.on('close',code=>code===0&&!/SecKeychain|error:/i.test(error)?resolve():reject(new Error('Keychain write failed')));
  p.stdin.end(`add-generic-password -U -a pigeon -s ${service(kind)} -w ${quote(secret)}\n`);
 });
}
export async function deleteSecrets(){for(const k of ['bot','app'])await exec('/usr/bin/security',['delete-generic-password','-a','pigeon','-s',service(k)]).catch(()=>{});}
