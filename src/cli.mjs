#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAnalysis, staticAnalysis } from './analyze.mjs';
import { parseModel, layoutDecoder } from './runtime.mjs';
import { graphFromDatabase, trace, graphDot } from './graph.mjs';
import { loadBundle } from './environment.mjs';
import { catalog, symbolSource } from './catalog.mjs';
import { pretty } from './extract.mjs';
import { renderSvg } from './render.mjs';
import { startViewer } from './server.mjs';
import { startStudio } from './studio-server.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [command,...args]=process.argv.slice(2);
const output=value=>console.log(JSON.stringify(value,null,2));
try {
  if(command==='studio'){
    const options={},directories=[];
    for(let i=0;i<args.length;i++){
      if(args[i]==='--dev'){options.dev=true;continue;}
      if(args[i].startsWith('--')){const key=args[i].slice(2);if(!['port','theme','version'].includes(key)||!args[i+1])throw new Error('Invalid studio option '+args[i]);options[key]=args[++i];}
      else directories.push(args[i]);
    }
    if(directories.length>1)throw new Error('studio accepts one workspace directory');
    const studio=await startStudio({directory:path.resolve(directories[0]??'.'),port:Number(options.port??4174),theme:options.theme??'dark',version:options.version??'0.4.0',dev:!!options.dev});
    console.log('DBML Studio: '+studio.url);console.log('Workspace: '+studio.workspace.root);console.log('Edit, preview, and save DBML files. Press Ctrl+C to stop.');
    let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await studio.close();process.exit(0);});
  }else if(command==='render'||command==='serve'){
    const options={},files=[];
    for(let i=0;i<args.length;i++){
      if(args[i].startsWith('-')){const key=args[i]==='-o'?'output':args[i].replace(/^--/,'');if(!['output','links','level','detail','theme','port','version'].includes(key))throw new Error('Unknown option '+args[i]);if(!args[i+1]||args[i+1].startsWith('--'))throw new Error('Missing value for '+args[i]);options[key]=args[++i];}
      else files.push(args[i]);
    }
    if(files.length!==1)throw new Error(command+' requires exactly one DBML file');
    const file=path.resolve(files[0]);
    if(command==='render'){
      if(options.port)throw new Error('--port is only available with serve');
      const destination=path.resolve(options.output??file.replace(/\.dbml$/i,'')+'.svg');
      if(path.extname(destination).toLowerCase()!=='.svg')throw new Error('Output must have an .svg extension');
      const result=renderSvg(parseModel(file,options.version??'0.4.0'),{...options,title:path.basename(file)});
      fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,result.svg);output({output:destination,...result.stats});
    }else {
      if(options.output||options.level||options.detail)throw new Error('--output, --level, and --detail apply to render; use the browser toolbar with serve');
      const viewer=await startViewer({file,port:options.port===undefined?4173:Number(options.port),version:options.version??'0.4.0',theme:options.theme??'dark',links:options.links??'dependencies'});
      console.log('DBML viewer: '+viewer.url);console.log('File: '+file);console.log('Live reload enabled. Press Ctrl+C to stop.');
      let closing=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(closing)return;closing=true;await viewer.close();process.exit(0);});
    }
  }else if(command==='analyze'){
    const version=args[0]??'0.4.0',out=path.join(root,'artifacts',version);
    const {analysis}=await writeAnalysis(out,version);
    output({version,out,renderer:analysis.renderer,featureDifferences:analysis.featureDifferences});
  }else if(command==='model'){
    if(!args[0])throw new Error('model requires a DBML path');
    const db=parseModel(path.resolve(args[0]),args[1]??'0.4.0'),graph=graphFromDatabase(db),out=path.join(root,'artifacts/model');fs.mkdirSync(out,{recursive:true});
    fs.writeFileSync(path.join(out,'normalized.json'),JSON.stringify(db,null,2)+'\n');
    fs.writeFileSync(path.join(out,'graph.json'),JSON.stringify(graph,null,2)+'\n');
    fs.writeFileSync(path.join(out,'lineage.dot'),graphDot(graph));
    output({tables:graph.tables.length,foreignKeys:Object.keys(db.refs??{}).length,lineageEdges:graph.edges.length,levels:Object.fromEntries(['table','column','mixed'].map(x=>[x,graph.edges.filter(e=>e.level===x).length])),out});
  }else if(command==='trace'){
    if(!args[0]||!args[1])throw new Error('trace requires a DBML path and schema.table[.column] endpoint');
    output(trace(graphFromDatabase(parseModel(path.resolve(args[0]))),args[1],args[2]??'upstream'));
  }else if(command==='layout'){
    if(!args[0])throw new Error('layout requires a .dbdiagram path');
    output(layoutDecoder(args[1]??'0.4.0')(fs.readFileSync(path.resolve(args[0]),'utf8')));
  }else if(command==='symbols'||command==='symbol'){
    const kind=args[0]??'host';if(!['host','renderer'].includes(kind))throw new Error('Choose host or renderer');
    const bundle=loadBundle(command==='symbol'?(args[2]??'0.4.0'):(args[1]??'0.4.0'));
    if(command==='symbols')output(catalog(bundle[kind]));
    else {if(!args[1])throw new Error('symbol requires bundle kind and symbol name');console.log(pretty(symbolSource(bundle[kind],args[1]).code));}
  }else if(command==='compare'){
    if(args.length!==2)throw new Error('compare requires two installed versions');
    const versions=args.map(v=>staticAnalysis(v));output(versions.map(v=>({version:v.version,bundles:v.bundles,renderer:v.renderer,featureDifferences:v.featureDifferences})));
  }else {
    console.log('Commands: studio [DIRECTORY] [--port 4174] [--theme dark|light] [--dev] | render FILE [-o FILE.svg] [--links dependencies|relationships|all] [--level table|column] [--detail tables|columns] [--theme dark|light] | serve FILE [--port 4173] [--theme dark|light] [--links dependencies|relationships|all] | analyze [version] | model FILE [version] | trace FILE ENDPOINT [upstream|downstream] | layout FILE [version] | compare VERSION VERSION | symbols [host|renderer] [version] | symbol host|renderer NAME [version]');
    if(command)process.exitCode=1;
  }
}catch(error){console.error(error.diags?JSON.stringify(error.diags,null,2):error.stack??String(error));process.exitCode=1;}
