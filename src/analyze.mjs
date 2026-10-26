import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadBundle } from './environment.mjs';
import { recoverHost, literals, staticValue, pretty } from './extract.mjs';
import { exerciseEntitlement } from './runtime.mjs';
import { catalog } from './catalog.mjs';

const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
export function capabilities(bundle) {
  const s=bundle.renderer;
  return {depEdges:s.includes('depEdges'),relationshipMode:s.includes('relationshipMode'),relationshipModeEnabled:s.includes('relationshipModeEnabled'),dependencyModeValue:/Dependency/.test(s),vue:s.includes('createApp')||s.includes('__name:'),pinia:s.includes('featuresToggle')&&s.includes('diagramView'),hasSourceMapComment:/sourceMappingURL=/.test(s)};
}
export function staticAnalysis(version='0.4.0') {
  const b=loadBundle(version),r=recoverHost(b);
  const pro=staticValue(r.pro.node),free=staticValue(r.free.node);
  const codeSections=Object.fromEntries(Object.entries(r).map(([name,v])=>[name,{symbol:v.symbol,start:v.start,end:v.end,sha256:digest(v.code)}]));
  const endpoints=[...new Set([...literals(r.feature.node),...literals(r.loopback.node)].filter(x=>x.startsWith('/')||x.startsWith('https://')))];
  const resources=[];
  function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);if(e.isDirectory())visit(file);else {const relative=path.relative(b.root,file);if(relative.startsWith('dist/')||relative==='package.json')resources.push({file:relative,bytes:fs.statSync(file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')});}}}
  visit(b.root);
  return {version:b.manifest.version,manifest:{name:b.manifest.name,license:b.manifest.license,engines:b.manifest.engines,contributes:b.manifest.contributes,dependencies:b.manifest.dependencies,devDependencies:b.manifest.devDependencies},
    bundles:{host:{file:path.relative(b.root,b.hostFile),bytes:Buffer.byteLength(b.host),sha256:digest(b.host)},renderer:{file:path.relative(b.root,b.rendererFile),bytes:Buffer.byteLength(b.renderer),sha256:digest(b.renderer)}},
    renderer:capabilities(b),featureProfiles:{free,paid:pro},featureDifferences:Object.keys(pro).filter(k=>pro[k]!==free[k]).map(key=>({key,free:free[key],paid:pro[key]})),endpoints,sections:codeSections,resources};
}
export const entitlementFixtures={
  signed_out:{session:false},free:{subscription:{status:'free'}},personal_paid:{subscription:{status:'subscribed'}},personal_trial:{subscription:{status:'trial'}},cancelled:{subscription:{status:'cancelled'}},owner_workspace:{workspaces:{ownerWorkspaces:[{subscription:{status:'subscribed'}}]}},member_workspace:{workspaces:{memberWorkspaces:[{subscription:{status:'trial'}}]}},expired_workspace:{workspaces:{memberWorkspaces:[{subscription:{status:'expired'}}]}}
};
export async function writeAnalysis(out,version='0.4.0') {
  fs.mkdirSync(out,{recursive:true});const data=staticAnalysis(version),b=loadBundle(version),r=recoverHost(b);
  const behaviors={};for(const [name,fixture]of Object.entries(entitlementFixtures))behaviors[name]=await exerciseEntitlement(fixture,version);
  fs.writeFileSync(path.join(out,'analysis.json'),JSON.stringify(data,null,2)+'\n');
  fs.writeFileSync(path.join(out,'entitlement-behavior.json'),JSON.stringify(behaviors,null,2)+'\n');
  const dir=path.join(out,'recovered');fs.mkdirSync(dir,{recursive:true});
  for(const [name,v] of Object.entries(r))fs.writeFileSync(path.join(dir,name+'.js'),`// Local extraction from ${data.bundles.host.file}; version ${version}.\n// Original UTF-16 offsets [${v.start}, ${v.end}); symbol ${v.symbol}.\n`+pretty(`const ${v.symbol} = ${v.code};`));
  // The renderer application shell is small enough to extract separately from its vendors.
  const marker=b.renderer.lastIndexOf('window.addEventListener(`message`');
  if(marker>=0)fs.writeFileSync(path.join(dir,'webview-message-handler.js'),pretty(b.renderer.slice(marker)));
  for(const [name,source]of [['host',b.host],['renderer',b.renderer]]) {
    const symbols=catalog(source);
    fs.writeFileSync(path.join(out,name+'-symbols.json'),JSON.stringify(symbols,null,2)+'\n');
  }
  return {analysis:data,behaviors};
}
