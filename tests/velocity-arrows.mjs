import assert from 'node:assert/strict';
import { captureAnnotationFrame, installAnnotations } from '../dist/annotations.js';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { fixture } from './render-fixture.mjs';
import { LIGHT_SPEED } from '../dist/stellar-physics.js';
const camera={observer:[0,0,0],forward:[0,0,1],right:[1,0,0],up:[0,1,0]},canvas={getBoundingClientRect:()=>({left:0,top:0,width:680,height:440})};
const probe={id:'pilot',type:'probe',name:'Traveler',position:[1,1,12],radius:.09,index:1,velocity:[0,-.04,0],gridRelativeVelocity:[.003,0,0]};
const planet={id:'core',name:'Core',type:'star',position:[-1,0,12],radius:.45,index:0,velocity:[0,0,0]};
const r={cameraFrame:camera,canvas,objectFrames:[planet,probe],configCache:{},state:{annotations:false,lensing:false,velocityArrows:true},sceneRevision:1};
const capture=()=>structuredClone(captureAnnotationFrame(r)),get=f=>f.objectFrames.find(b=>b.id===probe.id);
let layer;globalThis.document={createElementNS:()=>layer={setAttribute(){},style:{},remove(){}}};
const ui=installAnnotations({...canvas,append(){}},()=>{throw Error('A delivered frame must not read newer controller state');});
let f=capture(),b=get(f);assert.equal(b.arrow.speed,.003*(LIGHT_SPEED/18));assert(Math.abs(b.arrow.x-1)<1e-12&&Math.abs(b.arrow.y)<1e-12,'grid-frame direction, not world motion');assert(b.labelEligible);assert(!f.objectFrames.find(b=>b.id==='core').arrow);ui.update(f);assert.match(layer.innerHTML,/data-velocity-arrow="pilot"/);assert.doesNotMatch(layer.innerHTML,/data-object-id=/);ui.setStatus({annotations:false});assert.equal(layer.style.display,'block');
r.state.annotations=true;r.state.velocityArrows=false;f=capture();ui.update(f);assert.match(layer.innerHTML,/data-object-id="pilot"/);assert.doesNotMatch(layer.innerHTML,/data-velocity-arrow/);assert.match(layer.innerHTML,/relative to grid/);
probe.gridRelativeVelocity=[0,0,0];r.state.velocityArrows=true;f=capture();ui.update(f);assert.match(layer.innerHTML,/0 m\/s relative to grid/);assert.doesNotMatch(layer.innerHTML,/data-velocity-arrow/);
delete probe.gridRelativeVelocity;probe.type='planet';f=capture();b=get(f);assert(b.arrow.y<-.999&&Math.abs(b.arrow.x)<1e-12,'general objects use world velocity');assert.equal(b.velocityDetail,undefined);
const mid=probe.position.map(x=>x*.5);r.objectFrames.push({id:'foreground',name:'Occluder',type:'planet',index:2,position:mid,radius:1,velocity:[0,0,0]});f=capture();assert(!get(f).anchor&&!get(f).arrow,'hidden object emits no floating arrow');r.objectFrames.pop();
probe.position=[0,0,8];probe.velocity=[0,0,3];ui.update(capture());assert.match(layer.innerHTML,/away from viewer/);probe.velocity=[0,0,-3];ui.update(capture());assert.match(layer.innerHTML,/toward viewer/);
r.state.annotations=false;r.state.velocityArrows=false;ui.update(capture());assert.equal(layer.style.display,'none');ui.dispose();
// Hold the grid study's real start, one entire orbit, and repeated drops in
// both orientations. Orbit velocity must rotate without changing its magnitude.
for(const [width,height] of [[1280,790],[390,610],[320,480]])for(const sceneId of ['geometry-orbit','geometry-freefall','geometry-freefall-kerr']){
 const f=fixture({width,height}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false,deferProgram:true});
 r.loadScene(sceneId);r.sceneLoad=null;r.state.paused=false;r.lastTime=1000;
 document.createElementNS=()=>layer={style:{},setAttribute(){},remove(){}};
 const rect={width,height,left:0,top:0},rail={width:width<600?159:290,height:height<500?120:160,left:10,top:height-(height<500?167:230)};
 const overlay=installAnnotations({append(){},querySelector:id=>id==='#sceneMetrics'?{id:'sceneMetrics',getBoundingClientRect:()=>rail}:null,getBoundingClientRect:()=>rect},()=>r);
 const directions=new Set(),speeds=new Set(),orbit=sceneId==='geometry-orbit';
 for(let i=0;i<=240;i++){
  r.advanceSimulation(1000+i*100);r.fillHoles();r.fillObjects();r.updateCameraFrame();
  const frame=captureAnnotationFrame(r),b=frame.objectFrames.find(b=>b.locatorBead);
  assert(b.anchor,'every visible timestep continuously locates the tracer');overlay.update(frame);
  const html=layer.innerHTML;assert(html.includes('data-object-id="'+b.id+'"'),sceneId+' tracer label at '+width+' px, tick '+i);
  // Keep the study itself legible underneath its title boxes.
  const subjects=[...frame.objectFrames,...frame.holes].filter(o=>o.anchor);
  for(const match of html.matchAll(/<rect x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"/g)){
   const [x,y,w,h]=match.slice(1).map(Number);
   for(const o of subjects){const cx=width/2+o.anchor.x*height,cy=height/2-o.anchor.y*height,rad=(o.screenRadius||o.anchor.radius||0)*height;
    assert(x+w<=cx-rad||x>=cx+rad||y+h<=cy-rad||y>=cy+rad,'label must clear bead and central silhouette');}
  }
  if(orbit){assert(html.includes('data-velocity-arrow="'+b.id+'"'));directions.add(b.arrow.x.toFixed(1));speeds.add(b.velocityDetail);}
  else{assert.equal(b.velocityDetail,'0 m/s relative to grid');assert(!html.includes('data-velocity-arrow='));}
  if(sceneId==='geometry-freefall-kerr')assert(!html.includes('Lensed shadow'));
 }
 if(orbit){assert.equal(speeds.size,1);assert(directions.size>=10);}
 overlay.dispose();r.dispose();
}
console.log('PASS: frame-synchronized velocity glyphs, independent labels/toggle, zero-relative-speed tracer, visibility, projection and depth.');
