import assert from 'node:assert/strict';
import fs from 'node:fs';
import {effectiveWarpRadius} from '../dist/warp-physics.js';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {SCENE_PRESETS} from '../dist/config.js';
import {integratePlanar,speedForWarp,warpForSpeed} from '../dist/flight-dynamics.js';
import {captureAnnotationFrame,installAnnotations} from '../dist/annotations.js';
import {createOpticalContext,projectLensedPoint,traceProjection} from '../dist/optical-projection.js';
import {DiagnosticFramePresenter} from '../dist/frame-presentation.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {mapModel,renderOrbitMap} from '../dist/orbit-map.js';
const f=fixture(),r=new BlackHoleRenderer(f.canvas,{autoStart:false,bindControls:false});
for(const preset of SCENE_PRESETS){r.loadScene(preset.id);assert.equal(r.state.annotations,preset.category==='Geometry');assert.equal(r.state.metrics,false);assert(!('gridMode' in r.state));assert(parseScene(serializeScene(r)));if(preset.category==='Wormholes'&&!['blackhole','whitehole'].includes(preset.patch.bridgeTravelerType))assert.equal(r.focusMode,'chase');}
for(const id of ['solar-system-blackhole','bridge-chase','grid-earth-sun'])assert(!SCENE_PRESETS.some(p=>p.id===id));
r.loadScene('warp-cruise');r.fillObjects();r.updateCameraFrame();r.setDrawUniforms();const strength=f.uniforms.get('uWarpStrength').args[0],radius=f.uniforms.get('uWarpRadius').args[0];r.setFreeDrive(r.warpObjectId,true);r.setDrawUniforms();assert.equal(f.uniforms.get('uWarpStrength').args[0],strength);assert.equal(f.uniforms.get('uWarpRadius').args[0],radius,'Taking control preserves the current bubble radius');assert(Math.abs(r.getFlightState().warpFactor-4)<1e-10);
const p={position:[0,0,0],basis:[[1,0,0],[0,1,0],[0,0,1]],speed:speedForWarp(4),curvature:0,torsion:0,angularVelocity:0};
for(let i=0;i<100;i++)integratePlanar(p,.01,{speed:1,curvature:1,torsion:1},{warp:true});assert(Math.abs(warpForSpeed(p.speed)-4.45)<1e-9);assert(Math.abs(p.angularVelocity-.16)<1e-9);assert.equal(p.position[1],0);assert.equal(p.torsion,0);const omega=p.angularVelocity;integratePlanar(p,.1,{}, {warp:true});assert.equal(p.angularVelocity,omega);
r.update({warpFactor:4});r.setDrawUniforms();const sharpness=f.uniforms.get('uWarpThickness').args[0],radiusAt4=f.uniforms.get('uWarpRadius').args[0];r.update({warpFactor:8});r.setDrawUniforms();assert(f.uniforms.get('uWarpThickness').args[0]>sharpness);assert(f.uniforms.get('uWarpRadius').args[0]>radiusAt4,'Increasing warp factor automatically enlarges the bubble');assert(Math.abs(f.uniforms.get('uWarpRadius').args[0]/radiusAt4-effectiveWarpRadius(8)/effectiveWarpRadius(4))<1e-10);
r.objects.find(o=>o.id===r.driveId).flight.angularVelocity=.2;assert.equal(parseScene(serializeScene(r)).objects.find(o=>o.flight).flight.angularVelocity,.2);
// The optical inverse solves the rendered ray, rather than placing a marker at
// the unbent coordinate projection. Infinite deadline here makes this deterministic.
r.loadScene('geometry');r.update({annotations:true,metrics:true});r.render();const context=createOpticalContext(r);context.budget.deadline=Infinity;context.budget.maxIterations=100000;context.budget.maxRays=1000;const target=[5,2,-20],anchor=projectLensedPoint(context,target,{radius:.3});assert(anchor,'A visible lensed target resolves');const trace=traceProjection(context,anchor,target);assert(trace&&!trace.blocked);assert(Math.hypot(...trace.point.map((v,i)=>v-target[i]))<.1);
const exhausted=createOpticalContext(r);exhausted.budget.maxRays=0;assert.equal(projectLensedPoint(exhausted,target,{radius:.3}),null);assert(exhausted.budget.limited);
r.loadScene('solar-system');r.update({annotations:false,metrics:false});assert.equal(captureAnnotationFrame(r).projection.rays,0,'Weak-field picking uses no ray integration');const model=mapModel(r,r.objects.find(o=>o.name==='Sun').id),map=renderOrbitMap(model);assert(!/NaN|Infinity/.test(map.svg));assert(map.svg.includes('r="6.00"')||map.svg.includes('r="6"'));
// Image-plane label spline and only velocity/spin arrows, at the supplied
// lensed center. Rendering must not consult a newer camera.
let layer;globalThis.document={createElementNS(){return layer={style:{},setAttribute(){},innerHTML:'',remove(){}};}};
const ui=installAnnotations({append(){},getBoundingClientRect:()=>({width:900,height:650})},()=>{throw Error('Newer camera read');});
const payload={kind:'annotation-frame',annotations:true,metrics:true,cameraFrame:{observer:[0,0,10],forward:[0,0,-1],right:[1,0,0],up:[0,1,0]},objectFrames:[{id:'test',type:'planet',name:'Planet <A>',radius:1,anchor:{x:.1,y:.1,z:10},screenRadius:.04,metricArrows:[{kind:'velocity',color:'#70deb1',x:.2,y:.1},{kind:'spin',color:'#b19af0',x:.1,y:.2}]}],holes:[],projection:{aspect:900/650,fov:.83},cpu:false};ui.update(payload);assert(layer.innerHTML.includes('Planet &lt;A&gt;'));assert(!layer.innerHTML.includes('data-metric-arrow='),'Raw vectors belong to the curved ray shader');assert(!layer.innerHTML.includes('data-metric-arrow="radius"'));assert(/C[\d.-]+/.test(layer.innerHTML));assert(!layer.innerHTML.includes('data-horizon-guide'));ui.setStatus({renderBusy:true});assert.equal(layer.style.display,'block');ui.dispose();
let installed=false,closed=0;globalThis.document={createElement(){return{style:{},setAttribute(){},getContext(){return{transferFromImageBitmap(){installed=true;}}},remove(){}}}};const presenter=new DiagnosticFramePresenter({after(){}}),bitmap={width:900,height:650,close(){closed++;}};assert(presenter.present(bitmap,1,()=>assert(installed)));assert(!presenter.present(bitmap,1,()=>assert.fail('Stale bitmap')));assert.equal(closed,2);presenter.hide();assert(!presenter.active);presenter.dispose();
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');assert(html.indexOf('id="objectType"')<html.indexOf('id="addObject"'));assert(!html.includes('id="gridMode"'));for(const label of ['Radio','Gamma'])assert(html.includes('>'+label+'</button>'));assert(!fs.readFileSync(new URL('../dist/pilot-ui.js',import.meta.url),'utf8').includes('data-pilot-key="KeyQ"'));
r.dispose();console.log('PASS: 45 scene/default/YAML contracts; planar throttle/turns; automatic warp radius and inherited field; bounded inverse optical anchors; synchronized bitmap/vector locators; equal map markers and streamlined UI.');
