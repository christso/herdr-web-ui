from pathlib import Path
import os,json,sys,shutil,socket,time,subprocess,tempfile,shlex,tarfile,hashlib,uuid
bundle=Path(sys.argv[1])
root=Path(tempfile.mkdtemp(prefix='herdr-1157-review-',dir=str(Path.home()/'.cache')))
app=root/'app';app.mkdir()
files=json.loads((bundle/'files.json').read_text())
with tarfile.open(bundle/'runtime.tar.gz') as t:
 for m in t.getmembers():
  assert m.isfile() and m.name in files and not Path(m.name).is_absolute() and '..' not in Path(m.name).parts
  b=t.extractfile(m).read();assert hashlib.sha256(b).hexdigest()==files[m.name]
  p=app/m.name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
runtime=Path.home()/'.local/share/herdr-web-ui/remote-v30'
(app/'node_modules').symlink_to(runtime/'node_modules',target_is_directory=True)
fixed=(app/'server/omp.ts').read_bytes();baseline=(bundle/'omp-baseline.ts').read_bytes()
actualhome=Path.home();native=actualhome/'.config/herdr/herdr.sock';native_inode=native.stat().st_ino
home=root/'home';home.mkdir();cwd=root/'fictional-project';cwd.mkdir();config=root/'config';config.mkdir();bin_dir=root/'bin';bin_dir.mkdir();zdot=root/'zsh';zdot.mkdir();(zdot/'.zshrc').write_text('')
herdr=str(actualhome/'.local/bin/herdr');bun=str(actualhome/'.bun/bin/bun');omp=str(actualhome/'.bun/bin/omp')
session='1157-review-'+str(os.getpid());sock=config/'herdr/sessions'/session/'herdr.sock'
provider=root/'provider.mjs';provider.write_text("export default function(pi){pi.registerProvider('launch-fixture',{baseUrl:'https://fixture.invalid/',apiKey:'fictional-unused',api:'launch-fixture',models:[{id:'offline',name:'Offline fixture',reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:8192,maxTokens:1024}],streamSimple(){throw new Error('No model calls allowed in this resume-only check')}})}")
(bin_dir/'omp').write_text('#!/bin/sh\nexec '+' '.join(map(shlex.quote,[omp,'--no-rules','--no-skills','--no-extensions','--no-title','--extension',str(provider),'--model','launch-fixture/offline']))+' "$@"\n');(bin_dir/'omp').chmod(0o755)
env={'HOME':str(home),'USER':os.environ.get('USER','christso'),'LANG':'C.UTF-8','XDG_CONFIG_HOME':str(config),'XDG_DATA_HOME':str(root/'data'),'XDG_CACHE_HOME':str(root/'cache'),'PATH':str(bin_dir)+':'+str(actualhome/'.bun/bin')+':'+str(actualhome/'.local/bin')+':/usr/bin:/bin','ZDOTDIR':str(zdot),'SHELL':'/bin/zsh','TERM':'xterm-256color','OMP_SKIP_SETUP':'1'}
log=open(root/'herdr.log','w');server=subprocess.Popen([herdr,'--session',session,'server'],env=env,stdout=log,stderr=log)
web=None;report={'pr_head':'53051d4b13fea09798de4fb91cc1d920ed647aa1','baseline_omp_sha256':hashlib.sha256(baseline).hexdigest(),'fixed_omp_sha256':hashlib.sha256(fixed).hexdigest(),'kernel':os.uname().release,'metadata_injected':False,'model_calls':0,'resume_only':True}
def rpc(method,params):
 with socket.socket(socket.AF_UNIX,socket.SOCK_STREAM) as s:
  s.settimeout(15);s.connect(str(sock));s.sendall((json.dumps({'id':'isolated-review','method':method,'params':params})+'\n').encode());data=b''
  while b'\n' not in data:
   chunk=s.recv(1048576)
   if not chunk:raise RuntimeError('Incomplete Herdr response')
   data+=chunk
 r=json.loads(data.split(b'\n')[0])
 if r.get('error'):raise RuntimeError(str(r['error']))
 return r.get('result',{})
