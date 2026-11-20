import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {fixture} from './render-fixture.mjs';
import {captureAnnotationFrame,formatDestinationDistance as format} from '../dist/annotations.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {configureAutopilot} from '../dist/autopilot.js';
import {bridgeProperRadius} from '../dist/bridge-math.js';

for(const [m,expected] of [[0,'0.0×10⁰ m'],[.01499,'1.5×10⁻² m'],[999.98,'1.0×10³ m'],[384400000,'3.8×10⁵ km'],[149597870700,'1.0 AU'],[9.4607304725808e15*4.25,'4.3 ly']]) assert.equal(format(m),expected);
function open(id){
 const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
 r.loadScene(id);r.sceneLoad=null;r.state.paused=false;r.state.annotations=true;
 const c=r.objects.find(o=>['shuttle','enterprise'].includes(o.type));r.selectedId=c.id;
 const bearing=()=>{r.fillHoles();r.fillObjects();r.updateCameraFrame();return captureAnnotationFrame(r).destinationBearing};
 const depart=()=>{for(let i=0;i<1200&&!r.transfer;i++)r.advanceChartStages(.1);assert(r.transfer?.active);return r.transfer};
 return {r,c,bearing,depart};
}
{
 const {r,c,bearing,depart}=open('enterprise-solar-tour');try{
  const start=bearing();assert.equal(start.name,'Sun');assert.equal(start.detail,'Orbit radius · '+format(c.orbitMeters));
  const t=depart(),ranges=[];
  for(let i=0;i<100;i++){
   if(i%20===0){
    const b=bearing();assert.equal(b.name,'Mercury');const target=r.getFocusFrame(b.id),ship=r.getFocusFrame(c.id);
    const d=Math.hypot(...target.position.map((x,k)=>x-ship.position[k]))*RG;
    assert.equal(b.detail,'Destination · '+format(d));ranges.push(d);
   }
   r.advanceChartStages(t.wallSeconds/100);
  }
  assert(ranges.every((x,k)=>!k||x<ranges[k-1]));const arrival=bearing();
  assert.equal(arrival.name,'Mercury');assert.equal(arrival.detail,'Orbit radius · '+format(c.orbitMeters));
  assert.notEqual(r.flightSequences[c.id].nodes[r.flightSequences[c.id].index].targetId,arrival.id,'Label remains at the occupied stop during its departure arc');
 }finally{r.dispose()}
}
{
 const {r,bearing,depart}=open('shuttle-proxima-direct');try{depart();assert.match(bearing().detail,/^Destination · 4\.2 ly$/)}finally{r.dispose()}
}
{
 const {r,c,bearing,depart}=open('bridge-nebulae');try{
  const b=bearing(),throat=r.configCache.bridgeRadius,ship=r.getFocusFrame(c.id);
  const proper=Math.abs(bridgeProperRadius(Math.hypot(...ship.position),throat)-bridgeProperRadius(Math.hypot(...b.position),throat))*RG;
  assert.equal(b.detail,'Destination · '+format(proper));const t=depart();for(let i=0;i<70;i++)r.advanceChartStages(t.wallSeconds/100);
  assert.equal(bearing().id,'bridge-far-world');assert.notEqual(bearing().detail,b.detail);
 }finally{r.dispose()}
}
{
 const {r,c,bearing}=open('bridge');try{
  r.state.bridgeSurfaces=true;r.refreshConfiguration();configureAutopilot(r,{id:'bridge'});
  const b=bearing(),orbit=r.getBridgeParkingOrbit(c.id);assert.equal(b.id,orbit.targetId);assert.equal(b.detail,'Orbit radius · '+format(orbit.localRadiusMeters));
 }finally{r.dispose()}
}
console.log('PASS: Live ship range, orbit radius, interstellar and bridge distances, and two significant figures across unit scales.');
