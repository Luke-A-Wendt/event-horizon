import assert from 'node:assert/strict';
import {SCENE_PRESETS} from '../dist/config.js';
import {BRIDGE_WORLD_LAYOUT,bridgeWorldSphere,bridgeGLSL} from '../dist/bridge-glsl.js';
import {bridgePath,bridgeConformal} from '../dist/bridge-math.js';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';

const scene=SCENE_PRESETS.find(s=>s.id==='bridge-planets');
assert.equal(scene.title,'Caladan to Arakas');assert.equal(scene.heading,scene.title);
assert.equal(scene.camera.mode,'chase');assert.equal(scene.patch.bridgeSurfaces,true);
assert.match(scene.description,/blue-green/);assert.match(scene.description,/orange desert/);
const near=(a,b)=>assert(Math.abs(a-b)<1e-10*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const {distance,radius}=BRIDGE_WORLD_LAYOUT;
for(const b of [.2,1,8,100]){
 const source=bridgeWorldSphere(false,b),destination=bridgeWorldSphere(true,b);
 assert(source.center[2]-source.radius>b*.5,'Departure planet lies wholly outside throat');
 assert(destination.center[2]+destination.radius<b*.5,'Arrival planet lies wholly in the second chart');
 // Inversion maps the entire finite sphere, not just its center or a sky disc.
 for(let i=0;i<128;i++){
  const z=1-2*(i+.5)/128,a=i*2.39996323,rho=Math.sqrt(1-z*z),point=[radius*rho*Math.cos(a)*b,radius*rho*Math.sin(a)*b,(distance+radius*z)*b],scale=b*b/(4*point.reduce((sum,v)=>sum+v*v,0)),inverted=point.map(v=>v*scale);
  near(Math.hypot(...inverted.map((v,j)=>v-destination.center[j])),destination.radius);
 }
 // Automatic travel stays clear of both bodies and reaches nearly flat ends.
 for(let i=0;i<=200;i++){
  const path=bridgePath(i/200*Math.PI/.12,b),r=path.r;
  assert(r<source.center[2]-source.radius);
  assert(r>destination.center[2]+destination.radius);
 }
 const start=bridgePath(0,b),end=bridgePath(Math.PI/.12,b),otherRadius=b*b/(4*end.r);
 assert(bridgeConformal(start.r,b)<1.007);assert(bridgeConformal(otherRadius,b)<1.007);
 assert(distance*b-radius*b-start.r>5.9*b);assert(distance*b-radius*b-otherRadius>5.9*b);
 // The existing Drive inner-chart clamp maps to10b on the far side.
 assert(distance-radius-10>=2,'Manual traversal has room past the flat-space endpoint');
}
const source=bridgeGLSL();assert.match(source,/for\(int end=0;end<2;end\+\+\)/);assert.match(source,/planetFraction<fraction/);assert(!source.includes('angular<radius'),'No sky-painted destination disc');
for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:360,height:520}),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false});r.loadScene('bridge-planets');
 assert.equal(r.focusMode,'chase');assert.equal(r.getFocusFrame().type,'enterprise');
 assert(r.bridgeTime===0);assert(r.getFocusFrame().position[2]>r.configCache.bridgeRadius/2,'Starts on Caladan side');
 for(const time of [0,Math.PI/2/.12,Math.PI/.12,Math.PI*2/.12])for(const spectrum of ['visible','infrared','xray','radio','gamma','geometry']){
  r.time=time;r.update({spectrum});r.fillObjects();r.updateCameraFrame();assert(r.validateFrameGeometry());
  if(Renderer===CpuRenderer){canvas.beginFrame();for(const _ of r.paintStages()){} }
 }
 r.dispose();
}
console.log('PASS: finite Caladan/Arakas worlds, exact inverted sphere geometry, full-route clearance and asymptotic endpoints, departure order, Chase camera, CPU/GPU frame validity in all bands.');
