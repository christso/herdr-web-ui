UPSTREAM='/**\n * omp sessions from the pane\'s own omp process. herdr\'s agent.get names omp\'s session file for\n * most panes, but loses some: no session at all, or a Claude session id where omp runs (seen\n * 2026-10-07 on herdr 0.9.3, for omp processes that had been running for days). omp keeps its\n * store the way GJC does, so the process\'s open transcript or terminal breadcrumb names it then.\n */\nimport { join } from "node:path";\n\nimport { paneProcessInfo } from "./herdr/client.ts";\nimport { heldTranscript, runsAgent } from "./gjc-runtime.ts";\nimport { processEnviron } from "./omo.ts";\n\nconst OMP_EXECUTABLE = /(^|[\\\\/])omp(?:\\.exe|\\.[cm]?js)?$/i;\n\nexport function isOmpProcess(argv: readonly string[]): boolean {\n  return runsAgent(argv, OMP_EXECUTABLE);\n}\n\n/**\n * The agent directory one omp process keeps its sessions and terminal breadcrumbs in:\n * ~/.omp/agent, or ~/.omp/profiles/<name>/agent under `--profile <name>` or OMP_PROFILE (the flag\n * wins). null when `--session-dir` moved its sessions anywhere at all, or the profile name could\n * leave ~/.omp/profiles.\n */\nexport function ompAgentDir(argv: readonly string[], environ: readonly string[] | null, home: string): string | null {\n  let profile = environ?.find((word) => word.startsWith("OMP_PROFILE="))?.slice(12) || null;\n  for (let at = 1; at < argv.length; at++) {\n    const word = argv[at]!;\n    if (word === "--session-dir" || word.startsWith("--session-dir=")) return null;\n    if (word === "--profile") profile = argv[at + 1] ?? "";\n    else if (word.startsWith("--profile=")) profile = word.slice(10);\n  }\n  if (profile === null) return join(home, ".omp", "agent");\n  return /^[\\w.-]+$/.test(profile) && profile !== "." && profile !== ".." ? join(home, ".omp", "profiles", profile, "agent") : null;\n}\n\n/** The transcript the pane\'s omp process holds open or last pointed its terminal breadcrumb at, or null. */\nexport async function ompHeldTranscript(paneId: string, cwd: string, home = process.env["HOME"] ?? ""): Promise<string | null> {\n  const info = await paneProcessInfo(paneId).catch(() => null);\n  let agentDir: string | null = null;\n  const pids: number[] = [];\n  for (const process of info?.foreground_processes ?? []) {\n    const argv = Array.isArray(process.argv) ? process.argv.map(String) : [];\n    if (typeof process.pid !== "number" || !isOmpProcess(argv)) continue;\n    const dir = ompAgentDir(argv, processEnviron(process.pid), home);\n    // a moved store, or two omp processes keeping different ones: nothing says which the pane shows\n    if (dir === null || agentDir !== null && dir !== agentDir) return null;\n    agentDir = dir;\n    pids.push(process.pid);\n  }\n  return agentDir === null ? null : heldTranscript(agentDir, cwd, pids).path;\n}\n'
FIXTURE=[{'type': 'title', 'v': 1, 'title': '', 'updatedAt': '2026-10-16T07:38:41.941Z', 'pad': '                                                                                                                                                                              '}, {'type': 'session', 'version': 3, 'id': '01a143a6-1b95-7127-a58b-916e73fc1211', 'timestamp': '2026-10-16T07:38:41.941Z', 'cwd': '/tmp/herdr-omp-launch-result-LJEdmd/fictional-project'}, {'type': 'model_change', 'id': 'c8805858', 'parentId': None, 'timestamp': '2026-10-16T07:38:42.060Z', 'runtime': {'version': '18.11.1'}, 'model': 'launch-fixture/offline', 'resolvedModelIsFallback': False}, {'type': 'thinking_level_change', 'id': 'e8314700', 'parentId': 'c8805858', 'timestamp': '2026-10-16T07:38:42.060Z', 'runtime': {'version': '18.11.1'}, 'thinkingLevel': None, 'configured': None}, {'type': 'message', 'id': '39d7a981', 'parentId': 'e8314700', 'timestamp': '2026-10-16T07:38:45.809Z', 'runtime': {'version': '18.11.1'}, 'message': {'role': 'user', 'content': [{'type': 'text', 'text': 'Reply with the offline fixture answer.'}], 'attribution': 'user', 'timestamp': 1792136325735}}, {'type': 'message', 'id': '286ff47b', 'parentId': 'c6087667', 'timestamp': '2026-10-16T07:38:45.826Z', 'runtime': {'version': '18.11.1'}, 'message': {'role': 'assistant', 'content': [{'type': 'text', 'text': 'This is a fictional offline answer for launch verification.'}], 'api': 'launch-fixture', 'provider': 'launch-fixture', 'model': 'offline', 'usage': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0, 'totalTokens': 0, 'cost': {'input': 0, 'output': 0, 'cacheRead': 0, 'cacheWrite': 0, 'total': 0}}, 'stopReason': 'stop', 'timestamp': 1792136325816, 'completedAt': 1792136325825, 'contextSnapshot': {'promptTokens': 0, 'nonMessageTokens': 7112, 'toolSchemaTokens': 4158, 'compactionEpoch': 0}}}]
import pathlib,os,json,tempfile,subprocess,shutil,socket,time,uuid,shlex
root=pathlib.Path(tempfile.mkdtemp(prefix='herdr-1153-native-wsl-'));home=root/'home';home.mkdir();cwd=root/'fictional-project';cwd.mkdir();config=root/'config';config.mkdir();bin=root/'bin';bin.mkdir();zdot=root/'zsh';zdot.mkdir();(zdot/'.zshrc').write_text('')
actualhome=pathlib.Path.home();runtime=pathlib.Path(os.environ.get('HERDR_REPRO_RUNTIME',str(actualhome/'.local/share/herdr-web-ui/remote-v29-christso-3b6d381')));app=root/'app';app.mkdir()
for name in ['server','shared']:shutil.copytree(runtime/name,app/name)
os.symlink(runtime/'node_modules',app/'node_modules');shutil.copy(runtime/'package.json',app/'package.json')
(app/'server/omp-upstream-1153.ts').write_text(UPSTREAM)
herdr=os.environ.get('HERDR_REPRO_BIN',str(actualhome/'.local/bin/herdr'));bun=os.environ.get('BUN_REPRO_BIN',str(actualhome/'.bun/bin/bun'));omp=os.environ.get('OMP_REPRO_BIN',str(actualhome/'.bun/bin/omp'));session='1153-repro-'+str(os.getpid());sock=config/'herdr/sessions'/session/'herdr.sock'
provider=root/'provider.mjs';provider.write_text("export default function(pi){pi.registerProvider('launch-fixture',{baseUrl:'https://fixture.invalid/',apiKey:'fictional-unused',api:'launch-fixture',models:[{id:'offline',name:'Offline fixture',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:8192,maxTokens:1024}],streamSimple(){throw new Error('No model calls allowed in this resume-only check')}})}")
(bin/'omp').write_text('#!/bin/sh\nexec '+ ' '.join(map(shlex.quote,[omp,'--no-rules','--no-skills','--no-extensions','--no-title','--extension',str(provider),'--model','launch-fixture/offline']))+' "$@"\n');(bin/'omp').chmod(0o755)
env={k:v for k,v in os.environ.items() if not k.startswith(('HERDR','PI_','OMP_','CODEX_','CLAUDE_'))}
env.update(HOME=str(home),XDG_CONFIG_HOME=str(config),XDG_DATA_HOME=str(root/'data'),XDG_CACHE_HOME=str(root/'cache'),PATH=str(bin)+':'+str(actualhome/'.bun/bin')+':'+str(actualhome/'.local/bin')+':/usr/bin:/bin',ZDOTDIR=str(zdot),SHELL='/bin/zsh',TERM='xterm-256color',OMP_SKIP_SETUP='1')
log=open(root/'herdr.log','w');server=subprocess.Popen([herdr,'--session',session,'server'],env=env,stdout=log,stderr=log)
def rpc(method,params):
 with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
  s.settimeout(10);s.connect(str(sock));s.sendall((json.dumps({'id':'isolated-native-repro','method':method,'params':params})+'\n').encode());data=b''
  while b'\n' not in data:data+=s.recv(1048576)
 r=json.loads(data.split(b'\n')[0]);return r.get('result',{})
