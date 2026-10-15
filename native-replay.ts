import {Database} from 'bun:sqlite';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const [beforeArg,afterArg,outArg]=process.argv.slice(2);
if(!beforeArg||!afterArg||!outArg)throw Error('Usage: bun native-replay.ts BEFORE_CHECKOUT AFTER_CHECKOUT OUTPUT_DIRECTORY');
const beforeCheckout=resolve(beforeArg),afterCheckout=resolve(afterArg),root=resolve(outArg);
mkdirSync(root,{recursive:true});
const fixture=join(root,'fixture');const codex=join(fixture,'codex');const cwd=join(fixture,'project');
mkdirSync(join(codex,'sessions'),{recursive:true});mkdirSync(cwd,{recursive:true});
process.env.HERDR_SOCKET=join(fixture,'herdr.sock');
const id='11111111-1111-4111-8111-111111111111';const rollout=join(codex,'sessions',`rollout-${id}.jsonl`);
writeFileSync(rollout,[{type:'session_meta',payload:{id,cwd}},{type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'hello'}]}},{type:'response_item',payload:{type:'message',role:'assistant',phase:'final_answer',content:[{type:'output_text',text:'Hello! What would you like to work on?'}]}}].map(x=>JSON.stringify(x)).join('\n')+'\n');
const db=new Database(join(codex,'state_5.sqlite'));db.exec('CREATE TABLE threads (id TEXT, rollout_path TEXT, cwd TEXT, archived INTEGER, agent_role TEXT, created_at INTEGER, updated_at INTEGER, source TEXT, first_user_message TEXT)');
const now=Math.ceil(Date.now()/1000)+2;db.query("INSERT INTO threads VALUES (?, ?, ?, 0, NULL, ?, ?, 'cli', 'hello')").run(id,rollout,cwd,now,now);db.close();
const store=join(fixture,'.omp/profiles/demo/agent/sessions/-project');mkdirSync(store,{recursive:true});const ompPath=join(store,'2026-10-15_example.jsonl');
writeFileSync(ompPath,[{type:'title',v:1,title:'Safe example'},{type:'session',version:3,id:'example',cwd},{type:'message',timestamp:'2026-10-15T00:00:00Z',message:{role:'user',content:[{type:'text',text:'Can you read this short test conversation?'}]}},{type:'message',timestamp:'2026-10-15T00:00:01Z',message:{role:'assistant',content:[{type:'text',text:'Yes. This is an isolated example with no private conversations, hostnames, or credentials.'}]}}].map(x=>JSON.stringify(x)).join('\n')+'\n');
const ompScript=join(fixture,'omp.js');writeFileSync(ompScript,`require('node:fs').openSync(${JSON.stringify(ompPath)},'a'); console.log('READY');setInterval(()=>{},1000);`);
const child=Bun.spawn([process.execPath,ompScript,'--profile','demo'],{stdout:'pipe',stderr:'ignore'});await child.stdout.getReader().read();
const screen='OpenAI Codex (v0.162.1)\n› hello\n• Hello! What would you like to work on?\n› Ask Codex to do anything';
const peerScreen='OpenAI Codex (v0.162.1)\n› A different task\n• A different reply.\n› Ask Codex to do anything';
let kind='codex';
const socket=Bun.listen<{buffer:string}>({unix:process.env.HERDR_SOCKET,socket:{open(s){s.data={buffer:''}},data(s,chunk){s.data.buffer+=chunk.toString();if(!s.data.buffer.includes('\n'))return;const r=JSON.parse(s.data.buffer);let result:any;
if(r.method==='agent.get')result={agent:{}};
else if(r.method==='pane.process_info')result={process_info:{foreground_processes:kind==='codex'?[{pid:process.pid,argv:['codex']}]:[{pid:child.pid,name:'omp'}]}};
else if(r.method==='pane.read')result={read:{text:r.params?.pane_id==='peer'?peerScreen:screen}};
else throw Error('Unexpected RPC '+r.method);
s.end(JSON.stringify({id:r.id,result})+'\n');}}});
const pane=(pane_id:string)=>({pane_id,workspace_id:'fixture',tab_id:'fixture:t1',terminal_id:pane_id,agent:'codex',agent_status:'idle',cwd,focused:false,revision:0});
try{
 const results:any={};
 for(const [label,checkout] of [['before',beforeCheckout],['after',afterCheckout]]){
  const {transcriptPage}=await import(join(checkout,'server/conversation.ts'));
  kind='codex';const {codexTranscriptPath}=await import(join(checkout,'server/codex.ts'));const codexPath=await codexTranscriptPath('fixture',cwd,codex,[pane('fixture'),pane('peer')]);
  kind='omp';const {ompHeldTranscript}=await import(join(checkout,'server/omp.ts'));const nativeOmp=await ompHeldTranscript('fixture',cwd,fixture);
  results[label]={codex:codexPath?transcriptPage('codex-transcript',codexPath,{},codex):{source:'scrollback',turns:[]},omp:nativeOmp?transcriptPage('omp-transcript',nativeOmp):{source:'scrollback',turns:[]}};
  console.log(JSON.stringify({label,codexResolved:codexPath===rollout,ompResolved:nativeOmp===ompPath,codexTurns:results[label].codex.turns.length,ompTurns:results[label].omp.turns.length}));
 }
 if(results.before.codex.turns.length||results.before.omp.turns.length||results.after.codex.turns.length!==2||results.after.omp.turns.length!==2)throw Error('Unexpected fixture outcome');
 writeFileSync(join(root,'native-results.json'),JSON.stringify(results,null,2)+'\n');
}finally{socket.stop(true);child.kill();await child.exited;}
