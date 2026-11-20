import assert from 'node:assert/strict';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {observedBodyMeasurements as observe} from '../dist/body-measurements.js';
import {REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {metricDistance,metricNumber} from '../dist/metric-units.js';
import {fixture} from './render-fixture.mjs';

const r=new BlackHoleRenderer(fixture().canvas,{autoStart:false,bindControls:false,deferProgram:true});
const rows=result=>Object.fromEntries(result.rows.map(row=>[row.key,row]));
const focus=id=>{assert(r.focusTarget(id,'track',true));r.fillObjects();r.updateCameraFrame();return rows(observe(r));};
try{
 r.loadScene('disk');r.fillObjects();r.updateCameraFrame();
 assert(!r.focusId);const primary=observe(r),bh=rows(primary);
 assert.equal(primary.id,'primary');assert.equal(primary.type,'blackhole');
 const frame=r.getFocusFrame('primary'),center=Math.hypot(...r.cameraFrame.observer)*RG,rh=frame.horizonRadius*RG;
 assert.equal(bh.gap.value,metricDistance(center-rh));
 assert.equal(bh.spinRate.value,metricNumber(frame.spinParameter*299792458/(2*rh))+' rad/s');
 const disk=focus('disk');
 assert(disk.radius&&disk.innerRadius&&disk.owner&&!disk.mass&&!disk.gap&&!disk.spinRate,'disk is not its owner hole');
 r.releaseFocus(false,false);r.setViewMode('free');r.updateCameraFrame();assert.equal(observe(r),null);
 r.loadScene('solar-system');
 const byName=n=>r.objects.find(o=>o.name===n);
 const earth=focus(byName('Earth').id),moon=focus(byName('Moon').id),sun=focus(byName('Sun').id);
 assert.equal(earth.orbitParent.value,'Sun');assert.equal(moon.orbitParent.value,'Earth');assert(!sun.orbitParent);
 assert.equal(earth.spinRate.value,'7.29×10⁻⁵ rad/s');assert.equal(earth.mass.value,'5.97×10²⁴ kg');
 assert.match(earth.orbitSpeed.value,/^29\.\d km\/s$/);
 assert.equal(sun.class.value,'Main sequence');assert.equal(sun.spinRate.value,metricNumber(2*Math.PI/(25.38*86400))+' rad/s');
 r.updateStellar(byName('Sun').id,{angularVelocity:1e-5});assert.equal(rows(observe(r)).spinRate.value,'1×10⁻⁵ rad/s','explicit stellar spin edit overrides catalog default');
 const unknown=focus(r.objects.find(o=>o.physicalRadiusKnown===false).id);
 assert.equal(unknown.radius.value,'Unknown');assert(!unknown.gap&&!unknown.mass);
 r.loadScene('dyson-garden');
 const shell=r.objects.find(o=>o.type==='dyson'),garden=focus(shell.id);
 assert.equal(garden.radius.value,'1 AU');assert.equal(garden.floorGravity.value,'1.0g');assert.equal(garden.spinPeriod.value,'9.0 d');
 r.updateObject(shell.id,{radiusMeters:4*149597870700});
 const larger=focus(shell.id);assert.equal(larger.radius.value,'4 AU');assert.equal(larger.floorGravity.value,'1.0g');assert.equal(larger.spinPeriod.value,'18 d');
 r.loadScene('collapse-cycle');assert.equal(r.focusId,null);
 const core=r.objects.find(o=>o.type==='star');
 for(const [t,type] of [[0,'star'],[core.collapsePeriod/2,'blackhole'],[core.collapsePeriod,'star']]){
  r.time=t;r.fillObjects();r.updateCameraFrame();
  const stage=observe(r);assert.equal(stage.id,core.id);assert.equal(stage.type,type);
  assert.equal(rows(stage).gap.label,type==='star'?'Surface gap':'Horizon gap');
 }
 const duplicate=r.addChildObject('space','planet',{x:0,y:0,z:0});
 r.releaseFocus(false,false);r.fillObjects();r.updateCameraFrame();
 assert(duplicate&&r.getFocusFrame(duplicate.id||duplicate));assert.equal(observe(r),null,'no guess among concentric bodies');
 r.loadScene('bridge');const wormhole=focus('bridge');assert.equal(wormhole.center.label,'Chart center range');
 const b=r.getFocusFrame('bridge').physicalRadius,d=r.cameraFrame.subjectRange;
 assert.equal(wormhole.gap.value,metricDistance(Math.abs(d-b*b/(4*d))*RG));
 for(const [id,local,chart,gap] of [
  ['geometry-orbit','43.1 Mm/s','24.9 Mm/s','200 km'],
  ['geometry-freefall','0 m/s','30.5 Mm/s','300 km'],
  ['geometry-freefall-kerr','0 m/s','151 Mm/s',null]
 ]){
  r.loadScene(id);const t=focus(r.objects.find(o=>o.type==='probe').id);
  assert.equal(t.gridSpeed.value,local);assert.equal(t.centerSpeed.value,chart);
  assert.equal(t.properAcceleration.value,'0.0g');
  if(gap)assert.equal(t.tracerGap.value,gap);
  assert.equal(t.radius.value,'150 m','locator enlargement must not alter the physical radius');
 }
 r.loadScene('geometry-orbit');
 const tracer=r.objects.find(o=>o.type==='probe');
 r.updateObject(tracer.id,{heightMeters:50000});const parallelCircle=focus(tracer.id);
 assert.equal(parallelCircle.properAcceleration.value,'Not modeled','a displaced circle is not a free geodesic');
 r.loadScene('geometry-freefall-kerr');r.update({spin:0});
 assert.equal(focus(r.objects.find(o=>o.type==='probe').id).properAcceleration.value,'0.0g','removing spin restores the spherical rain geodesic');
}finally{r.dispose();}

// A radial velocity is real speed, but contributes zero to orbital angular speed.
// Common parent drift must cancel when computing the observed relative velocity.
const parent={id:'sun',name:'Sun',position:[1000,0,0],velocity:[0,3,0]};
const planet={id:'p',name:'Ellipsoid',type:'planet',position:[1002,0,0],radius:2/RG,shapeAxes:[2,1,1],axialTilt:0,rotationPeriodSeconds:60,massSolar:.001,velocity:[1,3,0]};
const mock={state:{},time:0,focusId:'p',objects:[{...planet,parentId:'sun',placement:'orbit'}],getFocusFrame:id=>id==='p'?planet:parent,cameraFrame:{subjectRange:4/RG,eyeOffset:[0,4/RG,0]}};
assert.equal(rows(observe(mock)).gap.value,'3 m','radial clearance from short axis');
mock.cameraFrame.eyeOffset=[4/RG,0,0];assert.equal(rows(observe(mock)).gap.value,'2 m','radial clearance from long axis');
assert.equal(rows(observe(mock)).orbitRate.value,'0 rad/s');
planet.velocity=[0,4,0];assert.equal(rows(observe(mock)).orbitRate.value,metricNumber(299792458/(18*2*RG))+' rad/s');
mock.focusId=null;mock.state={blackHole:true,binary:true};assert.equal(observe(mock),null,'binary barycenter is not either hole');
console.log('PASS: camera ranges, Kerr horizon, proper throat distance, surface shape, spin, instantaneous relative orbit, proxy dimensions and focus fallback.');
