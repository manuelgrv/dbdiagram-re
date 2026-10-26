import { compileFile } from './dbml-project.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { loadBundle } from './environment.mjs';
import { recoverHost, objectBySymbol, functionByName, staticValue, walk } from './extract.mjs';

const require=createRequire(import.meta.url);
const cache=new Map();
function context(extra={}) {
  return vm.createContext({ console, URL, URLSearchParams, TextEncoder, TextDecoder, Buffer, ...extra });
}
export function parserRuntime(version='0.4.0') {
  if (cache.has(version)) return cache.get(version);
  const bundle=loadBundle(version), recovered=recoverHost(bundle);
  // Execute the original parser bootstrap, ending before authentication/HTTP initialization.
  // vm is an instrumentation context, not a security boundary for arbitrary code.
  let end=recovered.parserBridge?.end;
  if (!end) {
    const nextRequire=bundle.host.indexOf('require("vscode")',recovered.parser.end);
    end=bundle.host.lastIndexOf('var ',nextRequire);
  }
  if (!end || end <= recovered.parser.end) throw new Error('Cannot establish parser bootstrap boundary');
  const allowed=new Set(['vscode','path','fs','node:path','node:fs','util','node:util','os','node:os','stream','node:stream','events','node:events','buffer','node:buffer','crypto','node:crypto','assert','node:assert','string_decoder','node:string_decoder','url','node:url','querystring','node:querystring','tty','node:tty','zlib','node:zlib','constants']);
  const ctx=context({ module:{exports:{}}, exports:{}, process, setTimeout, clearTimeout, setInterval, clearInterval,
    require(id) { if (id==='vscode') return {}; if (!allowed.has(id)) throw new Error(`Parser bootstrap requested unexpected module: ${id}`); return require(id); } });
  new vm.Script(bundle.host.slice(0,end)+`;globalThis.__parser=${recovered.parser.symbol};`,{filename:bundle.hostFile}).runInContext(ctx,{timeout:20000});
  const runtime={bundle, recovered,
    compile(source) {ctx.__source=source;return JSON.parse(new vm.Script('JSON.stringify((()=>{const parsed=__parser.parse(__source,"dbmlv2");return {database:parsed.normalize(),diagramViews:parsed.diagramViews};})())').runInContext(ctx,{timeout:10000}));},
    compileProject(entry, sources) {
      ctx.__projectEntry = entry;
      ctx.__projectSources = sources;
      let result;
      try { result = new vm.Script(`(() => {
        const parser = new __parser();
        for (const [file, source] of __projectSources) parser.setDbmlSource(file, source);
        // Core's public diagnostic conversion drops filenames. Retain the original
        // project errors so diagnostics can point to the imported source file.
        let projectErrors = [];
        const interpret = parser.DBMLCompiler.interpretFile.bind(parser.DBMLCompiler);
        parser.DBMLCompiler.interpretFile = file => {
          const result = interpret(file);
          projectErrors = result.getErrors();
          return result;
        };
        try {
          const parsed = parser.parseDbmlProject(__projectEntry);
          return JSON.stringify({ database: parsed.normalize(), diagramViews: parsed.diagramViews });
        } catch (error) {
          return JSON.stringify({ failure: true, message: error.message, diags: error.diags?.map((diag, index) => ({ ...diag, filepath: projectErrors[index]?.filepath?.absolute ?? projectErrors[index]?.filepath?.path })) });
        }
      })()`, { filename: 'dbml-project-compiler' }).runInContext(ctx, { timeout: 10000 }); }
      finally { delete ctx.__projectEntry; delete ctx.__projectSources; }
      const compiled = JSON.parse(result);
      if (compiled.failure) { const error = new Error(compiled.message ?? 'DBML project contains errors'); error.diags = compiled.diags; throw error; }
      return compiled;
    },
    parse(source) {return this.compile(source).database;}};
  cache.set(version,runtime);
  return runtime;
}
export function parseModel(file,version='0.4.0') { return compileFile(file, parserRuntime(version)).database; }

