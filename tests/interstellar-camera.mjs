import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {cameraRelative} from '../dist/camera-framing.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {directProjection} from '../dist/optical-projection.js';
import {fixture} from './render-fixture.mjs';

// At the Galactic distance, two absolute doubles cannot resolve a chase
// camera a shuttle length away. GPU, annotations and silhouettes must agree.
const f=fixture({width:600,height:400});
const r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('shuttle-sgra-direct');r.sceneLoad=null;
r.render(1000);
const eye=r.cameraFrame,ship=r.getFocusFrame();
assert.equal(ship.type,'shuttle');
const craft=r.objects.find(o=>o.id===ship.id),earth=r.getFocusFrame(craft.parentId);
const earthDistance=Math.hypot(...ship.position.map((v,i)=>v-earth.position[i]))*REFERENCE_RG_METERS;
assert(Math.abs(earthDistance/craft.orbitMeters-1)<.005,'the home orbit stays at Earth instead of inheriting the remote disc height');
assert(eye.eyeOrigin&&eye.eyeOffset,'camera uses rebased coordinate frame at Earth');
const relative=cameraRelative(ship.position,eye);
const naive=ship.position.map((v,i)=>v-eye.observer[i]);
assert(Math.abs(relative[0]-naive[0])>ship.radius*.05,'fixture resolves loss of precision on the Galactic baseline');
const obs=f.uniforms.get('uObserver').args.flat();
assert.equal(obs.length,3);
assert(relative.every((v,i)=>Math.abs(v+obs[i])<1e-6*ship.radius),'shader and projected ship agree on the actual offset');
const p=directProjection(ship.position,eye,1.5,.83);
assert(p&&Math.abs(p.x)<.7&&Math.abs(p.y)<.7,'ship projects within the central viewport');
assert(r.renderObjects.some(o=>o.id===ship.id)&&r.renderObjects.some(o=>o.name==='Earth'),'both shuttle and orbital horizon survive packing');
// The radio observatory suppresses the reflected hull light and most stars. The
// cruise must submit an optical frame even after loading that observatory.
r.loadScene('sagittarius-a');
assert.equal(r.state.spectrum,'radio');
const diskKeys=['mass','spin','disk','diskStyle','diskColor','diskOuter','diskThickness','diskDensity'];
const referenceDisk=diskKeys.map(k=>r.state[k]);
r.loadScene('shuttle-sgra-direct');r.sceneLoad=null;
assert.deepEqual(diskKeys.map(k=>r.state[k]),referenceDisk,'the trip visits the same physical accretion disc');
r.state.paused=false;
for(let i=0;i<2000&&!(r.transfer?.distanceMeters>1e20&&r.transfer.progress>.23);i++)r.advanceChartStages(.05);
assert(r.transfer?.distanceMeters>1e20&&r.transfer.progress>.23,'sampling an actual interstellar burn');
r.fillHoles();r.fillObjects();r.updateCameraFrame();r.drawScene(r.cameraFrame);
assert.equal(f.uniforms.get('uSpectrum').args[0],0,'visible-light ship and stars during cruise');
assert(f.uniforms.get('uFlags2').args[0]===1&&f.uniforms.get('uInspectIndex').args[0]>=0,'star field and tracked ship are active');
r.dispose();
console.log('PASS: galactic-baseline tracking preserves the ship-scale camera offset in CPU and GPU frames.');
