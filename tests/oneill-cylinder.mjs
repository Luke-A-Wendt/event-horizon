import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer,snapshotRenderer} from '../dist/render-state.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {observedBodyMeasurements} from '../dist/body-measurements.js';
import {CYLINDER_BOUND,CYLINDER_HALF,CYLINDER_DECK,CYLINDER_OMEGA,CYLINDER_EYE,cylinderPixel} from '../dist/oneill-cylinder.js';

const eps=(x,y)=>assert(Math.abs(x-y)<Math.max(1e-9,Math.abs(y)*1e-7),x+' vs '+y);
eps(CYLINDER_BOUND*CYLINDER_DECK*CYLINDER_OMEGA**2,9.80665);
assert(cylinderPixel([0,0,-2],[0,0,1],0),'axial endcap closes the exterior');
assert.equal(cylinderPixel([0,2,-2],[0,0,1],0),null,'space beyond the hull remains visible');
for(let ix=-3;ix<=3;ix++)for(let iy=-3;iy<=3;iy++)for(let iz=-3;iz<=3;iz++){
 if(!ix&&!iy&&!iz)continue;
 const len=Math.hypot(ix,iy,iz);assert(cylinderPixel(CYLINDER_EYE,[ix/len,iy/len,iz/len],.4),'all interior sightlines end inside the vessel');
}
for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:640,height:422}),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false});
 r.loadScene('oneill-cylinder');r.fillHoles();r.fillObjects();r.updateCameraFrame();
 assert.equal(r.objects.length,1);const o=r.objects[0];assert.equal(o.type,'cylinder');assert.equal(r.state.blackHole,false);
 assert.equal(r.focusId,o.id);assert.equal(r.focusMode,'onboard');
 const frame=()=>r.getFocusFrame(o.id);eps(frame().radius*REFERENCE_RG_METERS,CYLINDER_BOUND);
 const eye=()=>r.cameraFrame.observer.map((v,i)=>(v-frame().position[i])/frame().radius);
 assert(Math.hypot(...eye().slice(0,2))<CYLINDER_DECK&&Math.abs(eye()[2])<CYLINDER_HALF);
 assert.equal(r.cameraFrame.hideIndex,-1,'onboard view keeps the uncut enclosure');
 const m=observedBodyMeasurements(r);assert(m.rows.some(x=>x.key==='bays'&&x.value==='6'));assert(m.rows.some(x=>x.key==='period'&&x.value==='28.4 min'));
 assert.equal(frame().bodyParams[1],0);
 r.updateObject(o.id,{dysonCutaway:.60});r.fillObjects();eps(frame().bodyParams[1],.60);
 assert.notEqual(cylinderPixel([-1,.1,.16],[1,0,0],0,.60),cylinderPixel([-1,.1,.16],[1,0,0],0));
 restoreRenderer(r,parseScene(serializeScene(r)));r.fillObjects();eps(frame().bodyParams[1],.60);
 r.updateObject(o.id,{dysonCutaway:0});
 const t=30;r.time=t*299792458/(18*REFERENCE_RG_METERS);r.fillObjects();r.updateCameraFrame();eps(frame().bodyParams[0],t*CYLINDER_OMEGA);
 const phase=frame().bodyParams[0];restoreRenderer(r,parseScene(serializeScene(r)));r.fillObjects();r.updateCameraFrame();
 eps(frame().bodyParams[0],phase);assert.equal(r.focusMode,'onboard');
 if(Renderer===CpuRenderer){canvas.beginFrame();for(const _ of r.renderStages(1000,false,true)){}assert(canvas.takeFrame().commands.filter(x=>x[0]==='fillRect').length>40,'CPU draws the inhabited interior');}
 // The optical camera moves behind the viewed point; every zoom step has
 // an inverse even with a rotated view on the moving survey deck.
 r.rotate(.24,-.10);
 let now=1000;r.now=()=>now;
 const settle=()=>{for(let i=0;i<100;i++){now+=60;r.advanceSimulation(now);}r.updateCameraFrame();};
 const pose=()=>[...r.cameraFrame.inspectCamera,...r.cameraFrame.inspectForward,...r.cameraFrame.inspectUp];
 const matches=expected=>pose().forEach((v,i)=>eps(v,expected[i]));
 settle();const fromDeck=pose();
 r.zoom(1.25);settle();const outside=pose();assert(Math.hypot(...r.cameraFrame.inspectCamera)>1,'pull back beyond the hull');
 for(let i=0;i<3;i++)eps(outside[i],fromDeck[i]-.25*fromDeck[3+i]);
 for(let i=3;i<9;i++)eps(outside[i],fromDeck[i]);
 assert.equal(r.focusMode,'onboard');
 const savedZoom=parseScene(serializeScene(r));
 r.zoom(.8);settle();matches(fromDeck);
 restoreRenderer(r,savedZoom);r.updateCameraFrame();matches(outside);
 restoreRenderer(r,snapshotRenderer(r));r.zoom(.8);settle();matches(fromDeck);
 r.zoom(.1);settle();matches(fromDeck);
 r.focusTarget(o.id,'track',false,true);r.updateCameraFrame();assert(Math.hypot(...eye())>1,'exterior orbit clears endcaps and sidewall');
 r.zoom(.01);settle();assert.equal(r.focusMode,'onboard','zoom through the near limit of a saved exterior Track view');assert(Math.hypot(...eye())<1);
 r.dispose();
}
console.log('PASS: O’Neill cylinder spin, pressure enclosure, exterior orbit, interior GPU/CPU frames, restored spin, and HUD.');

const rig=fixture({width:390,height:700}),r=new BlackHoleRenderer(rig.canvas,{autoStart:false});
r.loadScene('oneill-cylinder');r.rotate(-.27,.11);
let clock=1000;r.now=()=>clock;
const settle=()=>{for(let i=0;i<100;i++){clock+=60;r.advanceSimulation(clock);}r.updateCameraFrame();};
const pose=()=>[...r.cameraFrame.inspectCamera,...r.cameraFrame.inspectForward,...r.cameraFrame.inspectUp];
settle();const initial=pose();
const compare=()=>pose().forEach((v,i)=>eps(v,initial[i]));
for(const [kind,away,back] of [['wheel',{deltaY:100},{deltaY:-100}],['keydown',{key:'-'},{key:'+'}]]){
 rig.canvas.emit(kind,away);settle();assert(Math.hypot(...r.cameraFrame.inspectCamera)>1);
 rig.canvas.emit(kind,back);settle();compare();
}
const touch=(name,id,x)=>rig.canvas.emit(name,{pointerId:id,pointerType:'touch',button:0,clientX:x,clientY:200});
touch('pointerdown',1,10);touch('pointerdown',2,210);touch('pointermove',2,110);settle();
assert(Math.hypot(...r.cameraFrame.inspectCamera)>1);
touch('pointermove',2,210);touch('pointerup',1,10);touch('pointerup',2,210);settle();compare();
r.dispose();
console.log('PASS: wheel, pinch, keyboard, desktop controls and saved GPU/CPU views retrace the O’Neill survey deck.');
