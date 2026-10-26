const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors=['#60a5fa','#34d399','#fbbf24','#c084fc','#fb7185','#22d3ee'];
export function renderSvg(db,{links='dependencies',level='table',detail='columns',theme='dark',title='DBML diagram'}={}){
  if(!['dependencies','relationships','all'].includes(links))throw new Error('Links must be dependencies, relationships, or all');
  if(!['table','column'].includes(level))throw new Error('Level must be table or column');
  if(!['tables','columns'].includes(detail))throw new Error('Detail must be tables or columns');
  if(!['dark','light'].includes(theme))throw new Error('Theme must be dark or light');
  const tables=Object.values(db.tables??{}).map(t=>({...t,fullName:(db.schemas[t.schemaId]?.name??'public')+'.'+t.name}));
  const byId=new Map(tables.map(t=>[t.id,t])),edges=[];
  if(links!=='relationships'){
    const seen=new Set();
    for(const e of Object.values(db.depEdges??{})){
      const key=level==='table'?`${e.upstreamTableId}->${e.downstreamTableId}`:`${e.upstreamTableId}:${e.upstreamFieldIds}->${e.downstreamTableId}:${e.downstreamFieldIds}`;
      if(seen.has(key))continue;seen.add(key);
      const dep=db.deps[e.depId];
      edges.push({kind:'dependency',from:e.upstreamTableId,to:e.downstreamTableId,fromFields:level==='column'?e.upstreamFieldIds:[],toFields:level==='column'?e.downstreamFieldIds:[],label:dep?.name??'Data dependency',note:dep?.note??'',color:dep?.color});
    }
  }
  if(links!=='dependencies')for(const ref of Object.values(db.refs??{})){
    const [a,b]=ref.endpointIds.map(id=>db.endpoints[id]);
    const from=db.fields[a.fieldIds[0]]?.tableId,to=db.fields[b.fieldIds[0]]?.tableId;
    if(from!==undefined&&to!==undefined)edges.push({kind:'relationship',from,to,fromFields:a.fieldIds,toFields:b.fieldIds,label:`${a.relation} → ${b.relation}`,note:ref.name??'Foreign key'});
  }
  // Tarjan SCCs make layering deterministic even for cyclic schemas.
  let index=0;const stack=[],onStack=new Set(),indices=new Map(),low=new Map(),components=[];
  const adjacent=new Map(tables.map(t=>[t.id,[]]));
  for(const e of edges)if(adjacent.has(e.from)&&adjacent.has(e.to))adjacent.get(e.from).push(e.to);
  function visit(id){indices.set(id,index);low.set(id,index++);stack.push(id);onStack.add(id);
    for(const next of adjacent.get(id)){if(!indices.has(next)){visit(next);low.set(id,Math.min(low.get(id),low.get(next)));}else if(onStack.has(next))low.set(id,Math.min(low.get(id),indices.get(next)));}
    if(low.get(id)===indices.get(id)){const group=[];let next;do{next=stack.pop();onStack.delete(next);group.push(next);}while(next!==id);components.push(group);}}
  for(const t of tables)if(!indices.has(t.id))visit(t.id);
  const componentOf=new Map();components.forEach((group,i)=>group.forEach(id=>componentOf.set(id,i)));
  const incoming=components.map(()=>new Set());
  for(const e of edges){const a=componentOf.get(e.from),b=componentOf.get(e.to);if(a!==b&&a!==undefined&&b!==undefined)incoming[b].add(a);}
  const ranks=new Map();function rank(i){if(!ranks.has(i))ranks.set(i,incoming[i].size?1+Math.max(...[...incoming[i]].map(rank)):0);return ranks.get(i);}
  const layers=new Map();for(const t of tables){const r=rank(componentOf.get(t.id));if(!layers.has(r))layers.set(r,[]);layers.get(r).push(t);}
  const width=360,gap=140,row=25,header=55,pad=40,top=140,positions=new Map();let height=250;
  for(const [r,group]of layers){group.sort((a,b)=>a.fullName.localeCompare(b.fullName));let y=top;for(const t of group){const h=header+(detail==='columns'?t.fieldIds.length*row:0)+14;positions.set(t.id,{x:pad+r*(width+gap),y,w:width,h});y+=h+52;}height=Math.max(height,y+30);}
  const totalWidth=Math.max(800,pad*2+width+Math.max(0,layers.size-1)*(width+gap));
  const dark=theme==='dark',palette=dark?{bg:'#0b1220',card:'#152033',head:'#1e2c44',text:'#e5edf8',muted:'#9aaec7',border:'#32445f',fk:'#9ba9c3'}:{bg:'#f4f7fb',card:'#fff',head:'#e8eef8',text:'#17263d',muted:'#526780',border:'#ccd7e6',fk:'#64748b'};
  const schemaIds=[...new Set(tables.map(t=>t.schemaId))];
  const color=t=>colors[schemaIds.indexOf(t.schemaId)%colors.length];
  const at=(id,fieldIds,side)=>{const p=positions.get(id),t=byId.get(id);const field=fieldIds?.length?t.fieldIds.indexOf(fieldIds[0]):-1;return {x:side==='right'?p.x+p.w:p.x,y:p.y+(field>=0&&detail==='columns'?header+field*row+row/2:header/2)};};
  const out=[`<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" role="img" aria-labelledby="diagram-title diagram-description">`,
    `<title id="diagram-title">${escape(title)}</title><desc id="diagram-description">${tables.length} tables; ${edges.length} displayed connections. Dashed arrows show data lineage; solid arrows show foreign-key relationships.</desc>`,
    `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke"/></marker></defs>`,
    `<rect width="100%" height="100%" fill="${palette.bg}"/>`,
    `<g font-family="system-ui,-apple-system,sans-serif"><text x="${pad}" y="46" fill="${palette.text}" font-size="23" font-weight="700">${escape(title)}</text>`,
    `<text x="${pad}" y="74" fill="${palette.muted}" font-size="13">${tables.length} tables · ${edges.length} connections · ${escape(links)} · ${escape(level)} level</text>`,
    `<text x="${pad}" y="99" fill="${palette.muted}" font-size="12">Dashed = data lineage (upstream → downstream) · Solid = foreign-key reference · Hover for details</text>`];
  for(const e of edges){if(!positions.has(e.from)||!positions.has(e.to))continue;const a=at(e.from,e.fromFields,'right'),b=at(e.to,e.toFields,'left');let curve;
    if(b.x>a.x){const offset=Math.max(55,(b.x-a.x)/2);curve=`M${a.x},${a.y} C${a.x+offset},${a.y} ${b.x-offset},${b.y} ${b.x},${b.y}`;}
    else {const outside=Math.max(a.x,b.x)+75;curve=`M${a.x},${a.y} C${outside},${a.y-45} ${outside},${b.y-45} ${b.x},${b.y}`;}
    const stroke=e.kind==='dependency'?(e.color&&/^#[\da-f]{3,8}$/i.test(e.color)?e.color:color(byId.get(e.from))):palette.fk;
    out.push(`<path data-edge="${e.kind}" d="${curve}" fill="none" stroke="${stroke}" stroke-width="1.6" opacity="0.65" ${e.kind==='dependency'?'stroke-dasharray="5 4"':''} marker-end="url(#arrow)"><title>${escape(byId.get(e.from).fullName+' → '+byId.get(e.to).fullName+' | '+e.label+' | '+e.note)}</title></path>`);
  }
  for(const t of tables){const p=positions.get(t.id);out.push(`<g data-table="${escape(t.fullName)}"><title>${escape(t.note??t.fullName)}</title><rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="9" fill="${palette.card}" stroke="${palette.border}"/><path d="M${p.x+9},${p.y} H${p.x+p.w-9} Q${p.x+p.w},${p.y} ${p.x+p.w},${p.y+9} V${p.y+header} H${p.x} V${p.y+9} Q${p.x},${p.y} ${p.x+9},${p.y}" fill="${palette.head}"/><rect x="${p.x}" y="${p.y+9}" width="3" height="${header-9}" fill="${color(t)}"/><text x="${p.x+15}" y="${p.y+21}" fill="${color(t)}" font-size="11">${escape(db.schemas[t.schemaId]?.name??'public')}</text><text x="${p.x+15}" y="${p.y+42}" fill="${palette.text}" font-size="16" font-weight="650">${escape(t.name)}</text>`);
    if(detail==='columns')t.fieldIds.forEach((id,i)=>{const f=db.fields[id],y=p.y+header+i*row+17;out.push(`<text data-field="${escape(f.name)}" x="${p.x+15}" y="${y}" fill="${f.pk?color(t):palette.text}" font-size="12"><title>${escape(f.note??'')}</title>${f.pk?'◆ ':''}${escape(f.name)}</text><text x="${p.x+p.w-14}" y="${y}" text-anchor="end" fill="${palette.muted}" font-size="11">${escape(f.type?.type_name??'')}</text>`);});out.push('</g>');
  }
  out.push('</g></svg>');return {svg:out.join('\n'),stats:{tables:tables.length,connections:edges.length,width:totalWidth,height}};
}
