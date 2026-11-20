import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {SCENE_PRESETS,makePreset} from '../dist/config.js';
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const scenes=SCENE_PRESETS.filter(scene=>scene.category==='Geometry');
assert.equal(SCENE_PRESETS.length,47);assert(!SCENE_PRESETS.some(s=>s.id==='mixed-pair'));
assert(scenes.some(s=>s.id==='white-hole'));assert(scenes.some(s=>s.id==='merger'));assert(scenes.some(s=>s.id==='mixed-merger'));
assert.match(SCENE_PRESETS.find(s=>s.id==='mixed-pair-geometry').title,/orbit/);
assert.match(SCENE_PRESETS.find(s=>s.id==='mixed-merger').title,/inspiral/);
assert.equal(makePreset('grid-binary').binaryRatio,1);assert.equal(makePreset('grid-binary').spin,makePreset('grid-binary').secondarySpin);
assert.equal(makePreset('grid-binary').primaryTilt,makePreset('grid-binary').secondaryTilt);
for(const [width,height] of [[1440,900],[900,650],[390,740],[360,640],[740,340]]){
 const r=new BlackHoleRenderer(fixture({width,height}).canvas,{autoStart:false,bindControls:false});
 const top=height<420?90:Math.min(170,height*.28),bottom=height<420?88:Math.min(150,height*.25),side=width<500?32:48;
 const check=point=>{const frame=r.cameraFrame,q=point.map((v,i)=>v-frame.observer[i]),depth=dot(q,frame.forward),fov=.83*Math.max(1,1.35/(width/height));assert(depth>0);const x=width/2+dot(q,frame.right)*height/(depth*fov),y=height/2-dot(q,frame.up)*height/(depth*fov);assert(x>side&&x<width-side&&y>top&&y<height-bottom,`${r.sceneId} ${width}×${height}: ${x}, ${y} overlaps a HUD reserve`);};
 for(const scene of scenes){
  r.loadScene(scene.id);near(r.camera.pitch,Math.PI/2-.001);assert.equal(r.state.paused,true);assert(r.validateFrameGeometry());
  for(let step=0;step<=40;step++){
   const traveler=r.objects.find(o=>o.type==='probe');r.time=traveler?step/40*2*Math.PI/r.orbitalOmega(traveler):step*1.5;
   r.fillHoles();r.fillObjects();r.updateCameraFrame();
   if(traveler)check(r.getFocusFrame(traveler.id).position);
   if(r.state.blackHole)for(let body=0;body<(r.state.binary?2:1);body++){
    const center=Array.from(r.holeData.slice(body*4,body*4+3)),shadow=5.2*r.holeData[body*4+3];
    for(let edge=0;edge<16;edge++){const angle=edge/16*2*Math.PI;check([center[0]+Math.cos(angle)*shadow,center[1],center[2]+Math.sin(angle)*shadow]);}
   }
  }
  r.rotate(.2,-.3);r.camera={...r.target};r.resetCamera();near(r.camera.pitch,Math.PI/2-.001);
 }
 r.dispose();
}
const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false});r.loadScene('radiant-descent');const traveler=r.objects[0],stop=r.configCache.horizon[0]+15/REFERENCE_RG_METERS;
let previousDistance=Infinity,previousSpeed=0;
for(let step=0;step<=100;step++){
 r.time=step/10;r.fillObjects();r.updateCameraFrame();const body=r.getFocusFrame(traveler.id),distance=Math.hypot(...body.position),speed=r.getObjectClock(traveler.id).speedMetersPerSecond;
 assert(distance<=previousDistance+1e-8);assert(speed>=previousSpeed-1e-8);assert(distance>=stop-1e-9);previousDistance=distance;previousSpeed=speed;
 const toward=body.position.map(v=>-v/distance);assert(dot(body.frame[2],toward)>.999999,'Default ride faces the hole throughout descent');
 if(step===0)assert(distance>=180*r.massScale*(1-1e-12));
 if(step===50)assert(distance>stop&&distance<180*r.massScale,'Still descending at half playback time');
}
near(previousDistance,stop,1e-10);assert(previousSpeed>0,'freeze on the incoming velocity');
r.time=30;r.fillObjects();near(Math.hypot(...r.getFocusFrame(traveler.id).position),stop,1e-10);
assert.equal(SCENE_PRESETS.find(s=>s.id==='radiant-descent').title,'Falling into blue fire');
assert.equal(SCENE_PRESETS.find(s=>s.id==='horizon-watch').title,'Looking out from the edge');
assert.equal(SCENE_PRESETS.find(s=>s.id==='shuttle-space').title,'Driving in open space');r.dispose();
console.log('PASS: responsive top-down Geometry framing through full circuits/mergers, equal binary, explicit orbit/inspiral distinction, paused/reset views and monotone 10-second blue-fire exterior approach.');
