import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
const repo="/home/christso/projects/christso/herdr-web-ui";
await import(repo+"/scripts/test-herdr.ts");
const { workspaceCreate,workspaceClose,herdrRpc,sessionSnapshot }=await import(repo+"/server/herdr/client.ts");
assert(process.env.HERDR_TEST_DISPOSABLE_CONFIG && process.env.HERDR_SOCKET?.startsWith(process.env.HERDR_TEST_DISPOSABLE_CONFIG+"/herdr/"),"must use the check runner's isolated Herdr");
const root=mkdtempSync("/tmp/herdr-codex-cd-browser-");
const home=join(root,"codex");const project=join(root,"project");const shell=join(root,"shell");
for(const dir of [join(home,"sessions"),project,shell,join(root,"bin"),join(root,"browser-home")])mkdirSync(dir,{recursive:true});
const answer="This fictional Codex conversation belongs to the project selected at launch. The shell started elsewhere, and Chat should still find these saved messages without reading another pane's conversation.";
const id="01a0c7a1-56d9-7e20-9f08-f7a2d973bd55";const rollout=join(home,"sessions","rollout-"+id+".jsonl");
writeFileSync(rollout,[{type:"session_meta",payload:{id,cwd:project,source:"cli",thread_source:"user"}},{type:"event_msg",payload:{type:"user_message",message:"Check the fictional launch directory."}},{type:"event_msg",payload:{type:"agent_message",message:answer}}].map(x=>JSON.stringify(x)).join("\n")+"\n");
const db=new Database(join(home,"state_5.sqlite"));db.exec("CREATE TABLE threads(id TEXT,rollout_path TEXT,cwd TEXT,archived INTEGER,agent_role TEXT,created_at INTEGER,updated_at INTEGER,source TEXT)");db.query("INSERT INTO threads VALUES(?,?,?,0,NULL,1,1,'cli')").run(id,rollout,project);db.close();
const executable=join(root,"bin","codex");writeFileSync(executable,"#!/bin/sh\ncat \"$FIXTURE_SCREEN\"\nwhile IFS= read -r line; do :; done\n");chmodSync(executable,0o755);writeFileSync(join(root,"screen.txt"),"OpenAI Codex (v0.163.0)\n› Check the fictional launch directory.\n• "+answer+"\n› \n");
const created=await workspaceCreate({cwd:shell,label:"Fictional Codex launch directory"});const pane=created.root_pane.pane_id;
const env={...process.env,HOME:join(root,"browser-home"),AGENT_BROWSER_EXECUTABLE_PATH:"/usr/bin/google-chrome"};
let session="cd-"+process.pid;
async function browser(args:string[],input?:string){console.log("browser",args[0]);const p=Bun.spawn(["/usr/local/bin/agent-browser","--session",session,"--args","--no-sandbox",...args],{env,stdin:input===undefined?"ignore":new Blob([input]),stdout:"pipe",stderr:"pipe"});const text=await new Response(p.stdout).text();const error=await new Response(p.stderr).text();assert.equal(await p.exited,0,error);return text;}
async function evaluate(code:string){let value=JSON.parse(await browser(["eval","--stdin"],"(async()=>JSON.stringify(await ("+code+")))()"));return typeof value==="string"?JSON.parse(value):value;}
const results=[];let server:any;
try{
 await herdrRpc("pane.send_text",{pane_id:pane,text:`FIXTURE_SCREEN=${join(root,"screen.txt")} ${executable} --cd ${project}\n`});
 for(let i=0;i<100;i++){if((await sessionSnapshot()).panes.find(p=>p.pane_id===pane)?.agent==="codex")break;await Bun.sleep(100);}
 assert.equal((await sessionSnapshot()).panes.find(p=>p.pane_id===pane)?.agent,"codex");
 for(const [name,source] of [["red","/tmp/herdr-codex-launch-directory/before"],["green",repo]]){
  session="cd-"+process.pid+"-"+name;
  const {createServer}=await import(source+"/server/index.ts");
  server=createServer({port:0,hostname:"127.0.0.1",token:"",codexHome:home,stateDir:join(root,name),tailscaleOwner:null});
  const origin=`http://127.0.0.1:${server.port}`;
  await browser(["open",origin+"/?pane="+encodeURIComponent(pane)+"&view=chat"]);
  await browser(["set","viewport","1280","850"]);
  await evaluate('localStorage.setItem("herdr-web-ui:settings",JSON.stringify({language:"en"}))');
  await browser(["reload"]);
  let view:any;
  for(let i=0;i<50;i++){
   view=await evaluate('({unavailable:!!document.querySelector(".chat-terminal-fallback"),answer:document.body.innerText.includes('+JSON.stringify(answer)+')})');
   if(name==="green"?view.answer:documentTextUnavailable(view))break;
   await Bun.sleep(100);
  }
  const conversation=await(await fetch(origin+"/api/pane/conversation?pane_id="+encodeURIComponent(pane))).json() as any;
  assert.equal(conversation.source,name==="green"?"codex-transcript":"scrollback");
  if(name==="green")assert.equal(view.answer,true);
  else assert.equal(view.answer,false);
  await browser(["screenshot","/tmp/herdr-codex-launch-directory/"+name+".png"]);
  results.push({variant:name,source:conversation.source,turns:conversation.turns.length,...view});
  await browser(["close"]);server.stop();server=undefined;
 }
 writeFileSync("/tmp/herdr-codex-launch-directory/browser-report.json",JSON.stringify({status:"passed",results,model_calls:0,user_panes_touched:0},null,2)+"\n");
 console.log(JSON.stringify(results));
}finally{try{await browser(["close"])}catch{};server?.stop();await workspaceClose(created.workspace.workspace_id);}
function documentTextUnavailable(view:any){return view.unavailable;}
