import assert from 'node:assert/strict';
import {edgeOrbitName} from '../dist/playlist-ui.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {parseScene,serializeScene} from '../dist/scene-file.js';
import {restoreRenderer} from '../dist/render-state.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {captureParkedOrbit} from '../dist/orbit-path.js';
import {fixture} from './render-fixture.mjs';

const tau=2*Math.PI,make=()=>new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<tol*Math.max(1,Math.abs(b)),a+' vs '+b);
const r=make(),copy=make();
try{
 r.loadScene('shuttle-earth-moon-loop');r.sceneLoad=null;
 const ship=r.objects.find(o=>o.type==='shuttle'),seq=()=>r.getFlightSequence(ship.id),w0=seq().orbitWait;
 const set=nodes=>r.setFlightSequence(ship.id,nodes,{active:true,loop:false});
 const list=seq().nodes,change=(i,n)=>list.map((stop,j)=>i===j?{...stop,extraLaps:n,defaultExtraLaps:undefined}:stop);
 assert.deepEqual(list.map(n=>n.extraLaps),[0,0]);
 set(change(0,2));let w=seq().orbitWait;
 near(w.sweepRadians,w0.sweepRadians+2*tau);near(w.wallSeconds,15);
 near(w.durationSeconds/w0.durationSeconds,w.sweepRadians/w0.sweepRadians);
 r.state.paused=false;for(let i=0;i<70;i++)r.advanceChartStages(.1);
 w=seq().orbitWait;assert(w.unwrappedPhase<w.startPhase);
 const phase=w.unwrappedPhase,clock=ship.clock.properSeconds;
 const guide=captureParkedOrbit(r,ship.id);assert(guide.pathPoints.length<260);
 assert(Math.hypot(...guide.pathOffsets[0].map((x,i)=>x-guide.pathOffsets[guide.pathDistances.findIndex(d=>Math.abs(d-w.sweepRadians*guide.orbit.radius)<.001)][i]))<.001,'Repeated circle covers only one stroked turn before its tangent');
 near(guide.pathLengthMeters,w.sweepRadians*guide.orbit.radius+w.leg.length);
 set(change(0,1));w=seq().orbitWait;near(w.unwrappedPhase,phase);near(w.sweepRadians,w0.sweepRadians+tau);assert.equal(ship.clock.properSeconds,clock);
 while(!r.transfer&&seq().orbitWait)r.advanceChartStages(.04);
 assert(r.transfer);near(r.transfer.departureArcSeconds,w.durationSeconds);near(ship.clock.properSeconds-clock,w.durationSeconds*(1-w.arcFraction),1e-5);
 while(r.transfer)r.advanceChartStages(.1);r.advanceChartStages(.1);
 assert(seq().holding&&!seq().orbitWait); // the final stop keeps orbiting

 r.loadScene('nasa-shuttle');r.sceneLoad=null;
 const shuttle=r.objects.find(o=>o.type==='shuttle'),bh=r.getFlightSequence(shuttle.id);
 assert(bh.nodes.every(n=>n.targetId==='primary'));assert.deepEqual(bh.nodes.map(n=>n.extraLaps),[1,2,3,4]);
 const radii=bh.nodes.map(n=>n.radiusMeters),[outer,inner,disc,endpoint]=radii,GM=1.32712440018e20*r.parentMassSolar(shuttle);
 const returnWorkPerMetre=rad=>GM*(1/rad-1/outer)/(2*Math.sqrt((outer-rad)*(outer+rad)));
 near(GM/(outer**2+shuttle.routeParkingHeightMeters**2),9.80665);assert(inner<outer&&returnWorkPerMetre(inner)<=9.80665&&returnWorkPerMetre(inner-1.1)>9.80665);
 near(disc,r.getFocusFrame('disk').radius*RG);assert(inner>disc&&disc>endpoint,'Four descending orbits');
 assert.equal(shuttle.orbitMeters,outer);
 const names=radii.map(rad=>edgeOrbitName(r,shuttle,'primary',rad,radii));assert.deepEqual(names,['Field orbit','Return benchmark','Disc edge','Innermost stable stop']);
 assert.equal(edgeOrbitName(r,shuttle,'primary',disc*.9,[outer,disc*.9,endpoint]),'Custom orbit 2','Edited radii do not retain a misleading landmark name');
 const customized=bh.nodes.map((n,i)=>i<2?{...n,extraLaps:i===0?0:3,defaultExtraLaps:undefined}:n);
 r.setFlightSequence(shuttle.id,customized,{loop:true,active:true});
 const yaml=serializeScene(r),saved=parseScene(yaml);
 assert(yaml.includes('extraLaps: 0')&&yaml.includes('extraLaps: 3'));restoreRenderer(copy,saved);
 assert.deepEqual(copy.getFlightSequence(shuttle.id).nodes.map(n=>n.extraLaps),customized.map(n=>n.extraLaps));
 for(const n of [-1,.5,100]){const bad=customized.map((s,i)=>i===0?{...s,extraLaps:n}:s);assert(r.setFlightSequence(shuttle.id,bad).error);assert.throws(()=>parseScene(yaml.replace('extraLaps: 3','extraLaps: '+n)),/extraLaps/);}
 r.loadScene('shuttle-earth-moon-loop');const c=r.objects.find(o=>o.type==='shuttle'),one=r.getFlightSequence(c.id).nodes[0];
 const two=r.setFlightSequence(c.id,[one,{...one,radiusMeters:1.2*one.radiusMeters}],{loop:true,active:true});
 assert.deepEqual(two.nodes.map(n=>n.extraLaps),[1,1]); // previously automatic zero changes with the new concentric stop
 assert(r.setFlightSequence(c.id,[{...two.nodes[0],extraLaps:0},{...two.nodes[1],extraLaps:99}],{loop:true,active:true}));
 const solitary=r.setFlightSequence(c.id,[{...one,extraLaps:3}],{loop:true,active:true});assert(solitary.holding&&!solitary.orbitWait);
 console.log('PASS: per-stop whole laps add exact physical clock time, survive file/export, respect live edits, and keep tangent guides bounded.');
}finally{r.dispose();copy.dispose();}