report={'root':str(root),'kernel':os.uname().release,'metadata_injected':False,'model_calls':0,'resume_only':True,'cases':[]}
try:
 for _ in range(150):
  if sock.exists():break
  time.sleep(.1)
 report['herdr']=rpc('ping',{})
 report['omp_version']=subprocess.check_output([omp,'--version'],env=env,text=True,timeout=15).strip()
 subprocess.run(['git','init','-q',str(cwd)],env=env,check=True)
 env['HERDR_SOCKET']=str(sock)
 for index,profile in enumerate([None,'personal',None]):
  agentdir=home/'.omp'/('agent' if profile is None else 'profiles/'+profile+'/agent');store=agentdir/'sessions'/('-'+str(cwd).strip('/').replace('/','-'));store.mkdir(parents=True,exist_ok=True)
  transcript=store/(str(uuid.uuid4())+'.jsonl');rows=json.loads(json.dumps(FIXTURE))
  for row in rows:
   if row.get('type')=='session':row['cwd']=str(cwd);row['id']=str(uuid.uuid4())
  transcript.write_text('\n'.join(json.dumps(row) for row in rows)+'\n')
  w=rpc('workspace.create',{'cwd':str(cwd),'label':'Fictional WSL reproduction '+str(index+1),'focus':False});pane=w['root_pane']['pane_id']
  command='omp '+('--profile '+shlex.quote(profile)+' ' if profile else '')+'--session '+shlex.quote(str(transcript))
  subprocess.run([herdr,'--session',session,'pane','run',pane,command],env=env,check=True,capture_output=True,timeout=15)
  for _ in range(400):
   agent=rpc('agent.get',{'target':pane}).get('agent',{})
   if agent.get('agent')=='omp' and agent.get('agent_status') in ['idle','done']:break
   time.sleep(.1)
  else:raise RuntimeError('OMP did not become ready: '+str(agent))
  info=rpc('pane.process_info',{'pane_id':pane}).get('process_info',{});processes=info.get('foreground_processes',[])
  helper=root/('resolve-'+str(index)+'.ts');helper.write_text('import {ompHeldTranscript as old} from '+json.dumps(str(app/'server/omp-upstream-1153.ts'))+';import {ompHeldTranscript as fixed} from '+json.dumps(str(app/'server/omp.ts'))+';const a=await old('+json.dumps(pane)+','+json.dumps(str(cwd))+');const b=await fixed('+json.dumps(pane)+','+json.dumps(str(cwd))+');console.log(JSON.stringify({upstream_found:a!==null,fixed_found:b==='+json.dumps(str(transcript))+'}));')
  result=json.loads(subprocess.check_output([bun,str(helper)],env=env,text=True,timeout=20))
  case={'profile':profile or 'default','native_agent':agent.get('agent'),'native_status':agent.get('agent_status'),'native_session_reported':bool(agent.get('agent_session')),'processes':[{'name':p.get('name'),'reported_argc':len(p.get('argv') or []),'fields':sorted(p)} for p in processes],**result}
  report['cases'].append(case);print(json.dumps(case),flush=True)
  assert not case['native_session_reported'] and any(p['name']=='omp' and p['reported_argc']==0 for p in case['processes']) and not result['upstream_found'] and result['fixed_found']
  rpc('workspace.close',{'workspace_id':w['workspace']['workspace_id']})
 report['status']='passed'
except Exception as error:report['status']='failed';report['error']=str(error)
finally:
 subprocess.run([herdr,'--session',session,'server','stop'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
 try:server.wait(timeout=10)
 except subprocess.TimeoutExpired:report['cleanup']='named server did not exit after stop'
 (root/'report.json').write_text(json.dumps(report,indent=2)+'\n');print('REPORT '+str(root/'report.json'),flush=True)
if report['status']!='passed':raise SystemExit(1)
