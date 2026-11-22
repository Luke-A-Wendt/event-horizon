import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {formationPose} from '../dist/dyson-swarm.js';
import {TOROID_LANES,TOROID_ID,TOROID_SCALE,TOROID_MARKER_RADIUS,TOROID_COLLECTOR_RADIUS,TOROID_SUN_DISPLAY_RADIUS,toroidLayers} from '../dist/toroid-swarm.js';
import {observedBodyMeasurements} from '../dist/body-measurements.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {createFragment} from '../dist/shaders.js';

const mu=1.32712440018e20,units=18*RG/299792458;
const tau=2*Math.PI,dot=(a,b)=>a.reduce((s,x,k)=>s+x*b[k],0);
assert.equal(TOROID_LANES.reduce((s,l)=>s+l.count,0),1648);
let clearance=Infinity;
for(let i=0;i<TOROID_LANES.length;i++){
 const l=TOROID_LANES[i];
 const separation=Math.min(2*l.radius*Math.sin(Math.PI/l.count),i?l.radius-TOROID_LANES[i-1].radius:Infinity)*TOROID_SCALE;
 clearance=Math.min(clearance,separation-2*TOROID_COLLECTOR_RADIUS);
 assert(separation>2*TOROID_MARKER_RADIUS*TOROID_SCALE,'Even the enlarged glyph envelopes remain disjoint at every possible phase');
 for(const epoch of [0,.81,4.2,tau/l.rate,24,964.5]){
  const p=formationPose(l,i,epoch),radius=l.radius*TOROID_SCALE,omega=Math.sqrt(mu/radius**3),speed=omega*radius;
  assert(Math.abs(Math.hypot(...p.radial)-1)<1e-12&&Math.abs(dot(p.radial,p.n))<1e-12);
  assert(Math.abs(dot(p.radial,p.along))<1e-12&&Math.abs(Math.hypot(...p.along)-1)<1e-12);
  assert(Math.abs(speed**2/radius-mu/radius**2)<1e-12,'Newtonian centripetal acceleration');
  assert(Math.abs(speed**2/2-mu/radius+mu/(2*radius))<1e-6,'Bound circular orbit');
  const next=formationPose(l,i,epoch+tau/l.rate);
  assert(Math.hypot(...p.radial.map((x,k)=>x-next.radial[k]))<5e-13,'Each member completes its own orbit');
 }
}
assert(clearance/1000>3900000);
for(const C of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:390,height:700}),canvas=C===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(C===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new C(canvas,{autoStart:false,bindControls:false});r.loadScene('toroid-swarm');r.fillHoles();r.fillObjects();r.updateCameraFrame();
 const belt=r.objects.find(o=>o.catalogId===TOROID_ID),star=r.objects.find(o=>o.type==='star'),frame=()=>r.getFocusFrame(belt.id),sun=()=>r.getFocusFrame(star.id);
 assert.equal(belt.parentId,star.id);assert.equal(frame().bodyParams[0],8);
 assert.equal(sun().physicalRadius,star.radiusMeters/RG);assert.equal(sun().radius,TOROID_SUN_DISPLAY_RADIUS/RG);
 const before=toroidLayers(frame(),r.cameraFrame.observer);assert.equal(before.length,1648);
 const seconds=816480;r.time+=seconds/units;r.fillObjects();const after=toroidLayers(frame(),r.cameraFrame.observer);
 const sample=arr=>arr[0].position.map((x,k)=>(x-frame().position[k])*RG/(TOROID_LANES[0].radius*TOROID_SCALE));
 assert(Math.abs(Math.acos(dot(sample(before),sample(after)))-seconds*Math.sqrt(mu/(TOROID_LANES[0].radius*TOROID_SCALE)**3))<1e-9);
 const stats=observedBodyMeasurements(r);assert.equal(stats.rows.find(row=>row.key==='formations').value,'1648');
 const s=parseScene(serializeScene(r));restoreRenderer(r,s);r.fillObjects();assert.deepEqual(toroidLayers(frame(),[0,0,0]).map(a=>a.position),after.map(a=>a.position));
 for(const id of [star.id,belt.id]){
  assert(r.focusTarget(id,'track',false,true));r.fillObjects();r.updateCameraFrame();
  assert.equal(sun().radius,(id===star.id?star.radiusMeters:TOROID_SUN_DISPLAY_RADIUS)/RG,'Paused camera handoff restores the requested scale');
 }
 if(C===CpuRenderer){canvas.beginFrame();for(const _ of r.renderStages(1000,false,true)){}const packet=canvas.takeFrame();assert(packet.commands.length>1648&&packet.commands.length<20000);}
 else{assert(createFragment(r.shaderFeatures()).includes('vec4 toroidHit'));r.loadScene('dyson-swarm');assert(!createFragment(r.shaderFeatures()).includes('vec4 toroidHit'),'existing scenes keep their original shaders');}
 r.dispose();
}
console.log('PASS: 1648 collectors on 16 bound nonintersecting circular lanes, periods, actual and enlarged clearance, marker scaling, saved phases, CPU rendering and GPU scene isolation.');
