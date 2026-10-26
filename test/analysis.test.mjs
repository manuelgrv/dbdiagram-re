import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadBundle } from '../src/environment.mjs';
import { recoverHost, staticValue, functionByName } from '../src/extract.mjs';
import { parserRuntime, parseModel, exerciseEntitlement, layoutDecoder } from '../src/runtime.mjs';
import { staticAnalysis, entitlementFixtures } from '../src/analyze.mjs';
import { graphFromDatabase, trace } from '../src/graph.mjs';

const model=fileURLToPath(new URL('../examples/retail_lineage.dbml',import.meta.url));
const recovered=recoverHost(loadBundle());
const profiles={free:staticValue(recovered.free.node),paid:staticValue(recovered.pro.node)};

test('AST extraction isolates an object instead of consuming comma-separated declarations',()=>{
  assert.equal(recovered.pro.node.type,'ObjectExpression');
  assert.equal(recovered.free.node.type,'ObjectExpression');
  assert.equal(profiles.free.tableGroup,false);
  assert.equal(profiles.paid.tableGroup,true);
});
test('source offsets identify exactly the recovered code',()=>{
  const b=loadBundle();for(const section of Object.values(recovered))assert.equal(b.host.slice(section.start,section.end),section.code);
});
test('function extraction handles dollar signs in minified names',()=>{
  assert.equal(functionByName('function x$a(){return 1}var z=2','x$a').code,'function x$a(){return 1}');
});
for(const [name,fixture] of Object.entries(entitlementFixtures))test(`actual feature manager: ${name}`,async()=>{
  const result=await exerciseEntitlement(fixture);
  const paid=['personal_paid','personal_trial','owner_workspace','member_workspace'].includes(name);
  assert.deepEqual(result.features,paid?profiles.paid:profiles.free);
  assert.equal(result.emissions,1);
  assert.equal(result.calls.length,name==='signed_out'?0:2);
});
test('network error is observable and leaves the initial cached state untouched',async()=>{
  const result=await exerciseEntitlement({error:true});
  assert.equal(result.error,'Synthetic network failure');assert.equal(result.emissions,0);assert.deepEqual(result.features,result.initial);
});
test('lineage visibility is enabled in both profiles',()=>{
  assert.equal(profiles.free.relationshipModeEnabled,true);assert.equal(profiles.paid.relationshipModeEnabled,true);
});
test('retail model parses with all tables, relationships, and lineage edges',()=>{
  const db=parseModel(model);assert.equal(Object.keys(db.tables).length,19);assert.equal(Object.keys(db.refs).length,15);assert.equal(Object.keys(db.depEdges).length,129);
});
test('parser retains transformation metadata',()=>{
  const db=parseModel(model);const dep=Object.values(db.deps).find(d=>d.name==='aggregate_daily_revenue');
  assert.ok(dep);assert.ok(dep.note);assert.match(JSON.stringify(dep.metadata),/WITH sales AS/);
});
test('actual parser rejects mixed levels in a Dep block',()=>{
  assert.throws(()=>parserRuntime().parse('Table a {\n id int\n}\nTable b {\n id int\n}\nDep bad {\n a -> b\n a.id -> b.id\n}'),error=>error.diags?.some(d=>/same level/.test(d.message)));
});
test('actual parser rejects unresolved dependency endpoints',()=>{
  assert.throws(()=>parserRuntime().parse('Table a {\n id int\n}\nDep: a.id -> missing.id'));
});
test('column trace reaches every input of daily net revenue',()=>{
  const result=trace(graphFromDatabase(parseModel(model)),'reporting.daily_revenue.net_revenue');
  for(const name of ['source.order_items.quantity','source.order_items.unit_price','source.order_items.discount_amount','source.refunds.amount'])assert.ok(result.nodes.includes(name),name);
  assert.equal(result.edges.length,8);
});
test('table trace follows declared pipeline edges',()=>{
  const result=trace(graphFromDatabase(parseModel(model)),'reporting.daily_revenue');
  assert.ok(result.nodes.includes('source.orders'));assert.ok(result.nodes.includes('source.refunds'));
});
test('downstream impact analysis reaches report columns',()=>{
  const result=trace(graphFromDatabase(parseModel(model)),'source.refunds.amount','downstream');
  assert.ok(result.nodes.includes('reporting.daily_revenue.net_revenue'));assert.ok(result.nodes.includes('reporting.customer_value.lifetime_value'));
});
test('graph traversal terminates on cycles and rejects unknown inputs',()=>{
  const graph={tables:[{name:'public.a',fields:[]},{name:'public.b',fields:[]}],edges:[{id:1,from:'public.a',to:'public.b'},{id:2,from:'public.b',to:'public.a'}]};
  assert.equal(trace(graph,'public.a').edges.length,2);assert.throws(()=>trace(graph,'public.unknown'),/Unknown endpoint/);assert.throws(()=>trace(graph,'public.a','sideways'),/Direction/);
});
const decode=layoutDecoder();
test('actual layout decoder normalizes v1 and unversioned layouts',()=>{
  for(const version of ['1.0.0',undefined]){
    const value=decode({version,darkMode:true,tablePositions:[{name:'a',x:10,y:20}]});
    assert.equal(value.version,'3.0.0');assert.equal(value.defaultView.relationshipMode,'All');assert.equal(value.defaultView.tablePositions[0].x,10);
  }
});
test('actual layout decoder upgrades v2 and preserves v3 dependency mode',()=>{
  for(const version of ['2.0.0','3.0.0']){
    const value=decode({version,darkMode:false,defaultView:{relationshipMode:'Dependency'}});
    assert.equal(value.version,'3.0.0');assert.equal(value.defaultView.relationshipMode,'Dependency');
  }
});
test('actual layout decoder rejects malformed JSON and invalid v3 darkMode',()=>{
  assert.equal(decode('{oops'),null);assert.equal(decode({version:'3.0.0',darkMode:'yes'}),null);
});
test('actual layout decoder normalizes invalid link modes and future version shapes',()=>{
  const value=decode({version:'99.0.0',darkMode:false,defaultView:{relationshipMode:'bogus'}});assert.equal(value.version,'3.0.0');assert.equal(value.defaultView.relationshipMode,'All');
});
test('analysis confirms usable dependency controls in installed 0.4.0',()=>{
  const analysis=staticAnalysis();assert.equal(analysis.renderer.depEdges,true);assert.equal(analysis.renderer.relationshipMode,true);assert.ok(analysis.featureDifferences.some(f=>f.key==='tableGroup'));
});


