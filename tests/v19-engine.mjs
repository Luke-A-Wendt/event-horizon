import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {effectiveWarpRadius} from '../dist/warp-physics.js';
import {tidalShape} from '../dist/tidal-shape.js';
import {cpuRingOccluded,cpuBodyBasis} from '../dist/cpu-renderer.js';
import {WARP_FIELD_GLSL} from '../dist/warp-glsl.js';
import {SCENE_PRESETS} from '../dist/config.js';
const near=(a,b,e=1e-8)=>assert(Math.abs(a-b)<e,`${a} != ${b}`);
const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
r.loadScene('warp-lab');
let previous=0;
for(const warpFactor of [0,1,4,9,10]){
 r.update({warpFactor,paused:true});r.render();const body=r.getFocusFrame(r.warpObjectId),radius=f.uniforms.get('uWarpRadius').args[0];
 near(radius/body.radius,effectiveWarpRadius(warpFactor));assert(radius>previous);previous=radius;
 assert.deepEqual(r.annotationOptics.warp.center,body.position.map((v,i)=>v-r.annotationOptics.origin[i]));
}
near(effectiveWarpRadius(-5),effectiveWarpRadius(0));near(effectiveWarpRadius(100),effectiveWarpRadius(10));
assert.doesNotMatch(WARP_FIELD_GLSL,/\.18\*axial/,'No transverse bias may displace a center-directed ray');
assert.match(WARP_FIELD_GLSL,/\(\.24\+\.12\*mu\)\*radial/);
const identity=[[1,0,0],[0,1,0],[0,0,1]],shape=tidalShape([3,4,5],[0,0,0],identity,.85);
assert.deepEqual(shape.axes,[1,1,1]);near(shape.boundRatio,1.425);near(shape.waterCap.offsetRatio,.575);
r.loadScene('disk');const planet=r.addChildObject('primary','planet',{radius:9,height:.4,radiusMeters:6371000,tidalDeformation:.85,planetStyle:'ocean'});
for(const phase of [0,.7,2.4]){
 r.updateObject(planet.id,{phase});r.fillObjects();const body=r.getFocusFrame(planet.id),toward=body.position.map((v,i)=>r.holeData[i]-v),length=Math.hypot(...toward);
 near(dot(body.tidalBasis[0],toward)/length,1);assert.deepEqual(body.shapeAxes,[1,1,1]);near(body.radius/body.coreRadius,1.425);near(dot(body.waterCap.direction,toward)/length,1);
 assert.deepEqual(cpuBodyBasis(body,identity),body.tidalBasis);assert(body.radius>r.objectRadius(r.objects.find(o=>o.id===planet.id)));
}
const ellipsoid={position:[0,0,0],radius:2,shapeAxes:[2,.5,.5],tidalBasis:identity};
assert(cpuRingOccluded([1.5,0,-4],ellipsoid,[1.5,0,4]),'Elongated tip occludes');
assert(!cpuRingOccluded([0,1,-4],ellipsoid,[0,1,4]),'Empty volume outside narrow axis stays visible');
r.loadScene('prism-disc');assert.equal(r.state.viewMode,'free');near(r.camera.lookYaw,SCENE_PRESETS.find(p=>p.id==='prism-disc').camera.lookYaw);
r.loadScene('geometry-orbit');r.update({paused:false});const time=r.time;r.lastTime=1000;r.advanceSimulation(1100);
near(r.time-time,.1*r.state.speed*SCENE_PRESETS.find(p=>p.id==='geometry-orbit').simulationTimeScale,1e-12);
r.dispose();console.log('PASS: automatic warp growth and ship anchor, unbiased radial lens, spherical-core aligned water caps and CPU occlusion, preset free camera, and slowed scene clock.');
