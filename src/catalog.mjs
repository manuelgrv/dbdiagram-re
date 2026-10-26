import { loadAcorn } from './environment.mjs';

// Streaming lexical catalog. Tokenization respects comments, strings, regexes,
// and template interpolation; it never evaluates the application bundles.
export function catalog(source) {
  const tokenizer=loadAcorn().tokenizer(source,{ecmaVersion:'latest',sourceType:'module'});
  const entries=[],stack=[];
  let variable=null,stage=null,entry=null,fn=null,previous=null;
  for(;;){
    const token=tokenizer.getToken(),label=token.type.label;
    if(label==='eof')break;
    const depth=stack.length;
    if(depth===0){
      if(['var','const','let'].includes(label)) {variable=label;stage='name';}
      else if(variable){
        if(stage==='name'&&label==='name'){entry={kind:variable,symbol:token.value,start:token.start};stage='equals';}
        else if(stage==='equals'&&label==='='){stage='value';entry.initializerStart=token.end;}
        else if(stage==='value'&&entry.initializerStart===undefined)entry.initializerStart=token.start;
        if((label===','||label===';')&&entry){entry.end=token.start;if(entry.initializerStart!==undefined)entries.push(entry);entry=null;stage=label===','?'name':null;if(label===';')variable=null;}
      }else if(label==='function'||label==='class')fn={kind:label,start:previous?.value==='async'?previous.start:token.start,symbol:null};
      else if(fn&&!fn.symbol&&label==='name')fn.symbol=token.value;
    }
    if(['(','[','{','${'].includes(label))stack.push(label);
    else if([')',']','}'].includes(label)){
      if(!stack.length)throw new Error(`Unbalanced token at ${token.start}`);
      stack.pop();
      if(!stack.length&&label==='}'&&fn&&!variable){fn.end=token.end;fn.initializerStart=fn.start;if(fn.symbol)entries.push(fn);fn=null;}
    }
    previous=token;
  }
  if(stack.length)throw new Error('Unbalanced source at EOF');
  return entries;
}
export function symbolSource(source,symbol,entries=catalog(source)) {
  const found=entries.find(e=>e.symbol===symbol);
  if(!found)throw new Error(`Top-level symbol not found: ${symbol}`);
  return {entry:found,code:found.kind==='function'||found.kind==='class'?source.slice(found.start,found.end):`${found.kind} ${found.symbol} = ${source.slice(found.initializerStart,found.end)};`};
}
