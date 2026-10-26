import assert from 'node:assert/strict';
import {effectiveWarpRadius} from '../dist/warp-physics.js';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {DEFAULTS,SCENE_PRESETS} from '../dist/config.js';
import {snapshotRenderer,restoreRenderer} from '../dist/render-state.js';
import {composeEyeFrame} from '../dist/xr-view.js';
import {REFERENCE_RG_METERS,objectRadiusMeters} from '../dist/objects.js';

const bands=['visible','infrared','xray','radio','gamma'];
assert.equal(SCENE_PRESETS.length,45);
assert.equal(new Set(SCENE_PRESETS.map(scene=>scene.id)).size,45);
for(const [id,band] of [['radio-observatory','radio'],['gamma-engine','gamma']]){
 const scene=SCENE_PRESETS.find(scene=>scene.id===id);
 assert.equal(scene.patch.spectrum,band);assert.equal(scene.patch.jets,true);
 assert.match(scene.description,/illustrative|false-color/);
}
for(const webgl2 of [false,true]){
 const errors=[],f=fixture({webgl2}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,onError:message=>{if(message)errors.push(message);}});
 for(const scene of SCENE_PRESETS){
  r.loadScene(scene.id);
  for(const time of [0,45,240]){
   r.time=time;r.fillHoles();r.fillObjects();r.updateCameraFrame();
   assert(r.validateFrameGeometry(),`${scene.id} has finite physical geometry at ${time}`);
  }
  for(const [index,spectrum] of bands.entries()){
   r.update({spectrum});r.render();r.render();
   assert.equal(r.state.spectrum,spectrum,`${scene.id} accepts ${spectrum}`);
   assert.equal(f.uniforms.get('uSpectrum').args[0],index);
   for(const [name,uniform] of f.uniforms)for(const value of uniform.args.flat(Infinity)){
    if(typeof value==='number')assert(Number.isFinite(value),`${scene.id}: ${name} contains a finite value`);
   }
  }
 }
 assert.deepEqual(errors,[]);
 r.loadScene('disk');assert.deepEqual(r.state,{...DEFAULTS,warpRadius:effectiveWarpRadius(DEFAULTS.warpFactor),paused:true,objectScaleMode:'physical'});
 r.dispose();
}

const errors=[],f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,onError:message=>{if(message)errors.push(message);}});
r.loadScene('orbital-expedition');r.render();
for(const body of r.objects)assert.equal(r.objectRadius(body)*REFERENCE_RG_METERS,objectRadiusMeters(body.type,body.scale),'Physical dimensions are not enlarged to hide precision problems');
const image=r.beginPhotoCapture();r.endPhotoCapture();assert(image.uniforms.every(uniform=>uniform.args.flat(Infinity).every(value=>typeof value!=='number'||Number.isFinite(value))));
const saved=snapshotRenderer(r),f2=fixture(),copy=new BlackHoleRenderer(f2.canvas,{autoStart:false});
restoreRenderer(copy,saved);assert(copy.validateFrameGeometry());assert.deepEqual(copy.cameraFrame,r.cameraFrame);
const eye=composeEyeFrame(r.cameraFrame,[1,0,0,0,0,1,0,0,0,0,1,0,.032,0,0,1],1/REFERENCE_RG_METERS,r.getFocusFrame());
assert(r.validateFrameGeometry(eye),'Physical stereo eye offsets preserve a valid local camera');

const draws=f.draws;r.camera.lookYaw=NaN;
assert.equal(r.render(),false);assert.equal(f.draws,draws);assert.match(errors.at(-1),/camera orientation/);
const count=errors.length;r.render();assert.equal(errors.length,count,'An invalid frame reports one error rather than spamming the host');
assert.throws(()=>r.beginPhotoCapture(),/camera orientation/);assert.equal(r.photoActive,false,'Invalid still capture never pauses the live renderer');
r.resetCamera();assert(r.render());assert.equal(r.geometryError,'');
r.objectFrames[0].radius=-1;assert.equal(r.validateFrameGeometry(),false);assert.match(errors.at(-1),/object dimensions/);
r.fillObjects();r.objectData[0]=Infinity;assert.equal(r.validateFrameGeometry(),false);assert.match(errors.at(-1),/object coordinates/);
r.loadScene('disk');r.update({stars:false,nebula:false,disk:false,grid:false,jets:false});assert(r.render(),'A genuinely dark view is not a load failure');
r.configCache.diskOuter[0]=NaN;assert.equal(r.render(),false);assert.match(errors.at(-1),/gravitational geometry/);
r.loadScene('gamma-engine');r.update({mass:NaN,spin:Infinity,jetSpread:NaN});assert(r.render(),'Public edits sanitize invalid numeric values');
r.dispose();copy.dispose();
console.log('PASS: 44 scene presets, all five spectral indices on both WebGL contracts, finite dynamics and uniforms, physical sizes, snapshot/photo/VR compatibility, and safe invalid-frame rejection.');
