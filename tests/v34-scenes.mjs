import assert from 'node:assert/strict';
import {SCENE_PRESETS,makePreset} from '../dist/config.js';
import {bridgeJourney,bridgePath,HEIGHLINER_PASSAGE} from '../dist/bridge-math.js';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {CpuRenderer} from '../dist/cpu-renderer.js';
import {CpuCommandCanvas} from '../dist/cpu-commands.js';
import {fixture} from './render-fixture.mjs';
const arrival=7+Math.PI/.12,closed=arrival+5,leg=closed+5,endpoint=HEIGHLINER_PASSAGE.endpoint/HEIGHLINER_PASSAGE.throatRadius;
const journey=t=>bridgeJourney(t,1,'open-transit-close');
const near=(a,b,eps=1e-9)=>assert(Math.abs(a-b)<eps,`${a} != ${b}`);
for(const t of [0,2,4,7,12,20,arrival,closed,closed+1,closed+4]){
 const a=journey(t),b=journey(t+leg),c=journey(t+2*leg);
 near(a.l,-b.l);near(a.open,b.open);near(a.l,c.l);near(a.open,c.open);
 assert(Number.isFinite(a.r)&&a.r>0);assert(a.open>=0&&a.open<=1);
 if(a.open<1)near(Math.abs(a.l),endpoint);
}
for(const seam of [closed,closed+3,leg,2*leg]){
 const a=journey(seam-1e-5),b=journey(seam+1e-5);near(a.l,b.l,1e-7);near(a.open,b.open,1e-7);
 near(Math.cos(a.headingAngle),Math.cos(b.headingAngle),1e-7);near(Math.sin(a.headingAngle),Math.sin(b.headingAngle),1e-7);
}
assert(journey(leg+18).phase.includes('Caladan'));assert(journey(18).phase.includes('Arakas'));
for(const t of [0,6,19,40,80]){const a=bridgeJourney(t,1,'steady'),b=bridgePath(t,1);near(a.l,b.l);assert.equal(a.inward,b.inward);assert.equal(a.open,1);}
for(const Cls of [BlackHoleRenderer,CpuRenderer]){
 const f=fixture({width:390,height:720}),canvas=Cls===CpuRenderer?new CpuCommandCanvas():f.canvas;if(Cls===CpuRenderer)canvas.getBoundingClientRect=f.canvas.getBoundingClientRect;
 const r=new Cls(canvas,{autoStart:false,bindControls:false});
 for(const id of ['warp-excursion','warp-orbit','collapse-cycle','lens-alignment']){r.loadScene('geometry');r.loadScene(id);assert.equal(r.state.grid,false,id);assert.equal(r.state.warpGrid,false,id);assert.equal(makePreset(id).grid,false,id);}
 r.loadScene('bridge-planets');
 for(const t of [0,4,20,closed+1,leg+4,leg+20,2*leg]){r.time=t;r.bridgeTime=t;r.bridgeTravelTime=t;r.fillObjects();r.updateCameraFrame();assert(r.validateFrameGeometry());const craft=r.getFocusFrame();assert.equal(craft.type,'heighliner');const expected=bridgeJourney(t,r.configCache.bridgeRadius,r.state.bridgeLifecycle);near(Math.hypot(...craft.position),expected.r,1e-7);assert.equal(r.getState().bridgePhase,expected.phase);for(const axis of craft.frame)near(Math.hypot(...axis),1);}
 r.dispose();
}
const cluster=SCENE_PRESETS.find(s=>s.id==='horizon-hierarchy');assert.equal(cluster.title,'Black hole cluster');assert.equal(cluster.heading,cluster.title);assert(!cluster.patch.jets);assert(!cluster.objects.some(o=>o.type==='jets'));assert(cluster.objects.filter(o=>o.type==='disk').every(o=>o.diskStyle==='thermal'));
const mains=cluster.objects.filter(o=>o.type==='blackhole'&&o.parentId==='primary');assert.equal(mains.length,6);assert(Math.max(...mains.map(o=>o.massSolar))/Math.min(...mains.map(o=>o.massSolar))<1.11);assert.equal(cluster.objects.filter(o=>o.type==='blackhole').length,18);
console.log('PASS: symmetric repeated gate journeys with smooth closed-gate turns, unchanged steady bridges, valid mobile CPU/GPU camera geometry, four deterministic grid-off defaults,19-hole thermal cluster.');