def start_web(variant,port):
 global web
 (app/'server/omp.ts').write_bytes(baseline if variant=='red' else fixed)
 ready=root/('ready-'+variant+'.json');host=root/('web-'+variant+'.ts')
 host.write_text('import {writeFileSync} from "node:fs";import{createServer}from '+json.dumps((app/'server/index.ts').as_uri())+';const app=createServer({port:'+str(port)+',hostname:"127.0.0.1",token:"",stateDir:'+json.dumps(str(root/('web-'+variant)))+',registerBridge:false});await app.statusReady;writeFileSync('+json.dumps(str(ready))+',JSON.stringify({port:app.port}));process.on("SIGTERM",()=>{app.stop();process.exit(0)});')
 web_log=open(root/('web-'+variant+'.log'),'w')
 web=subprocess.Popen([bun,str(host)],env=env,cwd=app,stdout=web_log,stderr=web_log)
 for _ in range(300):
  if ready.exists():return json.loads(ready.read_text())['port']
  if web.poll() is not None:raise RuntimeError('Fixture web server failed: '+(root/('web-'+variant+'.log')).read_text()[-1400:])
  time.sleep(.1)
 raise RuntimeError('Fixture web server readiness timeout')
def stop_web():
 if web and web.poll() is None:web.terminate();web.wait(timeout=15)
try:
 for _ in range(150):
  if sock.exists():break
  time.sleep(.1)
 report['herdr']=rpc('ping',{});report['omp_version']=subprocess.check_output([omp,'--version'],env=env,text=True,timeout=15).strip()
 subprocess.run(['git','init','-q',str(cwd)],env=env,check=True);env['HERDR_SOCKET']=str(sock)
 store=home/'.omp/agent/sessions'/('-'+str(cwd).strip('/').replace('/','-'));store.mkdir(parents=True)
 transcript=store/(str(uuid.uuid4())+'.jsonl');rows=json.loads((bundle/'fixture.json').read_text())
 for row in rows:
  if row.get('type')=='session':row['cwd']=str(cwd);row['id']=str(uuid.uuid4())
 transcript.write_text('\n'.join(json.dumps(r) for r in rows)+'\n')
 w=rpc('workspace.create',{'cwd':str(cwd),'label':'Fictional OMP saved conversation','focus':False});pane=w['root_pane']['pane_id']
 subprocess.run([herdr,'--session',session,'pane','run',pane,'omp --session '+shlex.quote(str(transcript))],env=env,check=True,capture_output=True,timeout=15)
 for _ in range(400):
  try:agent=rpc('agent.get',{'target':pane}).get('agent',{})
  except RuntimeError as e:
   if 'agent_not_found' not in str(e):raise
   time.sleep(.1);continue
  if agent.get('agent')=='omp' and agent.get('agent_status') in ['idle','done']:break
  time.sleep(.1)
 else:raise RuntimeError('OMP not ready: '+str(agent))
 info=rpc('pane.process_info',{'pane_id':pane}).get('process_info',{});processes=info.get('foreground_processes',[])
 assert not agent.get('agent_session') and any(p.get('name')=='omp' and not p.get('argv') for p in processes)
 report['native_session_reported']=False;report['processes']=[{'name':p.get('name'),'reported_argc':len(p.get('argv') or [])} for p in processes]
 port=start_web('red',0)
 print(json.dumps({'event':'ready','variant':'red','port':port,'pane':pane,'report':report}),flush=True)
 for line in sys.stdin:
  command=line.strip()
  if command=='green':
   stop_web();assert start_web('green',port)==port;print(json.dumps({'event':'ready','variant':'green','port':port,'pane':pane}),flush=True)
  elif command=='stop':break
 report['status']='passed'
except Exception as e:
 report['status']='failed';report['error']=str(e);print(json.dumps({'event':'error','error':str(e)}),flush=True)
finally:
 stop_web()
 subprocess.run([herdr,'--session',session,'server','stop'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15)
 server.wait(timeout=15)
 report['native_user_socket_preserved']=native.stat().st_ino==native_inode;assert report['native_user_socket_preserved']
 (root/'report.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({'event':'finished','report':report}),flush=True)