test('streaming symbol catalog handles strings, regexes, templates, and comma declarations',async()=>{
  const {catalog,symbolSource}=await import('../src/catalog.mjs');
  const source='var a={text:"comma,;"},b=/[,;]/;const c=`hello ${1+2}`;function f(x){return {x}}';
  const entries=catalog(source);
  assert.deepEqual(entries.map(x=>x.symbol),['a','b','c','f']);
  assert.match(symbolSource(source,'a',entries).code,/text:"comma,;"/);
  assert.equal(symbolSource(source,'f',entries).code,'function f(x){return {x}}');
});


let reference;
try { reference=loadBundle('0.5.3'); } catch {}
test('official 0.5.3 reference reproduces missing renderer dependency controls',{skip:!reference},()=>{
  const analysis=staticAnalysis('0.5.3');
  assert.equal(analysis.renderer.depEdges,false);assert.equal(analysis.renderer.relationshipMode,false);
  assert.deepEqual(analysis.featureProfiles.free,profiles.free);assert.deepEqual(analysis.featureProfiles.paid,profiles.paid);
});
test('0.5.3 host still parses the complete lineage model',{skip:!reference},()=>{
  const db=parserRuntime('0.5.3').parse(fs.readFileSync(model,'utf8'));
  assert.equal(Object.keys(db.tables).length,19);assert.equal(Object.keys(db.depEdges).length,129);
});
test('distributed top-level symbol extracts are syntactically valid',async()=>{
  const {symbolSource}=await import('../src/catalog.mjs');
  const {loadAcorn}=await import('../src/environment.mjs');
  const acorn=loadAcorn();
  for(const version of reference?['0.4.0','0.5.3']:['0.4.0']){
    const bundle=loadBundle(version);
    for(const kind of ['host','renderer']){
      const file=new URL(`../artifacts/${version}/${kind}-symbols.json`,import.meta.url);
      if(!fs.existsSync(file))continue;
      const entries=JSON.parse(fs.readFileSync(file,'utf8'));
      for(let i=0;i<entries.length;i+=Math.ceil(entries.length/32))acorn.parse(symbolSource(bundle[kind],entries[i].symbol,entries).code,{ecmaVersion:'latest',sourceType:'module'});
    }
  }
});
