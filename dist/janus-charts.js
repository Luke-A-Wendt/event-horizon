import {REFERENCE_RG_METERS} from './objects.js';

const LY=9460730472580800, M31_LY=2.5e6;
export const JANUS_SYSTEM_DISTANCE_METERS=M31_LY*LY;
const chartNames=new Set(['sol','m31','deep']);
const podFor=r=>r.objects.find(o=>o.id===r.focusId&&o.hullModel==='janusPod')||r.objects.find(o=>o.id===r.driveId&&o.hullModel==='janusPod')||r.objects.find(o=>o.hullModel==='janusPod');
const cabinChart=(r,pod)=>r.janusRoutes?.[pod?.id]?.lastChart||((r.janusCabinChartPod===pod?.id&&r.janusCabinChart)||'sol');

// Resolve ancestry before adding a coarse galactic baseline. Both charts retain
// accurate star-relative double-precision poses all the way down to cabin scale.
function systemOf(r,id,fallback='sol'){
 if(chartNames.has(id))return id;
 const seen=new Set();
 while(id&&!seen.has(id)){
  seen.add(id);
  const o=(r.geometryObjects===r.objects&&r.objectById?.get(id))||r.objects.find(v=>v.id===id||v.catalogId===id);
  if(!o)break;
  if(o.catalogId==='sun')return 'sol';
  if(o.catalogId==='m31-lyra')return 'm31';
  if(chartNames.has(o.janusChartAnchor))return o.janusChartAnchor;
  if(o.hullModel==='janusPod')fallback=cabinChart(r,o);
  id=o.referenceId||(o.parentId!=='space'&&o.parentId);
 }
 return fallback;
}
export function setJanusChart(r,targetId){
 const pod=podFor(r);if(!pod)return;
 r.janusCabinChart=systemOf(r,targetId);r.janusCabinChartPod=pod.id;r.janusCabinObjects=r.objects;
 r.lastGeometryTime=NaN;
}
export function janusViewChart(r){
 const paired=r.sceneId==='earth-andromeda-bridge';
 if(!paired&&r.janusCabinObjects!==r.objects&&!Object.keys(r.janusRoutes||{}).length)return null;
 const pod=podFor(r);if(!pod)return null;
 const cabin=cabinChart(r,pod);
 if(!paired&&cabin==='sol'&&!r.objects.some(o=>o.janusChartAnchor&&o.janusChartAnchor!=='sol'))return null;
 return r.focusId?systemOf(r,r.focusId):systemOf(r,pod.id,cabin);
}
export function rebaseJanusFrames(r,view){
 // Off-chart objects remain in frameById for map selection, remote optics and
 // exchange guidance. They never consume a local render/clock/projection slot.
 const pod=podFor(r),route=r.janusRoutes?.[pod?.id];
 const origins={sol:[0,0,0],m31:[M31_LY,0,0],deep:route?.addressLy||[0,0,0]};
 const focus=r.objectById.get(r.focusId),eye=view==='deep'?focus?.janusAddressLy||origins.deep:origins[view];
 for(const body of r.objectFrames){
  const root=r.objectById.get(body.id);
  if(root?.type==='waypoint'&&root.parentId==='space'&&!root.janusChartAnchor){root.janusChartAnchor=view;if(view==='deep')root.janusAddressLy=[...eye];}
  body.janusChart=systemOf(r,body.id);
  body.janusLocalPosition=body.position;
  body.janusAddressLy=body.janusChart==='deep'?(root?.janusAddressLy||r.janusRoutes?.[body.id]?.addressLy||origins.deep):null;
  const addr=body.janusAddressLy||origins[body.janusChart];
  body.janusRemote=body.janusChart!==view||addr.some((v,i)=>v!==eye[i]);
  if(body.janusRemote){body.position=body.position.map((v,i)=>v+(addr[i]-eye[i])*(LY/REFERENCE_RG_METERS));body.index=-1;}
 }
 r.objectFrames=r.objectFrames.filter(b=>!b.janusRemote);
}
