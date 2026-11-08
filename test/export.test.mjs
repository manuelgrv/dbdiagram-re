import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startStudio } from '../src/studio-server.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { exportPlan, captureDiagram } from '../web/diagram-export.mjs';
const stage = { width: () => 800, height: () => 600, getClientRect: () => ({ x: -100.5, y: 50.5, width: 500, height: 300 }) };
test('full diagram export includes offscreen content and padding at the selected resolution', () => {
    const plan = exportPlan(stage, { scope:'diagram',scale:2,format:'png' });
    assert.deepEqual(plan.crop, {x:-125,y:26,width:549,height:349});
    assert.equal(plan.width,1098); assert.equal(plan.height,698); assert.equal(plan.mimeType,'image/png');
});
test('visible-area JPEG export uses viewport bounds and rejects invalid or oversized images', () => {
    const plan = exportPlan(stage, {scope:'viewport',scale:1,format:'jpeg'});
    assert.deepEqual(plan.crop,{x:0,y:0,width:800,height:600});
    assert.equal(plan.mimeType,'image/jpeg');
    for (const options of [{format:'gif'},{scale:4},{scope:'other'}]) assert.throws(() => exportPlan(stage,options), /supported/);
    assert.throws(() => exportPlan({...stage,getClientRect:()=>({x:0,y:0,width:20000,height:20000})}), /too large/);
    assert.throws(() => exportPlan({...stage,getClientRect:()=>({x:NaN,y:0,width:100,height:100})}), /empty/);
    assert.throws(() => exportPlan({...stage,getClientRect:()=>({x:0,y:0,width:0,height:100})}), /empty/);
});
function browser({ failEncoding=false } = {}) {
    const operations=[], buffers=[]; let clock=0;
    const container={isConnected:true,parentElement:null};
    const scene={width:800,height:600};
    let scale={x:0.2,y:0.2}, position={x:80,y:-50};
    const graph={...stage,container:()=>container,find:()=>[],scale:value=>{if(value){scale={...value};operations.push(['scale',value]);}return {...scale};},position:value=>{if(value){position={...value};operations.push(['position',value]);}return {...position};},batchDraw:()=>{},toCanvas:options=>{operations.push(['capture',options,{scale:{...scale},position:{...position}}]);return scene;}};
    const window={Konva:{stages:[{...graph,container:()=>({isConnected:false})},graph]},performance:{now:()=>{clock+=250;return clock;}},requestAnimationFrame:callback=>callback(),getComputedStyle:()=>({backgroundColor:'rgb(20, 27, 37)'}),document:{fonts:{ready:Promise.resolve()},createElement:tag=>{ if(tag==='div')return {}; 
        const canvas={width:0,height:0,getContext:()=>({set fillStyle(value){operations.push(['background',value]);},fillRect:(...args)=>operations.push(['fill',...args]),drawImage:value=>operations.push(['draw',value]),toBlob:undefined}),toBlob:(callback,type,quality)=>{operations.push(['encode',type,quality]);callback(failEncoding?null:new Blob(['image'],{type}));}};
        buffers.push(canvas);return canvas;
    }}};
    return {window,operations,buffers,scene,graph};
}
test('capture encodes an opaque themed image without mutating the original view and releases buffers', async () => {
    const fixture=browser();
    const result=await captureDiagram(fixture.window,{scope:'viewport',format:'jpeg',scale:2,theme:'dark'});
    assert.equal(result.blob.type,'image/jpeg'); assert.equal(result.width,1600); assert.equal(result.height,1200);
    assert.ok(fixture.operations.some(op=>op[0]==='background'&&op[1]==='rgb(20, 27, 37)'));
    assert.ok(fixture.operations.findIndex(op=>op[0]==='fill')<fixture.operations.findIndex(op=>op[0]==='draw'));
    assert.equal(fixture.scene.width,0);assert.equal(fixture.buffers[0].width,0);
    assert.equal(stage.width(),800);
});
test('capture reports missing canvas and encoder failure and releases failed export buffers', async () => {
    await assert.rejects(captureDiagram({Konva:{stages:[]}}), /not ready/);
    const fixture=browser({failEncoding:true});
    await assert.rejects(captureDiagram(fixture.window), /could not encode/);
    assert.equal(fixture.scene.width,0);assert.equal(fixture.buffers[0].width,0);
    assert.deepEqual(fixture.graph.scale(),{x:0.2,y:0.2});
    assert.deepEqual(fixture.graph.position(),{x:80,y:-50});
    const capture=fixture.operations.find(op=>op[0]==='capture');
    assert.deepEqual(capture[2].scale,{x:1,y:1});
    assert.deepEqual(capture[2].position,{x:0,y:0});
});


test('Studio serves the export module and bridge through its same-origin static routes', async t => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'dbml-export-api-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const studio=await startStudio({directory:root,port:0,watch:false});
    t.after(()=>studio.close());
    const response=await fetch(studio.url+'/diagram-export.mjs');
    assert.equal(response.status,200); assert.match(response.headers.get('content-type'),/javascript/);
    assert.match(await response.text(),/export async function captureDiagram/);
    const bridge=await (await fetch(studio.url+'/studio-bridge.js')).text();
    assert.match(bridge,/studio:exported/); assert.match(bridge,/import\('\/diagram-export\.mjs'\)/);
    assert.equal((await fetch(studio.url+'/diagram-export.mjs',{headers:{Origin:'http://untrusted.invalid'}})).status,403);
});
