import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {cameraRelative} from '../dist/camera-framing.js';
import {fixture} from './render-fixture.mjs';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),angle=(a,b)=>Math.acos(Math.min(1,Math.max(-1,dot(a,b))));
const r=new BlackHoleRenderer(fixture({width:960,height:632}).canvas,{autoStart:false,bindControls:false,deferProgram:true});
let now=1000;r.now=()=>now;r.loadScene('earth-mars-station-ferry');r.sceneLoad=null;r.state.paused=false;r.lastTime=now;r.scenePreview=false;r.setQuality('high');r.resize();
const sizes={},reached=new Set();let previous=null,lastPhase,checkedRelease=false;
for(let i=0;i<12000&&!checkedRelease;i++){
 r.advanceSimulation(now+=1000/15);r.fillObjects();r.updateCameraFrame();
 const m=r.dockingMission,c=r.cameraFrame,parent=r.getFocusFrame(r.getFocusFrame(m.stationId).parentId);
 if(m.phase==='transit'){
  const q=cameraRelative(parent.position,c),range=Math.hypot(...q),R=range/parent.radius;
  if(R>3&&R<150&&m.wallElapsed>10&&m.viewSeconds-m.wallElapsed>8){
   assert(dot(q,c.forward)/range>.95,'Default camera keeps '+parent.name+' in view during the retroburn');
   assert(parent.index>=0,'Resolvable planet enters the actual draw packet');
   (sizes[parent.id]??=new Set()).add(Math.floor(Math.log2(R)));
  }
 }
 if(previous&&(lastPhase==='transit'||m.phase==='transit')){
  for(const a of ['forward','right','up'])assert(angle(previous[a],c[a])<.18,'Ferry camera rotates continuously through '+m.phase);
 }
 if(lastPhase==='transit'&&m.phase!=='transit')reached.add(parent.id);
 if(reached.size===2){
  assert(Object.values(sizes).length===2&&Object.values(sizes).every(s=>s.size>=5),'See both planetary discs grow through a range of angular sizes');
  r.rotate(.01,0);r.updateCameraFrame();assert.equal(r.cameraGuide,null);
  for(const a of ['forward','right','up'])assert(angle(c[a],r.cameraFrame[a])<1e-5,'Releasing the camera preserves its last rendered pose');
  checkedRelease=true;
 }
 previous=c;lastPhase=m.phase;
}
assert(checkedRelease);r.dispose();
console.log('PASS: the outbound and return retroburns keep the local planet in view; the camera eases to docking and releases to orbit controls without a cut.');
