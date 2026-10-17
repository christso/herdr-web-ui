import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readlinkSync} from 'node:fs';
import {join} from 'node:path';import assert from 'node:assert/strict';
const repo='/home/christso/projects/christso/herdr-web-ui',out='/home/christso/.cache/herdr-profile-qa/footer';
const root=mkdtempSync('/home/christso/.cache/herdr-profile-qa/footer-native-');
const bin=join(root,'bin'),home=join(root,'profile-home'),project=join(root,'fictional-project'),vault=join(root,'fictional-vault');
for(const d of [bin,home,project,vault])mkdirSync(d);
process.env.PATH=bin+':'+process.env.PATH;process.env.CODEX_HOME=home;
await import(repo+'/scripts/test-herdr.ts');
assert(process.env.HERDR_TEST_DISPOSABLE_CONFIG && process.env.HERDR_SOCKET?.startsWith(process.env.HERDR_TEST_DISPOSABLE_CONFIG+'/herdr/'));
const {workspaceClose,herdrRpc,sessionSnapshot,paneRead,paneProcessInfo}=await import(repo+'/server/herdr/client.ts');
const quote=(s:string)=>"'"+s.replaceAll("'","'\\''")+"'";
let browserSession='footer-'+process.pid;
const env={...process.env,HOME:join(root,'browser-home'),XDG_CONFIG_HOME:join(root,'browser-config'),XDG_CACHE_HOME:join(root,'browser-cache'),TMPDIR:root,AGENT_BROWSER_EXECUTABLE_PATH:'/usr/bin/google-chrome'};
async function browser(args:string[],input?:string){const p=Bun.spawn(['agent-browser','--session',browserSession,'--args','--no-sandbox',...args],{env,stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const text=await new Response(p.stdout).text(),err=await new Response(p.stderr).text();assert.equal(await p.exited,0,err);return text;}
async function evaluate(code:string){let v=JSON.parse(await browser(['eval','--stdin'],'(async()=>JSON.stringify(await ('+code+')))()'));return typeof v==='string'?JSON.parse(v):v;}
async function until(test:()=>Promise<any>,label:string,ms=30000){for(const end=Date.now()+ms;;){const v=await test();if(v)return v;if(Date.now()>end)throw Error('Timed out '+label);await Bun.sleep(100);}}
let requests=0;
let answer='';
const provider=Bun.serve({port:0,hostname:'127.0.0.1',async fetch(req){
 if(!new URL(req.url).pathname.endsWith('/responses'))return Response.json({data:[]});
 requests++;
 const message={id:'msg_fixture_'+requests,type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:answer,annotations:[]}]};
 const response={id:'resp_fixture_'+requests,object:'response',created_at:Math.floor(Date.now()/1000),status:'completed',model:'fixture',output:[message],usage:{input_tokens:1,output_tokens:20,total_tokens:21}};
 const events=[{type:'response.created',response:{...response,status:'in_progress',output:[]}},{type:'response.output_item.added',output_index:0,item:{...message,status:'in_progress',content:[]}},{type:'response.content_part.added',item_id:message.id,output_index:0,content_index:0,part:{type:'output_text',text:'',annotations:[]}},{type:'response.output_text.delta',item_id:message.id,output_index:0,content_index:0,delta:answer},{type:'response.output_text.done',item_id:message.id,output_index:0,content_index:0,text:answer},{type:'response.content_part.done',item_id:message.id,output_index:0,content_index:0,part:message.content[0]},{type:'response.output_item.done',output_index:0,item:message},{type:'response.completed',response}];
 return new Response(events.map((x,i)=>'event: '+x.type+'\ndata: '+JSON.stringify({...x,sequence_number:i})+'\n\n').join(''),{headers:{'Content-Type':'text/event-stream'}});
}});

