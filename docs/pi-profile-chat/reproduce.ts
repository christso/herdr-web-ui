import { mkdirSync, mkdtempSync, writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

const baseline=resolve(process.env.PI_QA_BASE_ROOT ?? process.cwd());
const { TEST_SESSION }=await import(pathToFileURL(join(baseline,'scripts/test-herdr.ts')).href);
const { workspaceCreate, workspaceClose, agentGet, paneRead }=await import(pathToFileURL(join(baseline,'server/herdr/client.ts')).href);
const fixed=process.env.PI_QA_FIXED_ROOT ?? process.cwd();
const out=resolve(process.env.PI_QA_OUT ?? '/tmp/herdr-fresh-chat/pi-native');mkdirSync(out,{recursive:true});
const work=mkdtempSync(join(tmpdir(),'pi-native-profile-'));
const home=join(work,'home'), profile=join(work,'compound-profile');
for(const d of [home,profile,join(profile,'extensions'),join(profile,'sessions')]) mkdirSync(d,{recursive:true});
copyFileSync(process.env.PI_QA_EXTENSION ?? join(process.env.HOME!,'.pi/agent/extensions/herdr-agent-state.ts'),join(profile,'extensions','herdr-agent-state.ts'));
const provider=join(work,'fixture-provider.mjs');
writeFileSync(provider,`export default function(pi){ pi.registerProvider('pi-fixture',{baseUrl:'https://fixture.invalid/',apiKey:'fictional-unused',api:'pi-fixture',models:[{id:'offline',name:'Offline fictional fixture',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:8192,maxTokens:1024}],streamSimple(){throw new Error('No model call is permitted in this check')}}); }`);
const pi=process.env.PI_QA_BIN ?? '/tmp/herdr-fresh-chat/pi-1.2.0/node_modules/.bin/pi';
const herdr=Bun.which('herdr')!;
const quote=(s:string)=>`'${s.replaceAll("'", "'\\''")}'`;
const sha=(p:string)=>createHash('sha256').update(readFileSync(p)).digest('hex');
const owned:string[]=[];
const panes:{kind:string;pane:string;workspace:string;path:string}[]=[];
const browserSession='pi-profile-native-'+process.pid;
const benv={...process.env,HOME:join(work,'browser'),XDG_CONFIG_HOME:join(work,'browser-config'),XDG_CACHE_HOME:join(work,'browser-cache'),AGENT_BROWSER_EXECUTABLE_PATH:process.env.AGENT_BROWSER_EXECUTABLE_PATH ?? '/usr/bin/google-chrome'};
for(const d of [benv.HOME,benv.XDG_CONFIG_HOME,benv.XDG_CACHE_HOME])mkdirSync(d,{recursive:true});
const browser=(...args:string[])=>execFileSync('agent-browser',['--session',browserSession,'--args','--no-sandbox',...args],{env:benv,encoding:'utf8',timeout:40000}).trim();
const evalJson=(js:string)=>{const v=JSON.parse(browser('eval',`JSON.stringify(${js})`));return typeof v==='string'?JSON.parse(v):v;};
async function phoneReady(){
 const toggle=evalJson(`document.querySelector('.drawer-toggle')?.getAttribute('aria-expanded')`);
 if(toggle==='true')browser('click','.drawer-toggle');
 for(const deadline=Date.now()+5000;;){
  const layout=evalJson(`({sidebarRight:document.querySelector('.sidebar')?.getBoundingClientRect().right??0,width:innerWidth,scroll:document.documentElement.scrollWidth})`);
  if(layout.sidebarRight<=0 && layout.scroll<=layout.width)return layout;
  if(Date.now()>deadline)throw new Error('Phone layout did not settle '+JSON.stringify(layout));await Bun.sleep(100);
 }
}
let app:ReturnType<typeof Bun.spawn>|undefined;
const report:any={pi_version:execFileSync(pi,['--version'],{encoding:'utf8'}).trim(),herdr_version:execFileSync(herdr,['--version'],{encoding:'utf8'}).trim(),messages_sent:0,model_calls:0,extension_sha256:sha(join(profile,'extensions','herdr-agent-state.ts')),fixed_parser_sha256:sha(join(fixed,'server/pi.ts')),cases:[]};
try{
 for(const kind of ['fresh','resumed']){
  const cwd=join(work,kind+'-project');mkdirSync(cwd,{recursive:true});
  const ws=await workspaceCreate({cwd,label:'Pi '+kind+' profile fixture'});owned.push(ws.workspace.workspace_id);
  let resumed:string|undefined;
  if(kind==='resumed'){
   resumed=join(profile,'sessions','fictional-session.jsonl');
   const timestamp='2026-10-16T00:00:00.000Z';
   const entries=[{type:'session',version:3,id:randomUUID(),timestamp,cwd},{type:'model_change',id:'model',parentId:null,timestamp,provider:'pi-fixture',modelId:'offline'},{type:'message',id:'user',parentId:'model',timestamp,message:{role:'user',content:'Show the fictional resumed Pi session.'}},{type:'message',id:'assistant',parentId:'user',timestamp,message:{role:'assistant',provider:'pi-fixture',model:'offline',api:'pi-fixture',content:[{type:'text',text:'This fictional session is ready in chat.'}],stopReason:'stop',timestamp:Date.parse(timestamp),usage:{input:3,output:7,cacheRead:0,cacheWrite:0,totalTokens:10,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}}}];
   writeFileSync(resumed,entries.map(e=>JSON.stringify(e)).join('\n')+'\n');
  }
  const args=[pi,'--offline','--no-tools','--no-mcp','--no-skills','--tui-mode','regular','--extension',provider,'--provider','pi-fixture','--model','offline',...(resumed?['--session',resumed]:[])];
  const command=['env',`HOME=${home}`,`PI_CODING_AGENT_DIR=${profile}`,'PI_OFFLINE=1',...args].map(quote).join(' ');
  execFileSync(herdr,['--session',TEST_SESSION,'pane','run',ws.root_pane.pane_id,command],{timeout:15000});
  let path:string|undefined;
  for(const deadline=Date.now()+30000;Date.now()<deadline;){
   const a=await agentGet(ws.root_pane.pane_id).catch(()=>null);
   if(a?.agent==='pi' && a.agent_session?.kind==='path' && a.agent_session.source==='herdr:pi' && a.agent_status==='idle'){path=a.agent_session.value;break;}
   await Bun.sleep(100);
  }
  assert.ok(path,'Native Pi must report its own session before browser checks');
  assert.ok(path.startsWith(profile+'/sessions/'));
  assert.equal(existsSync(path),kind==='resumed');
  panes.push({kind,pane:ws.root_pane.pane_id,workspace:ws.workspace.workspace_id,path});
 }
 for(const [mode,root] of [['red',baseline],['green',fixed]]){
  const ready=join(work,mode+'-ready.json'),host=join(work,mode+'-host.ts');
  writeFileSync(host,`import {createServer} from ${JSON.stringify(root+'/server/index.ts')};import{writeFileSync}from'node:fs';const app=createServer({port:0,hostname:'127.0.0.1',token:'',stateDir:${JSON.stringify(join(work,mode+'-web-state'))},registerBridge:false});await app.statusReady;writeFileSync(${JSON.stringify(ready)},JSON.stringify({port:app.port}));process.on('SIGTERM',()=>{app.stop();process.exit(0)});`);
  const appEnv={...process.env,HOME:home};delete appEnv.PI_CODING_AGENT_DIR;delete appEnv.PI_CODING_AGENT_SESSION_DIR;
  app=Bun.spawn([process.execPath,host],{cwd:root,env:appEnv,stdout:Bun.file(join(out,mode+'-app.log')),stderr:Bun.file(join(out,mode+'-app.err.log'))});
  for(const deadline=Date.now()+20000;!existsSync(ready);){if(Date.now()>deadline)throw new Error(mode+' app not ready');await Bun.sleep(100);}
  const {port}=JSON.parse(readFileSync(ready,'utf8'));const origin=`http://127.0.0.1:${port}`;
  for(const item of panes){
   const api=await fetch(origin+'/api/pane/conversation?pane_id='+encodeURIComponent(item.pane)).then(r=>r.json()) as any;
   assert.equal(api.source,mode==='red'?'scrollback':'pi-transcript');
   assert.equal(api.turns.length,mode==='green'&&item.kind==='resumed'?2:0);
   browser('set','viewport','1280','900');browser('open',origin+'/?ws='+item.workspace+'&pane='+encodeURIComponent(item.pane)+'&view=chat');
   let probe:any;
   for(const deadline=Date.now()+15000;;){
    probe=evalJson(`({unavailable:/conversation unavailable|chat unavailable/i.test(document.body.innerText),greeting:!!document.querySelector('.composer-greeting'),turns:document.querySelectorAll('.chat-turn').length,fictionalAnswer:document.body.innerText.includes('This fictional session is ready in chat.')})`);
    const okay=mode==='red'?probe.unavailable:(item.kind==='fresh'?probe.greeting:probe.fictionalAnswer);
    if(okay)break;if(Date.now()>deadline)throw new Error(mode+' '+item.kind+' UI state mismatch '+JSON.stringify(probe));await Bun.sleep(200);
   }
   browser('screenshot',join(out,`${mode}-${item.kind}-desktop.png`));browser('set','viewport','390','844');const phone=await phoneReady();browser('screenshot',join(out,`${mode}-${item.kind}-phone.png`));
   const native=await paneRead({paneId:item.pane,source:'visible',format:'text'});
   writeFileSync(join(out,`${mode}-${item.kind}-terminal.txt`),native.text);
   report.cases.push({mode,kind:item.kind,api:{source:api.source,turns:api.turns.length,unwritten:api.history_id?.startsWith('unwritten:')??false},browser:probe,phone});
  }
  browser('close');app.kill();await app.exited;app=undefined;
 }
 assert.equal(sha(join(fixed,'server/pi.ts')),report.fixed_parser_sha256);
 report.status='passed';writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(e){report.status='failed';report.error=String(e);writeFileSync(join(out,'report.json'),JSON.stringify(report,null,2)+'\n');throw e;}
finally{try{browser('close')}catch{}app?.kill();for(const ws of owned)await workspaceClose(ws);}
