import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {warpSideFraming,apparentCaptureAngle} from '../dist/camera-framing.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0),near=(a,b,e=1e-10)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
for(const [width,height] of [[1440,806],[900,556],[390,740],[360,520],[667,281]]){
 const fixtureData=fixture({width,height}),r=new BlackHoleRenderer(fixtureData.canvas,{autoStart:false,bindControls:false});
 const check=()=>{
  assert.equal(r.state.viewMode,'orbit');assert.equal(r.focusMode,'track');assert.equal(r.cameraGuide,'warp-side');near(r.camera.yaw,-Math.PI/2);near(r.camera.pitch,0);near(r.camera.lookYaw,0);near(r.camera.lookPitch,0);
  const body=r.getFocusFrame(),frame=r.cameraFrame,q=body.position.map((v,i)=>v-frame.observer[i]),depth=dot(q,frame.forward),fit=warpSideFraming(width,height,r.state.warpFactor,{enabled:r.state.warp&&r.focusId===r.warpObjectId,driving:!!r.driveId});
  near(dot(q,frame.right)/depth,0,1e-6);near(dot(q,frame.up)/depth,0,1e-6);assert(dot(body.frame[2],frame.right)>.999999,'The Enterprise points left to right, not toward or away from the viewer');
  // Exact projected bound of a sphere includes the tangent on its near face.
  const radius=fit.radius*body.radius,pixels=height/fit.fov*radius/Math.sqrt(depth*depth-radius*radius);
  assert(pixels<=fit.pixels+1e-5,'Current bubble fits the clear viewport area');near(r.camera.focusDistance,fit.distance,1e-6);
  assert(r.validateFrameGeometry());
 };
 for(const preset of SCENE_PRESETS.filter(s=>s.category==='Warp drive')){
  r.loadScene(preset.id);assert.equal(r.state.warpFactor,4);check();
  const id=r.focusId;r.focusTarget('primary','track');r.setFreeDrive(id,true);r.focusTarget(id,'track',false,true);check();r.setFreeDrive(id,false);
  r.rotate(.2,.1);assert.equal(r.cameraGuide,'warp-side');r.camera={...r.target};r.updateCameraFrame();r.resetCamera();check();
 }
 for(const preset of SCENE_PRESETS.filter(s=>s.category==='Wormholes'&&s.patch.bridgeTravelerType!=='blackhole')){
  r.loadScene(preset.id);assert.equal(r.focusMode,'chase');const body=r.getFocusFrame(),eye=r.cameraFrame.inspectCamera;assert(eye[2]<0&&eye[1]>0);const q=eye.map(x=>-x),depth=dot(q,r.cameraFrame.inspectForward);const y=.5-dot(q,r.cameraFrame.inspectUp)/(depth*warpSideFraming(width,height).fov);assert(y>.5&&y<.65,'Chase keeps the ship below center but clear of bottom controls, with the throat ahead');near(dot(q,r.cameraFrame.inspectRight)/depth,0);
  assert(r.setFreeDrive(body.id,true));r.focusTarget(body.id,'track',false,true);check();r.setFreeDrive(body.id,false);
 }
 r.dispose();
}
const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:true});r.loadScene('radiant-descent');
let lastAngle=0;
for(let step=0;step<=100;step++){
 r.time=step/10;r.fillObjects();r.updateCameraFrame();const frame=r.cameraFrame,delta=[0,0,0].map((v,i)=>v-frame.observer[i]),distance=Math.hypot(...delta),toward=delta.map(v=>v/distance),angle=Math.acos(Math.max(-1,Math.min(1,dot(toward,frame.forward))));
 assert(angle>=lastAngle-1e-9,'Guide turns smoothly toward the apparent edge as the observer approaches');lastAngle=angle;near(angle,apparentCaptureAngle(distance,r.massScale),1e-7);assert(dot(toward,frame.right)<0,'Center of the shadow remains to the left of the aimed right edge');assert(r.validateFrameGeometry());
}
const before=[...r.cameraFrame.forward];f.canvas.emit('pointerdown',{pointerType:'touch',pointerId:1,clientX:100,clientY:100,button:0});assert.equal(r.cameraGuide,'blue-fire-edge');f.canvas.emit('pointermove',{pointerId:1,clientX:115,clientY:100});assert.equal(r.cameraGuide,null);r.camera={...r.target};r.updateCameraFrame();assert(dot(before,r.cameraFrame.forward)<.9999);f.canvas.emit('pointerup',{pointerId:1});
r.resetCamera();assert.equal(r.cameraGuide,'blue-fire-edge');const snapshot=snapshotRenderer(r);r.look('outward');assert.equal(r.cameraGuide,null);restoreRenderer(r,snapshot);assert.equal(r.cameraGuide,'blue-fire-edge');assert.equal(parseScene(serializeScene(r)).cameraGuide,'blue-fire-edge');
r.zoom(1.1);assert.equal(r.cameraGuide,null);assert.equal(r.focusMode,'track');r.resetCamera();r.setViewMode('free');assert.equal(r.cameraGuide,null);r.resetCamera();assert.equal(r.cameraGuide,'blue-fire-edge');
r.dispose();
console.log('PASS: exact side / left-to-right Enterprise defaults and Drive; current wall fitted clear of mobile/desktop HUD; centered bridge Chase→side Drive; smooth right apparent-edge guide, manual override, reset and scene/worker persistence. Geometric projection and input tests, not browser/device benchmarks.');
// CPU fallback: the same guide must retain the shadow when its coordinate
// center is behind the view. Solve a bounded cone mask, not a per-pixel march.
const {captureSpans}=await import('../dist/cpu-shadow.js');
const {CpuRenderer}=await import('../dist/cpu-renderer.js');
const {CpuCommandCanvas}=await import('../dist/cpu-commands.js');
const cf=fixture({width:360,height:640}),cc=new CpuCommandCanvas();cc.getBoundingClientRect=cf.canvas.getBoundingClientRect;
const cpu=new CpuRenderer(cc,{autoStart:false,bindControls:false});cpu.loadScene('radiant-descent');cpu.time=10;cpu.fillObjects();cpu.updateCameraFrame();
assert(cpu.cameraFrame.forward.reduce((n,v,i)=>n+v*-cpu.cameraFrame.observer[i],0)<0,'Coordinate center is behind the guided near-horizon camera');
for(const mode of ['guided','manual']){
 if(mode==='manual'){cpu.rotate(.15,.08);cpu.camera={...cpu.target};cpu.updateCameraFrame();assert.equal(cpu.cameraGuide,null);}
 cc.beginFrame();let yields=0,previous=0,maxCommands=0;for(const _ of cpu.holeStages(0)){yields++;maxCommands=Math.max(maxCommands,cc.commands.length-previous);previous=cc.commands.length;}
 const frame=cc.takeFrame();assert(yields>=16&&maxCommands<500,'CPU shadow construction cooperatively yields in bounded strips');assert(frame.commands.some(c=>c[0]==='fill'));assert(frame.commands.filter(c=>c[0]==='lineTo').length>100,'Near-field shadow remains painted after manual view override');
 const v=cpu.cameraFrame,delta=v.observer.map(x=>-x),length=Math.hypot(...delta),toward=delta.map(x=>x/length),direction=[dot(toward,v.right),dot(toward,v.up),dot(toward,v.forward)],cosine=Math.cos(apparentCaptureAngle(length,cpu.massScale));
 const width=cc.width,height=cc.height,pixels=height/(.83*Math.max(1,1.35/(width/height)));
 for(let y=11;y<height;y+=23)for(let x=9;x<width;x+=19){const ray=[(x-width/2)/pixels,(height/2-y)/pixels,1],expected=dot(ray,direction)>=cosine*Math.hypot(...ray),actual=captureSpans(direction,cosine,width,height,y).some(([lo,hi])=>x>=lo&&x<=hi);assert.equal(actual,expected,'Mask spans match the full analytical cone in screen space');}
}
cpu.dispose();console.log('PASS: CPU near-field shadow remains visible behind the coordinate center, including manual override; analytical mask pixels agree with capture-cone membership and geometry yields stay bounded.');
