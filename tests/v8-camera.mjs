import assert from 'node:assert/strict';
import { fixture } from './render-fixture.mjs';
import { BlackHoleRenderer } from '../dist/renderer.js';
import { inverse4, multiply4, composeEyeFrame } from '../dist/xr-view.js';
import { REFERENCE_RG_METERS } from '../dist/objects.js';
const close=(a,b,t=1e-9)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
const nearVector=(a,b,t=1e-9)=>a.forEach((x,i)=>close(x,b[i],t));
const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const f=fixture(),r=new BlackHoleRenderer(f.canvas);r.update({paused:true});r.render();
// Free flight starts at the current observer, including from a physical-scale craft.
const craft=r.addObject('enterprise',14,.8,1);r.focusObject(craft.id,'track');r.look('tangent');r.render();
const start={...r.cameraFrame,observer:[...r.cameraFrame.observer],forward:[...r.cameraFrame.forward]};
r.setViewMode('free');assert.equal(r.focusId,null);nearVector(r.cameraFrame.observer,start.observer);nearVector(r.cameraFrame.forward,start.forward);
const p=[...r.freeTarget];r.moveForward(1e-7);nearVector(r.freeTarget.map((x,i)=>x-p[i]),start.forward.map(x=>x*1e-7));
r.target.lookYaw=1.2;r.camera.lookYaw=1.2;r.target.lookPitch=.4;r.camera.lookPitch=.4;r.updateCameraFrame();const heading=[...r.cameraFrame.forward],old=[...r.freeTarget];r.zoom(.5);assert(r.freeTarget.some((v,i)=>v!==old[i]));close(r.target.lookYaw,1.2);close(r.target.lookPitch,.4);
const delta=r.freeTarget.map((x,i)=>x-old[i]),length=Math.hypot(...delta);nearVector(delta.map(x=>x/length),heading,1e-7);
const savedFree={position:[...r.freePosition],target:[...r.freeTarget],basis:structuredClone(r.freeBasis),camera:{...r.camera}};
r.focusObject(craft.id,'onboard');r.releaseFocus();assert.equal(r.state.viewMode,'free');assert.deepEqual(r.freePosition,savedFree.position);assert.deepEqual(r.freeTarget,savedFree.target);assert.deepEqual(r.camera,savedFree.camera);
// Touch pinch in free mode translates and does not reset heading.
r.navigationUntil=0;f.canvas.emit('pointerdown',{pointerType:'touch',button:0,pointerId:1,clientX:0,clientY:0});f.canvas.emit('pointerdown',{pointerType:'touch',button:0,pointerId:2,clientX:100,clientY:0});f.canvas.emit('pointermove',{pointerId:2,clientX:130,clientY:0});close(r.target.lookYaw,1.2);close(r.target.lookPitch,.4);f.canvas.emit('pointerup',{pointerId:1});f.canvas.emit('pointerup',{pointerId:2});
// All physical scene components can be tracked or ridden independently.
r.update({planet:true,tidalStar:true,binary:true});r.render();assert.deepEqual(r.getSceneTargets().slice(0,4).map(o=>o.id),['primary','secondary','planet','tidalStar']);
for(const id of ['primary','secondary','planet','tidalStar'])for(const mode of ['track','onboard']){assert(r.focusTarget(id,mode));r.render();assert.equal(r.focusId,id);assert.equal(r.focusMode,mode);assert(r.cameraFrame.observer.every(Number.isFinite));assert(r.cameraFrame.forward.every(Number.isFinite));if(id==='primary'||id==='secondary'){assert.equal(r.cameraFrame.inspectIndex,-1);const hole=r.getFocusFrame();assert(Math.hypot(...r.cameraFrame.observer.map((x,i)=>x-hole.position[i]))>hole.radius);}}
r.focusTarget('planet');r.update({planet:false});assert.equal(r.focusId,null);assert.equal(r.focusTarget('missing'),false);
// Reset restores scene composition's default camera, without resetting dynamics or edits.
r.loadScene('orbital-expedition');r.time=32;r.update({exposure:1.7});const id=r.objects[0].id;r.focusObject(r.objects[2].id,'onboard');r.setViewMode('free');r.moveForward(.00001);r.resetCamera();assert.equal(r.time,32);assert.equal(r.state.exposure,1.7);assert.equal(r.focusId,id);assert.equal(r.focusMode,'track');close(r.camera.focusDistance,4.8);close(r.camera.yaw,-1.1);
r.loadScene('geometry');r.setViewMode('free');r.resetCamera();assert.equal(r.state.viewMode,'orbit');assert.equal(r.focusId,null);close(r.camera.distance/r.massScale,28);close(r.camera.pitch,.65);
// Still snapshots cannot drift with live arrays and preserve render state.
r.update({paused:false});const quality=r.quality,beforeTime=r.time;r.setPresentationPaused(true);const snap=r.beginPhotoCapture();assert.equal(r.photoActive,true);assert.equal(snap.features.ultra,true);assert.equal(snap.time,beforeTime);const objects=snap.uniforms.find(u=>u.name==='uObjects[0]').args[0];r.objectData.fill(111);assert.notEqual(objects[0],111);r.frame(10000);close(r.time,beforeTime);r.endPhotoCapture();assert.equal(r.quality,quality);assert.equal(r.state.paused,false);assert.equal(r.presentationPaused,true);r.setPresentationPaused(false);
// Switching to the bridge is atomic and leaves a usable camera even at capacity.
r.loadScene('disk');const retained=r.addObject('probe',10,.3,1);r.time=9;r.update({bridge:true});r.render();assert.equal(r.state.bridge,true);assert.equal(r.state.blackHole,false);assert.equal(r.state.whiteHole,false);assert.equal(r.state.warp,false);assert(r.objects.some(o=>o.id===retained.id));assert.equal(r.getState().bridgeObjectId,r.bridgeObjectId);assert.equal(r.focusId,r.bridgeObjectId);assert(Math.hypot(...r.cameraFrame.observer)<r.configCache.bridgeRadius*12);close(r.time,9);
r.time=15;r.render();const bridgePosition=[...r.objectFrames.find(o=>o.id===r.bridgeObjectId).position];r.update({bridgeTravel:false});r.time=20;r.render();nearVector(r.objectFrames.find(o=>o.id===r.bridgeObjectId).position,bridgePosition,1e-20);r.update({bridgeTravel:true});r.time=21;r.render();assert.notDeepEqual(r.objectFrames.find(o=>o.id===r.bridgeObjectId).position,bridgePosition);
r.update({blackHole:true});r.render();assert.equal(r.state.bridge,false);assert.equal(r.bridgeObjectId,null);assert.equal(r.state.blackHole,true);assert.equal(r.focusId,null);assert(r.camera.distance>=r.minDistance);assert(Math.hypot(...r.cameraFrame.observer)>r.configCache.horizon[0]);
r.update({bridge:true});r.update({warp:true});r.render();assert.equal(r.state.bridge,false);assert.equal(r.state.warp,true);assert.equal(r.focusId,r.warpObjectId);assert.equal(r.state.blackHole,false);
r.update({bridge:true});const bridgeShip=r.bridgeObjectId;r.removeObject(bridgeShip);r.render();assert.equal(r.state.bridge,true);assert.equal(r.focusId,'bridge');assert(r.getSceneTargets().some(t=>t.id==='bridge'&&!t.canBoard));assert.equal(r.focusTarget('bridge','onboard'),false);assert(Math.hypot(...r.cameraFrame.observer)<r.configCache.bridgeRadius*10);r.clearObjects();r.render();assert.equal(r.focusId,'bridge');assert.equal(r.objects.length,0);assert.equal(r.bridgeObjectId,null);
r.update({bridge:false});r.loadScene('disk');for(let i=0;i<10;i++)r.addObject('probe',12,i);r.update({bridge:true});r.render();assert.equal(r.objects.length,10);assert.equal(r.bridgeObjectId,null);assert.equal(r.focusId,'bridge');r.resetCamera();assert.equal(r.focusId,'bridge');
r.update({binary:true});r.render();assert.equal(r.state.bridge,false);assert.equal(r.state.blackHole,true);assert.equal(r.state.binary,true);assert(r.cameraFrame.observer.every(Number.isFinite));
r.loadScene('geometry');
// Projection inversion retains asymmetric frusta and shear (not a fixed-FOV stereo trick).
const projection=[1.4,0,0,0,.03,1.6,0,0,.17,-.09,-1.0002,-1,0,0,-.040004,0];nearVector(multiply4(projection,inverse4(projection)),identity,1e-10);
const base={observer:[1e7,0,0],right:[1,0,0],up:[0,1,0],forward:[0,0,-1],inspectCamera:[0,.2,6],inspectRight:[1,0,0],inspectUp:[0,1,0],inspectForward:[0,0,-1],inspectIndex:0,hideIndex:-1};
const focus={radius:150/REFERENCE_RG_METERS,frame:[[1,0,0],[0,1,0],[0,0,1]]};
const left=identity.slice(),right=identity.slice();left[12]=-.032;right[12]=.032;
const l=composeEyeFrame(base,left,1/REFERENCE_RG_METERS,focus),rr=composeEyeFrame(base,right,1/REFERENCE_RG_METERS,focus);
close((rr.inspectCamera[0]-l.inspectCamera[0])*150,.064,1e-10);assert.equal(l.observer[0],rr.observer[0],'At huge coordinates world floats collapse; inspect offsets must still retain stereo');
assert.notEqual(l.inspectCamera[0],rr.inspectCamera[0]);
// WebXR lifecycle: feature detection, one draw per provided eye viewport, cleanup.
const previousNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),previousLayer=globalThis.XRWebGLLayer;
let callback,ended=false,requested=0;
const events=new Map(),session={visibilityState:'visible',renderState:{},addEventListener:(n,fn)=>events.set(n,fn),removeEventListener:n=>events.delete(n),requestReferenceSpace:async()=>({}),updateRenderState(v){this.renderState={...this.renderState,...v};},requestAnimationFrame(fn){callback=fn;return 1;},async end(){ended=true;events.get('end')?.();}};
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{xr:{isSessionSupported:async()=>true,requestSession:async(mode)=>{requested++;assert.equal(mode,'immersive-vr');return session;}}}});
globalThis.XRWebGLLayer=class{constructor(_session,_gl,{framebufferScaleFactor}){this.framebufferWidth=1600*framebufferScaleFactor;this.framebufferHeight=800*framebufferScaleFactor;this.framebuffer={};}getViewport(view){return {x:view.eye==='left'?0:480,y:0,width:480,height:480};}};
assert.equal((await r.getVRSupport()).supported,true);await r.enterVR();assert.equal(requested,1);assert.equal(r.getState().vrActive,true);assert.throws(()=>r.beginPhotoCapture(),/outside VR/);
const views=[{eye:'left',transform:{matrix:left},projectionMatrix:projection},{eye:'right',transform:{matrix:right},projectionMatrix:projection}];const before=f.draws;callback(12000,{getViewerPose:()=>({transform:{matrix:identity},views})});assert.equal(f.draws,before+2);assert.equal(f.uniforms.get('uProjectionMode').args[0],1);assert.deepEqual(f.uniforms.get('uRayViewport').args,[480,0,480,480]);assert.deepEqual(f.uniforms.get('uInverseProjection').args[1],inverse4(projection));
await r.exitVR();assert(ended);assert.equal(r.getState().vrActive,false);assert.equal(r.photoActive,false);assert.equal(r.quality,quality);
// A headset closing during asynchronous setup must never receive a late layer update.
let finishCompatibility;const raceEvents=new Map();let lateLayers=0;
const raceSession={...session,renderState:{},addEventListener:(n,fn)=>raceEvents.set(n,fn),removeEventListener:n=>raceEvents.delete(n),updateRenderState(){lateLayers++;},async end(){raceEvents.get('end')?.();}};
navigator.xr.requestSession=async()=>raceSession;f.gl.makeXRCompatible=()=>new Promise(resolve=>{finishCompatibility=resolve;});
const entering=r.enterVR();await Promise.resolve();await Promise.resolve();raceEvents.get('end')?.();finishCompatibility();await assert.rejects(entering,/closed before setup/);assert.equal(lateLayers,0);assert.equal(r.getState().vrActive,false);
// A runtime headset failure ends VR and resumes the ordinary animation loop.
f.gl.makeXRCompatible=async()=>{};let failCallback;const failureEvents=new Map();const failureSession={...session,renderState:{},addEventListener:(n,fn)=>failureEvents.set(n,fn),removeEventListener:n=>failureEvents.delete(n),requestAnimationFrame(fn){failCallback=fn;},async end(){failureEvents.get('end')?.();}};
navigator.xr.requestSession=async()=>failureSession;await r.enterVR();failCallback(14000,{getViewerPose(){throw new Error('Headset disconnected');}});await Promise.resolve();assert.equal(r.getState().vrActive,false);assert.match(r.getState().vrError,/Headset disconnected/);assert(r.raf);
if(previousNavigator)Object.defineProperty(globalThis,'navigator',previousNavigator);else delete globalThis.navigator;if(previousLayer)globalThis.XRWebGLLayer=previousLayer;else delete globalThis.XRWebGLLayer;
r.dispose();console.log('PASS: free-flight heading/translation/pinch, component cameras, scene reset, immutable photo snapshot, asymmetric stereo projection, physical IPD precision, WebXR lifecycle (mock hardware).');
