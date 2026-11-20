import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {serializeScene,parseScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {EARTH_RADIUS,EARTH_MU,GEO_RADIUS,NETWORK_RADIUS,EARTH_DAY,ELEVATOR_PORTS,networkPort,networkPhase,transferOrbit,earthNetworkLayers,CIVIL_RINGS,civilRingPoint,ELEVATOR_SPIRE} from '../dist/kardashev-earth.js';
import {observedBodyMeasurements} from '../dist/body-measurements.js';
import {REFERENCE_RG_METERS} from '../dist/objects.js';
import {mapModel,renderOrbitMap} from '../dist/orbit-map.js';

assert(Math.abs((GEO_RADIUS-EARTH_RADIUS)/1000-35786)<1);
assert(NETWORK_RADIUS*.966>GEO_RADIUS);
assert.equal(ELEVATOR_PORTS.length,6);
assert.equal(CIVIL_RINGS.length,2);
assert(CIVIL_RINGS[1].radius-CIVIL_RINGS[1].depth>CIVIL_RINGS[0].radius);
assert(Math.acos(CIVIL_RINGS[1].normal[1])>Math.PI/3,'Guideways visibly cross at separate inclinations.');
for(let i=0;i<CIVIL_RINGS.length;i++){const ring=CIVIL_RINGS[i],p=civilRingPoint(i,1.27);assert(Math.abs(Math.hypot(...p)-ring.radius)<1e-12);assert(Math.abs(ring.normal.reduce((s,v,k)=>s+v*p[k],0))<1e-12);}
for(let i=1;i<ELEVATOR_SPIRE.length;i++){assert(ELEVATOR_SPIRE[i][0]>ELEVATOR_SPIRE[i-1][0]);assert(ELEVATOR_SPIRE[i][1]<ELEVATOR_SPIRE[i-1][1]);}
assert(ELEVATOR_SPIRE.at(-1)[1]/ELEVATOR_SPIRE[0][1]<.07);
const p=networkPort(0,networkPhase(EARTH_DAY/4));
assert(Math.abs(p.n[1])<1e-12&&Math.abs(Math.hypot(...p.n)-1)<1e-12);
for(let i=0;i<3;i++){
 const a=transferOrbit(i,0),period=2*Math.PI*Math.sqrt((a.r*EARTH_RADIUS)**3/EARTH_MU),b=transferOrbit(i,networkPhase(period/4));
 assert(a.r>1&&a.r<GEO_RADIUS/EARTH_RADIUS);
 const past=transferOrbit(i,networkPhase(EARTH_DAY-.01)),next=transferOrbit(i,networkPhase(EARTH_DAY+.01));
 assert(Math.hypot(...past.n.map((v,j)=>v-next.n[j]))<.00003,'A transfer station does not jump when the Earth finishes a turn.');
 assert(Math.abs(a.n.reduce((s,v,i)=>s+v*b.n[i],0))<1e-7,'Unattached stations advance by their own Keplerian period.');
}
for(const Renderer of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:480,height:320}),canvas=Renderer===CpuRenderer?new CpuCommandCanvas():f.canvas;
 if(Renderer===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Renderer(canvas,{autoStart:false,bindControls:false});r.loadScene('kardashev-1');r.fillHoles();r.fillObjects();r.updateCameraFrame();
 const earth=r.objects.find(o=>o.catalogId==='type-i-earth'),net=r.objects.find(o=>o.catalogId==='earth-elevator-network'),src=r.objects.find(o=>o.type==='star');
 assert.equal(net.parentId,earth.id);assert.equal(earth.surfaceId,1);assert.equal(r.focusId,earth.id);assert(src);
 assert.equal(observedBodyMeasurements(r).rows.find(row=>row.key==='scaleBenchmark').value,'10 PW');
 const frame=()=>r.getFocusFrame(net.id);
 const quarter=EARTH_DAY/4;r.time+=quarter/(18*REFERENCE_RG_METERS/299792458);r.fillObjects();r.updateCameraFrame();
 assert(Math.abs(frame().bodyParams[1]+Math.PI/2)<1e-8,'The tethers and ground terminals stay locked to the rotating atlas.');
 const m=mapModel(r,earth.id);assert(renderOrbitMap(m).svg.includes('map-elevators'));
 assert(earthNetworkLayers(frame(),r.cameraFrame.observer).length>400,'Software rendering includes distinct tethers, stations, the ring and surface grids.');
 r.focusTarget(net.id,'track',false,true);r.updateCameraFrame();assert(r.target.focusDistance<3,'Full-network camera frames the tips');
 assert.equal(observedBodyMeasurements(r).rows.find(row=>row.key==='transfers').value,'3');
 const saved=parseScene(serializeScene(r));restoreRenderer(r,saved);r.fillObjects();r.updateCameraFrame();assert.equal(frame().bodyParams[0],6);assert(Math.abs(frame().bodyParams[1]+Math.PI/2)<1e-8);
 if(Renderer===CpuRenderer){canvas.beginFrame();for(const _ of r.renderStages(1000,false,true)){}assert(canvas.takeFrame().commands.length>500);}
 r.dispose();
}
console.log('PASS: Earth atlas, co-rotating GEO elevators, independent transfer orbits, source lighting, CPU network, map and save/restore.');
