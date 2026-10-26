import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadBundle } from './environment.mjs';
import { parserRuntime, layoutDecoder } from './runtime.mjs';

const bridgeFile=fileURLToPath(new URL('../web/bridge.js',import.meta.url));
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function startViewer({file,port=4173,version='0.4.0',theme='dark',links='dependencies',watch=true}={}) {
  if(!file)throw new Error('A DBML file is required');
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Port must be an integer from 0 to 65535');
  if(!['dark','light'].includes(theme))throw new Error('Theme must be dark or light');
  if(!['dependencies','relationships','all'].includes(links))throw new Error('Links must be dependencies, relationships, or all');
  file=path.resolve(file);fs.accessSync(file,fs.constants.R_OK);
  const bundle=loadBundle(version),runtime=parserRuntime(version),webRoot=path.join(bundle.root,'dist/assets/dbrenderer-webview');
  const modes={dependencies:'Dependency',relationships:'Relationship',all:'All'};
  const stateFile=file.replace(/\.dbml$/i,'')+'.dbdiagram';
  let layout;
  if(fs.existsSync(stateFile))layout=layoutDecoder(version)(fs.readFileSync(stateFile,'utf8'));
  layout??={version:'3.0.0',darkMode:theme==='dark',gridEnabling:false,currentViewName:null,defaultView:{detailLevel:'All',relationshipMode:modes[links],tablePositions:[],tableGroupCollapseStates:[],stickyNoteLayouts:[],referencePaths:[]},views:{}};
  layout.darkMode=theme==='dark';layout.defaultView.relationshipMode=modes[links];
  const fileId=crypto.createHash('sha256').update(file).digest('hex').slice(0,20);
  // Capabilities of this read-only local host, independent of account services.
  const features={darkMode:true,colorHeader:true,colorPicker:false,dragAndDrop:true,tableGroup:true,detailLevelsEnabled:true,stickyNote:true,tableSearch:true,diagramView:true,diagramViewDropdown:true,diagramViewRestricted:false,tableRename:false,dbmlEditEnabled:false,relationshipModeEnabled:true};
  let snapshot,revision=0,timer,watcher;const clients=new Set();
  function refresh(){
    let source='',database={},diagramViews=[],errors=[];
    try {source=fs.readFileSync(file,'utf8');({database,diagramViews}=runtime.compile(source));}
    catch(error){errors=(error.diags??[{message:error.message,location:{start:{line:1,column:1},end:{line:1,column:1}}}]).map(e=>({message:e.message??e.diagnostic??String(e),startLine:e.location?.start?.line??1,startColumn:e.location?.start?.column??1,endLine:e.location?.end?.line??1,endColumn:e.location?.end?.column??1}));}
    snapshot={revision:++revision,fileId,filename:path.basename(file),rendererVersion:version,theme,links,state:layout,features,update:{type:'update',database,diagramViews:diagramViews??[],errors,dbmlSource:source}};
    for(const client of clients)client.write('data: '+JSON.stringify(snapshot)+'\n\n');
    return snapshot;
  }
  refresh();
  const mime={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};
  function send(res,status,body,type='text/plain; charset=utf-8'){res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);}
  const server=http.createServer((req,res)=>{
    try{
      const host=req.headers.host??'';
      if(!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host))return send(res,403,'Localhost requests only');
      if(req.method!=='GET'&&req.method!=='HEAD')return send(res,405,'Read-only viewer');
      const url=new URL(req.url,'http://127.0.0.1');
      if(url.pathname==='/api/model')return send(res,200,JSON.stringify(snapshot),'application/json; charset=utf-8');
      if(url.pathname==='/api/events'){
        res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.write('data: '+JSON.stringify(snapshot)+'\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;
      }
      if(url.pathname==='/health')return send(res,200,JSON.stringify({ok:true,revision,tables:Object.keys(snapshot.update.database.tables??{}).length,errors:snapshot.update.errors.length}),'application/json');
      if(url.pathname==='/bridge.js')return send(res,200,fs.readFileSync(bridgeFile),'text/javascript; charset=utf-8');
      if(url.pathname==='/'){
        let html=fs.readFileSync(path.join(webRoot,'index.html'),'utf8');
        html=html.replace('<title>Vite App</title>','<title>'+escape(path.basename(file))+' · DBML local viewer</title>');
        html=html.replace('<head>','<head><script src="/bridge.js"></script><style>html,body,#app{height:100%;margin:0}body{padding-top:38px;box-sizing:border-box;background:#111827}#local-bar{position:fixed;inset:0 0 auto;height:38px;z-index:9999;display:flex;align-items:center;gap:18px;padding:0 16px;background:#101827;color:#dbeafe;font:12px system-ui;border-bottom:1px solid #334155}#local-status{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#local-bar a{color:#93c5fd;margin-left:auto}</style>');
        html=html.replace('<body>','<body><div id="local-bar"><strong>DBML LOCAL</strong><span id="local-status">Loading renderer…</span><a href="/api/model" target="_blank" rel="noopener">Model JSON</a></div>');
        return send(res,200,html,'text/html; charset=utf-8');
      }
      if(url.pathname.startsWith('/assets/')||url.pathname==='/favicon.ico'){
        const asset=path.resolve(webRoot,'.'+decodeURIComponent(url.pathname));
        if(!asset.startsWith(webRoot+path.sep)||!fs.existsSync(asset)||!fs.statSync(asset).isFile())return send(res,404,'Asset not found');
        if(!fs.realpathSync(asset).startsWith(fs.realpathSync(webRoot)+path.sep))return send(res,403,'Invalid asset path');
        return send(res,200,fs.readFileSync(asset),mime[path.extname(asset)]??'application/octet-stream');
      }
      return send(res,404,'Not found');
    }catch(error){return send(res,500,error.message);}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  if(watch)watcher=fs.watch(path.dirname(file),(_event,name)=>{if(name?.toString()===path.basename(file)){clearTimeout(timer);timer=setTimeout(refresh,150);}});
  const heartbeat=setInterval(()=>{for(const client of clients)client.write(': heartbeat\n\n');},15000);heartbeat.unref();
  return {server,url:`http://127.0.0.1:${server.address().port}`,refresh,getSnapshot:()=>snapshot,
    async close(){clearInterval(heartbeat);clearTimeout(timer);watcher?.close();for(const client of clients)client.end();clients.clear();await new Promise(resolve=>server.close(resolve));}};
}
