(() => {
  let ready=false,revision=-1,current,stream;
  const status=text=>{const element=document.getElementById('local-status');if(element)element.textContent=text;};
  const emit=data=>window.dispatchEvent(new MessageEvent('message',{data,origin:location.origin}));
  function apply(snapshot,initial=false){
    current=snapshot;
    if(initial){
      let state=snapshot.state;
      try {const saved=JSON.parse(localStorage.getItem('dbml-local:'+snapshot.fileId));if(saved?.version==='3.0.0')state=saved;}catch{}
      emit({type:'loadState',state});
      emit({type:'themeChange',isDark:snapshot.theme==='dark'});
      emit({type:'setFeaturesToggle',featuresToggle:snapshot.features,shouldShowProTag:{stickyNote:false,detailLevel:false,tableSearchPanelTableGroup:false,colorHeader:false}});
    }
    if(snapshot.revision===revision&&!initial)return;
    revision=snapshot.revision;emit(snapshot.update);
    const db=snapshot.update.database;
    const counts=Object.keys(db.tables??{}).length+' tables · '+Object.keys(db.depEdges??{}).length+' lineage edges';
    status(snapshot.filename+' · '+counts+' · renderer '+snapshot.rendererVersion+(snapshot.update.errors.length?' · '+snapshot.update.errors.length+' errors':' · live'));
    document.documentElement.dataset.modelRevision=String(revision);
  }
  window.acquireVsCodeApi=()=>({
    postMessage(message){
      if(message.type==='ready'&&!ready){
        ready=true;
        fetch('/api/model').then(r=>{if(!r.ok)throw new Error('Model request failed');return r.json();}).then(snapshot=>{
          apply(snapshot,true);stream=new EventSource('/api/events');stream.onmessage=e=>apply(JSON.parse(e.data));stream.onerror=()=>status('Viewer disconnected; reconnecting…');
        }).catch(error=>status(error.message));
      }else if(message.type==='saveState'&&current){try{localStorage.setItem('dbml-local:'+current.fileId,JSON.stringify(message.state));}catch{}}
      else if(message.type==='revealError')status('DBML error at line '+message.startLine+', column '+message.startColumn);
      else if(message.type==='applyDbmlEdits')status('Source editing is disabled in this read-only local viewer. Edit the DBML file to reload.');
      else if(message.type==='requestProFeature')status('This control is unavailable in the read-only local viewer.');
    },getState(){return null;},setState(value){return value;}
  });
  window.addEventListener('error',event=>status('Renderer error: '+event.message));
  window.addEventListener('unhandledrejection',event=>status('Renderer error: '+(event.reason?.message??event.reason)));
  window.addEventListener('beforeunload',()=>stream?.close());
})();