export async function exerciseEntitlement(fixture={}, version='0.4.0') {
  const bundle=loadBundle(version), r=recoverHost(bundle), cls=r.feature.code;
  const vscodeSymbol=cls.match(/new ([\w$]+)\.EventEmitter/)[1];
  const loggerSymbol=cls.match(/log=([\w$]+)\.getInstance/)[1];
  const sessionSymbol=cls.match(/async fetchFeaturesToggle\(\)\{let [\w$]+=await ([\w$]+)\(/)[1];
  const apiSymbol=cls.match(/([\w$]+)\.get\("\/subscription"/)[1];
  const fired=[], calls=[];
  class Emitter { fire(value){fired.push(value)} dispose(){} event(){} }
  const ctx=context({setInterval:()=>1,clearInterval:()=>{},
    [vscodeSymbol]:{EventEmitter:Emitter,authentication:{onDidChangeSessions:()=>({dispose(){}})}},
    [loggerSymbol]:{getInstance:()=>({trace(){},error(){}})},
    [sessionSymbol]:async()=>fixture.session === false ? undefined : {accessToken:'synthetic-offline-token'},
    [apiSymbol]:{get:async route=>{calls.push(route); if(fixture.error) throw new Error('Synthetic network failure'); return {data:route==='/subscription' ? fixture.subscription ?? {} : fixture.workspaces ?? {}};}}
  });
  const source=`const ${r.pro.symbol}=${r.pro.code};const ${r.free.symbol}=${r.free.code};const RecoveredFeatureManager=${cls};globalThis.manager=new RecoveredFeatureManager;`;
  new vm.Script(source).runInContext(ctx,{timeout:1000});
  const initial=JSON.parse(JSON.stringify(ctx.manager.getFeaturesToggle()));
  let error;
  try { await ctx.manager.fetchFeaturesToggle(); } catch (failure) {error=failure.message;}
  return {error,initial,features:JSON.parse(JSON.stringify(ctx.manager.getFeaturesToggle())),calls,emissions:fired.length};
}

export function layoutDecoder(version='0.4.0') {
  const bundle=loadBundle(version), r=recoverHost(bundle), declarations=new Map();
  function collect(name) {
    if(declarations.has(name)) return;
    let def;
    try {def=functionByName(bundle.host,name);} catch {def=objectBySymbol(bundle.host,name);}
    declarations.set(name,def);
    // Only resolve helper identifiers with definitions inside the small layout section.
    const sectionStart=bundle.host.lastIndexOf('var ',bundle.host.indexOf('"3.0.0"',bundle.host.indexOf('module.exports=')));
    const sectionEnd=r.layout.start;
    const candidates=new Set();
    walk(def.node,n=>{if(n.type==='Identifier')candidates.add(n.name)});
    for(const id of candidates) {
      if(declarations.has(id))continue;
      try {const fn=functionByName(bundle.host,id); if(fn.start>=sectionStart&&fn.end<sectionEnd)collect(id);continue;}catch{}
      try {const obj=objectBySymbol(bundle.host,id);if(obj.start>=sectionStart&&obj.end<sectionEnd)collect(id);}catch{}
    }
  }
  collect(r.decode.symbol);
  const code=[...declarations.values()].filter(x=>x.kind!=='function').map(x=>`var ${x.symbol}=${x.code};`).join('\n')+'\n'+[...declarations.values()].filter(x=>x.kind==='function').map(x=>x.code).join('\n')+`;globalThis.decode=${r.decode.symbol};`;
  const ctx=context();new vm.Script(code).runInContext(ctx,{timeout:1000});
  return input=>{ctx.__input=typeof input==='string'?input:JSON.stringify(input);return JSON.parse(new vm.Script('JSON.stringify(decode(__input))').runInContext(ctx,{timeout:1000}));};
}
