import { mkdirSync, mkdtempSync, writeFileSync, existsSync, copyFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const repo='/home/christso/projects/christso/herdr-web-ui';
const out='/tmp/herdr-codex-profile-start';
const root=mkdtempSync('/home/christso/.cache/herdr-profile-qa/browser-');
const bin=join(root,'bin'), shared=join(root,'project'), vault=join(root,'fictional-vault');
for(const dir of [bin,shared,vault,join(root,'browser-home')])mkdirSync(dir,{recursive:true});
const homes=Object.fromEntries(['default','native','compound','tsoyang','peer'].map(n=>[n,join(root,n+'-home')]));
for(const home of Object.values(homes))mkdirSync(join(home,'sessions'),{recursive:true});
writeFileSync(join(homes.default,'native.config.toml'),'model = "fixture"\n');
const executable=join(bin,'codex'), script=join(root,'codex.cjs');
copyFileSync(process.execPath,executable);chmodSync(executable,0o755);
const answer='Hello! The fictional profile is ready.';
writeFileSync(script,`const fs=require('node:fs'); const {Database}=require('bun:sqlite');
const home=process.env.CODEX_HOME, cwd=process.cwd();
if(process.argv.includes('--help')){console.log('-p, --profile <CONFIG_PROFILE_V2>');process.exit(0);}
const peer=process.env.FIXTURE_PEER==='1';
process.stdout.write(peer?'Working…\\n':'OpenAI Codex (v0.163.0)\\n› Ask Codex to do anything\\n');
fs.writeFileSync(home+'/ready',String(process.pid));
let done=false;process.stdin.on('data',data=>{if(done||peer||!data.toString().includes('hi'))return; done=true;
const id=crypto.randomUUID(), path=home+'/sessions/rollout-'+id+'.jsonl', now=Date.now();
fs.writeFileSync(path,[{type:'session_meta',payload:{id,cwd,source:'cli'}},{type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'hi'}]}},{type:'response_item',payload:{type:'message',role:'assistant',content:[{type:'output_text',text:${JSON.stringify(answer)}}]}}].map(x=>JSON.stringify(x)).join('\\n')+'\\n');
const db=new Database(home+'/state_5.sqlite');db.exec('CREATE TABLE IF NOT EXISTS threads(id TEXT,rollout_path TEXT,cwd TEXT,archived INTEGER,agent_role TEXT,created_at INTEGER,updated_at INTEGER,created_at_ms INTEGER,source TEXT,first_user_message TEXT)');db.query("INSERT INTO threads VALUES(?,?,?,0,NULL,?,?,?,?,?)").run(id,path,cwd,Math.floor(now/1000),Math.floor(now/1000),now,'cli','hi');db.close();
process.stdout.write('OpenAI Codex (v0.163.0)\\n› hi\\n• '+${JSON.stringify(answer)}+'\\n› Ask Codex to do anything\\n');fs.writeFileSync(home+'/replied','yes');});process.stdin.resume();`);
// Native agent.start resolves this shell wrapper. Its foreground is a copied Bun named codex.
const launchbin=join(root,'launchbin');mkdirSync(launchbin);
writeFileSync(join(launchbin,'codex'),`#!/bin/sh\nexec '${executable}' '${script}' "$@"\n`,{mode:0o755});
for(const name of ['compound','tsoyang'])writeFileSync(join(launchbin,'codex-'+name),`#!/bin/sh\nexport CODEX_HOME='${homes[name]}'\n${name==='tsoyang'?`cd '${vault}' || exit\n`:''}exec '${executable}' '${script}' "$@"\n`,{mode:0o755});
process.env.PATH=launchbin+':'+process.env.PATH;process.env.CODEX_HOME=homes.default;
await import(repo+'/scripts/test-herdr.ts');
assert(process.env.HERDR_TEST_DISPOSABLE_CONFIG && process.env.HERDR_SOCKET?.startsWith(process.env.HERDR_TEST_DISPOSABLE_CONFIG+'/herdr/'));
const {workspaceCreate,workspaceClose,herdrRpc,sessionSnapshot}=await import(repo+'/server/herdr/client.ts');
const env={...process.env,HOME:join(root,'browser-home'),AGENT_BROWSER_EXECUTABLE_PATH:'/usr/bin/google-chrome'};
let session='profile-'+process.pid;const owned:string[]=[];let server:any;
async function browser(args:string[],input?:string){const p=Bun.spawn(['/usr/local/bin/agent-browser','--session',session,'--args','--no-sandbox',...args],{env,stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const stdout=await new Response(p.stdout).text(),stderr=await new Response(p.stderr).text();assert.equal(await p.exited,0,stderr);return stdout;}
async function evaluate(code:string){let value=JSON.parse(await browser(['eval','--stdin'],'(async()=>JSON.stringify(await ('+code+')))()'));return typeof value==='string'?JSON.parse(value):value;}
async function until(test:()=>Promise<any>,label:string){for(const end=Date.now()+18000;;){const v=await test();if(v)return v;if(Date.now()>end)throw Error('Timed out: '+label);await Bun.sleep(80);}}
const results:any[]=[];
try{
 for(const [variant,source] of [['red','/tmp/herdr-codex-launch-directory/before'],['green',repo]]){
  for(const h of Object.values(homes)){for(const file of ['ready','replied','state_5.sqlite','state_5.sqlite-wal','state_5.sqlite-shm']){try{require('node:fs').unlinkSync(join(h,file))}catch{}}}
  const {createServer}=await import(source+'/server/index.ts');
  server=createServer({port:0,hostname:'127.0.0.1',token:'',stateDir:mkdtempSync(join(root,variant+'-state-')),tailscaleOwner:null,registerBridge:false});
  const origin='http://127.0.0.1:'+server.port;session='profile-'+process.pid+'-'+variant;
  const peer=await workspaceCreate({cwd:shared,label:'Fictional peer in a separate Codex home'});owned.push(peer.workspace.workspace_id);
  await herdrRpc('pane.send_text',{pane_id:peer.root_pane.pane_id,text:`CODEX_HOME='${homes.peer}' FIXTURE_PEER=1 '${executable}' '${script}'\n`});
  await until(async()=>existsSync(join(homes.peer,'ready')),'peer ready');
  await herdrRpc('pane.report_agent',{pane_id:peer.root_pane.pane_id,source:'fixture',agent:'codex',state:'working'});
  for(const name of ['default','native','compound','tsoyang']){
   const cwd=['default','native'].includes(name)?join(root,name+'-project'):shared;mkdirSync(cwd,{recursive:true});
   try{require('node:fs').unlinkSync(join(homes.default,'ready'))}catch{}
   const agent=name==='default'?{kind:'codex'}:name==='native'?{kind:'codex',profile:'native'}:{kind:'codex',launcher:'codex-'+name};
   const label='Fictional '+name+' profile ('+variant+')';
   const request=fetch(origin+'/api/workspace/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cwd,label,agent})});
   const pane=await until(async()=>{const snap=await sessionSnapshot();const ws=snap.workspaces.find(w=>w.label===label);const p=snap.panes.find(p=>p.workspace_id===ws?.workspace_id);return p&&existsSync(join(homes[name==='native'?'default':name],'ready'))?p:null},name+' ready');
   await herdrRpc('pane.report_agent',{pane_id:pane.pane_id,source:'fixture',agent:'codex',state:'idle'});
   const created=await(await request).json() as any;assert.equal(created.agent_started,true,JSON.stringify(created));owned.push(created.workspace_id);
   await browser(['open',origin+'/?ws='+created.workspace_id+'&pane='+encodeURIComponent(pane.pane_id)+'&view=chat']);await browser(['set','viewport','1280','850']);
   await evaluate('localStorage.setItem("herdr-web-ui:settings",JSON.stringify({language:"en"}))');await browser(['reload']);
   async function inspect(phase:string){
    const expected=variant==='red'&&['compound','tsoyang'].includes(name)?'scrollback':'codex-transcript';
    const c=await until(async()=>{const c=await(await fetch(origin+'/api/pane/conversation?pane_id='+encodeURIComponent(pane.pane_id))).json() as any;return c.source===expected&&(phase==='before'||expected==='scrollback'||c.turns.length===2)?c:null},name+' '+phase+' conversation');
    const view=await until(async()=>{const v=await evaluate('({unavailable:!!document.querySelector(".chat-terminal-fallback"), greeting:!!document.querySelector(".composer-greeting:not([aria-hidden=true])"),composer:!!document.querySelector(".composer-text"),answer:document.body.innerText.includes('+JSON.stringify(answer)+'),text:document.body.innerText.slice(-1200)})');return expected==='scrollback'?v.unavailable&&v:phase==='after'?v.answer&&v:!v.unavailable&&v.greeting&&v.composer&&v},name+' '+phase+' UI');
    assert.equal(view.unavailable,expected==='scrollback');assert.equal(view.answer,phase==='after'&&expected==='codex-transcript');
    await browser(['screenshot',out+'/'+variant+'-'+name+'-'+phase+'.png']);results.push({variant,profile:name,phase,source:c.source,turns:c.turns.length,unavailable:view.unavailable,greeting:view.greeting,composer:view.composer,answer:view.answer});console.log(JSON.stringify(results.at(-1)));
   }
   await inspect('before');
   await herdrRpc('pane.send_text',{pane_id:pane.pane_id,text:'hi\n'});
   await until(async()=>existsSync(join(homes[name==='native'?'default':name],'replied')),name+' replied');
   await herdrRpc('pane.report_agent',{pane_id:pane.pane_id,source:'fixture',agent:'codex',state:'idle'});
   await inspect('after');
   await workspaceClose(created.workspace_id);owned.splice(owned.indexOf(created.workspace_id),1);
  }
  await workspaceClose(peer.workspace.workspace_id);owned.splice(owned.indexOf(peer.workspace.workspace_id),1);
  await browser(['close']);server.stop();server=undefined;
 }
 writeFileSync(out+'/browser-report.json',JSON.stringify({status:'passed',model_calls:0,user_panes_touched:0,results},null,2)+'\n');
}finally{try{await browser(['close'])}catch{};server?.stop();for(const ws of owned.reverse())await workspaceClose(ws).catch(()=>{});}
