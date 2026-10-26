import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { parserRuntime, parseModel } from '../src/runtime.mjs';
import { renderSvg } from '../src/render.mjs';
import { startViewer } from '../src/server.mjs';

const model=fileURLToPath(new URL('../examples/retail_lineage.dbml',import.meta.url));
test('SVG renders all 19 tables and collapses duplicate table lineage',()=>{
  const result=renderSvg(parseModel(model));
  assert.equal(result.stats.tables,19);assert.equal((result.svg.match(/data-table=/g)??[]).length,19);
  assert.ok(result.stats.connections>0&&result.stats.connections<129);
  assert.match(result.svg,/reporting/);assert.match(result.svg,/daily_revenue/);assert.doesNotMatch(result.svg,/NaN|undefined/);
});
test('column SVG retains all 129 distinct dependency edges',()=>{
  const result=renderSvg(parseModel(model),{level:'column'});
  assert.equal(result.stats.connections,129);assert.equal((result.svg.match(/data-edge="dependency"/g)??[]).length,129);
});
test('SVG can render relationships alone or both link types',()=>{
  const db=parseModel(model),erd=renderSvg(db,{links:'relationships'}),both=renderSvg(db,{links:'all'});
  assert.equal(erd.stats.connections,15);assert.equal((both.svg.match(/data-edge="relationship"/g)??[]).length,15);
  assert.ok(both.stats.connections>15);
});
test('SVG handles cycles, disconnected nodes, empty models, and XML text',()=>{
  const db=parserRuntime().parse('Table a {\n id int\n}\nTable b {\n id int\n}\nTable c {\n id int\n}\nDep: a -> b\nDep: b -> a');
  const result=renderSvg(db,{title:'<script>&"test"'});
  assert.equal(result.stats.tables,3);assert.match(result.svg,/&lt;script&gt;&amp;&quot;test&quot;/);assert.doesNotMatch(result.svg,/<script>/);
  assert.equal(renderSvg({tables:{}}).stats.tables,0);
});
test('SVG validates renderer options',()=>{
  assert.throws(()=>renderSvg({}, {links:'invalid'}),/Links/);assert.throws(()=>renderSvg({}, {level:'invalid'}),/Level/);
});
test('server serves original renderer assets, bridge, complete model, and health',async t=>{
  const viewer=await startViewer({file:model,port:0,watch:false});t.after(()=>viewer.close());
  const response=await fetch(viewer.url),html=await response.text();
  assert.equal(response.status,200);assert.match(html,/bridge\.js/);assert.match(html,/index-SEJgta-F\.js/);
  const snapshot=await (await fetch(viewer.url+'/api/model')).json();
  assert.equal(Object.keys(snapshot.update.database.tables).length,19);assert.equal(Object.keys(snapshot.update.database.depEdges).length,129);
  assert.equal(snapshot.state.defaultView.relationshipMode,'Dependency');assert.equal(snapshot.features.dbmlEditEnabled,false);
  const script=await fetch(viewer.url+'/bridge.js');assert.match(script.headers.get('content-type'),/javascript/);assert.match(await script.text(),/acquireVsCodeApi/);
  const cssPath=html.match(/href="(\/assets\/[^\"]+\.css)"/)[1];assert.equal((await fetch(viewer.url+cssPath)).status,200);
  const health=await (await fetch(viewer.url+'/health')).json();assert.equal(health.tables,19);assert.equal(health.errors,0);
});
test('server rejects write requests, unknown paths, and invalid host headers',async t=>{
  const viewer=await startViewer({file:model,port:0,watch:false});t.after(()=>viewer.close());
  assert.equal((await fetch(viewer.url+'/api/model',{method:'POST',body:'test'})).status,405);
  assert.equal((await fetch(viewer.url+'/not-an-asset')).status,404);
  const status=await new Promise((resolve,reject)=>{const req=http.get(viewer.url+'/api/model',{headers:{host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
  assert.equal(status,403);
});
test('SSE starts with a complete model snapshot',async t=>{
  const viewer=await startViewer({file:model,port:0,watch:false});t.after(()=>viewer.close());
  const controller=new AbortController();t.after(()=>controller.abort());
  const response=await fetch(viewer.url+'/api/events',{signal:controller.signal});
  assert.match(response.headers.get('content-type'),/event-stream/);
  const reader=response.body.getReader();let data='';
  while(!data.includes('\n\n'))data+=new TextDecoder().decode((await reader.read()).value);
  assert.equal(JSON.parse(data.split('\n\n')[0].slice(6)).filename,'retail_lineage.dbml');await reader.cancel();
});
test('live watcher refreshes edited DBML and recovers after syntax errors',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dbml-viewer-')),file=path.join(dir,'model.dbml');
  fs.writeFileSync(file,'Table a {\n id int\n}');
  const viewer=await startViewer({file,port:0});
  t.after(async()=>{await viewer.close();fs.rmSync(dir,{recursive:true,force:true});});
  async function waitFor(predicate){for(let i=0;i<80;i++){if(predicate(viewer.getSnapshot()))return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('Model refresh timed out');}
  fs.writeFileSync(file,'Table a {\n id int\n}\nTable b {\n id int\n}\nDep: a -> b');
  await waitFor(s=>Object.keys(s.update.database.tables??{}).length===2);
  fs.writeFileSync(file,'Table {');await waitFor(s=>s.update.errors.length>0);
  fs.writeFileSync(file,'Table recovered {\n id int\n}');await waitFor(s=>s.update.errors.length===0&&Object.values(s.update.database.tables??{}).some(x=>x.name==='recovered'));
});
test('server validates port, theme, and link arguments',async()=>{
  await assert.rejects(startViewer({file:model,port:-1}),/Port/);await assert.rejects(startViewer({file:model,theme:'invalid'}),/Theme/);
});
