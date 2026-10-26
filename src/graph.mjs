export function graphFromDatabase(db) {
  const tableName=id=>{const t=db.tables[id];if(!t)throw new Error(`Missing table ${id}`);return `${db.schemas[t.schemaId].name}.${t.name}`;};
  const endpoint=(tableId,fieldIds)=>tableName(tableId)+(fieldIds?.length?'.'+fieldIds.map(id=>db.fields[id].name).join(','):'');
  return {
    tables:Object.values(db.tables).map(t=>({id:t.id,name:tableName(t.id),fields:(t.fieldIds??[]).map(id=>({name:db.fields[id].name,type:db.fields[id].type}))})),
    edges:Object.values(db.depEdges??{}).map(e=>({id:e.id,job:db.deps[e.depId]?.name??null,from:endpoint(e.upstreamTableId,e.upstreamFieldIds),to:endpoint(e.downstreamTableId,e.downstreamFieldIds),level:!e.upstreamFieldIds.length&&!e.downstreamFieldIds.length?'table':e.upstreamFieldIds.length&&e.downstreamFieldIds.length?'column':'mixed'}))
  };
}
export function trace(graph,endpoint,direction='upstream') {
  if(!['upstream','downstream'].includes(direction)) throw new Error('Direction must be upstream or downstream');
  const exists=graph.tables.some(t=>t.name===endpoint||t.fields.some(f=>t.name+'.'+f.name===endpoint));
  if(!exists)throw new Error(`Unknown endpoint: ${endpoint}`);
  const queue=[endpoint],seen=new Set(queue), edges=[],ids=new Set();
  for(let i=0;i<queue.length;i++)for(const edge of graph.edges){
    const match=direction==='upstream'?edge.to:edge.from,next=direction==='upstream'?edge.from:edge.to;
    if(match!==queue[i])continue;
    if(!ids.has(edge.id)){edges.push(edge);ids.add(edge.id);}
    if(!seen.has(next)){seen.add(next);queue.push(next);}
  }
  return {endpoint,direction,nodes:[...seen],edges};
}
export function graphDot(graph) {
  const q=JSON.stringify;
  const edges=new Map();
  for(const e of graph.edges){const from=e.from.split('.').slice(0,2).join('.'),to=e.to.split('.').slice(0,2).join('.');edges.set(from+'->'+to,{from,to});}
  return 'digraph lineage {\n  rankdir=LR;\n'+graph.tables.map(t=>'  '+q(t.name)+' [shape=box];').join('\n')+'\n'+[...edges.values()].map(e=>'  '+q(e.from)+' -> '+q(e.to)+';').join('\n')+'\n}\n';
}
