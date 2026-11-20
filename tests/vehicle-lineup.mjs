import assert from 'node:assert/strict';
import {fixture} from './render-fixture.mjs';
import {BlackHoleRenderer} from '../dist/renderer.js';
import {DRIVABLE_HULLS,isDriveCraft,hullType,OBJECT_KIND,OBJECT_DIMENSIONS,objectRadiusMeters,REFERENCE_RG_METERS as RG} from '../dist/objects.js';
import {createOpticalContext,directProjection} from '../dist/optical-projection.js';
import {thumbnailLocators} from '../scripts/thumbnail-locators.mjs';
import {serializeScene,parseScene} from '../dist/scene-file.js';

const models=DRIVABLE_HULLS.map(h=>h.model);
assert.equal(new Set(models).size,5);
for(const [width,height] of [[1600,800],[640,422],[320,650],[812,375]]){
 const r=new BlackHoleRenderer(fixture({width,height}).canvas,{autoStart:false,bindControls:false});
 try{
  r.loadScene('shuttle-space');assert(r.state.paused&&r.state.annotations);
  assert(!r.focusId&&!r.selectedId&&!r.driveId);assert(r.validateFrameGeometry());
  assert.deepEqual(r.objects.map(hullType),models);assert(r.objects.every(o=>isDriveCraft(o)&&r.getManualDriveEligibility(o.id).allowed));
  const restored=parseScene(serializeScene(r)).objects;
  assert.deepEqual(restored.map(hullType),models);
  assert.deepEqual(restored.map(obj=>obj.scale),r.objects.map(obj=>obj.scale));
  const bySize=r.objectFrames.slice().sort((a,b)=>b.position[2]-a.position[2]);
  assert.deepEqual(bySize.map(hullType),['janusPod','heritageShuttle','enterprise','shuttle','classicEnterprise']);
  const [janus,shuttle,explorer,meridian,enterprise]=bySize;
  const length=body=>OBJECT_DIMENSIONS[hullType(body)].normalizedExtent*body.radius*RG;
  assert.equal(meridian.radius,objectRadiusMeters('shuttle')/RG,'same unscaled Meridian as the station ferry');
  assert(Math.abs(length(janus)-shuttle.radius*RG*.264)<1e-6,'Janus spans the heritage cockpit');
  assert(Math.abs(enterprise.radius*.045-meridian.radius*.112)<1e-15,'the upper Enterprise bridge matches the Meridian command dome');
  assert(length(shuttle)<length(explorer)&&length(explorer)<length(meridian)&&length(meridian)<length(enterprise));
  const o=createOpticalContext(r),f=r.cameraFrame,project=p=>{const a=directProjection(p,f,width/height,o.fov);return {x:width/2+a.x*height,y:height/2-a.y*height,z:a.z};};
  const overlay=thumbnailLocators(r,width,height);
  for(const ship of r.objects)assert(overlay.includes('data-object-id="'+ship.id+'"'),'all five callable labels fit '+width+'px');
  let previousEnd=-1,previousDepth=0;
  const apparentWidths=[];
  for(const body of bySize){
   const model=hullType(body),q=project(body.position);
   for(const neighbor of bySize.filter(other=>other.id!==body.id)){
    const delta=neighbor.position.map((v,i)=>v-body.position[i]),bow=body.frame[2];
    const along=Math.max(0,delta.reduce((sum,v,i)=>sum+v*bow[i],0));
    const clearance=Math.hypot(...delta.map((v,i)=>v-along*bow[i]))-body.radius-neighbor.radius;
    assert(clearance>0,model+' can depart straight ahead past '+hullType(neighbor));
   }
   assert.equal(body.radius,objectRadiusMeters(model,body.scale)/RG);assert.equal(r.colorData[4*body.index+3],OBJECT_KIND[model]);
   // Project the hull axis into the actual starting camera; bounding spheres
   // alone would also pass for a tiny end-on silhouette. Allow room for controls.
   const ends=[-.85,.85].map(k=>project(body.position.map((v,i)=>v+k*body.radius*body.frame[2][i])));
   const left=Math.min(...ends.map(p=>p.x)),right=Math.max(...ends.map(p=>p.x));
   assert(q.z>previousDepth&&left>6&&right<width-6,model+' ordered in depth and uncropped at '+width+'px');
   assert(left>previousEnd+3,'all five silhouettes separated');
   assert(right-left>(apparentWidths.at(-1)||0),'increasing angular size through the whole fleet');
   previousEnd=right;previousDepth=q.z;apparentWidths.push(right-left);
   assert(ends.every(p=>p.y>height*.34&&p.y<height*.66),'hulls clear upper and lower HUD');
  }
  assert(apparentWidths[0]<apparentWidths.at(-1)*.035,'Janus is a speck next to Enterprise, including in portrait');
  for(const body of r.objects){
   const p=r.getFocusFrame(body.id).position.slice(),t=body.clock.properSeconds;
   assert(r.focusTarget(body.id,'track'));assert.equal(r.getFocusFrame().id,body.id);
   assert(r.setNavigationMode(body.id,'manual'));assert.equal(r.focusMode,'chase');assert.equal(r.focusId,body.id);assert.equal(r.getFlightState().flightMode,body.type==='shuttle'||body.hullModel==='janusPod'?'impulse':'warp');
   assert.equal(r.getFlightState().speed,0);assert(r.setFlightPower(body.type==='shuttle'||body.hullModel==='janusPod'?.1:.01));
   if(body.type==='enterprise')body.flight.escapeBlend=1; // The old helm may be at interstellar separation.
   assert(r.showVehicleLineup());assert(!r.isDriveOpenSpace()&&!r.warpMotionState().active,'The home camera sees the parked fleet, not the distant helm sky');assert.equal(r.getNavigationState(body.id).mode,'auto');assert(!r.focusId&&!r.selectedId);
   assert.deepEqual(r.getFocusFrame(body.id).position,p);assert.equal(body.clock.properSeconds,t,'reframing cannot reset clocks');
  }
 }finally{r.dispose();}
}
console.log('PASS: five hulls parked front to back at the calibrated sizes in desktop, gallery and phone views; saved variants, inspection, independent helms, parking clocks and overview restoration.');
