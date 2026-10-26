import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeAnalysis, staticAnalysis } from './analyze.mjs';
import { parseModel } from './runtime.mjs';
import { graphFromDatabase, graphDot, trace } from './graph.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const available=[];
for(const version of ['0.4.0','0.5.3']){
  try{const result=await writeAnalysis(path.join(root,'artifacts',version),version);available.push(result.analysis);console.log(`Analyzed ${version}`);}
  catch(error){if(version==='0.4.0')throw error;console.log(`Reference ${version} unavailable: ${error.message}`);}
}
const out=path.join(root,'artifacts/model');fs.mkdirSync(out,{recursive:true});
const db=parseModel(path.resolve(root,'examples/retail_lineage.dbml')),graph=graphFromDatabase(db);
for(const [name,data]of Object.entries({'normalized.json':db,'graph.json':graph,'net-revenue-trace.json':trace(graph,'reporting.daily_revenue.net_revenue')}))fs.writeFileSync(path.join(out,name),JSON.stringify(data,null,2)+'\n');
fs.writeFileSync(path.join(out,'lineage.dot'),graphDot(graph));
const comparison=available.map(a=>({version:a.version,bundles:a.bundles,renderer:a.renderer,sections:a.sections}));
fs.writeFileSync(path.join(root,'artifacts/comparison.json'),JSON.stringify(comparison,null,2)+'\n');
console.log(`Exported ${graph.tables.length} tables and ${graph.edges.length} lineage edges`);
