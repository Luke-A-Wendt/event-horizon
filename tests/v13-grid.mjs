import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer,cpuVisibleBodies,cpuRingOccluded,cpuBodyBasis} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {COORDINATE_GRID_GLSL} from '../dist/grid-glsl.js';
const f=fixture({width:640,height:400}),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
// Construct a far-away hierarchy directly; gallery removal must not weaken
// observer-relative grid precision coverage.
r.loadScene('solar-system');r.update({blackHole:true,mass:4.3,grid:true});const remoteSun=r.objects.find(o=>o.name==='Sun');assert(r.reparentObject(remoteSun.id,'primary'));r.updateObject(remoteSun.id,{radius:10000000});r.focusTarget(remoteSun.id,'track');r.render();
const world=f.uniforms.get('uWorldOrigin').args[0],local=f.uniforms.get('uObserver').args[0],anchor=f.uniforms.get('uGridAnchor').args,high=f.uniforms.get('uGridHigh').args[0];
assert(Math.hypot(...world)>100000,'Regression scenario is at astronomical world coordinates');
assert(Math.hypot(...local)<10,'Rendering uses small observer-relative coordinates');
assert(anchor.slice(0,2).every(v=>Math.abs(v)<=384),'Fine phase stays in a precision-safe small interval');
assert(high.every(v=>v%1024===0),'Coarse phase uses exact power-of-two cell chunks');
const basis=r.configCache.primaryBasis,phase=[basis[0],basis[2]].map(axis=>axis.reduce((v,x,i)=>v+x*world[i],0)/anchor[3]);
const mod=(v,b)=>((v%b)+b)%b;
for(const spacing of [.75,1.5,12,192,1536,12288])for(let i=0;i<2;i++){
 const resolved=mod(anchor[i]+mod(high[i],spacing/.75)*.75,spacing),expected=mod(phase[i],spacing);
 assert(Math.min(Math.abs(resolved-expected),spacing-Math.abs(resolved-expected))<.00001,'Local and coarse anchor preserve every dyadic LOD world phase');
}
assert(COORDINATE_GRID_GLSL.includes('gridRadialDelta(r,flow)'),'Far-field radial displacement uses the stable relative expression');
assert(!COORDINATE_GRID_GLSL.includes('pow(r*sqrt(r)+'),'No cancellation-prone large-radius reconstruction');
// CPU irregular-body axes must use the same sidereal/tidally-locked phase as
// the packed GPU material, including retrograde periods and generic spin.
r.loadScene('empty-space');const parityBody=r.addChildObject('space','moon',{surfaceId:2,axialTilt:23.4,surfaceRotationPhase:.37,phase:.71,shapeAxes:[1.3,.8,.96]});r.focusTarget(parityBody.id,'track');
for(const patch of [{rotationPeriodSeconds:86400,tidallyLocked:false},{rotationPeriodSeconds:-86400,tidallyLocked:false},{rotationPeriodSeconds:0,rotation:2,tidallyLocked:false},{rotationPeriodSeconds:86400,tidallyLocked:true}]){
 r.updateObject(parityBody.id,patch);r.time=123;r.render();const body=r.getFocusFrame(parityBody.id),cpuBasis=cpuBodyBasis(body,r.configCache.primaryBasis,r.time),params=f.uniforms.get('uBodyParams[0]').args[0],shape=f.uniforms.get('uBodyShape[0]').args[0],phase=params[body.index*4+1],tilt=shape[body.index*4+3],cp=Math.cos(phase),sp=Math.sin(phase),ct=Math.cos(tilt),st=Math.sin(tilt),primary=r.configCache.primaryBasis;
 const expected=[[cp,-st*sp,ct*sp],[0,ct,st],[-sp,-st*cp,ct*cp]].map(axis=>[0,1,2].map(i=>axis.reduce((n,v,j)=>n+v*primary[j][i],0)));
 for(let j=0;j<3;j++)for(let i=0;i<3;i++)assert(Math.abs(cpuBasis[j][i]-expected[j][i])<1e-6,'CPU and GPU body orientation remain equal for all rotation conventions');
}
r.dispose();
const camera={observer:[0,0,10],forward:[0,0,-1],right:[1,0,0],up:[0,1,0]},sphere={id:'earth',position:[0,0,0],radius:1};
assert(cpuRingOccluded([0,0,-2],sphere,camera.observer),'Rear ring hidden by planet');
assert(!cpuRingOccluded([0,0,2],sphere,camera.observer),'Front ring remains visible over planet');
assert(!cpuRingOccluded([2,0,-2],sphere,camera.observer),'Ring beyond silhouette stays visible');
assert.equal(cpuVisibleBodies([{id:'clear-ring',type:'ring',position:[0,0,0],radius:4,opacity:0}],camera,640,400).length,0,'Transparent annuli do not consume drawing budget');
const catalog=Array.from({length:1000},(_,i)=>({id:String(i),type:'moon',position:[0,0,0],radius:.01+i*.0001}));
catalog.push({id:'behind',type:'planet',position:[0,0,20],radius:1},{id:'tiny',type:'moon',position:[0,0,0],radius:1e-12},{id:'offscreen',type:'planet',position:[100,0,0],radius:1});
const visible=cpuVisibleBodies(catalog,camera,640,400,'0');assert.equal(visible.length,32);assert(visible.some(x=>x.id==='0'));assert(!visible.some(x=>['behind','tiny','offscreen'].includes(x.id)));
const c=new CpuCommandCanvas();c.getBoundingClientRect=f.canvas.getBoundingClientRect;const cpu=new CpuRenderer(c,{autoStart:false,bindControls:false});cpu.loadScene('empty-space');
const body=cpu.addChildObject('space','planet',{name:'Saturn',surfaceId:5,planetStyle:'gas',radiusMeters:58232000,shapeAxes:[1.03,.94,1.03]}),ring=cpu.addChildObject(body.id,'ring',{radiusMeters:140000000,innerRadiusRatio:.45,material:'icy'});assert(ring);cpu.focusTarget(body.id,'track');cpu.update({grid:true});
c.beginFrame();const stages=cpu.renderStages(1000,false,true);let last=0,max=0,step;do{step=stages.next();max=Math.max(max,c.commands.length-last);last=c.commands.length;}while(!step.done);
assert(step.value);assert(max<500);assert(c.commands.length<20000);assert(c.commands.some(x=>x[0]==='scale'),'Physical shape axes affect the projected outline');
cpu.dispose();console.log('PASS: camera-relative grid precision and dyadic world phase, catalog-size-independent CPU visibility, ring front/back occlusion, physical shape projection, CPU/GPU rotation parity, and bounded cooperative drawing.');
