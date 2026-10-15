import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
const [beforeArg,afterArg,outArg]=process.argv.slice(2);
if(!beforeArg||!afterArg||!outArg)throw Error('Usage: bun screenshots.ts BEFORE_CHECKOUT AFTER_CHECKOUT OUTPUT_DIRECTORY');
const beforeCheckout=resolve(beforeArg),afterCheckout=resolve(afterArg),root=resolve(outArg);
const {chromium}=await import(join(afterCheckout,'node_modules/playwright-core/index.mjs'));
const results=JSON.parse(readFileSync(join(root,'native-results.json'),'utf8'));
const target='w1C:p1';
for(const [phase,checkout] of [['before',beforeCheckout],['after',afterCheckout]]){
 const dest=join(root,phase);mkdirSync(dest,{recursive:true});
 const {buildDemoApp}=await import(join(checkout,'scripts/demo-build.ts'));await buildDemoApp(dest);
 const index=join(dest,'index.html');writeFileSync(index,readFileSync(index,'utf8').replace(/<script type="module"/,'<script src="./demo-transport.js"></script><script src="./evidence-fixture.js"></script><script type="module"'));
 const patch=`(()=>{
 const scenario=new URLSearchParams(location.search).get('case');
 const originalFetch=window.fetch.bind(window),OriginalEventSource=window.EventSource;
 const native=${JSON.stringify(results[phase])};
 const sidebarConversation=${JSON.stringify(results.after.codex)};
 const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
 function snapshot(original){const s=structuredClone(original);const p=s.panes.find(p=>p.pane_id===${JSON.stringify(target)});const w=s.workspaces.find(w=>w.workspace_id===p.workspace_id);p.agent=scenario==='omp'?'omp':'codex';p.agent_status='idle';p.label=scenario==='omp'?'OMP example':scenario==='codex'?'Short greeting':'Detached checkout';p.cwd=p.foreground_cwd='/tmp/herdr-example/project';delete p.agent_session;w.label=p.label;w.number=1;w.active_tab_id=p.tab_id;w.tab_count=1;w.pane_count=1;s.workspaces=[w];s.panes=[p];s.tabs=s.tabs.filter(t=>t.tab_id===p.tab_id);if(scenario==='sidebar')w.worktree={repo_key:'example',repo_name:'example',repo_root:'/tmp/herdr-example',checkout_path:'/tmp/herdr-example/project',is_linked_worktree:true};else delete w.worktree;return s;}
 function machines(original){const m=structuredClone(original.find(x=>x.id==='local'));m.name='Isolated test fixture';m.snapshot=snapshot(m.snapshot);m.state='connected';return [m];}
 window.EventSource=class extends EventTarget{constructor(url,options){super();this.inner=new OriginalEventSource(url,options);this.readyState=1;this.inner.onmessage=e=>{const v=JSON.parse(e.data);if(v.type==='machines')v.machines=machines(v.machines);this.onmessage?.(new MessageEvent('message',{data:JSON.stringify(v)}));};this.inner.onerror=e=>this.onerror?.(e);this.inner.onopen=e=>this.onopen?.(e);}close(){this.inner.close();this.readyState=2;}};
 window.fetch=async(input,init)=>{const u=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);const path=u.pathname.replace(/^\\/api\\/machines\\/local\\//,'/api/');
 if(path==='/api/machines'){const r=await(await originalFetch(input,init)).json();return json({machines:machines(r.machines)});}
 if(path==='/api/session'){const r=await(await originalFetch(input,init)).json();return json({snapshot:snapshot(r.snapshot)});}
 if(path==='/api/pane/conversation')return json(scenario==='sidebar'?sidebarConversation:native[scenario]);
 if(path==='/api/worktree/list'&&scenario==='sidebar')return json({source:{repo_key:'example',repo_root:'/tmp/herdr-example'},worktrees:[{path:'/tmp/herdr-example/project',label:'Detached checkout',is_detached:true,is_bare:false,is_prunable:false,is_linked_worktree:true,open_workspace_id:u.searchParams.get('workspace_id')}]});
 return originalFetch(input,init);};
 })();`;
 writeFileSync(join(dest,'evidence-fixture.js'),patch);
}
const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(request){const url=new URL(request.url);const phase=url.pathname.split('/')[1];if(!['before','after'].includes(phase))return new Response('not found',{status:404});let file=decodeURIComponent(url.pathname.slice(phase.length+2));if(!file||file.endsWith('/'))file+='index.html';if(file.split('/').includes('..')||file.includes('\\'))return new Response('bad path',{status:400});const body=Bun.file(join(root,phase,file));return await body.exists()?new Response(body):new Response('not found',{status:404});}});
const screenshots=join(root,'screenshots');mkdirSync(screenshots,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{
 for(const phase of ['before','after'])for(const scenario of ['codex','omp','sidebar']){
  const context=await browser.newContext({viewport:{width:1200,height:760},locale:'en-US'});await context.addInitScript(()=>localStorage.setItem('herdr-web-ui:settings',JSON.stringify({language:'en',theme:'dark',palette:'amber',alertsOn:false})));
  const page=await context.newPage();const caught:string[]=[];page.on('console',m=>{if(m.type()==='error'&&m.text().includes('render failed'))caught.push(m.text().slice(0,180));});
  await page.goto(`http://127.0.0.1:${server.port}/${phase}/?case=${scenario}&pane=${encodeURIComponent(target)}&view=chat`);
  if(scenario==='sidebar'){
   if(phase==='before')await page.getByText("The sidebar can't be shown.",{exact:true}).waitFor();
   else await page.locator('.workspace-select[title*="Detached HEAD"]').first().waitFor({state:'attached'});
  }else if(phase==='before')await page.getByText('Conversation unavailable — show terminal output',{exact:true}).waitFor();
  else await page.locator('.chat-turn').first().waitFor();
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'});await page.evaluate(()=>document.fonts.ready);
  const path=join(screenshots,`${scenario}-${phase}.png`);await page.screenshot({path});
  console.log(JSON.stringify({phase,scenario,chatTurns:await page.locator('.chat-turn').count(),sidebarRows:await page.locator('.workspace-group').count(),caughtRenderErrors:caught.length,path}));
  await context.close();
 }
}finally{await browser.close();server.stop();}