answer='Hi! What would you like to work on?';
const config='check_for_update_on_startup=false\nmodel="fixture"\nmodel_provider="fixture"\napproval_policy="never"\n[features]\nhooks=false\n[tui]\nanimations=false\n[model_providers.fixture]\nname="Offline footer verification"\nbase_url="http://127.0.0.1:'+provider.port+'/v1"\nwire_api="responses"\nrequires_openai_auth=false\n[projects.'+JSON.stringify(project)+']\ntrust_level="trusted"\n';
writeFileSync(join(home,'config.toml'),config);
writeFileSync(join(bin,'codex-tsoyang'),'#!/bin/sh\nexport CODEX_HOME='+quote(home)+'\nexec '+quote('/home/christso/.local/bin/codex')+' --add-dir '+quote(vault)+' --no-alt-screen "$@"\n',{mode:0o755});
const {createServer}=await import(repo+'/server/index.ts');const {createServer:beforeServer}=await import(out+'/before/server/index.ts');
const current=createServer({port:0,hostname:'127.0.0.1',token:'',stateDir:join(root,'current'),registerBridge:false,tailscaleOwner:null});
const before=beforeServer({port:0,hostname:'127.0.0.1',token:'',stateDir:join(root,'before'),registerBridge:false,tailscaleOwner:null});
const origin='http://127.0.0.1:'+current.port;let owned:string|undefined;const results:any[]=[];
try{
 const request=fetch(origin+'/api/workspace/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cwd:project,label:'Fictional Tsoyang completion footer',agent:{kind:'codex',launcher:'codex-tsoyang'}})});
 const created=await(await request).json() as any;assert.equal(created.agent_started,true,JSON.stringify(created));owned=created.workspace_id;const pane=created.pane_id;
 await browser(['open',origin+'/?ws='+owned+'&pane='+encodeURIComponent(pane)+'&view=chat']);await browser(['set','viewport','1280','850']);
 await evaluate('localStorage.setItem("herdr-web-ui:settings",JSON.stringify({language:"en"}))');await browser(['reload']);
 await until(async()=>await evaluate('!!document.querySelector(".composer-greeting:not([aria-hidden=true])")'),'native greeting');
 await browser(['screenshot',join(out,'native-before-message.png')]);
 await browser(['fill','.composer-text','hi']);await browser(['click','.composer-send']);
 const screen=await until(async()=>{const t=(await paneRead({paneId:pane,source:'recent',lines:400,stripAnsi:true})).text;return t.includes(answer)&&/Worked for/.test(t)?t:null},'native completed-turn footer',60000);
 writeFileSync(join(out,'native-screen.txt'),screen);
 const info=await paneProcessInfo(pane);assert.equal(info.foreground_processes[0]?.cwd,project);
 const read=async(app:any)=>await(await fetch('http://127.0.0.1:'+app.port+'/api/pane/conversation?pane_id='+encodeURIComponent(pane))).json() as any;
 for(const [variant,app] of [['red',before],['green',current]] as const){
  const c=await until(async()=>{const c=await read(app);writeFileSync(join(out,variant+'-conversation.json'),JSON.stringify(c,null,2));return c.source===(variant==='red'?'scrollback':'codex-transcript')?c:null},variant+' source');
  const base='http://127.0.0.1:'+app.port;await browser(['open',base+'/?ws='+owned+'&pane='+encodeURIComponent(pane)+'&view=chat']);
  await evaluate('localStorage.setItem("herdr-web-ui:settings",JSON.stringify({language:"en"}))');await browser(['reload']);
  const view=await until(async()=>{const v=await evaluate('({unavailable:!!document.querySelector(".chat-terminal-fallback"),answer:document.body.innerText.includes('+JSON.stringify(answer)+'),userTurns:document.querySelectorAll(".chat-turn-user").length})');return variant==='red'?v.unavailable&&v:v.answer&&v},variant+' browser');
  assert.equal(view.unavailable,variant==='red');assert.equal(view.answer,variant==='green');
  await browser(['screenshot',join(out,variant+'-desktop.png')]);
  await browser(['set','viewport','390','844']);
  if(await evaluate('document.querySelector(".drawer-toggle")?.getAttribute("aria-expanded")==="true"'))await browser(['click','.drawer-toggle']);
  await until(async()=>await evaluate('!document.querySelector(".sidebar") || document.querySelector(".sidebar").getBoundingClientRect().right<=1'),'phone drawer closed');
  const phone=await evaluate('({unavailable:!!document.querySelector(".chat-terminal-fallback"),answer:document.body.innerText.includes('+JSON.stringify(answer)+')})');
  assert.equal(phone.unavailable,variant==='red');assert.equal(phone.answer,variant==='green');
  await browser(['screenshot',join(out,variant+'-phone.png')]);await browser(['set','viewport','1280','850']);
  results.push({variant,source:c.source,turns:c.turns.length,...view,phone});console.log(JSON.stringify(results.at(-1)));
 }
 writeFileSync(join(out,'native-screen.txt'),screen);writeFileSync(join(out,'native-report.json'),JSON.stringify({status:'passed',native_codex:'0.163.0',native_herdr:'0.9.5',footer_observed:true,results,local_canned_responses:requests,live_model_calls:0,user_panes_touched:0,temporary_codex_home:true},null,2)+'\n');
}finally{try{await browser(['close'])}catch{};current.stop();before.stop();provider.stop();if(owned)await workspaceClose(owned);}
